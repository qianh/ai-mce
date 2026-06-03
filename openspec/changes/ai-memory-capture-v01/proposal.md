## Why

用户在 ChatGPT / Claude 等平台产生的高价值 AI 对话（决策、方案、上下文）无法跨会话复用，且因隐私顾虑不愿上传到第三方云服务。V0.1 以「完全本地、用户自控」为原则，构建一个 Chrome 扩展让用户一键把对话沉淀为可复用的项目记忆与 Context Pack。

## What Changes

- **新建** Chrome Extension（Manifest V3，WXT + React + TypeScript）
- **新建** ChatGPT 对话 Extractor（DOM 提取 + Selection 降级）
- **新建** 本地 SQLite 数据库（wa-sqlite + OPFS，无云端依赖）
- **新建** Popup 保存预览界面（保存范围 / 项目选择 / 保存方式 / 隐私告知）
- **新建** Background Service Worker（队列管理 + AI API 调用代理）
- **新建** options_page 控制台（Capture 列表 / 详情 / Context Pack 复制）
- **新建** 设置页（用户 API Key 管理 / 原文保留策略 / 导出 .sqlite）

## Capabilities

### New Capabilities
- `capture`: 用户主动触发，提取当前 ChatGPT 对话或选中内容，写入本地 SQLite
- `storage`: wa-sqlite + OPFS 本地数据库，管理 Capture / MemoryCandidate / ContextPack 实体
- `ai-processing`: 调用用户自有 Claude/OpenAI API Key，生成摘要和候选记忆（L0-L5 分级）
- `console`: options_page 控制台，展示 Capture 列表、详情、候选记忆确认、Context Pack 复制
- `context-pack`: 基于已确认记忆生成 Markdown 格式上下文包，一键复制到剪贴板
- `export`: 导出完整数据库为 .sqlite 文件，支持手动备份

### Modified Capabilities
<!-- 无既有 spec，跳过 -->

## Impact

- 新增 `extension/` 目录（WXT 项目，Chrome MV3）
- 新增 `design/` 目录（UI 设计稿参考，13 屏）
- manifest 权限：`storage`、`activeTab`、`scripting`、`contextMenus`、`unlimitedStorage`
- 外部依赖：`wa-sqlite`、`@sqlite.org/sqlite-wasm`、WXT、React、TypeScript
- 用户数据完全本地，开发者服务器零参与
