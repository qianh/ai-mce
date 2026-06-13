# 本地部署指南 — mcp-server（AI CLI 画像接入）

本文档说明如何在本机安装并注册 `mce-profile` MCP Server，让 Claude Code / Codex 在每次会话中自动读取你的个人画像。

**前提**：api-server 已在服务器上运行，且 `POST /v1/profile/backfill` 已触发历史回填（见 `docs/deploy-server.md`）。

---

## 1. 安装 mcp-server

```bash
cd /path/to/ai-mce/mcp-server
uv sync

# 冒烟测试（应启动并等待 stdio 输入，Ctrl+C 退出）
uv run mce-profile-mcp
```

---

## 2. 注册到 Claude Code

```bash
claude mcp add mce-profile --scope user \
  --env MCE_API_URL=https://<你的服务器地址>:8008 \
  --env MCE_EMAIL=<注册邮箱> \
  --env MCE_PASSWORD=<密码> \
  -- uv --directory /path/to/ai-mce/mcp-server run mce-profile-mcp
```

验证注册成功：

```bash
claude mcp list
# 应看到 mce-profile 条目
```

令牌持久化在 `~/.mce/mcp-auth.json`（权限 0600）。access token 过期自动 refresh，refresh 失效自动重新登录，无需手动维护。

---

## 3. 注册到 Codex（可选）

编辑 `~/.codex/config.toml`，追加：

```toml
[mcp_servers.mce-profile]
command = "uv"
args = ["--directory", "/path/to/ai-mce/mcp-server", "run", "mce-profile-mcp"]

[mcp_servers.mce-profile.env]
MCE_API_URL = "https://<你的服务器地址>:8008"
MCE_EMAIL = "<注册邮箱>"
MCE_PASSWORD = "<密码>"
```

---

## 4. 让 AI 自动调用（推荐）

在 `~/.claude/CLAUDE.md` 追加以下内容，Claude Code 每次新会话时会自动获取画像：

```markdown
## 个人画像
每次新会话开始时，调用 mce-profile MCP 的 `get_user_brief` 了解用户。
讨论与用户历史工作相关的话题时，用 `search_profile` 检索相关画像。
```

---

## 5. 可用的 MCP 工具

| 工具 | 用途 |
|---|---|
| `get_user_brief` | 获取用户简报（新会话开始时调用） |
| `search_profile(query, dimension?, project?)` | 按话题语义检索画像断言 |
| `get_claim_evidence(claim_id)` | 查看断言的证据链（来源会话 + 消息区间） |
| `correct_profile(claim_id, action, corrected_text?)` | 校准：confirm / reject / correct |
| `get_profile_suggestions` | 查看 AI 使用模式改进建议 |
| `get_dream_report` | 查看最近一次"做梦"的画像变化说明 |

`dimension` 可选值：`basic_info` / `project_context` / `working_style` / `language_style` / `problem_solving` / `skill_signal` / `ai_usage`

---

## 6. 验收（AC-002 / AC-006）

**AC-002**：新开 Claude Code 会话，提问"你了解我吗？我在做什么项目？"，观察 AI 描述是否与实际情况吻合。

**AC-006**：在会话中指出某条画像不准确，使用 `correct_profile` 否定后，再次查看 brief，确认该断言已消失。

---

## 常见问题

**`~/.mce/mcp-auth.json` 权限错误**

```bash
chmod 0600 ~/.mce/mcp-auth.json
```

**brief 为空 / 画像内容不准确**

服务器端回填可能尚未完成，或 Dream Cycle 尚未运行。检查 api-server 日志，或手动触发：

```bash
# 触发近90天回填
curl -X POST \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"days": 90}' \
  https://<服务器地址>:8008/v1/profile/backfill
```

Dream Cycle 默认每天凌晨 04:00（服务器时区）自动运行，生成 brief。
