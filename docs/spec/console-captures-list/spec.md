---
feature: console-captures-list
executor: claude-code
scores: { 规模: M, 风险: L, 项目: 老, 领域清晰度: 清晰 }
nodes: [NS, N1, N3, N4, N5, N6, N7]
flavors: { NS: Explore-agent, N1: grill-with-docs, N3: openspec, N4: superpowers:writing-plans, N5: superpowers:test-driven-development, N6: superpowers:verification-before-completion, N7: superpowers:requesting-code-review }
execution_modes: { NS: current-agent, N1: current-agent, N3: current-agent, N4: current-agent, N5: current-agent, N6: current-agent, N7: current-agent }
deps_check: { Explore: ok, grill-with-docs: ok, openspec: ok, superpowers: ok }
status: spec-locked
created: 2026-06-09
---

# console-captures-list · Spec

## 涉及服务 / 跨仓范围（NS）

- **当前项目**：monorepo `/Users/hong/John/ai/ai-mce`
- **关联服务/仓**：

| 服务 | 角色 | 本功能改动面 |
|---|---|---|
| `api-server/` | 云端 API（Python FastAPI + Supabase） | 现有 `GET /v1/captures` 需加 `source_side` / `source_platform` 过滤参数 |
| `extension/` | Browser Channel 上报入口，含 options 页 CaptureList | 若"客户端"=Extension，需增加 source_side 筛选 UI |
| `scanner/` | Desktop Channel 上报入口（Go） | 只读，无需改动 |
| `console/`（待创建） | 独立 Web Console | 若"客户端"=新 Console，需从零创建 |

- **关联 API / 配置 / DB**：
  - `GET /v1/captures` → `api-server/app/routes/captures.py`
  - 数据模型：`captures` 表，关键字段 `source_url`（"desktop" 或真实 URL）、`source_platform`、`created_at`
  - 端侧推断规则：`source_url == "desktop"` → 桌面端；否则 → 浏览器端
  - 鉴权：Bearer JWT token（HS256，15 min 有效期，支持 refresh）
  - CORS：当前仅允许 `chrome-extension://` 和 `localhost`；若新建 Web Console 需更新

- **完整功能边界（待 N1 确认）**：
  - ⚠️ **未确认**："客户端"是指 Extension options 页面，还是新独立 Web Console？
  - ⚠️ **未确认**："渠道"具体映射哪些值（`source_platform` 的枚举？）
  - ⚠️ **未确认**："端侧"筛选的两个选项名称（browser/desktop？浏览器/桌面？）

## 问题与非目标（N1）

**要解决的痛点**：扩展插件是小众渠道；需要独立 Web Console 让更多用户（不安装插件也能）查看自己所有渠道的上报数据。

**用户是谁**：已注册账号、用 Scanner 或扩展上报过 Capture 的 Registered User。

**范围（已确认）**：
- 新建独立 `console/` 应用（Bun + React 19 + React Router 7，不在扩展内）
- 登录页（email/password，调 `POST /v1/auth/login`，与 Scanner 同账号）
- Captures 列表页：
  - **端侧筛选**：Browser Channel / Desktop Channel（由 `source_url == "desktop"` 推断），服务端过滤
  - **渠道筛选**：具体 AI 产品（`source_platform`：chatgpt/deepseek/claude/codex/grok/opencode），服务端过滤
  - 按 `created_at` 倒序，`limit` + `offset` 分页
- Capture 详情页（点击列表条目进入，展示完整 messages）
- 详情页删除功能（调 `DELETE /v1/captures/{id}`，删后返回列表）

**非目标（明确不做）**：
- 从 Web Console 创建或上传 Capture
- 编辑 Capture 内容
- Manual Backfill（上传本地数据到云端）
- 生产域名 CORS 配置（开发阶段 localhost 已通，部署留后期）
- 注册账号（用已有账号登录）

**失败路径**：
- 登录失败（密码错误）：展示错误提示，留在登录页
- Token 过期：用 refresh_token 自动续期；续期失败则跳回登录页
- 列表加载失败：展示错误状态，提供重试入口
- 删除失败：展示 toast 错误，不离开详情页

## 领域词表（N2）

N/A

## 需求（N3）

**功能需求（4 个能力）：**

