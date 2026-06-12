package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestDefaultConfig(t *testing.T) {
	cfg := Default()

	if cfg.APIBaseURL != "http://localhost:8008" {
		t.Errorf("APIBaseURL: got %q", cfg.APIBaseURL)
	}
	if cfg.DBPath == "" {
		t.Error("DBPath should not be empty")
	}
	if cfg.CompletionThresholdMin != 10 {
		t.Errorf("CompletionThresholdMin: got %d, want 10", cfg.CompletionThresholdMin)
	}
	if cfg.MaxRetries != 3 {
		t.Errorf("MaxRetries: got %d, want 3", cfg.MaxRetries)
	}
}

func TestConfigFromEnv(t *testing.T) {
	t.Setenv("MCE_API_BASE_URL", "https://api.example.com")
	t.Setenv("MCE_DB_PATH", "/tmp/test.db")

	cfg := FromEnv()

	if cfg.APIBaseURL != "https://api.example.com" {
		t.Errorf("APIBaseURL: got %q", cfg.APIBaseURL)
	}
	if cfg.DBPath != "/tmp/test.db" {
		t.Errorf("DBPath: got %q", cfg.DBPath)
	}
}

func TestConfigFromEnvDefaults(t *testing.T) {
	// Clear relevant env vars
	t.Setenv("MCE_API_BASE_URL", "")
	t.Setenv("MCE_DB_PATH", "")

	cfg := FromEnv()

	if cfg.APIBaseURL != "http://localhost:8008" {
		t.Errorf("APIBaseURL default: got %q", cfg.APIBaseURL)
	}
	if cfg.DBPath == "" {
		t.Error("DBPath should have default")
	}
}

func TestToolPaths(t *testing.T) {
	cfg := Default()
	paths := cfg.ToolPaths()

	if len(paths) != 4 {
		t.Fatalf("ToolPaths count: got %d, want 4", len(paths))
	}

	// Verify all 4 tools have entries
	found := map[string]bool{}
	for _, tp := range paths {
		found[tp.Platform] = true
	}

	for _, platform := range []string{"claude", "codex", "grok", "opencode"} {
		if !found[platform] {
			t.Errorf("missing platform: %s", platform)
		}
	}
}

func TestTokenPersistence(t *testing.T) {
	dir := t.TempDir()
	tokenPath := filepath.Join(dir, "token.json")

	cfg := Default()
	cfg.TokenPath = tokenPath

	// Save token
	err := cfg.SaveToken("test-access-token", "test-refresh-token")
	if err != nil {
		t.Fatalf("SaveToken: %v", err)
	}

	// Load token
	access, refresh, err := cfg.LoadToken()
	if err != nil {
		t.Fatalf("LoadToken: %v", err)
	}
	if access != "test-access-token" {
		t.Errorf("access token: got %q", access)
	}
	if refresh != "test-refresh-token" {
		t.Errorf("refresh token: got %q", refresh)
	}
}

func TestLoadTokenNotExist(t *testing.T) {
	cfg := Default()
	cfg.TokenPath = "/nonexistent/token.json"

	_, _, err := cfg.LoadToken()
	if err == nil {
		t.Error("expected error for nonexistent token file")
	}
}

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

func TestScanIntervalDefault(t *testing.T) {
	t.Setenv("MCE_SCAN_INTERVAL", "")
	cfg := FromEnv()
	if cfg.ScanInterval != 3600*time.Second {
		t.Errorf("ScanInterval default: got %v, want 1h", cfg.ScanInterval)
	}
}

func TestScanIntervalFromEnv(t *testing.T) {
	t.Setenv("MCE_SCAN_INTERVAL", "300")
	cfg := FromEnv()
	if cfg.ScanInterval != 300*time.Second {
		t.Errorf("ScanInterval from env: got %v, want 5m", cfg.ScanInterval)
	}
}

func TestScanIntervalInvalidEnv(t *testing.T) {
	for _, bad := range []string{"abc", "0", "-5"} {
		t.Setenv("MCE_SCAN_INTERVAL", bad)
		cfg := FromEnv()
		if cfg.ScanInterval != 3600*time.Second {
			t.Errorf("MCE_SCAN_INTERVAL=%q should fall back to 1h, got %v", bad, cfg.ScanInterval)
		}
	}
}

func TestTokenFilePermissions(t *testing.T) {
	dir := t.TempDir()
	tokenPath := filepath.Join(dir, "token.json")

	cfg := Default()
	cfg.TokenPath = tokenPath

	_ = cfg.SaveToken("a", "b")

	info, err := os.Stat(tokenPath)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}

	perm := info.Mode().Perm()
	if perm != 0o600 {
		t.Errorf("token file permissions: got %o, want 600", perm)
	}
}
