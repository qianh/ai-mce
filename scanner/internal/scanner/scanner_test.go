package scanner

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/mce/scanner/internal/config"
	_ "modernc.org/sqlite"
)

func TestDiscoverClaudeCodeSessions(t *testing.T) {
	dir := t.TempDir()

	// Create fake Claude Code project structure
	projDir := filepath.Join(dir, "my-project")
	os.MkdirAll(projDir, 0o755)

	// Create a JSONL session file (old enough to be "completed")
	sessionFile := filepath.Join(projDir, "abc-123.jsonl")
	content := `{"type":"user","message":{"role":"user","content":"hello"},"timestamp":"2026-06-01T10:00:00Z"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]},"timestamp":"2026-06-01T10:00:01Z"}
`
	os.WriteFile(sessionFile, []byte(content), 0o644)
	// Set mtime to 20 minutes ago (completed)
	old := time.Now().Add(-20 * time.Minute)
	os.Chtimes(sessionFile, old, old)

	sessions := discoverClaudeCodeSessions(dir, 10)

	if len(sessions) != 1 {
		t.Fatalf("session count: got %d, want 1", len(sessions))
	}
	if sessions[0].Platform != "claude" {
		t.Errorf("platform: got %q", sessions[0].Platform)
	}
	if sessions[0].FilePath != sessionFile {
		t.Errorf("file_path: got %q", sessions[0].FilePath)
	}
}

func TestDiscoverClaudeCodeSessionsSkipsActive(t *testing.T) {
	dir := t.TempDir()

	projDir := filepath.Join(dir, "my-project")
	os.MkdirAll(projDir, 0o755)

	sessionFile := filepath.Join(projDir, "active-session.jsonl")
	os.WriteFile(sessionFile, []byte(`{"type":"user"}`), 0o644)
	// mtime is now — still active

	sessions := discoverClaudeCodeSessions(dir, 10)

	if len(sessions) != 0 {
		t.Errorf("should skip active session, got %d", len(sessions))
	}
}

func TestDiscoverClaudeCodeSessionsSkipsNonResumableEntrypoints(t *testing.T) {
	dir := t.TempDir()
	projDir := filepath.Join(dir, "my-project")
	os.MkdirAll(projDir, 0o755)

	old := time.Now().Add(-20 * time.Minute)

	cliSession := filepath.Join(projDir, "cli-session.jsonl")
	os.WriteFile(cliSession, []byte(`{"type":"user","message":{"role":"user","content":"hello"},"entrypoint":"cli","timestamp":"2026-06-01T10:00:00Z"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]},"entrypoint":"cli","timestamp":"2026-06-01T10:00:01Z"}
`), 0o644)
	os.Chtimes(cliSession, old, old)

	sdkSession := filepath.Join(projDir, "sdk-session.jsonl")
	os.WriteFile(sdkSession, []byte(`{"type":"user","message":{"role":"user","content":"hello"},"entrypoint":"sdk-cli","timestamp":"2026-06-01T10:00:00Z"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]},"entrypoint":"sdk-cli","timestamp":"2026-06-01T10:00:01Z"}
`), 0o644)
	os.Chtimes(sdkSession, old, old)

	sessions := discoverClaudeCodeSessions(dir, 10)

	if len(sessions) != 1 {
		t.Fatalf("session count: got %d, want 1", len(sessions))
	}
	if sessions[0].FilePath != cliSession {
		t.Errorf("file_path: got %q, want %q", sessions[0].FilePath, cliSession)
	}
}

func TestIsSessionCompleted(t *testing.T) {
	dir := t.TempDir()

	// Old file — completed
	oldFile := filepath.Join(dir, "old.jsonl")
	os.WriteFile(oldFile, []byte("data"), 0o644)
	old := time.Now().Add(-15 * time.Minute)
	os.Chtimes(oldFile, old, old)

	if !isSessionCompleted(oldFile, 10) {
		t.Error("15 min old file should be completed with 10 min threshold")
	}

	// Recent file — still active
	newFile := filepath.Join(dir, "new.jsonl")
	os.WriteFile(newFile, []byte("data"), 0o644)

	if isSessionCompleted(newFile, 10) {
		t.Error("just-created file should not be completed")
	}
}

