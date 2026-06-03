## Context

这是一个全新的 Chrome Extension（MV3）项目，无既有代码库。产品定位为「个人级、隐私优先」的 AI 对话记忆工具：用户在 ChatGPT 等平台主动保存对话，数据完全存储在本地设备，通过用户自有的 AI API Key 做智能处理。

UI 设计稿已完成（`design/` 目录，13 屏），技术栈由 PRD 明确建议：WXT + React + TypeScript。

## Goals / Non-Goals

**Goals:**
- 完整 V0.1 本地闭环：ChatGPT 提取 → 本地 SQLite → AI 摘要 → 控制台查看 → Context Pack 复制
- 完全本地存储，开发者服务器零参与
- 用户自控 API Key，AI 调用计费到用户账号
- 可靠存储（wa-sqlite + OPFS，WAL 模式，无 IndexedDB 崩溃风险）

**Non-Goals:**
- 云端服务器 / 用户注册 / Auth（V0.2+）
- 多设备同步（V0.2，Google Drive）
- Claude / Gemini / Perplexity Extractor（V0.2）
- Side Panel、MCP、CLI（V0.3+）
- 自动保存 / 后台监控

## Decisions

### 决策 1：存储层选 wa-sqlite + OPFS 而非 IndexedDB

**选择：** `@sqlite.org/sqlite-wasm`（官方 WASM 构建）+ OPFS 后端

**理由：**
- IndexedDB 在大数据量下有已知崩溃和数据损坏问题
- OPFS + SQLite WAL 模式提供真正的 ACID 事务和崩溃恢复
- 导出即原生 `.sqlite` 文件，无需转换，任何 SQLite 工具可读
- Google Drive 同步（V0.2）可直接同步这个文件

**备选：** IndexedDB（被否，可靠性差）；Dexie.js（被否，底层仍是 IndexedDB）

**注意：** Service Worker 中使用 OPFS 需要 `origin-private-filesystem` 支持（Chrome 86+，覆盖率 97%+）

---

### 决策 2：AI 处理用用户自有 API Key，从 Background 直调

**选择：** 用户在设置页填写 Claude API Key 或 OpenAI API Key，存储在 OPFS SQLite 的 settings 表（不上传任何地方）。Background Service Worker 读取 key 后直接调用 AI API。

**理由：**
- 完全隐私：AI 请求不经过开发者服务器
- 无需开发者付 API 费用
- 用户对自己的数据有完整控制权

**备选：** 开发者代理 API（被否，违反隐私原则）；本地 LLM（被否，V0.1 太重）

**实现：** 优先支持 Anthropic Claude（`claude-3-5-haiku`，速度快成本低）；OpenAI 作为可选项

---

### 决策 3：Web 控制台用 options_page 而非独立 Web App

**选择：** Chrome Extension 的 `options_page`，React 开发，同扩展 origin 直接读 OPFS

**理由：**
- 独立 Web App 无法读取扩展的 OPFS（沙箱隔离）
- options_page 是同一 origin，零跨域摩擦
- 开发体验与独立 Web App 一致（同样用 React + Vite）

**备选：** 独立 Web App + 消息桥（被否，复杂度高，V0.2 有需要时再做）

---

### 决策 4：框架选 WXT（而非 Plasmo）

**选择：** WXT 0.20+

**理由：**
- WXT 对 MV3 Service Worker 的 OPFS API 支持更稳定
- 构建输出更干净，类型生成更完善
- 社区活跃度更高（2024-2026）

**备选：** Plasmo（被否，OPFS Worker 支持有问题）；原生 webpack（被否，配置成本高）

---

### 决策 5：Extractor 降级策略（二级）

**级别 1（主路径）：** ChatGPT DOM 提取（`data-message-author-role` 属性 + testid）

**级别 2（降级）：** `activeTab` + `window.getSelection()`，用户选中文本后触发

不做手动粘贴（Level 3），留 V0.1.1。

## Risks / Trade-offs

**[风险] OPFS 在 Service Worker 中的可用性**
→ 缓解：Chrome 86+（2020）已支持，实际用户覆盖 97%+。WXT 构建时验证。

**[风险] ChatGPT DOM 结构随时变化**
→ 缓解：多选择器策略（role attr > testid > aria-label），任一命中即可；监控 extraction_quality.confidence，低于 0.6 自动降级并提示。

**[风险] 用户 API Key 在本地存储的安全性**
→ 缓解：存在 OPFS 内（沙箱隔离，其他网页无法读取）；不写日志；不上传。V0.2 可加 AES-GCM 加密。

**[风险] wa-sqlite WASM 包体积（~1.5MB）影响插件加载**
→ 缓解：WASM 文件懒加载，仅在首次数据库操作时初始化；后续操作内存常驻。

**[Trade-off] options_page vs 独立 Web App**
→ 代价：用户需要「右键插件图标 → 选项」才能打开控制台，入口不如独立网址直观。
→ 收益：零部署成本，数据访问无障碍。V0.2 可以通过独立网址 + 消息桥改善入口。

## Migration Plan

这是全新项目，无存量数据迁移。

部署路径：
1. 本地开发：`bun run dev`（WXT dev mode，Chrome 自动加载扩展）
2. 发布：`bun run build` → 打包 `.zip` → 上传 Chrome Web Store（V0.2 之后）
3. V0.1 通过「开发者模式 + 加载已解压」方式分发给内测用户

## Open Questions

1. Claude API Key 和 OpenAI API Key 都支持，还是 V0.1 只支持 Claude？（建议 V0.1 只支持 Claude，减少分支）
2. 候选记忆的 L0-L5 判断 prompt 是否需要用户可自定义？（建议 V0.1 内置，不可改）
3. options_page 入口是否需要在 Popup 里加「打开控制台」按钮？（建议加，解决入口问题）
