---
feature: ai-memory-capture
executor: claude-code
scores: { 规模: H, 风险: M, 项目: 新, 领域清晰度: 清晰 }
nodes: [N0, N1, N3, N4, N5, N6, N7]
flavors: { N0: init, N1: grill-me, N3: openspec, N4: superpowers:writing-plans, N5: superpowers:test-driven-development, N6: superpowers:verification-before-completion, N7: code-review }
execution_modes: { N5: current-agent }
deps_check: { init: ok, grill-me: ok, openspec: "ok(v1.4.0)", superpowers:writing-plans: ok, superpowers:test-driven-development: ok, superpowers:verification-before-completion: ok, code-review: ok }
status: done
created: 2026-06-03
---

# AI Memory Capture Extension · Spec

## 涉及服务 / 跨仓范围        <!-- NS，新项目 greenfield -->
N/A（新项目，无既有服务/仓）

## 问题与非目标            <!-- N1 -->

### 要解决的核心痛点
用户在 ChatGPT / Claude 等 AI 对话中产生大量有价值的讨论（决策、方案、上下文），但这些内容：
- 分散在各平台，无法跨会话复用
- 平台随时可能改版导致历史对话难以检索
- 用户担心隐私数据被云服务收集

### 用户是谁
个人开发者 / 知识工作者，重度使用多个 AI 平台，有强烈的隐私意识，不希望数据经过第三方服务器。

### N1 核心决策（与原 PRD 的重要差异）

| 决策项 | V0.1 方案 | 原 PRD 方案 |
|---|---|---|
| 存储 | `wa-sqlite + OPFS`（本地真实 SQLite） | 云端 Memory API |
| Auth | 无 | OAuth + PKCE |
| AI 处理 | 用户自己的 Claude/OpenAI API Key，插件直调 | 开发者云端调用 |
| Web 控制台 | 扩展 `options_page`（React，读本地 SQLite） | 独立 Web App |
| 同步/备份 | 手动导出 `.sqlite`（V0.2 接 Drive） | 云端跨设备同步 |
| Extractor 降级 | DOM → Selection（二级） | DOM → Selection → 手动粘贴（三级） |

### 非目标（V0.1 明确不做）
- 云端服务器（开发者不碰用户数据）
- 用户注册 / 登录
- 多设备自动同步（V0.2，Google Drive）
- Claude / Gemini / Perplexity Extractor（V0.2）
- Side Panel（V0.2）
- MCP / CLI 集成（V0.3）
- 团队协作
- 自动保存（后台监控）
- 手动粘贴降级路径（V0.1.1）

### 失败路径
- ChatGPT DOM 变化 → 降级到 Selection → 提示用户选中文本后重试
- API Key 无效 / 超限 → 提示用户检查 Key，仍保存原始对话文本到 SQLite
- OPFS 写入失败 → 提示用户磁盘空间不足
- 导出时 `.sqlite` 文件损坏 → 用户用标准 SQLite 工具恢复（WAL 模式保障）

### V0.1 完成定义
核心闭环端到端跑通：
> 用户在 ChatGPT 点击插件 → 保存预览 → 确认 → 本地 SQLite 写入 → AI API 生成摘要+候选记忆 → options_page 控制台查看 → 复制 Context Pack

## 领域词表                <!-- N2，未跑则 N/A -->
N/A

## 需求                    <!-- N3 -->

### 变更 1：只上报原文（移除 AI 管线）
- `handleSave` 在 `insertCapture`/upsert 后直接返回，不调用任何 AI API
- 删除：`ai-client.ts`、`context-pack.ts`、`db/repos/memories.ts`、`db/repos/context-packs.ts`
- `CaptureStatus` 简化为 `'saved' | 'error'`
- `Settings` 新增 `report_mode: 'auto' | 'manual'`（默认 manual），删除所有 AI 字段
- Options 删除 ReviewInbox；CaptureDetail 改展示原始对话；Settings 删 AI 提供商区块

### 变更 2：MutationObserver 实时全量采集
- content script 加载时立即挂载 observer，缓存所有出现的 `[data-message-author-role]` 节点
- URL 无 `/c/{conversationId}` 时禁止保存（popup 显示禁用状态）
- 去重键：`source_fingerprint = 'chatgpt:{conversationId}'`，全量 upsert
- auto 模式：assistant 节点流式输出静默 500ms 后自动触发 upsert
- SPA 路由切换时重置 observer 缓存
- 历史对话部分消息未渲染时标记 `warnings: ['partial_observer_capture']`

详细规格见 `openspec/changes/raw-capture-realtime-sync/`

## 数据模型 / API / UI / 兼容 / 权限   <!-- N3，→ 裂变 design.md -->

见 `openspec/changes/raw-capture-realtime-sync/design.md`

关键变更：
- `Settings` 类型：删除 `ai_provider / *_api_key / default_save_mode / raw_text_retention`，新增 `report_mode: 'auto' | 'manual'`
- `CaptureStatus`：`'pending_ai' | 'processed' | 'ai_failed'` → `'saved' | 'error'`
- `ProgressStep`：只保留 `writing_local`
- DB schema_version 升级，settings 表 migration
- `source_fingerprint` 格式：ChatGPT 来源改为 `chatgpt:{conversationId}`

## 验收标准                <!-- N3 -->

- [ ] 保存对话不触发任何 AI API 调用（network 面板无 AI 请求）
- [ ] ChatGPT 新对话：MutationObserver 捕获全部消息，保存后 SQLite 记录消息数与 DOM 一致
- [ ] URL 无 conversationId 时保存按钮禁用
- [ ] 同一 conversationId 多次保存：SQLite 只有一条记录，内容为最新
- [ ] auto 模式：AI 回复结束后 ~500ms 自动写入，无需用户点击
- [ ] manual 模式（默认）：不自动触发保存
- [ ] TS 0 错误，所有测试通过，WXT build 成功
- [ ] Options 无 ReviewInbox 路由；CaptureDetail 展示原始消息列表

## 测试策略                <!-- N3 -->

- `lib/extractors/chatgpt.ts`：单元测试 observer 消息累积、reset、`partial_observer_capture` 警告
- `db/repos/captures.ts`：单元测试 `upsertCapture` 覆盖行为（相同 fingerprint → 更新，不同 → 插入）
- `db/repos/settings.ts`：单元测试 `report_mode` 读写，schema migration
- `background.ts`：集成测试 `handleSave` 不调用 AI、返回 `SAVE_RESULT { success: true }`
- E2E：bun test 全套，typecheck，wxt build

## 任务拆解                <!-- N4，大任务 → 裂变 tasks.md -->

## 实现与测试记录          <!-- N5 -->

## 验证记录（DoD）         <!-- N6 -->
- [x] 所有测试通过  [x] typecheck  [x] build
- [x] 新增逻辑有测试（observer 采集、upsert）  [x] 修改行为有回归  [x] 无无关 diff

## 需求追溯矩阵            <!-- 风险M，暂不强制裂变 -->
N/A

## 审查记录                <!-- N7 -->

## 决策与归档（ADR）       <!-- N8 -->
