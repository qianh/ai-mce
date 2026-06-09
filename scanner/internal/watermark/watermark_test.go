package watermark

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func tempDB(t *testing.T) *DB {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "state.db")
	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestOpenCreatesDB(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "sub", "state.db")

	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer db.Close()

	if _, err := os.Stat(dbPath); err != nil {
		t.Errorf("db file not created: %v", err)
	}
}

func TestIsProcessedNewSession(t *testing.T) {
	db := tempDB(t)

	processed, err := db.IsProcessed("/path/to/session.jsonl", "hash123")
	if err != nil {
		t.Fatalf("IsProcessed: %v", err)
	}
	if processed {
		t.Error("new session should not be processed")
	}
}

func TestMarkUploadedThenIsProcessed(t *testing.T) {
	db := tempDB(t)

	err := db.MarkUploaded("/path/to/session.jsonl", "hash123", "claude", "session-1")
	if err != nil {
		t.Fatalf("MarkUploaded: %v", err)
	}

	processed, err := db.IsProcessed("/path/to/session.jsonl", "hash123")
	if err != nil {
		t.Fatalf("IsProcessed: %v", err)
	}
	if !processed {
		t.Error("uploaded session should be processed")
	}
}

func TestIsProcessedHashChanged(t *testing.T) {
	db := tempDB(t)

	_ = db.MarkUploaded("/path/to/session.jsonl", "hash_old", "claude", "session-1")

	processed, err := db.IsProcessed("/path/to/session.jsonl", "hash_new")
	if err != nil {
		t.Fatalf("IsProcessed: %v", err)
	}
	if processed {
		t.Error("changed hash should not be considered processed")
	}
}

func TestMarkUploadedUpdatesHash(t *testing.T) {
	db := tempDB(t)

	_ = db.MarkUploaded("/path/to/session.jsonl", "hash_v1", "claude", "s1")
	_ = db.MarkUploaded("/path/to/session.jsonl", "hash_v2", "claude", "s1")

	processed, _ := db.IsProcessed("/path/to/session.jsonl", "hash_v2")
	if !processed {
		t.Error("updated hash should be processed")
	}
	processed, _ = db.IsProcessed("/path/to/session.jsonl", "hash_v1")
	if processed {
		t.Error("old hash should no longer match")
	}
}

func TestPendingUploads(t *testing.T) {
	db := tempDB(t)

	err := db.SavePending("/path/session.jsonl", `{"test":"payload"}`, "connection refused")
	if err != nil {
		t.Fatalf("SavePending: %v", err)
	}

	pending, err := db.GetPendingUploads()
	if err != nil {
		t.Fatalf("GetPendingUploads: %v", err)
	}
	if len(pending) != 1 {
		t.Fatalf("pending count: got %d, want 1", len(pending))
	}
	if pending[0].FilePath != "/path/session.jsonl" {
		t.Errorf("file_path: got %s", pending[0].FilePath)
	}
	if pending[0].Payload != `{"test":"payload"}` {
		t.Errorf("payload mismatch")
	}
	if pending[0].LastError != "connection refused" {
		t.Errorf("last_error: got %s", pending[0].LastError)
	}
}

func TestRemovePending(t *testing.T) {
	db := tempDB(t)

	_ = db.SavePending("/path/a.jsonl", `{}`, "err")
	_ = db.SavePending("/path/b.jsonl", `{}`, "err")

	pending, _ := db.GetPendingUploads()
	if len(pending) != 2 {
		t.Fatalf("expected 2 pending, got %d", len(pending))
	}

	err := db.RemovePending(pending[0].ID)
	if err != nil {
		t.Fatalf("RemovePending: %v", err)
	}

	remaining, _ := db.GetPendingUploads()
	if len(remaining) != 1 {
		t.Errorf("expected 1 remaining, got %d", len(remaining))
	}
}

func TestMarkUploadedConcurrent(t *testing.T) {
	db := tempDB(t)

	const n = 50
	errs := make(chan error, n)

	for i := 0; i < n; i++ {
		path := fmt.Sprintf("/path/session-%d.jsonl", i)
		go func(p string) {
			errs <- db.MarkUploaded(p, "hash"+p, "claude", "")
		}(path)
	}

	for i := 0; i < n; i++ {
		if err := <-errs; err != nil {
			t.Errorf("concurrent MarkUploaded: %v", err)
		}
	}

	stats, err := db.Stats()
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}
	if stats.TrackedSessions != n {
		t.Errorf("TrackedSessions: got %d, want %d", stats.TrackedSessions, n)
	}
}

func TestStats(t *testing.T) {
	db := tempDB(t)

	_ = db.MarkUploaded("/a", "h1", "claude", "s1")
	_ = db.MarkUploaded("/b", "h2", "codex", "s2")
	_ = db.SavePending("/c", `{}`, "err")

	stats, err := db.Stats()
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}
	if stats.TrackedSessions != 2 {
		t.Errorf("TrackedSessions: got %d, want 2", stats.TrackedSessions)
	}
	if stats.PendingRetries != 1 {
		t.Errorf("PendingRetries: got %d, want 1", stats.PendingRetries)
	}
}
