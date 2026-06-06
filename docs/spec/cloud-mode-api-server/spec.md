---
feature: cloud-mode-api-server
executor: codex
scores: { 规模: H, 风险: H, 项目: 老, 领域清晰度: 模糊 }
nodes: [N0, NS, N1, N2, N3, N4, N5, N6, N7, N8]
flavors: { NS: codebase-analyzer, N1: grill-with-docs, N2: grill-with-docs, N3: sdd-development+openspec, N4: superpowers:writing-plans, N5: superpowers:test-driven-development, N6: superpowers:verification-before-completion, N7: superpowers:requesting-code-review, N8: openspec archive }
execution_modes: { NS: subagent, N1: current-agent, N2: current-agent, N3: current-agent, N4: current-agent, N5: current-agent, N6: current-agent, N7: current-agent, N8: current-agent }
deps_check: { codebase-analyzer: ok, grill-with-docs: ok, sdd-development: ok, openspec: "ok(v1.4.0)", superpowers:writing-plans: ok, superpowers:test-driven-development: ok, superpowers:verification-before-completion: ok, superpowers:requesting-code-review: ok }
status: done
created: 2026-06-04
---

# Cloud Mode + API Server · Spec

## 涉及服务 / 跨仓范围
- 当前项目：Chrome Extension MV3，WXT + React + TypeScript + wa-sqlite/OPFS，路径 `extension/`。
- 新增服务：根目录 `api-server/`，提供云端注册/登录、用户级 Capture API、统一数据库访问。
- 关联服务 / 仓：
  - `extension/`：新增本地版/云端版配置、云端上传、云端个人数据查看。
  - `api-server/`：新增云端服务和数据库模型。
  - `openspec/`：新增云端模式变更规格。
  - `docs/spec/`：本文件作为单一事实源。
- 关联 API / 配置 / DB / 权限：
  - Extension background `SAVE_REQUEST` 需要按存储模式分流。
  - Options 页需要展示本地/云端状态、登录状态、个人云端数据。
  - Manifest 需要新增云端 API host permission；若采用 OAuth/PKCE，可能需要 `identity`。
  - 本地 DB 继续使用 OPFS SQLite；云端 DB 按用户级隔离。
- 完整功能边界：当前仓内形成 monorepo；未发现必须联动的兄弟仓。

## 问题与非目标
- 要解决什么痛点 / 用户是谁：
  - 用户可在插件后台选择个人本地版或云端版。
  - 个人本地版是默认模式，数据保留在本地 OPFS SQLite。
  - 云端版需要注册/登录；启用后新增 Capture 可上传到统一数据库，并按用户级存储。
  - 插件后台可以查看当前用户的个人云端数据。
- 已确认决策：
  - 启用云端版后，历史本地 Capture 默认不自动上传。
  - 历史本地 Capture 采用逐条手动补传：后台检测每条 Capture 是否已有云端副本；如果仍是本地数据，在该 Capture 后提供“上传云端”按钮。
  - 云端版新 Capture 上传成功后，本地 SQLite 只保留轻量 metadata 与云端 Capture ID，不长期保留完整原文。
  - 云端版上传失败时回落为本地数据，完整原文保存到本地 SQLite；用户后续通过同一套“上传云端”手动同步操作上传到云端。
  - 云端版第一版采用 `api-server/` 自有邮箱 + 密码业务用户体系；插件只访问 `api-server/`，`api-server/` 使用 Supabase service role key 写入业务表。
  - `api-server/` 使用 Python 技术栈，因为后续需要在服务端处理内容 AI 分析。
  - 云端数据库第一版使用 Supabase REST + service role key；不要求 `api-server/` 持有 Postgres 直连串。
  - 云端第一版只做 Capture 上传、用户级存储、列表/详情查看；不做服务端 AI 分析。
  - 云端上传完整原文消息与 extraction metadata；命中敏感内容时，云端上传前仍需二次确认。
  - 删除 Capture 采用“一起删”：如果 Capture 有云端副本，删除时同时删除云端记录和本地 metadata/本地副本；不提供仅删除本地副本的分叉操作。
  - 插件后台第一版只在 extension `options_page` 中实现；不做独立 Web Console。
  - 个人本地版是默认模式，保持当前本地 SQLite 保存/查看路径可用；不需要注册、不请求云端、不显示登录流程，不被云端依赖阻塞。
- 非目标：
  - 服务端 AI 分析、摘要、候选记忆、Context Pack 生成。
- 失败路径：
  - N/A

