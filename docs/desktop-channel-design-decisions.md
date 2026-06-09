# Desktop Channel 设计决策全记录

本文档完整记录了 AI Memory Capture 桌面端采集通道（Desktop Channel）的设计讨论过程和所有决策结论。讨论于 2026-06-07 进行。

---

## 背景

AI Memory Capture 项目的目标是收集个人所有散落的 AI 对话数据，用于个人数据分析、画像沉淀和第二大脑建立。浏览器端通过 Chrome Extension 已完成内容采集和上报。接下来需要解决桌面端 AI CLI 工具（Claude Code、Codex、Grok、OpenCode）的对话数据采集。

---

## 决策记录

### 决策 1：数据实体 — 同一个 Capture

**问题**：桌面端采集到的数据，是和浏览器端 Capture 相同的实体，还是新的概念？

**结论**：同一个 Capture 实体。用户消费数据时（查看、搜索、分析）不区分来源渠道。浏览器插件和桌面端扫描服务只是不同的采集通道，最终都汇入同一个数据模型。

---

### 决策 2：采集模式 — 全自动，无需用户确认

**问题**：浏览器端的 Key Invariant 是 "Never auto-upload, every capture requires explicit user action"。桌面端是否遵循同一规则？

**结论**：不遵循。桌面端全自动采集 + 全自动上报，无需用户确认。理由：
- CLI 工具使用频率极高（一天 20+ session），手动确认不现实
- 这是个人数据，全量采集最大化数据完整性
- Key Invariant 修改为按渠道限定：浏览器端需用户显式操作，桌面端自动

---

### 决策 3：支持工具范围

**问题**：第一期支持哪些桌面 AI CLI 工具？

**结论**：四个工具：
1. **Claude Code**
2. **Codex**（OpenAI）
3. **Grok** / Agent
4. **OpenCode**

---

### 决策 4：架构 — 纯扫描服务 + per-tool parser

**问题**：用 hooks（每个工具的 SessionEnd hook）还是本地扫描服务？

**实际调查结果**：

| 工具 | 存储位置 | 格式 | Hook 能力 |
|---|---|---|---|
| Claude Code | `~/.claude/projects/{项目}/` | JSONL（每个 session 一个文件） | 完整 hooks API（SessionEnd 等） |
| Codex | `~/.codex/sessions/YYYY/MM/DD/` | JSONL（session_meta + event_msg + response_item） | 有 hooks.json，支持 SessionStart/Stop |
| Grok | `~/.grok/sessions/{url编码路径}/{session_id}/` | 多文件：chat_history.jsonl + summary.json + events.jsonl | 未确认 |
| OpenCode | `~/.local/share/opencode/opencode.db` | SQLite（session → message → part） | 未确认 |

**被否决的方案**：
- **Per-tool hooks**：每个工具一套 hook 实现，但有些工具根本没有 hook 能力，覆盖不到
- **混合方案**（有 hooks 的用 hooks，没有的用扫描）：两条数据通路、两套去重逻辑、两种错误处理模式，复杂度翻倍

**结论**：纯扫描服务。一个进程 + N 个 parser，与工具的 hook 机制完全解耦。新增工具 = 新增一个 parser，零入侵。

---

### 决策 5：运行形态 — macOS launchd 守护进程

**问题**：扫描服务以什么形态运行？

**被否决的方案**：
- **CLI + cron**：有延迟，cron 环境变量容易踩坑
- **长驻 CLI 进程**：需要用户手动管理生命周期
- **集成到 API Server**：把本地采集和云端服务耦合

**结论**：macOS launchd 守护进程。理由：
- 开机自启 + 崩溃自动重启，不依赖用户记得启动
- launchd 的 `WatchPaths` 可以监听目录变更才触发，不需要持续轮询
- 个人项目部署复杂度不是问题

---

### 决策 6：技术栈 — Go

**问题**：扫描服务用什么语言？

**被否决的方案**：
- **TypeScript + Bun**：和 Extension 共享类型定义，但把系统守护进程耦合到 JS 运行时
- **Python**：和 API Server 同栈，但做文件监听和常驻服务不够轻量，打包分发麻烦

**结论**：Go。理由：
- 编译成单个二进制，无运行时依赖，适合 launchd
- 标准库覆盖所有需求（JSON、HTTP、文件监听）
- `modernc.org/sqlite` 纯 Go SQLite 实现，可读 OpenCode 的数据库
- 作为独立技术栈，确保每个端使用最佳技术选型

---

### 决策 7：增量检测 — 本地 watermark SQLite

**问题**：扫描服务怎么知道哪些对话已经采集过？

**被否决的方案**：
- **基于文件修改时间（mtime）**：mtime 可被触碰/拷贝改变，不够可靠
- **基于 session_id 集合**：无法检测 session 内容更新

