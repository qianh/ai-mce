## Why

个人 AI CLI 工具（Claude Code、Codex、Grok、OpenCode）的对话数据散落在各自的本地文件系统中，无法统一查看和分析。浏览器端的 Capture 采集已通过 Chrome Extension 完成，但桌面端 AI 工具的对话数据——占个人 AI 使用量的重要部分——完全游离在记忆系统之外。需要一个自动化的桌面端采集通道，把这些数据归入同一个 Capture 体系，支撑个人数据分析、画像沉淀和第二大脑建立。

## What Changes

- 新增 `scanner/` 子系统：Go 二进制，作为 macOS launchd 守护进程运行
- 实现 4 个 per-tool Parser：分别解析 Claude Code (JSONL)、Codex (JSONL)、Grok (多文件 JSONL+JSON)、OpenCode (SQLite) 的会话格式
- 实现 Watermark Database：本地 SQLite 数据库，跟踪已处理的 session（file_path + content_hash）
- 实现独立认证的 API Client：复用 `POST /v1/captures` 接口，独立 email/password 登录
- 实现完成检测：仅采集文件 10 分钟未修改的 Completed Session
- 实现重试与本地暂存：上报失败重试 3 次，仍失败则暂存到 Watermark DB
- 提供 launchd plist 配置文件：利用 WatchPaths 监听各工具的 session 目录
- 可选 CLI 子命令：`mce-scanner login`、`mce-scanner status`

## Capabilities

### New Capabilities

- `desktop-scanner-core`: Scanner 主循环、launchd 集成、WatchPaths 触发、Completed Session 检测（10 分钟阈值）
- `session-parsers`: 4 个 per-tool Parser（Claude Code / Codex / Grok / OpenCode），将各工具的 session 格式转换为标准 Capture payload
- `watermark-db`: 本地 SQLite watermark 数据库，增量检测（file_path + content_hash），失败 payload 暂存
- `scanner-api-client`: 独立认证（email/password login + token 持久化）、`POST /v1/captures` 上报、重试 3 次逻辑

### Modified Capabilities

（无现有 spec 的需求级变更。API Server 的 `POST /v1/captures` 接口不需修改，桌面端 payload 与浏览器端结构相同。）

## Impact

- **新代码**：`scanner/` 目录下的完整 Go 项目（cmd + internal + pkg）
- **API 兼容**：复用现有 `POST /v1/captures`，payload 中 `source_url = "desktop"`、`platform` 为对应工具名
- **依赖**：Go 运行时 + `modernc.org/sqlite`（纯 Go SQLite）、标准库 HTTP/JSON
- **系统集成**：macOS launchd plist，需要用户手动安装（`launchctl load`）
- **文档已更新**：CONTEXT.md（新术语）、CLAUDE.md（架构）、ADR-0001（架构决策）
