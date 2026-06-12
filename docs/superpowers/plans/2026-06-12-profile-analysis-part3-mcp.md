# Profile Analysis · Part 3/3 — MCP Server 实现计划

> 规格判据：openspec specs/profile-mcp（4 条 Requirement）。新目录 `mcp-server/`（独立 uv 项目，Python MCP SDK，stdio）。

**Goal:** AI CLI 通过 stdio MCP 调用 6 个工具消费画像与校准，独立认证自动续期，最小暴露面。

### Task 1: 项目骨架 + ApiClient（认证/续期）
- `mcp-server/pyproject.toml`（deps: mcp, httpx, pydantic）
- `mcp_server/api_client.py`：TokenStore（`~/.mce/mcp-auth.json`，0600）+ ApiClient
  - `login()` 用 env `MCE_EMAIL/MCE_PASSWORD` 调 POST /v1/auth/login，存 access+refresh
  - `request()` 带 Bearer；401 → POST /v1/auth/refresh → 重试一次；refresh 也失败 → 重新 login
- 测试（MockTransport）：登录存储；401 自动续期重试；refresh 失效回落 login

### Task 2: 6 个 MCP 工具 + 紧凑中文格式化
- `mcp_server/formatters.py` 纯函数：brief/claims/evidence/dream → 紧凑中文文本，
  证据引文限长 200 字符，不暴露原文批量内容
- `mcp_server/server.py`：FastMCP("mce-profile")，工具
  get_user_brief / search_profile(query, dimension?, project?) / get_claim_evidence(claim_id) /
  correct_profile(claim_id, action, corrected_text?) / get_profile_suggestions / get_dream_report
- 测试：formatters 纯函数（含引文截断）；工具函数经注入 fake ApiClient 验证转发与参数

### Task 3: 注册说明 + 部署文档
- `mcp-server/README.md`：env 配置、Claude Code (`claude mcp add`) 与 Codex 注册示例、
  api-server 部署 checklist（pgvector/迁移/env/回填/验收步骤 AC-001~006）
- openspec tasks 7.1/7.2 勾选（7.3 实测与组 8 验收留待部署后）
