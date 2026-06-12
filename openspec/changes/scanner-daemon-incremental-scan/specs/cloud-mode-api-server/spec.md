# cloud-mode-api-server Delta

## MODIFIED Requirements

### Requirement: 云端版保存上传完整原文和 extraction metadata
When Cloud Mode is active and the user is authenticated, new Captures SHALL upload full source messages, source metadata, hashes, and extraction quality to the API server. `POST /v1/captures` 的去重/更新匹配 SHALL 按以下优先级执行：

1. 请求 `session_id` 非空时，按 `(user_id, source_platform, session_id)` 精确匹配 → 命中则**替换更新**现有 Capture（同一会话的新版本取代旧版本，不创建新记录）
2. 按 `(user_id, content_hash)` 匹配 → 命中则幂等更新（同内容重放）
3. 均未命中 → 创建新 Capture

`session_id` 非空的请求 SHALL NOT 参与 `source_fingerprint` 匹配（desktop 渠道的 fingerprint 为 `platform:desktop`，非会话级，按其匹配会误合并不同会话）。`session_id` 为空的请求（如浏览器扩展上报）SHALL 保留现有 `source_fingerprint` 匹配行为。`captures` 表 SHALL 持久化 `session_id` 列，并以 `(user_id, source_platform, session_id)` 部分唯一索引（`session_id != ''`）保证会话级唯一性。

#### Scenario: 云端上传成功
- **WHEN** background receives `SAVE_REQUEST` in Cloud Mode
- **THEN** it sends the full `ExtractedConversation` payload to `POST /v1/captures`
- **AND** the API server stores it under the current user
- **AND** local SQLite keeps lightweight metadata and the cloud Capture ID

#### Scenario: 同一会话更新后替换而非并存
- **WHEN** 同一用户上报的 Capture 携带非空 `session_id`，且云端已存在相同 `(user_id, source_platform, session_id)` 的 Capture
- **THEN** API server 用新内容（messages、content_hash、message_count 等）更新该 Capture
- **AND** 不创建新记录，该会话在云端始终只有一条最新版本

#### Scenario: 云端 upsert 同一 content_hash 幂等
- **WHEN** the same authenticated user uploads a Capture with the same `content_hash`
- **THEN** the API server updates the existing cloud Capture instead of creating a duplicate

#### Scenario: 云端 upsert 同一 source fingerprint（无 session_id 时）
- **WHEN** the same authenticated user uploads a Capture with empty `session_id` and the same non-empty `source_fingerprint`
- **THEN** the API server updates the existing cloud Capture instead of creating a duplicate

#### Scenario: 携带 session_id 的上报不按 fingerprint 合并
- **WHEN** 两个不同会话的 desktop Capture 携带不同的非空 `session_id` 但相同的 `source_fingerprint`（如均为 `claude:desktop`）
- **THEN** API server 将它们存为两条独立 Capture，不互相覆盖

#### Scenario: 历史记录不受影响
- **WHEN** 云端存在 `session_id` 为空的历史 Capture
- **THEN** 新上报的 session_id 匹配不会命中这些历史记录，历史数据保持原样
