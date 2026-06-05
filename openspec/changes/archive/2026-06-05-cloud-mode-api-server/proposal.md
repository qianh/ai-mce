## Why

AI Memory Capture is currently local-only: Captures are stored in the extension's OPFS SQLite database and the options page reads directly from local repositories. Users now need an optional cloud edition that supports registration, uploads Captures to a shared cloud database under their own user account, and lets them view personal cloud data from the plugin background.

The existing local-first privacy promise remains important. Cloud mode must be opt-in, and historical local Captures must not be uploaded automatically.

## What Changes

- Add Local Mode and Cloud Mode settings to the extension options page.
- Keep Local Mode as the default with no registration, no cloud request, and unchanged local SQLite save/view behavior.
- Add `api-server/` at the repository root using a Python API service.
- Use Supabase/Postgres as the first cloud database.
- Add email/password registration and login handled by `api-server/`.
- Upload Cloud Mode Captures to the API server with full source messages and extraction metadata.
- Store cloud Captures by user and expose user-scoped list/detail/delete APIs.
- In options page, show whether a Capture is local-only or cloud-backed.
- For local-only Captures, show a per-Capture "upload to cloud" action.
- If Cloud Mode upload fails, save the Capture locally and allow later manual upload.
- Delete uploaded Captures from both cloud storage and local metadata/local copy together.

## Capabilities

### New Capabilities
- `cloud-mode-api-server`: Python API server, email/password auth, Supabase/Postgres persistence, user-scoped Capture APIs.
- `cloud-data-console`: options_page controls for storage mode, login/logout, local/cloud state, cloud personal data list/detail, and manual upload.

### Modified Capabilities
- `capture-save`: route save behavior by Local Mode vs Cloud Mode, with local fallback on cloud upload failure.
- `capture-discovery`: display local/cloud state and upload actions in Capture list/detail.

## Impact

- New root directory: `api-server/`.
- Extension settings model gains storage mode, cloud auth/session state, API base URL, and cloud Capture mapping metadata.
- Extension background save handler must call the API server when Cloud Mode is active.
- Extension options page must stop assuming all data comes only from local SQLite.
- Local database schema needs cloud mapping/fallback fields.
- Manifest needs cloud API host permission.
- OpenSpec/docs need to supersede older V0.1 non-goals for this feature only.

## Explicit Non-Goals

- No service-side AI analysis in the first cloud release.
- No summary generation, MemoryCandidate processing, Review Inbox, or Context Pack generation.
- No automatic historical local data upload when switching to Cloud Mode.
- No independent Web Console outside the extension options page.
- No Supabase Auth dependency in the first release; `api-server/` owns email/password auth.
