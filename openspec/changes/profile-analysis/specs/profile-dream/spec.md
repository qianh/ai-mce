# profile-dream — Dream Cycle（每日融合 / 快照 / 简报）

## ADDED Requirements

### Requirement: 每日 Dream Cycle 批量融合
The system SHALL run a scheduled Dream Cycle (default daily, configurable cron) that reconciles all `pending` Memory Atoms and superseded evidence against existing Profile Claims. Claims SHALL only change during a Dream Cycle (or via user Calibration), never on individual atom arrival.

#### Scenario: 白天不动 claim
- **WHEN** 白天 Digest 产出新的 pending atoms
- **THEN** 既有 Profile Claim 的内容与置信度保持不变，直到下一次 Dream Cycle

#### Scenario: 做梦窗口完成融合
- **WHEN** Dream Cycle 启动且存在 pending atoms
- **THEN** 运行结束后所有处理过的 atoms 状态变为 fused，且产生一条 dream run 记录（含统计）

### Requirement: claim 对账五种处置
For each affected claim the Dream Cycle SHALL apply exactly one outcome: unchanged, strengthened, weakened, contradicted, or deprecated. New candidate claims MAY be created from atoms that match no existing claim (via embedding similarity recall + LLM judgment). Confidence SHALL be recalculated from active evidence with time decay; claims whose active supporting evidence drops to zero SHALL be deprecated, not deleted.

#### Scenario: 追加证据加强 claim
- **WHEN** 新 atoms 支持某 active claim
- **THEN** 该 claim 置信度上升，处置记录为 strengthened，新证据链接为 supporting/active

#### Scenario: 证据被 supersede 后削弱
- **WHEN** 某 claim 的主要支撑 atoms 在增量消化中被标记 superseded
- **THEN** 下一次 Dream Cycle 重算后该 claim 置信度下降（weakened）或归零废弃（deprecated）

#### Scenario: 矛盾证据不静默覆盖
- **WHEN** 新 atoms 与某 active claim 内容冲突
- **THEN** 该 claim 记录 contradicted 处置并保留 contradicting 证据，不直接删除或改写原 claim

### Requirement: 校准优先级最高
User Calibration SHALL override Dream Cycle reconciliation: confirmed claims SHALL be pinned at high confidence and not weakened by decay; rejected claims SHALL be permanently deprecated and SHALL NOT be revived or re-created in substantially equivalent form by later Dream Cycles.

#### Scenario: 否定的 claim 不复活
- **WHEN** 用户已 reject 某 claim，且后续 atoms 再次支持相同结论
- **THEN** Dream Cycle 不重新激活该 claim，也不生成语义等价的新 claim

### Requirement: Profile Snapshot 版本化且可解释
Each Dream Cycle SHALL produce a versioned Profile Snapshot containing the full claim state plus a changes section explaining what changed and why (which claims were created/strengthened/weakened/contradicted/deprecated, with触发来源). Snapshots SHALL be immutable.

#### Scenario: 今天的会话反映在明天的快照里
- **WHEN** 今天产生了新会话且夜间 Dream Cycle 运行
- **THEN** 新 Snapshot 的 changes 中能看到由该会话引起的 claim 变化及其原因说明

### Requirement: User Brief 编译
After each Dream Cycle the system SHALL recompile the User Brief from high-confidence active/user_confirmed claims across the seven dimensions, as compact Chinese markdown (≤2KB), versioned and stored for millisecond retrieval. Dimension ⑦ (AI usage + improvement suggestions) SHALL be derived during compilation from dimensions ①–⑥.

#### Scenario: 简报只含高置信内容
- **WHEN** User Brief 被编译
- **THEN** 其内容仅来源于置信度达标的 active/user_confirmed claims，且记录 source_claim_ids 可追溯
