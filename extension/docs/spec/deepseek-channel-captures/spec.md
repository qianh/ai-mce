---
feature: deepseek-channel-captures
executor: codex
scores: { 规模: M, 风险: M, 项目: 老, 领域清晰度: 清晰 }
nodes: [NS, N1, N3, N4, N5, N6, N7]
flavors: { NS: codebase-analyzer, N1: grill-with-docs, N3: openspec, N4: task-master, N5: test-driven-development, N7: requesting-code-review }
execution_modes: { NS: current-agent, N1: current-agent, N3: current-agent, N4: current-agent, N5: current-agent, N7: current-agent }
deps_check: { codebase-analyzer: ok, grill-with-docs: ok, openspec: ok, task-master: ok, test-driven-development: ok, verification-before-completion: ok, requesting-code-review: ok }
status: done
created: 2026-06-04
openspec_change: /Users/hong/John/ai/ai-mce/openspec/changes/deepseek-channel-captures
---

# deepseek-channel-captures · Spec

## 涉及服务 / 跨仓范围
- 当前项目：WXT + React 浏览器扩展，路径 `/Users/hong/John/ai/ai-mce/extension`。
- 关联服务 / 仓：
  - 无后端服务或兄弟仓改动；本次只触及扩展仓和父级 OpenSpec change。
- 关联 API / 配置 / DB / Apollo / 回调与 webhook 链路：
  - 浏览器扩展 content script 匹配与 host permissions。
  - 本地 SQLite `captures.source_platform` 已存在，无新增 DB 字段要求。
  - background 继续通过 `SAVE_REQUEST` 写入本地 DB，不调用外部 AI API。
- 完整功能边界：
  - DeepSeek 页面捕获：新增 `deepseek` 平台识别与对话抽取。
  - Captures 页面：明确展示上报渠道，支持渠道筛选和标题模糊检索。
  - 保存/去重：DeepSeek conversation id 可用时按 `deepseek:{conversation_id}` upsert；不可用时沿用 content hash duplicate 保护。

## 问题与非目标
- 要解决什么痛点 / 用户是谁：
  - 用户当前只能在 ChatGPT 渠道保存对话；需要把 DeepSeek 对话也保存进同一套本地 Capture 资产。
  - Captures 列表目前渠道信息弱展示，无法按渠道或标题快速定位历史记录。
- 非目标：
  - 不新增服务端同步、云端 API、摘要生成、记忆提取或 Context Pack 流程。
  - 不改动 SQLite schema；仅复用已有 `source_platform` 字段。
  - 首版不强制为 DeepSeek 实现 auto report mode；除非现有 content script 结构可无额外风险复用，否则以手动保存为验收范围。
  - 不重写 CaptureDetail 页面。
- 失败路径：
  - DeepSeek DOM 选择器与 ChatGPT 不同导致抽取为空。
  - Popup 仍硬编码注入 `content-scripts/chatgpt.js`，导致 DeepSeek 页面无法响应 `EXTRACT_CONVERSATION`。
  - Manifest 未授权 `https://chat.deepseek.com/*`，导致脚本无法注入。
  - 搜索仅前端过滤但列表计数/空状态不准确。

## 领域词表
- 渠道 / source platform：保存来源平台的稳定枚举键，例如 `chatgpt`、`deepseek`、`generic_web`。
- 上报渠道：Captures 页面向用户展示的渠道标签，来源于 `Capture.source_platform`。
- 标题模糊检索：对 `Capture.source_title` 做大小写不敏感的包含匹配。
- 渠道筛选：按 `source_platform` 精确筛选；UI 标签可展示为 `ChatGPT`、`DeepSeek`。

## 需求
- FR-001：系统 SHALL 支持在 `https://chat.deepseek.com/*` 页面抽取 DeepSeek 对话，并将 `source.platform` 写为 `deepseek`。
- FR-002：DeepSeek 抽取结果 SHALL 包含 title、messages、content hash、message hashes、source fingerprint 和 extraction quality。
- FR-003：Popup SHALL 能在 ChatGPT 与 DeepSeek 页面请求正确的 content script 抽取结果，不再只硬编码 ChatGPT 保存路径。
- FR-004：扩展 manifest SHALL 授权 DeepSeek host，并让 DeepSeek 页面可被 content script 或手动注入覆盖。
- FR-005：Captures 列表 SHALL 以明确视觉标签展示每条记录的上报渠道。
- FR-006：Captures 列表 SHALL 支持按渠道筛选。
- FR-007：Captures 列表 SHALL 支持按标题模糊检索。
- FR-008：筛选和搜索 SHALL 可组合使用，并正确更新列表计数和空状态。
- NFR-001：不新增数据库迁移；已有历史记录 SHALL 继续正常显示。
- NFR-002：新增平台逻辑 SHALL 有单元测试或组件测试覆盖。

