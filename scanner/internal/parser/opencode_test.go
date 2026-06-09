package parser

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func setupOpenCodeDB(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "opencode.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE session (
			id TEXT PRIMARY KEY,
			title TEXT,
			time_created INTEGER,
			time_updated INTEGER
		);
		CREATE TABLE message (
			id TEXT PRIMARY KEY,
			session_id TEXT,
			time_created INTEGER,
			time_updated INTEGER,
			data TEXT
		);
		CREATE TABLE part (
			id TEXT PRIMARY KEY,
			message_id TEXT,
			session_id TEXT,
			time_created INTEGER,
			time_updated INTEGER,
			data TEXT
		);
	`)
	if err != nil {
		t.Fatalf("create tables: %v", err)
	}

	_, err = db.Exec(`
		INSERT INTO session (id, title, time_created, time_updated) VALUES
			('ses_001', 'Test Session', 1000, 2000);

		INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES
			('msg_001', 'ses_001', 1001, 1001, '{"role":"user"}'),
			('msg_002', 'ses_001', 1002, 1002, '{"role":"assistant"}'),
			('msg_003', 'ses_001', 1003, 1003, '{"role":"user"}'),
			('msg_004', 'ses_001', 1004, 1004, '{"role":"assistant"}');

		INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES
			('prt_001', 'msg_001', 'ses_001', 1001, 1001, '{"type":"text","text":"How do I read a file in Go?"}'),
			('prt_002', 'msg_002', 'ses_001', 1002, 1002, '{"type":"reasoning","text":"Let me think about file reading in Go."}'),
			('prt_003', 'msg_002', 'ses_001', 1003, 1003, '{"type":"text","text":"Use os.ReadFile() for small files or bufio.Scanner for large ones."}'),
			('prt_004', 'msg_003', 'ses_001', 1004, 1004, '{"type":"text","text":"What about writing files?"}'),
			('prt_005', 'msg_004', 'ses_001', 1005, 1005, '{"type":"step-start"}'),
			('prt_006', 'msg_004', 'ses_001', 1006, 1006, '{"type":"text","text":"Use os.WriteFile() or bufio.Writer for writing."}');
	`)
	if err != nil {
		t.Fatalf("insert data: %v", err)
	}

	return dbPath
}

func TestOpenCodeParserBasic(t *testing.T) {
	dbPath := setupOpenCodeDB(t)
	p := NewOpenCodeParser()

	conv, err := p.Parse(dbPath + "::ses_001")
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if conv.Source.Platform != "opencode" {
		t.Errorf("platform: got %q, want %q", conv.Source.Platform, "opencode")
	}
	if conv.Source.URL != "desktop" {
		t.Errorf("url: got %q, want %q", conv.Source.URL, "desktop")
	}
	if conv.Content.Title != "Test Session" {
		t.Errorf("title: got %q, want %q", conv.Content.Title, "Test Session")
	}

	// 4 messages: 2 user + 2 assistant (reasoning and step-start parts filtered)
	if len(conv.Content.Messages) != 4 {
		t.Fatalf("message count: got %d, want 4", len(conv.Content.Messages))
	}

	if conv.Content.Messages[0].Role != "user" {
		t.Errorf("msg[0] role: got %q", conv.Content.Messages[0].Role)
	}
	if conv.Content.Messages[0].Content != "How do I read a file in Go?" {
		t.Errorf("msg[0] content: got %q", conv.Content.Messages[0].Content)
	}

	// assistant: only text parts, reasoning excluded
	if conv.Content.Messages[1].Content != "Use os.ReadFile() for small files or bufio.Scanner for large ones." {
		t.Errorf("msg[1] content: got %q", conv.Content.Messages[1].Content)
	}

	// assistant msg_004: step-start filtered, only text kept
	if conv.Content.Messages[3].Content != "Use os.WriteFile() or bufio.Writer for writing." {
		t.Errorf("msg[3] content: got %q", conv.Content.Messages[3].Content)
	}
}

func TestOpenCodeParserPlatform(t *testing.T) {
	p := NewOpenCodeParser()
	if p.Platform() != "opencode" {
		t.Errorf("Platform: got %q, want %q", p.Platform(), "opencode")
	}
}

func TestOpenCodeParserHashes(t *testing.T) {
	dbPath := setupOpenCodeDB(t)
	p := NewOpenCodeParser()

	conv, err := p.Parse(dbPath + "::ses_001")
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if len(conv.Hashes.ContentHash) != 64 {
		t.Errorf("content_hash length: got %d, want 64", len(conv.Hashes.ContentHash))
	}
	if conv.Hashes.SourceFingerprint != "opencode:desktop" {
		t.Errorf("source_fingerprint: got %q", conv.Hashes.SourceFingerprint)
	}
	if len(conv.Hashes.MessageHashes) != 4 {
		t.Errorf("message_hashes count: got %d, want 4", len(conv.Hashes.MessageHashes))
	}
}

func TestOpenCodeParserInvalidPath(t *testing.T) {
	p := NewOpenCodeParser()

	// Missing :: separator
	_, err := p.Parse("/some/path.db")
	if err == nil {
		t.Error("expected error for path without session ID")
	}

	// Nonexistent DB
	_, err = p.Parse("/nonexistent/opencode.db::ses_001")
	if err == nil {
		t.Error("expected error for nonexistent DB")
	}
}

func TestOpenCodeParserEmptySession(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "empty.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	db.Exec(`
		CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, time_created INTEGER, time_updated INTEGER);
		CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
		CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
		INSERT INTO session (id, title, time_created, time_updated) VALUES ('ses_empty', 'Empty', 1000, 2000);
	`)
	db.Close()

	p := NewOpenCodeParser()
	_, err = p.Parse(dbPath + "::ses_empty")
	if err == nil {
		t.Error("expected error for session with no messages")
	}

	// Cleanup temp file
	os.Remove(dbPath)
}
