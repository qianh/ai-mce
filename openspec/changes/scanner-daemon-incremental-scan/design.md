# Design: scanner-daemon-incremental-scan

## Context

scanner 现状：`mce-scanner`（无参数）执行 `RunOnce()` 后退出。`RunOnce` 已具备：flock 扫描锁（防多进程并发）、8 worker 并发处理、watermark DB 按 `(file_path, content_hash)` 判重、MinMessages 过滤、失败时 `SavePending`。增量检测的基础设施（content_hash 对比）已经存在——缺的只是"周期性再跑一遍"的调度层和云端"替换而非并存"的更新语义。

API 端现状：`create_or_update_capture` 的匹配顺序是 content_hash → source_fingerprint → insert。desktop 的 `source_fingerprint = "platform:desktop"` 对同平台所有会话相同，step 2 的 fingerprint 匹配对 desktop 是错误逻辑（首条 claude 会话会被后续任意 claude 会话覆盖——目前未触发是因为 step 1 的 content_hash 不同会落到 step 2，而 step 2 中 `message_count >=` 判断恰好掩盖了部分错误）。

## Goals / Non-Goals

**Goals:**
- scanner 常驻运行，周期性增量上报新会话与更新会话
- 同一会话更新后云端只保留最新版本（替换策略）
- 修复 desktop fingerprint 误匹配的潜在数据损坏路径

**Non-Goals:**
- 不做文件系统事件监听（fsnotify/WatchPaths 集成留给 launchd 层）
- 不做消息级增量上传（每次重报完整会话，由云端替换）
- 不迁移/修复云端历史数据（session_id 为空的旧记录保持原样）
- 不改造浏览器扩展通道的上报与匹配行为

## Decisions

### D1: daemon 子命令而非默认循环
`mce-scanner daemon` 进入循环；无参数保持单次。保留 launchd WatchPaths 触发单次扫描的兼容性，职责分明。备选"无参数默认循环 + --once"被否：需要改动现有 launchd 配置语义。

### D2: 调度用 time.Ticker + 立即首扫
`RunLoop(interval)` 实现为：先 `RunOnce()`，再 `for range ticker.C { RunOnce() }`。tick 间互斥由现有 flock 锁天然保证——上一轮未结束时新 tick 拿不到锁即跳过。不引入额外的 goroutine 池或队列。SIGINT/SIGTERM 优雅退出（signal.NotifyContext）。

### D3: 间隔默认 1h，秒级环境变量
`Config.ScanInterval`（time.Duration），默认 3600s，`MCE_SCAN_INTERVAL` 按秒解析；≤0 或非法值回落默认并告警。会话级内容产出频率低，1 小时足够；测试时可设短间隔。

### D4: 替换策略用 session_id 三级匹配（API 端）
匹配顺序重排为 session_id → content_hash → insert：
- `session_id` 非空：按 `(user_id, source_platform, session_id)` 查 → 命中即全量更新（messages/content_hash/message_count/metadata）。这是"替换"语义的实现。
- 命不中再按 content_hash 查（幂等重放保护）。
- `session_id` 非空时跳过 fingerprint 匹配（修复误合并）；为空时保留现有 fingerprint 逻辑（浏览器通道不变）。

备选方案 A（把 fingerprint 改为会话级 `platform:desktop:path`）被否：历史数据不兼容且需要同时改 scanner 与 API 两端的语义。

### D5: schema 迁移
新 alembic 迁移 `0004_add_session_id`：`captures` 加 `session_id TEXT NOT NULL DEFAULT ''`；部分唯一索引 `uq_captures_user_platform_session ON (user_id, source_platform, session_id) WHERE session_id != ''`。scanner 上报的顶层 `session_id` 已存在于 `CaptureCreateRequest`（Go 端），API 端 `capture_values()` 提取该字段入列。

替换更新时 `message_count` 不做 `>=` 保护——desktop 渠道解析自本地完整文件，不存在浏览器懒加载的"部分重抓"问题；会话文件被截断重写属于会话工具自身行为，以文件现状为准。（浏览器通道的 fingerprint 路径保留原 `>=` 保护。）

### D6: 失败重试 = 自然重扫；pending_uploads 去重
失败不写水印 → 下一 tick 必然重新发现重试，无需独立重试队列。`SavePending` 改为 `INSERT ... ON CONFLICT(file_path) DO UPDATE`（需为 pending_uploads.file_path 建唯一索引），消除同一文件的记录累积。`pending_uploads` 保留作为故障诊断记录（最后失败原因/时间），上传成功时清除该 file_path 的 pending 记录。

## Risks / Trade-offs

- [每 tick 全量重解析所有会话文件（~7000 文件）] → 解析是本地 IO + CPU，8 worker 下单轮约分钟级；1h 间隔下可接受。未变化会话零 HTTP 请求。后续可加 mtime 预过滤优化（水印记录 mtime，未变则跳过解析）。
- [替换更新会覆盖云端已有的 AI 分析结果（analysis_status 等）] → V0.1 无服务端 AI 分析（规格明确），暂无实际影响；将来引入分析管线时需在更新路径上重置 analysis_status 触发重分析。
- [部分唯一索引上线时若云端已有重复 (user_id, platform, session_id)] → 用户计划清空重跑；迁移文档注明前置条件。
- [daemon 进程崩溃后无自动拉起] → start.sh 场景由用户手动重启；生产化时配 launchd KeepAlive（非本次范围）。

## Migration Plan

1. API 端先行：迁移 0004 + 匹配逻辑上线（向后兼容：session_id 为空的请求走原路径）
2. scanner 端：daemon 子命令 + start.sh 切换
3. 用户清空云端数据与本地水印后用 daemon 模式重跑（用户已计划）
4. 回滚：scanner 退回无参数单次模式即可；API 迁移 downgrade 删列删索引

## Open Questions

无——核心分支已在需求拷问阶段全部裁决。
