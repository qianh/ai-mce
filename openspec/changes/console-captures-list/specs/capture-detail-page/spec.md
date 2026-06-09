# capture-detail-page · Spec

## 目标

Capture 详情页（路由 `/capture/:id`）：展示单条 Capture 的完整对话 messages，提供删除操作。

## 功能需求

- FR-001: 进入页面调 `GET /v1/captures/{id}`，展示完整内容
- FR-002: 页面顶部展示：标题（source_title）、AI 产品徽章、端侧徽章、创建时间
- FR-003: messages 区域按角色顺序展示：
  - `user` 消息：右对齐，背景色区分
  - `assistant` 消息：左对齐，默认背景
  - 每条消息展示角色标签 + 内容文本
- FR-004: **删除按钮**：页面顶部右侧，点击弹出确认对话框「确认删除该 Capture？此操作不可恢复」
- FR-005: 确认删除后调 `DELETE /v1/captures/{id}`：
  - 成功 → 跳转回 `/`
  - 失败 → 展示 toast 错误，留在当前页
- FR-006: 顶部「← 返回」链接，返回列表页（保留原筛选状态）
- FR-007: 加载中展示 skeleton；404 时展示「记录不存在」 + 返回列表链接

## 非功能需求

- NFR-001: messages 内容支持多行文本，代码块用等宽字体展示
- NFR-002: 删除操作需二次确认，防误触

## 验收标准

- AC-001: 页面正确展示 source_title、platform 徽章、端侧徽章、created_at
- AC-002: messages 按 index 顺序展示，user/assistant 视觉区分
- AC-003: 点击删除 → 弹出确认 → 确认后调 DELETE API → 跳转到 `/`
- AC-004: 取消确认 → 留在详情页，不发 DELETE 请求
- AC-005: DELETE 失败时展示错误 toast，不跳转
- AC-006: 点击「返回」跳回列表，列表恢复原筛选状态（通过 URL query string 或 React state）

## 测试策略

- 单元：删除确认流程状态机
- 集成：mock API，验证 DELETE 成功跳转 / 失败 toast
- 手工：端到端删除流程，确认 Supabase 数据已删除
