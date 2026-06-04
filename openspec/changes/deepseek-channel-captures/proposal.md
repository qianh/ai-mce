## Why

AI Memory Capture currently saves ChatGPT conversations only. Users also capture useful conversations in DeepSeek, and the Captures list needs channel-aware discovery once multiple AI platforms are stored together.

## What Changes

- Add DeepSeek as a first-class capture channel with `source.platform = 'deepseek'`.
- Allow the popup/content-script flow to extract conversations from `chat.deepseek.com`.
- Preserve local-only saving through the existing SQLite capture pipeline.
- Display each capture's channel more explicitly in the Captures list.
- Add channel filtering and title fuzzy search to the Captures list.
- No breaking changes.

## Capabilities

### New Capabilities
- `capture-discovery`: Captures list channel display, channel filtering, title fuzzy search, combined filters, and filtered empty state.

### Modified Capabilities
- `realtime-capture`: Add DeepSeek page matching and extraction support alongside existing ChatGPT capture behavior.
- `capture-save`: Add DeepSeek source fingerprint/upsert behavior while preserving raw-only local SQLite saving.

## Impact

- Extension host permissions and content script matching for `https://chat.deepseek.com/*`.
- Extractor/platform types in `src/lib/types.ts` and `src/lib/extractors/*`.
- Popup platform detection and manual script injection path in `src/entrypoints/popup/App.tsx`.
- Capture repository filtering in `src/db/repos/captures.ts`.
- Options UI in `src/entrypoints/options/pages/CaptureList.tsx`.
- Tests for extractors, capture list filtering/rendering, and existing migration behavior.
