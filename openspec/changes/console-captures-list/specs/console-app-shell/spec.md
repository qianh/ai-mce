# console-app-shell · Spec

## 目标

`console/` 子项目骨架：Bun + React 19 dev server，路由（login / list / detail），JWT token 管理（localStorage 存取 + 自动 refresh + 过期跳转），shared API client。

## 功能需求

- FR-001: `bun run dev` 启动本地开发 server（默认 http://localhost:3000）
- FR-002: 路由：`/login` → 登录页；`/` → Captures 列表；`/capture/:id` → 详情
- FR-003: 未登录时访问 `/` 或 `/capture/:id` 自动跳转 `/login`
- FR-004: access_token / refresh_token 存 localStorage key `mce_access_token` / `mce_refresh_token`
- FR-005: API 请求前自动附加 `Authorization: Bearer {access_token}` header
- FR-006: API 返回 401 时，自动调 `POST /v1/auth/refresh` 换新 token，重试原请求一次；refresh 也失败则清除 token 跳转 `/login`
- FR-007: 登出：清除 localStorage token，跳转 `/login`

## 非功能需求

- NFR-001: 复用 Extension 的 CSS design tokens（`--ink-1`、`--surface`、`--line` 等 CSS 变量）
- NFR-002: 不引入额外状态管理库（React state + context 足够）

## 验收标准

- AC-001: `bun run dev` 无报错启动；访问 `http://localhost:3000` 跳转到 `/login`
- AC-002: 登录成功后 localStorage 有两个 token key；刷新页面保持登录状态
- AC-003: 手动删除 access_token 后刷新页面，跳转 `/login`
- AC-004: 模拟 401 响应：自动 refresh 后原请求重试成功，用户无感知

## 测试策略

- 单元：auth.ts（token 存取、refresh 逻辑）
- 集成：路由守卫（未登录重定向）
- 手工：完整登录 → 访问列表 → token 过期 refresh → 登出流程
