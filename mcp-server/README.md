# mce-profile-mcp — 个人画像 MCP Server

本机 stdio MCP server，让 AI CLI（Claude Code / Codex 等）在会话中获取你的个人画像、按话题检索证据、并随口校准画像。后端为 api-server 的 `/v1/profile/*` API。

## 工具集

| 工具 | 用途 |
|---|---|
| `get_user_brief` | 获取用户简报（新会话开始时调用，让 AI 认识你） |
| `search_profile(query, dimension?, project?)` | 按话题语义检索画像断言 |
| `get_claim_evidence(claim_id)` | 断言的证据链（来源会话 + 消息区间 + 引文） |
| `correct_profile(claim_id, action, corrected_text?)` | 校准：confirm / reject（永久不复活）/ correct |
| `get_profile_suggestions` | AI 使用模式的改进建议 |
| `get_dream_report` | 最近一次"做梦"的画像变化说明 |

## 配置

环境变量：

```bash
MCE_API_URL=https://<你的 api-server 地址>     # 默认 http://localhost:8008
MCE_EMAIL=<注册邮箱>
MCE_PASSWORD=<密码>
```

令牌持久化在 `~/.mce/mcp-auth.json`（0600），access token 过期自动 refresh，refresh 失效自动重新登录。

## 注册到 AI CLI

**Claude Code：**

```bash
claude mcp add mce-profile --scope user \
  --env MCE_API_URL=https://api.example.com \
  --env MCE_EMAIL=you@example.com \
  --env MCE_PASSWORD=... \
  -- uv --directory /path/to/ai-mce/mcp-server run mce-profile-mcp
```

**Codex（`~/.codex/config.toml`）：**

```toml
[mcp_servers.mce-profile]
command = "uv"
args = ["--directory", "/path/to/ai-mce/mcp-server", "run", "mce-profile-mcp"]
env = { MCE_API_URL = "https://api.example.com", MCE_EMAIL = "you@example.com", MCE_PASSWORD = "..." }
```

建议在全局 CLAUDE.md / AGENTS.md 加一句："新会话开始时调用 `mce-profile` 的 `get_user_brief` 了解用户。"

## 服务器端部署 checklist（api-server 画像管线）

1. Supabase 启用 pgvector：迁移 0005 内已含 `CREATE EXTENSION IF NOT EXISTS vector`
2. `cd api-server && uv run alembic upgrade head`（`AI_MCE_DATABASE_URL` 指向 Supabase Postgres 连接串）
3. api-server 环境变量：
   ```bash
   MCE_PROFILE_ENABLED=true
   MCE_LLM_BASE_URL=https://api.deepseek.com/v1     # 或智谱兼容端点
   MCE_LLM_API_KEY=...
   MCE_LLM_MODEL=deepseek-chat                       # 任务 6.2 试跑后固化
   MCE_EMBEDDING_BASE_URL=http://localhost:11434/v1  # 服务器端 Ollama
   MCE_EMBEDDING_MODEL=bge-m3
   MCE_EMBEDDING_DIM=1024
   MCE_DREAM_CRON="0 4 * * *"
   ```
   约束：**api-server 单 worker 运行**（uvicorn 不开多 worker，避免调度重复执行）
4. 服务器安装 Ollama 并 `ollama pull bge-m3`（内存 <4GB 时改用智谱 embedding API，并同步改 MCE_EMBEDDING_DIM + 迁移中的维度）
5. 试跑：先对 10 条样本验证蒸馏质量与单条成本（openspec tasks 6.2），再触发回填：
   `POST /v1/profile/backfill {"days": 90}`
6. 验收 AC-001~006（见 docs/spec/profile-analysis/spec.md 验收标准）
