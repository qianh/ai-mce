## Why

Chrome Extension 是小众渠道，大量用户不安装插件。需要独立的 Web Console，让任何注册用户不依赖插件就能查看自己所有渠道（浏览器端 + 桌面端）的 Capture 数据，支持按端侧和渠道筛选，实现跨渠道数据的统一展示和管理。

## What Changes

- 新增 `console/` 子项目：Bun + React 19 + React Router 7 standalone Web Console
- 实现登录页：email/password 登录，复用 `POST /v1/auth/login`，token 存 localStorage，自动 refresh
- 实现 Captures 列表页：端侧筛选（Browser/Desktop Channel）+ 渠道筛选（AI 产品），服务端过滤，limit/offset 分页，按 `created_at` 倒序
- 实现 Capture 详情页：完整 messages 展示 + 删除操作（`DELETE /v1/captures/{id}`）
- 修改 API Server：`GET /v1/captures` 加 `source_side`、`source_platform`、`limit`、`offset` query params

## Capabilities

### New Capabilities

- `console-app-shell`: Bun + React 19 app shell，路由配置（login / list / detail），JWT token 管理（localStorage + refresh + 过期跳转）
- `captures-list-page`: Captures 列表 UI，端侧 + 渠道双维筛选，分页加载，按 created_at 倒序
- `capture-detail-page`: Capture 详情 UI，完整对话 messages 展示，删除按钮

### Modified Capabilities

- `cloud-mode-api-server` → `GET /v1/captures`：增加 `source_side`（browser/desktop）、`source_platform`、`limit`、`offset` query params，Supabase 查询加对应过滤条件

## Impact

- **新代码**：`console/` 目录下完整前端项目
- **API 变更**：`GET /v1/captures` 接口新增 4 个可选 query param（向后兼容，不传时行为不变）
- **认证复用**：复用现有 `POST /v1/auth/login` 和 `POST /v1/auth/refresh`，CORS 已支持 localhost
- **依赖**：React 19、React Router 7，Bun 作为 bundler 和 dev server
- **不改动**：Extension、Scanner 代码不需修改