func TestScannerRunOnce(t *testing.T) {
	// Set up fake API server
	var uploaded []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/captures" {
			uploaded = append(uploaded, "capture")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"id": "cap_001", "status": "created"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	// Set up temp directories
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "state.db")
	claudeDir := filepath.Join(tmpDir, "claude-projects")
	projDir := filepath.Join(claudeDir, "test-proj")
	os.MkdirAll(projDir, 0o755)

	// Create a completed session
	sessionContent := `{"type":"user","message":{"role":"user","content":"test question"},"timestamp":"2026-06-01T10:00:00Z"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"test answer"}]},"timestamp":"2026-06-01T10:00:05Z"}
{"type":"ai-title","aiTitle":"Test Session","timestamp":"2026-06-01T10:00:06Z"}
`
	sessionFile := filepath.Join(projDir, "session-001.jsonl")
	os.WriteFile(sessionFile, []byte(sessionContent), 0o644)
	old := time.Now().Add(-20 * time.Minute)
	os.Chtimes(sessionFile, old, old)

	cfg := config.Default()
	cfg.APIBaseURL = server.URL
	cfg.DBPath = dbPath
	cfg.MinMessages = 0

	s, err := NewScanner(cfg, "test-token", "", nil)
	if err != nil {
		t.Fatalf("NewScanner: %v", err)
	}
	defer s.Close()
	s.apiClient.RetryDelay = func(_ int) time.Duration { return 0 }

	// Override tool paths to use our temp directory
	s.toolPaths = []config.ToolPath{
		{Platform: "claude", BasePath: claudeDir, Format: "jsonl"},
	}

	err = s.RunOnce()
	if err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	if len(uploaded) != 1 {
		t.Errorf("uploaded count: got %d, want 1", len(uploaded))
	}

	// Run again — should not re-upload (watermark)
	uploaded = nil
	err = s.RunOnce()
	if err != nil {
		t.Fatalf("RunOnce second: %v", err)
	}
	if len(uploaded) != 0 {
		t.Errorf("should not re-upload, got %d", len(uploaded))
	}
}

func TestRunOnceConcurrent(t *testing.T) {
	var mu sync.Mutex
	var uploaded []string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/captures" {
			mu.Lock()
			uploaded = append(uploaded, "capture")
			mu.Unlock()
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"id": "cap_ok", "status": "created"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "state.db")
	claudeDir := filepath.Join(tmpDir, "claude-projects")

	for i := 0; i < 20; i++ {
		projDir := filepath.Join(claudeDir, fmt.Sprintf("proj-%d", i/5))
		os.MkdirAll(projDir, 0o755)
		content := fmt.Sprintf(
			"{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"q%d\"},\"timestamp\":\"2026-01-01T10:00:00Z\"}\n"+
				"{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"a%d\"}]},\"timestamp\":\"2026-01-01T10:00:01Z\"}\n",
			i, i,
		)
		sessionFile := filepath.Join(projDir, fmt.Sprintf("session-%03d.jsonl", i))
		os.WriteFile(sessionFile, []byte(content), 0o644)
		old := time.Now().Add(-20 * time.Minute)
		os.Chtimes(sessionFile, old, old)
	}

	cfg := config.Default()
	cfg.APIBaseURL = server.URL
	cfg.DBPath = dbPath
	cfg.Concurrency = 4
	cfg.MinMessages = 0

	s, err := NewScanner(cfg, "test-token", "", nil)
	if err != nil {
		t.Fatalf("NewScanner: %v", err)
	}
	defer s.Close()
	s.apiClient.RetryDelay = func(_ int) time.Duration { return 0 }
	s.toolPaths = []config.ToolPath{
		{Platform: "claude", BasePath: claudeDir, Format: "jsonl"},
	}

	if err := s.RunOnce(); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if len(uploaded) != 20 {
		t.Errorf("uploaded: got %d, want 20", len(uploaded))
	}
}

