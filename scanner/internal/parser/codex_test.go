package parser

import (
	"testing"
)

func TestCodexParserBasic(t *testing.T) {
	p := NewCodexParser()

	conv, err := p.Parse(testdataPath("codex_basic.jsonl"))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if conv.Source.Platform != "codex" {
		t.Errorf("platform: got %q, want %q", conv.Source.Platform, "codex")
	}
	if conv.Source.URL != "desktop" {
		t.Errorf("url: got %q, want %q", conv.Source.URL, "desktop")
	}

	// Should have 4 messages: 2 user + 2 assistant
	// developer messages and system/environment context blocks are filtered out
	if len(conv.Content.Messages) != 4 {
		t.Fatalf("message count: got %d, want 4", len(conv.Content.Messages))
	}

	// message 0: user (real question, not system context)
	if conv.Content.Messages[0].Role != "user" {
		t.Errorf("msg[0] role: got %q", conv.Content.Messages[0].Role)
	}
	if conv.Content.Messages[0].Content != "How do I fix this SQL query?" {
		t.Errorf("msg[0] content: got %q", conv.Content.Messages[0].Content)
	}

	// message 1: assistant
	if conv.Content.Messages[1].Role != "assistant" {
		t.Errorf("msg[1] role: got %q", conv.Content.Messages[1].Role)
	}
	expected := "You need to add a WHERE clause to filter the results. Here's the corrected query."
	if conv.Content.Messages[1].Content != expected {
		t.Errorf("msg[1] content: got %q", conv.Content.Messages[1].Content)
	}

	// message 2: user follow-up
	if conv.Content.Messages[2].Role != "user" {
		t.Errorf("msg[2] role: got %q", conv.Content.Messages[2].Role)
	}

	// message 3: assistant follow-up
	if conv.Content.Messages[3].Role != "assistant" {
		t.Errorf("msg[3] role: got %q", conv.Content.Messages[3].Role)
	}
}

func TestCodexParserPlatform(t *testing.T) {
	p := NewCodexParser()
	if p.Platform() != "codex" {
		t.Errorf("Platform: got %q, want %q", p.Platform(), "codex")
	}
}

func TestCodexParserHashes(t *testing.T) {
	p := NewCodexParser()

	conv, err := p.Parse(testdataPath("codex_basic.jsonl"))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if conv.Hashes.ContentHash == "" {
		t.Error("content_hash should not be empty")
	}
	if len(conv.Hashes.ContentHash) != 64 {
		t.Errorf("content_hash length: got %d, want 64", len(conv.Hashes.ContentHash))
	}
	if conv.Hashes.SourceFingerprint != "codex:desktop" {
		t.Errorf("source_fingerprint: got %q", conv.Hashes.SourceFingerprint)
	}
	if len(conv.Hashes.MessageHashes) != 4 {
		t.Errorf("message_hashes count: got %d, want 4", len(conv.Hashes.MessageHashes))
	}
}

func TestCodexParserQuality(t *testing.T) {
	p := NewCodexParser()

	conv, err := p.Parse(testdataPath("codex_basic.jsonl"))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if conv.ExtractionQuality.Method != "codex-jsonl" {
		t.Errorf("method: got %q", conv.ExtractionQuality.Method)
	}
	if conv.ExtractionQuality.MessageCount != 4 {
		t.Errorf("message_count: got %d, want 4", conv.ExtractionQuality.MessageCount)
	}
	if conv.ExtractionQuality.Confidence < 0.9 {
		t.Errorf("confidence: got %f, want >= 0.9", conv.ExtractionQuality.Confidence)
	}
}

func TestCodexParserSessionMeta(t *testing.T) {
	p := NewCodexParser()

	conv, err := p.Parse(testdataPath("codex_basic.jsonl"))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	// Session ID from session_meta should be in metadata
	if conv.Metadata == nil {
		t.Fatal("metadata should not be nil")
	}
	if conv.Metadata["session_id"] != "019cb196-e34d-78b3-8ca2-b50319b00567" {
		t.Errorf("session_id: got %v", conv.Metadata["session_id"])
	}
}

func TestCodexParserFileNotFound(t *testing.T) {
	p := NewCodexParser()
	_, err := p.Parse("/nonexistent/path.jsonl")
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}
