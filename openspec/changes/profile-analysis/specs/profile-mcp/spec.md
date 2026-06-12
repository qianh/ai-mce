# profile-mcp — 本机 MCP server（AI CLI 消费画像）

## ADDED Requirements

### Requirement: stdio MCP server 暴露画像工具集
A local MCP server (stdio transport) SHALL expose the following tools backed by the Profile API: `get_user_brief`, `search_profile(query, dimension?, project?)`, `get_claim_evidence(claim_id)`, `correct_profile(claim_id, action, corrected_text?)`, `get_profile_suggestions`, `get_dream_report(date?)`. Tool responses SHALL be compact, Chinese, and context-budget friendly.

#### Scenario: 新会话中 AI 认识用户
- **WHEN** AI CLI 在会话中调用 `get_user_brief`
- **THEN** 返回最新 User Brief，使 AI 能准确描述用户的基础情况、项目脉络与习惯（主验收 AC-002）

#### Scenario: 按话题取证据
- **WHEN** AI 调用 `search_profile` 后继续调用 `get_claim_evidence`
- **THEN** 能从 claim 钻取到来源会话标题、消息区间与引文

### Requirement: 会话内校准
The `correct_profile` tool SHALL let the user confirm, reject, or correct a claim from inside any AI CLI session, taking effect immediately via the Calibration API.

#### Scenario: 在 Claude Code 里纠正画像
- **WHEN** 用户在会话中说"这条画像不对"且 AI 调用 `correct_profile` reject
- **THEN** 该 claim 立即从后续 `get_user_brief` 与 `search_profile` 结果中消失

### Requirement: 独立认证与令牌持久化
The MCP server SHALL authenticate against the api-server with its own credentials (email/password login + refresh token persisted under the user's home directory), independent of extension and scanner sessions, following the same Registered User account.

#### Scenario: 令牌过期自动续期
- **WHEN** access token 过期后 AI 调用任一工具
- **THEN** MCP server 用 refresh token 自动续期并完成调用，无需人工干预

### Requirement: 最小暴露面
The MCP server SHALL NOT expose bulk raw-conversation export or any write operation other than calibration. Evidence quotes SHALL be bounded in length.

#### Scenario: 不提供原文批量导出
- **WHEN** 任何工具被调用
- **THEN** 响应不包含整条会话原文，仅含画像产物与有限长度的证据引文
