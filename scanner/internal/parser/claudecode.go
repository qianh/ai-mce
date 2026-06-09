package parser

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/mce/scanner/pkg/model"
)

type ClaudeCodeParser struct{}

func NewClaudeCodeParser() *ClaudeCodeParser {
	return &ClaudeCodeParser{}
}

func (p *ClaudeCodeParser) Platform() string {
	return "claude"
}

type claudeCodeLine struct {
	Type      string          `json:"type"`
	Message   json.RawMessage `json:"message,omitempty"`
	AITitle   string          `json:"aiTitle,omitempty"`
	Timestamp string          `json:"timestamp,omitempty"`
}

type claudeCodeMessage struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
}

type claudeCodeContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

func (p *ClaudeCodeParser) Parse(path string) (*model.ExtractedConversation, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	var messages []model.ExtractedMessage
	var title string
	var warnings []string
	idx := 0

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024)

	for scanner.Scan() {
		var line claudeCodeLine
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			warnings = append(warnings, fmt.Sprintf("skipped malformed line: %v", err))
			continue
		}

		switch line.Type {
		case "user", "assistant":
			msg, err := parseClaudeCodeMessage(line.Message, line.Type, idx)
			if err != nil {
				warnings = append(warnings, fmt.Sprintf("skipped %s message: %v", line.Type, err))
				continue
			}
			messages = append(messages, *msg)
			idx++

		case "ai-title":
			if line.AITitle != "" {
				title = line.AITitle
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan %s: %w", path, err)
	}

	if len(messages) == 0 {
		return nil, fmt.Errorf("no messages found in %s", path)
	}

	return BuildResult("claude", "claude-code-jsonl", title, messages, warnings, nil), nil
}

func parseClaudeCodeMessage(raw json.RawMessage, msgType string, idx int) (*model.ExtractedMessage, error) {
	if raw == nil {
		return nil, fmt.Errorf("nil message")
	}

	var msg claudeCodeMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		return nil, err
	}

	var content string

	if msgType == "user" {
		var s string
		if err := json.Unmarshal(msg.Content, &s); err != nil {
			return nil, fmt.Errorf("user content not string: %w", err)
		}
		content = s
	} else {
		var blocks []claudeCodeContentBlock
		if err := json.Unmarshal(msg.Content, &blocks); err != nil {
			return nil, fmt.Errorf("assistant content not array: %w", err)
		}
		var texts []string
		for _, b := range blocks {
			if b.Type == "text" && b.Text != "" {
				texts = append(texts, b.Text)
			}
		}
		content = strings.Join(texts, "\n\n")
	}

	return &model.ExtractedMessage{
		Role:    msg.Role,
		Content: content,
		Index:   idx,
	}, nil
}
