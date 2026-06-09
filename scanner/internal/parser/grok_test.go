package parser

import (
	"testing"
)

func TestGrokParserBasic(t *testing.T) {
	p := NewGrokParser()

	conv, err := p.Parse(testdataPath("grok_session"))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if conv.Source.Platform != "grok" {
		t.Errorf("platform: got %q, want %q", conv.Source.Platform, "grok")
	}
	if conv.Source.URL != "desktop" {
		t.Errorf("url: got %q, want %q", conv.Source.URL, "desktop")
	}
	if conv.Content.Title != "Go Concurrency Basics" {
		t.Errorf("title: got %q, want %q", conv.Content.Title, "Go Concurrency Basics")
	}

	// 2 user + 2 assistant = 4 messages (system, user_info, reasoning filtered out)
	if len(conv.Content.Messages) != 4 {
		t.Fatalf("message count: got %d, want 4", len(conv.Content.Messages))
	}

	// message 0: user query (extracted from <user_query> tags)
	if conv.Content.Messages[0].Role != "user" {
		t.Errorf("msg[0] role: got %q", conv.Content.Messages[0].Role)
	}
	if conv.Content.Messages[0].Content != "What is a goroutine?" {
		t.Errorf("msg[0] content: got %q", conv.Content.Messages[0].Content)
	}

	// message 1: assistant
	if conv.Content.Messages[1].Role != "assistant" {
		t.Errorf("msg[1] role: got %q", conv.Content.Messages[1].Role)
	}
	expected := "A goroutine is a lightweight thread managed by the Go runtime. You create one with the `go` keyword."
	if conv.Content.Messages[1].Content != expected {
		t.Errorf("msg[1] content: got %q", conv.Content.Messages[1].Content)
	}

	// message 2: user follow-up
	if conv.Content.Messages[2].Content != "How do channels work?" {
		t.Errorf("msg[2] content: got %q", conv.Content.Messages[2].Content)
	}

	// message 3: assistant follow-up
	if conv.Content.Messages[3].Role != "assistant" {
		t.Errorf("msg[3] role: got %q", conv.Content.Messages[3].Role)
	}
}

func TestGrokParserPlatform(t *testing.T) {
	p := NewGrokParser()
	if p.Platform() != "grok" {
		t.Errorf("Platform: got %q, want %q", p.Platform(), "grok")
	}
}

func TestGrokParserHashes(t *testing.T) {
	p := NewGrokParser()

	conv, err := p.Parse(testdataPath("grok_session"))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if len(conv.Hashes.ContentHash) != 64 {
		t.Errorf("content_hash length: got %d, want 64", len(conv.Hashes.ContentHash))
	}
	if conv.Hashes.SourceFingerprint != "grok:desktop" {
		t.Errorf("source_fingerprint: got %q", conv.Hashes.SourceFingerprint)
	}
	if len(conv.Hashes.MessageHashes) != 4 {
		t.Errorf("message_hashes count: got %d, want 4", len(conv.Hashes.MessageHashes))
	}
}

func TestGrokParserSessionMeta(t *testing.T) {
	p := NewGrokParser()

	conv, err := p.Parse(testdataPath("grok_session"))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if conv.Metadata == nil {
		t.Fatal("metadata should not be nil")
	}
	if conv.Metadata["session_id"] != "019e9ba7-48b2-7ce1-9f99-87880121a4cb" {
		t.Errorf("session_id: got %v", conv.Metadata["session_id"])
	}
}

func TestGrokParserDirNotFound(t *testing.T) {
	p := NewGrokParser()
	_, err := p.Parse("/nonexistent/session/dir")
	if err == nil {
		t.Error("expected error for nonexistent directory")
	}
}

func TestGrokParserTitleFallback(t *testing.T) {
	p := NewGrokParser()

	conv, err := p.Parse(testdataPath("grok_session_no_summary"))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	// session_summary is empty, title should be derived from first user query
	if conv.Content.Title == "" {
		t.Error("title should not be empty when session_summary is empty")
	}
	if conv.Content.Title != "What is a goroutine?" {
		t.Errorf("title: got %q, want %q", conv.Content.Title, "What is a goroutine?")
	}
}