func TestDiscoverCodexSessionsFromIndex(t *testing.T) {
	dir := t.TempDir()
	sessionsDir := filepath.Join(dir, "sessions")
	os.MkdirAll(filepath.Join(sessionsDir, "2026", "06", "01"), 0o755)

	// Create session_index.jsonl with 2 entries
	indexContent := `{"id":"aaa-111","thread_name":"Session One","updated_at":"2026-06-01T10:00:00Z"}
{"id":"bbb-222","thread_name":"Session Two","updated_at":"2026-06-01T11:00:00Z"}
`
	os.WriteFile(filepath.Join(dir, "session_index.jsonl"), []byte(indexContent), 0o644)

	// Create 3 JSONL files: 2 matching index, 1 extra that should still be discovered
	// when the index is stale or incomplete.
	old := time.Now().Add(-20 * time.Minute)
	for _, name := range []string{
		"rollout-2026-06-01T10-00-00-aaa-111.jsonl",
		"rollout-2026-06-01T11-00-00-bbb-222.jsonl",
		"rollout-2026-06-01T12-00-00-ccc-333.jsonl",
	} {
		path := filepath.Join(sessionsDir, "2026", "06", "01", name)
		os.WriteFile(path, []byte(`{"type":"session_meta"}`), 0o644)
		os.Chtimes(path, old, old)
	}

	sessions := discoverCodexSessions(sessionsDir, 10)

	if len(sessions) != 3 {
		t.Fatalf("session count: got %d, want 3", len(sessions))
	}

	foundIDs := map[string]bool{}
	for _, s := range sessions {
		if s.Platform != "codex" {
			t.Errorf("platform: got %q", s.Platform)
		}
		name := filepath.Base(s.FilePath)
		foundIDs[name] = true
	}
	if !foundIDs["rollout-2026-06-01T10-00-00-aaa-111.jsonl"] {
		t.Error("missing session aaa-111")
	}
	if !foundIDs["rollout-2026-06-01T11-00-00-bbb-222.jsonl"] {
		t.Error("missing session bbb-222")
	}
	if !foundIDs["rollout-2026-06-01T12-00-00-ccc-333.jsonl"] {
		t.Error("missing session ccc-333 outside stale index")
	}
}

func TestDiscoverCodexSessionsIncludesSessionsMissingFromStaleIndex(t *testing.T) {
	dir := t.TempDir()
	sessionsDir := filepath.Join(dir, "sessions")
	sessionDay := filepath.Join(sessionsDir, "2026", "06", "01")
	os.MkdirAll(sessionDay, 0o755)

	indexContent := `{"id":"aaa-111","thread_name":"Indexed","updated_at":"2026-06-01T10:00:00Z"}
`
	os.WriteFile(filepath.Join(dir, "session_index.jsonl"), []byte(indexContent), 0o644)

	old := time.Now().Add(-20 * time.Minute)
	cases := map[string]string{
		"rollout-2026-06-01T10-00-00-aaa-111.jsonl": `{"type":"session_meta","payload":{"id":"aaa-111","source":"cli","thread_source":"user"}}` + "\n",
		"rollout-2026-06-01T11-00-00-bbb-222.jsonl": `{"type":"session_meta","payload":{"id":"bbb-222","source":"cli","thread_source":"user"}}` + "\n",
	}
	for name, content := range cases {
		path := filepath.Join(sessionDay, name)
		os.WriteFile(path, []byte(content), 0o644)
		os.Chtimes(path, old, old)
	}

	sessions := discoverCodexSessions(sessionsDir, 10)

	if len(sessions) != 2 {
		t.Fatalf("session count: got %d, want 2", len(sessions))
	}
	foundIDs := map[string]bool{}
	for _, s := range sessions {
		foundIDs[filepath.Base(s.FilePath)] = true
	}
	if !foundIDs["rollout-2026-06-01T10-00-00-aaa-111.jsonl"] {
		t.Error("missing indexed session aaa-111")
	}
	if !foundIDs["rollout-2026-06-01T11-00-00-bbb-222.jsonl"] {
		t.Error("missing unindexed session bbb-222")
	}
}

