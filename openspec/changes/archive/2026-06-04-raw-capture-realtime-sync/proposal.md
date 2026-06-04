## Why

当前实现在保存对话后自动调用 AI API 做摘要提取、记忆候选生成和 Context Pack 构建，增加了不必要的复杂度和外部依赖。同时 ChatGPT 内容抓取仅读取当前 DOM 视窗，长对话会有消息遗漏。V0.1 目标是可靠地保存原始对话，不做任何自动分析。

## What Changes

- **BREAKING** 移除完整 AI 管线：`generateSummary` / `extractMemoryCandidates` / `buildContextPack` 不再调用
- 删除 `lib/ai-client.ts`、`lib/context-pack.ts`、`db/repos/memories.ts`、`db/repos/context-packs.ts`
- 简化 `lib/types.ts`：移除 `MemoryCandidate`、`ContextPack`、`MemoryCandidateRow`，`CaptureStatus` 只留 `'saved' | 'error'`，`Settings` 删除所有 AI 字段，新增 `report_mode: 'auto' | 'manual'`
- `background.ts` 的 `handleSave` 在 `insertCapture` 后直接返回，删除 AI 步骤（原行 82–117）；移除 `VALIDATE_API_KEY` handler
- `lib/extractors/chatgpt.ts` 改为 **MutationObserver 实时监听**：content script 启动时挂载 observer，缓存所有出现过的 `[data-message-author-role]` 节点；保存时使用缓存数据，无需滚动
- 去重策略改为按 **conversationId upsert**（`source_fingerprint = 'chatgpt:{conversationId}'`，全量覆盖）；URL 无 `/c/{id}` 时禁止保存
- 新增 `report_mode` 设置：`auto` 模式在每次 AI 回复流式结束后自动触发 upsert；`manual` 模式（默认）保持用户点击保存
- **BREAKING** Options 页面：删除 `ReviewInbox` 路由与页面；`CaptureDetail` 移除 candidates/context-pack 块，改为展示原始对话文本；`Settings` 删除 AI 提供商配置区块，新增上报模式切换

## Capabilities

### New Capabilities

- `realtime-capture`: MutationObserver 实时监听 ChatGPT DOM，按 conversationId 缓存全量消息，支持 auto/manual 上报模式

### Modified Capabilities

- `capture-save`: 保存行为从"写入后触发 AI 管线"变为"写入即完成"，去重键从 content_hash 改为 conversationId upsert

## Impact

- `extension/src/entrypoints/background.ts` — 移除 AI pipeline 调用与 VALIDATE_API_KEY handler
- `extension/src/entrypoints/content/chatgpt.ts` — 改为 MutationObserver + auto-save 触发逻辑
- `extension/src/lib/extractors/chatgpt.ts` — 改为从 observer 缓存提取，不再做 DOM querySelectorAll
- `extension/src/lib/types.ts` — 大幅简化类型定义
- `extension/src/db/worker.ts` — schema migration：settings 表删 AI 字段，加 report_mode
- `extension/src/db/repos/settings.ts` — 更新读写逻辑
- `extension/src/entrypoints/options/pages/Settings.tsx` — 删 AI 提供商 UI，加上报模式切换
- `extension/src/entrypoints/options/pages/CaptureDetail.tsx` — 展示原始对话
- `extension/src/entrypoints/options/App.tsx` — 删除 ReviewInbox 路由
- 删除文件：`lib/ai-client.ts`、`lib/context-pack.ts`、`db/repos/memories.ts`、`db/repos/context-packs.ts`
