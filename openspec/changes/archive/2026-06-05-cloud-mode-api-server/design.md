## Context

The current product is a WXT + React MV3 extension. Captures are extracted in content scripts, sent to background as `SAVE_REQUEST`, and persisted locally through wa-sqlite + OPFS. Options pages currently read local repositories directly.

The cloud feature changes storage topology but not the extraction contract: the same `ExtractedConversation` payload is the input to both Local Mode and Cloud Mode.

## Goals / Non-Goals

**Goals:**
- Preserve the existing local-only product path as the default.
- Add an opt-in cloud path with registration/login.
- Store cloud Captures in Supabase/Postgres, scoped by user.
- Let users see personal cloud Captures in the extension options page.
- Let users manually upload existing local Captures one by one.
- Fall back to local storage when cloud upload fails.

**Non-Goals:**
- Server-side AI analysis, summaries, MemoryCandidate generation, Context Pack generation.
- Automatic backfill of historical local Captures.
- Background automatic retry scheduler.
- Independent Web Console.
- Multi-tenant teams/workspaces.
- Database portability abstractions beyond Supabase/Postgres.

## Architecture

### Projects

1. `extension/`: existing WXT extension.
2. `api-server/`: new Python API server.

This stays under the SDD simplicity limit of three projects.

### API Server

Use Python with FastAPI unless changed at N3 approval. FastAPI gives direct HTTP routing, request validation, generated OpenAPI, and a Python ecosystem suitable for future AI analysis.

The first release uses Supabase/Postgres as the database. `api-server/` owns auth tables and token issuance; Supabase is used as Postgres storage, not as Supabase Auth.

### Extension Storage Modes

`Local Mode`:
- Default.
- No registration/login required.
- No cloud request.
- Full Capture payload remains in local SQLite.
- Existing list/detail/delete behavior continues to work.

`Cloud Mode`:
- Requires a registered user session.
- New Captures are uploaded to `api-server/`.
- On successful upload, local SQLite keeps only lightweight metadata and the cloud Capture ID.
- On upload failure, the full payload is saved as Local Data and shown with an upload-to-cloud action.

### Manual Backfill

Switching to Cloud Mode never uploads historical local Captures automatically. The options page checks each row for cloud mapping. Local-only rows show an upload-to-cloud button. Clicking it uploads that single Capture after sensitive-content confirmation when needed.

### Delete Semantics

Delete is destructive across all product-owned copies:
- Local-only Capture: delete local SQLite row.
- Cloud-backed Capture: call cloud delete, then remove local metadata/local copy.
- If cloud delete fails, local deletion must not pretend the Capture is gone from the product; surface the failure and keep the row recoverable.

## Data Model

### Supabase/Postgres

`users`
- `id uuid primary key`
- `email text unique not null`
- `password_hash text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`refresh_tokens`
- `id uuid primary key`
- `user_id uuid not null references users(id) on delete cascade`
- `token_hash text unique not null`
- `expires_at timestamptz not null`
- `revoked_at timestamptz null`
- `created_at timestamptz not null`

`captures`
- `id uuid primary key`
- `user_id uuid not null references users(id) on delete cascade`
- `source_platform text not null`
- `source_url text not null`
- `source_title text not null`
- `content_hash text not null`
- `source_fingerprint text not null`
- `extraction_quality jsonb not null`
- `messages jsonb not null`
- `metadata jsonb not null default '{}'::jsonb`
- `analysis_status text not null default 'not_started'`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Indexes:
- unique `(user_id, source_fingerprint)` where `source_fingerprint != ''`
- `(user_id, created_at desc)`

### Extension Local SQLite Additions

Settings:
- `storage_mode`: `'local' | 'cloud'`, default `'local'`
- `api_base_url`
- auth/session fields sufficient for access token and refresh token storage

Captures:
- `storage_state`: `'local' | 'cloud'`
- `cloud_capture_id`
- `cloud_uploaded_at`
- `upload_error`

Cloud-backed rows may omit local `source_documents.normalized_text` after upload succeeds.

## API Contract

All `/v1/captures*` routes require bearer access token.

### Auth

`POST /v1/auth/register`
- Request: `{ "email": string, "password": string }`
- Response: `{ "user": { "id": string, "email": string }, "access_token": string, "refresh_token": string }`

`POST /v1/auth/login`
- Request: `{ "email": string, "password": string }`
- Response: same as register

`POST /v1/auth/refresh`
- Request: `{ "refresh_token": string }`
- Response: new access token and refresh token

`POST /v1/auth/logout`
- Revokes refresh token.

### Captures

`POST /v1/captures`
- Request includes full source messages, source metadata, extraction quality, hashes, and optional source fingerprint.
- Upserts by `(user_id, source_fingerprint)` when fingerprint exists.
- Response: `{ "id": string, "created": boolean, "updated_at": string }`

`GET /v1/captures`
- Returns current user's captures, newest first, with summary metadata and message count.

`GET /v1/captures/{id}`
- Returns full messages and extraction metadata for the current user's capture.

`DELETE /v1/captures/{id}`
- Deletes only if the capture belongs to the current user.

## UI Behavior

Settings page:
- Storage edition selector: Local Mode / Cloud Mode.
- Local Mode copy must state that no cloud account is required.
- Cloud Mode shows register/login, current user, logout, API base URL, and connection status.

Capture list/detail:
- Show local/cloud state.
- Local-only rows show upload-to-cloud action when a user is logged in.
- Cloud-backed rows do not show upload action.
- Cloud-backed detail can fetch from API if local full payload is absent.

Popup:
- Local Mode keeps current save behavior.
- Cloud Mode success copy should say saved to cloud.
- Cloud upload failure copy should say saved locally and can be uploaded later.

## Security / Privacy

- Access tokens are short-lived; refresh tokens are revocable and stored as hashes server-side.
- Passwords are hashed using a password hashing algorithm suitable for server auth, such as Argon2id or bcrypt.
- All cloud Capture APIs are scoped by authenticated user ID.
- Sensitive-content detection remains local before upload. If sensitive content is detected, upload requires explicit confirmation.
- Logs and errors must not include full Capture messages.

## Test Strategy

- API contract tests for auth, user-scoped captures, upsert, detail, delete, and unauthorized access.
- Supabase/Postgres integration tests where feasible; local test database can use Postgres-compatible test setup.
- Extension unit tests for settings defaults, mode switching, save routing, cloud fallback, and manual upload.
- Options UI tests for mode selector, login state, cloud/local badges, upload button, and delete behavior.
- Regression tests proving Local Mode still saves and views without network calls.

## Risks / Trade-offs

- Cloud mode changes privacy posture; mitigated by opt-in mode, explicit upload copy, and sensitive confirmation.
- MV3 service worker token lifecycle can be brittle; mitigate with refresh-on-demand in background.
- Keeping local and cloud state aligned can create deletion/update edge cases; mitigate with cloud ID mapping and "together delete" semantics.
- Supabase direct choice speeds first release but reduces DB portability; accepted because migrations can be handled later.

## Open Questions

- None for N3 draft. Future deployment secrets and production domain are implementation-time configuration details.
