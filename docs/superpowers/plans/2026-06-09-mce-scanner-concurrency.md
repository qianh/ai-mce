# mce-scanner Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sequential `RunOnce()` loop with a bounded worker pool, fix the SQLite write-contention bug, and eliminate the token-refresh data race so the scanner handles 4,000+ sessions efficiently.

**Architecture:** Four targeted changes in dependency order: (1) add `Config.Concurrency` field, (2) serialize SQLite writes with `SetMaxOpenConns(1)`, (3) make `api.Client` goroutine-safe with a mutex-guarded token and a serialized-refresh path, (4) replace the sequential loop in `RunOnce()` with a channel-based worker pool that feeds `Concurrency` goroutines. Each task is self-contained and builds on the previous.

**Tech Stack:** Go stdlib only — `sync`, `sync/atomic`, `strconv`; no new dependencies. Tests use `net/http/httptest` (already in use), `t.Setenv`, `t.TempDir()`.

---

### Task 1: Add `Config.Concurrency` field

**Files:**
- Modify: `scanner/internal/config/config.go`
- Modify: `scanner/internal/config/config_test.go`

- [ ] **Step 1.1: Add `Concurrency int` to the `Config` struct**

In `config.go`, add the field after `MaxRetries`:

```go
type Config struct {
	APIBaseURL             string
	DBPath                 string
	TokenPath              string
	CredsPath              string
	CompletionThresholdMin int
	MaxRetries             int
	Concurrency            int
}
```

- [ ] **Step 1.2: Set default in `Default()`**

```go
func Default() Config {
	home, _ := os.UserHomeDir()
	scannerDir := filepath.Join(home, ".mce-scanner")

	return Config{
		APIBaseURL:             "http://localhost:8008",
		DBPath:                 filepath.Join(scannerDir, "state.db"),
		TokenPath:              filepath.Join(scannerDir, "token.json"),
		CredsPath:              filepath.Join(scannerDir, "creds.json"),
		CompletionThresholdMin: 10,
		MaxRetries:             3,
		Concurrency:            8,
	}
}
```

- [ ] **Step 1.3: Read `MCE_CONCURRENCY` in `FromEnv()`**

Add `"strconv"` to the import block. Then add after the existing env-var reads:

```go
if v := os.Getenv("MCE_CONCURRENCY"); v != "" {
	if n, err := strconv.Atoi(v); err == nil && n > 0 {
		cfg.Concurrency = n
	} else {
		log.Printf("warning: invalid MCE_CONCURRENCY %q, using default %d", v, cfg.Concurrency)
	}
}
```

- [ ] **Step 1.4: Write failing tests**

Append to `config_test.go`:

```go
func TestConcurrencyDefault(t *testing.T) {
	t.Setenv("MCE_CONCURRENCY", "")
	cfg := FromEnv()
	if cfg.Concurrency != 8 {
		t.Errorf("Concurrency default: got %d, want 8", cfg.Concurrency)
	}
}

func TestConcurrencyFromEnv(t *testing.T) {
	t.Setenv("MCE_CONCURRENCY", "4")
	cfg := FromEnv()
	if cfg.Concurrency != 4 {
		t.Errorf("Concurrency from env: got %d, want 4", cfg.Concurrency)
	}
}

func TestConcurrencyInvalidEnv(t *testing.T) {
	t.Setenv("MCE_CONCURRENCY", "bad")
	cfg := FromEnv()
	if cfg.Concurrency != 8 {
		t.Errorf("invalid MCE_CONCURRENCY should fall back to default 8, got %d", cfg.Concurrency)
	}
}
```

- [ ] **Step 1.5: Run tests to verify they fail**

```bash
cd /Users/hong/John/ai/ai-mce/scanner
go test ./internal/config/... -run TestConcurrency -v
```

Expected: FAIL — `Concurrency` field does not exist yet (compile error).

- [ ] **Step 1.6: Confirm tests pass after implementation**

```bash
go test ./internal/config/... -v
```

Expected: all config tests PASS.

- [ ] **Step 1.7: Commit**

```bash
git add scanner/internal/config/config.go scanner/internal/config/config_test.go
git commit -m "feat(scanner): add Config.Concurrency field, default 8, MCE_CONCURRENCY env"
```

---