## 领域词表
见根目录 `CONTEXT.md`。本规格使用以下规范词：
- Local Mode：默认个人本地版，不注册、不请求云端，只读写本地 SQLite。
- Cloud Mode：云端版，注册/登录后把新 Capture 上传到云端。
- Local Data：只存在于本地 SQLite 的 Capture。
- Cloud Data：存储在云端且按用户隔离的 Capture。
- Cloud Link：本地 metadata 与云端 Capture ID 的映射，不代表本地完整副本。
- Manual Backfill：用户逐条手动把 Local Data 上传云端。
- Upload Fallback：Cloud Mode 上传失败后回落为 Local Data。
- Sensitive Upload Confirmation：敏感内容上传前二次确认。
- Delete Capture：删除产品持有的所有副本；有云端副本时云端与本地一起删。
- API Server：Python 云端服务，第一版只接收/存储/展示 Capture，后续承载 AI 分析。
- Cloud Database：Supabase `public.users`、`public.refresh_tokens`、`public.captures` 业务表，通过 REST API 与后端 service role key 访问。

## 需求
### 用户故事

#### US-001：默认继续使用个人本地版
作为隐私敏感用户，我希望插件默认保持本地保存和本地查看，这样我不注册账号也能继续使用现有功能。

验收：
- 首次安装或未配置时，`storage_mode` 默认为 `local`。
- 本地版保存、列表、详情、删除不依赖 `api-server/`。
- 本地版不会发起云端 API 请求，也不会显示登录阻塞。

#### US-002：注册并启用云端版
作为需要跨设备/云端存储的用户，我希望在插件后台注册登录并启用云端版，这样后续新增 Capture 会保存到我的云端数据里。

验收：
- 用户可在 options 设置页用邮箱密码注册/登录。
- 登录成功后可启用 Cloud Mode。
- 未登录时不能静默启用云端上传。

#### US-003：云端版保存新 Capture
作为云端版用户，我希望新保存的完整对话上传到云端，这样我能在插件后台查看个人云端数据。

验收：
- Cloud Mode 保存上传完整原文消息、source metadata、hashes、extraction_quality。
- API server 按当前用户存储 Capture。
- 上传成功后，本地只保留轻量 metadata 与 `cloud_capture_id`，不长期保留完整原文。
- 服务端第一版不触发 AI 分析。

#### US-004：云端上传失败回落本地
作为云端版用户，我希望上传失败时内容不丢失，这样网络或服务异常时仍能保存。

验收：
- Cloud Mode 上传失败时，完整 Capture 写入本地 SQLite，状态为 Local Data。
- UI 明确提示“已保存到本地，可稍后上传云端”。
- 后续通过同一条 Capture 的“上传云端”按钮手动同步。

#### US-005：手动补传历史本地数据
作为已有本地数据的用户，我希望切换云端版后能逐条决定是否上传历史 Capture，而不是被自动全量上传。

验收：
- 切换 Cloud Mode 不自动上传历史 Local Data。
- 本地 Capture 若没有 cloud link，在列表/详情显示“上传云端”按钮。
- 点击按钮只上传该条 Capture。
- 命中敏感内容时，上传前要求二次确认。

#### US-006：查看和删除个人云端数据
作为云端版用户，我希望在插件后台查看和删除自己的云端 Capture。

验收：
- options page 可显示当前用户的云端 Capture 列表。
- 云端详情展示完整消息与 extraction metadata。
- 用户只能看到自己的云端数据。
- 删除已上传 Capture 时，云端记录和本地 metadata/本地副本一起删除。

### 功能需求

- FR-001：Extension SHALL provide `storage_mode: 'local' | 'cloud'` with default `'local'`.
- FR-002：Local Mode SHALL preserve current raw-only SQLite save/list/detail/delete behavior.
- FR-003：`api-server/` SHALL be created at repository root as a Python service.
- FR-004：Cloud Database SHALL use Supabase/Postgres directly for first release.
- FR-005：API server SHALL support email/password register/login, access token, refresh token, logout.
- FR-006：Cloud Capture APIs SHALL scope every operation by authenticated `user_id`.
- FR-007：Cloud Mode save SHALL upload full messages and extraction metadata.
- FR-008：Cloud Mode successful upload SHALL leave only local metadata and cloud ID locally.
- FR-009：Cloud Mode upload failure SHALL fall back to Local Data.
- FR-010：Historical Local Data SHALL never auto-upload when Cloud Mode is enabled.
- FR-011：Local-only Capture rows SHALL expose per-Capture upload-to-cloud action when logged in.
- FR-012：Sensitive content SHALL require explicit confirmation before Cloud Mode upload or Manual Backfill.
- FR-013：Options page SHALL show Local/Cloud state for captures and allow viewing personal cloud data.
- FR-014：Deleting cloud-backed Capture SHALL delete cloud record and local metadata/local copy together.
- FR-015：First release SHALL NOT run server-side AI analysis.

