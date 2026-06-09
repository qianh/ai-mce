package model

import (
	"crypto/sha256"
	"fmt"
	"testing"
)

func TestComputeContentHash(t *testing.T) {
	messages := []ExtractedMessage{
		{Role: "user", Content: "hello world", Index: 0},
		{Role: "assistant", Content: "hi there", Index: 1},
	}

	hash := ComputeContentHash(messages)

	if hash == "" {
		t.Fatal("hash should not be empty")
	}
	if len(hash) != 64 {
		t.Errorf("hash length: got %d, want 64 (SHA-256 hex)", len(hash))
	}

	// same input = same hash
	hash2 := ComputeContentHash(messages)
	if hash != hash2 {
		t.Errorf("deterministic: got different hashes for same input")
	}
}

func TestComputeContentHashNormalization(t *testing.T) {
	msgs1 := []ExtractedMessage{
		{Role: "user", Content: "  hello  world  ", Index: 0},
	}
	msgs2 := []ExtractedMessage{
		{Role: "user", Content: "hello world", Index: 0},
	}

	// trimmed content should produce the same hash
	h1 := ComputeContentHash(msgs1)
	h2 := ComputeContentHash(msgs2)
	if h1 != h2 {
		t.Errorf("normalization failed: trimmed whitespace should produce same hash")
	}
}

func TestComputeContentHashCollapsesBlankLines(t *testing.T) {
	msgs1 := []ExtractedMessage{
		{Role: "user", Content: "line1\n\n\n\nline2", Index: 0},
	}
	msgs2 := []ExtractedMessage{
		{Role: "user", Content: "line1\n\nline2", Index: 0},
	}

	h1 := ComputeContentHash(msgs1)
	h2 := ComputeContentHash(msgs2)
	if h1 != h2 {
		t.Errorf("blank line collapse failed: multiple blank lines should collapse to one")
	}
}

func TestComputeContentHashDifferentContent(t *testing.T) {
	msgs1 := []ExtractedMessage{
		{Role: "user", Content: "hello", Index: 0},
	}
	msgs2 := []ExtractedMessage{
		{Role: "user", Content: "world", Index: 0},
	}

	h1 := ComputeContentHash(msgs1)
	h2 := ComputeContentHash(msgs2)
	if h1 == h2 {
		t.Error("different content should produce different hashes")
	}
}

func TestComputeContentHashRoleMatters(t *testing.T) {
	msgs1 := []ExtractedMessage{
		{Role: "user", Content: "hello", Index: 0},
	}
	msgs2 := []ExtractedMessage{
		{Role: "assistant", Content: "hello", Index: 0},
	}

	h1 := ComputeContentHash(msgs1)
	h2 := ComputeContentHash(msgs2)
	if h1 == h2 {
		t.Error("different roles should produce different hashes")
	}
}

func TestComputeSourceFingerprint(t *testing.T) {
	tests := []struct {
		platform string
		want     string
	}{
		{"claude", "claude:desktop"},
		{"codex", "codex:desktop"},
		{"grok", "grok:desktop"},
		{"opencode", "opencode:desktop"},
	}
	for _, tt := range tests {
		got := ComputeSourceFingerprint(tt.platform)
		if got != tt.want {
			t.Errorf("ComputeSourceFingerprint(%q): got %q, want %q", tt.platform, got, tt.want)
		}
	}
}

func TestComputeMessageHash(t *testing.T) {
	msg := ExtractedMessage{Role: "user", Content: "hello", Index: 0}
	hash := ComputeMessageHash(msg)

	// verify it's a valid SHA-256 hex
	if len(hash) != 64 {
		t.Errorf("message hash length: got %d, want 64", len(hash))
	}

	// manually compute expected
	input := fmt.Sprintf("%d:%s:%s", msg.Index, msg.Role, "hello")
	expected := fmt.Sprintf("%x", sha256.Sum256([]byte(input)))
	if hash != expected {
		t.Errorf("message hash: got %s, want %s", hash, expected)
	}
}
