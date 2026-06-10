package scanner

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
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

type claudeDiscoveryLine struct {
	Entrypoint string `json:"entrypoint,omitempty"`
}

type codexDiscoveryLine struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type codexDiscoveryMeta struct {
	Source       string `json:"source,omitempty"`
	ThreadSource string `json:"thread_source,omitempty"`
}

func (s *Scanner) RunOnce() error {
	lock, err := acquireScanLock(s.cfg.DBPath)
	if err != nil {
		if errors.Is(err, errScanInProgress) {
			log.Printf("scan skipped: another scan is already running")
			return nil
		}
		return fmt.Errorf("acquire scan lock: %w", err)
	}
	defer lock.release()

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
			_ = s.db.MarkUploaded(sess.FilePath, "empty:v1", sess.Platform, "")
			return nil
		}
		return fmt.Errorf("parse: %w", err)
	}

	if s.cfg.MinMessages > 0 && len(conv.Content.Messages) < s.cfg.MinMessages {
		log.Printf("skipping %s (%s): only %d messages (min %d)", sess.FilePath, sess.Platform, len(conv.Content.Messages), s.cfg.MinMessages)
		_ = s.db.MarkUploaded(sess.FilePath, fmt.Sprintf("skipped:min%d:v1", s.cfg.MinMessages), sess.Platform, "")
		return nil
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
			if isSessionCompleted(fullPath, thresholdMin) && isResumableClaudeCodeSession(fullPath) {
				sessions = append(sessions, discoveredSession{
					Platform: "claude",
					FilePath: fullPath,
				})
			}
		}
	}

	return sessions
}

func isResumableClaudeCodeSession(path string) bool {
	entrypoint, ok := firstClaudeCodeEntrypoint(path)
	if !ok {
		return true
	}
	return entrypoint == "cli"
}

func firstClaudeCodeEntrypoint(path string) (string, bool) {
	f, err := os.Open(path)
	if err != nil {
		return "", false
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		var line claudeDiscoveryLine
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			continue
		}
		if line.Entrypoint != "" {
			return line.Entrypoint, true
		}
	}
	return "", false
}

type codexSessionIndex struct {
	ID         string `json:"id"`
	ThreadName string `json:"thread_name"`
	UpdatedAt  string `json:"updated_at"`
}

func discoverCodexSessions(basePath string, thresholdMin int) []discoveredSession {
	indexPath := filepath.Join(filepath.Dir(basePath), "session_index.jsonl")
	f, err := os.Open(indexPath)
	if err != nil {
		log.Printf("codex: cannot open session_index.jsonl: %v, falling back to directory walk", err)
		return discoverCodexSessionsFallback(basePath, thresholdMin)
	}
	defer f.Close()

	indexIDs := make(map[string]bool)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var entry codexSessionIndex
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
			continue
		}
		if entry.ID != "" {
			indexIDs[entry.ID] = true
		}
	}

	if len(indexIDs) == 0 {
		return discoverCodexSessionsFallback(basePath, thresholdMin)
	}

	var sessions []discoveredSession
	seen := make(map[string]bool)
	filepath.Walk(basePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() || !strings.HasSuffix(path, ".jsonl") {
			return nil
		}
		name := filepath.Base(path)
		for id := range indexIDs {
			if strings.Contains(name, id) {
				if isSessionCompleted(path, thresholdMin) && isResumableCodexSession(path) {
					sessions = append(sessions, discoveredSession{
						Platform: "codex",
						FilePath: path,
					})
					seen[path] = true
				}
				break
			}
		}
		return nil
	})

	for _, session := range discoverCodexSessionsFallback(basePath, thresholdMin) {
		if seen[session.FilePath] {
			continue
		}
		sessions = append(sessions, session)
	}

	return sessions
}

func discoverCodexSessionsFallback(basePath string, thresholdMin int) []discoveredSession {
	var sessions []discoveredSession
	filepath.Walk(basePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() || !strings.HasSuffix(path, ".jsonl") {
			return nil
		}
		if isSessionCompleted(path, thresholdMin) && isResumableCodexSession(path) {
			sessions = append(sessions, discoveredSession{
				Platform: "codex",
				FilePath: path,
			})
		}
		return nil
	})
	return sessions
}

func isResumableCodexSession(path string) bool {
	meta, ok := readCodexDiscoveryMeta(path)
	if !ok {
		return true
	}
	return isResumableCodexSource(meta.Source) && isResumableCodexThreadSource(meta.ThreadSource)
}

func readCodexDiscoveryMeta(path string) (codexDiscoveryMeta, bool) {
	f, err := os.Open(path)
	if err != nil {
		return codexDiscoveryMeta{}, false
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		var line codexDiscoveryLine
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			continue
		}
		if line.Type != "session_meta" {
			continue
		}
		var meta codexDiscoveryMeta
		if err := json.Unmarshal(line.Payload, &meta); err != nil {
			return codexDiscoveryMeta{}, false
		}
		return meta, true
	}
	return codexDiscoveryMeta{}, false
}

func isResumableCodexSource(source string) bool {
	switch source {
	case "", "cli", "vscode":
		return true
	default:
		return false
	}
}

func isResumableCodexThreadSource(threadSource string) bool {
	return threadSource == "" || threadSource == "user"
}

func discoverGrokSessions(basePath string, thresholdMin int) []discoveredSession {
	dbPath := filepath.Join(basePath, "session_search.sqlite")
	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		log.Printf("grok: cannot open session_search.sqlite: %v, falling back to directory walk", err)
		return discoverGrokSessionsFallback(basePath, thresholdMin)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Printf("grok: cannot ping session_search.sqlite: %v, falling back to directory walk", err)
		return discoverGrokSessionsFallback(basePath, thresholdMin)
	}

	rows, err := db.Query("SELECT session_id, cwd FROM session_docs")
	if err != nil {
		log.Printf("grok: query session_docs failed: %v, falling back to directory walk", err)
		return discoverGrokSessionsFallback(basePath, thresholdMin)
	}
	defer rows.Close()

	var sessions []discoveredSession
	for rows.Next() {
		var sessionID, cwd string
		if err := rows.Scan(&sessionID, &cwd); err != nil {
			continue
		}

		encodedCwd := url.PathEscape(cwd)
		sessionDir := filepath.Join(basePath, encodedCwd, sessionID)
		chatPath := filepath.Join(sessionDir, "chat_history.jsonl")

		if isSessionCompleted(chatPath, thresholdMin) {
			sessions = append(sessions, discoveredSession{
				Platform: "grok",
				FilePath: sessionDir,
			})
		}
	}

	return sessions
}

func discoverGrokSessionsFallback(basePath string, thresholdMin int) []discoveredSession {
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
