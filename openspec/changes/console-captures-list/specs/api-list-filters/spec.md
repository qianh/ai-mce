# api-list-filters · Spec

## 目标

为 `GET /v1/captures` 增加 `source_side`、`source_platform`、`limit`、`offset` query params，在 Supabase 查询层应用过滤和分页，向后兼容（不传时行为不变）。

## 功能需求

- FR-001: `source_side` 参数（可选，string）：
  - `browser` → Supabase query: `source_url=neq.desktop`
  - `desktop` → Supabase query: `source_url=eq.desktop`
  - 不传 → 无 source_url 过滤
- FR-002: `source_platform` 参数（可选，string）：
  - 任意值 → Supabase query: `source_platform=eq.{value}`
  - 不传 → 无 source_platform 过滤
- FR-003: `limit` 参数（可选，int）：默认 20，最大 100，超出 100 返回 422
- FR-004: `offset` 参数（可选，int）：默认 0，非负整数
- FR-005: 排序固定为 `created_at.desc`（不变）
- FR-006: 所有参数可组合使用（AND 关系）

## API 变更

**endpoint**: `GET /v1/captures`

新增 query params：

```
GET /v1/captures?source_side=desktop&source_platform=claude&limit=20&offset=0
```

**response**: 仍返回 `list[CaptureListItem]`，schema 不变

**向后兼容**: 不传任何新参数时，行为与现有完全一致

## 实现位置

- `api-server/app/routes/captures.py`: `list_captures()` 加 4 个 Query 参数
- `api-server/app/supabase_client.py`: `list_captures()` 加 filters dict 参数，按需拼接 Supabase query string

## 验收标准

- AC-001: 不传新参数，返回结果与改动前一致
- AC-002: `?source_side=desktop` 只返回 `source_url == "desktop"` 的记录
- AC-003: `?source_side=browser` 只返回 `source_url != "desktop"` 的记录
- AC-004: `?source_platform=chatgpt` 只返回 `source_platform == "chatgpt"` 的记录
- AC-005: `?limit=5&offset=10` 返回第 11-15 条（倒序）
- AC-006: `?limit=101` 返回 422 Unprocessable Entity
- AC-007: 两个筛选参数同时传，返回 AND 交集

## 测试策略

- 单元：Supabase query 参数构建逻辑（mock Supabase client）
- 集成：`tests/test_captures.py` 加各参数组合的 API 测试（用 TestClient）
- 手工：对真实 Supabase 验证过滤结果
