# 本地全量开发部署指南

本文档适用于**开发、调试、端到端验证**场景：api-server 在本机运行，数据库仍使用线上 Supabase（共享同一套数据），Ollama 在本机提供 embedding，LLM 调用云端 API。

与线上部署的区别：

| | 本地开发 | 线上服务器 |
|---|---|---|
| api-server | `localhost:8008` | 服务器进程 |
| 数据库 | Supabase 云端（共享） | Supabase 云端（相同） |
| Embedding | 本机 Ollama | 服务器 Ollama |
| LLM | 云端 API（DeepSeek/GLM） | 云端 API（相同） |
| MCP 指向 | `http://localhost:8008` | `https://服务器地址` |

---

## 前提条件

- Python 3.11+，`uv` 已安装（`brew install uv` 或 `pip install uv`）
- 已有 Supabase 项目（`.env` 里有 `AI_MCE_SUPABASE_URL` 和 `AI_MCE_SUPABASE_SERVICE_ROLE_KEY`）
- 已有 DeepSeek 或 GLM 的 API Key

---

## 步骤一：安装本机 Ollama + bge-m3

```bash
# 安装 Ollama（macOS）
brew install ollama

# 后台启动（或 ollama serve &）
brew services start ollama

# 拉取 embedding 模型（约670MB，仅需一次）
ollama pull bge-m3

# 验证（返回1024维数组即正常）
curl http://localhost:11434/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"bge-m3","input":["测试"]}'
```

---

## 步骤二：配置 api-server 本地环境变量

在 `api-server/.env` 追加以下内容（保留已有的 Supabase 配置，追加画像管线部分）：

```bash
# --- 画像管线（本地开发）---

MCE_PROFILE_ENABLED=true

# LLM（云端，选一个）
MCE_LLM_BASE_URL=https://api.deepseek.com/v1
MCE_LLM_API_KEY=sk-xxxx
MCE_LLM_MODEL=deepseek-chat

# 或 GLM
# MCE_LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
# MCE_LLM_API_KEY=xxxx
# MCE_LLM_MODEL=glm-4-flash

# Embedding（本机 Ollama）
MCE_EMBEDDING_BASE_URL=http://localhost:11434/v1
MCE_EMBEDDING_API_KEY=
MCE_EMBEDDING_MODEL=bge-m3
MCE_EMBEDDING_DIM=1024

# Dream Cycle：本地调试可临时改为每分钟触发一次（验收后改回）
# MCE_DREAM_CRON="* * * * *"
MCE_DREAM_CRON="0 4 * * *"

# 可选调参
MCE_PROFILE_VALUE_THRESHOLD=0.3
```

---

## 步骤三：跑数据库迁移

迁移会在 Supabase 数据库上创建画像所需的9张表（与线上共用同一库，pgvector 扩展已随迁移自动启用）：

```bash
cd api-server
uv run alembic upgrade head
```

验证（在 Supabase Dashboard → Table Editor 可看到）：

```
analysis_runs  task_segments  memory_atoms
profile_claims  claim_evidence  dream_runs
profile_snapshots  user_briefs  calibrations
```

---

## 步骤四：本地启动 api-server

```bash
cd api-server

# 单 worker，避免 APScheduler 重复执行
uv run uvicorn app.main:app --host 127.0.0.1 --port 8008 --workers 1 --reload
```

`--reload` 在代码修改后自动重启，适合开发。

验证：

```bash
curl http://localhost:8008/health
# → {"ok": true}
```

---

## 步骤五：获取访问 Token

如果已有账号（线上注册过的账号可直接用）：

```bash
TOKEN=$(curl -s -X POST http://localhost:8008/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john.gemini90@gmail.com","password":"<你的密码>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo $TOKEN   # 保存这个 token，后续步骤都需要
```

如需注册新账号：

