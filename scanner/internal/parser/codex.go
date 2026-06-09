package parser

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/mce/scanner/pkg/model"
)

type CodexParser struct{}

func NewCodexParser() *CodexParser {
	return &CodexParser{}
}

func (p *CodexParser) Platform() string {
	return "codex"
}

type codexLine struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type codexSessionMeta struct {
	ID            string `json:"id"`
	CWD           string `json:"cwd"`
	ModelProvider string `json:"model_provider"`
	CLIVersion    string `json:"cli_version"`
}

type codexResponseItem struct {
	Type    string            `json:"type"`
	Role    string            `json:"role"`
	Content []codexTextBlock  `json:"content"`
}

type codexTextBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

func (p *CodexParser) Parse(path string) (*model.ExtractedConversation, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	var messages []model.ExtractedMessage
	var warnings []string
	var sessionID string
	idx := 0

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024)

	for scanner.Scan() {
		var line codexLine
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			warnings = append(warnings, fmt.Sprintf("skipped malformed line: %v", err))
			continue
		}

		switch line.Type {
		case "session_meta":
			var meta codexSessionMeta
			if err := json.Unmarshal(line.Payload, &meta); err == nil {
				sessionID = meta.ID
			}

		case "response_item":
			var item codexResponseItem
			if err := json.Unmarshal(line.Payload, &item); err != nil {
				continue
			}

			if item.Type != "message" {
				continue
			}
			if item.Role == "developer" {
				continue
			}
			if item.Role != "user" && item.Role != "assistant" {
				continue
			}

			text := extractCodexText(item.Content, item.Role)
			if text == "" {
				continue
			}

			messages = append(messages, model.ExtractedMessage{
				Role:    item.Role,
				Content: text,
				Index:   idx,
			})
			idx++
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan %s: %w", path, err)
	}

	if len(messages) == 0 {
		return nil, fmt.Errorf("%w in %s", ErrNoMessages, path)
	}

	metadata := map[string]any{}
	if sessionID != "" {
		metadata["session_id"] = sessionID
	}

	return BuildResult("codex", "codex-jsonl", deriveTitle(messages), messages, warnings, metadata), nil
}

func extractCodexText(blocks []codexTextBlock, role string) string {
	var texts []string
	for _, b := range blocks {
		if b.Text == "" {
			continue
		}
		if role == "user" && isSystemContext(b.Text) {
			continue
		}
		texts = append(texts, b.Text)
	}
	return strings.Join(texts, "\n\n")
}

func isSystemContext(text string) bool {
	trimmed := strings.TrimSpace(text)
	return strings.HasPrefix(trimmed, "#") || strings.HasPrefix(trimmed, "<")
}