func TestDiscoverCodexSessionsSkipsNonInteractiveSessions(t *testing.T) {
	dir := t.TempDir()
	sessionsDir := filepath.Join(dir, "sessions")
	os.MkdirAll(filepath.Join(sessionsDir, "2026", "06", "01"), 0o755)

	indexContent := `{"id":"aaa-111","thread_name":"Interactive","updated_at":"2026-06-01T10:00:00Z"}
{"id":"bbb-222","thread_name":"Exec","updated_at":"2026-06-01T11:00:00Z"}
{"id":"ccc-333","thread_name":"Subagent","updated_at":"2026-06-01T12:00:00Z"}
`
	os.WriteFile(filepath.Join(dir, "session_index.jsonl"), []byte(indexContent), 0o644)

	old := time.Now().Add(-20 * time.Minute)
	cases := map[string]string{
		"rollout-2026-06-01T10-00-00-aaa-111.jsonl": `{"type":"session_meta","payload":{"id":"aaa-111","source":"cli","thread_source":"user"}}` + "\n",
		"rollout-2026-06-01T11-00-00-bbb-222.jsonl": `{"type":"session_meta","payload":{"id":"bbb-222","source":"exec","thread_source":"user"}}` + "\n",
		"rollout-2026-06-01T12-00-00-ccc-333.jsonl": `{"type":"session_meta","payload":{"id":"ccc-333","source":"cli","thread_source":"subagent"}}` + "\n",
	}
	for name, content := range cases {
		path := filepath.Join(sessionsDir, "2026", "06", "01", name)
		os.WriteFile(path, []byte(content), 0o644)
		os.Chtimes(path, old, old)
	}

	sessions := discoverCodexSessions(sessionsDir, 10)

	if len(sessions) != 1 {
		t.Fatalf("session count: got %d, want 1", len(sessions))
	}
	if filepath.Base(sessions[0].FilePath) != "rollout-2026-06-01T10-00-00-aaa-111.jsonl" {
		t.Errorf("file_path: got %q", sessions[0].FilePath)
	}
}

func TestDiscoverCodexSessionsFallback(t *testing.T) {
	dir := t.TempDir()
	sessionsDir := filepath.Join(dir, "sessions")
	os.MkdirAll(filepath.Join(sessionsDir, "2026", "06", "01"), 0o755)

	// No session_index.jsonl — should fall back to directory walk
	old := time.Now().Add(-20 * time.Minute)
	path := filepath.Join(sessionsDir, "2026", "06", "01", "rollout-xxx.jsonl")
	os.WriteFile(path, []byte(`{"type":"session_meta"}`), 0o644)
	os.Chtimes(path, old, old)

	sessions := discoverCodexSessions(sessionsDir, 10)

	if len(sessions) != 1 {
		t.Fatalf("fallback session count: got %d, want 1", len(sessions))
	}
}

