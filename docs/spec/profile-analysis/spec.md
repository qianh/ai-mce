---
# 引擎决策记录（Gate 1 已校准定稿）
feature: profile-analysis
executor: claude-code
scores:  { 规模: H, 风险: H, 项目: 老, 领域清晰度: 模糊 }
nodes:   [N0, NS, N1, N2, N3, N4, N5, N6, N7, N8]
flavors:
  N1: grill-with-docs
  N2: grill-with-docs
  N3: openspec + 对抗审查（风险H；CC 无 sdd，OpenSpec 承接规模H，裂变 design.md/tasks.md）
  N4: superpowers:writing-plans（用户指定，弃 task-master）
  N5: superpowers:test-driven-development + using-git-worktrees + tdd-guard（风险H）
  N6: superpowers:verification-before-completion
  N7: superpowers:requesting-code-review + 对抗审查（风险H）
  N8: 强制（风险H），当前 agent 写 ADR
execution_modes: 全部 current-agent（用户在 Gate 1 拍板）
deps_check: { openspec: ok, task-master: ok-未选用, tdd-guard: ok, grill-with-docs: ok, superpowers: ok }
risk_h_extras: [TDD Guard, N3/N7 对抗审查, 需求追溯矩阵, 合并前 Human Approval, N8 强制]
status: implementing    # drafting → spec-locked → implementing → reviewing → done
created: 2026-06-12
---

# profile-analysis · Spec

## 涉及服务 / 跨仓范围        <!-- NS ✅ Explore 子代理已执行 -->

- 当前项目：ai-mce monorepo（采集闭环已完成：extension 浏览器端 + scanner 桌面端 → api-server → Supabase）
- 关联服务 / 仓（角色 + 本功能改动面）：
  - `api-server/`（Python/FastAPI）：🔴 核心改动面。新增分析管线（清洗→切分→抽取→画像→融合）、
    alembic 迁移（分析层 + 画像层新表）、画像/记忆查询 API。现状：`analysis_status` 字段已预留但
    无任何 worker，加工层全部新建。Supabase 访问方式为 REST API（httpx，`app/supabase_client.py`）。
  - Supabase Postgres：🔴 新增分析层与画像层表结构。现状：仅 users / refresh_tokens / captures
    三表；无 pgvector、无 revision 表、无 RLS（service role 后端独占访问）。
  - `console/`（Bun + React 19）：⚪ 是否需要画像查看/校准界面 → N1 拷问确认，不预设。
  - `extension/`、`scanner/`：🟢 不改动。数据已在库中，管线只消费。
- 关联 API / 配置 / DB：
  - `POST /v1/captures` 三级匹配已实现：session_id 全量替换 → content_hash 幂等 →
    source_fingerprint 增量（`app/supabase_client.py:167-228`）—— revision 层可叠加其上。
  - captures 表已有字段：content_hash / source_fingerprint / session_id / message_count /
    messages(JSON) / extraction_quality / analysis_status。
  - 环境配置：`api-server/.env`（Supabase URL + service role key）；尚无 LLM / embedding 服务配置。
- 完整功能边界（已经用户确认）：本功能 = 后端数据加工层。输入为库中已采集的 captures，
  输出为可持续融合的用户画像/记忆。采集端零改动。

