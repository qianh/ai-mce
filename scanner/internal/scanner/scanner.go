package scanner

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/mce/scanner/internal/api"
	"github.com/mce/scanner/internal/config"
	"github.com/mce/scanner/internal/parser"
	"github.com/mce/scanner/internal/watermark"
	"github.com/mce/scanner/pkg/model"
	_ "modernc.org/sqlite"
)

type Scanner struct {
	cfg       config.Config
	db        *watermark.DB
	apiClient *api.Client
	parsers   map[string]parser.Parser
	toolPaths []config.ToolPath
}

func NewScanner(cfg config.Config, token, refreshToken string, onTokenRefresh func(access, refresh string) error) (*Scanner, error) {
	db, err := watermark.Open(cfg.DBPath)
	if err != nil {
		return nil, fmt.Errorf("open watermark db: %w", err)
	}

	apiClient := api.New(cfg.APIBaseURL, token, refreshToken, onTokenRefresh)
	apiClient.MaxRetries = cfg.MaxRetries

	return &Scanner{
		cfg:       cfg,
		db:        db,
		apiClient: apiClient,
		parsers: map[string]parser.Parser{
			"claude":   parser.NewClaudeCodeParser(),
			"codex":    parser.NewCodexParser(),
			"grok":     parser.NewGrokParser(),
			"opencode": parser.NewOpenCodeParser(),
		},
		toolPaths: cfg.ToolPaths(),
	}, nil
}

func (s *Scanner) Close() error {
	return s.db.Close()
}

// SetReloginFn wires up a full re-login fallback on the API client.
// When a token refresh fails, the client calls fn to get fresh tokens instead of erroring out.
func (s *Scanner) SetReloginFn(fn func() (accessToken, refreshToken string, err error)) {
	s.apiClient.ReloginFn = fn
}

type discoveredSession struct {
	Platform string
	FilePath string
}

func (s *Scanner) RunOnce() error {
	sessions := s.discoverAll()
	total := len(sessions)
	if total == 0 {
		log.Printf("scan complete: 0 sessions")
		return nil
	}

	concurrency := s.cfg.Concurrency
	if concurrency <= 0 {
		concurrency = 8
	}

	sessionCh := make(chan discoveredSession, concurrency)
	var wg sync.WaitGroup
	var processed atomic.Int64

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for sess := range sessionCh {
				if err := s.processSession(sess); err != nil {
					log.Printf("error processing %s (%s): %v", sess.FilePath, sess.Platform, err)
				}
				n := processed.Add(1)
				if n%100 == 0 {
					log.Printf("processed %d/%d sessions...", n, int64(total))
				}
			}
		}()
	}

	for _, sess := range sessions {
		sessionCh <- sess
	}
	close(sessionCh)

	wg.Wait()
	log.Printf("scan complete: %d sessions", processed.Load())
	return nil
}

func (s *Scanner) discoverAll() []discoveredSession {
	var all []discoveredSession
	threshold := s.cfg.CompletionThresholdMin

	for _, tp := range s.toolPaths {
		switch tp.Platform {
		case "claude":
			all = append(all, discoverClaudeCodeSessions(tp.BasePath, threshold)...)
		case "codex":
			all = append(all, discoverCodexSessions(tp.BasePath, threshold)...)
		case "grok":
			all = append(all, discoverGrokSessions(tp.BasePath, threshold)...)
		case "opencode":
			all = append(all, discoverOpenCodeSessions(tp.BasePath, threshold)...)
		}
	}

	return all
}

func (s *Scanner) processSession(sess discoveredSession) error {
	p, ok := s.parsers[sess.Platform]
	if !ok {
		return fmt.Errorf("no parser for platform %q", sess.Platform)
	}

	conv, err := p.Parse(sess.FilePath)
	if err != nil {
		if errors.Is(err, parser.ErrNoMessages) {
			// Session has no extractable conversation content (init-only, empty, etc.)
			// Mark permanently so it isn't retried on every scan.
			_ = s.db.MarkUploaded(sess.FilePath, "empty:v1", sess.Platform, "")
			return nil
		}
		return fmt.Errorf("parse: %w", err)
	}

	processed, err := s.db.IsProcessed(sess.FilePath, conv.Hashes.ContentHash)
	if err != nil {
		return fmt.Errorf("check watermark: %w", err)
	}
	if processed {
		return nil
	}

	_, err = s.apiClient.UploadCapture(conv)
	if err != nil {
		payload, _ := captureJSON(conv)
		s.db.SavePending(sess.FilePath, payload, err.Error())
		return fmt.Errorf("upload: %w", err)
	}

	sessionID := ""
	if conv.Metadata != nil {
		if id, ok := conv.Metadata["session_id"].(string); ok {
			sessionID = id
		}
	}

	return s.db.MarkUploaded(sess.FilePath, conv.Hashes.ContentHash, sess.Platform, sessionID)
}

func captureJSON(conv *model.ExtractedConversation) (string, error) {
	data, err := json.Marshal(conv.ToCaptureCreateRequest())
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func isSessionCompleted(path string, thresholdMin int) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return time.Since(info.ModTime()) > time.Duration(thresholdMin)*time.Minute
}

func discoverClaudeCodeSessions(basePath string, thresholdMin int) []discoveredSession {
	var sessions []discoveredSession

	if _, err := os.Stat(basePath); err != nil {
		return nil
	}

	entries, err := os.ReadDir(basePath)
	if err != nil {
		return nil
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		projDir := filepath.Join(basePath, entry.Name())
		files, err := os.ReadDir(projDir)
		if err != nil {
			continue
		}
		for _, f := range files {
			if f.IsDir() || !strings.HasSuffix(f.Name(), ".jsonl") {
				continue
			}
			fullPath := filepath.Join(projDir, f.Name())
			if isSessionCompleted(fullPath, thresholdMin) {
				sessions = append(sessions, discoveredSession{
					Platform: "claude",
					FilePath: fullPath,
				})
			}
		}
	}

	return sessions
}

func discoverCodexSessions(basePath string, thresholdMin int) []discoveredSession {
	var sessions []discoveredSession

	filepath.Walk(basePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() || !strings.HasSuffix(path, ".jsonl") {
			return nil
		}
		if isSessionCompleted(path, thresholdMin) {
			sessions = append(sessions, discoveredSession{
				Platform: "codex",
				FilePath: path,
			})
		}
		return nil
	})

	return sessions
}

func discoverGrokSessions(basePath string, thresholdMin int) []discoveredSession {
	var sessions []discoveredSession

	filepath.Walk(basePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.Name() != "chat_history.jsonl" {
			return nil
		}
		sessionDir := filepath.Dir(path)
		if isSessionCompleted(path, thresholdMin) {
			sessions = append(sessions, discoveredSession{
				Platform: "grok",
				FilePath: sessionDir,
			})
		}
		return nil
	})

	return sessions
}

func discoverOpenCodeSessions(dbPath string, thresholdMin int) []discoveredSession {
	if _, err := os.Stat(dbPath); err != nil {
		return nil
	}

	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		return nil
	}
	defer db.Close()

	// Filter sessions whose latest activity is older than the threshold.
	// Uses UnixMilli cutoff — safe whether time_updated stores seconds or millis.
	cutoff := time.Now().Add(-time.Duration(thresholdMin) * time.Minute).UnixMilli()
	rows, err := db.Query(`SELECT id FROM session WHERE time_updated < ?`, cutoff)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var sessions []discoveredSession
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		sessions = append(sessions, discoveredSession{
			Platform: "opencode",
			FilePath: dbPath + "::" + id,
		})
	}

	return sessions
}
