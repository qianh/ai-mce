## ADDED Requirements

### Requirement: DeepSeek 页面手动捕获
The extension SHALL support extracting conversations from `https://chat.deepseek.com/*` pages through the popup save flow.

#### Scenario: DeepSeek 页面返回抽取结果
- **WHEN** the active tab URL matches `https://chat.deepseek.com/*` and the popup sends `EXTRACT_CONVERSATION`
- **THEN** the content script returns `EXTRACTION_RESULT` with `conversation.source.platform` equal to `deepseek`

#### Scenario: DeepSeek 页面未授权时不可抽取
- **WHEN** the extension manifest lacks host permission for `https://chat.deepseek.com/*`
- **THEN** the DeepSeek content script is not considered valid for release

### Requirement: DeepSeek 对话内容结构
The DeepSeek extractor SHALL produce normalized messages with roles, content, indexes, extraction quality, hashes, and a source fingerprint.

#### Scenario: DeepSeek 消息被转换为统一格式
- **WHEN** a DeepSeek conversation page contains user and assistant messages
- **THEN** extraction returns `ExtractedMessage[]` with stable `role`, `content`, and `index` values

#### Scenario: DeepSeek conversation id 生成 fingerprint
- **WHEN** a DeepSeek URL contains a parseable conversation id
- **THEN** extraction sets `hashes.source_fingerprint` to `deepseek:{conversation_id}`

#### Scenario: DeepSeek conversation id 缺失时仍可保存
- **WHEN** a DeepSeek URL has no parseable conversation id
- **THEN** extraction sets a deterministic URL-based DeepSeek fingerprint and does not report platform as `generic_web`
