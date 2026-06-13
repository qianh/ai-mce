# profile-digest — Digest 管线（清洗 / 切分 / 蒸馏 / 增量消化）

## ADDED Requirements

### Requirement: Capture 入库后异步触发 Digest
The system SHALL enqueue a Digest job after a Capture is created or its content is updated, without blocking or failing the upload response. Digest execution SHALL be asynchronous and decoupled from the upload path.

#### Scenario: 上传成功即入队
- **WHEN** `create_or_update_capture` 成功写入一条新内容（新建或 content_hash 变化）
- **THEN** 一条 Digest 任务进入处理队列，上传方收到的响应与现状完全一致

#### Scenario: Digest 失败不影响上传
- **WHEN** Digest 入队或执行失败
- **THEN** Capture 的存储与查询不受影响，失败记录在 Analysis Run 中可见，后续可补跑

### Requirement: 清洗规则剔除低信号内容
The cleaning stage SHALL use deterministic rules (no LLM calls) to drop `tool` role messages, truncate over-long tool outputs, drop empty/system messages, and retain the user/assistant dialogue backbone. Cleaning SHALL redact sensitive patterns (API keys, JWTs, private key blocks, password assignments) with typed placeholders before any text is sent to a cloud LLM; the stored original SHALL remain unredacted.

#### Scenario: tool 消息被剔除
- **WHEN** 一条 Capture 含 user/assistant/tool 三种角色消息
- **THEN** 送往 LLM 的清洗文本只含 user/assistant 主干，tool 消息不出现

#### Scenario: 敏感串只在出口脱敏
- **WHEN** 消息中含形如 API key/JWT/私钥块的字符串
- **THEN** 送往云端 LLM 的文本中该串被替换为 `[REDACTED:<type>]` 占位符，而数据库中的 Capture 原文保持不变

### Requirement: 会话切分为 Task Segment
The system SHALL split each cleaned Capture into one or more Task Segments, each covering a contiguous message range with a single task goal, carrying title, scenario classification, summary, and value_score. Segments below the value threshold SHALL be excluded from distillation.

#### Scenario: 多任务会话被切开
- **WHEN** 一条会话先讨论架构设计、后转入一个无关 bug 排查
- **THEN** 产生至少两个 Task Segment，各自的消息区间不重叠且边界落在话题转折处

#### Scenario: 低价值段不蒸馏
- **WHEN** 某 Task Segment 的 value_score 低于配置阈值
- **THEN** 该段不进入 Distiller，仅保留段记录用于统计

### Requirement: Distiller 蒸馏带证据的 Memory Atom
The Distiller SHALL extract Memory Atoms from each qualifying Task Segment via the configured LLM, with structured JSON output validation. Each atom MUST carry: type (fact/preference/skill signal/project context/behavior pattern), one of the seven profile dimensions, content, confidence score, and evidence pointing to its source capture and message range. Atoms enter `pending` status awaiting the next Dream Cycle. Atom content SHALL describe observable behavior only — never psychological, personality, or ability-level judgments.

#### Scenario: 原子可回溯
- **WHEN** 任一 Memory Atom 被创建
- **THEN** 通过其记录可定位到来源 capture_id 与消息区间，且 confidence ∈ (0,1]

#### Scenario: LLM 输出不合法时重试不脏写
- **WHEN** Distiller 收到无法通过 JSON schema 校验的 LLM 输出
- **THEN** 系统重试该调用；持续失败则该 Analysis Run 标记失败，不写入部分结果

### Requirement: 增量消化（message_hashes diff）
The system SHALL record a message_hashes watermark per Analysis Run and diff against it when a Capture is re-uploaded. Append-only changes SHALL digest only the appended range (with a context buffer of preceding segments); non-append modifications SHALL re-digest the whole Capture and mark prior segments/atoms as `superseded`. Identical content_hash SHALL be a no-op.

#### Scenario: 续聊只消化新增区间
- **WHEN** 一条已消化的会话重传，新 message_hashes 是旧水位的前缀扩展
- **THEN** 仅新增消息区间（含上下文 buffer）被消化，旧 Task Segment 与 atoms 保持 active

#### Scenario: 中间修改触发整条重消化
- **WHEN** 重传内容在旧水位中部存在修改或删除
- **THEN** 整条 Capture 重新消化，旧 segments/atoms 标记 superseded

#### Scenario: 重复上传为 no-op
- **WHEN** 重传的 content_hash 与最近一次成功 Analysis Run 相同
- **THEN** 不创建新的消化任务

### Requirement: Analysis Run 幂等
Each Digest execution SHALL be recorded as an Analysis Run keyed by the unique idempotency tuple (capture_id, content_hash, pipeline_version). Retries or duplicate triggers SHALL NOT produce duplicate segments or atoms. On startup the system SHALL reconcile captures whose latest content has no successful Analysis Run and re-enqueue them.

#### Scenario: 重试不产生重复原子
- **WHEN** 同一 (capture_id, content_hash, pipeline_version) 的 Digest 被触发两次
- **THEN** 第二次检测到既有成功记录并跳过，原子总数不变

#### Scenario: 重启后对账补队
- **WHEN** api-server 重启导致内存队列丢失
- **THEN** 启动对账将"已入库但无对应成功 Analysis Run"的 Capture 重新入队

### Requirement: 历史回填近期优先
The system SHALL provide a backfill trigger that digests historical Captures starting from the most recent N days (default 90), running at low priority with rate limiting. Older history SHALL be backfilled only after the recent window completes.

#### Scenario: 触发 90 天回填
- **WHEN** 管理端触发 backfill（默认参数）
- **THEN** 最近 90 天的未消化 Capture 按时间倒序进入低优先级队列，不阻塞实时 Digest