## 数据模型 / API / UI / 兼容 / 权限
- 数据模型：
  - 扩展 `ExtractedConversation.source.platform` 类型，新增 `'deepseek'`。
  - `Capture.source_platform` 继续为 string，不需要 DB schema 迁移。
- Content script / extractor：
  - 新增 DeepSeek extractor，优先使用页面稳定 DOM 属性；无法确认稳定属性时使用更保守的正文容器抽取并降低 confidence。
  - DeepSeek conversation id 从 URL 中解析，生成 `deepseek:{id}` fingerprint；解析失败时使用 `deepseek:{url}`。
  - 平台脚本命名需要和 WXT 输出一致，避免 popup 手动注入仍只找 `content-scripts/chatgpt.js`。
- Popup：
  - 平台识别从 `chatgpt.com` 扩展到 `chat.deepseek.com`。
  - ChatGPT 可继续保留 conversation id 等待门控；DeepSeek 如无法稳定判定 id，不阻塞手动抽取。
- Options UI：
  - 列表顶部新增搜索输入和渠道筛选控件。
  - 每行展示渠道标签，不只依赖灰色副标题文本。
  - 筛选无结果时显示搜索空状态，不复用“还没有保存记录”的初始空状态文案。
- 权限：
  - `wxt.config.ts` 的 `host_permissions` 增加 `https://chat.deepseek.com/*`。

## 验收标准
- AC-001：在 DeepSeek 会话页点击扩展保存，保存结果中的 `source_platform` 为 `deepseek`。
- AC-002：同一 DeepSeek conversation id 多次保存时更新同一条 capture，不创建重复记录。
- AC-003：Captures 页面每条记录都显示可读渠道标签。
- AC-004：选择 `DeepSeek` 渠道后，只展示 `source_platform === 'deepseek'` 的记录。
- AC-005：输入标题关键词后，只展示标题包含关键词的记录；匹配大小写不敏感。
- AC-006：渠道筛选与标题搜索同时启用时，结果取交集。
- AC-007：无匹配结果时显示筛选空状态；清空筛选后恢复完整列表。
- AC-008：现有 ChatGPT 捕获、保存、列表展示测试仍通过。

## 测试策略
- 单元测试：
  - 新增 DeepSeek extractor fixture，覆盖 canHandle、角色识别、hash、fingerprint、confidence。
  - 捕获列表过滤逻辑覆盖渠道筛选、标题搜索和组合筛选。
- 组件测试：
  - `CaptureList` 渲染渠道标签、搜索输入、渠道选项和空结果。
- 回归测试：
  - ChatGPT extractor 测试保持通过。
  - DB migration 测试保持通过，证明无需新增字段。
- 手工验收：
  - 构建扩展后，在 `chatgpt.com` 与 `chat.deepseek.com` 分别打开 popup 验证保存路径。

## 任务拆解
- [x] T-001 Add DeepSeek platform support to type definitions and manifest
  - 来源：Task Master task 1
  - 文件：`src/lib/types.ts`、`wxt.config.ts`
  - 验证：typecheck/build，生成 manifest 包含 `https://chat.deepseek.com/*`
- [x] T-002 Create DeepSeek extractor implementation
  - 来源：Task Master task 2
  - 文件：`src/lib/extractors/deepseek.ts`、`fixtures/deepseek-*.html`、`tests/extractors/deepseek.test.ts`
  - 验证：DeepSeek canHandle、角色识别、hash、fingerprint、confidence
- [x] T-003 Create DeepSeek content script
  - 来源：Task Master task 3
  - 文件：DeepSeek content entrypoint
  - 验证：`EXTRACT_CONVERSATION` 返回 `source.platform = deepseek`
- [x] T-004 Create DeepSeek observer for real-time message capture
  - 来源：Task Master task 4
  - 文件：`src/lib/extractors/deepseek.ts`
  - 验证：observer start/reset/getMessages 与局部捕获标记
- [x] T-005 Update Popup to dynamically detect platform and route extraction
  - 来源：Task Master task 5
  - 文件：`src/entrypoints/popup/App.tsx`
  - 验证：ChatGPT/DeepSeek 选择正确脚本与抽取路径
