## 1. Config — Concurrency Field

- [ ] 1.1 Add `Concurrency int` field to `Config` struct in `config.go`
- [ ] 1.2 Set `Concurrency: 8` in `Default()` function
- [ ] 1.3 Read `MCE_CONCURRENCY` env var in `FromEnv()` and parse to int; log warning and use default on invalid value
- [ ] 1.4 Add test: `MCE_CONCURRENCY` absent → Concurrency is 8
- [ ] 1.5 Add test: `MCE_CONCURRENCY=4` set → Concurrency is 4
- [ ] 1.6 Add test: `MCE_CONCURRENCY=invalid` set → Concurrency falls back to default

## 2. Watermark DB — Single Connection

- [ ] 2.1 Call `db.SetMaxOpenConns(1)` in `watermark.Open()` immediately after `sql.Open`
- [ ] 2.2 Add test: concurrent `MarkUploaded` calls for different paths all succeed without error

## 3. API Client — Token Refresh Safety

- [ ] 3.1 Add `refreshMu sync.Mutex` field to `api.Client` struct in `client.go`
- [ ] 3.2 Wrap the token-refresh + retry block in `UploadCapture` with `refreshMu.Lock()` / `Unlock()`
- [ ] 3.3 Add double-check: after acquiring lock, compare current token to the token at time of 401; skip `Refresh()` if token already changed
- [ ] 3.4 Add test: two goroutines receive 401 simultaneously → exactly one `Refresh()` call is made
- [ ] 3.5 Verify `go test -race ./scanner/internal/api/...` passes with no race reports

## 4. Scanner — Worker Pool

- [ ] 4.1 Add `sync/atomic` processed-count variable at top of `RunOnce()`
- [ ] 4.2 Create a `sessions` channel, launch `cfg.Concurrency` worker goroutines consuming from it
- [ ] 4.3 Feed all discovered sessions into the channel from the main goroutine; close channel when done
- [ ] 4.4 Each worker: call `processSession`, increment atomic counter, log error on failure (preserve existing error-log format)
- [ ] 4.5 After atomic increment, if `count % 100 == 0` log `"processed %d/%d sessions..."` with total
- [ ] 4.6 Wait for all workers to finish (WaitGroup), then log `"scan complete: %d sessions"` with total count
- [ ] 4.7 Add test: 200 fake sessions with concurrency 8 → all processed exactly once
- [ ] 4.8 Add test: one session returns error → remaining sessions still processed
- [ ] 4.9 Verify `go test -race ./scanner/...` passes

## 5. Integration Verification

- [ ] 5.1 Run `go build ./scanner/...` — no compile errors
- [ ] 5.2 Run `go test ./scanner/...` — all tests pass
- [ ] 5.3 Run `go test -race ./scanner/...` — race detector clean
- [ ] 5.4 Run `./mce-scanner` against local data (or dry-run) and confirm progress lines appear
