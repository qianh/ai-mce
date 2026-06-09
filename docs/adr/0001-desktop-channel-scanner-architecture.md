# Desktop Channel: Go scanner daemon over per-tool hooks

We need to collect AI conversations from desktop CLI tools (Claude Code, Codex, Grok, OpenCode) and upload them as Captures to the same API Server used by the browser extension. We decided on a standalone Go binary running as a macOS launchd daemon that scans each tool's session files, rather than writing hooks/plugins for each tool.

## Considered Options

**Per-tool hooks** (Claude Code SessionEnd hook, Codex hooks.json, etc.): Each tool that supports hooks gets a hook script that fires on session end and uploads the conversation. Rejected because: only some tools have hooks, each has a different hook API, and tools without hooks would need a fallback scanner anyway — resulting in two data paths and two sets of dedup logic.

**Hybrid** (hooks where available, scanner for the rest): Rejected for the same reason — two data paths double complexity for marginal latency gains.

**Go scanner daemon**: One process with per-tool parsers reads each tool's session storage directly. Triggered by launchd `WatchPaths` on the relevant directories. Tracks progress via a local SQLite watermark database. Chosen because it's tool-agnostic, requires zero integration with any tool's plugin system, and adding a new tool means adding one parser.

## Key decisions embedded in this choice

- **Go, not TypeScript or Python.** The scanner is a long-lived daemon doing file I/O, JSON/SQLite parsing, and HTTP uploads. Go compiles to a single binary with no runtime, ideal for launchd. TypeScript (Bun) would share types with the extension but couples a system daemon to a JS runtime. Python would share code with the API server but is heavier for a daemon.
- **launchd with WatchPaths, not polling.** macOS launchd can watch directories and only wake the process when files change, avoiding constant CPU/disk usage.
- **Only completed sessions.** A session is eligible for collection only after 10 minutes of no file modification. This avoids uploading partial conversations mid-session.
- **source_url = "desktop" for all desktop Captures.** Browser Captures carry the real page URL; desktop Captures use the fixed string "desktop". The `platform` field (e.g. `claude`, `codex`, `grok`, `opencode`) identifies the AI product in both channels.
- **Independent authentication.** The scanner authenticates with the API Server using its own credentials, not shared with the browser extension. Same user account, separate token.
- **Upload retry with local fallback.** 3 retries on failure, then persist the payload in the watermark SQLite for later retry.
