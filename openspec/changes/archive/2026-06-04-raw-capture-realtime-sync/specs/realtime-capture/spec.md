## ADDED Requirements

### Requirement: MutationObserver 实时消息采集
content script 在 ChatGPT 页面加载时 SHALL 立即挂载 `MutationObserver`，监听 `document.body` subtree 的 `childList` 变化，将所有出现过的 `[data-message-author-role]` 节点追加到内存消息缓存（Map，key 为节点出现顺序 index），不去重同 index 节点（后出现的覆盖前者）。

#### Scenario: 新对话消息被实时捕获
- **WHEN** ChatGPT 页面加载后用户发送消息并收到 AI 回复
- **THEN** observer 缓存中包含该用户消息和 AI 回复节点，无需用户或插件滚动

#### Scenario: 历史对话已渲染消息被捕获
- **WHEN** 用户打开 `chatgpt.com/c/{id}` 历史对话页面，ChatGPT 渲染出当前视窗内的消息
- **THEN** observer 缓存中包含这些已渲染消息

#### Scenario: 消息缓存在 SPA 路由切换时重置
- **WHEN** URL 从 `chatgpt.com/c/{id-A}` 变更为 `chatgpt.com/c/{id-B}`（或 `chatgpt.com`）
- **THEN** 消息缓存清空，conversationId 更新为新 URL 中的值（或 null）

### Requirement: conversationId 检测与保存门控
content script SHALL 从 `window.location.pathname` 解析 conversationId（匹配 `/c/{uuid}`）。无 conversationId 时，popup 保存按钮 SHALL 显示禁用状态并提示"等待对话初始化…"。

#### Scenario: 新对话尚未获得 ID 时禁止保存
- **WHEN** 当前 URL 为 `https://chatgpt.com`（无 `/c/{id}`）
- **THEN** popup 中保存按钮禁用，显示提示文字"等待对话初始化…"

#### Scenario: URL 获得 ID 后保存按钮解锁
- **WHEN** ChatGPT 分配 conversationId，URL 更新为 `https://chatgpt.com/c/{id}`
- **THEN** popup 中保存按钮变为可点击状态

### Requirement: auto 模式自动触发 upsert
当 `report_mode = 'auto'` 时，content script SHALL 在检测到 assistant 消息流式输出结束后自动向 background 发送 `SAVE_REQUEST`。流式结束定义为：最后一个 `[data-message-author-role="assistant"]` 节点的 `textContent` 连续 500ms 未发生变化。

#### Scenario: auto 模式每轮回复后自动保存
- **WHEN** report_mode 为 auto，AI 完成一轮回复（流式输出停止 500ms）
- **THEN** content script 自动发送 `SAVE_REQUEST`，background 执行 upsert，无需用户操作

#### Scenario: manual 模式不自动触发
- **WHEN** report_mode 为 manual，AI 完成回复
- **THEN** 不触发任何自动保存，仅等待用户点击 popup 中的保存按钮

### Requirement: 提取质量标记不完整捕获
当 observer 缓存中的消息数量少于页面 `[data-testid^="conversation-turn-"]` 节点总数时，SHALL 在 `extraction_quality.warnings` 中追加 `'partial_observer_capture'`。

#### Scenario: 历史对话部分消息未渲染时标记警告
- **WHEN** ChatGPT 虚拟化导致部分老消息未在 DOM 中渲染，observer 缓存消息数 < conversation-turn 总数
- **THEN** `extraction_quality.warnings` 包含 `'partial_observer_capture'`，`confidence` 降至 0.6 以下
