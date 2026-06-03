## ADDED Requirements

### Requirement: 导出完整数据库为 .sqlite 文件
系统 SHALL 允许用户在控制台设置页，将完整的 OPFS SQLite 数据库文件导出为 `.sqlite` 文件，通过 `chrome.downloads` API 下载到本地磁盘。

#### Scenario: 成功导出
- **WHEN** 用户在设置页点击「导出全部」
- **THEN** Background 从 OPFS 读取 `ai-memory.sqlite` 文件字节，通过 `chrome.downloads.download()` 触发下载，文件名格式为 `ai-memory-export-YYYY-MM-DD.sqlite`

#### Scenario: 数据库为空时导出
- **WHEN** 用户点击「导出全部」但 SQLite 中无任何 Capture
- **THEN** 仍然下载一个只含 schema 的空数据库文件，提示「数据库为空」

### Requirement: 导出文件可被标准 SQLite 工具读取
导出的 `.sqlite` 文件 SHALL 是标准 SQLite 3 格式，可被 DB Browser for SQLite、DBeaver、命令行 sqlite3 等工具正常打开和查询。

#### Scenario: 第三方工具验证
- **WHEN** 用户用 DB Browser for SQLite 打开导出文件
- **THEN** 所有数据表和数据完整可见，无格式错误

### Requirement: 清除原文数据
系统 SHALL 允许用户在设置页选择「清除原文」，删除所有 `source_documents` 中的 `normalized_text` 字段内容（保留摘要和结构化记忆），并在清除前展示二次确认弹窗。

#### Scenario: 用户确认清除原文
- **WHEN** 用户点击「清除原文」并在确认弹窗中输入确认文字
- **THEN** 批量更新所有 source_documents 的 normalized_text 为 NULL，保留摘要、候选记忆和 Context Pack，操作完成后展示「已清除 N 条原文」