func TestDiscoverGrokSessionsFromSQLite(t *testing.T) {
	dir := t.TempDir()

	// Create session_search.sqlite
	dbPath := filepath.Join(dir, "session_search.sqlite")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	db.Exec(`CREATE TABLE session_docs (
		session_id TEXT PRIMARY KEY,
		cwd TEXT NOT NULL,
		updated_at INTEGER NOT NULL,
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		content_hash TEXT NOT NULL,
		last_indexed_offset INTEGER NOT NULL DEFAULT 0
	)`)

	cwd1 := "/Users/test/project-a"
	cwd2 := "/Users/test/project-b"
	db.Exec(`INSERT INTO session_docs (session_id, cwd, updated_at, title, content, content_hash) VALUES
		(?, ?, 1000, 'Session 1', 'content1', 'hash1'),
		(?, ?, 2000, 'Session 2', 'content2', 'hash2')`,
		"ses-aaa", cwd1, "ses-bbb", cwd2)
	db.Close()

	// Create matching session directories with chat_history.jsonl
	old := time.Now().Add(-20 * time.Minute)
	for _, tc := range []struct {
		sid, cwd string
	}{
		{"ses-aaa", cwd1},
		{"ses-bbb", cwd2},
	} {
		encoded := url.PathEscape(tc.cwd)
		sessDir := filepath.Join(dir, encoded, tc.sid)
		os.MkdirAll(sessDir, 0o755)
		chatPath := filepath.Join(sessDir, "chat_history.jsonl")
		os.WriteFile(chatPath, []byte(`{"type":"user","content":"hello"}`), 0o644)
		os.Chtimes(chatPath, old, old)
	}

	sessions := discoverGrokSessions(dir, 10)

	if len(sessions) != 2 {
		t.Fatalf("session count: got %d, want 2", len(sessions))
	}
	for _, s := range sessions {
		if s.Platform != "grok" {
			t.Errorf("platform: got %q", s.Platform)
		}
	}
}

func TestDiscoverGrokSessionsFallback(t *testing.T) {
	dir := t.TempDir()

	// No session_search.sqlite — should fall back to directory walk
	encoded := url.PathEscape("/Users/test/proj")
	sessDir := filepath.Join(dir, encoded, "ses-xxx")
	os.MkdirAll(sessDir, 0o755)
	chatPath := filepath.Join(sessDir, "chat_history.jsonl")
	os.WriteFile(chatPath, []byte(`{"type":"user","content":"hello"}`), 0o644)
	old := time.Now().Add(-20 * time.Minute)
	os.Chtimes(chatPath, old, old)

	sessions := discoverGrokSessions(dir, 10)

	if len(sessions) != 1 {
		t.Fatalf("fallback session count: got %d, want 1", len(sessions))
	}
}

func TestRunOnceErrorIsolation(t *testing.T) {
	var mu sync.Mutex
	var uploaded []string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/captures" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)
		if content, ok := body["content"].(map[string]interface{}); ok {
			if title, _ := content["title"].(string); title == "fail" {
				w.WriteHeader(http.StatusBadRequest)
				w.Write([]byte(`{"detail":"rejected"}`))
				return
			}
		}
		mu.Lock()
		uploaded = append(uploaded, "ok")
		mu.Unlock()
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": "cap_ok", "status": "created"})
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "state.db")
	claudeDir := filepath.Join(tmpDir, "claude-projects")
	projDir := filepath.Join(claudeDir, "proj")
	os.MkdirAll(projDir, 0o755)

	for i := 0; i < 3; i++ {
		content := fmt.Sprintf(
			"{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"q%d\"},\"timestamp\":\"2026-01-01T10:00:00Z\"}\n"+
				"{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"a%d\"}]},\"timestamp\":\"2026-01-01T10:00:01Z\"}\n"+
				"{\"type\":\"ai-title\",\"aiTitle\":\"good\",\"timestamp\":\"2026-01-01T10:00:02Z\"}\n",
			i, i,
		)
		sf := filepath.Join(projDir, fmt.Sprintf("good-%03d.jsonl", i))
		os.WriteFile(sf, []byte(content), 0o644)
		old := time.Now().Add(-20 * time.Minute)
		os.Chtimes(sf, old, old)
	}

	badContent := "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"bad\"},\"timestamp\":\"2026-01-01T10:00:00Z\"}\n" +
		"{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"bad\"}]},\"timestamp\":\"2026-01-01T10:00:01Z\"}\n" +
		"{\"type\":\"ai-title\",\"aiTitle\":\"fail\",\"timestamp\":\"2026-01-01T10:00:02Z\"}\n"
	badFile := filepath.Join(projDir, "bad-000.jsonl")
	os.WriteFile(badFile, []byte(badContent), 0o644)
	old := time.Now().Add(-20 * time.Minute)
	os.Chtimes(badFile, old, old)

	cfg := config.Default()
	cfg.APIBaseURL = server.URL
	cfg.DBPath = dbPath
	cfg.Concurrency = 2
	cfg.MinMessages = 0

	s, err := NewScanner(cfg, "test-token", "", nil)
	if err != nil {
		t.Fatalf("NewScanner: %v", err)
	}
	defer s.Close()
	s.apiClient.RetryDelay = func(_ int) time.Duration { return 0 }
	s.apiClient.MaxRetries = 0
	s.toolPaths = []config.ToolPath{
		{Platform: "claude", BasePath: claudeDir, Format: "jsonl"},
	}

	if err := s.RunOnce(); err != nil {
		t.Fatalf("RunOnce should not return error even when sessions fail: %v", err)
	}
	if len(uploaded) != 3 {
		t.Errorf("successful uploads: got %d, want 3", len(uploaded))
	}
}

