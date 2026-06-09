## Context

The Scanner's `RunOnce()` method discovers all Completed Sessions across all platforms, then processes them in a pure sequential `for` loop: parse → watermark check → HTTP upload → mark uploaded. With 4,000+ sessions and each upload taking 0.5–2 s over localhost or WAN, a full scan takes tens of minutes.

Three structural problems exist today that block safe concurrency:

1. **Sequential loop** — `scanner.go:RunOnce()` — no parallelism at all.
2. **SQLite write races** — `watermark.DB` opens with default connection pool settings. Concurrent `MarkUploaded` calls from multiple goroutines will hit `SQLITE_BUSY` without serialization.
3. **Token refresh races** — `api.Client.token` / `refreshToken` are plain string fields. Concurrent 401 responses trigger concurrent `Refresh()` calls, creating a data race (`-race` detectable).

## Goals / Non-Goals

**Goals:**
- Replace sequential loop with a bounded worker pool
- Make `Concurrency` configurable via `MCE_CONCURRENCY` env var (default 8)
- Eliminate SQLite write contention
- Eliminate token refresh data race
- Emit periodic progress logs (every 100 sessions processed)
- All existing tests pass; `go test -race ./...` passes

**Non-Goals:**
- API Server changes (already idempotent)
- Rate limiting or back-pressure to API Server
- Preserving session processing order
- Progress bar / TUI output
- Retry-queue concurrency (pending_uploads replay stays sequential)

## Decisions

### D1 — Bounded worker pool over goroutine-per-session

**Chosen:** `errgroup` (or plain `sync.WaitGroup` + channel) with `Concurrency` workers consuming a session channel.

**Alternatives:**
- Goroutine per session: simpler code, but 4,000 goroutines × 30 s HTTP timeout = unbounded memory and fd exhaustion.
- `semaphore.Weighted`: viable, but adds an external dependency (`golang.org/x/sync`); a channel-based pool is stdlib-only.

**Rationale:** Bounded pool matches the I/O-bound profile, keeps memory flat, and uses no new dependencies.

### D2 — `SetMaxOpenConns(1)` for SQLite write safety

**Chosen:** Call `db.SetMaxOpenConns(1)` immediately after `sql.Open` in `watermark.Open()`.

**Alternatives:**
- WAL mode (`?_journal=WAL`): enables concurrent readers; unnecessary here since read operations (IsProcessed) are fast and infrequent.
- `sync.RWMutex` in `watermark.DB`: explicit, but adds lock boilerplate to every method and is error-prone.

**Rationale:** Single connection forces `database/sql` to serialize all DB calls at the driver level — zero application code changes in callers.

### D3 — `sync.Mutex` + double-check for token refresh

**Chosen:** Add `refreshMu sync.Mutex` to `api.Client`. In `UploadCapture`, after receiving 401, lock before calling `Refresh()`. Inside the lock, re-check whether the token has already been updated by a concurrent goroutine (double-check pattern) before actually calling the auth endpoint.

**Alternatives:**
- `sync.Once` per scan: too coarse — if the token expires mid-scan it can only refresh once.
- Channel-serialized refresh: overcomplicated; a mutex with double-check is idiomatic Go.

**Rationale:** Minimal change to `client.go`; allows re-refresh if the token expires again later in the same scan.

### D4 — Progress logging via atomic counter

**Chosen:** `sync/atomic` counter incremented by each worker goroutine. A dedicated progress-reporter goroutine reads the counter every N completions (not time-based) and calls `log.Printf`.

**Rationale:** Lock-free counter avoids contention; logging from a single goroutine prevents interleaved output.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Burst of 8 concurrent uploads may overwhelm local API Server | Default 8 is conservative; user can set `MCE_CONCURRENCY=1` to revert to serial |
| `SetMaxOpenConns(1)` serializes DB reads too, slightly reducing read concurrency | Watermark reads (IsProcessed) are microsecond SQLite lookups — negligible bottleneck vs. HTTP |
| Double-check token refresh adds complexity vs. single-threaded path | Pattern is well-known in Go; will be unit-tested |

## Migration Plan

- Drop-in replacement: `RunOnce()` signature unchanged, no config file format change
- Existing `MCE_*` env vars unaffected; `MCE_CONCURRENCY` is additive
- Rollback: revert the 4 changed files; no persistent state modified
