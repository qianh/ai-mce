# Cloud Mode API Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Cloud Mode with a Python API server, Supabase/Postgres user storage, extension-side upload routing, local fallback, manual backfill, and cloud data viewing in options page.

**Architecture:** Keep `extension/` as the existing WXT app and add root `api-server/` as a FastAPI service. Local Mode remains the default and never calls the cloud; Cloud Mode uploads full `ExtractedConversation` payloads to authenticated user-scoped APIs and stores only local cloud metadata after success.

**Tech Stack:** Python + FastAPI + SQLAlchemy/Alembic + Postgres/Supabase, TypeScript + WXT + React + Vitest + wa-sqlite/OPFS.

---

## File Structure

- Create `api-server/pyproject.toml`: Python project metadata and dependencies.
- Create `api-server/app/main.py`: FastAPI app factory and route mounting.
- Create `api-server/app/config.py`: environment settings for database URL, JWT secret, token TTLs.
- Create `api-server/app/db.py`: SQLAlchemy engine/session helpers.
- Create `api-server/app/models.py`: `User`, `RefreshToken`, `Capture` database models.
- Create `api-server/app/schemas.py`: request/response schemas for auth and captures.
- Create `api-server/app/security.py`: password hashing, JWT creation/verification, refresh token hashing.
- Create `api-server/app/routes/auth.py`: register/login/refresh/logout endpoints.
- Create `api-server/app/routes/captures.py`: authenticated Capture CRUD/upsert endpoints.
- Create `api-server/app/alembic/*`: migrations for Supabase/Postgres schema.
- Create `api-server/tests/*`: API tests for auth, user isolation, upsert, delete, and no AI analysis.
- Modify `extension/src/lib/types.ts`: storage mode, cloud state, auth/session, cloud request/response types.
- Modify `extension/src/db/schema.sql`: local cloud metadata columns.
- Modify `extension/src/db/migrations.ts`: migration helpers for cloud metadata fields.
- Modify `extension/src/db/repos/settings.ts`: default `storage_mode = 'local'` and cloud settings accessors.
- Modify `extension/src/db/repos/captures.ts`: cloud state, cloud ID mapping, clear local source text after upload success.
- Create `extension/src/lib/cloud-api.ts`: typed API client for auth and captures.
- Modify `extension/src/entrypoints/background.ts`: route `SAVE_REQUEST` by storage mode.
- Modify `extension/src/entrypoints/options/pages/Settings.tsx`: storage mode selector and auth UI.
- Modify `extension/src/entrypoints/options/pages/CaptureList.tsx`: local/cloud badges and upload button.
- Modify `extension/src/entrypoints/options/pages/CaptureDetail.tsx`: cloud detail fetch, upload, together-delete.
- Modify `extension/wxt.config.ts`: cloud API host permission.
- Create/modify `extension/tests/**`: tests for migrations, settings, API client, background routing, options UI.

## Task 1: API Server Skeleton And Health

**Files:**
- Create: `api-server/pyproject.toml`
- Create: `api-server/app/main.py`
- Create: `api-server/app/config.py`
- Create: `api-server/tests/test_health.py`

- [ ] **Step 1: Write the failing health test**

```python
from fastapi.testclient import TestClient
from app.main import create_app

def test_health_returns_ok():
    client = TestClient(create_app())
    assert client.get("/health").json() == {"ok": True}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api-server && uv run pytest tests/test_health.py -q`
Expected: FAIL because `app.main` does not exist.

- [ ] **Step 3: Implement minimal FastAPI app**

Create `create_app()` and `/health`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api-server && uv run pytest tests/test_health.py -q`
Expected: PASS.

## Task 2: Supabase/Postgres Models And Migrations

**Files:**
- Create: `api-server/app/db.py`
- Create: `api-server/app/models.py`
- Create: `api-server/alembic.ini`
- Create: `api-server/app/alembic/env.py`
- Create: `api-server/app/alembic/versions/0001_initial.py`
- Create: `api-server/tests/test_models.py`

- [ ] **Step 1: Write model metadata tests**

Test that models define `users`, `refresh_tokens`, `captures`, `(user_id, created_at)` index, and unique user fingerprint index.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api-server && uv run pytest tests/test_models.py -q`
Expected: FAIL because models do not exist.

