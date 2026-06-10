package parser

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mce/scanner/pkg/model"
	_ "modernc.org/sqlite"
)

type OpenCodeParser struct{}

func NewOpenCodeParser() *OpenCodeParser {
	return &OpenCodeParser{}
}

func (p *OpenCodeParser) Platform() string {
	return "opencode"
}

type openCodeMessageData struct {
	Role string `json:"role"`
}

type openCodePartData struct {
	Type  string              `json:"type"`
	Text  string              `json:"text"`
	Tool  string              `json:"tool,omitempty"`
	State *openCodeToolState  `json:"state,omitempty"`
}

type openCodeToolState struct {
	Status string                 `json:"status"`
	Input  map[string]interface{} `json:"input,omitempty"`
	Output string                 `json:"output,omitempty"`
}

// Parse takes path in format "dbpath::sessionID".
func (p *OpenCodeParser) Parse(path string) (*model.ExtractedConversation, error) {
	parts := strings.SplitN(path, "::", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("opencode path must be 'dbpath::sessionID', got %q", path)
	}
	dbPath, sessionID := parts[0], parts[1]

	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		return nil, fmt.Errorf("open db %s: %w", dbPath, err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping db %s: %w", dbPath, err)
	}

	var title string
	err = db.QueryRow("SELECT COALESCE(title, '') FROM session WHERE id = ?", sessionID).Scan(&title)
	if err != nil {
		return nil, fmt.Errorf("session %s not found: %w", sessionID, err)
	}

	rows, err := db.Query(`
		SELECT m.id, m.data
		FROM message m
		WHERE m.session_id = ?
		ORDER BY m.time_created ASC
	`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("query messages: %w", err)
	}
	defer rows.Close()

	var messages []model.ExtractedMessage
	var warnings []string
	idx := 0

	for rows.Next() {
		var msgID, dataStr string
		if err := rows.Scan(&msgID, &dataStr); err != nil {
			warnings = append(warnings, fmt.Sprintf("scan message: %v", err))
			continue
		}

		var msgData openCodeMessageData
		if err := json.Unmarshal([]byte(dataStr), &msgData); err != nil {
			warnings = append(warnings, fmt.Sprintf("parse message data: %v", err))
			continue
		}

		if msgData.Role != "user" && msgData.Role != "assistant" {
			continue
		}

		msgs, err := p.getMessageParts(db, msgID, msgData.Role, idx)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("get parts for %s: %v", msgID, err))
			continue
		}
		for _, m := range msgs {
			messages = append(messages, m)
			idx++
		}
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate messages: %w", err)
	}

	if len(messages) == 0 {
		return nil, fmt.Errorf("%w for session %s", ErrNoMessages, sessionID)
	}

	if title == "" {
		title = deriveTitle(messages)
	}

	return BuildResult("opencode", "opencode-sqlite", sessionID, title, messages, warnings, map[string]any{
		"session_id": sessionID,
	}), nil
}

func (p *OpenCodeParser) getMessageParts(db *sql.DB, msgID, role string, startIdx int) ([]model.ExtractedMessage, error) {
	rows, err := db.Query(`
		SELECT data FROM part
		WHERE message_id = ?
		ORDER BY time_created ASC
	`, msgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []model.ExtractedMessage
	var textParts []string
	idx := startIdx

	flush := func() {
		if len(textParts) > 0 {
			content := strings.Join(textParts, "\n\n")
			if strings.TrimSpace(content) != "" {
				msgs = append(msgs, model.ExtractedMessage{Role: role, Content: content, Index: idx})
				idx++
			}
			textParts = nil
		}
	}

	for rows.Next() {
		var dataStr string
		if err := rows.Scan(&dataStr); err != nil {
			continue
		}

		var part openCodePartData
		if err := json.Unmarshal([]byte(dataStr), &part); err != nil {
			continue
		}

		switch part.Type {
		case "text":
			if part.Text != "" {
				textParts = append(textParts, part.Text)
			}
		case "tool":
			flush()
			content := renderOpenCodeTool(part)
			msgs = append(msgs, model.ExtractedMessage{Role: "tool", Content: content, Index: idx})
			idx++
		}
	}
	flush()

	return msgs, rows.Err()
}

func renderOpenCodeTool(part openCodePartData) string {
	name := part.Tool
	if name == "" {
		name = "unknown"
	}
	if part.State == nil {
		return fmt.Sprintf("[Tool: %s]", name)
	}
	var detail string
	if fp, ok := part.State.Input["filePath"].(string); ok {
		detail = fp
	} else if cmd, ok := part.State.Input["command"].(string); ok {
		runes := []rune(cmd)
		if len(runes) > 200 {
			detail = string(runes[:200]) + "…"
		} else {
			detail = cmd
		}
	}
	if detail != "" {
		return fmt.Sprintf("[Tool: %s] %s", name, detail)
	}
	return fmt.Sprintf("[Tool: %s]", name)
}
