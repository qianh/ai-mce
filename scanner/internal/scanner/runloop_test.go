package scanner

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/mce/scanner/internal/config"
)

// newTestScanner builds a scanner over a temp dir with one completed claude
// session file, pointed at the given API server. mutate adjusts the config
// before the scanner is created.
func newTestScanner(t *testing.T, serverURL string, mutate func(*config.Config)) (*Scanner, string) {
	t.Helper()

	tmpDir := t.TempDir()
	claudeDir := filepath.Join(tmpDir, "claude-projects")
	projDir := filepath.Join(claudeDir, "test-proj")
	os.MkdirAll(projDir, 0o755)

	sessionContent := `{"type":"user","message":{"role":"user","content":"test question"},"timestamp":"2026-06-01T10:00:00Z"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"test answer"}]},"timestamp":"2026-06-01T10:00:05Z"}
`
	sessionFile := filepath.Join(projDir, "session-001.jsonl")
	os.WriteFile(sessionFile, []byte(sessionContent), 0o644)
	old := time.Now().Add(-20 * time.Minute)
	os.Chtimes(sessionFile, old, old)

	cfg := config.Default()
	cfg.APIBaseURL = serverURL
	cfg.DBPath = filepath.Join(tmpDir, "state.db")
	cfg.MinMessages = 0
	if mutate != nil {
		mutate(&cfg)
	}

	s, err := NewScanner(cfg, "test-token", "", nil)
	if err != nil {
		t.Fatalf("NewScanner: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	s.apiClient.RetryDelay = func(_ int) time.Duration { return 0 }
	s.toolPaths = []config.ToolPath{{Platform: "claude", BasePath: claudeDir, Format: "jsonl"}}

	return s, sessionFile
}

// runLoopTestEnv sets up a fake API server and one claude session file,
// returning the scanner, the session file path, and an upload counter.
func runLoopTestEnv(t *testing.T) (*Scanner, string, func() int) {
	t.Helper()

	var mu sync.Mutex
	uploads := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/captures" {
			mu.Lock()
			uploads++
			mu.Unlock()
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"id": "cap_001", "status": "created"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(server.Close)

	s, sessionFile := newTestScanner(t, server.URL, func(cfg *config.Config) {
		cfg.ScanInterval = 50 * time.Millisecond
	})

	return s, sessionFile, func() int {
		mu.Lock()
		defer mu.Unlock()
		return uploads
	}
}

func waitFor(t *testing.T, timeout time.Duration, cond func() bool) bool {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return cond()
}

func TestRunLoopScansImmediately(t *testing.T) {
	s, _, uploads := runLoopTestEnv(t)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() { done <- s.RunLoop(ctx) }()

	// First scan fires immediately, not after the first interval.
	if !waitFor(t, 2*time.Second, func() bool { return uploads() == 1 }) {
		t.Fatalf("first scan upload: got %d, want 1", uploads())
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("RunLoop returned error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("RunLoop did not exit after context cancel")
	}
}

func TestUploadSuccessClearsPending(t *testing.T) {
	var mu sync.Mutex
	failing := true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		shouldFail := failing
		mu.Unlock()
		if shouldFail {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": "cap_001", "status": "created"})
	}))
	t.Cleanup(server.Close)

	s, _ := newTestScanner(t, server.URL, func(cfg *config.Config) {
		cfg.MaxRetries = 0
	})

	// First scan fails → pending row saved.
	if err := s.RunOnce(); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	pending, _ := s.db.GetPendingUploads()
	if len(pending) != 1 {
		t.Fatalf("after failed upload: pending = %d, want 1", len(pending))
	}

	// Second scan succeeds → pending row cleared.
	mu.Lock()
	failing = false
	mu.Unlock()
	if err := s.RunOnce(); err != nil {
		t.Fatalf("RunOnce second: %v", err)
	}
	pending, _ = s.db.GetPendingUploads()
	if len(pending) != 0 {
		t.Errorf("after successful upload: pending = %d, want 0", len(pending))
	}
}

func TestRunLoopReuploadsChangedSession(t *testing.T) {
	s, sessionFile, uploads := runLoopTestEnv(t)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() { done <- s.RunLoop(ctx) }()

	if !waitFor(t, 2*time.Second, func() bool { return uploads() == 1 }) {
		t.Fatalf("first scan upload: got %d, want 1", uploads())
	}

	// Append a new message (keep mtime old so it still counts as completed).
	f, err := os.OpenFile(sessionFile, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatalf("open session file: %v", err)
	}
	f.WriteString(`{"type":"user","message":{"role":"user","content":"follow-up"},"timestamp":"2026-06-01T10:01:00Z"}` + "\n")
	f.Close()
	old := time.Now().Add(-20 * time.Minute)
	os.Chtimes(sessionFile, old, old)

	// Next tick re-discovers the session: hash changed → re-upload.
	if !waitFor(t, 3*time.Second, func() bool { return uploads() == 2 }) {
		t.Fatalf("changed session re-upload: got %d uploads, want 2", uploads())
	}

	// Unchanged content must not upload again on subsequent ticks.
	time.Sleep(200 * time.Millisecond)
	if got := uploads(); got != 2 {
		t.Errorf("unchanged session re-uploaded: got %d uploads, want 2", got)
	}

	cancel()
	<-done
}
