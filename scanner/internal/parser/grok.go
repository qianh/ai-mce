package parser

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/mce/scanner/pkg/model"
)

type GrokParser struct{}

func NewGrokParser() *GrokParser {
	return &GrokParser{}
}

func (p *GrokParser) Platform() string {
	return "grok"
}

type grokChatLine struct {
	Type    string          `json:"type"`
	Content json.RawMessage `json:"content"`
}

type grokTextBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type grokSummary struct {
	Info struct {
		ID string `json:"id"`
	} `json:"info"`
	SessionSummary string `json:"session_summary"`
}

var userQueryRe = regexp.MustCompile(`(?s)<user_query>\s*(.*?)\s*</user_query>`)

func (p *GrokParser) Parse(dir string) (*model.ExtractedConversation, error) {
	chatPath := filepath.Join(dir, "chat_history.jsonl")
	summaryPath := filepath.Join(dir, "summary.json")

	f, err := os.Open(chatPath)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", chatPath, err)
	}
	defer f.Close()

	var summary grokSummary
	if data, err := os.ReadFile(summaryPath); err == nil {
		json.Unmarshal(data, &summary)
	}

	var messages []model.ExtractedMessage
	var warnings []string
	idx := 0

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024)

	for scanner.Scan() {
		var line grokChatLine
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			warnings = append(warnings, fmt.Sprintf("skipped malformed line: %v", err))
			continue
		}

		switch line.Type {
		case "user":
			text := extractGrokUserQuery(line.Content)
			if text == "" {
				continue
			}
			messages = append(messages, model.ExtractedMessage{
				Role:    "user",
				Content: text,
				Index:   idx,
			})
			idx++

		case "assistant":
			var content string
			if err := json.Unmarshal(line.Content, &content); err != nil {
				warnings = append(warnings, fmt.Sprintf("skipped assistant message: %v", err))
				continue
			}
			if strings.TrimSpace(content) == "" {
				continue
			}
			messages = append(messages, model.ExtractedMessage{
				Role:    "assistant",
				Content: content,
				Index:   idx,
			})
			idx++
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan %s: %w", chatPath, err)
	}

	if len(messages) == 0 {
		return nil, fmt.Errorf("%w in %s", ErrNoMessages, chatPath)
	}

	metadata := map[string]any{}
	if summary.Info.ID != "" {
		metadata["session_id"] = summary.Info.ID
	}

	title := summary.SessionSummary
	if title == "" {
		title = deriveTitle(messages)
	}

	return BuildResult("grok", "grok-multi-file", title, messages, warnings, metadata), nil
}

func extractGrokUserQuery(raw json.RawMessage) string {
	var blocks []grokTextBlock
	if err := json.Unmarshal(raw, &blocks); err != nil {
		return ""
	}

	for _, b := range blocks {
		if matches := userQueryRe.FindStringSubmatch(b.Text); len(matches) > 1 {
			return strings.TrimSpace(matches[1])
		}
	}
	return ""
}