- [x] T-006 Update CaptureList to add platform filtering and title search UI
  - 来源：Task Master task 6
  - 文件：`src/entrypoints/options/pages/CaptureList.tsx`、`tests/options/CaptureList.test.tsx`
  - 验证：渠道标签、渠道筛选、标题搜索、组合筛选、筛选空状态
- [x] T-007 Implement idempotent upsert logic using DeepSeek conversation ID
  - 来源：Task Master task 7
  - 文件：`src/lib/extractors/deepseek.ts`、`src/entrypoints/background.ts`（若现有逻辑不足）
  - 验证：同一 `deepseek:{id}` 重复保存走 upsert
- [x] T-008 Add comprehensive tests for DeepSeek integration and verify all AC/NFR criteria
  - 来源：Task Master task 8
  - 验证：`bun test`、构建/类型检查、ChatGPT 回归

## 实现与测试记录
- 新增 DeepSeek 抽取器与 observer：`src/lib/extractors/deepseek.ts`
  - 支持 `chat.deepseek.com`。
  - 从 `/a/chat/s/{id}`、`/chat/s/{id}`、`/chat/{id}` 或 query id 解析 conversation id。
  - 生成 `source.platform = 'deepseek'` 与 `source_fingerprint = deepseek:{id|url}`。
- 新增 DeepSeek content script：`src/entrypoints/deepseek.content.ts`
  - 输出构建产物 `content-scripts/deepseek.js`。
  - 支持 `EXTRACT_CONVERSATION`、`GET_CONVERSATION_ID`、`GET_SELECTION`。
- Popup 路由改为按页面平台选择 content script：`src/entrypoints/popup/platform.ts`、`src/entrypoints/popup/App.tsx`
  - ChatGPT 继续保留 conversation id 等待门控。
  - DeepSeek 不走 ChatGPT id 门控，直接抽取。
- Captures 页面新增渠道标签、渠道筛选、标题搜索和筛选空状态：`src/entrypoints/options/pages/CaptureList.tsx`
- 类型与 manifest：
  - `ExtractedConversation.source.platform` 新增 `'deepseek'`。
  - `wxt.config.ts` 新增 `https://chat.deepseek.com/*` host permission。
- Task Master：
  - 已生成 8 个任务并全部标为 done。
  - `gpt-5.5` 可直接通过 Codex CLI 调用，但 Task Master 的 codex-cli provider 在 structured output schema 上失败；最终 N4 由 `claude-code/haiku` fallback 生成任务，随后 main 调整为 `claude-code/sonnet`。

## 验证记录（DoD）
- [x] 所有测试通过  [x] lint/whitespace  [x] typecheck  [x] build
- [x] 新增逻辑有测试  [x] 修改行为有回归  [x] 无绕过测试
- RED：`bunx vitest run tests/extractors/deepseek.test.ts tests/popup/platform.test.ts tests/options/CaptureList.test.tsx` 初始失败，原因是 DeepSeek extractor / popup platform 模块缺失、CaptureList 控件缺失。
- GREEN：目标测试通过，`3 passed / 12 tests`。
- 全量测试：`bunx vitest run` 通过，`7 passed / 34 tests`。
- 类型检查：`bunx tsc --noEmit` 通过。
- 构建：`bunx wxt build` 通过，并生成 `content-scripts/deepseek.js`。
- Manifest 验证：`.output/chrome-mv3/manifest.json` 包含 `https://chat.deepseek.com/*` 和 DeepSeek content script match。
- Diff 检查：`git diff --check` 通过。

## 需求追溯矩阵
N/A（风险 M，不强制）

## 审查记录
- N7 当前 agent 审查完成。
- 重点检查：
  - DeepSeek extractor 产出 `source.platform`、fingerprint、metadata 与质量标记。
  - Popup 不再硬编码 `content-scripts/chatgpt.js`。
  - CaptureList 筛选为空时不复用初始无数据文案。
  - WXT 产物包含 DeepSeek content script。
- 未发现阻断问题。
- 残余风险：
  - DeepSeek 真实站点 DOM 可能与 fixture 不一致；当前实现采用多选择器保守策略，仍建议手工在 `chat.deepseek.com` 保存一条真实对话确认。

## 决策与归档（ADR）
- Gate 1 决策：N4 改为 `task-master`，依赖已安装并验证 `task-master --version = 0.43.1`。
- Gate 2 决策：用户确认继续，N3 规格定稿并进入 N4。
- OpenSpec workspace root：`/Users/hong/John/ai/ai-mce`，change 创建于父级 `openspec/changes/deepseek-channel-captures`。
- N7 决策：当前工具策略不允许擅自派 subagent；N7 以 current-agent 审查完成。
