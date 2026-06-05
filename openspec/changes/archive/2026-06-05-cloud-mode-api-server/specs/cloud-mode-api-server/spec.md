## ADDED Requirements

### Requirement: 本地版默认且不依赖云端
The extension SHALL default to Local Mode. Local Mode SHALL save and display Captures using local SQLite without requiring registration, login, API server availability, or any cloud request.

#### Scenario: 首次安装默认本地版
- **WHEN** a user installs the extension and has not changed storage settings
- **THEN** `storage_mode` resolves to `local`
- **AND** save/list/detail flows use local SQLite only

#### Scenario: API server 不可用时本地版仍可保存
- **WHEN** Local Mode is active and the API server is unreachable
- **THEN** saving a Capture still succeeds through local SQLite
- **AND** no login prompt blocks the save

### Requirement: 云端版注册登录
Cloud Mode SHALL require an email/password registered user session managed by `api-server/`. The first cloud release SHALL NOT require OAuth/PKCE or Supabase Auth.

#### Scenario: 用户注册后进入云端版
- **WHEN** a user registers with email and password from the options page
- **THEN** the API server creates the user
- **AND** the extension stores session state needed for authenticated cloud requests
- **AND** Cloud Mode can be enabled

#### Scenario: 未登录用户不能启用云端保存
- **WHEN** a user selects Cloud Mode without a valid session
- **THEN** the options page shows login/register controls
- **AND** new Captures are not silently uploaded

### Requirement: 云端 Capture 用户级隔离
The API server SHALL store every cloud Capture under the authenticated user ID. Users SHALL only list, read, upsert, or delete their own Captures.

#### Scenario: 用户只能看到自己的云端数据
- **WHEN** user A calls `GET /v1/captures`
- **THEN** the response contains only captures whose `user_id` is user A

#### Scenario: 跨用户读取被拒绝
- **WHEN** user A calls `GET /v1/captures/{id}` for user B's capture
- **THEN** the API server returns not found or forbidden

### Requirement: 云端版保存上传完整原文和 extraction metadata
When Cloud Mode is active and the user is authenticated, new Captures SHALL upload full source messages, source metadata, hashes, and extraction quality to the API server.

#### Scenario: 云端上传成功
- **WHEN** background receives `SAVE_REQUEST` in Cloud Mode
- **THEN** it sends the full `ExtractedConversation` payload to `POST /v1/captures`
- **AND** the API server stores it under the current user
- **AND** local SQLite keeps lightweight metadata and the cloud Capture ID

#### Scenario: 云端 upsert 同一 source fingerprint
- **WHEN** the same authenticated user uploads a Capture with the same non-empty `source_fingerprint`
- **THEN** the API server updates the existing cloud Capture instead of creating a duplicate

### Requirement: 云端上传失败回落到本地
If Cloud Mode upload fails, the extension SHALL save the full Capture locally as Local Data and show that it can be uploaded manually later.

#### Scenario: 云端保存失败但本地回落成功
- **WHEN** Cloud Mode is active and `POST /v1/captures` fails
- **THEN** background writes the Capture to local SQLite with a local-only state
- **AND** the result shown to the user says it was saved locally and can be uploaded later

### Requirement: 历史本地数据逐条手动补传
Switching to Cloud Mode SHALL NOT automatically upload historical local Captures. Local-only rows SHALL expose an upload-to-cloud action when the user has a valid cloud session.

#### Scenario: 切换云端版不自动补传
- **WHEN** a user switches from Local Mode to Cloud Mode
- **THEN** existing local Captures remain local-only
- **AND** no bulk upload is started

#### Scenario: 用户手动上传单条本地 Capture
- **WHEN** a logged-in user clicks upload-to-cloud on a local-only Capture
- **THEN** the extension uploads that Capture to `POST /v1/captures`
- **AND** on success the row becomes cloud-backed

### Requirement: 敏感内容上传前二次确认
If local sensitive-content detection finds sensitive content in a Capture, Cloud Mode upload and Manual Backfill SHALL require explicit user confirmation before sending the payload to the API server.

#### Scenario: 敏感内容阻止静默上传
- **WHEN** a Capture contains detected sensitive content
- **AND** the user has not confirmed cloud upload
- **THEN** the extension does not upload the Capture payload

### Requirement: 插件后台查看个人云端数据
The extension options page SHALL let authenticated Cloud Mode users view their personal cloud Captures, including list and detail views.

#### Scenario: 查看云端 Capture 列表
- **WHEN** a logged-in user opens the options page in Cloud Mode
- **THEN** the page can load `GET /v1/captures`
- **AND** it displays only that user's cloud Captures

#### Scenario: 查看云端 Capture 详情
- **WHEN** a user opens a cloud-backed Capture detail
- **THEN** the page can load full messages and extraction metadata from `GET /v1/captures/{id}`

### Requirement: 删除已上传 Capture 时云端和本地一起删除
Deleting a cloud-backed Capture SHALL delete the cloud record and local metadata/local copy together. The product SHALL NOT provide a first-release action that only detaches or deletes the local copy.

#### Scenario: 删除云端 Capture
- **WHEN** a user deletes a cloud-backed Capture
- **THEN** the API server deletes the cloud record
- **AND** the extension removes the local cloud mapping and any local copy

### Requirement: 第一版不执行服务端 AI 分析
The API server SHALL NOT run AI analysis, summary generation, MemoryCandidate extraction, or Context Pack generation in the first cloud release. The data model MAY reserve status fields for future analysis.

#### Scenario: 上传 Capture 后不触发 AI 任务
- **WHEN** a Capture is uploaded to the API server
- **THEN** it is stored for list/detail access
- **AND** no AI analysis job is started
