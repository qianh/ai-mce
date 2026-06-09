# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AI Memory Capture** — Collects personal AI conversations from all channels (browser and desktop CLI tools) into a personal memory hub for data analysis, profile building, and second-brain construction.

The product spec is in `doc/AI_Memory_Capture_Extension_最终版产品计划说明书.md`. The implementation spec is in `docs/spec/ai-memory-capture/spec.md`.

## Architecture

Four subsystems built as separate packages in a monorepo:

```
extension/   — Browser Channel: Chrome Extension (Manifest V3, TypeScript, React, WXT/Plasmo)
scanner/     — Desktop Channel: macOS launchd daemon (Go) that scans AI CLI tool sessions
api-server/  — Cloud Memory API (Python, FastAPI)
console/     — Web Console (frontend for managing captures from all channels)
```

### Extension Architecture

The extension is the user-facing capture tool. Key data flow:

1. **Content Script** (`content-scripts/`) runs on supported AI pages, extracts conversation DOM
2. **Extractor Registry** routes to platform-specific extractors (ChatGPT, Claude, Gemini, Perplexity, generic)
3. **Background Service Worker** manages the local job queue (IndexedDB for payloads, `storage.local` for metadata)
4. **Popup** presents save preview, project selection, and privacy notice before any upload
5. **API Client** uploads `ExtractedConversation` payloads to `POST /v1/captures`

All extractors implement `ConversationExtractor` interface (`src/lib/schema.ts`). Extraction always returns `ExtractionQuality` with confidence score — never fails silently; always degrades to selection or manual paste.

### Scanner Architecture

The scanner is the desktop-channel capture tool. Key data flow:

1. **launchd** triggers the scanner via `WatchPaths` when AI CLI tool session directories change
2. **Per-tool Parsers** read each tool's session format (JSONL or SQLite) and convert to `ExtractedConversation`
3. **Completion check** — only sessions with no file modification for 10+ minutes are processed
4. **Watermark DB** (`~/.mce-scanner/state.db`) tracks processed sessions by file path + content hash
5. **API Client** uploads to `POST /v1/captures` with independent authentication (same user account as extension)
6. **Retry** — 3 attempts on failure, then payload persisted locally for later retry

Supported tools and their session storage:

| Tool | Storage Path | Format |
|---|---|---|
| Claude Code | `~/.claude/projects/{project}/` | JSONL (one file per session) |
| Codex | `~/.codex/sessions/YYYY/MM/DD/` | JSONL (session_meta + events) |
| Grok | `~/.grok/sessions/{path}/{session_id}/` | Multi-file (chat_history.jsonl + summary.json) |
| OpenCode | `~/.local/share/opencode/opencode.db` | SQLite (session → message → part) |

Desktop Captures use `source_url = "desktop"` and `platform` values matching the AI product (`claude`, `codex`, `grok`, `opencode`).

### Cloud API Architecture

RESTful API with async processing pipeline:

- `POST /v1/captures` — idempotent (Idempotency-Key header = `client_capture_id`), saves Capture + SourceDocument, enqueues async job
- Async worker: text cleaning → language detection → sensitive content detection → summarization → project identification → MemoryCandidate extraction → memory level classification → ContextPack generation
- L4/L5 memory candidates are never auto-promoted — they go to a review queue

### Data Model Hierarchy

```
Capture → SourceDocument → MemoryCandidate → MemoryItem
                        ↘ Decision
                        ↘ Task
                        → ContextPack (per project)
```

Memory levels L0–L5 control promotion behavior. L0 = discard, L3 = auto-promote, L4/L5 = require user confirmation.

## V0.1 Scope (Current Phase)

**In scope:** ChatGPT extractor, generic web selection via context menu, Popup save flow, `POST /v1/captures`, cloud summarization + MemoryCandidate generation, Web Console (list/detail/delete), ContextPack copy, local failure queue with retry.

**Explicitly out of scope for V0.1:** Claude/Gemini/Perplexity extractors, Side Panel, MCP, CLI, team workspace, auto-save, knowledge graph.

## Tech Stack

| Layer | Stack |
|---|---|
| Extension | TypeScript, React, WXT or Plasmo, Vite, Manifest V3 |
| Extension storage | `chrome.storage.local` (metadata/settings), IndexedDB (short-term payload cache) |
| Extension auth | `chrome.identity.launchWebAuthFlow`, OAuth2 + PKCE |
| Scanner | Go, macOS launchd, SQLite (watermark DB) |
| Scanner auth | Independent email/password login, token persisted locally |
| API | Python, FastAPI, Supabase/Postgres |
| Console | (TBD at N3 spec phase) |

## Extension Permissions Policy

Never request: `cookies`, `history`, `bookmarks`, `<all_urls>`.

Default permissions: `storage`, `activeTab`, `scripting`, `contextMenus`, `alarms`, `identity`.

Optional host permissions (user must enable): `claude.ai`, `gemini.google.com`, `www.perplexity.ai`.

Required host permissions: `chatgpt.com`, the Memory API domain.

## Key Invariants

- **Browser Channel: never auto-upload.** Every browser-channel Capture requires explicit user action and a preview confirmation. Desktop Channel Captures are collected and uploaded automatically by the Scanner.
- **Local payloads are ephemeral.** Delete from IndexedDB immediately on successful upload. TTL enforced by `alarms`.
- **Idempotent uploads.** `client_capture_id` is the idempotency key. Same content_hash from same user → return existing capture, don't reprocess.
- **Sensitive content blocks auto-promotion.** Any L4/L5 or sensitive-flag candidate must enter review queue, never auto-promote to MemoryItem.
- **Extractors always degrade gracefully.** Priority: platform DOM extractor → generic article/main blocks → user selection → manual paste. Never throw to the user as an error.

## Hashing & Deduplication

Before hashing: trim whitespace, collapse blank lines, strip platform UI copy (Copy/Share/Regenerate buttons), retain role + index + code block content. Hash with SHA-256. The `source_fingerprint` is `platform:url`.

## Local Queue Retry Schedule

30s → 2min → 10min → 1h → mark `failed_expired` after 24h.

## Payload Size Limits

- < 200 KB: upload normally
- 200 KB – 2 MB: warn user, suggest summary-only
- > 2 MB: block full upload, force user to choose (summary / recent N turns / manual edit)
