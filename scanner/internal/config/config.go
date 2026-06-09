package config

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	APIBaseURL             string
	DBPath                 string
	TokenPath              string
	CredsPath              string
	CompletionThresholdMin int
	MaxRetries             int
	Concurrency            int
}

type ToolPath struct {
	Platform string
	BasePath string
	Format   string // "jsonl", "multi-file", "sqlite"
}

type tokenFile struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type credsFile struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

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

func FromEnv() Config {
	cfg := Default()

	if v := os.Getenv("MCE_API_BASE_URL"); v != "" {
		cfg.APIBaseURL = v
	}
	if v := os.Getenv("MCE_DB_PATH"); v != "" {
		cfg.DBPath = v
	}
	if v := os.Getenv("MCE_CONCURRENCY"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.Concurrency = n
		} else {
			log.Printf("warning: invalid MCE_CONCURRENCY %q, using default %d", v, cfg.Concurrency)
		}
	}

	return cfg
}

func (c *Config) ToolPaths() []ToolPath {
	home, _ := os.UserHomeDir()

	return []ToolPath{
		{
			Platform: "claude",
			BasePath: filepath.Join(home, ".claude", "projects"),
			Format:   "jsonl",
		},
		{
			Platform: "codex",
			BasePath: filepath.Join(home, ".codex", "sessions"),
			Format:   "jsonl",
		},
		{
			Platform: "grok",
			BasePath: filepath.Join(home, ".grok", "sessions"),
			Format:   "multi-file",
		},
		{
			Platform: "opencode",
			BasePath: filepath.Join(home, ".local", "share", "opencode", "opencode.db"),
			Format:   "sqlite",
		},
	}
}

func saveJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func loadJSON(path string, v any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

func (c *Config) SaveToken(accessToken, refreshToken string) error {
	return saveJSON(c.TokenPath, tokenFile{AccessToken: accessToken, RefreshToken: refreshToken})
}

func (c *Config) SaveCredentials(email, password string) error {
	return saveJSON(c.CredsPath, credsFile{Email: email, Password: password})
}

func (c *Config) LoadToken() (accessToken, refreshToken string, err error) {
	var tf tokenFile
	if err := loadJSON(c.TokenPath, &tf); err != nil {
		return "", "", err
	}
	return tf.AccessToken, tf.RefreshToken, nil
}

func (c *Config) LoadCredentials() (email, password string, err error) {
	var cf credsFile
	if err := loadJSON(c.CredsPath, &cf); err != nil {
		return "", "", err
	}
	return cf.Email, cf.Password, nil
}