### 非功能需求

- NFR-001 隐私：Local Mode 不发云端请求；Cloud Mode 上传动作必须可见且可解释。
- NFR-002 安全：所有 cloud Capture API 必须认证；服务端用用户 ID 做访问隔离。
- NFR-003 日志：客户端和服务端错误日志不得包含完整 Capture 原文。
- NFR-004 可靠性：Cloud upload failure must not lose user content; local fallback is required.
- NFR-005 回归：现有本地保存、auto/manual report mode、ChatGPT/DeepSeek capture tests must keep passing.

## 数据模型 / API / UI / 兼容 / 权限
### API Server

- 技术栈：Python + FastAPI（N3 默认），后续 AI 分析继续在 Python 生态扩展。
- 数据库：Supabase/Postgres。
- Auth：`api-server/` 自己管理业务用户、密码哈希、access token 和 refresh token；插件不直连 Supabase。

### Supabase 数据模型

业务用户与 session 使用 `public.users` 与 `public.refresh_tokens`，由 `api-server/` 通过 Supabase REST 和 service role key 管理。

`users`
- `id uuid primary key`
- `email text unique not null`
- `password_hash text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`refresh_tokens`
- `id uuid primary key`
- `user_id uuid not null references public.users(id) on delete cascade`
- `token_hash text unique not null`
- `expires_at timestamptz not null`
- `revoked_at timestamptz null`
- `created_at timestamptz not null`

`captures`
- `id uuid primary key`
- `user_id uuid not null references public.users(id) on delete cascade`
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

索引：
- `(user_id, created_at desc)`
- unique `(user_id, source_fingerprint)` where `source_fingerprint != ''`

权限：
- 业务 API 鉴权由 `api-server/` 完成。
- Supabase service role key 仅保存在 `api-server/.env`，不进入插件或前端代码。

### Extension 本地模型补充

`settings`
- `storage_mode: 'local' | 'cloud'`
- `api_base_url`
- cloud session fields（access token / refresh token / user email 等）

`captures`
- `storage_state: 'local' | 'cloud'`
- `cloud_capture_id`
- `cloud_uploaded_at`
- `upload_error`

上传成功的 cloud-backed Capture 可以清空/不保留 `source_documents.normalized_text`，但必须能通过云端详情重新展示。

### API 合同

`POST /v1/auth/register`
- Request: `{ email, password }`
- Response: `{ user, access_token, refresh_token }`

`POST /v1/auth/login`
- Request: `{ email, password }`
- Response: `{ user, access_token, refresh_token }`

`POST /v1/auth/refresh`
- Request: `{ refresh_token }`
- Response: `{ access_token, refresh_token }`

`POST /v1/auth/logout`
- 撤销 refresh token。

`POST /v1/captures`
- Auth required.
- Request: full `ExtractedConversation` payload.
- Upsert by `(user_id, source_fingerprint)` when fingerprint is non-empty.
- Response: `{ id, created, updated_at }`

`GET /v1/captures`
- Auth required.
- Returns current user's cloud Capture list, newest first.

`GET /v1/captures/{id}`
- Auth required.
- Returns full messages and extraction metadata for current user's Capture.

`DELETE /v1/captures/{id}`
- Auth required.
- Deletes current user's Capture.

### UI

Settings：
- Storage edition selector: Local Mode / Cloud Mode.
- Local Mode explains no account/cloud required.
- Cloud Mode shows register/login/logout, current user, API base URL, connection status.

Capture List / Detail：
- Display local/cloud state.
- Local-only rows show “上传云端” when logged in.
- Cloud-backed rows display cloud state and no duplicate upload action.
- Cloud-backed detail fetches remote full payload when local text is absent.

Popup：
- Local Mode keeps current copy.
- Cloud Mode success copy says saved to cloud.
- Cloud upload failure copy says saved locally and can be uploaded later.

### 权限 / 配置

- Manifest needs host permission for configured cloud API origin.
- If API base URL is configurable for local development, production builds should still make the required host explicit.
- No `cookies`, `history`, `bookmarks`, or broad `<all_urls>` permission.

## 验收标准
- AC-001：首次安装默认 Local Mode；保存 Capture 时不调用云端 API。
- AC-002：Local Mode 在 API server 未启动时仍可保存、列表、详情、删除。
- AC-003：用户可在 options page 注册、登录、退出。
- AC-004：Cloud Mode 登录后保存新 Capture，会在 Supabase/Postgres 创建/更新当前用户的 capture。
- AC-005：Cloud Mode 上传成功后，本地不长期保留完整原文，仅保留 metadata + cloud ID。
- AC-006：Cloud Mode 上传失败时，Capture 回落保存为本地数据，UI 提供后续“上传云端”。
- AC-007：切换到 Cloud Mode 不自动上传历史本地 Capture。
- AC-008：本地 Capture 逐条手动上传成功后变为 cloud-backed。
- AC-009：敏感内容命中时，Cloud Mode 保存和手动补传都需要二次确认。
- AC-010：云端列表/详情只返回当前用户数据，跨用户访问失败。
- AC-011：删除 cloud-backed Capture 时，云端记录与本地映射/副本一起删除。
- AC-012：上传 Capture 不触发服务端 AI 分析任务。
- AC-013：现有 extension 测试、typecheck、build 通过。

## 测试策略
- API contract/integration：
  - auth register/login/refresh/logout
  - captures create/upsert/list/detail/delete
  - user isolation and unauthorized access
  - no AI job creation after capture upload
- Extension unit/integration：
  - settings default Local Mode
  - mode switching and login state
  - background save routing: local vs cloud
  - cloud success local metadata behavior
  - cloud failure local fallback
  - manual upload action
  - sensitive upload confirmation gate
  - delete cloud-backed Capture
- UI tests：
  - settings mode selector and auth states
  - Capture local/cloud badges
  - upload-to-cloud button visibility
  - cloud detail fetch when local full text absent
- Regression：
  - existing extractor tests
  - existing DB migration tests
  - WXT build

## 任务拆解
详细计划见 `docs/superpowers/plans/2026-06-04-cloud-mode-api-server.md` 与 `openspec/changes/archive/2026-06-05-cloud-mode-api-server/tasks.md`。

- [x] T-001 API Server Skeleton And Health
  - 创建 `api-server/` Python FastAPI 项目与 `/health`。
  - 测试：`api-server/tests/test_health.py`
- [x] T-002 Supabase Business Tables
  - 在 Supabase 建立 `public.users`、`public.refresh_tokens`、`public.captures`、索引和 updated_at trigger。
  - 测试：`api-server/tests/test_supabase_client.py`
- [x] T-003 Auth Contract
  - 实现邮箱密码注册、登录、刷新、退出。
  - 测试：`api-server/tests/test_auth.py`
- [x] T-004 User-Scoped Capture API
  - 实现 authenticated create/upsert/list/detail/delete，按 user 隔离。
  - 测试：`api-server/tests/test_captures.py`
- [x] T-005 Extension Settings And Local Schema
  - 增加 `storage_mode`、cloud session、本地 capture cloud metadata。
  - 测试：`extension/tests/db/migrations.test.ts`、`extension/tests/db/settings.test.ts`
- [x] T-006 Extension Cloud API Client
  - 新增 typed cloud API client，覆盖 auth 和 captures。
  - 测试：`extension/tests/lib/cloud-api.test.ts`
- [x] T-007 Background Save Routing And Fallback
  - `SAVE_REQUEST` 按 Local/Cloud Mode 分流；云端失败回落本地。
  - 测试：`extension/tests/background/save-routing.test.ts`
- [x] T-008 Settings UI For Local/Cloud Mode And Auth
  - Settings 加本地/云端选择、注册/登录/退出、API base URL。
  - 测试：`extension/tests/options/Settings.test.tsx`
- [x] T-009 Capture List/Detail Cloud State, Upload, Delete
  - 列表/详情展示 local/cloud 状态，逐条上传，云端详情读取，一起删除。
  - 测试：`extension/tests/options/CaptureList.test.tsx`、`extension/tests/options/CaptureDetail.test.tsx`
- [x] T-010 Permissions, Integration, And Docs
  - 增加 cloud API host permission，跑 API/extension/OpenSpec 验证。
  - 验证：`uv run pytest`、`bunx vitest run`、`bunx tsc --noEmit`、`bunx wxt build`、`openspec validate cloud-mode-api-server --strict`

## 实现与测试记录
- API server：
  - 新增 FastAPI app、health route、Supabase REST client。
  - 新增自有业务用户注册/登录/刷新/退出、user-scoped captures CRUD/upsert。
  - 测试：`api-server/tests/test_health.py`、`test_auth.py`、`test_captures.py`、`test_supabase_client.py`。
- Extension：
  - Settings 增加 Local Mode / Cloud Mode、API base URL、cloud session。
  - Local SQLite 增加 `storage_state`、`cloud_capture_id`、`cloud_uploaded_at`、`upload_error`。
  - Background `SAVE_REQUEST` 按 storage mode 分流；云端失败回落本地；敏感内容未确认时不上传云端。
  - Options Capture list/detail 展示 local/cloud 状态；本地 Capture 可手动上传云端；cloud-backed detail 可远程读取；删除时云端和本地一起删除。
  - Manifest 增加 `http://localhost:8000/*` host permission，未使用 `<all_urls>`。

