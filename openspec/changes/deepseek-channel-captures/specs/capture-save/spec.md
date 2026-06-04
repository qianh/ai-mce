## ADDED Requirements

### Requirement: DeepSeek 原始对话本地保存
Background save handling SHALL persist DeepSeek conversations through the same raw-only local SQLite path used for other captures.

#### Scenario: DeepSeek 手动保存成功
- **WHEN** background receives `SAVE_REQUEST` for a conversation whose `source.platform` is `deepseek`
- **THEN** it writes a capture row with `source_platform = 'deepseek'` and returns `SAVE_RESULT { success: true }`

#### Scenario: DeepSeek 同一对话重复保存时 upsert
- **WHEN** the user saves the same DeepSeek conversation id more than once
- **THEN** the existing capture is updated by `source_fingerprint` instead of creating duplicate capture rows

#### Scenario: DeepSeek 保存不触发 AI 管线
- **WHEN** a DeepSeek conversation is saved
- **THEN** background does not call summarization, memory extraction, context-pack generation, or external AI APIs
