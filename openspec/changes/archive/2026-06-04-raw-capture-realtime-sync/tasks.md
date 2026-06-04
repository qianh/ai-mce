## 1. 类型与数据模型简化

- [x] 1.1 `lib/types.ts`：删除 `MemoryCandidate`、`MemoryCandidateRow`、`ContextPack` 类型；`CaptureStatus` 改为 `'saved' | 'error'`；`ProgressStep` 只保留 `writing_local`；`Settings` 删除 `ai_provider`、`*_api_key`、`default_save_mode`、`raw_text_retention`，新增 `report_mode: 'auto' | 'manual'`；删除 `AiProvider` 类型
- [x] 1.2 `db/worker.ts`：`schema_version` 加 1；`settings` 表执行 migration（DROP COLUMN AI 字段，ADD COLUMN `report_mode TEXT NOT NULL DEFAULT 'manual'`）
- [x] 1.3 `db/repos/settings.ts`：更新 `getSettings` / `setSetting` 读写逻辑，对齐新 Settings 类型

## 2. 删除 AI 管线代码

- [x] 2.1 删除 `lib/ai-client.ts`
- [x] 2.2 删除 `lib/context-pack.ts`
- [x] 2.3 删除 `db/repos/memories.ts`
- [x] 2.4 删除 `db/repos/context-packs.ts`
- [x] 2.5 `background.ts`：移除 AI pipeline 调用（行 82–117）；`handleSave` 在 `insertCapture` / upsert 后直接 `sendResponse({ success: true })`；删除 `VALIDATE_API_KEY` message handler；移除所有 AI 相关 import

## 3. 去重逻辑改为 conversationId upsert

- [x] 3.1 `db/repos/captures.ts`：新增 `upsertCapture(conversation)` 函数，按 `source_fingerprint` 做 INSERT OR REPLACE（或 UPDATE on conflict）；`insertCapture` 保留供 generic extractor 使用
- [x] 3.2 `background.ts` 的 `handleSave`：ChatGPT 来源改调 `upsertCapture`，其余来源仍用 `insertCapture`

## 4. MutationObserver 实时采集

- [x] 4.1 `lib/extractors/chatgpt.ts`：新增 `ChatGPTObserver` 类，提供 `start()` / `stop()` / `reset()` / `getMessages()` 接口；`start()` 挂载 MutationObserver 监听 `document.body` subtree，将出现的 `[data-message-author-role]` 节点追加到 Map（key = index）
- [x] 4.2 `lib/extractors/chatgpt.ts`：`ChatGPTExtractor.extract()` 改为从 `ChatGPTObserver.getMessages()` 取数据，不再调用 `querySelectorAll`；保留 `querySelectorAll` 作为 fallback（observer 缓存为空时）
- [x] 4.3 `lib/extractors/chatgpt.ts`：`extraction_quality` 计算加入 `partial_observer_capture` 警告逻辑（observer 消息数 < `conversation-turn` 节点总数）
- [x] 4.4 `entrypoints/content/chatgpt.ts`：页面加载时调用 `ChatGPTObserver.start()`；监听 URL 变化（`popstate` + `history.pushState` Proxy 拦截），路由切换时调用 `reset()` 并更新 conversationId；向 popup 提供当前 conversationId（响应 `GET_CONVERSATION_ID` 消息）
- [x] 4.5 `entrypoints/content/chatgpt.ts`：实现 auto 模式触发逻辑：`getSettings` 读取 `report_mode`；若为 `auto`，在检测到 assistant 节点 textContent 静默 500ms 后，发送 `SAVE_REQUEST` 到 background

## 5. Popup 门控逻辑

- [x] 5.1 `entrypoints/popup/App.tsx`：打开 popup 时向 content script 发送 `GET_CONVERSATION_ID`；若返回 null（无 ID），显示禁用状态的保存按钮并提示"等待对话初始化…"；若有 ID，正常展示 SaveScreen
- [x] 5.2 验证：在 `chatgpt.com`（无 ID）页面打开 popup，保存按钮应禁用

## 6. Options 页面适配

- [x] 6.1 `entrypoints/options/App.tsx`：删除 `ReviewInbox` 路由和导航链接
- [x] 6.2 `entrypoints/options/pages/CaptureDetail.tsx`：移除 candidates 列表和 context-pack 区块；新增原始对话消息列表展示（role 标签 + content 文本，可滚动）
- [x] 6.3 `entrypoints/options/pages/Settings.tsx`：删除 AI 提供商配置区块（provider 选择 + API key 输入/验证）；新增"上报模式"卡片（Auto / Manual 切换，默认 Manual），调用 `setSetting('report_mode', value)`

## 7. 构建验证

- [x] 7.1 运行 `bun run typecheck`，确保 0 TS 错误
- [x] 7.2 运行 `bun test`，确保全部测试通过（更新因类型变更失败的测试）
- [x] 7.3 运行 `bun run build`，确保 WXT 构建成功，无未解析的引用