func TestRunOnceSkipsEmptyClaudeSession(t *testing.T) {
	var uploaded []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/captures" {
			uploaded = append(uploaded, "capture")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"id": "cap_empty", "status": "created"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "state.db")
	claudeDir := filepath.Join(tmpDir, "claude-projects")
	projDir := filepath.Join(claudeDir, "proj")
	os.MkdirAll(projDir, 0o755)

	emptyContent := `{"type":"ai-title","aiTitle":"Title only","sessionId":"empty-sess"}`
	emptyFile := filepath.Join(projDir, "empty-session.jsonl")
	os.WriteFile(emptyFile, []byte(emptyContent), 0o644)
	old := time.Now().Add(-20 * time.Minute)
	os.Chtimes(emptyFile, old, old)

	cfg := config.Default()
	cfg.APIBaseURL = server.URL
	cfg.DBPath = dbPath

	s, err := NewScanner(cfg, "test-token", "", nil)
	if err != nil {
		t.Fatalf("NewScanner: %v", err)
	}
	defer s.Close()

	s.toolPaths = []config.ToolPath{
		{Platform: "claude", BasePath: claudeDir, Format: "jsonl"},
	}

	if err := s.RunOnce(); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if len(uploaded) != 0 {
		t.Errorf("empty session should not upload, got %d uploads", len(uploaded))
	}

	processed, err := s.db.IsProcessed(emptyFile, "empty:v1")
	if err != nil {
		t.Fatalf("IsProcessed: %v", err)
	}
	if !processed {
		t.Error("empty session should be marked processed")
	}

	uploaded = nil
	if err := s.RunOnce(); err != nil {
		t.Fatalf("RunOnce second: %v", err)
	}
	if len(uploaded) != 0 {
		t.Errorf("empty session should not be retried, got %d uploads", len(uploaded))
	}
}

