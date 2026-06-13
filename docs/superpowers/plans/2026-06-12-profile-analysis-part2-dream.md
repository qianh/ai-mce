# Profile Analysis · Part 2/3 — Dream Cycle + Profile API + 回填 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。规格判据：openspec specs/profile-dream + specs/profile-query-api。沿用 Part 1 的代码模式（FakeLLM/FakeEmbedder duck-type、StaticPool sqlite fixture、pipefail + 逐任务提交）。

**Goal:** pending Memory Atom 每日融合为 Profile Claim（五种处置、校准优先、不复活），产出 Snapshot + User Brief，并经 /v1/profile/* API 可查可校准可回填。

**Tech Stack:** 同 Part 1 + `apscheduler>=3.10`。

**相似度策略（D6 落地细则）**：V1 用 Python 端 cosine（单用户 claim 量级 ~10²，全量加载同维度 claim 算余弦足够快且 sqlite/PG 通用）；PG 侧 pgvector 索引检索留到数据量需要时再启用（结构已就位）。

### Task 1: 置信度与相似度纯函数 `app/profile/confidence.py`
- `cosine(a, b) -> float`
- `recalculate_confidence(evidences: list[(polarity, weight, age_days)], *, user_confirmed: bool) -> float`
  —— supporting 加权和经 sigmoid 压到 (0,1)，contradicting 负贡献，时间衰减 `exp(-age_days/180)`；
  user_confirmed 锁定 ≥0.95；active supporting 为 0 → 0.0
- 测试：余弦正交/同向；空证据→0；confirmed 锁定；衰减单调；contradicting 拉低

### Task 2: Dream reconcile 引擎 `app/profile/dream.py`
- `run_dream_cycle(session, user_id, llm, embedder, *, today=None) -> DreamRun`
- 流程：当日已存在 succeeded DreamRun → 直接返回（幂等）；取 pending atoms →
  逐个与同维度非废弃 claim 算 cosine，>0.55 进候选 → LLM 批量裁决
  `{atom_id: {action: attach|new, claim_id?, polarity}}` → 写 claim_evidence →
  superseded atom 的证据标 superseded → 受影响 claim 重算置信度 →
  五种处置判定（写入 changes）→ atom 状态 pending→fused → 新候选 claim 与
  user_rejected claim 余弦 >0.9 → 丢弃（不复活）
- 测试：①新 atom 生成新 candidate claim；②支持既有 claim → strengthened + confidence 上升；
  ③superseded 证据 → weakened/deprecated；④user_rejected 语义近似不复活；
  ⑤同日二跑幂等；⑥atom 全部 fused

### Task 3: Snapshot + Brief `app/profile/brief.py`
- `create_snapshot(session, user_id, dream_run, changes) -> ProfileSnapshot`（version 自增、不可变）
- `compile_brief(session, user_id, *, min_confidence=0.6, max_chars=2000) -> UserBrief`
  —— 7 维度分组取高置信 active/user_confirmed claim，中文 markdown，
  ai_usage 维度末尾附"改进建议"小节（由 claim 文本直接组装，不再调 LLM），
  记录 source_claim_ids，截断保 2KB
- 测试：只含达标 claim；rejected/deprecated 不出现；超长截断；version 递增

### Task 4: 调度接入（apscheduler）
- `uv add apscheduler`；lifespan 中 profile_enabled 时按 `dream_cron` 注册
  `run_dream_cycle`（所有用户 = distinct user_id of pending atoms）；
  dream_runs 当日幂等检查双保险（D 风险条目）
- 测试：cron 解析（无效 cron → 启动报错）；当日幂等已由 Task 2 覆盖

### Task 5: Profile API `app/routes/profile.py`
- GET /v1/profile/brief → 404 if none
- GET /v1/profile/claims?dimension&project&q（q→embedder.embed + python cosine 排序；
  默认排除 deprecated/user_rejected）
- GET /v1/profile/claims/{id}/evidence → claim→evidence→atom→segment→capture(title)+区间+内容
- POST /v1/profile/calibrations {claim_id, action, corrected_text?} → 立即改状态/置信度 + 记录
- GET /v1/profile/dreams/latest → 最近 dream_run + changes
- POST /v1/profile/backfill {days=90} → 近 N 天无成功 run 的 capture 倒序入队，返回数量
- 路由依赖：JWT 同 captures；DB session 用 app.db.get_db 风格依赖 + 测试 override
- 测试（TestClient + 内存库 + fake worker）：每端点 1-2 用例，含 rejected 立即从
  brief/claims 消失（AC-006 路径）

### Task 6: 文档与勾选
- openspec tasks.md 勾选组 4/5/6（6.2 试跑除外）；spec.md 实现记录 Part 2；提交
