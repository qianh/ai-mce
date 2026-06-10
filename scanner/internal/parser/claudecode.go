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
	SessionID string          `json:"sessionId,omitempty"`
	Timestamp string          `json:"timestamp,omitempty"`
}

type claudeCodeMessage struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
}

type claudeCodeContentBlock struct {
	Type      string          `json:"type"`
	Text      string          `json:"text,omitempty"`
	Name      string          `json:"name,omitempty"`
	Input     json.RawMessage `json:"input,omitempty"`
	ToolUseID string          `json:"tool_use_id,omitempty"`
	Content   json.RawMessage `json:"content,omitempty"`
}

func (p *ClaudeCodeParser) Parse(path string) (*model.ExtractedConversation, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	var messages []model.ExtractedMessage
	var title string
	var sessionID string
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

		if sessionID == "" && line.SessionID != "" {
			sessionID = line.SessionID
		}

		switch line.Type {
		case "user", "assistant":
			msgs := parseClaudeCodeMessages(line.Message, line.Type, idx)
			for _, m := range msgs {
				messages = append(messages, m)
				idx++
			}

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
		return nil, fmt.Errorf("%w in %s", ErrNoMessages, path)
	}

	if title == "" {
		title = deriveTitle(messages)
	}

	return BuildResult("claude", "claude-code-jsonl", sessionID, title, messages, warnings, nil), nil
}

// parseClaudeCodeMessages returns one or more messages from a single JSONL line.
// A user line with mixed text + tool_result blocks produces separate messages
// with correct roles: text→"user", tool_result→"tool".
// An assistant line with mixed text + tool_use blocks produces separate messages:
// text→"assistant", tool_use→"tool".
func parseClaudeCodeMessages(raw json.RawMessage, msgType string, startIdx int) []model.ExtractedMessage {
	if raw == nil {
		return nil
	}

	var msg claudeCodeMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		return nil
	}

	idx := startIdx

	if msgType == "user" {
		var s string
		if err := json.Unmarshal(msg.Content, &s); err == nil {
			if strings.TrimSpace(s) == "" {
				return nil
			}
			return []model.ExtractedMessage{{Role: "user", Content: s, Index: idx}}
		}

		var blocks []claudeCodeContentBlock
		if err := json.Unmarshal(msg.Content, &blocks); err != nil {
			return nil
		}
		return splitUserBlocks(blocks, idx)
	}

	// assistant
	var blocks []claudeCodeContentBlock
	if err := json.Unmarshal(msg.Content, &blocks); err != nil {
		return nil
	}
	return splitAssistantBlocks(blocks, idx)
}

func splitUserBlocks(blocks []claudeCodeContentBlock, startIdx int) []model.ExtractedMessage {
	var msgs []model.ExtractedMessage
	var textParts []string
	idx := startIdx

	flush := func() {
		if len(textParts) > 0 {
			content := strings.Join(textParts, "\n\n")
			if strings.TrimSpace(content) != "" {
				msgs = append(msgs, model.ExtractedMessage{Role: "user", Content: content, Index: idx})
				idx++
			}
			textParts = nil
		}
	}

	for _, b := range blocks {
		switch b.Type {
		case "text":
			if b.Text != "" {
				textParts = append(textParts, b.Text)
			}
		case "image":
			textParts = append(textParts, "[Image]")
		case "tool_result":
			flush()
			content := renderToolResult(b)
			if strings.TrimSpace(content) != "" {
				msgs = append(msgs, model.ExtractedMessage{Role: "tool", Content: content, Index: idx})
				idx++
			}
		}
	}
	flush()
	return msgs
}

func splitAssistantBlocks(blocks []claudeCodeContentBlock, startIdx int) []model.ExtractedMessage {
	var msgs []model.ExtractedMessage
	var textParts []string
	idx := startIdx

	flush := func() {
		if len(textParts) > 0 {
			content := strings.Join(textParts, "\n\n")
			if strings.TrimSpace(content) != "" {
				msgs = append(msgs, model.ExtractedMessage{Role: "assistant", Content: content, Index: idx})
				idx++
			}
			textParts = nil
		}
	}

	for _, b := range blocks {
		switch b.Type {
		case "text":
			if b.Text != "" {
				textParts = append(textParts, b.Text)
			}
		case "tool_use":
			flush()
			content := renderToolUse(b)
			msgs = append(msgs, model.ExtractedMessage{Role: "tool", Content: content, Index: idx})
			idx++
		case "thinking":
			// skip
		}
	}
	flush()
	return msgs
}

func renderToolUse(b claudeCodeContentBlock) string {
	name := b.Name
	if name == "" {
		return "[Tool call]"
	}
	summary := toolInputSummary(name, b.Input)
	if summary != "" {
		return fmt.Sprintf("[Tool: %s] %s", name, summary)
	}
	return fmt.Sprintf("[Tool: %s]", name)
}

func toolInputSummary(name string, raw json.RawMessage) string {
	if raw == nil {
		return ""
	}
	var input map[string]json.RawMessage
	if err := json.Unmarshal(raw, &input); err != nil {
		return ""
	}

	switch name {
	case "Read":
		return jsonString(input["file_path"])
	case "Edit", "Write":
		return jsonString(input["file_path"])
	case "Bash":
		cmd := jsonString(input["command"])
		return truncateRunes(cmd, 200)
	default:
		if fp := jsonString(input["file_path"]); fp != "" {
			return fp
		}
		if cmd := jsonString(input["command"]); cmd != "" {
			return truncateRunes(cmd, 200)
		}
		return ""
	}
}

func renderToolResult(b claudeCodeContentBlock) string {
	if b.Content == nil {
		return "[Tool result]"
	}

	var s string
	if err := json.Unmarshal(b.Content, &s); err == nil {
		return "[Tool result] " + truncateRunes(s, 500)
	}

	var blocks []claudeCodeContentBlock
	if err := json.Unmarshal(b.Content, &blocks); err == nil {
		var texts []string
		for _, cb := range blocks {
			if cb.Type == "text" && cb.Text != "" {
				texts = append(texts, cb.Text)
			}
		}
		if len(texts) > 0 {
			return "[Tool result] " + truncateRunes(strings.Join(texts, "\n"), 500)
		}
	}

	return "[Tool result]"
}

func jsonString(raw json.RawMessage) string {
	if raw == nil {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return ""
	}
	return s
}

func truncateRunes(s string, maxRunes int) string {
	runes := []rune(s)
	if len(runes) <= maxRunes {
		return s
	}
	return string(runes[:maxRunes]) + "…"
}
