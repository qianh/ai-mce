## Context

- 采集闭环已完成：extension（浏览器）+ scanner（桌面）→ api-server（FastAPI）→ Supabase `captures` 表。库存 796 条 Capture / 123,609 条消息（codex 634、claude 124、grok 18、opencode 19、chatgpt 1），平均 155 条消息/会话，tool 角色消息占体量大头。
- api-server 现状：通过 Supabase REST API（httpx，`app/supabase_client.py`）访问数据；alembic 迁移体系已建（0001–0004）；`analysis_status` 字段已预留但**无任何 worker/管线**。
- 部署拓扑：api-server + 本管线 + embedding 服务运行在**服务器**；scanner 在本地；MCP server 在本机作为 AI CLI 与服务器 API 的桥。
- 单用户系统（保留 user_id 隔离），风险等级 H（个人敏感数据）。
- 领域词表见 CONTEXT.md：Digest / Dream Cycle / Task Segment / Memory Atom / Distiller / Profile Claim / Evidence / Profile Snapshot / User Brief / Calibration / Analysis Run。

## Goals / Non-Goals

**Goals:**
- 把已采集会话蒸馏为带证据链、可校准、持续演进的个人画像（7 维度）
- AI CLI 通过 MCP 在会话中获取 User Brief、按话题检索 claim+证据 → "让 AI 更懂自己"
- 白天 Digest（实时增量消化）+ 夜里 Dream Cycle（批量融合）的两级节奏
- 续聊重传走轻量增量（message_hashes diff），LLM 成本与画像稳定性可控

**Non-Goals:**
- console 画像页面（校准走 MCP）；采集端任何改动；原文历史版本存储；多用户商业化
- 心理/人格/能力高低类推断（红线：只描述可证据化行为模式）

## Decisions

### D1 管线宿主：api-server 内嵌 asyncio 队列 + APScheduler（弃 Celery/独立 worker）
单用户流量（日增约十几条 Capture）用不上分布式队列。Digest 用进程内 `asyncio.Queue` + 后台消费 task（FastAPI lifespan 启动），Dream Cycle 用 APScheduler cron（默认每日 04:00 服务器时区，env 可调）。回填走低优先级队列（同队列、低优先级标记、限速）。
*备选*：Celery+Redis（多一个部署件，规模不需要）；Supabase pgmq+Edge Functions（逻辑离开 Python 主栈，调试成本高）。
*代价*：api-server 重启会丢内存队列——靠 `analysis_runs` 幂等 + 启动时扫描"已入库未消化"的 capture 补队（对账式恢复，不依赖队列持久化）。

### D2 数据访问：分析层直连 Postgres（asyncpg/SQLAlchemy async），不走 Supabase REST
pgvector 相似度检索、claim 反查聚合、批量 reconcile 都是 SQL 形态，PostgREST 表达不了或要靠大量 rpc。alembic 已经直连数据库，复用同一 connection string。现有 captures 读写路径**不动**（仍走 REST client），仅新增分析层用直连。
*备选*：全部迁到直连（动现有稳定路径，无必要）；全走 REST+rpc（向量检索/事务对账写 SQL 函数更绕）。

### D3 LLM 与 embedding：OpenAI 兼容 provider 抽象
新增 `app/llm/client.py`：`MCE_LLM_BASE_URL / MCE_LLM_API_KEY / MCE_LLM_MODEL`（chat）与 `MCE_EMBEDDING_BASE_URL / MCE_EMBEDDING_API_KEY / MCE_EMBEDDING_MODEL / MCE_EMBEDDING_DIM`（embedding，服务器端部署，Ollama 的 OpenAI 兼容端点亦可）。所有结构化输出用 JSON schema 约束 + 解析失败重试。**送 LLM 前脱敏**：正则替换 API key/JWT/私钥块/password= 等模式为占位符（原文入库不脱敏，只在出口脱敏）。
*备选*：绑定单一厂商 SDK（失去切换自由）；本地小模型做蒸馏（质量不达"精准"门槛，Gate 已否）。

### D4 清洗与切分：规则优先，LLM 兜底
清洗（纯规则，零 LLM 成本）：剔除 `tool` 角色消息与超长工具输出（>2K 字符截断保留首尾）、剔除空消息/系统提示、保留 user/assistant 对话主干。切分：先用规则预切（消息时间间隔、显式话题转折标记），每个预切块交 LLM 一次性输出 Task Segment 边界+title+scenario+summary+value_score。低价值段（value_score 低于阈值）不进蒸馏，只计统计。

