## ADDED Requirements

### Requirement: Capture 渠道标签展示
The Captures list SHALL display a readable channel label for every capture row.

#### Scenario: ChatGPT capture 显示渠道
- **WHEN** a capture has `source_platform = 'chatgpt'`
- **THEN** the row displays a readable `ChatGPT` channel label

#### Scenario: DeepSeek capture 显示渠道
- **WHEN** a capture has `source_platform = 'deepseek'`
- **THEN** the row displays a readable `DeepSeek` channel label

#### Scenario: 未知渠道保留原始值
- **WHEN** a capture has an unrecognized `source_platform`
- **THEN** the row displays the raw platform value rather than hiding the channel

### Requirement: Capture 渠道筛选
The Captures list SHALL allow users to filter rows by source platform.

#### Scenario: 选择 DeepSeek 渠道
- **WHEN** the user selects the DeepSeek channel filter
- **THEN** only captures whose `source_platform` is `deepseek` remain visible

#### Scenario: 选择全部渠道
- **WHEN** the user selects the all-channels filter
- **THEN** captures from all source platforms are visible subject to other active filters

### Requirement: Capture 标题模糊检索
The Captures list SHALL allow users to filter rows by case-insensitive title substring.

#### Scenario: 标题关键词匹配
- **WHEN** the user enters a title keyword that appears in a capture title
- **THEN** matching captures remain visible

#### Scenario: 标题关键词不匹配
- **WHEN** the user enters a title keyword that appears in no capture title
- **THEN** the list shows a filtered empty state rather than the initial no-data state

### Requirement: Capture 组合筛选
The Captures list SHALL combine channel and title filters using intersection semantics.

#### Scenario: 渠道与标题同时启用
- **WHEN** the user selects a channel and enters a title keyword
- **THEN** only captures matching both the selected channel and the title keyword remain visible
