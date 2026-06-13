# profile-query-api — Profile API（简报 / 检索 / 证据 / 校准）

## ADDED Requirements

### Requirement: 获取最新 User Brief
The API SHALL expose `GET /v1/profile/brief` returning the latest compiled User Brief for the authenticated user, served from storage without on-the-fly compilation.

#### Scenario: 读取简报
- **WHEN** 已认证用户请求 `GET /v1/profile/brief`
- **THEN** 返回最新版 User Brief（content、version、generated_at、source_claim_ids）

### Requirement: claim 语义检索
The API SHALL expose `GET /v1/profile/claims` supporting dimension filter, project filter, and free-text query `q` answered via embedding similarity. Results SHALL include claim text, dimension, confidence, status, and evidence count. Deprecated and user_rejected claims SHALL be excluded by default.

#### Scenario: 按话题检索
- **WHEN** 用户以 `q=排障习惯` 检索
- **THEN** 返回语义相关的 active claims 按相似度排序，每条含置信度与证据数

#### Scenario: 废弃 claim 默认不可见
- **WHEN** 检索结果中存在 deprecated 或 user_rejected 状态的 claim
- **THEN** 默认响应不包含它们

### Requirement: 证据链回溯
The API SHALL expose `GET /v1/profile/claims/{id}/evidence` returning the traceable chain: each evidence entry resolves to its Memory Atom, Task Segment, and source Capture with message range and quote. Both active and superseded evidence SHALL be visible with status labels.

#### Scenario: 从 claim 回到原始会话
- **WHEN** 用户查询某 claim 的证据
- **THEN** 每条证据含来源会话标题、消息区间、原子内容与 active/superseded 状态

### Requirement: 校准写入
The API SHALL expose `POST /v1/profile/calibrations` accepting action confirm/reject/correct (correct requires corrected_text). The effect SHALL be immediate on claim status/confidence and recorded as an immutable Calibration row.

#### Scenario: 否定立即生效
- **WHEN** 用户对某 claim 提交 reject
- **THEN** 该 claim 状态立即变为 user_rejected，随即从 brief 编译来源与默认检索结果中消失

### Requirement: 做梦报告查询
The API SHALL expose `GET /v1/profile/dreams/latest` returning the most recent dream run's changes explanation (claims created/strengthened/weakened/contradicted/deprecated and triggering sources).

#### Scenario: 解释画像为什么变了
- **WHEN** 用户请求最近一次做梦报告
- **THEN** 响应列出本次变化的 claim 清单、处置类型与触发来源说明

### Requirement: 回填触发
The API SHALL expose `POST /v1/profile/backfill` (authenticated) with a `days` parameter (default 90) that enqueues historical digestion at low priority and returns the enqueued count.

#### Scenario: 触发回填
- **WHEN** 用户调用 backfill 且 days=90
- **THEN** 响应返回入队数量，实时 Digest 不受阻塞