## 问题与非目标            <!-- N1 进行中 -->
- 要解决什么痛点 / 用户是谁：
  - 用户 = John 本人（单用户系统）。
  - 痛点：已采集的大量 AI 会话数据躺在库里没有被加工利用；每次新开 AI CLI 会话，AI 都不认识自己。
  - 【Q1 已确认】画像主要消费场景：**回灌本机 AI CLI**——让 Claude Code / Codex 等工具
    在使用时获取个人画像（基础情况、项目开发流程、语言习惯、解决问题的方式等），让 AI 更懂自己；
    次要消费：从画像中给自己生成使用建议/改进建议。
  - 【Q2 已确认】送达方式：**MCP server / skill**——AI CLI 在会话中按需调用工具获取
    User Brief、按话题检索画像 claim 与证据；不采用静态文件注入。
    （推论：画像层必须支持检索查询，不只是产出一份固定简报。）
  - 【Q3 已确认】LLM 引擎：**C 混合**——抽取/融合用云端大模型 API（provider 可配置，
    OpenAI 兼容格式：base_url + api_key + model），embedding 部署在服务器端。
    发往云端 LLM 前做敏感信息脱敏。
  - 【Q3 部署拓扑确认】api-server + 本功能管线 + embedding 服务均运行在**服务器**上；
    scanner 运行在本地；MCP server 在本机作为 AI CLI 与服务器 API 之间的桥。
  - 【Q4 已确认】做梦触发：**C 两级节奏**——
    消化（实时）：新 capture 入库后异步清洗→切分→抽取，记忆原子进"待融合区"（短期记忆）；
    做梦（每日定时）：批量 reconcile（加强/削弱/矛盾/废弃）→ 生成画像快照 + 新 User Brief。
    定时实现默认 APScheduler 内嵌于 api-server（N3 可挑战）。
  - 【Q5 已确认】续聊重传增量策略：**B 轻量增量**——
    原文不留历史版本（维持采集侧"最新快照覆盖"语义）；分析层每次消化记录当时的
    message_hashes 快照；重传时 diff：纯追加→只消化新增区间（带前文 buffer），
    中间修改→整条重消化 + 旧记忆原子标 superseded（做梦时自然对账）；
    analysis_runs 表 + 幂等键（capture_id + content_hash + pipeline 版本）防重复消化。
  - 【Q6 已确认】画像维度（7 个全要）：①基础情况 ②项目脉络（按项目分组）
    ③工作方式/开发流程 ④语言与表达习惯 ⑤解决问题方式 ⑥技能信号
    ⑦AI 使用模式+改进建议（派生产物，做梦时基于①-⑥生成）。
  - 【Q6 红线】只描述可证据化的行为模式，不做心理/人格/能力高低判断。
  - 【Q7 已确认】回填策略：**B 近期优先**——先回填最近 90 天建画像底座，验证质量后
    低优先级队列补全更早历史（管线幂等，补跑无额外设计）。
    实测库存：796 条 capture / 123,609 条消息（codex 634、claude 124、grok 18、
    opencode 19、chatgpt 1）。清洗阶段剔除/压缩 tool 角色消息与超长工具输出后再送 LLM
    （成本砍一个数量级的关键）。
- 【Q8 已确认】校准闭环：**MCP 工具校准**——AI CLI 会话中通过 correct_profile 类工具
    确认/否定/修正 claim；用户确认的 claim 锁高置信度，否定的立即废弃且做梦不复活；
    校准记录独立成表（后续加 console 页面只是多一个入口，不返工）。
- 非目标（明确不做）：
  - console 画像页面（V1 不做，校准走 MCP；现有 console 不动）
  - 采集端（extension / scanner）任何改动
  - 心理/人格/能力高低类推断（红线）
  - 原文历史版本存储（维持最新快照语义）
  - 多用户商业化（保留 user_id 隔离，但只服务单用户）
- 失败路径（识别出的主要风险及对策方向）：
  - LLM 抽取质量差 → 画像不准：靠 Q7 的"先回填 90 天验证质量再补全"+ Q8 校准闭环兜底
  - token 成本失控：清洗剔除 tool 消息（数量级削减）+ 近期优先回填 + analysis_runs 幂等防重
  - 做梦融合导致画像震荡：每日批量 reconcile（而非逐条），claim 一天只变一次，变化可解释
  - 敏感信息泄漏给云端 LLM：送出前正则脱敏（API key / 密码模式）
  - 重复消化烧钱：幂等键 capture_id + content_hash + pipeline 版本
  - 画像污染（帮别人调试被当成自己的行为）：置信度 + 校准否定 + 证据可回溯

## 领域词表                <!-- N2 ✅ 用户已确认，正式定义见 CONTEXT.md -->
新增 11 个术语（中文 canonical / 英文用于代码与表命名）：
Digest 消化 · Dream Cycle 做梦 · Task Segment 任务段 · Memory Atom 记忆原子 ·
Distiller 蒸馏（**不得叫 Extractor**，该词已被浏览器端保留）· Profile Claim 画像断言 ·
Evidence 证据 · Profile Snapshot 画像快照 · User Brief 用户简报 · Calibration 校准 ·
Analysis Run 消化记录。
做梦对 claim 的五种处置：unchanged / strengthened / weakened / contradicted / deprecated。

