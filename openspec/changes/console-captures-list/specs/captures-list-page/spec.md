# captures-list-page · Spec

## 目标

Captures 列表页（路由 `/`）：展示当前用户所有 Cloud Data Captures，支持端侧和渠道双维服务端过滤，limit/offset 分页，按 `created_at` 倒序。

## 功能需求

- FR-001: 页面加载时调 `GET /v1/captures?limit=20&offset=0`，展示结果列表
- FR-002: 每条 Capture 展示：标题（source_title）、AI 产品徽章（source_platform）、端侧徽章（Browser/Desktop）、创建时间（created_at，格式 `YYYY-MM-DD HH:mm`）、消息数（message_count）
- FR-003: **端侧筛选**：下拉选项「全部 / 浏览器端 / 桌面端」，切换后重置 offset=0 重新请求
- FR-004: **渠道筛选**：下拉选项「全部 / ChatGPT / DeepSeek / Claude Code / Codex / Grok / OpenCode」，切换后重置 offset=0 重新请求
- FR-005: 筛选参数映射：
  - 端侧「浏览器端」→ `source_side=browser`；「桌面端」→ `source_side=desktop`；「全部」→ 不传
  - 渠道 → `source_platform={value}`；「全部」→ 不传
- FR-006: **分页**：页面底部「加载更多」按钮，点击追加下一页（offset += 20）；返回结果 < limit 时隐藏按钮
- FR-007: 加载中：展示 loading 状态；加载失败：展示错误提示 + 重试按钮
- FR-008: 点击列表条目跳转 `/capture/{id}`
- FR-009: 空状态：无数据时展示提示文案「还没有上报记录」

## 非功能需求

- NFR-001: 切换筛选时取消上一个进行中的请求（避免竞态）
- NFR-002: 端侧徽章颜色区分：浏览器端用蓝色/默认色，桌面端用橙色/accent 色

## 验收标准

- AC-001: 默认加载最新 20 条，按 created_at 倒序排列
- AC-002: 切换「桌面端」筛选，列表只显示 `source_url == "desktop"` 的 Captures
- AC-003: 切换渠道「Claude Code」，列表只显示 `source_platform == "claude"` 的 Captures
- AC-004: 两个筛选同时生效（AND 关系）
- AC-005: 点击「加载更多」追加下一页，URL query string 不变（不改路由）
- AC-006: 返回 0 条时「加载更多」按钮不显示
- AC-007: API 报错时展示错误状态，重试按钮点击后重新请求

## 测试策略

- 单元：筛选参数构建逻辑、端侧推断显示逻辑
- 集成：mock API server，验证不同筛选组合发出正确 query params
- 手工：用真实 API server 验证过滤结果正确性
