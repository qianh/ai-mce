## ADDED Requirements

### Requirement: Context Pack 生成
系统 SHALL 在 AI 处理完成后，基于已确认的记忆条目和摘要，生成 Markdown 格式的 Context Pack，写入 `context_packs` 表。

#### Scenario: 成功生成 Context Pack
- **WHEN** 候选记忆提取完成（至少有1条 L3+ 记忆或摘要）
- **THEN** Background 组装 Context Pack（含 Current Goal / Recent Decisions / Architecture / Open Questions / Next Actions 章节），写入数据库，通知 Popup 可复制

#### Scenario: 无足够内容时生成基础 Pack
- **WHEN** AI 处理完成但未提取到任何 L3+ 记忆
- **THEN** 生成仅含摘要和原始对话来源的简化 Pack，标记为 `minimal`

### Requirement: Context Pack 一键复制
用户 SHALL 能在 Popup 保存成功界面和控制台详情页，一键将 Context Pack 内容复制到系统剪贴板。

#### Scenario: Popup 中复制 Context Pack
- **WHEN** 保存成功后 Popup 展示「复制 Context Pack」按钮，用户点击
- **THEN** 调用 `navigator.clipboard.writeText()`，按钮文字变为「已复制 ✓」持续2秒

#### Scenario: 控制台详情页复制
- **WHEN** 用户在 Capture 详情页点击 Context Pack 区域的「复制」按钮
- **THEN** 完整 Pack Markdown 复制到剪贴板，按钮短暂显示复制成功状态

### Requirement: Context Pack 格式规范
Context Pack SHALL 遵循固定 Markdown 模板，包含以下章节（无内容的章节自动省略）：`# Project Context: <项目名>`、`## Current Goal`、`## Recent Decisions`（bullet list）、`## Architecture`、`## Open Questions`、`## Next Actions`。

#### Scenario: 包含所有章节
- **WHEN** 项目有完整的记忆数据（决策、架构、待办）
- **THEN** 生成包含全部章节的 Pack，每个决策为一个 bullet point，格式统一

#### Scenario: 省略空章节
- **WHEN** 某个章节（如 Open Questions）没有内容
- **THEN** 该章节在 Pack 中不出现，避免空占位
