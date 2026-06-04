## Context

扩展当前的保存流程：用户点击 popup → content script 用 `querySelectorAll` 做一次性 DOM 快照 → background 写入 SQLite → 触发 AI 管线（摘要 + 记忆候选 + Context Pack）。

两个问题：
1. ChatGPT 使用虚拟列表，`querySelectorAll` 只拿到视窗内已渲染的节点，长对话消息会丢失。
2. AI 管线依赖外部 API Key，增加了配置负担和失败路径，不符合"只做原文存档"的 V0.1 定位。

## Goals / Non-Goals

**Goals:**
- 保存对话只写原始内容，无 AI 调用
- ChatGPT 页面实现无遗漏的全量消息采集（不依赖滚动、不依赖未公开 API）
- 支持按 conversationId 做 upsert，避免重复记录
- 支持 auto（每轮回复后自动保存）/ manual（用户手动）两种模式

**Non-Goals:**
- 历史批量抓取（不打开旧对话页面批量导入）
- Claude / Gemini / Perplexity 适配（V0.2）
- 摘要、记忆候选、Context Pack 生成（V0.2+）
- 未公开 ChatGPT 内部 API 调用

## Decisions

### 决策 1：MutationObserver 替代一次性 DOM 快照

**选择**：content script 在页面加载时立即挂载 `MutationObserver`（观察 `document.body` subtree），将所有出现过的 `[data-message-author-role]` 节点追加到内存 Map（key = 节点位置 index 或内容 hash，防重复）。用户点保存时从 Map 中提取有序消息列表。

**为什么优于滚动方案**：无需操控页面 UI，不影响用户操作，不引入等待时间。新对话中每条消息天然经过 observer，历史对话中已渲染的消息也会被捕获。

**为什么优于 Background fetch 内部 API**：不依赖未公开接口，无鉴权风险，无需额外 host permission，API 变更不影响功能。

**已知局限**：用户打开历史对话后未滚动到顶部的消息，若 ChatGPT 虚拟化未渲染这部分节点，observer 捕获不到。V0.1 接受此限制，`extraction_quality.warnings` 标记 `'partial_observer_capture'`（当消息数 < DOM 中 conversation-turn 总数时）。

### 决策 2：禁止在无 conversationId 时保存

**选择**：content script 检测 `window.location.pathname`；若不匹配 `/c/{uuid}`，popup 显示"等待对话初始化…"并禁用保存按钮。ChatGPT 在首次 AI 回复开始时自动分配 ID 并更新 URL，此后立即可保存。

**为什么**：避免以内容 hash 为主键导致同一对话产生多条记录，也避免"无 ID 的第一次保存"与后续保存的关联难题。实践中用户极少在 AI 回复前点保存，影响极小。

### 决策 3：去重键改为 source_fingerprint = `chatgpt:{conversationId}`，全量 upsert

**选择**：`insertCapture` 改为 upsert：若 `source_fingerprint` 已存在则更新 `normalized_text`、`message_count`、`updated_at`；否则插入。每次保存写入完整消息列表。

**为什么优于增量追加**：无需追踪上次存到哪条，无需 merge 逻辑；消息是纯文本量小，全量覆盖无性能问题；保证记录始终是最新完整版本。

### 决策 4：auto 模式触发时机

**选择**：observer 检测到 `[data-message-author-role="assistant"]` 节点的 `textContent` 停止变化（连续 500ms 无 mutation）时，认定流式输出结束，触发 auto-save upsert。

**为什么**：ChatGPT 流式输出期间会持续触发 mutation；静默 500ms 是流式结束的可靠信号，比检测"streaming indicator 消失"更稳定（indicator 的 class 名随 ChatGPT 更新而变化）。

## Risks / Trade-offs

- **[风险] ChatGPT DOM 结构变更** → `[data-message-author-role]` 是 ChatGPT 较稳定的语义属性，但仍可能改变。缓解：`extraction_quality.confidence` < 0.5 时在 popup 提示"识别质量低"，降级到用户手动选择文本。

- **[风险] 历史对话消息不完整** → 已接受为 V0.1 已知局限，`warnings` 标记，不作为错误处理。

- **[风险] auto 模式误触发**（网络延迟导致 500ms 内无 mutation 但回复未结束）→ 误触发只是多写一次中间状态，下次回复完成后会再次 upsert 覆盖，数据最终一致。

- **[风险] SPA 路由切换后 observer 失效** → ChatGPT 是 SPA，URL 变化时 content script 不重载。需要监听 `popstate` + `hashchange` + `pushState`/`replaceState` 拦截，在路由切换时重置 observer 缓存并重新检测 conversationId。

## Migration Plan

1. `db/worker.ts`：`schema_version` 从当前版本升到下一版本，`settings` 表执行 `ALTER TABLE` 删除 AI 字段列（SQLite 3.35+ 支持 `DROP COLUMN`；wa-sqlite 支持），新增 `report_mode TEXT NOT NULL DEFAULT 'manual'`
2. 旧有 `captures` 记录的 `source_fingerprint` 保持原值（`chatgpt:https://...`），不做数据迁移；新记录写入简化后的 fingerprint
3. 删除文件前确认无其他模块引用（TypeScript 编译会检查）

**回滚**：本次变更为单向删减，无新增外部依赖，可通过 git revert 回滚；SQLite schema 变更通过降低 `schema_version` + 反向 migration 恢复（开发阶段直接删除 OPFS 文件重建）。

## Open Questions

- ChatGPT SPA 路由切换拦截：使用 Proxy 拦截 `history.pushState` 还是 `MutationObserver` 监测 URL 变化？（实现阶段决定，两者均可行）
