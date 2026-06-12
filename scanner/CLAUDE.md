# Scanner — Desktop Channel

Go binary running as macOS launchd daemon. Scans AI CLI tool sessions and uploads them as Captures to the API Server.

## Architecture

```
cmd/mce-scanner/     — Entry point, launchd daemon main loop
internal/
  parser/            — Per-tool session parsers (Claude Code, Codex, Grok, OpenCode)
  watermark/         — SQLite watermark database for incremental processing
  api/               — API Server client (auth + upload)
  config/            — Configuration loading
pkg/model/           — Shared data models (ExtractedConversation, etc.)
```

## Build & Run

```sh
go build -o mce-scanner ./cmd/mce-scanner
./mce-scanner          # one-shot scan
./mce-scanner daemon   # continuous scan (immediate first scan, then every MCE_SCAN_INTERVAL seconds, default 3600)
./mce-scanner login    # authenticate with API Server
./mce-scanner status   # show scan status
```

## Key Design Decisions

- **Pure scanner, no hooks** — reads each tool's session files directly, no dependency on tool hook systems
- **launchd WatchPaths** — triggered by file changes, not polling
- **Completed Sessions only** — 10 min no-modification threshold
- **Watermark DB** — `~/.mce-scanner/state.db`, tracks `{file_path, content_hash, last_uploaded_at}`
- **Independent auth** — own email/password login, same user account as browser extension
- **Retry 3x then persist** — failed uploads saved locally; in daemon mode the next tick naturally retries (failed sessions never get watermarked)
- **Daemon incremental scan** — `daemon` subcommand rescans periodically; sessions whose content_hash changed are re-uploaded in full and the cloud replaces the old version via `(user_id, source_platform, session_id)` matching
- **source_url = "desktop"** for all desktop Captures
- **platform** values: `claude`, `codex`, `grok`, `opencode`

## Supported Tools

| Tool | Storage Path | Format |
|---|---|---|
| Claude Code | `~/.claude/projects/{project}/` | JSONL |
| Codex | `~/.codex/sessions/YYYY/MM/DD/` | JSONL |
| Grok | `~/.grok/sessions/{path}/{session_id}/` | Multi-file (JSONL + JSON) |
| OpenCode | `~/.local/share/opencode/opencode.db` | SQLite |

## Conventions

- Use `go test ./...` to run all tests
- Use `golangci-lint run` for linting
- Prefer stdlib over third-party libraries where possible
- SQLite via `modernc.org/sqlite` (pure Go, no cgo)
