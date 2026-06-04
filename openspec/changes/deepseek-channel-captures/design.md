## Context

The extension is a WXT + React browser extension. Captures are saved locally through `SAVE_REQUEST` into SQLite. The current capture flow is optimized around ChatGPT: platform typing excludes DeepSeek, host permissions only include `chatgpt.com`, popup logic checks ChatGPT conversation IDs, and manual script injection targets `content-scripts/chatgpt.js`.

`captures.source_platform` already exists, so channel display and filtering do not require a database migration.

## Goals / Non-Goals

**Goals:**
- Support manual saving from `chat.deepseek.com`.
- Store DeepSeek captures with stable `source_platform = 'deepseek'`.
- Preserve existing ChatGPT behavior.
- Make Captures list channel-aware and searchable by title.

**Non-Goals:**
- No server-side sync or AI processing.
- No SQLite schema migration.
- No CaptureDetail redesign.
- No required DeepSeek auto-save in the first implementation pass.

## Decisions

1. Use `source_platform` as the canonical channel key.
   - Rationale: it already exists in the database and is used by saved captures.
   - Alternative rejected: adding a new `channel` column would duplicate state and require unnecessary migration risk.

2. Add a dedicated DeepSeek extractor instead of routing DeepSeek through `generic_web`.
   - Rationale: DeepSeek captures should have a stable platform key, fingerprint, and message-role extraction.
   - Alternative rejected: `generic_web` would save selection-like content and lose platform-specific upsert behavior.

3. Keep DeepSeek manual save as the required scope.
   - Rationale: the current auto-save observer is ChatGPT-specific and relies on ChatGPT DOM assumptions.
   - Alternative rejected: forcing auto-save for DeepSeek before validating streaming DOM behavior would increase regression risk.

4. Implement filtering with explicit UI state rather than overloading one free-text input for all fields.
   - Rationale: a channel selector is predictable once multiple platforms exist, while title search remains fuzzy.
   - Alternative rejected: searching channel text through a single input is ambiguous and harder to test.

## Risks / Trade-offs

- DeepSeek DOM may change or lack stable role attributes -> mitigate with fixture-driven extractor tests and confidence warnings.
- WXT entrypoint naming may differ from popup injection assumptions -> verify generated manifest/script path during implementation.
- Search/filter logic may be split between repo and component -> keep filtering behavior testable and avoid DB schema changes.

## Migration Plan

- No database migration.
- Existing captures continue to render with labels derived from their current `source_platform` string.
- Rollback removes the new extractor/content script/permissions and CaptureList controls; existing data remains valid.

## Open Questions

- Whether DeepSeek auto-save should be added after manual save passes acceptance.
