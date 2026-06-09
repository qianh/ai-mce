---
feature: desktop-scanner
executor: claude-code
scores: { 规模: H, 风险: M, 项目: 老, 领域清晰度: 清晰 }
nodes: [NS, N0, N1, N3, N4, N5, N6, N7]
flavors: { NS: Explore, N0: init, N1: grill-with-docs, N3: openspec, N4: writing-plans, N5: tdd, N7: requesting-code-review }
execution_modes: { NS: done, N0: current-agent, N1: done, N3: current-agent, N4: current-agent, N5: current-agent, N6: current-agent, N7: current-agent }
deps_check: { Explore: ok, init: ok, grill-with-docs: ok, openspec: ok, writing-plans: ok, tdd: ok, verification-before-completion: ok, requesting-code-review: ok }
status: spec-locked
created: 2026-06-08
---

# Desktop Scanner · Spec

## 涉及服务 / 跨仓范围 <!-- NS ✅ 已完成 -->

- 当前项目：`ai-mce/` monorepo
- **scanner/** (新建，Go) — 桌面端采集通道，本次核心交付
- **api-server/** (Python/FastAPI) — 接收 `POST /v1/captures`，需确认接口兼容桌面端 payload
- **extension/** (TypeScript) — `ExtractedConversation` 数据模型参考（不修改）
- **CONTEXT.md / CLAUDE.md / ADR** — 已在 grill-with-docs 阶段更新

## 问题与非目标 <!-- N1 ✅ 已完成 -->

- **痛点**：个人 AI CLI 工具（Claude Code、Codex、Grok、OpenCode）的对话数据散落在本地文件系统，无法统一查看和分析
- **用户**：个人开发者（项目所有者自己）
- **要解决**：自动采集 4 个 CLI 工具的已完成对话，转为标准 Capture 格式，上报到与浏览器端相同的云端 API，统一在 Web Console 查看
- **非目标**：
  - 浏览器端 Extension 的任何修改
  - API Server 的接口变更（复用现有 `POST /v1/captures`）
  - Web Console 的展示逻辑变更
  - 支持 Linux / Windows（仅 macOS launchd）
  - 实时采集正在进行中的对话
  - 用户手动确认流程（桌面端全自动）
- **失败路径**：
  - CLI 工具更新存储格式导致 parser 失效 → parser 模块化设计，单个失败不影响其他
  - API Server 不可达 → 重试 3 次后暂存本地
  - 对话文件被外部进程锁定 → 跳过本轮，下次扫描重试

## 领域词表 <!-- N2 N/A -->

N/A — 领域清晰度=清晰，术语已在 CONTEXT.md 中定义（Browser Channel、Desktop Channel、Scanner、Parser、Watermark Database、Completed Session）。

## 需求 <!-- N3 ✅ 已完成 -->

### 功能需求

- **FR-001 Scanner CLI**：`mce-scanner` 支持 `scan`（默认，单次扫描）、`login`（认证）、`status`（状态查询）子命令
- **FR-002 Session 发现**：自动遍历 4 个工具的已知存储路径发现 session 文件
- **FR-003 Completed Session 检测**：仅处理文件 mtime > 10 分钟的 session
- **FR-004 Claude Code Parser**：解析 `~/.claude/projects/{project}/{uuid}.jsonl` 中的 human/assistant 消息
- **FR-005 Codex Parser**：解析 `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` 中的 session_meta 和 response_item
- **FR-006 Grok Parser**：解析 `~/.grok/sessions/{path}/{uuid}/` 目录下的 chat_history.jsonl + summary.json
- **FR-007 OpenCode Parser**：从 `~/.local/share/opencode/opencode.db` SQLite 查询 session → message → part
- **FR-008 Watermark DB**：本地 SQLite（`~/.mce-scanner/state.db`）跟踪已处理 session（file_path + content_hash）
- **FR-009 独立认证**：email/password 登录，token 持久化到 `~/.mce-scanner/auth.json`
- **FR-010 Capture 上报**：POST 到 `/v1/captures`，payload 与浏览器端结构一致
- **FR-011 重试与暂存**：5xx/网络错误重试 3 次（指数退避 1s/2s/4s），仍失败则暂存到 pending_uploads
- **FR-012 Token 自动刷新**：401 响应时尝试 refresh_token，refresh 也失败则暂存 payload 并提示重新登录
- **FR-013 launchd 集成**：提供 plist 文件，WatchPaths 监听 4 个工具的 session 目录
- **FR-014 扫描幂等**：多次运行不产生重复上报（watermark + API 端 content_hash 双重去重）

### 非功能需求

- **NFR-001 单二进制**：Go 编译为无外部依赖的单个可执行文件
- **NFR-002 纯 Go SQLite**：使用 `modernc.org/sqlite`，不依赖 cgo
- **NFR-003 隔离容错**：单个 parser 失败不阻塞其他工具的采集
- **NFR-004 只读访问**：OpenCode SQLite 以 WAL 只读模式打开，不干扰工具正常运行

## 数据模型 / API / 兼容 <!-- N3 ✅ 已完成 -->

### ExtractedConversation 结构（Go 侧）

```go
type Source struct {
    Platform     string `json:"platform"`      // "claude" | "codex" | "grok" | "opencode"
    URL          string `json:"url"`           // 固定 "desktop"
    BrowserTitle string `json:"browser_title"` // session 标题
    CapturedAt   string `json:"captured_at"`   // ISO 8601
}

type ExtractedMessage struct {
    Role    string `json:"role"`    // "user" | "assistant" | "system"
    Content string `json:"content"`
    Index   int    `json:"index"`
}

type ExtractionQuality struct {
    Confidence        float64 `json:"confidence"`
    Method            string  `json:"method"`             // "cli_session"
    Warnings          []string `json:"warnings"`
    MessageCount      int     `json:"message_count"`
    EmptyMessageCount int     `json:"empty_message_count"`
}

type Hashes struct {
    ContentHash      string   `json:"content_hash"`       // SHA-256
    MessageHashes    []string `json:"message_hashes"`
    SourceFingerprint string  `json:"source_fingerprint"` // "{platform}:desktop"
}

type ExtractedConversation struct {
    SchemaVersion    string            `json:"schema_version"`    // "1.0"
    ExtractorVersion string            `json:"extractor_version"` // "scanner-1.0"
    Source           Source            `json:"source"`
    Content          Content           `json:"content"`
    ExtractionQuality ExtractionQuality `json:"extraction_quality"`
    Hashes           Hashes            `json:"hashes"`
    Metadata         map[string]any    `json:"metadata,omitempty"`
}
```

### API 兼容

- 复用现有 `POST /v1/captures`，不修改 API Server
- `CaptureCreateRequest` 字段映射：`source` → Source, `content` → Content, `extraction_quality` → ExtractionQuality, `hashes` → Hashes, `metadata` → Metadata

### Watermark DB Schema

```sql
CREATE TABLE sessions (
    file_path    TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    platform     TEXT NOT NULL,
    session_id   TEXT,
    uploaded_at  TEXT,
    status       TEXT NOT NULL DEFAULT 'uploaded'
);

CREATE TABLE pending_uploads (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path    TEXT NOT NULL,
    payload      TEXT NOT NULL,
    retry_count  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    last_error   TEXT
);
```

## 验收标准 <!-- N3 ✅ 已完成 -->

- **AC-001**：`mce-scanner` 能发现并解析本机 Claude Code 的已完成 session
- **AC-002**：`mce-scanner` 能发现并解析本机 Codex 的已完成 session
- **AC-003**：`mce-scanner` 能发现并解析本机 Grok 的已完成 session
- **AC-004**：`mce-scanner` 能发现并解析本机 OpenCode 的已完成 session
- **AC-005**：上报到 API Server 的 Capture 在 Web Console 可见，source_url = "desktop"
- **AC-006**：重复运行不产生重复 Capture（watermark 去重 + API 幂等）
- **AC-007**：API Server 不可达时 payload 暂存本地，恢复后自动重传
- **AC-008**：正在进行中的 session（mtime < 10 分钟）被跳过
- **AC-009**：某个工具的 parser 失败不影响其他工具的采集
- **AC-010**：launchd plist 加载后，session 目录有新文件时自动触发扫描

## 测试策略 <!-- N3 ✅ 已完成 -->

- **单元测试**：每个 parser 使用 fixture 文件测试；watermark DB CRUD 操作测试；content hash 计算测试；API client 使用 mock HTTP server 测试
- **集成测试**：构建完整 mock 环境（temp 目录 + 4 种 fixture + mock API），验证端到端 scan cycle
- **手工验收**：在本机用真实 session 数据运行 `mce-scanner`，验证 API Server 收到 Capture

## 任务拆解 <!-- N4 ✅ 已完成 -->

详见 `openspec/changes/desktop-scanner/tasks.md`（共 9 组 27 个任务）：

1. 项目底座与数据模型（3 任务）
2. Watermark 数据库（3 任务）
3. Content Hashing（3 任务）
4. Parser 接口与实现（9 任务）
5. API Client（5 任务）
6. Scanner 主循环（5 任务）
7. CLI 入口（3 任务）
8. launchd 集成（2 任务）
9. 集成测试与验证（2 任务）

## 实现与测试记录 <!-- N5 待执行 -->

N/A

## 验证记录（DoD） <!-- N6 待执行 -->

- [ ] 所有测试通过  [ ] lint  [ ] typecheck  [ ] build
- [ ] 新增逻辑有测试  [ ] 修改行为有回归  [ ] 无无关 diff  [ ] 无绕过测试

## 审查记录 <!-- N7 待执行 -->

N/A

## 决策与归档（ADR） <!-- N8 N/A -->

设计决策已在 grill-with-docs 阶段完成，记录于：
- `docs/adr/0001-desktop-channel-scanner-architecture.md`
- `docs/desktop-channel-design-decisions.md`
