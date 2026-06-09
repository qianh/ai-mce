---
feature: mce-scanner-concurrency
executor: claude-code
scores: { 规模: M, 风险: M, 项目: 老, 领域清晰度: 清晰 }
nodes: [NS, N1, N3, N4, N5, N6, N7]
flavors: { NS: Explore, N1: grill-with-docs, N3: openspec-propose, N4: writing-plans, N5: tdd, N6: verification-before-completion, N7: requesting-code-review }
execution_modes: { NS: done, N1: current-agent, N3: current-agent, N4: current-agent, N5: current-agent, N6: current-agent, N7: current-agent }
deps_check: { Explore: ok, grill-with-docs: ok, openspec-propose: ok, writing-plans: ok, tdd: ok, verification-before-completion: ok, requesting-code-review: ok }
status: spec-locked
created: 2026-06-09
---

# mce-scanner 并发处理 · Spec

## 涉及服务 / 跨仓范围 <!-- NS ✅ 已完成（当前 agent 直接扫码库） -->

- **scanner/** — 核心改动区：`internal/scanner/scanner.go`（RunOnce 并发化）、`internal/api/client.go`（token 刷新竞态修复）、`internal/watermark/watermark.go`（SQLite WAL 或互斥锁）、`internal/config/config.go`（新增并发度配置字段）
- **api-server/** — 不修改；接受并发上报（已幂等，Idempotency-Key 保护）
- **extension/** — 不涉及
- **console/** — 不涉及
- 关联 API：`POST /v1/captures`（上游，幂等，并发安全）
- 关联 DB：`~/.mce-scanner/state.db`（SQLite watermark，需并发写保护）
- 完整功能边界：仅 `scanner/` 包内改动，零跨仓影响

## 问题与非目标 <!-- N1 ✅ 已完成 -->

**痛点**：`RunOnce()` 是纯串行循环，4000+ sessions × HTTP 上传阻塞 = 几十分钟。

**用户**：项目所有者（自动扫描，无交互）

**要解决**：
- `RunOnce()` 改为 worker pool，goroutine 并发处理 sessions
- SQLite watermark DB 写竞争：`SetMaxOpenConns(1)` 单连接串行化
- API client token 刷新竞态：`sync.Mutex + double-check`
- 进度日志：每 100 session 汇报一次
- 并发度：`MCE_CONCURRENCY` 环境变量，默认 8

**非目标**：
- API Server 接口变更（已幂等，无需修改）
- Extension / Console 修改
- Rate limiting（8 并发对个人 API 无压力）
- 持久化并发度到配置文件（env var 足够）

**失败路径**：
- 单 session 失败 → 记录错误日志，继续处理其他 session（保持现有行为）
- token 刷新失败 → 报错退出（保持现有行为）

## 领域词表 <!-- N2 不跑，规模M跳过 -->

N/A

## 需求 <!-- N3 ✅ openspec: openspec/changes/mce-scanner-concurrency/ -->

**FR-001** — `Config.Concurrency` 字段，从 `MCE_CONCURRENCY` env 读取，默认 8  
**FR-002** — `RunOnce()` 使用 bounded worker pool，goroutine 数 = `Config.Concurrency`  
**FR-003** — `watermark.Open()` 调用 `db.SetMaxOpenConns(1)`，串行化所有 SQLite 写  
**FR-004** — `api.Client` 加 `refreshMu sync.Mutex`，token 刷新 double-check 保护  
**FR-005** — 每 100 个 session 处理完打印 `"processed N/Total sessions..."`  
**FR-006** — 单 session 失败记录日志并继续（现有行为不变）

**NFR-001** — `go test -race ./scanner/...` 零竞态报告  
**NFR-002** — 改动仅在 `scanner/` 包内，零跨仓影响

## 数据模型 / API / 兼容 <!-- N3 -->

- 无新数据模型；`Config` 新增 `Concurrency int` 字段（向后兼容，零值→使用默认 8）
- `api.Client` 新增 `refreshMu sync.Mutex` 字段（非导出，内部实现）
- `RunOnce()` 签名不变，行为等价但并发执行

## 验收标准 <!-- N3 -->

- AC-001 `MCE_CONCURRENCY=4` → 4 worker goroutine 处理 sessions
- AC-002 并发 `MarkUploaded` 无 `SQLITE_BUSY` 错误
- AC-003 并发 401 → 仅一次 token refresh HTTP 请求
- AC-004 200 sessions × 8 workers → 所有 session 恰好处理一次
- AC-005 1 session 报错 → 其余继续处理，结果与成功数一致
- AC-006 `go test -race ./scanner/...` 通过

## 测试策略 <!-- N3 -->

- 单元测试：config env var 解析（3 用例）、watermark 并发写（1 用例）、client token 刷新竞态（1 用例）、RunOnce worker 覆盖（2 用例）
- 集成：`go test -race ./scanner/...`
- 手工验证：本地 `./mce-scanner` 跑并观察进度日志

## 任务拆解 <!-- N4 ✅ 已完成，见 openspec/changes/mce-scanner-concurrency/tasks.md -->

见 `openspec/changes/mce-scanner-concurrency/tasks.md` — 5 组 18 个任务全部完成。

## 实现与测试记录 <!-- N5 ✅ 已完成 -->

- `config.go` — 新增 `Concurrency int`，`Default()` = 8，`FromEnv()` 读 `MCE_CONCURRENCY`
- `watermark.go` — `Open()` 加 `db.SetMaxOpenConns(1)`
- `client.go` — 新增 `mu sync.Mutex` + `refreshOnce sync.Mutex`，`getToken()`/`setTokens()` 帮助方法，`Refresh()` / `uploadCaptureBody()` / `UploadCapture()` 全部更新
- `scanner.go` — `RunOnce()` 改为 channel-based worker pool，`atomic.Int64` 计数，每 100 sessions 打印进度

提交记录：
- `2fb36e7` feat(scanner): add Config.Concurrency field
- `7b35520` fix(scanner): serialize SQLite writes via SetMaxOpenConns(1)
- `d53af69` fix(scanner): make api.Client goroutine-safe
- `00d2d64` feat(scanner): replace sequential RunOnce with bounded worker pool

## 验证记录（DoD） <!-- N6 ✅ 已完成 -->

- [x] 所有测试通过  [x] build 成功
- [x] 新增逻辑有测试（config 3 + watermark 1 + api 1 + scanner 2 = 7 个新测试）
- [x] 修改行为有回归（所有现有测试通过）
- [x] 无无关 diff（仅 4 个文件改动，全在 scanner/ 内）
- [x] `go test -race ./...` 零竞态报告

## 审查记录 <!-- N7 待执行 -->

N/A

## 决策与归档（ADR） <!-- N8 可选 -->

N/A