### D5 增量消化算法（方案 B，Q5 已确认）
`analysis_runs` 存每次消化时的 `message_hashes` 快照（captures.metadata 已有现成数据）。重传触发时：
- 新 hashes 是旧 hashes 的**前缀扩展** → `append_only`：只消化新增区间（向前带 2 个旧 segment 作上下文 buffer），旧 segment 不动，跨界 segment 扩展版替换（旧版标 superseded）
- 否则 → `modified`：整条重消化，旧 atoms/segments 全部标 superseded（其支撑的 claim 由下次 Dream Cycle 自然削弱/废弃）
- content_hash 相同 → no-op
幂等键：`(capture_id, content_hash, pipeline_version)` 唯一约束，重试不产生脏数据。

### D6 Dream Cycle 对账算法
输入：状态 `pending` 的 Memory Atom + 状态 `superseded` 的旧证据。流程：
1. 对每个 pending atom，用 embedding 相似度（pgvector cosine）在同维度 claim 中召回 top-k 候选
2. LLM 批量判定：归入既有 claim（supporting/contradicting）或生成新候选 claim
3. 置信度重算：基于 active 证据的加权和（用户 confirm 锁 0.95+，reject 永久 deprecated 不复活；时间衰减因子让陈旧证据权重下降）
4. 每个受影响 claim 记录五种处置之一（unchanged/strengthened/weakened/contradicted/deprecated）
5. 产出 Profile Snapshot（全量状态 + changes 说明"本次做梦改了什么、为什么"）+ 重编译 User Brief
claim 一天只变一次 → 画像不震荡，变化可解释（AC-004）。

### D7 User Brief 编译
按 7 维度选取高置信（active/user_confirmed，confidence ≥ 阈值）claim，编译为 ≤2KB 中文 markdown，含"基于 N 条会话 / 截至日期"页脚。版本化存 `user_briefs`，MCP 直接读最新版（不现场编译，保证读取毫秒级）。

### D8 MCP server：Python + 官方 MCP SDK（stdio），独立目录 `mcp-server/`
与 api-server 同语言复用 Pydantic schema 心智；stdio transport 被 Claude Code / Codex 原生支持。认证复用 scanner 模式：email/password 登录 + refresh token 本地持久化（`~/.mce/mcp-auth.json`）。工具集：
- `get_user_brief()` → 最新 User Brief
- `search_profile(query, dimension?, project?)` → 语义检索 claim（含置信度与证据摘要）
- `get_claim_evidence(claim_id)` → 证据链回溯（来源会话标题 + 消息区间 + 引文）
- `correct_profile(claim_id, action: confirm|reject|correct, corrected_text?)` → 校准
- `get_profile_suggestions()` → 维度⑦的使用/改进建议
- `get_dream_report(date?)` → 某次做梦的变化说明
*备选*：TypeScript SDK（与 console 同栈但画像领域逻辑在 Python 侧）；HTTP transport（各 CLI 配置成本高于 stdio）。

### D9 数据模型（alembic 迁移 0005+，全部 additive；embedding 维度由 MCE_EMBEDDING_DIM 固化进迁移，默认 1024）
```
analysis_runs     (id, user_id, capture_id FK, content_hash, pipeline_version,
                   run_type digest|redigest|backfill, diff_type new|append_only|modified|noop,
                   message_hashes jsonb, digested_range jsonb, status, error,
                   started_at, finished_at;  UNIQUE(capture_id, content_hash, pipeline_version))
task_segments     (id, user_id, capture_id FK, analysis_run_id FK, start_index, end_index,
                   title, scenario, summary, value_score, status active|superseded,
                   supersedes_id, embedding vector(D), created_at)
memory_atoms      (id, user_id, segment_id FK, capture_id FK, atom_type, dimension,
                   content, confidence, status pending|fused|superseded|rejected,
                   embedding vector(D), created_at, fused_at)
profile_claims    (id, user_id, dimension, project_key NULL, claim, confidence,
                   status candidate|active|user_confirmed|weakened|deprecated|user_rejected,
                   evidence_count, embedding vector(D), last_reconciled_at, created_at)
claim_evidence    (id, claim_id FK, atom_id FK, polarity supporting|contradicting,
                   weight, status active|superseded, created_at)
dream_runs        (id, user_id, status, stats jsonb, started_at, finished_at)
profile_snapshots (id, user_id, dream_run_id FK, version, snapshot jsonb,
                   changes jsonb, created_at)
user_briefs       (id, user_id, version, content text, source_claim_ids uuid[], created_at)
calibrations      (id, user_id, claim_id FK, action confirm|reject|correct,
                   corrected_text, note, created_at)
```
证据回溯路径：claim → claim_evidence → memory_atom → task_segment → capture + 消息区间（AC-001）。

