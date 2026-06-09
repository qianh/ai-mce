package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/mce/scanner/pkg/model"
)

func noDelay(_ int) time.Duration { return 0 }

func TestClientLogin(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/auth/login" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != "POST" {
			t.Errorf("unexpected method: %s", r.Method)
		}

		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		json.NewDecoder(r.Body).Decode(&body)

		if body.Email != "test@example.com" || body.Password != "pass123" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		json.NewEncoder(w).Encode(LoginResponse{
			AccessToken:  "access-token-123",
			RefreshToken: "refresh-token-456",
		})
	}))
	defer server.Close()

	client := New(server.URL, "", "", nil)

	resp, err := client.Login("test@example.com", "pass123")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if resp.AccessToken != "access-token-123" {
		t.Errorf("access_token: got %q", resp.AccessToken)
	}
	if resp.RefreshToken != "refresh-token-456" {
		t.Errorf("refresh_token: got %q", resp.RefreshToken)
	}
}

func TestClientLoginUnauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"detail":"Invalid credentials"}`))
	}))
	defer server.Close()

	client := New(server.URL, "", "", nil)
	_, err := client.Login("bad@example.com", "wrong")
	if err == nil {
		t.Error("expected error for unauthorized login")
	}
}

func TestClientUploadCapture(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/captures" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Errorf("missing auth header")
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("content-type: got %q", r.Header.Get("Content-Type"))
		}

		var body model.CaptureCreateRequest
		json.NewDecoder(r.Body).Decode(&body)

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(UploadResponse{
			ID:     "cap_001",
			Status: "created",
		})
	}))
	defer server.Close()

	client := New(server.URL, "test-token", "", nil)

	conv := &model.ExtractedConversation{
		SchemaVersion:    "1.0",
		ExtractorVersion: "scanner-0.1.0",
		Source:           model.Source{Platform: "claude", URL: "desktop"},
		Content: model.Content{
			Title:    "Test",
			Messages: []model.ExtractedMessage{{Role: "user", Content: "hello", Index: 0}},
		},
		Hashes: model.Hashes{ContentHash: "abc123", SourceFingerprint: "claude:desktop"},
	}

	resp, err := client.UploadCapture(conv)
	if err != nil {
		t.Fatalf("UploadCapture: %v", err)
	}
	if resp.ID != "cap_001" {
		t.Errorf("capture id: got %q", resp.ID)
	}
}

func TestClientUploadCaptureRetry(t *testing.T) {
	var attempts atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := attempts.Add(1)
		if n < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(UploadResponse{ID: "cap_retry", Status: "created"})
	}))
	defer server.Close()

	client := New(server.URL, "test-token", "", nil)
	client.MaxRetries = 3
	client.RetryDelay = noDelay

	conv := &model.ExtractedConversation{
		SchemaVersion:    "1.0",
		ExtractorVersion: "scanner-0.1.0",
		Source:           model.Source{Platform: "claude", URL: "desktop"},
		Content: model.Content{
			Messages: []model.ExtractedMessage{{Role: "user", Content: "hi", Index: 0}},
		},
		Hashes: model.Hashes{ContentHash: "retry123"},
	}

	resp, err := client.UploadCapture(conv)
	if err != nil {
		t.Fatalf("UploadCapture with retry: %v", err)
	}
	if resp.ID != "cap_retry" {
		t.Errorf("capture id: got %q", resp.ID)
	}
	if attempts.Load() != 3 {
		t.Errorf("attempts: got %d, want 3", attempts.Load())
	}
}

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
			time.Sleep(10 * time.Millisecond)
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

func TestClientUploadCaptureAllRetriesFail(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	client := New(server.URL, "test-token", "", nil)
	client.MaxRetries = 2
	client.RetryDelay = noDelay

	conv := &model.ExtractedConversation{
		SchemaVersion:    "1.0",
		ExtractorVersion: "scanner-0.1.0",
		Source:           model.Source{Platform: "claude", URL: "desktop"},
		Content: model.Content{
			Messages: []model.ExtractedMessage{{Role: "user", Content: "hi", Index: 0}},
		},
		Hashes: model.Hashes{ContentHash: "fail123"},
	}

	_, err := client.UploadCapture(conv)
	if err == nil {
		t.Error("expected error after all retries exhausted")
	}
}
