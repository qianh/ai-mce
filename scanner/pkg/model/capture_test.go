package model

import (
	"encoding/json"
	"testing"
)

func TestExtractedConversationJSON(t *testing.T) {
	conv := ExtractedConversation{
		SchemaVersion:    "1.0",
		ExtractorVersion: "scanner-1.0",
		Source: Source{
			Platform:     "claude",
			URL:          "desktop",
			BrowserTitle: "Test Session",
			CapturedAt:   "2026-06-08T10:00:00Z",
		},
		Content: Content{
			Title: "Test Session",
			Messages: []ExtractedMessage{
				{Role: "user", Content: "hello", Index: 0},
				{Role: "assistant", Content: "hi there", Index: 1},
			},
		},
		ExtractionQuality: ExtractionQuality{
			Confidence:        0.9,
			Method:            "cli_session",
			Warnings:          []string{},
			MessageCount:      2,
			EmptyMessageCount: 0,
		},
		Hashes: Hashes{
			ContentHash:       "abc123",
			MessageHashes:     []string{"h1", "h2"},
			SourceFingerprint: "claude:desktop",
		},
	}

	data, err := json.Marshal(conv)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if m["schema_version"] != "1.0" {
		t.Errorf("schema_version: got %v, want 1.0", m["schema_version"])
	}
	if m["extractor_version"] != "scanner-1.0" {
		t.Errorf("extractor_version: got %v, want scanner-1.0", m["extractor_version"])
	}

	source := m["source"].(map[string]any)
	if source["platform"] != "claude" {
		t.Errorf("source.platform: got %v, want claude", source["platform"])
	}
	if source["url"] != "desktop" {
		t.Errorf("source.url: got %v, want desktop", source["url"])
	}

	content := m["content"].(map[string]any)
	msgs := content["messages"].([]any)
	if len(msgs) != 2 {
		t.Fatalf("messages count: got %d, want 2", len(msgs))
	}
	msg0 := msgs[0].(map[string]any)
	if msg0["role"] != "user" {
		t.Errorf("messages[0].role: got %v, want user", msg0["role"])
	}

	hashes := m["hashes"].(map[string]any)
	if hashes["source_fingerprint"] != "claude:desktop" {
		t.Errorf("source_fingerprint: got %v, want claude:desktop", hashes["source_fingerprint"])
	}
}

func TestCaptureCreateRequestJSON(t *testing.T) {
	conv := ExtractedConversation{
		SchemaVersion:    "1.0",
		ExtractorVersion: "scanner-1.0",
		Source: Source{
			Platform:     "codex",
			URL:          "desktop",
			BrowserTitle: "Codex Session",
			CapturedAt:   "2026-06-08T12:00:00Z",
		},
		Content: Content{
			Title:    "Codex Session",
			Messages: []ExtractedMessage{},
		},
		ExtractionQuality: ExtractionQuality{
			Confidence: 0.8,
			Method:     "cli_session",
			Warnings:   []string{},
		},
		Hashes: Hashes{
			ContentHash:       "def456",
			MessageHashes:     []string{},
			SourceFingerprint: "codex:desktop",
		},
		Metadata: map[string]any{
			"conversation_id": "session-123",
		},
	}

	req := conv.ToCaptureCreateRequest()

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if _, ok := m["source"]; !ok {
		t.Error("missing 'source' key")
	}
	if _, ok := m["content"]; !ok {
		t.Error("missing 'content' key")
	}
	if _, ok := m["extraction_quality"]; !ok {
		t.Error("missing 'extraction_quality' key")
	}
	if _, ok := m["hashes"]; !ok {
		t.Error("missing 'hashes' key")
	}
	if _, ok := m["metadata"]; !ok {
		t.Error("missing 'metadata' key")
	}
}
