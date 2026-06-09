## ADDED Requirements

### Requirement: Configurable worker pool for session processing
The Scanner SHALL process Completed Sessions concurrently using a bounded worker pool whose size is determined by `Config.Concurrency`. The worker count SHALL be readable from the `MCE_CONCURRENCY` environment variable. When `MCE_CONCURRENCY` is not set, the Scanner SHALL default to 8 workers.

#### Scenario: Default concurrency when env var absent
- **WHEN** `MCE_CONCURRENCY` is not set in the environment
- **THEN** `Config.Concurrency` is 8

#### Scenario: Custom concurrency via env var
- **WHEN** `MCE_CONCURRENCY=4` is set in the environment
- **THEN** `Config.Concurrency` is 4 and `RunOnce()` uses exactly 4 worker goroutines

#### Scenario: All sessions processed exactly once
- **WHEN** `RunOnce()` completes with N discovered sessions and a worker pool of size W
- **THEN** each session is processed exactly once, regardless of N and W

### Requirement: Safe concurrent SQLite writes
The Watermark Database SHALL serialize all write operations under concurrent access without returning `SQLITE_BUSY` errors or corrupting data.

#### Scenario: Concurrent MarkUploaded calls succeed
- **WHEN** multiple goroutines call `MarkUploaded` simultaneously for different file paths
- **THEN** all writes succeed and all rows appear correctly in the database

#### Scenario: IsProcessed read under concurrent writes
- **WHEN** a goroutine calls `IsProcessed` while another goroutine is executing `MarkUploaded`
- **THEN** `IsProcessed` returns without error and with a consistent result

### Requirement: Race-free token refresh
The API client SHALL ensure that at most one token refresh request is in flight at any time. Goroutines that receive a 401 while a refresh is already in progress SHALL wait for the refresh to complete and then retry with the updated token — without issuing a second refresh request.

#### Scenario: Concurrent 401 responses trigger single refresh
- **WHEN** two goroutines receive 401 simultaneously
- **THEN** exactly one `POST /v1/auth/refresh` request is made
- **THEN** both goroutines retry their upload with the refreshed token

#### Scenario: No data race on token fields under -race
- **WHEN** `RunOnce()` is executed with 8 workers and `go test -race` is active
- **THEN** the race detector reports no data races on `Client.token` or `Client.refreshToken`

### Requirement: Periodic progress logging
The Scanner SHALL emit a progress log line after every 100 sessions have been processed, and a final summary line when `RunOnce()` completes.

#### Scenario: Progress logged at 100-session intervals
- **WHEN** 100 sessions have been processed since the last progress log (or since the start)
- **THEN** a line matching `processed \d+/\d+ sessions` is written to the log

#### Scenario: Final summary on completion
- **WHEN** `RunOnce()` finishes processing all sessions
- **THEN** a line matching `scan complete: \d+ sessions` is written to the log

### Requirement: Per-session error isolation
The Scanner SHALL continue processing remaining sessions when an individual session fails. A failure in one session SHALL NOT prevent other sessions from being processed.

#### Scenario: Parse error on one session
- **WHEN** the Parser for a session returns an error
- **THEN** the error is logged with the session file path and platform
- **THEN** other sessions in the pool continue to be processed

#### Scenario: Upload failure on one session
- **WHEN** `UploadCapture` returns an error for a session
- **THEN** the payload is saved to pending_uploads (existing behavior)
- **THEN** other sessions in the pool continue to be processed