**结论**：本地 watermark SQLite 数据库，记录 `{file_path, content_hash, last_uploaded_at}`。存储在 `~/.mce-scanner/state.db`，与各工具数据目录解耦。每次扫描对比 hash，只上报新增或变更的 session。API 端的 `content_hash` 幂等做二次校验。

---

### 决策 8：上报方式 — 直接上报云端 API，独立认证

**问题**：扫描服务怎么上报数据？和浏览器 Extension 共享认证还是独立？

**技术限制**：
- 外部进程无法访问 Chrome Extension 的 OPFS SQLite（浏览器沙箱隔离）
- 外部进程无法读取 `chrome.storage.local` 中的 token

**结论**：扫描服务直接调用 `POST /v1/captures` 上报云端，使用独立的认证凭据（自己的 email/password 登录）。关键约束：**和浏览器 Extension 使用同一个用户账号**，这样两个通道的数据自然关联到同一个 user_id 下。Web Console 按 user_id 查询，即可展示来自所有通道的数据。

---

### 决策 9：platform 字段 — 保留，两个通道共用一套枚举

**问题**：`platform` 字段怎么处理 CLI 工具？

**结论**：保留 `platform` 字段，语义为"AI 产品标识符"。桌面端和浏览器端共用一套枚举值。`platform` 不区分渠道，只标识 AI 产品（`claude`、`chatgpt`、`codex`、`grok`、`opencode`、`deepseek` 等）。

---

### 决策 10：source_url — 浏览器端为真实 URL，桌面端统一为 `"desktop"`

**问题**：CLI 工具没有 URL，`source_url` 字段怎么填？

**被否决的方案**：
- 每个工具各一个值（如 `"desktop:claude-code"`）：和 `platform` 信息重复
- 带上下文信息（如项目路径）：`source_fingerprint` 已经做这个事

**结论**：所有桌面端 Capture 的 `source_url` 统一为固定字符串 `"desktop"`。区分浏览器端和桌面端只需看 `source_url` 是否为 `"desktop"`。区分具体 AI 产品靠 `platform` 字段。

---

### 决策 11：session 边界 — 一个 session = 一个 Capture

**问题**：CLI 对话里"一次对话"的边界是什么？

**结论**：四个工具都有明确的 session 概念：
- Claude Code：一个 JSONL 文件 = 一个 session
- Codex：一个 rollout JSONL 文件 = 一个 session
- Grok：一个 UUID 目录 = 一个 session
- OpenCode：SQLite 里一个 `session` 行 = 一个 session

一个 session 映射为一个 Capture。

---

### 决策 12：活跃 session — 只采集已结束的

**问题**：正在进行中的 session 是否采集？

**被否决的方案**：
- 采集所有 session 包括进行中的：半截对话是噪音，同一 session 多次上报增加 API 负担

**结论**：只采集已结束的 session。判断标准：**文件最后修改时间超过 10 分钟视为已结束**（Completed Session）。

---

### 决策 13：代码位置 — `scanner/` 目录

**问题**：Go 扫描服务在 monorepo 里怎么放？

**被否决的方案**：
- `desktop/`：听起来像桌面应用，造成误解
- 独立仓库：增加管理成本，个人项目没必要

**结论**：`ai-mce/scanner/` 目录，和 `extension/`、`api-server/` 平级。monorepo 的第四个子系统。

---

### 决策 14：Key Invariant 修改 — 按渠道限定

**问题**：原有的 "Never auto-upload" 规则怎么修改？

**被否决的方案**：
- 按部署模式限定（启用服务视为授权）：虽然更优雅但用户选择按渠道区分

**结论**：按渠道限定。修改为：
> Browser Channel: never auto-upload. Every browser-channel Capture requires explicit user action and a preview confirmation. Desktop Channel Captures are collected and uploaded automatically by the Scanner.

---

### 决策 15：扫描频率 — launchd WatchPaths

**问题**：扫描服务多久扫一次？

**结论**：使用 launchd 的 `WatchPaths` 机制，监听各 AI CLI 工具的 session 目录。当文件发生变更时 launchd 触发扫描进程，而不是定时轮询。省资源，响应及时。

---

### 决策 16：错误处理 — 重试 3 次 + 本地暂存

**问题**：上报失败怎么办？

**结论**：上报失败后重试 3 次。如果 3 次仍然失败，将 Capture payload 暂存到本地 watermark 数据库中，等待后续重试。

---

### 决策 17：CLI 交互 — 可选，非核心

**问题**：是否提供 `mce-scanner login` / `mce-scanner status` 之类的管理命令？

**结论**：可提供但非必须。核心功能是守护进程的无感运行。

---

