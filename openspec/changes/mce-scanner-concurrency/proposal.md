## Why

`RunOnce()` processes sessions in a pure sequential loop — with 4,000+ Completed Sessions, each HTTP upload blocks until done, making a single scan take tens of minutes. Worker-pool concurrency turns this into a sub-minute operation.

## What Changes

- `scanner/internal/scanner/scanner.go`: Replace sequential loop with a fixed-size worker pool; add periodic progress logging every 100 sessions
- `scanner/internal/config/config.go`: Add `Concurrency int` field; read from `MCE_CONCURRENCY` env var, default 8
- `scanner/internal/watermark/watermark.go`: Call `db.SetMaxOpenConns(1)` after open to serialize concurrent SQLite writes
- `scanner/internal/api/client.go`: Add `refreshMu sync.Mutex` + double-check pattern to prevent concurrent token-refresh races

## Capabilities

### New Capabilities

- `scanner-concurrency`: Parallel session processing via a configurable worker pool with safe SQLite and token-refresh handling

### Modified Capabilities

<!-- No existing spec-level behavior changes — this is a performance implementation detail that does not alter the Scanner's externally observable contract -->

## Impact

- **scanner/** only — zero changes to api-server, console, or extension
- `POST /v1/captures` receives burst concurrent uploads; already idempotent via `Idempotency-Key`, no server change needed
- Watermark Database write throughput unchanged; single-connection serialization maintains correctness
- `go test -race ./...` must pass after change
