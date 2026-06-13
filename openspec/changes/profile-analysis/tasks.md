## 1. 数据层与配置底座

- [x] 1.1 alembic 迁移 0005：启用 pgvector + 新建 9 张表（analysis_runs / task_segments / memory_atoms / profile_claims / claim_evidence / dream_runs / profile_snapshots / user_briefs / calibrations，索引与唯一约束按 design D9）
- [x] 1.2 config.py 新增 env：MCE_PROFILE_ENABLED、MCE_LLM_*、MCE_EMBEDDING_*（含 DIM）、MCE_DREAM_CRON、回填限速参数
- [x] 1.3 分析层直连 Postgres：async engine + repository 基类（仅分析层使用，现有 REST 路径不动）

## 2. LLM / Embedding Client 与脱敏

- [x] 2.1 OpenAI 兼容 chat client（JSON schema 约束输出、校验失败重试、超时与限速）
- [x] 2.2 embedding client（批量接口、维度校验）
- [x] 2.3 出口脱敏器：API key / JWT / 私钥块 / password= 模式 → `[REDACTED:<type>]`（含单测覆盖误杀/漏杀样本）

## 3. Digest 管线

- [x] 3.1 清洗器（纯规则）：剔除 tool 消息、超长截断、空消息过滤（spec: profile-digest/清洗规则）
- [x] 3.2 切分器：规则预切 + LLM 边界确认，产出 Task Segment（title/scenario/summary/value_score）
- [x] 3.3 Distiller：LLM 蒸馏 Memory Atom（类型/维度/置信度/证据区间），低价值段跳过，红线约束写入 prompt
- [x] 3.4 Analysis Run 幂等：唯一键 (capture_id, content_hash, pipeline_version)，重复触发跳过
- [x] 3.5 增量 diff：message_hashes 前缀比对 → append_only 只消化新增区间（含 buffer）/ modified 整条重消化 + supersede / noop
- [x] 3.6 asyncio 队列 + 后台消费 task（lifespan 启动）+ 启动对账补队
- [x] 3.7 capture 入库钩子：create_or_update_capture 成功后 fire-and-forget 入队（flag 关闭时回到 store-only；spec: cloud-mode-api-server delta）

## 4. Dream Cycle

- [x] 4.1 reconcile 引擎：pending atoms → embedding 召回候选 claim → LLM 对账 → 五种处置 + 置信度重算（时间衰减、校准锁定/不复活）
- [x] 4.2 Profile Snapshot：版本化全量状态 + changes 变化说明（不可变）
- [x] 4.3 User Brief 编译器：7 维度高置信 claim → ≤2KB 中文 markdown（维度⑦派生生成）+ source_claim_ids
- [x] 4.4 APScheduler 接入：每日 cron（env 可调）触发 dream run，记录 stats

## 5. Profile API

- [x] 5.1 GET /v1/profile/brief（读最新版）
- [x] 5.2 GET /v1/profile/claims（dimension/project 过滤 + q 语义检索；默认排除 deprecated/user_rejected）
- [x] 5.3 GET /v1/profile/claims/{id}/evidence（证据链回溯到会话标题+消息区间+引文）
- [x] 5.4 POST /v1/profile/calibrations（confirm/reject/correct 立即生效 + 不可变记录）
- [x] 5.5 GET /v1/profile/dreams/latest + POST /v1/profile/backfill?days=

## 6. 历史回填

- [x] 6.1 回填任务：近 N 天倒序入低优先级队列、限速、与实时 Digest 共存
- [ ] 6.2 试跑 10 条样本估算单条 token 成本，确认预算后再放量（design Open Question）

## 7. MCP Server（mcp-server/ 新目录）

- [x] 7.1 项目骨架：Python MCP SDK（stdio）+ api-server 认证（login + refresh token 持久化 ~/.mce/mcp-auth.json）
- [x] 7.2 工具实现：get_user_brief / search_profile / get_claim_evidence / correct_profile / get_profile_suggestions / get_dream_report（紧凑中文输出、证据引文限长、无原文批量导出）
- [ ] 7.3 注册到 Claude Code 与 Codex 配置并实测会话内调用

## 8. 验收与归档

- [ ] 8.1 执行 90 天回填 → 人工验收 AC-001（证据链完整）/ AC-003（抽查 20 条 ≥80%）
- [ ] 8.2 主验收 AC-002：新开 AI CLI 会话经 MCP 描述用户，用户判定准确有用
- [ ] 8.3 AC-004/005/006 验证：做梦演进可解释、增量正确、校准生效不复活
- [ ] 8.4 需求追溯矩阵（风险 H）：FR ↔ spec ↔ task ↔ test 对照表写入 docs/spec/profile-analysis/
- [ ] 8.5 同步 docs/spec/profile-analysis/spec.md 各章节 + ADR（pipeline 宿主与数据访问决策）
