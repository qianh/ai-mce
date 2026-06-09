package scanner

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/mce/scanner/internal/config"
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
