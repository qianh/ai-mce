## ADDED Requirements

### Requirement: ChatGPT 对话提取
插件 SHALL 在用户点击 Popup「保存」按钮时，通过 Content Script 提取 chatgpt.com 当前对话的全部可见消息，区分 user / assistant 角色，生成 `ExtractedConversation` 结构体。

#### Scenario: 正常提取整个对话
- **WHEN** 用户在 chatgpt.com 打开 Popup 并点击「保存到 AI Memory」
- **THEN** Content Script 提取所有消息（user + assistant），返回 `extraction_quality.confidence ≥ 0.8`，Popup 显示消息数和字数

#### Scenario: 提取质量低时降级提示
- **WHEN** Content Script 提取到消息数 < 2 或 confidence < 0.6
- **THEN** Popup 切换到「提取质量低」界面，展示备用保存方式（Selection）

### Requirement: Selection 降级保存
当 DOM 提取失败或质量低时，插件 SHALL 允许用户选中页面文本后通过 Popup 保存选中内容。

#### Scenario: 用户选中内容后触发保存
- **WHEN** 用户在任意页面选中文本，打开 Popup，选择「保存选中内容」
- **THEN** 插件读取 `window.getSelection().toString()`，作为 `platform: generic_web` 的内容保存

### Requirement: 保存前预览与确认
插件 SHALL 在任何保存操作执行前，在 Popup 中展示将保存的内容范围、项目归属、保存方式，以及「将保存 / 不会保存」的隐私告知。用户必须显式点击确认按钮才能触发保存。

#### Scenario: 用户查看预览后确认
- **WHEN** Popup 展示保存预览，用户检查内容后点击「保存到 AI Memory」
- **THEN** 保存流程启动，Popup 切换到「正在处理」状态

#### Scenario: 用户取消保存
- **WHEN** Popup 展示保存预览，用户点击关闭按钮
- **THEN** 不执行任何保存操作，不写入任何数据

### Requirement: 去重检测
插件 SHALL 在保存前计算 `content_hash`（SHA-256，归一化后），若本地 SQLite 中已存在相同 hash 的 Capture，SHALL 提示用户「此内容已保存」并提供覆盖或取消选项。

#### Scenario: 重复内容检测
- **WHEN** 用户尝试保存一段已保存过的对话（相同 content_hash）
- **THEN** Popup 显示「此内容已保存于 [时间]」，提供「查看」或「仍然保存」两个选项

### Requirement: 敏感内容检测提示
插件 SHALL 在保存前对提取内容做轻量关键字扫描，检测到 API Key / token / 密码等模式时，在 Popup 展示警告并要求用户选择处理方式（打码 / 仅摘要 / 手动编辑 / 仍然保存）。

#### Scenario: 检测到 API Key
- **WHEN** 提取内容中匹配 `sk-`, `AKIA`, `Bearer ` 等模式
- **THEN** Popup 切换到「敏感内容命中」界面，列出检测到的片段（已部分掩码），用户必须选择处理方式后才能继续
