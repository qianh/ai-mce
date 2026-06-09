package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/mce/scanner/pkg/model"
)

// ErrUnauthorized is returned when the server responds with 401.
var ErrUnauthorized = errors.New("unauthorized")

type Client struct {
	baseURL        string
	token          string
	refreshToken   string
	OnTokenRefresh func(accessToken, refreshToken string) error
	httpClient     *http.Client
	MaxRetries     int
	RetryDelay     func(attempt int) time.Duration
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type UploadResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func New(baseURL, token, refreshToken string, onTokenRefresh func(accessToken, refreshToken string) error) *Client {
	return &Client{
		baseURL:        baseURL,
		token:          token,
		refreshToken:   refreshToken,
		OnTokenRefresh: onTokenRefresh,
		httpClient:     &http.Client{Timeout: 30 * time.Second},
		MaxRetries:     3,
		RetryDelay:     defaultRetryDelay,
	}
}

func (c *Client) Refresh() error {
	if c.refreshToken == "" {
		return fmt.Errorf("no refresh token available")
	}

	body, err := json.Marshal(RefreshRequest{RefreshToken: c.refreshToken})
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

	c.token = result.AccessToken
	c.refreshToken = result.RefreshToken

	if c.OnTokenRefresh != nil {
		if err := c.OnTokenRefresh(result.AccessToken, result.RefreshToken); err != nil {
			log.Printf("warning: failed to persist refreshed tokens: %v", err)
		}
	}

	return nil
}

func (c *Client) Login(email, password string) (*LoginResponse, error) {
	body, err := json.Marshal(LoginRequest{Email: email, Password: password})
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Post(
		c.baseURL+"/v1/auth/login",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("login request: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("login failed (status %d): %s", resp.StatusCode, respBody)
	}

	var result LoginResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("decode login response: %w", err)
	}

	return &result, nil
}

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

	// On 401, try once to refresh the token and retry.
	if errors.Is(err, ErrUnauthorized) && c.refreshToken != "" {
		if refreshErr := c.Refresh(); refreshErr != nil {
			return nil, fmt.Errorf("token expired and refresh failed: %w", refreshErr)
		}
		return c.uploadCaptureBody(body)
	}

	return nil, err
}

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
		if c.token != "" {
			req.Header.Set("Authorization", "Bearer "+c.token)
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

func defaultRetryDelay(attempt int) time.Duration {
	delays := []time.Duration{
		30 * time.Second,
		2 * time.Minute,
		10 * time.Minute,
	}
	if attempt-1 < len(delays) {
		return delays[attempt-1]
	}
	return delays[len(delays)-1]
}