## 需求                    <!-- N3 ✅ 已裂变至 OpenSpec change -->
规格正文：`openspec/changes/profile-analysis/`
- `proposal.md` — Why / What Changes / Capabilities / Impact
- `specs/profile-digest/spec.md` — Digest 管线 6 条 Requirement（入队解耦、清洗脱敏、切分、蒸馏、增量 diff、幂等+对账+回填）
- `specs/profile-dream/spec.md` — Dream Cycle 5 条 Requirement（每日批量、五种处置、校准优先、快照可解释、Brief 编译）
- `specs/profile-query-api/spec.md` — Profile API 6 条 Requirement
- `specs/profile-mcp/spec.md` — MCP server 4 条 Requirement
- `specs/cloud-mode-api-server/spec.md` — **delta：MODIFIED「第一版不执行服务端 AI 分析」**（解除限制，
  仅允许 profile 管线，feature flag 可关停回 store-only）

## 数据模型 / API / UI / 兼容 / 权限   <!-- N3 ✅ 已裂变至 design.md -->
设计正文：`openspec/changes/profile-analysis/design.md`（D1–D10）
- 数据模型：9 张新表（D9，alembic 0005，纯 additive，pgvector）
- API：6 个 /v1/profile/* 端点（D10）+ capture 入库钩子
- 关键决策：D1 内嵌 asyncio 队列+APScheduler（弃 Celery）；D2 分析层直连 Postgres（现有 REST 路径不动）；
  D3 OpenAI 兼容 provider + 出口脱敏；D5 增量算法；D6 对账算法；D8 Python MCP（stdio）
- 兼容：上传协议不变、采集端零改动、feature flag 回滚
- 对抗审查补丁：多进程部署 scheduler 重复执行风险（约束单 worker + dream_runs 当日幂等）；
  reject claim 不复活的 embedding 相似度判定（阈值默认 0.9）

## 验收标准                <!-- N3 细化；N1 已定草案（Q9 用户确认） -->
- AC-001 管线跑通：近 90 天回填完成后，7 个维度均有 claim 产出，每条 claim 可回溯到
  具体会话的具体消息区间（证据链完整，无凭空结论）
- AC-002 MCP 实测（**主验收**）：新开 AI CLI 会话，AI 通过 MCP 拉取画像后描述
  "你是谁、在做什么、有什么习惯"，用户主观判定准确且有用
- AC-003 抽查准确率：随机抽 20 条 claim 人工打分，准确（含部分准确）≥ 80%
- AC-004 做梦演进可验证：今天的新会话内容反映在明天的画像快照中，且系统能解释
  本次做梦新增/加强/削弱了哪些 claim
- AC-005 增量正确性：续聊已分析会话 → analysis_runs 显示只消化新增区间，无全量重跑
- AC-006 校准生效：MCP 否定一条 claim → 从 brief 与检索结果中消失，下次做梦不复活

## 测试策略                <!-- N3 ✅ -->
- 单元：清洗规则、脱敏（误杀/漏杀样本集）、增量 diff（前缀/修改/noop 三分支）、置信度重算、
  Brief 编译筛选逻辑 —— 纯函数优先，LLM 调用全部 mock
- 集成：Digest 端到端（mock LLM 固定输出 → 表状态断言）、Dream reconcile（构造 pending atoms +
  既有 claims → 五种处置断言）、幂等（同键二次触发原子数不变）、API 路由（含校准立即生效）
- E2E/手工：AC-001~006（见验收标准），其中 AC-002 主验收为真实 AI CLI 会话实测
- TDD：superpowers:test-driven-development + tdd-guard（风险 H，N5 强制）

## 任务拆解                <!-- N4 ✅ -->
基线：`openspec/changes/profile-analysis/tasks.md`（8 组 30 项）
细化计划（writing-plans，按可独立交付拆 3 份）：
- Part 1（已完成）：`docs/superpowers/plans/2026-06-12-profile-analysis-part1-digest.md`
  —— 数据层 + LLM client + Digest 管线，14 个 TDD 任务
- Part 2（Plan 1 执行后编写）：Dream Cycle + Profile API + 回填
- Part 3（Plan 2 执行后编写）：MCP server + 端到端验收（AC-001~006）
策略：执行一份再写下一份，避免计划与实现漂移。

## 实现与测试记录          <!-- N5 进行中 -->
**Part 1（Digest 管线）✅ 2026-06-12**：worktree 分支 `worktree-profile-analysis`，14 个 TDD
任务全部红-绿走完，14 个提交（e1532be..cbb46f5），测试 63 passed（基线 27 + 新增 36）。
- 新增模块：app/profile/{models,redact,llm,cleaning,segmenter,distiller,diff,digest,queue}.py、
  alembic 0005（升降级已验证）、main.py lifespan、captures 路由入库钩子
- 实现期偏差（已修正并记录）：①复用既有 app/db.py 的 create_sessionmaker（计划盲点）；
  ②append_only 上下文 buffer 改按消息数取（按旧 segment 起点在单段会话下退化为全量重消化）；
  ③test_cloud_tables_are_declared 改子集断言以容纳分析层新表
**Part 2（Dream Cycle + Profile API + 回填）✅ 2026-06-12**：5 个 TDD 任务，
测试 88 passed（累计新增 61）。新增 confidence/dream/brief/scheduler 模块 +
routes/profile.py（6 端点）+ apscheduler 接入 lifespan。
- 实现期偏差：claim 处置分类按事件语义（获得/失去/反证证据）而非置信度差值——
  存量置信度与重算公式不同源，差值比较不稳定
**Part 3（MCP server）✅ 2026-06-13**：mcp-server/ 独立 uv 项目，9 个测试通过。
ApiClient（独立认证 + 401 自动 refresh + 回落重登录）、6 个 MCP 工具、紧凑中文格式化
（证据引文限长 200）、README 含 Claude Code/Codex 注册与服务器部署 checklist。
- 待部署后执行：7.3 真实 CLI 实测、组 8 验收（AC-001~006）、6.2 LLM 试跑定型

## 验证记录（DoD）         <!-- N6 ✅ 2026-06-13 -->
- [x] 所有测试通过（api-server 88 passed / mcp-server 9 passed）
- [x] lint/typecheck：项目未配置，N/A  [x] build：Python 无构建步骤，entry point 已验证
- [x] 新增逻辑有测试（TDD 红-绿逐任务）  [x] 修改行为有回归（test_cloud_tables 子集断言）
- [x] 无无关 diff（25 个提交全部属于本功能）  [x] 无绕过测试

## 需求追溯矩阵            <!-- 风险 H 强制；→ 裂变 traceability.md -->
| Requirement | Spec | Task | Test | Status |
|---|---|---|---|---|

## 审查记录                <!-- N7，对抗审查 -->
（待定）

## 决策与归档（ADR）       <!-- N8，强制 -->
- Gate 1 决策：风险定 H（用户拍板，加挂 TDD Guard/对抗审查/追溯矩阵/合并前人批）；
  N4 弃 task-master 改 writing-plans（用户拍板）；全节点 current-agent（用户拍板）。
- Gate 2 决策（2026-06-12 规格定稿）：
  - OpenSpec change `profile-analysis` 4 工件定稿，21 Requirement / 28 Scenario 为实现判据
  - embedding：服务器部署 Ollama + bge-m3（1024 维）；前置条件服务器内存 ≥4GB，
    不满足则改智谱 embedding API 并在任务 1.1 前固化维度（DeepSeek 无 embedding 服务）
  - LLM：GLM / DeepSeek 双候选（均 OpenAI 兼容），任务 6.2 试跑 10 条样本对比后固化默认
- N4 决策（Plan 1 自检偏差记录）：增量 diff 的 message_hashes 由分析层用
  sha256(role+normalized_content) 自算，不读 captures.metadata 既有 message_hashes——
  自算口径对全平台一致且不受采集端实现变化影响。
