## Context

AI Memory Capture 是一个 monorepo 项目，当前有 `extension/`（浏览器端 Chrome Extension，TypeScript）和 `api-server/`（Python FastAPI 云端 API）。浏览器端采集已完成，通过 `POST /v1/captures` 上报 `ExtractedConversation` payload。

现在需要新增 `scanner/` 子系统作为桌面端采集通道。该子系统是一个独立的 Go 二进制，通过 macOS launchd 守护进程运行，扫描本地 4 个 AI CLI 工具的已完成对话并自动上报到同一个 API Server。

所有设计决策已在 grill-with-docs 阶段完成，记录于 `docs/adr/0001-desktop-channel-scanner-architecture.md` 和 `docs/desktop-channel-design-decisions.md`。

## Goals / Non-Goals

**Goals:**

- 自动采集 Claude Code、Codex、Grok、OpenCode 四个工具的已完成 session
- 增量处理：只上报新增或变更的 session，不重复处理
- 与浏览器端数据统一：同一个 Capture 实体、同一个 API 接口、同一个用户账号
- 可靠上报：失败重试 + 本地暂存
- 零维护运行：launchd 开机自启、崩溃自动重启、WatchPaths 按需触发

**Non-Goals:**

- 修改 API Server 接口或 Extension 代码
- 支持 macOS 以外的操作系统
- 采集正在进行中的对话（只采集 Completed Session）
- 用户手动确认流程
- Web Console 的展示逻辑变更

## Decisions

### D1: Go + 单二进制

**选择**：Go 语言，编译为单个二进制文件。

**替代方案**：
- TypeScript + Bun：可复用 Extension 类型定义，但把系统守护进程耦合到 JS 运行时
- Python：可复用 API Server schema，但打包分发和守护进程不够轻量

**理由**：Go 编译为零依赖单二进制，标准库覆盖 HTTP/JSON/文件操作，`modernc.org/sqlite` 提供纯 Go SQLite。每个端用最佳技术栈。

### D2: 纯扫描服务，不用 hooks

**选择**：一个扫描进程 + per-tool parser，直接读各工具的 session 存储文件。

**替代方案**：
- Per-tool hooks（Claude Code SessionEnd 等）：部分工具无 hook 能力，需要维护 N 套 hook 脚本
- 混合方案：两条数据通路翻倍复杂度

**理由**：与工具解耦，新增工具只需新增 parser。

### D3: launchd WatchPaths 触发

**选择**：macOS launchd 的 `WatchPaths` 机制，监听各工具 session 目录变更时触发扫描。

**替代方案**：
- cron 定时轮询：有延迟，环境变量容易踩坑
- fsnotify 长驻进程：需要自己管理进程生命周期

**理由**：launchd 原生支持，只在文件变更时唤醒，省资源。开机自启 + 崩溃重启内建。

### D4: Watermark SQLite + content_hash 增量

**选择**：本地 SQLite 数据库（`~/.mce-scanner/state.db`），记录 `{file_path, content_hash, status, payload?, last_uploaded_at}`。

**替代方案**：
- 基于 mtime：可被触碰/拷贝改变
- 基于 session_id 集合：无法检测 session 内容更新

**理由**：hash 变化精确检测新增和更新，同时复用 API 端的 content_hash 幂等机制做二次校验。

### D5: 独立认证

**选择**：Scanner 用独立的 email/password 登录 API Server，token 持久化到 `~/.mce-scanner/auth.json`。

**理由**：外部进程无法访问 Chrome Extension 的存储。同一个用户账号保证数据关联。

### D6: source_url = "desktop"

**选择**：所有桌面端 Capture 的 `source_url` 固定为 `"desktop"`。`platform` 字段区分具体 AI 工具。

**理由**：最简方案。浏览器端看 URL，桌面端看固定字符串，一个字段区分渠道。

### D7: 10 分钟 Completed Session 阈值

**选择**：文件最后修改时间超过 10 分钟视为已完成。

**理由**：避免采集半截对话。10 分钟是 CLI 工具空闲超时的合理阈值。

## Architecture

