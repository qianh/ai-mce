## ADDED Requirements

### Requirement: Capture 列表页
控制台 SHALL 展示所有本地 Capture 记录，支持按时间倒序排列，显示标题、来源平台、项目、记忆等级、状态、时间。

#### Scenario: 展示 Capture 列表
- **WHEN** 用户打开 options_page 控制台
- **THEN** 从本地 SQLite 查询所有 Capture，按 `created_at` 倒序展示，每行含标题、平台、记忆数量、状态徽章

#### Scenario: 空状态
- **WHEN** 本地无任何 Capture 记录
- **THEN** 展示空状态插图和「保存你的第一次 AI 对话」引导文案

### Requirement: Capture 详情页
控制台 SHALL 展示单个 Capture 的完整详情：自动摘要、候选记忆列表（含等级和状态）、待办事项、决策、Context Pack 预览、来源信息。

#### Scenario: 查看候选记忆
- **WHEN** 用户点击 Capture 列表中的某条记录
- **THEN** 展示详情页，候选记忆按 L5→L0 排序，每条显示内容、等级、状态（待确认/已入库/已忽略）

#### Scenario: 确认候选记忆入库
- **WHEN** 用户点击候选记忆的「确认入库」按钮
- **THEN** `memory_candidate.status` 更新为 `confirmed`，创建 `memory_item`，按钮变为「撤销入库」

#### Scenario: 删除 Capture
- **WHEN** 用户点击详情页「删除」按钮并在二次确认弹窗中确认
- **THEN** 从 SQLite 删除该 Capture 及关联的 source_document、memory_candidates，返回列表页

### Requirement: Review Inbox
控制台 SHALL 提供专用的 Review Inbox 页面，聚合所有 `status = pending` 的 L4/L5 候选记忆、低置信度条目和敏感内容命中项，支持批量处理。

#### Scenario: Review Inbox 展示待确认项
- **WHEN** 用户点击侧边栏「Review Inbox」
- **THEN** 展示所有待确认记忆，顶部显示总数徽章，支持「确认入库 / 编辑后入库 / 降级 / 忽略」四种操作

### Requirement: 设置页
控制台 SHALL 提供设置页，允许用户配置：Claude API Key（含验证按钮）、默认保存方式、原文保留策略（处理后删除/7天/30天/永久），展示已授权设备（当前设备）。

#### Scenario: 用户更新 API Key
- **WHEN** 用户在设置页输入新的 Claude API Key 并点击「验证并保存」
- **THEN** Background 验证 Key 有效性，成功后更新 SQLite settings 表，页面显示「已连接 · Claude claude-3-5-haiku」

#### Scenario: 用户修改原文保留策略
- **WHEN** 用户选择「保留 7 天」并保存
- **THEN** 更新 settings 表，新 Capture 的 source_document 按新策略设置 `expires_at`，旧记录不受影响