- [ ] **Step 3: Implement SQLAlchemy models and migration**

Use UUID primary keys, JSON/JSONB-compatible fields, and Supabase/Postgres-friendly types.

- [ ] **Step 4: Run model tests**

Run: `cd api-server && uv run pytest tests/test_models.py -q`
Expected: PASS.

## Task 3: Auth Contract

**Files:**
- Create: `api-server/app/security.py`
- Create: `api-server/app/schemas.py`
- Create: `api-server/app/routes/auth.py`
- Create: `api-server/tests/test_auth.py`
- Modify: `api-server/app/main.py`

- [ ] **Step 1: Write failing auth API tests**

Cover register, duplicate register, login, refresh, logout, and invalid password.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api-server && uv run pytest tests/test_auth.py -q`
Expected: FAIL because auth routes do not exist.

- [ ] **Step 3: Implement password hashing and token routes**

Use Argon2id or bcrypt for password hashing. Store refresh token hashes server-side. Access tokens include user ID.

- [ ] **Step 4: Run auth tests**

Run: `cd api-server && uv run pytest tests/test_auth.py -q`
Expected: PASS.

## Task 4: User-Scoped Capture API

**Files:**
- Create: `api-server/app/routes/captures.py`
- Create: `api-server/tests/test_captures.py`
- Modify: `api-server/app/main.py`

- [ ] **Step 1: Write failing capture API tests**

Cover authenticated create/upsert, list newest first, detail, delete, cross-user denial, and no AI job creation.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api-server && uv run pytest tests/test_captures.py -q`
Expected: FAIL because capture routes do not exist.

- [ ] **Step 3: Implement capture routes**

Implement `POST /v1/captures`, `GET /v1/captures`, `GET /v1/captures/{id}`, `DELETE /v1/captures/{id}`. Upsert by `(user_id, source_fingerprint)` when fingerprint is non-empty.

- [ ] **Step 4: Run capture tests**

Run: `cd api-server && uv run pytest tests/test_captures.py -q`
Expected: PASS.

## Task 5: Extension Settings And Local Schema

**Files:**
- Modify: `extension/src/lib/types.ts`
- Modify: `extension/src/db/schema.sql`
- Modify: `extension/src/db/migrations.ts`
- Modify: `extension/src/db/repos/settings.ts`
- Test: `extension/tests/db/migrations.test.ts`
- Create: `extension/tests/db/settings.test.ts`

- [ ] **Step 1: Write failing settings/migration tests**

Assert `storage_mode` defaults to `local`, cloud columns are emitted for old capture tables, and existing `report_mode` behavior stays unchanged.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd extension && bunx vitest run tests/db/migrations.test.ts tests/db/settings.test.ts`
Expected: FAIL for missing cloud fields/defaults.

- [ ] **Step 3: Implement type, schema, migration, and settings changes**

Add `storage_state`, `cloud_capture_id`, `cloud_uploaded_at`, `upload_error`; add settings defaults for `storage_mode`, `api_base_url`, and cloud session fields.

- [ ] **Step 4: Run tests**

Run: `cd extension && bunx vitest run tests/db/migrations.test.ts tests/db/settings.test.ts`
Expected: PASS.

## Task 6: Extension Cloud API Client

**Files:**
- Create: `extension/src/lib/cloud-api.ts`
- Create: `extension/tests/lib/cloud-api.test.ts`
- Modify: `extension/src/lib/types.ts`

- [ ] **Step 1: Write failing API client tests**

Mock `fetch` and cover register, login, refresh, capture upload, list, detail, delete, bearer token header, and error mapping.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd extension && bunx vitest run tests/lib/cloud-api.test.ts`
Expected: FAIL because client does not exist.

- [ ] **Step 3: Implement minimal typed client**

Keep it framework-free; accept `apiBaseUrl` and token explicitly. Do not store tokens inside the client.

- [ ] **Step 4: Run tests**

Run: `cd extension && bunx vitest run tests/lib/cloud-api.test.ts`
Expected: PASS.