## 最终架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Console                              │
│              (查看所有通道的 Capture 数据)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 读取
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API Server (Python/FastAPI)                    │
│                  POST /v1/captures (幂等)                        │
│              content_hash 去重 · 同一 user_id                    │
└──────────┬──────────────────────────────────┬───────────────────┘
           │                                  │
     ┌─────┴─────┐                    ┌───────┴────────┐
     │ Browser    │                   │ Desktop        │
     │ Channel    │                   │ Channel        │
     │            │                   │                │
     │ Chrome     │                   │ Go Scanner     │
     │ Extension  │                   │ (launchd)      │
     │            │                   │                │
     │ 用户手动    │                   │ 全自动采集      │
     │ 确认上报    │                   │ 全自动上报      │
     └─────┬─────┘                    └───────┬────────┘
           │                                  │
           ▼                                  ▼
   ┌──────────────┐            ┌─────────────────────────┐
   │ 浏览器 AI 页面 │           │ 本地 AI CLI 工具 Sessions │
   │ ChatGPT      │            │                         │
   │ Claude.ai    │            │ ~/.claude/projects/     │
   │ DeepSeek     │            │ ~/.codex/sessions/      │
   │ ...          │            │ ~/.grok/sessions/       │
   └──────────────┘            │ ~/.local/share/opencode/│
                               └─────────────────────────┘
```

## 技术栈总览

| 子系统 | 语言 | 运行环境 | 存储 |
|---|---|---|---|
| Extension (Browser Channel) | TypeScript + React | Chrome Extension (Manifest V3) | OPFS SQLite + chrome.storage.local |
| Scanner (Desktop Channel) | Go | macOS launchd daemon | Watermark SQLite (`~/.mce-scanner/state.db`) |
| API Server | Python + FastAPI | 云端服务 | Supabase/Postgres |
| Console | TBD | Web 前端 | 无（读 API） |

## 数据字段说明

| 字段 | 浏览器端 | 桌面端 | 说明 |
|---|---|---|---|
| `platform` | `chatgpt` / `claude` / `deepseek` / ... | `claude` / `codex` / `grok` / `opencode` | AI 产品标识，两个通道共用一套枚举 |
| `source_url` | `https://chatgpt.com/c/xxx` | `"desktop"` | 区分来源通道的唯一依据 |
| `content_hash` | SHA-256 | SHA-256 | 去重键，算法一致 |
| `source_fingerprint` | `platform:url` | `platform:desktop` | 来源指纹 |

## 各工具 Session 存储详情

### Claude Code
- **路径**：`~/.claude/projects/{项目编码路径}/{session_uuid}.jsonl`
- **格式**：JSONL，每行一个事件（mode、file-history-snapshot、attachment、message 等）
- **Session ID**：文件名即 UUID

### Codex
- **路径**：`~/.codex/sessions/YYYY/MM/DD/rollout-{timestamp}-{session_uuid}.jsonl`
- **格式**：JSONL，首行为 `session_meta`（含 id、cwd、model_provider），后续为 `event_msg` 和 `response_item`
- **Session ID**：`session_meta.payload.id`
- **额外数据**：`~/.codex/state_5.sqlite` 的 `threads` 表有 session 元数据（title、git info 等）

### Grok
- **路径**：`~/.grok/sessions/{url编码的cwd}/{session_uuid}/`
- **格式**：目录结构，包含：
  - `chat_history.jsonl`：对话消息（system / user / assistant）
  - `summary.json`：session 元数据（id、title、model、时间戳）
  - `events.jsonl`：工具调用事件
  - `system_prompt.txt`：系统提示词
- **Session ID**：目录名即 UUID，也在 `summary.json` 的 `info.id` 中

### OpenCode
- **路径**：`~/.local/share/opencode/opencode.db`（SQLite）
- **格式**：关系型数据库
  - `session` 表：session 元数据
  - `message` 表：消息（关联 session_id）
  - `part` 表：消息内容片段（关联 message_id）
- **Session ID**：`session.id`（text 主键）

---

## 文档变更记录

本次讨论产生了以下文档变更：

1. **`CONTEXT.md`**：新增 6 个术语（Browser Channel、Desktop Channel、Scanner、Parser、Watermark Database、Completed Session），更新 Capture 定义，新增 5 组 Example Dialogue
2. **`CLAUDE.md`**：项目定位扩展为全通道采集；架构从 3 子系统扩展为 4 子系统；新增 Scanner Architecture 章节和技术栈；Key Invariant 按渠道限定
3. **`docs/adr/0001-desktop-channel-scanner-architecture.md`**：记录"Go 扫描守护进程而非 per-tool hooks"的架构决策
4. **`docs/desktop-channel-design-decisions.md`**：本文档，完整设计决策记录