### Task 2: Serialize SQLite writes with `SetMaxOpenConns(1)`

**Files:**
- Modify: `scanner/internal/watermark/watermark.go`
- Modify: `scanner/internal/watermark/watermark_test.go`

- [ ] **Step 2.1: Write failing concurrent-write test**

Append to `watermark_test.go`:

```go
func TestMarkUploadedConcurrent(t *testing.T) {
	db := tempDB(t)

	const n = 50
	errs := make(chan error, n)

	for i := 0; i < n; i++ {
		path := fmt.Sprintf("/path/session-%d.jsonl", i)
		go func(p string) {
			errs <- db.MarkUploaded(p, "hash"+p, "claude", "")
		}(path)
	}

	for i := 0; i < n; i++ {
		if err := <-errs; err != nil {
			t.Errorf("concurrent MarkUploaded: %v", err)
		}
	}

	stats, err := db.Stats()
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}
	if stats.TrackedSessions != n {
		t.Errorf("TrackedSessions: got %d, want %d", stats.TrackedSessions, n)
	}
}
```

Add `"fmt"` to the imports in `watermark_test.go`.

- [ ] **Step 2.2: Run test to see it fail (race or SQLITE_BUSY)**

```bash
go test ./internal/watermark/... -run TestMarkUploadedConcurrent -race -v
```

Expected: FAIL — either `SQLITE_BUSY` errors or race detector report.

- [ ] **Step 2.3: Add `SetMaxOpenConns(1)` in `Open()`**

In `watermark.go`, add one line immediately after `sql.Open`:

```go
func Open(dbPath string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // serialize all writes through a single connection

	if _, err := db.Exec(`...existing schema...`); err != nil {
		db.Close()
		return nil, err
	}

	return &DB{db: db}, nil
}
```

- [ ] **Step 2.4: Confirm tests pass with race detector**

```bash
go test ./internal/watermark/... -race -v
```

Expected: all watermark tests PASS, race detector clean.

- [ ] **Step 2.5: Commit**

```bash
git add scanner/internal/watermark/watermark.go scanner/internal/watermark/watermark_test.go
git commit -m "fix(scanner): serialize SQLite writes via SetMaxOpenConns(1)"
```

---

### Task 3: Make `api.Client` goroutine-safe

**Files:**
- Modify: `scanner/internal/api/client.go`
- Modify: `scanner/internal/api/client_test.go`

The plan: add `mu sync.Mutex` (protects `token` and `refreshToken` field reads/writes) and `refreshOnce sync.Mutex` (serializes the 401→refresh→retry path). Add `getToken()` and `setTokens()` helpers. Update every existing access to these fields.

- [ ] **Step 3.1: Write failing concurrent-401 test**

Append to `client_test.go`:

```go
func TestConcurrentRefreshOnce(t *testing.T) {
	var refreshCalls atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/captures":
			if r.Header.Get("Authorization") == "Bearer old-token" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(UploadResponse{ID: "cap_ok", Status: "created"})
		case "/v1/auth/refresh":
			refreshCalls.Add(1)
			time.Sleep(10 * time.Millisecond) // simulate latency
			json.NewEncoder(w).Encode(LoginResponse{
				AccessToken:  "new-token",
				RefreshToken: "new-refresh",
			})
		}
	}))
	defer server.Close()

	client := New(server.URL, "old-token", "refresh-token", nil)
	client.RetryDelay = noDelay

	conv := &model.ExtractedConversation{
		SchemaVersion:    "1.0",
		ExtractorVersion: "scanner-0.1.0",
		Source:           model.Source{Platform: "claude", URL: "desktop"},
		Content: model.Content{
			Messages: []model.ExtractedMessage{{Role: "user", Content: "hi", Index: 0}},
		},
		Hashes: model.Hashes{ContentHash: "concurrent123"},
	}

	const goroutines = 8
	errs := make(chan error, goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			_, err := client.UploadCapture(conv)
			errs <- err
		}()
	}

	for i := 0; i < goroutines; i++ {
		if err := <-errs; err != nil {
			t.Errorf("UploadCapture: %v", err)
		}
	}

	if n := refreshCalls.Load(); n != 1 {
		t.Errorf("refresh calls: got %d, want exactly 1", n)
	}
}
```

- [ ] **Step 3.2: Run test to see it fail**