## 验证记录（DoD）
- [x] 所有测试通过  [ ] lint（项目无 lint script）  [x] typecheck  [x] build
- [x] 新增逻辑有测试  [x] 修改行为有回归  [x] 无无关 diff（`.output` 已按用户确认移出 Git 跟踪）  [x] 无绕过测试

## 需求追溯矩阵
| Requirement | Spec | Task | Test | Status |
|---|---|---|---|---|
| 历史本地数据默认不自动上传 | FR-010 | T-009 | options tests | done |
| 本地 Capture 可逐条手动上传云端 | FR-010/FR-011 | T-007/T-009 | options/background tests | done |
| 云端版上传成功后本地不长期保留完整原文 | FR-008 | T-005/T-007 | save-routing tests | done |
| 云端上传失败回落为本地数据并支持后续手动同步 | FR-009 | T-007/T-009 | save-routing/options tests | done |
| 云端版第一版使用邮箱密码注册登录 | FR-005 | T-003/T-008 | auth/settings tests | done |
| API server 采用 Python 技术栈 | FR-003 | T-001 | health/API tests | done |
| 云端数据库第一版直接使用 Supabase/Postgres | FR-004 | T-002 | model/migration tests | done |
| 云端第一版不做 AI 分析 | FR-015 | T-004 | capture API tests | done |
| 云端上传完整原文消息和 extraction metadata | FR-007 | T-004/T-006/T-007 | API/client/routing tests | done |
| 删除已上传 Capture 时云端与本地一起删除 | FR-014 | T-004/T-009 | API/detail tests | done |
| 第一版个人数据查看只做插件 options_page | FR-013 | T-008/T-009 | options tests | done |
| 个人本地版默认且不依赖云端 | FR-001/FR-002 | T-005/T-007/T-008 | settings/routing tests | done |

