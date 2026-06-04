# Spec: capture-save

## Purpose

Defines the save behavior for captured conversations. V0.1 is raw-only local SQLite upsert with no AI pipeline. AI-based summarization and memory extraction are explicitly deferred to V0.2.

## Requirements

### Requirement: 保存写入本地 SQLite（无 AI 管线）
用户确认保存后，background SHALL 调用 `insertCapture`（或 upsert by source_fingerprint）将原始对话写入本地 SQLite，写入完成后立即返回成功结果。background SHALL NOT 调用任何 AI API（摘要生成、记忆候选提取、Context Pack 构建均不执行）。

#### Scenario: 用户手动保存写入成功
- **WHEN** 用户在 popup 点击"保存"，background 收到 `SAVE_REQUEST`
- **THEN** background 执行 upsert（by source_fingerprint），返回 `SAVE_RESULT { success: true }`，不调用任何外部 API

#### Scenario: 重复保存同一对话（相同 conversationId）
- **WHEN** 用户对同一 conversationId 的对话多次点击保存（消息数增加）
- **THEN** 现有记录被新的完整消息列表覆盖（upsert），`updated_at` 更新，不创建新记录

#### Scenario: 保存失败返回错误
- **WHEN** SQLite 写入抛出异常（如磁盘满）
- **THEN** background 返回 `SAVE_RESULT { success: false, error: 'WRITE_ERROR' }`，popup 显示错误提示

### Requirement: 上报模式设置
Settings SHALL 提供 `report_mode` 配置项，值为 `'auto' | 'manual'`，默认 `'manual'`。`'auto'` 模式下 background 接收来自 content script 的自动触发保存请求；`'manual'` 模式下仅响应用户手动触发的请求。

#### Scenario: 首次安装默认为手动模式
- **WHEN** 用户首次安装扩展，Settings 从未配置
- **THEN** `report_mode` 默认值为 `'manual'`

#### Scenario: 用户切换为自动模式
- **WHEN** 用户在 Settings 页面将上报模式切换为"自动"
- **THEN** `setSetting('report_mode', 'auto')` 持久化，后续 AI 每轮回复结束后自动触发保存

### Requirement: CaptureDetail 展示原始对话
Options 页面的 CaptureDetail SHALL 展示保存的原始对话消息列表（role + content），移除 candidates 和 context-pack 区块。

#### Scenario: 查看保存对话的原文
- **WHEN** 用户在 CaptureList 点击某条记录进入 CaptureDetail
- **THEN** 页面展示该对话的完整消息列表，每条消息显示 role 标签和 content 文本，可滚动浏览
