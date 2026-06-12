# Proposal: scanner-daemon-incremental-scan

## Why

当前 scanner 只在启动时执行一次扫描后退出，无法持续跟踪各渠道（claude/codex/grok/opencode）会话的新增与更新。用户需要 scanner 常驻运行，定期增量上报新会话及历史会话的新内容。同时，云端缺少"同一会话更新后替换而非并存"的能力——会话追加消息后 content_hash 变化，重新上报会在云端产生同一会话的多个快照副本。

## What Changes

- 新增 `mce-scanner daemon` 子命令：常驻进程，启动后立即执行首次扫描，随后按固定间隔（默认 1 小时，`MCE_SCAN_INTERVAL` 环境变量按秒覆盖）周期性重扫
- 无参数 `mce-scanner` 保持单次扫描语义不变（launchd WatchPaths 兼容）
- `start.sh` 改用 `daemon` 子命令启动 scanner
- **BREAKING（API 行为）**：`POST /v1/captures` 的去重匹配优先级改为 ① `(user_id, source_platform, session_id)` 精确匹配 → 更新替换 ② `content_hash` 相同 → 幂等更新 ③ 新建；`session_id` 非空时跳过 `source_fingerprint` 匹配（desktop 的 fingerprint 是 `platform:desktop`，非会话级，会误合并不同会话）
- `captures` 表新增 `session_id` 列 + `(user_id, source_platform, session_id)` 部分唯一索引（`session_id != ''`）
- 失败重试依赖下一 tick 自然重扫（失败会话不写水印，必然重新发现），不接线 `pending_uploads` 重试队列；修复 `pending_uploads` 同一文件重复累积（按 `file_path` 去重）
- `MinMessages` 过滤的会话（`skipped:min4:v1` 水印）在消息增长达标后由周期重扫自然重新评估并上传

## Capabilities

### New Capabilities

- `desktop-continuous-scan`: scanner daemon 模式的持续增量扫描行为——调度循环、增量检测（content_hash 变化即重报）、失败自然重试、跳过会话的重新评估

### Modified Capabilities

- `cloud-mode-api-server`: Capture 去重/更新的匹配规则变更——引入 session_id 会话级精确匹配实现替换策略，desktop 上报跳过 fingerprint 匹配

## Impact

- `scanner/cmd/mce-scanner/main.go` — 新增 daemon 子命令入口
- `scanner/internal/scanner/scanner.go` — 新增 RunLoop（调度循环），复用现有 RunOnce 与 flock 扫描锁
- `scanner/internal/config/config.go` — 新增 ScanInterval 配置 + `MCE_SCAN_INTERVAL` 解析
- `scanner/internal/watermark/watermark.go` — SavePending 按 file_path 去重
- `api-server/app/supabase_client.py` — create_or_update_capture 匹配逻辑重排
- `api-server/app/schemas.py` — CaptureCreateRequest/响应模型补 session_id（请求体 metadata 中已有，需提升为可查询列）
- `api-server/app/alembic/versions/` — 新迁移：session_id 列 + 部分唯一索引
- `start.sh` — scanner 启动行改为 daemon 模式
- 兼容性：现有云端记录 session_id 为空，不参与新匹配；scanner 端 `CaptureCreateRequest` 已含顶层 `session_id` 字段，无需改造上报协议