## 审查记录
- N7 current-agent review（2026-06-05）：
  - P1/P2：未发现阻塞级代码正确性问题。
  - 已修复：Manual Backfill 上传 payload 现在保留原始 `source_fingerprint`，避免云端 upsert 退化为按本地 id 新建重复记录。
  - 已处理：`extension/.output/` 已加入 `.gitignore`，并从 Git 索引移除；本地构建产物仍保留在磁盘。
  - 残余风险：第一版 cloud API host permission 只加入 `http://localhost:8000/*`；生产域名确定后需要补对应 host permission。

## 决策与归档（ADR）
- N8 归档完成（2026-06-05）：OpenSpec change `cloud-mode-api-server` 已归档为 `openspec/changes/archive/2026-06-05-cloud-mode-api-server/`。
- 主规格已更新：
  - `openspec/specs/cloud-mode-api-server/spec.md`
  - `openspec/specs/capture-save/spec.md`
  - `openspec/specs/capture-discovery/spec.md`
- 关键设计决策：
  - 默认 Local Mode；Cloud Mode 必须注册/登录后启用。
  - 历史本地数据不自动上传，只能逐条 Manual Backfill。
  - Cloud Mode 上传失败必须 Upload Fallback 到本地，避免内容丢失。
  - 云端第一版通过 Supabase REST + service role key 访问业务表，不做数据库抽象层。
  - API Server 使用 Python/FastAPI，第一版不做 AI 分析，但保留后续扩展空间。
  - 删除 cloud-backed Capture 时云端和本地一起删。
- 被否方案：
  - Taskmaster 默认介入：本轮已明确不使用。
  - 云端版自动全量补传历史数据：因隐私与可控性风险被否。
  - 第一版支持 MySQL/SQLite/PG 多数据库抽象：因当前明确选择 Supabase/Postgres 被延后。
  - 独立 Web Console：第一版仅做 extension options page。
- 遗留 TODO：
  - 生产部署域名确定后，补充 extension host permission。
  - 生产 `api-server` 需要配置 `AI_MCE_SUPABASE_URL` / `AI_MCE_SUPABASE_SERVICE_ROLE_KEY`；service role key 只能放在后端环境变量。
