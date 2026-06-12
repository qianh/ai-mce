package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/mce/scanner/internal/api"
	"github.com/mce/scanner/internal/config"
	"github.com/mce/scanner/internal/scanner"
	"github.com/mce/scanner/internal/watermark"
)

func main() {
	if len(os.Args) < 2 {
		runScan()
		return
	}

	switch os.Args[1] {
	case "daemon":
		runDaemon()
	case "login":
		runLogin()
	case "status":
		runStatus()
	case "help":
		printUsage()
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}
}

func autoLogin(cfg config.Config) (accessToken, refreshToken string) {
	email, password, err := cfg.LoadCredentials()
	if err != nil {
		fmt.Fprintln(os.Stderr, "not logged in. Run: mce-scanner login")
		os.Exit(1)
	}
	apiClient := api.New(cfg.APIBaseURL, "", "", nil)
	resp, err := apiClient.Login(email, password)
	if err != nil {
		fmt.Fprintf(os.Stderr, "auto-login failed: %v\n", err)
		os.Exit(1)
	}
	if err := cfg.SaveToken(resp.AccessToken, resp.RefreshToken); err != nil {
		fmt.Fprintf(os.Stderr, "save token: %v\n", err)
		os.Exit(1)
	}
	return resp.AccessToken, resp.RefreshToken
}

func newScannerFromEnv() *scanner.Scanner {
	cfg := config.FromEnv()

	accessToken, refreshToken, err := cfg.LoadToken()
	if err != nil {
		accessToken, refreshToken = autoLogin(cfg)
	}

	s, err := scanner.NewScanner(cfg, accessToken, refreshToken, cfg.SaveToken)
	if err != nil {
		fmt.Fprintf(os.Stderr, "init scanner: %v\n", err)
		os.Exit(1)
	}

	// If saved credentials are available, let the scanner re-login automatically
	// when the refresh token is stale (e.g. after a server restart or race condition).
	if email, password, credsErr := cfg.LoadCredentials(); credsErr == nil {
		s.SetReloginFn(func() (string, string, error) {
			resp, loginErr := api.New(cfg.APIBaseURL, "", "", nil).Login(email, password)
			if loginErr != nil {
				return "", "", loginErr
			}
			return resp.AccessToken, resp.RefreshToken, nil
		})
	}

	return s
}

func runScan() {
	s := newScannerFromEnv()
	defer s.Close()

	if err := s.RunOnce(); err != nil {
		fmt.Fprintf(os.Stderr, "scan error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("scan complete")
}

func runDaemon() {
	s := newScannerFromEnv()
	defer s.Close()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg := config.FromEnv()
	fmt.Printf("daemon started: scanning every %v\n", cfg.ScanInterval)

	if err := s.RunLoop(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "daemon error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("daemon stopped")
}

func runLogin() {
	cfg := config.FromEnv()

	reader := bufio.NewReader(os.Stdin)
	fmt.Print("Email: ")
	email, _ := reader.ReadString('\n')
	email = strings.TrimSpace(email)

	fmt.Print("Password: ")
	password, _ := reader.ReadString('\n')
	password = strings.TrimSpace(password)

	apiClient := api.New(cfg.APIBaseURL, "", "", nil)
	resp, err := apiClient.Login(email, password)
	if err != nil {
		fmt.Fprintf(os.Stderr, "login failed: %v\n", err)
		os.Exit(1)
	}

	if err := cfg.SaveToken(resp.AccessToken, resp.RefreshToken); err != nil {
		fmt.Fprintf(os.Stderr, "save token: %v\n", err)
		os.Exit(1)
	}
	if err := cfg.SaveCredentials(email, password); err != nil {
		fmt.Fprintf(os.Stderr, "save credentials: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("login successful")
}

func runStatus() {
	cfg := config.FromEnv()

	_, _, err := cfg.LoadToken()
	if err != nil {
		fmt.Println("auth: not logged in")
	} else {
		fmt.Println("auth: logged in")
	}

	db, err := watermark.Open(cfg.DBPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "open db: %v\n", err)
		return
	}
	defer db.Close()

	stats, err := db.Stats()
	if err != nil {
		fmt.Fprintf(os.Stderr, "stats: %v\n", err)
		return
	}

	fmt.Printf("tracked sessions: %d\n", stats.TrackedSessions)
	fmt.Printf("skipped sessions: %d\n", stats.SkippedSessions)
	fmt.Printf("pending retries:  %d\n", stats.PendingRetries)
}

func printUsage() {
	fmt.Println(`Usage: mce-scanner [command]

Commands:
  (none)    Run one-shot scan of all AI tool sessions
  daemon    Run continuously, rescanning every MCE_SCAN_INTERVAL seconds (default 3600)
  login     Authenticate with the Memory API
  status    Show scan status and statistics
  help      Show this help message`)
}