```bash
go test ./internal/api/... -run TestConcurrentRefreshOnce -race -v
```

Expected: FAIL — race detector reports data race on `c.token`.

- [ ] **Step 3.3: Add mutex fields and helpers to `Client`**

Add `"sync"` to imports. Update the `Client` struct — add two fields after `MaxRetries`:

```go
type Client struct {
	baseURL        string
	mu             sync.Mutex // protects token and refreshToken field reads/writes
	refreshOnce    sync.Mutex // serializes the 401 → refresh → retry path
	token          string
	refreshToken   string
	OnTokenRefresh func(accessToken, refreshToken string) error
	ReloginFn      func() (accessToken, refreshToken string, err error)
	httpClient     *http.Client
	MaxRetries     int
	RetryDelay     func(attempt int) time.Duration
}
```

Add helper methods after `New()`:

```go
func (c *Client) getToken() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.token
}

func (c *Client) setTokens(access, refresh string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.token = access
	c.refreshToken = refresh
}
```

- [ ] **Step 3.4: Update `Refresh()` to use helpers**

Replace the body of `Refresh()`:

```go
func (c *Client) Refresh() error {
	c.mu.Lock()
	rt := c.refreshToken
	c.mu.Unlock()

	if rt == "" {
		return fmt.Errorf("no refresh token available")
	}

	body, err := json.Marshal(RefreshRequest{RefreshToken: rt})
	if err != nil {
		return fmt.Errorf("marshal refresh request: %w", err)
	}

	resp, err := c.httpClient.Post(
		c.baseURL+"/v1/auth/refresh",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return fmt.Errorf("refresh request: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("refresh failed (status %d): %s", resp.StatusCode, respBody)
	}

	var result LoginResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return fmt.Errorf("decode refresh response: %w", err)
	}

	c.setTokens(result.AccessToken, result.RefreshToken)

	if c.OnTokenRefresh != nil {
		if err := c.OnTokenRefresh(result.AccessToken, result.RefreshToken); err != nil {
			log.Printf("warning: failed to persist refreshed tokens: %v", err)
		}
	}

	return nil
}
```

- [ ] **Step 3.5: Update `uploadCaptureBody()` to use `getToken()`**

Replace the direct `c.token` read with `c.getToken()`:

```go
func (c *Client) uploadCaptureBody(body []byte) (*UploadResponse, error) {
	var lastErr error
	for attempt := 0; attempt <= c.MaxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(c.RetryDelay(attempt))
		}

		req, err := http.NewRequest("POST", c.baseURL+"/v1/captures", bytes.NewReader(body))
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		if token := c.getToken(); token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("upload attempt %d: %w", attempt+1, err)
			continue
		}

		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
			var result UploadResponse
			if err := json.Unmarshal(respBody, &result); err != nil {
				return nil, fmt.Errorf("decode upload response: %w", err)
			}
			return &result, nil
		}

		if resp.StatusCode == http.StatusUnauthorized {
			return nil, ErrUnauthorized
		}

		if resp.StatusCode >= 500 {
			lastErr = fmt.Errorf("upload attempt %d: server error %d: %s", attempt+1, resp.StatusCode, respBody)
			continue
		}

		return nil, fmt.Errorf("upload failed (status %d): %s", resp.StatusCode, respBody)
	}

	return nil, fmt.Errorf("upload failed after %d retries: %w", c.MaxRetries, lastErr)
}
```

- [ ] **Step 3.6: Update `UploadCapture()` 401 path with double-check**

Replace the entire `UploadCapture` method:

```go
func (c *Client) UploadCapture(conv *model.ExtractedConversation) (*UploadResponse, error) {
	payload := conv.ToCaptureCreateRequest()

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal capture: %w", err)
	}

	result, err := c.uploadCaptureBody(body)
	if err == nil {
		return result, nil
	}

	if !errors.Is(err, ErrUnauthorized) {
		return nil, err
	}

	// Serialize the refresh path: only one goroutine refreshes at a time.
	tokenAtFailure := c.getToken()
	c.refreshOnce.Lock()
	defer c.refreshOnce.Unlock()

	// Double-check: another goroutine may have already refreshed while we waited.
	if c.getToken() != tokenAtFailure {
		return c.uploadCaptureBody(body)
	}

	c.mu.Lock()
	hasRefresh := c.refreshToken != ""
	c.mu.Unlock()

	if !hasRefresh {
		return nil, fmt.Errorf("token expired and no refresh token available")
	}

	if refreshErr := c.Refresh(); refreshErr != nil {
		if c.ReloginFn != nil {
			newAccess, newRefresh, reloginErr := c.ReloginFn()
			if reloginErr == nil {
				c.setTokens(newAccess, newRefresh)
				if c.OnTokenRefresh != nil {
					_ = c.OnTokenRefresh(newAccess, newRefresh)
				}
				return c.uploadCaptureBody(body)
			}
		}
		return nil, fmt.Errorf("token expired and refresh failed: %w", refreshErr)
	}
	return c.uploadCaptureBody(body)
}
```

- [ ] **Step 3.7: Run all api tests with race detector**

```bash
go test ./internal/api/... -race -v
```

Expected: all tests PASS, race detector clean, `TestConcurrentRefreshOnce` confirms refresh called exactly once.

- [ ] **Step 3.8: Commit**

```bash
git add scanner/internal/api/client.go scanner/internal/api/client_test.go
git commit -m "fix(scanner): make api.Client goroutine-safe with mutex-guarded token refresh"
```

---

### Task 4: Replace sequential loop with worker pool in `RunOnce()`

**Files:**
- Modify: `scanner/internal/scanner/scanner.go`
- Modify: `scanner/internal/scanner/scanner_test.go`

- [ ] **Step 4.1: Write failing concurrent test**

Append to `scanner_test.go`. First add `"fmt"` and `"sync"` to imports if not already present:

```go
func TestRunOnceConcurrent(t *testing.T) {
	var mu sync.Mutex
	var uploaded []string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/captures" {
			mu.Lock()
			uploaded = append(uploaded, "capture")
			mu.Unlock()
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"id": "cap_ok", "status": "created"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "state.db")
	claudeDir := filepath.Join(tmpDir, "claude-projects")

	// Create 20 completed sessions across 4 projects (5 each)
	for i := 0; i < 20; i++ {
		projDir := filepath.Join(claudeDir, fmt.Sprintf("proj-%d", i/5))
		os.MkdirAll(projDir, 0o755)
		content := fmt.Sprintf(
			"{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"q%d\"},\"timestamp\":\"2026-01-01T10:00:00Z\"}\n"+
				"{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"a%d\"}]},\"timestamp\":\"2026-01-01T10:00:01Z\"}\n",
			i, i,
		)
		sessionFile := filepath.Join(projDir, fmt.Sprintf("session-%03d.jsonl", i))
		os.WriteFile(sessionFile, []byte(content), 0o644)
		old := time.Now().Add(-20 * time.Minute)
		os.Chtimes(sessionFile, old, old)
	}

	cfg := config.Default()
	cfg.APIBaseURL = server.URL
	cfg.DBPath = dbPath
	cfg.Concurrency = 4

	s, err := NewScanner(cfg, "test-token", "", nil)
	if err != nil {
		t.Fatalf("NewScanner: %v", err)
	}
	defer s.Close()
	s.apiClient.RetryDelay = func(_ int) time.Duration { return 0 }
	s.toolPaths = []config.ToolPath{
		{Platform: "claude", BasePath: claudeDir, Format: "jsonl"},
	}

	if err := s.RunOnce(); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	if len(uploaded) != 20 {
		t.Errorf("uploaded: got %d, want 20", len(uploaded))
	}
}

func TestRunOnceErrorIsolation(t *testing.T) {
	var mu sync.Mutex
	var uploaded []string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/captures" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)

		// Reject uploads where title contains "fail"
		if content, ok := body["content"].(map[string]interface{}); ok {
			if title, ok := content["title"].(string); ok && title == "fail" {
				w.WriteHeader(http.StatusBadRequest)
				w.Write([]byte(`{"detail":"rejected"}`))
				return
			}
		}

		mu.Lock()
		uploaded = append(uploaded, "ok")
		mu.Unlock()
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": "cap_ok", "status": "created"})
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "state.db")
	claudeDir := filepath.Join(tmpDir, "claude-projects")
	projDir := filepath.Join(claudeDir, "proj")
	os.MkdirAll(projDir, 0o755)

	// 3 good sessions
	for i := 0; i < 3; i++ {
		content := fmt.Sprintf(
			"{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"q%d\"},\"timestamp\":\"2026-01-01T10:00:00Z\"}\n"+
				"{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"a%d\"}]},\"timestamp\":\"2026-01-01T10:00:01Z\"}\n"+
				"{\"type\":\"ai-title\",\"aiTitle\":\"good\",\"timestamp\":\"2026-01-01T10:00:02Z\"}\n",
			i, i,
		)
		sf := filepath.Join(projDir, fmt.Sprintf("good-%03d.jsonl", i))
		os.WriteFile(sf, []byte(content), 0o644)
		old := time.Now().Add(-20 * time.Minute)
		os.Chtimes(sf, old, old)
	}

	// 1 session whose content triggers a 400 on upload
	badContent := "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"bad\"},\"timestamp\":\"2026-01-01T10:00:00Z\"}\n" +
		"{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"bad\"}]},\"timestamp\":\"2026-01-01T10:00:01Z\"}\n" +
		"{\"type\":\"ai-title\",\"aiTitle\":\"fail\",\"timestamp\":\"2026-01-01T10:00:02Z\"}\n"
	badFile := filepath.Join(projDir, "bad-000.jsonl")
	os.WriteFile(badFile, []byte(badContent), 0o644)
	old := time.Now().Add(-20 * time.Minute)
	os.Chtimes(badFile, old, old)

	cfg := config.Default()
	cfg.APIBaseURL = server.URL
	cfg.DBPath = dbPath
	cfg.Concurrency = 2

	s, err := NewScanner(cfg, "test-token", "", nil)
	if err != nil {
		t.Fatalf("NewScanner: %v", err)
	}
	defer s.Close()
	s.apiClient.RetryDelay = func(_ int) time.Duration { return 0 }
	s.apiClient.MaxRetries = 0
	s.toolPaths = []config.ToolPath{
		{Platform: "claude", BasePath: claudeDir, Format: "jsonl"},
	}

	err = s.RunOnce()
	if err != nil {
		t.Fatalf("RunOnce should not return error even when sessions fail: %v", err)
	}

	if len(uploaded) != 3 {
		t.Errorf("successful uploads: got %d, want 3", len(uploaded))
	}
}
```