```bash
curl -X POST http://localhost:8008/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

---

## 步骤六：触发本地回填（试跑）

先跑近7天验证效果：

```bash
curl -X POST http://localhost:8008/v1/profile/backfill \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days": 7}'
# → {"enqueued": N}
```

观察 api-server 终端日志（`--reload` 模式日志直接打印），确认：
- `digest_capture` 正常完成，状态 `succeeded`
- `MemoryAtom` 内容合理
- 没有 LLM / Ollama 连接报错

满意后扩大回填范围：

```bash
curl -X POST http://localhost:8008/v1/profile/backfill \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days": 90}'
```

---

## 步骤七：手动触发 Dream Cycle（可选）

Dream Cycle 默认凌晨04:00运行。本地验收不想等到第二天，可临时把 cron 改为每分钟，重启 api-server，等待自动触发，验收后改回：

```bash
# .env 临时改为
MCE_DREAM_CRON="* * * * *"

# 重启 api-server（Ctrl+C 后重新启动）
# 等约1分钟，观察日志出现 dream cycle 字样

# 验证 brief 已生成
curl http://localhost:8008/v1/profile/brief \
  -H "Authorization: Bearer $TOKEN"
```

验收完成后务必改回 `MCE_DREAM_CRON="0 4 * * *"`。

---

## 步骤八：注册本地 MCP 到 Claude Code

```bash
# 先确保依赖安装
cd /path/to/ai-mce/mcp-server && uv sync

# 注册（指向 localhost）
claude mcp add mce-profile-dev --scope user \
  --env MCE_API_URL=http://localhost:8008 \
  --env MCE_EMAIL=john.gemini90@gmail.com \
  --env MCE_PASSWORD=<你的密码> \
  -- uv --directory /path/to/ai-mce/mcp-server run mce-profile-mcp

# 验证
claude mcp list
```

> 本地开发建议用 `mce-profile-dev` 命名，与线上 `mce-profile` 区分，避免混用。

---

## 验收检查清单

| 项目 | 验证命令/方式 | 预期结果 |
|---|---|---|
| api-server 启动 | `curl localhost:8008/health` | `{"ok":true}` |
| Ollama embedding | `curl localhost:11434/v1/embeddings ...` | 1024维向量 |
| 数据库迁移 | Supabase Dashboard 看表 | 9张新表存在 |
| 回填消化 | api-server 日志 | `status=succeeded` |
| Dream Cycle | `GET /v1/profile/brief` | 返回 markdown 简报 |
| MCP 工具 | 新开 Claude Code 会话 | AI 能描述用户画像（AC-002） |
| 校准写入 | MCP `correct_profile` reject | brief 中该断言消失（AC-006） |

---

## 常用调试命令

```bash
# 查看所有 AnalysisRun 状态（需要 psql 或 Supabase SQL Editor）
SELECT status, count(*) FROM analysis_runs GROUP BY status;

# 查看最近一次 Dream Cycle
curl http://localhost:8008/v1/profile/dreams/latest \
  -H "Authorization: Bearer $TOKEN"

# 查看当前 brief
curl http://localhost:8008/v1/profile/brief \
  -H "Authorization: Bearer $TOKEN"

# 语义检索某个话题的画像
curl "http://localhost:8008/v1/profile/claims?q=TypeScript习惯" \
  -H "Authorization: Bearer $TOKEN"

# 手动对单条 capture 触发消化（用实际 capture UUID）
# 通过回填接口即可，backfill 会跳过已成功消化的
```

---

## 注意事项

- **本地与线上共用同一 Supabase 库**：本地回填产生的数据与线上实例可见，生产环境建议单独用一个 Supabase 项目做测试
- **api-server 必须单 worker**：即使本地也不要加 `--workers N`
- **Ollama 需保持后台运行**：api-server 启动时会尝试连接 embedder，Ollama 未启动会导致回填失败
- **Token 有效期**：默认15分钟，过期重新登录获取即可
