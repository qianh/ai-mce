## 1. API Server

- [x] 1.1 Scaffold root `api-server/` Python FastAPI project with `/health`.
- [x] 1.2 Add Supabase/Postgres SQLAlchemy models and Alembic migration for `users`, `refresh_tokens`, `captures`.
- [x] 1.3 Implement email/password register, login, refresh, logout.
- [x] 1.4 Implement authenticated user-scoped capture create/upsert/list/detail/delete APIs.
- [x] 1.5 Add API tests for auth, user isolation, upsert, delete, and no AI analysis job creation.

## 2. Extension Local Model

- [x] 2.1 Extend `Settings` with `storage_mode`, `api_base_url`, and cloud session fields.
- [x] 2.2 Extend local capture schema with `storage_state`, `cloud_capture_id`, `cloud_uploaded_at`, `upload_error`.
- [x] 2.3 Add migrations and tests for old local SQLite tables.
- [x] 2.4 Add repository helpers for cloud metadata, local fallback, cloud-backed local text removal.

## 3. Extension Cloud Client And Save Routing

- [x] 3.1 Add typed cloud API client for auth and captures.
- [x] 3.2 Route background `SAVE_REQUEST` by Local Mode vs Cloud Mode.
- [x] 3.3 Preserve Local Mode local-only behavior with no cloud requests.
- [x] 3.4 On Cloud Mode upload success, store cloud metadata and avoid long-term local full text.
- [x] 3.5 On Cloud Mode upload failure, write full Capture as Local Data for later manual upload.
- [x] 3.6 Keep both save paths free of AI analysis calls.

## 4. Options Page

- [x] 4.1 Add Local Mode / Cloud Mode selector to Settings.
- [x] 4.2 Add register/login/logout and API base URL controls to Settings.
- [x] 4.3 Show local/cloud state in Capture list and detail.
- [x] 4.4 Show upload-to-cloud action for local-only Captures when logged in.
- [x] 4.5 Fetch cloud-backed detail from API when local full text is absent.
- [x] 4.6 Delete cloud-backed Captures from cloud and local metadata/local copy together.

## 5. Privacy, Permissions, Verification

- [x] 5.1 Require sensitive upload confirmation before Cloud Mode upload or Manual Backfill.
- [x] 5.2 Add narrow cloud API host permission to `wxt.config.ts`.
- [x] 5.3 Verify existing local capture tests still pass.
- [x] 5.4 Verify API tests, extension tests, typecheck, WXT build.
- [x] 5.5 Run `openspec validate cloud-mode-api-server --strict`.
