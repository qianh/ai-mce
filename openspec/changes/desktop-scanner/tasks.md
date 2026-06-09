## 1. 项目底座与数据模型

- [ ] 1.1 添加 Go 依赖：`modernc.org/sqlite` + 标准库（go get）
- [ ] 1.2 实现 `pkg/model/capture.go`：定义 `ExtractedConversation`、`ExtractedMessage`、`ExtractionQuality`、`Hashes`、`Source`、`Content`、`Metadata` 结构体，与 API Server 的 `CaptureCreateRequest` 兼容
- [ ] 1.3 实现 `pkg/model/capture_test.go`：验证 JSON 序列化与 API payload 格式一致

## 2. Watermark 数据库

- [ ] 2.1 实现 `internal/watermark/watermark.go`：DB 初始化（创建 `~/.mce-scanner/` 目录 + `state.db`），schema 创建（sessions + pending_uploads 表）
- [ ] 2.2 实现 watermark CRUD 操作：`IsProcessed(filePath, contentHash) bool`、`MarkUploaded(filePath, contentHash, platform, sessionID)`、`MarkPendingRetry(filePath, payload, error)`、`GetPendingUploads() []PendingUpload`、`RemovePending(id)`
- [ ] 2.3 实现 `internal/watermark/watermark_test.go`：覆盖所有 CRUD 场景（新 session、hash 变化、pending retry、crash 恢复）

## 3. Content Hashing

- [ ] 3.1 实现 `pkg/model/hash.go`：`ComputeContentHash(messages) string` — trim 空白、collapse 空行、保留 role+index+content、SHA-256
- [ ] 3.2 实现 `ComputeSourceFingerprint(platform) string` — 返回 `"{platform}:desktop"`
- [ ] 3.3 实现 `pkg/model/hash_test.go`：验证 hash 计算与 Extension 端逻辑一致（用 fixtures 对照）

## 4. Parser 接口与实现

- [ ] 4.1 定义 `internal/parser/parser.go`：`Parser` 接口 `Parse(path string) (*model.ExtractedConversation, error)`
- [ ] 4.2 实现 `internal/parser/claudecode.go`：Claude Code JSONL parser — 读文件、过滤 human/assistant 消息、映射字段、计算 hash
- [ ] 4.3 实现 `internal/parser/claudecode_test.go`：使用 fixtures（从 `~/.claude/projects/` 采样的匿名化 JSONL）
- [ ] 4.4 实现 `internal/parser/codex.go`：Codex JSONL parser — 读 session_meta + response_item、映射字段
- [ ] 4.5 实现 `internal/parser/codex_test.go`：使用 fixtures
- [ ] 4.6 实现 `internal/parser/grok.go`：Grok 多文件 parser — 读 chat_history.jsonl + summary.json、映射字段
- [ ] 4.7 实现 `internal/parser/grok_test.go`：使用 fixtures
- [ ] 4.8 实现 `internal/parser/opencode.go`：OpenCode SQLite parser — 只读 WAL 模式打开 DB、查 session → message → part、映射字段
- [ ] 4.9 实现 `internal/parser/opencode_test.go`：使用内存 SQLite fixtures

## 5. API Client

- [ ] 5.1 实现 `internal/config/config.go`：加载 `~/.mce-scanner/config.json`（api_base_url）和 `~/.mce-scanner/auth.json`（access_token / refresh_token）
- [ ] 5.2 实现 `internal/api/client.go`：`Login(email, password)`、`Upload(conversation) (captureID, error)`、`RefreshToken()`
- [ ] 5.3 实现 retry 逻辑：5xx/网络错误最多重试 3 次（指数退避 1s/2s/4s），4xx（非 401）不重试
- [ ] 5.4 实现 401 自动 refresh：收到 401 → 尝试 refresh_token → 成功则重试原请求 → 失败则报错
- [ ] 5.5 实现 `internal/api/client_test.go`：mock HTTP server 验证 login、upload、retry、token refresh

## 6. Scanner 主循环

- [ ] 6.1 实现 `internal/scanner/scanner.go`：主循环逻辑 — discover sessions → filter completed (10min) → check watermark → parse → upload → update watermark
- [ ] 6.2 实现 session 发现逻辑：遍历 4 个工具的存储路径，每个路径不存在则跳过
- [ ] 6.3 实现 Completed Session 检测：检查 mtime > 10 分钟（Grok 取目录内最新 mtime）
- [ ] 6.4 实现 pending_uploads 重试：每次 scan cycle 开始时先处理 pending 队列
- [ ] 6.5 实现 `internal/scanner/scanner_test.go`：使用 temp 目录构建 mock session 文件，验证完整 scan cycle

## 7. CLI 入口

- [ ] 7.1 实现 `cmd/mce-scanner/main.go`：解析子命令（scan / login / status），初始化依赖，执行对应逻辑
- [ ] 7.2 实现 login 交互：读取 stdin 输入 email/password，调用 API client login
- [ ] 7.3 实现 status 输出：查询 watermark DB 统计信息并打印

## 8. launchd 集成

- [ ] 8.1 创建 `launchd/com.mce.scanner.plist`：配置 WatchPaths（~/.claude/projects, ~/.codex/sessions, ~/.grok/sessions, ~/.local/share/opencode）、ProgramArguments 指向 mce-scanner 二进制
- [ ] 8.2 编写安装说明（scanner/README.md）：`go build` + `launchctl load` 步骤

## 9. 集成测试与验证

- [ ] 9.1 编写集成测试：构建完整的 mock 环境（4 种工具的 session fixtures + mock API server），验证端到端 scan cycle
- [ ] 9.2 手动验证：在本机用真实 session 数据运行 `mce-scanner`，确认上报成功
