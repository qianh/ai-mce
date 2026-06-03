## 1. 项目脚手架

- [ ] 1.1 用 WXT 初始化 Chrome Extension 项目（React + TypeScript，MV3）
- [ ] 1.2 配置 manifest：permissions（storage/activeTab/scripting/contextMenus/unlimitedStorage）、host_permissions（chatgpt.com）
- [ ] 1.3 配置 WXT 构建（Vite + TypeScript strict mode）、ESLint + Prettier
- [ ] 1.4 设置设计 tokens（复制 `design/tokens.css` 到扩展 CSS 系统）
- [ ] 1.5 创建 WXT 入口文件：background、content（chatgpt）、popup、options

## 2. 本地存储层（wa-sqlite + OPFS）

- [ ] 2.1 安装 `@sqlite.org/sqlite-wasm`，配置 WASM 文件通过 WXT 构建复制到扩展目录
- [ ] 2.2 创建 `lib/db.ts`：初始化 OPFS 数据库、WAL 模式、schema 版本管理
- [ ] 2.3 创建数据库 schema（9张表：captures / source_documents / memory_candidates / memory_items / decisions / tasks / context_packs / settings / schema_migrations）
- [ ] 2.4 创建 `lib/db-migrations.ts`：schema 迁移系统（版本号递增）
- [ ] 2.5 创建 `lib/repositories/` 目录，实现各实体的 CRUD 操作（CaptureRepo / MemoryCandidateRepo / SettingsRepo 等）
- [ ] 2.6 编写 storage 层单元测试（使用 vitest + sqlite-wasm in-memory 模式）

## 3. ChatGPT Extractor

- [ ] 3.1 创建 `content-scripts/extractors/base.ts`（ConversationExtractor 接口）
- [ ] 3.2 创建 `content-scripts/extractors/chatgpt.ts`：DOM 提取（role attr > testid > aria-label 多选择器策略）
- [ ] 3.3 实现文本归一化（trim / 去 UI 文案 / 保留代码块）和 SHA-256 content_hash 计算
- [ ] 3.4 实现 extraction_quality 评分（confidence / method / warnings）
- [ ] 3.5 创建 `content-scripts/extractors/generic-page.ts`：Selection 降级路径
- [ ] 3.6 建立 ChatGPT fixture HTML 测试文件（至少 3 个：正常对话 / 含代码块 / 长对话）
- [ ] 3.7 编写 Extractor 单元测试（vitest，覆盖正常提取 / 降级 / 质量评分）

## 4. 敏感内容检测

- [ ] 4.1 创建 `lib/sensitive-detector.ts`：关键字正则扫描（API Key / token / 身份证 / 银行卡等）
- [ ] 4.2 实现检测结果结构体（命中片段 + 位置 + 类型）
- [ ] 4.3 编写敏感检测单元测试

## 5. Popup UI

- [ ] 5.1 创建 Popup 入口（`popup/App.tsx`），实现与 Background 的消息通信
- [ ] 5.2 实现「保存预览」主界面（ExtSave 组件，参照 `design/screens-extension.jsx`）
- [ ] 5.3 实现「提取质量低」界面（ExtDegraded 组件）
- [ ] 5.4 实现「敏感内容命中」界面（ExtSensitive 组件）
- [ ] 5.5 实现「保存成功」界面（ExtSuccess 组件，含进度步骤 + 「复制 Context Pack」按钮）
- [ ] 5.6 实现「保存失败」界面（ExtFail 组件）
- [ ] 5.7 实现 PrivacyNote 组件（「将保存 / 不会保存」隐私告知）
- [ ] 5.8 设计 tokens 应用到 Popup（CSS 变量 + 明暗主题切换）

## 6. Background Service Worker

- [ ] 6.1 创建 `background/service-worker.ts` 入口，注册消息处理器
- [ ] 6.2 实现 `handleSaveRequest`：接收 Popup 保存请求 → 写入 SQLite → 触发 AI 处理
- [ ] 6.3 实现 AI 处理流程：调用 Claude API（摘要 → 记忆提取 → Context Pack 生成）
- [ ] 6.4 实现进度推送（`chrome.runtime.sendMessage` 向 Popup 推送处理状态）
- [ ] 6.5 实现 API Key 验证（测试请求到 Anthropic API）
- [ ] 6.6 实现 content_hash 去重检测
- [ ] 6.7 实现 Claude API 调用失败的容错（保存原始文本，摘要标记 failed）

## 7. options_page 控制台 UI

- [ ] 7.1 创建 options_page 入口（`options/App.tsx`），React Router 配置（列表 / 详情 / Review / Pack / 设置）
- [ ] 7.2 实现控制台 Shell（侧边栏导航 + 顶部搜索栏，参照 `design/screens-console.jsx`）
- [ ] 7.3 实现 Capture 列表页（ConsoleList），从 SQLite 查询并渲染
- [ ] 7.4 实现 Capture 详情页（ConsoleDetail），含候选记忆确认 / 忽略 / 撤销操作
- [ ] 7.5 实现 Review Inbox 页（ConsoleReview），筛选 pending L4/L5 条目
- [ ] 7.6 实现 Context Pack 详情页（ConsolePack），含复制按钮
- [ ] 7.7 实现设置页（ConsoleSettings）：API Key 配置 / 原文保留策略 / 数据导出 / 清除原文

## 8. Context Pack 生成

- [ ] 8.1 创建 `lib/context-pack-builder.ts`：基于已确认记忆组装 Markdown Pack
- [ ] 8.2 实现章节选择逻辑（无内容章节自动省略）
- [ ] 8.3 实现 Context Pack 写入 SQLite（context_packs 表）
- [ ] 8.4 编写 Context Pack 生成单元测试

## 9. 数据导出

- [ ] 9.1 实现「导出 .sqlite」：Background 从 OPFS 读取文件 → `chrome.downloads.download()`
- [ ] 9.2 实现「清除原文」：批量 UPDATE source_documents.normalized_text = NULL，含二次确认

## 10. 集成测试与验收

- [ ] 10.1 端到端手工测试：ChatGPT 页面保存 → SQLite 写入 → AI 摘要 → 控制台查看 → Context Pack 复制
- [ ] 10.2 测试 Extractor 降级路径：ChatGPT DOM 失败 → Selection 保存流程
- [ ] 10.3 测试敏感内容检测提示流程
- [ ] 10.4 测试设置页 API Key 配置与验证
- [ ] 10.5 测试导出 .sqlite 文件可被 DB Browser for SQLite 正常打开
- [ ] 10.6 运行 lint + typecheck，确保零错误
- [ ] 10.7 在 Chrome 开发者模式加载扩展，验证所有权限正常
