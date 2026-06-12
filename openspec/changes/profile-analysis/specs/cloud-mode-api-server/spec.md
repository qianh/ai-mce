# cloud-mode-api-server — delta（解除"不执行服务端 AI 分析"限制）

## MODIFIED Requirements

### Requirement: 第一版不执行服务端 AI 分析
The first cloud release SHALL NOT run AI analysis. From the profile-analysis change onward, the API server SHALL run the profile-analysis pipeline (Digest and Dream Cycle, per `profile-digest` / `profile-dream` capabilities) as the only server-side AI processing. Summary generation, MemoryCandidate extraction, and Context Pack generation remain out of scope. The upload path SHALL remain decoupled: analysis enqueue failures MUST NOT fail or slow the Capture upload response. Profile analysis SHALL be switchable via a feature flag (`MCE_PROFILE_ENABLED`); when disabled, behavior reverts to store-only.

#### Scenario: 上传 Capture 后异步触发 Digest
- **WHEN** a Capture is uploaded to the API server and `MCE_PROFILE_ENABLED` is true
- **THEN** it is stored for list/detail access
- **AND** a Digest job is enqueued asynchronously without affecting the upload response

#### Scenario: 关闭分析开关时回到 store-only
- **WHEN** `MCE_PROFILE_ENABLED` is false
- **THEN** Captures are stored for list/detail access and no analysis job is started
