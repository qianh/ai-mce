## ADDED Requirements

### Requirement: Parser interface
All parsers SHALL implement a common `Parser` interface that accepts a session path and returns an `ExtractedConversation` struct or an error.

#### Scenario: Successful parse
- **WHEN** a Parser is given a valid session path
- **THEN** it SHALL return an `ExtractedConversation` with all required fields populated

#### Scenario: Corrupted session file
- **WHEN** a Parser encounters malformed JSON or corrupted data
- **THEN** it SHALL return an error with the file path and parse failure reason, without crashing the scan cycle

### Requirement: Claude Code parser
The Claude Code parser SHALL read a single JSONL session file and extract user/assistant messages.

#### Scenario: Parse Claude Code session
- **WHEN** given a JSONL file from `~/.claude/projects/{project}/{uuid}.jsonl`
- **THEN** it SHALL extract messages with `type: "human"` or `type: "assistant"`, map them to `role: "user"` / `role: "assistant"`, set `platform: "claude"`, `source_url: "desktop"`, and derive the title from the first user message (truncated to 100 chars)

#### Scenario: Skip non-message lines
- **WHEN** a JSONL line has `type: "mode"`, `type: "file-history-snapshot"`, or `type: "attachment"`
- **THEN** the parser SHALL skip it without error

#### Scenario: Extract session metadata
- **WHEN** parsing a Claude Code session
- **THEN** the parser SHALL set `metadata.conversation_id` to the filename UUID and `metadata.model_name` from message metadata if available

### Requirement: Codex parser
The Codex parser SHALL read a single JSONL session file containing session_meta and event records.

#### Scenario: Parse Codex session
- **WHEN** given a JSONL file from `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`
- **THEN** it SHALL extract the `session_meta` line for session ID and cwd, then extract `response_item` lines with `role: "user"` or `role: "assistant"`, set `platform: "codex"`, `source_url: "desktop"`

#### Scenario: Extract Codex title
- **WHEN** parsing a Codex session
- **THEN** it SHALL derive title from the `session_meta.payload.id` or the first user message text (truncated to 100 chars)

### Requirement: Grok parser
The Grok parser SHALL read a multi-file session directory containing chat_history.jsonl and summary.json.

#### Scenario: Parse Grok session
- **WHEN** given a directory containing `chat_history.jsonl` and `summary.json`
- **THEN** it SHALL extract messages from `chat_history.jsonl` (type: user/assistant/system), set `platform: "grok"`, `source_url: "desktop"`, and use `summary.json`'s `generated_title` or `session_summary` as the conversation title

#### Scenario: Missing summary.json
- **WHEN** `summary.json` is missing but `chat_history.jsonl` exists
- **THEN** the parser SHALL still parse messages and derive title from the first user message

### Requirement: OpenCode parser
The OpenCode parser SHALL read sessions from a SQLite database.

#### Scenario: Parse OpenCode session
- **WHEN** given a session ID from `~/.local/share/opencode/opencode.db`
- **THEN** it SHALL query `message` and `part` tables for that session, reconstruct messages in order, set `platform: "opencode"`, `source_url: "desktop"`

#### Scenario: Database locked
- **WHEN** the OpenCode SQLite database is locked by another process
- **THEN** the parser SHALL open in read-only WAL mode; if still locked, return an error and skip without crashing

### Requirement: Content hashing
All parsers SHALL compute a `content_hash` (SHA-256) of the normalized message content, consistent with the existing hashing algorithm.

#### Scenario: Hash computation
- **WHEN** a parser produces an `ExtractedConversation`
- **THEN** it SHALL compute `hashes.content_hash` by: trimming whitespace, collapsing blank lines, retaining role + index + content, and hashing with SHA-256

#### Scenario: Source fingerprint
- **WHEN** a parser produces an `ExtractedConversation`
- **THEN** it SHALL set `hashes.source_fingerprint` to `"{platform}:desktop"`

### Requirement: Payload structure
All parsers SHALL produce an `ExtractedConversation` compatible with the existing `POST /v1/captures` API.

#### Scenario: Required fields
- **WHEN** any parser produces output
- **THEN** the payload SHALL include: `schema_version: "1.0"`, `extractor_version: "scanner-1.0"`, `source.platform`, `source.url = "desktop"`, `source.browser_title` (set to session title), `source.captured_at` (ISO 8601), `content.title`, `content.messages[]`, `extraction_quality`, `hashes`