## Task 7: Background Save Routing And Fallback

**Files:**
- Modify: `extension/src/entrypoints/background.ts`
- Modify: `extension/src/db/repos/captures.ts`
- Create: `extension/tests/background/save-routing.test.ts`

- [ ] **Step 1: Write failing save routing tests**

Test Local Mode does not call cloud API, Cloud Mode uploads, upload success stores cloud metadata and clears local full text, upload failure writes Local Data.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd extension && bunx vitest run tests/background/save-routing.test.ts`
Expected: FAIL because routing is local-only.

- [ ] **Step 3: Implement routing and repository helpers**

Split pure save-routing logic from Chrome listener if needed so tests can call it without a browser runtime.

- [ ] **Step 4: Run tests**

Run: `cd extension && bunx vitest run tests/background/save-routing.test.ts`
Expected: PASS.

## Task 8: Settings UI For Local/Cloud Mode And Auth

**Files:**
- Modify: `extension/src/entrypoints/options/pages/Settings.tsx`
- Create: `extension/tests/options/Settings.test.tsx`

- [ ] **Step 1: Write failing Settings UI tests**

Cover default Local Mode copy, switching to Cloud Mode showing login/register, successful login state, logout, and API base URL editing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd extension && bunx vitest run tests/options/Settings.test.tsx`
Expected: FAIL because UI only has report mode/export.

- [ ] **Step 3: Implement Settings UI**

Use existing quiet card layout. Keep local mode independent and avoid marketing copy.

- [ ] **Step 4: Run tests**

Run: `cd extension && bunx vitest run tests/options/Settings.test.tsx`
Expected: PASS.

## Task 9: Capture List/Detail Cloud State, Upload, Delete

**Files:**
- Modify: `extension/src/entrypoints/options/pages/CaptureList.tsx`
- Modify: `extension/src/entrypoints/options/pages/CaptureDetail.tsx`
- Modify: `extension/src/db/repos/captures.ts`
- Test: `extension/tests/options/CaptureList.test.tsx`
- Create: `extension/tests/options/CaptureDetail.test.tsx`

- [ ] **Step 1: Write failing options UI tests**

Cover local/cloud badges, upload button only for local rows when logged in, cloud detail fetch when local text missing, and together-delete for cloud-backed rows.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd extension && bunx vitest run tests/options/CaptureList.test.tsx tests/options/CaptureDetail.test.tsx`
Expected: FAIL for missing cloud UI.

- [ ] **Step 3: Implement list/detail behavior**

Preserve existing channel/title filters. Avoid nested cards; use badges/actions in the existing rows.

- [ ] **Step 4: Run tests**

Run: `cd extension && bunx vitest run tests/options/CaptureList.test.tsx tests/options/CaptureDetail.test.tsx`
Expected: PASS.

## Task 10: Permissions, Integration, And Docs

**Files:**
- Modify: `extension/wxt.config.ts`
- Modify: `docs/spec/cloud-mode-api-server/spec.md`
- Modify: `openspec/changes/cloud-mode-api-server/tasks.md`

- [ ] **Step 1: Add manifest permission test or build check**

Run: `cd extension && bun run build`
Expected before implementation: host permission missing for API origin.

- [ ] **Step 2: Configure cloud API host permission**

Add production/local API host permissions in the narrowest useful form for this project.

- [ ] **Step 3: Run full extension verification**

Run: `cd extension && bunx vitest run`
Expected: PASS.

Run: `cd extension && bunx tsc --noEmit`
Expected: PASS.

Run: `cd extension && bun run build`
Expected: PASS.

- [ ] **Step 4: Run API verification**

Run: `cd api-server && uv run pytest`
Expected: PASS.

- [ ] **Step 5: Run OpenSpec validation**

Run: `openspec validate cloud-mode-api-server --strict`
Expected: `Change 'cloud-mode-api-server' is valid`.

- [ ] **Step 6: Update task status**

Mark completed tasks in `openspec/changes/cloud-mode-api-server/tasks.md` and `docs/spec/cloud-mode-api-server/spec.md`.