func TestRunOnceSkipsLowMessageCount(t *testing.T) {
	var uploaded []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/captures" {
			uploaded = append(uploaded, "capture")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"id": "cap_ok", "status": "created"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "state.db")
	claudeDir := filepath.Join(tmpDir, "claude-projects")
	projDir := filepath.Join(claudeDir, "proj")
	os.MkdirAll(projDir, 0o755)

	old := time.Now().Add(-20 * time.Minute)

	// Session with only 1 message (user only, assistant is tool-call)
	oneMsg := `{"type":"user","message":{"role":"user","content":"hello"},"timestamp":"2026-01-01T10:00:00Z"}
`
	oneMsgFile := filepath.Join(projDir, "one-msg.jsonl")
	os.WriteFile(oneMsgFile, []byte(oneMsg), 0o644)
	os.Chtimes(oneMsgFile, old, old)

	// Session with 2 messages (meets default min=2)
	twoMsg := `{"type":"user","message":{"role":"user","content":"hello"},"timestamp":"2026-01-01T10:00:00Z"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]},"timestamp":"2026-01-01T10:00:01Z"}
`
	twoMsgFile := filepath.Join(projDir, "two-msg.jsonl")
	os.WriteFile(twoMsgFile, []byte(twoMsg), 0o644)
	os.Chtimes(twoMsgFile, old, old)

	// Session with 4 messages (comfortably above threshold)
	fourMsg := `{"type":"user","message":{"role":"user","content":"q1"},"timestamp":"2026-01-01T10:00:00Z"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"a1"}]},"timestamp":"2026-01-01T10:00:01Z"}
{"type":"user","message":{"role":"user","content":"q2"},"timestamp":"2026-01-01T10:00:02Z"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"a2"}]},"timestamp":"2026-01-01T10:00:03Z"}
`
	fourMsgFile := filepath.Join(projDir, "four-msg.jsonl")
	os.WriteFile(fourMsgFile, []byte(fourMsg), 0o644)
	os.Chtimes(fourMsgFile, old, old)

	cfg := config.Default()
	cfg.APIBaseURL = server.URL
	cfg.DBPath = dbPath
	cfg.MinMessages = 2

	s, err := NewScanner(cfg, "test-token", "", nil)
	if err != nil {
		t.Fatalf("NewScanner: %v", err)
	}
	defer s.Close()
	s.apiClient.RetryDelay = func(_ int) time.Duration { return 0 }
	s.toolPaths = []config.ToolPath{
		{Platform: "claude", BasePath: claudeDir, Format: "jsonl"},
	}

	if err := s.RunOnce(); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	// Only two-msg and four-msg should upload (one-msg skipped)
	if len(uploaded) != 2 {
		t.Errorf("uploaded: got %d, want 2 (one-msg should be skipped)", len(uploaded))
	}

	// one-msg should be marked in watermark so it's not retried
	processed, err := s.db.IsProcessed(oneMsgFile, "skipped:min2:v1")
	if err != nil {
		t.Fatalf("IsProcessed: %v", err)
	}
	if !processed {
		t.Error("one-msg session should be marked as skipped in watermark")
	}

	// Second run: nothing new to upload
	uploaded = nil
	if err := s.RunOnce(); err != nil {
		t.Fatalf("RunOnce second: %v", err)
	}
	if len(uploaded) != 0 {
		t.Errorf("second run should upload nothing, got %d", len(uploaded))
	}
}

func TestMinMessagesZeroDisablesFilter(t *testing.T) {
	var uploaded []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/captures" {
			uploaded = append(uploaded, "capture")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"id": "cap_ok", "status": "created"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "state.db")
	claudeDir := filepath.Join(tmpDir, "claude-projects")
	projDir := filepath.Join(claudeDir, "proj")
	os.MkdirAll(projDir, 0o755)

	old := time.Now().Add(-20 * time.Minute)

	oneMsg := `{"type":"user","message":{"role":"user","content":"hello"},"timestamp":"2026-01-01T10:00:00Z"}
`
	oneMsgFile := filepath.Join(projDir, "one-msg.jsonl")
	os.WriteFile(oneMsgFile, []byte(oneMsg), 0o644)
	os.Chtimes(oneMsgFile, old, old)

	cfg := config.Default()
	cfg.APIBaseURL = server.URL
	cfg.DBPath = dbPath
	cfg.MinMessages = 0

	s, err := NewScanner(cfg, "test-token", "", nil)
	if err != nil {
		t.Fatalf("NewScanner: %v", err)
	}
	defer s.Close()
	s.apiClient.RetryDelay = func(_ int) time.Duration { return 0 }
	s.toolPaths = []config.ToolPath{
		{Platform: "claude", BasePath: claudeDir, Format: "jsonl"},
	}

	if err := s.RunOnce(); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	if len(uploaded) != 1 {
		t.Errorf("MinMessages=0 should disable filter, uploaded: got %d, want 1", len(uploaded))
	}
}

func TestAcquireScanLockExclusive(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "state.db")

	first, err := acquireScanLock(dbPath)
	if err != nil {
		t.Fatalf("first acquire: %v", err)
	}
	defer first.release()

	_, err = acquireScanLock(dbPath)
	if !errors.Is(err, errScanInProgress) {
		t.Fatalf("expected errScanInProgress, got %v", err)
	}
}
