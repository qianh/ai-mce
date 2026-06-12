## Why

采集闭环已完成：796 条 Capture / 123,609 条消息躺在 Supabase 中未被加工，而用户每次新开 AI CLI 会话，AI 都不认识自己。本变更建立画像分析层——把已采集的会话蒸馏成持续演进的个人画像，让本机 AI CLI 通过 MCP 在会话中"精准了解用户"（对标 ChatGPT 网页版记忆能力）。

## What Changes

- **api-server 新增 Digest 管线**（实时）：Capture 入库后异步清洗（剔除 tool 消息/脱敏）→ Task Segment 切分 → Distiller 蒸馏 Memory Atom（带证据与置信度），进入待融合区。增量消化：Analysis Run 记录 message_hashes 水位，续聊只消化新增区间。
- **api-server 新增 Dream Cycle**（每日批量，APScheduler 内嵌）：把待融合 Memory Atom 与既有 Profile Claim 对账（unchanged/strengthened/weakened/contradicted/deprecated），生成 Profile Snapshot 与 User Brief。
- **新增数据表**（alembic 迁移）：task_segments、memory_atoms、profile_claims、claim_evidence、profile_snapshots、user_briefs、analysis_runs、calibrations + pgvector embedding 支持。
- **api-server 新增 Profile API**：User Brief 获取、claim 按话题检索（语义+维度过滤）、证据回溯、校准写入、做梦变化解释。
- **新增本机 MCP server**：暴露 get_user_brief / search_profile / get_evidence / correct_profile 等工具给 AI CLI（Claude Code、Codex 等），作为本机与服务器 API 之间的桥。
- **LLM provider 可配置**：OpenAI 兼容接口（base_url + api_key + model 环境变量），embedding 服务器端部署；送云端 LLM 前正则脱敏。
- **历史回填**：近 90 天优先，验证质量后低优先级队列补全。
- 红线：Profile Claim 只描述可证据化的行为模式，不做心理/人格/能力高低判断。

**不改动**：extension、scanner、console（校准走 MCP，console 画像页为非目标）；captures 表"最新快照覆盖"语义不变。

## Capabilities

### New Capabilities
- `profile-digest`: Digest 管线——清洗、Task Segment 切分、Memory Atom 蒸馏、增量消化与 Analysis Run 幂等
- `profile-dream`: Dream Cycle——每日 claim reconcile、Profile Snapshot、User Brief 编译、变化可解释性
- `profile-query-api`: Profile API——brief 获取、claim 语义检索、证据回溯、校准写入
- `profile-mcp`: 本机 MCP server——AI CLI 消费画像与校准的工具集

### Modified Capabilities
- `cloud-mode-api-server`: Capture 创建/更新成功后需触发 Digest 入队（新增分析钩子这一行为要求；上传协议本身不变）

## Impact

- **api-server/**：新增 services（cleaning/segmentation/distiller/dream/brief）、routes（/v1/profile/*）、alembic 迁移 0005+、APScheduler、LLM/embedding client、worker 队列；Supabase 需启用 pgvector 扩展
- **新目录 mcp-server/**（本机部署）：依赖 api-server 的 Profile API 与现有认证
- **依赖**：新增 LLM provider（OpenAI 兼容）、embedding 服务、APScheduler；机密管理（LLM api_key 入 .env）
- **成本**：回填与日常消化产生 LLM token 费用；通过 tool 消息剔除、近期优先回填、幂等防重控制
- **风险等级 H**：需求追溯矩阵与对抗审查随规格交付（docs/spec/profile-analysis/spec.md）