| 能力 | 说明 |
|---|---|
| `console-app-shell` | Bun + React 19，路由，JWT token 管理（localStorage + refresh + 过期跳转） |
| `captures-list-page` | 列表页：端侧筛选 + 渠道筛选（服务端），limit/offset 分页，created_at 倒序 |
| `capture-detail-page` | 详情页：完整 messages 展示 + 删除按钮（二次确认，DELETE API） |
| `api-list-filters` | GET /v1/captures 加 source_side / source_platform / limit / offset query params |

**非功能需求：**
- NFR-001: 复用 Extension CSS design tokens（不引入新视觉体系）
- NFR-002: 筛选切换时取消上一个进行中的请求（避免竞态）
- NFR-003: API 新参数向后兼容（不传时行为不变）

## 数据模型 / API / UI / 兼容 / 权限（N3）

**API 变更（GET /v1/captures 新增 query params）：**

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `source_side` | `browser`\|`desktop` | 不传 | 端侧过滤；browser→`source_url!=desktop`，desktop→`source_url=desktop` |
| `source_platform` | string | 不传 | AI 产品过滤（chatgpt/claude/codex/…） |
| `limit` | int | 20，max 100 | 分页大小 |
| `offset` | int | 0 | 分页偏移 |

**Response schema 不变**（仍为 `list[CaptureListItem]`）。

**权限**：Bearer JWT token，与现有端点一致。

**CORS**：已支持 localhost，无需改动。

**目录结构（新建）：**
```
console/
├── src/
│   ├── main.tsx
│   ├── App.tsx              # 路由: /login, /, /capture/:id
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── CaptureList.tsx
│   │   └── CaptureDetail.tsx
│   ├── lib/
│   │   ├── api.ts           # fetch wrapper + auth header
│   │   ├── auth.ts          # token 存取、refresh、logout
│   │   └── types.ts
│   └── index.html
└── package.json
```

## 验收标准（N3）

- AC-001: `bun run dev` 启动，未登录访问 `/` 跳转 `/login`
- AC-002: email/password 登录成功，localStorage 存两个 token，刷新页面保持登录
- AC-003: 列表页默认展示最新 20 条，按 created_at 倒序
- AC-004: 端侧筛选「桌面端」只显示 source_url=="desktop" 的 Captures
- AC-005: 渠道筛选和端侧筛选同时生效（AND 关系）
- AC-006: 「加载更多」追加下一页；返回 < 20 条时按钮隐藏
- AC-007: 点击列表条目跳转详情页，展示完整 messages（user/assistant 视觉区分）
- AC-008: 详情页删除 → 二次确认 → DELETE API → 跳回列表
- AC-009: token 过期自动 refresh；refresh 失败跳登录页
- AC-010: API 不传新参数时，GET /v1/captures 返回结果与改动前一致

## 测试策略（N3）

- **单元**：auth.ts token 逻辑；API query 参数构建；端侧推断显示
- **集成**：mock API server 验证筛选参数正确性；TestClient 验证 API 各参数组合
- **E2E/手工**：完整登录 → 列表筛选 → 详情查看 → 删除 → 验证 Supabase 数据已删除

## 任务拆解（N4）

详细实现计划见 `docs/superpowers/plans/2026-06-09-console-captures-list.md`

- [ ] T-1: API — GET /v1/captures 加 source_side / source_platform / limit / offset 过滤参数（`api-server/`）
- [ ] T-2: Console 项目骨架（Bun + React 19 + React Router 7 + tokens.css 复用）
- [ ] T-3: Auth 层 — types.ts / auth.ts / api.ts / Login.tsx / 路由守卫
- [ ] T-4: CaptureList 页 — 双维筛选 + 加载更多分页
- [ ] T-5: CaptureDetail 页 — messages 展示 + 二次确认删除

## 实现与测试记录（N5）

<!-- 待实现 -->

## 验证记录（DoD）（N6）

- [ ] 所有测试通过  [ ] lint  [ ] typecheck  [ ] build
- [ ] 新增逻辑有测试  [ ] 修改行为有回归  [ ] 无无关 diff

## 审查记录（N7）

<!-- 待审查 -->

## 决策与归档（N8）

<!-- 待归档 -->
