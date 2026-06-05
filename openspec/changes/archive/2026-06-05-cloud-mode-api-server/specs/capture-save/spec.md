## MODIFIED Requirements

### Requirement: 保存写入本地 SQLite（无 AI 管线）
用户确认保存后，background SHALL inspect `storage_mode`. In Local Mode it SHALL preserve the existing raw-only local SQLite upsert behavior. In Cloud Mode, local SQLite SHALL be used for cloud metadata after successful upload and for full local fallback after upload failure. Neither path SHALL call AI APIs in the first cloud release.

#### Scenario: Local Mode 保存仍只写本地
- **WHEN** `storage_mode = 'local'` and background receives `SAVE_REQUEST`
- **THEN** background writes/upserts the Capture into local SQLite
- **AND** it does not call the API server

#### Scenario: 任一路径均不触发 AI 管线
- **WHEN** a Capture is saved in Local Mode or Cloud Mode
- **THEN** background does not call summarization, memory extraction, context-pack generation, or external AI APIs

## ADDED Requirements

### Requirement: Cloud Mode 保存上传云端
用户确认保存后，Cloud Mode SHALL upload the full Capture payload to the API server when authenticated, with local fallback on upload failure.

#### Scenario: Cloud Mode 保存上传云端
- **WHEN** `storage_mode = 'cloud'`, the user is authenticated, and background receives `SAVE_REQUEST`
- **THEN** background uploads the full Capture payload to the API server
- **AND** local SQLite stores cloud metadata and `cloud_capture_id`

#### Scenario: Cloud Mode 上传失败回落本地
- **WHEN** `storage_mode = 'cloud'` and cloud upload fails
- **THEN** background writes/upserts the full Capture into local SQLite as local-only data
- **AND** the user can later manually upload that Capture from the options page
