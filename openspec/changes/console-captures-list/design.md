## Context

AI Memory Capture 已有 Extension（浏览器端）和 Scanner（桌面端）两个上报通道，数据统一存于 API Server（`GET /v1/captures`）。当前无独立 Web Console，用户只能在 Chrome Extension 的 options 页查看 Capture 列表——插件覆盖面窄，大量用户无法直接访问数据。

需要新建独立的 Web Console（`console/` 目录），用统一账号（与 Scanner 同 email/password）登录后，展示跨渠道 Capture 列表，支持按端侧（Browser/Desktop Channel）和渠道（AI 产品）筛选，并提供详情查看和删除能力。

## Goals / Non-Goals

**Goals:**

- 独立 Web Console，不依赖 Chrome Extension 可访问
- 登录页（email/password），复用现有 auth API，自动 token refresh
- Captures 列表：双维过滤（端侧 + 渠道）、服务端分页（limit/offset）、按 created_at 倒序
- Capture 详情页：完整 messages 展示
- 详情页删除功能，删除后返回列表
- API Server GET /v1/captures 支持 source_side / source_platform / limit / offset 过滤

**Non-Goals:**

- 从 Web Console 创建或上传 Capture（上报逻辑保留在 Extension 和 Scanner）
- Manual Backfill（本地数据上传）
- 编辑 Capture 内容
- 注册账号功能（复用已有账号）
- 生产域名部署、CORS 生产配置（留后期）
- 移动端适配

## Decisions

### D1: 独立 Web Console，不改 Extension options 页

**选择**：新建 `console/` 子项目，不在 Extension options 页加功能。

**替代方案**：在 Extension options 页的 CaptureList.tsx 加端侧筛选。

**理由**：Extension 面向小众用户；大量用户（不安装插件）需要独立入口。两者定位不同，保持各自独立更清晰。

### D2: Bun + React 19（与 Extension 对齐）

**选择**：`Bun.serve()` + HTML import + React 19 + React Router 7，无 Vite。

**替代方案**：Next.js、Vite + React。

**理由**：Extension 已用 Bun + React 19，design tokens 可直接复用，不引入新工具链，视觉风格一致。

### D3: 服务端过滤，不做客户端全量拉取

**选择**：`GET /v1/captures?source_side=desktop&source_platform=chatgpt&limit=20&offset=0`，Supabase 查询加 WHERE 条件。

**替代方案**：一次拉全量数据，前端 JS 过滤。

**理由**：用户已有 4000+ Captures，全量拉取严重影响性能。API 加 query param 代价小，扩展性好。

### D4: source_side 通过 source_url 推断，不加新字段

**选择**：`source_url == "desktop"` → Desktop Channel；否则 → Browser Channel。服务端用 `source_url=eq.desktop` 或 `source_url=neq.desktop` 过滤。

**替代方案**：在 captures 表加 `source_channel` 显式字段。

**理由**：现有约定（CONTEXT.md："By source_url. Browser Captures have a real URL. Desktop Captures have the fixed value 'desktop'"）已明确，加字段带来迁移成本。

### D5: JWT token 存 localStorage，不用 httpOnly cookie

**选择**：access_token / refresh_token 存 localStorage，JS 直接读取。

**替代方案**：httpOnly cookie（XSS 更安全）。

**理由**：当前是 localhost 开发阶段，Extension 也用同样的 JS-accessible 存储模式。生产安全加固留后期。

### D6: limit/offset 分页，固定 pageSize=20

**选择**：`limit=20&offset=N`，前端做"加载更多"或页码导航。

**替代方案**：cursor-based 分页（更适合实时数据），无分页（全量）。

**理由**：Capture 数据追加为主，offset 分页简单可靠。cursor-based 复杂度不必要。

## Architecture

```
console/
├── src/
│   ├── main.tsx              # Bun entry, React root mount
│   ├── App.tsx               # Router: /login, /, /capture/:id
│   ├── pages/
│   │   ├── Login.tsx         # Email/password login form
│   │   ├── CaptureList.tsx   # List + filters + pagination
│   │   └── CaptureDetail.tsx # Detail view + delete button
│   ├── lib/
│   │   ├── api.ts            # API client (fetch wrapper + auth header)
│   │   ├── auth.ts           # Token storage, refresh, logout
│   │   └── types.ts          # CaptureListItem, CaptureDetail types
│   └── index.html            # Bun HTML entry
├── package.json
└── CLAUDE.md
```

### 数据流

```
User → Login.tsx → POST /v1/auth/login → store tokens
     → CaptureList.tsx → GET /v1/captures?source_side=&source_platform=&limit=20&offset=N
     → CaptureDetail.tsx → GET /v1/captures/{id}
                         → DELETE /v1/captures/{id} → redirect to /
```

### API Server 变更

**`GET /v1/captures`** 新增 query params：

| 参数 | 类型 | 说明 |
|---|---|---|
| `source_side` | `browser` \| `desktop` \| 不传 | 按端侧过滤 |
| `source_platform` | string \| 不传 | 按 AI 产品过滤（chatgpt/codex/…）|
| `limit` | int，默认 20，最大 100 | 分页大小 |
| `offset` | int，默认 0 | 分页偏移 |

**supabase_client.py** 变更：`list_captures` 加对应 Supabase query params（`source_url=eq.desktop` / `neq.desktop`，`source_platform=eq.{val}`，`limit`，`offset`）。

## Risks / Trade-offs

- **[source_url 推断脆弱]** 若未来桌面端改 source_url 值，端侧推断失效 → 作 ADR 记录约定，不得随意修改 "desktop" 字面量
- **[token 安全]** localStorage XSS 风险 → 接受，生产阶段升级到 httpOnly cookie
- **[分页 offset 漂移]** 新增数据时 offset 分页可能出现重复/漏条目 → Capture 为追加写，问题出现概率低，接受
