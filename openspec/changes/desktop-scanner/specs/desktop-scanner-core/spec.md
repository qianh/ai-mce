## ADDED Requirements

### Requirement: Scanner CLI entry point
The `mce-scanner` binary SHALL support three subcommands: `scan` (default, one-shot scan cycle), `login` (authenticate with API Server), `status` (show watermark DB statistics).

#### Scenario: Default scan invocation
- **WHEN** `mce-scanner` is invoked without subcommand
- **THEN** it SHALL execute a single scan cycle (discover → check → parse → upload) and exit

#### Scenario: Login subcommand
- **WHEN** `mce-scanner login` is invoked
- **THEN** it SHALL prompt for email and password, authenticate with the API Server, and persist tokens to `~/.mce-scanner/auth.json`

#### Scenario: Status subcommand
- **WHEN** `mce-scanner status` is invoked
- **THEN** it SHALL print the number of tracked sessions, pending retries, and last scan timestamp from the watermark DB

### Requirement: Session discovery
The Scanner SHALL discover sessions from all 4 supported tools by walking their known storage paths.

#### Scenario: Discover Claude Code sessions
- **WHEN** Scanner scans `~/.claude/projects/`
- **THEN** it SHALL find all `*.jsonl` files (excluding directories and non-session files) as candidate sessions

#### Scenario: Discover Codex sessions
- **WHEN** Scanner scans `~/.codex/sessions/`
- **THEN** it SHALL recursively find all `rollout-*.jsonl` files as candidate sessions

#### Scenario: Discover Grok sessions
- **WHEN** Scanner scans `~/.grok/sessions/`
- **THEN** it SHALL find all directories containing a `chat_history.jsonl` file as candidate sessions

#### Scenario: Discover OpenCode sessions
- **WHEN** Scanner queries `~/.local/share/opencode/opencode.db`
- **THEN** it SHALL read the `session` table to discover all session IDs as candidates

#### Scenario: Missing tool directory
- **WHEN** a tool's storage path does not exist
- **THEN** Scanner SHALL skip that tool silently and continue with others

### Requirement: Completed Session detection
The Scanner SHALL only process sessions whose files have not been modified for at least 10 minutes.

#### Scenario: Session still active
- **WHEN** a session file's mtime is less than 10 minutes ago
- **THEN** Scanner SHALL skip it and process it in a future scan cycle

#### Scenario: Session completed
- **WHEN** a session file's mtime is more than 10 minutes ago
- **THEN** Scanner SHALL proceed with parsing and uploading

#### Scenario: Grok multi-file session completion
- **WHEN** a Grok session directory is evaluated
- **THEN** Scanner SHALL use the most recent mtime among all files in that directory as the session's last modification time

### Requirement: launchd integration
The Scanner SHALL provide a launchd plist file that triggers the scan binary via WatchPaths.

#### Scenario: WatchPaths configuration
- **WHEN** the plist is loaded via `launchctl load`
- **THEN** launchd SHALL trigger `mce-scanner` whenever files change in `~/.claude/projects`, `~/.codex/sessions`, `~/.grok/sessions`, or `~/.local/share/opencode`

#### Scenario: Crash recovery
- **WHEN** `mce-scanner` crashes during a scan
- **THEN** launchd SHALL restart it on the next WatchPaths trigger (KeepAlive is NOT set; it runs per-trigger)

### Requirement: Scan cycle idempotency
A scan cycle SHALL be safe to run multiple times without producing duplicate uploads.

#### Scenario: Re-run after successful scan
- **WHEN** Scanner runs again after a successful scan with no new sessions
- **THEN** it SHALL find all sessions already in the watermark DB, skip them, and exit with zero uploads