### D10 Profile API（api-server 新路由 `app/routes/profile.py`，JWT 认证同现有）
```
GET  /v1/profile/brief                          最新 User Brief
GET  /v1/profile/claims?dimension=&project=&q=  q 走语义检索（embedding）
GET  /v1/profile/claims/{id}/evidence           证据链
POST /v1/profile/calibrations                   校准（confirm/reject/correct）
GET  /v1/profile/dreams/latest                  最近一次做梦报告（changes）
POST /v1/profile/backfill                       触发回填（days 参数，默认 90）
```
Capture 入库钩子：`create_or_update_capture()` 成功后将 capture_id 投入 Digest 队列（fire-and-forget，失败不影响上传响应——上传路径的可靠性优先级高于分析及时性）。

## Risks / Trade-offs

- [LLM 抽取质量不达标 → 画像不准] → 先回填 90 天人工验收（AC-003 抽查 ≥80%）再补全历史；校准闭环持续纠偏；prompt 与 pipeline_version 绑定，升版可选择性重跑
- [token 成本失控] → 清洗剔除 tool 消息（输入砍一个数量级）；低价值段不蒸馏；幂等防重；回填限速
- [内存队列丢任务] → analysis_runs 对账：启动时扫描 captures 中 updated_at > 最近成功 run 的记录补队
- [embedding 维度更换需重建索引] → 维度写入迁移注释；更换模型 = 新迁移 + 后台重嵌（pipeline_version 升版自然触发）
- [脱敏误杀/漏杀] → 占位符保留语义（`[REDACTED:api_key]`）；漏杀风险靠"原文不出库、只送脱敏文本"上限控制
- [MCP 工具被注入恶意指令（会话内容含 prompt injection）] → MCP 只读画像产物与受控校准写入，不暴露原文批量导出；Distiller 输出 JSON schema 校验
- [画像污染（帮他人调试被记为本人行为）] → 置信度梯度 + 校准否定 + 证据可回溯三重兜底
- [多进程部署下 APScheduler/队列消费跑多份 → Dream Cycle 重复执行] → 部署约束：api-server 单 worker 运行（当前单用户规模足够）；dream_runs 加"当日已存在运行"幂等检查双保险
- [reject claim 的"不复活"判定] → 新候选 claim 与 user_rejected claim 做 embedding 相似度比对，超过阈值（可配，默认 0.9）即丢弃

## Migration Plan

1. Supabase 启用 pgvector 扩展（迁移内 `CREATE EXTENSION IF NOT EXISTS vector`）
2. alembic 迁移 0005（9 张表，纯 additive，可独立回滚 downgrade）
3. api-server 配置新增 env（LLM/embedding/dream cron/feature flag `MCE_PROFILE_ENABLED`）
4. 部署后先手动触发 `POST /v1/profile/backfill?days=90`，人工验收 AC-001~003
5. 验收通过后开启每日 Dream Cycle 与历史补全队列
6. 本机安装 mcp-server，注册到 Claude Code/Codex 配置，验收 AC-002/006
- **回滚**：`MCE_PROFILE_ENABLED=false` 即关停队列与调度（上传路径无依赖）；表为 additive，可保留或 downgrade

## Open Questions

- ~~embedding 模型与维度~~ → **已决（Gate 2）**：服务器 Ollama + bge-m3（1024 维）；
  前置条件内存 ≥4GB，不满足则改智谱 embedding API 并在任务 1.1 前固化维度
- ~~LLM 厂商~~ → **已决（Gate 2）**：GLM / DeepSeek 双候选（OpenAI 兼容），
  任务 6.2 试跑 10 条样本对比质量/成本后固化默认；回填预算上限同期确认
- Dream Cycle 默认时刻（暂定服务器时区 04:00，env 可调）
