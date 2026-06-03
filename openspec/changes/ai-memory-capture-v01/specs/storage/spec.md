## ADDED Requirements

### Requirement: wa-sqlite + OPFS 数据库初始化
插件 SHALL 在首次启动时，在 Background Service Worker 中使用 `@sqlite.org/sqlite-wasm` 初始化 OPFS 后端的 SQLite 数据库，启用 WAL 模式，创建所有必要数据表。

#### Scenario: 首次安装初始化
- **WHEN** 插件首次安装或数据库文件不存在
- **THEN** Background Worker 创建 `ai-memory.sqlite` 于 OPFS，建表，WAL 模式开启，写入 schema_version

#### Scenario: 已存在数据库时跳过初始化
- **WHEN** 插件重启，OPFS 中已存在 `ai-memory.sqlite`
- **THEN** 直接打开现有数据库，验证 schema_version，如有迁移则执行

### Requirement: Capture 实体存储
系统 SHALL 在用户确认保存后，将 `Capture` 记录写入 SQLite，包含所有必要字段，写入操作须在事务中完成。

#### Scenario: 成功写入 Capture
- **WHEN** 用户确认保存，Background Worker 收到保存请求
- **THEN** 在单个事务中写入 Capture + SourceDocument，返回 `capture_id`，Popup 展示成功状态

#### Scenario: 写入失败（磁盘满）
- **WHEN** OPFS 写入抛出 QuotaExceededError
- **THEN** Popup 展示「存储空间不足」错误，不写入残缺数据，数据库回滚

### Requirement: MemoryCandidate 存储与状态管理
系统 SHALL 存储 AI 提取的候选记忆，支持 pending / confirmed / ignored / degraded 四种状态，状态变更须记录时间戳。

#### Scenario: 候选记忆状态变更为 confirmed
- **WHEN** 用户在控制台点击「确认入库」
- **THEN** `MemoryCandidate.status` 更新为 `confirmed`，`confirmed_at` 写入当前时间，对应 `MemoryItem` 创建

### Requirement: Settings 存储
系统 SHALL 在 SQLite 的 `settings` 表中存储用户配置（API Key、保存方式偏好、原文保留策略），API Key 存储于 OPFS 沙箱内，不写入任何日志，不上传。

#### Scenario: 用户保存 API Key
- **WHEN** 用户在设置页填写 Claude API Key 并点击保存
- **THEN** Key 写入 `settings` 表的 `claude_api_key` 字段，Popup/Background 后续从此处读取，不写入 `chrome.storage`

### Requirement: 数据表结构
系统 SHALL 包含以下核心数据表：`captures`、`source_documents`、`memory_candidates`、`memory_items`、`decisions`、`tasks`、`context_packs`、`settings`、`schema_migrations`。

#### Scenario: 数据库 schema 完整性校验
- **WHEN** 插件启动时执行 schema 校验
- **THEN** 所有必要表和索引均存在，否则执行增量迁移脚本
