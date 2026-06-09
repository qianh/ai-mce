package parser

import (
	"path/filepath"
	"runtime"
	"testing"
)

func testdataPath(name string) string {
	_, f, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(f), "testdata", name)
}

func TestClaudeCodeParserBasic(t *testing.T) {
	p := NewClaudeCodeParser()

	conv, err := p.Parse(testdataPath("claudecode_basic.jsonl"))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if conv.Source.Platform != "claude" {
		t.Errorf("platform: got %q, want %q", conv.Source.Platform, "claude")
	}
	if conv.Source.URL != "desktop" {
		t.Errorf("url: got %q, want %q", conv.Source.URL, "desktop")
	}
	if conv.Content.Title != "Go Module Setup Guide" {
		t.Errorf("title: got %q, want %q", conv.Content.Title, "Go Module Setup Guide")
	}
	if len(conv.Content.Messages) != 4 {
		t.Fatalf("message count: got %d, want 4", len(conv.Content.Messages))
	}

	// message 0: user
	if conv.Content.Messages[0].Role != "user" {
		t.Errorf("msg[0] role: got %q", conv.Content.Messages[0].Role)
	}
	if conv.Content.Messages[0].Content != "How do I create a Go module?" {
		t.Errorf("msg[0] content: got %q", conv.Content.Messages[0].Content)
	}
	if conv.Content.Messages[0].Index != 0 {
		t.Errorf("msg[0] index: got %d", conv.Content.Messages[0].Index)
	}

	// message 1: assistant (text blocks concatenated, thinking excluded)
	if conv.Content.Messages[1].Role != "assistant" {
		t.Errorf("msg[1] role: got %q", conv.Content.Messages[1].Role)
	}
	expected := "Run `go mod init <module-path>` to create a new Go module. This creates a `go.mod` file."
	if conv.Content.Messages[1].Content != expected {
		t.Errorf("msg[1] content: got %q", conv.Content.Messages[1].Content)
	}

	// message 2: user
	if conv.Content.Messages[2].Role != "user" {
		t.Errorf("msg[2] role: got %q", conv.Content.Messages[2].Role)
	}

	// message 3: assistant
	if conv.Content.Messages[3].Role != "assistant" {
		t.Errorf("msg[3] role: got %q", conv.Content.Messages[3].Role)
	}
}

func TestClaudeCodeParserPlatform(t *testing.T) {
	p := NewClaudeCodeParser()
	if p.Platform() != "claude" {
		t.Errorf("Platform: got %q, want %q", p.Platform(), "claude")
	}
}

func TestClaudeCodeParserHashes(t *testing.T) {
	p := NewClaudeCodeParser()

	conv, err := p.Parse(testdataPath("claudecode_basic.jsonl"))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if conv.Hashes.ContentHash == "" {
		t.Error("content_hash should not be empty")
	}
	if len(conv.Hashes.ContentHash) != 64 {
		t.Errorf("content_hash length: got %d, want 64", len(conv.Hashes.ContentHash))
	}
	if conv.Hashes.SourceFingerprint != "claude:desktop" {
		t.Errorf("source_fingerprint: got %q", conv.Hashes.SourceFingerprint)
	}
	if len(conv.Hashes.MessageHashes) != 4 {
		t.Errorf("message_hashes count: got %d, want 4", len(conv.Hashes.MessageHashes))
	}
}

func TestClaudeCodeParserQuality(t *testing.T) {
	p := NewClaudeCodeParser()

	conv, err := p.Parse(testdataPath("claudecode_basic.jsonl"))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if conv.ExtractionQuality.Method != "claude-code-jsonl" {
		t.Errorf("method: got %q", conv.ExtractionQuality.Method)
	}
	if conv.ExtractionQuality.MessageCount != 4 {
		t.Errorf("message_count: got %d, want 4", conv.ExtractionQuality.MessageCount)
	}
	if conv.ExtractionQuality.Confidence < 0.9 {
		t.Errorf("confidence: got %f, want >= 0.9", conv.ExtractionQuality.Confidence)
	}
}

func TestClaudeCodeParserFileNotFound(t *testing.T) {
	p := NewClaudeCodeParser()
	_, err := p.Parse("/nonexistent/path.jsonl")
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}
