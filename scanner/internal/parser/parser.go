package parser

import (
	"strings"
	"time"

	"github.com/mce/scanner/pkg/model"
)

type Parser interface {
	Parse(path string) (*model.ExtractedConversation, error)
	Platform() string
}

func BuildResult(platform, method, title string, messages []model.ExtractedMessage, warnings []string, metadata map[string]any) *model.ExtractedConversation {
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