```
┌─────────────────────────────────────────┐
│          mce-scanner binary             │
│                                         │
│  ┌─────────┐  ┌──────────────────────┐  │
│  │  main   │──│  Scanner Loop        │  │
│  │  (cmd)  │  │  - discover sessions │  │
│  └─────────┘  │  - check completion  │  │
│               │  - dispatch parsers  │  │
│               └──────────┬───────────┘  │
│                          │              │
│  ┌───────────────────────┼───────────┐  │
│  │         Parsers       │           │  │
│  │  ┌─────────┐ ┌──────────┐        │  │
│  │  │Claude   │ │ Codex    │        │  │
│  │  │Code     │ │          │        │  │
│  │  └─────────┘ └──────────┘        │  │
│  │  ┌─────────┐ ┌──────────┐        │  │
│  │  │ Grok    │ │ OpenCode │        │  │
│  │  └─────────┘ └──────────┘        │  │
│  └───────────────────────────────────┘  │
│                          │              │
│  ┌───────────┐  ┌────────┴──────────┐  │
│  │ Watermark │  │   API Client      │  │
│  │    DB     │  │ - auth (login)    │  │
│  │ (SQLite)  │  │ - upload capture  │  │
│  │           │  │ - retry 3x        │  │
│  └───────────┘  └───────────────────┘  │
└─────────────────────────────────────────┘
         ▲                    │
         │ WatchPaths         │ POST /v1/captures
    ┌────┴─────┐        ┌────┴──────┐
    │  launchd │        │ API Server│
    └──────────┘        └───────────┘
```

### Package Layout

```
scanner/
├── cmd/mce-scanner/
│   └── main.go              # CLI entry point (scan / login / status)
├── internal/
│   ├── scanner/
│   │   └── scanner.go       # Main scan loop: discover → check → parse → upload
│   ├── parser/
│   │   ├── parser.go        # Parser interface
│   │   ├── claudecode.go    # Claude Code JSONL parser
│   │   ├── codex.go         # Codex JSONL parser
│   │   ├── grok.go          # Grok multi-file parser
│   │   └── opencode.go      # OpenCode SQLite parser
│   ├── watermark/
│   │   └── watermark.go     # Watermark DB operations
│   ├── api/
│   │   └── client.go        # API Server client (auth + upload + retry)
│   └── config/
│       └── config.go        # Config loading (~/.mce-scanner/config.json)
├── pkg/model/
│   └── capture.go           # ExtractedConversation / Capture payload structs
├── launchd/
│   └── com.mce.scanner.plist # launchd plist template
├── go.mod
├── go.sum
└── CLAUDE.md
```

### Data Flow

1. launchd 检测到 WatchPaths 目录变更 → 启动 `mce-scanner`
2. Scanner 遍历 4 个工具的 session 目录
3. 对每个 session 文件/目录：检查 mtime > 10 分钟（Completed Session）
4. 查询 Watermark DB：该 file_path 是否已处理？content_hash 是否变化？
5. 未处理或 hash 变化 → 调用对应 Parser 解析为 `ExtractedConversation`
6. 调用 API Client 上报 `POST /v1/captures`
7. 成功 → 更新 Watermark DB（file_path + content_hash + uploaded_at）
8. 失败 → 重试最多 3 次 → 仍失败 → 将 payload 暂存到 Watermark DB 的 pending_uploads 表

### Watermark DB Schema

```sql
CREATE TABLE sessions (
    file_path    TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    platform     TEXT NOT NULL,
    session_id   TEXT,
    uploaded_at  TEXT,
    status       TEXT NOT NULL DEFAULT 'uploaded'  -- uploaded | pending_retry
);

CREATE TABLE pending_uploads (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path    TEXT NOT NULL,
    payload      TEXT NOT NULL,  -- JSON serialized ExtractedConversation
    retry_count  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    last_error   TEXT
);
```

## Risks / Trade-offs

- **[格式不稳定]** CLI 工具可能更新 session 存储格式 → 每个 parser 模块化隔离，单个 parser 失败不阻塞其他。日志明确报告哪个 parser 出错。
- **[文件锁]** OpenCode 的 SQLite 可能被主进程锁定 → 用 `WAL` 模式只读打开；打开失败则跳过本轮。
- **[大文件]** 某些 session 可能很大（>2MB）→ 按现有 API payload 限制处理：>200KB 警告日志，>2MB 截断或跳过。
- **[认证过期]** Token 过期 → Scanner 检测 401 响应后尝试 refresh；refresh 也失败则暂存 payload，日志提示重新登录。
- **[WatchPaths 限制]** launchd WatchPaths 不递归 → 需要列出所有叶子目录路径，或在 plist 中使用一级目录 + Scanner 内部遍历。选择后者：WatchPaths 监听一级目录（`~/.claude/projects`、`~/.codex/sessions` 等），Scanner 内部递归发现 session。
