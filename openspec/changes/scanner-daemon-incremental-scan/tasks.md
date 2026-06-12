# Tasks: scanner-daemon-incremental-scan

## 1. API 端 — session_id 替换匹配（先行，向后兼容）

- [x] 1.1 新增 alembic 迁移 0004：captures 加 `session_id TEXT NOT NULL DEFAULT ''` 列 + `(user_id, source_platform, session_id)` 部分唯一索引（`session_id != ''`）
- [x] 1.2 `schemas.py`：CaptureCreateRequest 增加顶层 `session_id: str = ""` 字段；CaptureListItem/Detail 响应补 session_id
- [x] 1.3 `supabase_client.py`：`capture_values()` 提取 session_id 入列；`create_or_update_capture` 重排为 session_id → content_hash →（仅 session_id 为空时）fingerprint → insert；session_id 命中时全量替换更新（不做 message_count >= 保护）
- [x] 1.4 更新 `tests/test_captures.py` / `test_supabase_client.py`：覆盖替换更新、session_id 非空跳过 fingerprint、空 session_id 走原路径、历史空 session_id 记录不受影响四个场景
- [x] 1.5 跑 api-server 测试套件确认全绿

## 2. Scanner 端 — daemon 调度循环

- [x] 2.1 `config.go`：新增 `ScanInterval time.Duration`（默认 3600s）+ `MCE_SCAN_INTERVAL` 秒级解析（非法/≤0 回落默认并告警），含单测
- [x] 2.2 `scanner.go`：新增 `RunLoop(ctx context.Context)` —— 立即 RunOnce，随后 time.Ticker 周期触发；ctx 取消时优雅退出；锁冲突时跳过 tick（复用现有 errScanInProgress 路径），含单测（短间隔验证多 tick + 取消退出）
- [x] 2.3 `main.go`：新增 `daemon` 子命令，signal.NotifyContext(SIGINT/SIGTERM) 接入 RunLoop；更新 printUsage
- [x] 2.4 `watermark.go`：`pending_uploads.file_path` 建唯一索引，`SavePending` 改 upsert；新增 `ClearPending(filePath)`；`scanner.go` 上传成功后调用 ClearPending，含单测（重复失败只留一条、成功后清除）

## 3. 集成与脚本

- [x] 3.1 `start.sh`：scanner 启动行改为 `"$SCANNER" daemon &`
- [ ] 3.2 端到端验证：短间隔（如 MCE_SCAN_INTERVAL=30）运行 daemon，验证新会话上报、追加消息后替换更新（云端记录数不增长、message_count 变化）、跳过会话增长后上传三条链路
- [x] 3.3 `scanner/CLAUDE.md` 与根 CLAUDE.md 补充 daemon 模式说明

## 4. 验证

- [x] 4.1 `go test ./...`（scanner）全绿
- [x] 4.2 api-server pytest 全绿
- [x] 4.3 `go vet` / 构建通过
