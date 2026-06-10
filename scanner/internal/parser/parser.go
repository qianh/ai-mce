package parser

import (
	"errors"
	"strings"
	"time"

	"github.com/mce/scanner/pkg/model"
)

// ErrNoMessages is returned by parsers when a session file exists but contains
// no extractable user/assistant messages (e.g. init-only sessions).
var ErrNoMessages = errors.New("no messages found")

type Parser interface {
	Parse(path string) (*model.ExtractedConversation, error)
	Platform() string
}

// deriveTitle extracts a display title from the first user message when no
// explicit title is available. Takes first line, trims whitespace, caps at 80 runes.
func deriveTitle(messages []model.ExtractedMessage) string {
	for _, m := range messages {
		if m.Role != "user" {
			continue
		}
		content := strings.TrimSpace(m.Content)
		if content == "" {
			continue
		}
		if nl := strings.IndexByte(content, '\n'); nl > 0 {
			content = strings.TrimSpace(content[:nl])
		}
		runes := []rune(content)
		if len(runes) > 80 {
			content = string(runes[:80])
		}
		return strings.TrimSpace(content)
	}
	return ""
}

func BuildResult(platform, method, sessionID, title string, messages []model.ExtractedMessage, warnings []string, metadata map[string]any) *model.ExtractedConversation {
	messageHashes := make([]string, len(messages))
	emptyCount := 0
	for i, m := range messages {
		messageHashes[i] = model.ComputeMessageHash(m)
		if strings.TrimSpace(m.Content) == "" {
			emptyCount++
		}
	}

	confidence := 1.0
	if emptyCount > 0 {
		confidence = 0.8
	}
	if len(warnings) > 0 {
		confidence = 0.7
	}

	return &model.ExtractedConversation{
		SchemaVersion:    "1.0",
		ExtractorVersion: "scanner-0.1.0",
		SessionID:        sessionID,
		Source: model.Source{
			Platform:   platform,
			URL:        "desktop",
			CapturedAt: time.Now().UTC().Format(time.RFC3339),
		},
		Content: model.Content{
			Title:    title,
			Messages: messages,
		},
		ExtractionQuality: model.ExtractionQuality{
			Confidence:        confidence,
			Method:            method,
			Warnings:          warnings,
			MessageCount:      len(messages),
			EmptyMessageCount: emptyCount,
		},
		Hashes: model.Hashes{
			ContentHash:       model.ComputeContentHash(messages),
			MessageHashes:     messageHashes,
			SourceFingerprint: model.ComputeSourceFingerprint(platform),
		},
		Metadata: metadata,
	}
}
