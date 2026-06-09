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
	Type string `json:"type"`
	Text string `json:"text"`
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

		text, err := p.getMessageText(db, msgID)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("get parts for %s: %v", msgID, err))
			continue
		}
		if text == "" {
			continue
		}

		messages = append(messages, model.ExtractedMessage{
			Role:    msgData.Role,
			Content: text,
			Index:   idx,
		})
		idx++
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate messages: %w", err)
	}

	if len(messages) == 0 {
		return nil, fmt.Errorf("%w for session %s", ErrNoMessages, sessionID)
	}

	return BuildResult("opencode", "opencode-sqlite", title, messages, warnings, map[string]any{
		"session_id": sessionID,
	}), nil
}

func (p *OpenCodeParser) getMessageText(db *sql.DB, msgID string) (string, error) {
	rows, err := db.Query(`
		SELECT data FROM part
		WHERE message_id = ?
		ORDER BY time_created ASC
	`, msgID)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var texts []string
	for rows.Next() {
		var dataStr string
		if err := rows.Scan(&dataStr); err != nil {
			continue
		}

		var part openCodePartData
		if err := json.Unmarshal([]byte(dataStr), &part); err != nil {
			continue
		}

		if part.Type == "text" && part.Text != "" {
			texts = append(texts, part.Text)
		}
	}

	return strings.Join(texts, "\n\n"), rows.Err()
}