- [ ] **Step 4.2: Run tests to see them fail**

```bash
go test ./internal/scanner/... -run "TestRunOnceConcurrent|TestRunOnceErrorIsolation" -race -v
```

Expected: FAIL — tests compile but fail because `Config.Concurrency` is not yet used in `RunOnce()`.

- [ ] **Step 4.3: Rewrite `RunOnce()` with worker pool**

Add `"sync"` and `"sync/atomic"` to `scanner.go` imports. Replace the existing `RunOnce()` body:

```go
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
```

- [ ] **Step 4.4: Run all scanner tests with race detector**

```bash
go test ./internal/scanner/... -race -v
```

Expected: all tests PASS (including the original `TestScannerRunOnce`), race detector clean.

- [ ] **Step 4.5: Commit**

```bash
git add scanner/internal/scanner/scanner.go scanner/internal/scanner/scanner_test.go
git commit -m "feat(scanner): replace sequential RunOnce with bounded worker pool (default 8)"
```

---

### Task 5: Integration verification

**Files:** none — verification only

- [ ] **Step 5.1: Build the binary**

```bash
cd /Users/hong/John/ai/ai-mce/scanner
go build -o /tmp/mce-scanner-test ./cmd/mce-scanner
```

Expected: exit 0, no compile errors.

- [ ] **Step 5.2: Run full test suite**

```bash
go test ./... -v 2>&1 | tail -30
```

Expected: `ok` for every package.

- [ ] **Step 5.3: Run full test suite with race detector**

```bash
go test -race ./... 2>&1 | tail -20
```

Expected: `ok` for every package, no `DATA RACE` lines.

- [ ] **Step 5.4: Smoke-test the binary (optional — requires real API)**

```bash
/tmp/mce-scanner-test status
```

Expected: shows `auth:` and `tracked sessions:` without panic.

- [ ] **Step 5.5: Final commit if anything was missed**

```bash
go test -race ./... && git status
```

If clean: done. If uncommitted changes: `git add -p` and commit with an appropriate message.
