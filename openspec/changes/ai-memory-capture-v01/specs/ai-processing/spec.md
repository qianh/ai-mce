## ADDED Requirements

### Requirement: 用户 API Key 配置
系统 SHALL 允许用户在设置页配置自己的 Claude API Key（Anthropic），V0.1 仅支持 Claude，OpenAI 支持留 V0.2。Key 验证通过后方可使用 AI 处理功能。

#### Scenario: API Key 验证成功
- **WHEN** 用户填写 API Key 并点击「验证」
- **THEN** Background 发送测试请求到 Anthropic API，成功后存储 Key 并显示「已连接」状态

#### Scenario: API Key 无效
- **WHEN** 用户填写错误的 API Key
- **THEN** 显示「Key 无效，请检查」，不存储该 Key，不阻断保存流程（无 Key 时只保存原始文本）

### Requirement: 摘要生成
系统 SHALL 在 Capture 写入本地 SQLite 后，调用用户的 Claude API 生成对话摘要（≤150 字），写入 `source_documents.summary` 字段。无 API Key 时跳过，摘要字段留空。

#### Scenario: 成功生成摘要
- **WHEN** Capture 写入完成，用户已配置有效 API Key
- **THEN** Background 调用 Claude API（`claude-3-5-haiku-20241022`），生成摘要写入数据库，控制台展示摘要

#### Scenario: API 调用失败（超限 / 网络错误）
- **WHEN** Claude API 返回 4xx/5xx 或网络超时
- **THEN** 摘要字段标记为 `failed`，Capture 仍正常保存，控制台展示「摘要生成失败，可手动重试」

### Requirement: 候选记忆提取与 L0-L5 分级
系统 SHALL 调用 Claude API 分析对话内容，提取候选记忆条目，为每条记忆分配 L0-L5 等级，返回置信度和判断理由。

#### Scenario: 成功提取候选记忆
- **WHEN** 摘要生成完成后触发记忆提取
- **THEN** Claude API 返回结构化 JSON（候选记忆数组），每项含 `content`、`level`、`confidence`、`reason`，写入 `memory_candidates` 表

#### Scenario: L4/L5 候选记忆不自动入库
- **WHEN** 提取结果中包含 level = L4 或 L5 的候选记忆
- **THEN** 这些条目 `status = pending`，不自动晋升为 `memory_items`，控制台 Review Inbox 展示待确认提示

#### Scenario: L3 及以下自动入库
- **WHEN** 候选记忆 level ≤ L3 且 confidence ≥ 0.7
- **THEN** 自动创建对应 `memory_item`，`confirmed_by_user = false`，控制台标记为「已入库」

### Requirement: AI 处理在 Background Service Worker 中异步执行
所有 AI API 调用 SHALL 在 Background Service Worker 中异步执行，不阻塞 Popup UI，处理进度通过 `chrome.runtime.sendMessage` 推送给 Popup。

#### Scenario: AI 处理进度更新
- **WHEN** Background 开始/完成摘要或记忆提取
- **THEN** 向 Popup 推送进度消息，Popup 实时更新步骤状态（已上传 → 生成摘要 → 提取记忆 → 生成 Pack）
