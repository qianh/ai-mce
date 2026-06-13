# 线上服务器部署指南 — api-server 画像管线

本文档说明如何在生产服务器上部署 api-server 的个人画像分析管线，包括数据库迁移、Ollama embedding、环境变量配置与历史回填。

---

## 前提条件

- api-server 已可正常启动（`/health` 返回 `{"ok": true}`）
- Supabase Postgres 数据库可访问
- `AI_MCE_DATABASE_URL` 已配置
- 服务器可访问所选 LLM 的 API（DeepSeek 或 GLM）

---

## 步骤一：合并代码

在**本机**操作：

```bash
cd /path/to/ai-mce
git merge worktree-profile-analysis --no-ff \
  -m "feat(profile): personal AI profile analysis pipeline"
git push origin master
```

服务器拉取最新代码：

```bash
# 服务器上
cd /path/to/ai-mce
git pull origin master
```

---

## 步骤二：数据库迁移（Supabase + pgvector）

pgvector 扩展在迁移脚本 `0005` 中已包含 `CREATE EXTENSION IF NOT EXISTS vector`，通常会自动启用。若 Supabase 项目较旧未默认开启，在 Dashboard → SQL Editor 手动执行一次：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

然后在服务器上跑迁移：

```bash
cd api-server
AI_MCE_DATABASE_URL="postgresql://postgres:[密码]@[supabase-host]:5432/postgres" \
  uv run alembic upgrade head
```

迁移成功后应存在以下9张表：

```
analysis_runs    task_segments    memory_atoms
profile_claims   claim_evidence   dream_runs
profile_snapshots  user_briefs    calibrations
```

---

## 步骤三：安装 Ollama + bge-m3

```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 后台启动
ollama serve &

# 拉取 embedding 模型（约670MB）
ollama pull bge-m3

# 验证（返回 1024 维向量即正常）
curl http://localhost:11434/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"bge-m3","input":["测试"]}'
```

> **服务器内存 <4GB 时**：改用智谱云 embedding API（`embedding-3`），
> 注意 `MCE_EMBEDDING_DIM` 需与该模型实际输出维度一致，
> 且需在迁移文件中同步修改 embedding 列维度后重新跑迁移。

---

## 步骤四：配置环境变量

在 `api-server/.env` 追加以下内容：

```bash
# 开启画像管线
MCE_PROFILE_ENABLED=true

# LLM（二选一）
# 选项A：DeepSeek（推荐）
MCE_LLM_BASE_URL=https://api.deepseek.com/v1
MCE_LLM_API_KEY=sk-xxxx
MCE_LLM_MODEL=deepseek-chat

# 选项B：智谱 GLM
# MCE_LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
# MCE_LLM_API_KEY=xxxx
# MCE_LLM_MODEL=glm-4-flash

# Embedding（服务器端 Ollama）
MCE_EMBEDDING_BASE_URL=http://localhost:11434/v1
MCE_EMBEDDING_API_KEY=
MCE_EMBEDDING_MODEL=bge-m3
MCE_EMBEDDING_DIM=1024

# Dream Cycle 运行时间（cron，服务器时区）
MCE_DREAM_CRON="0 4 * * *"

# 可选调参
MCE_PROFILE_VALUE_THRESHOLD=0.3   # 低于此分值的任务段跳过蒸馏
MCE_PROFILE_PIPELINE_VERSION=v1
```

---

## 步骤五：启动 api-server

**必须单 worker**——APScheduler 调度器在多 worker 下会重复执行 Dream Cycle：

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8008 --workers 1
```

使用 systemd 时，在 `[Service]` 段确保 `ExecStart` 中无 `--workers` 参数或显式设为 1。

验证启动正常：

```bash
curl http://localhost:8008/health
# → {"ok": true}

# 画像路由可访问（404是正常的，说明路由已注册）
curl -H "Authorization: Bearer <access_token>" \
  http://localhost:8008/v1/profile/brief
```

---

## 步骤六：触发历史回填

### 先试跑10条（任务6.2）

回填前先用少量数据验证蒸馏质量和 token 成本：

```bash
curl -X POST \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"days": 7}' \
  http://localhost:8008/v1/profile/backfill
```

观察 api-server 日志，确认：
- `AnalysisRun` 状态为 `succeeded`
- `MemoryAtom` 内容合理（非乱码，画像描述准确）
- 单条 capture 的 LLM token 消耗在预期范围内

### 全量回填近90天

```bash
curl -X POST \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"days": 90}' \
  http://localhost:8008/v1/profile/backfill
# → {"enqueued": N}
```

回填在后台异步执行。首次 Dream Cycle 运行（凌晨04:00）后，`GET /v1/profile/brief` 将返回完整简报。

---

## 部署顺序速查

```
1. 合并代码 → git push → 服务器 git pull
2. Supabase：确认 pgvector 已启用
3. 服务器：uv run alembic upgrade head
4. 服务器：安装 Ollama + ollama pull bge-m3
5. 服务器：api-server/.env 追加画像配置
6. 服务器：重启 api-server（--workers 1）
7. 先回填7天试跑，确认质量和成本
8. 回填90天，等待后台消化
9. 次日凌晨04:00 Dream Cycle 运行后，brief 可用
```

---

## 关键约束

- **api-server 必须单 worker**：多 worker 导致调度器重复执行
- **embedding 列维度固化在迁移中**：更换 embedding 模型前需评估是否要重建表
- **LLM 调用含出口脱敏**：`redact.py` 在送 LLM 前自动过滤 API key / JWT / 私钥等敏感模式
- **L4/L5 记忆候选不自动提升**：进入审核队列，需用户通过 MCP `correct_profile` 或 console 确认
- **user_rejected 断言不复活**：Dream Cycle 会检测余弦相似度 >0.9 的候选并丢弃

---

## 验收标准（AC-001 ~ AC-006）

详见 `docs/spec/profile-analysis/spec.md` 验收标准章节。核心验收项：

- **AC-002**：新开 Claude Code 会话，AI 能准确描述用户当前项目和工作习惯
- **AC-004**：Dream Cycle 运行后，brief 内容随新采集数据持续更新
- **AC-006**：`correct_profile` reject 后，该断言从 brief 消失且不再复活
