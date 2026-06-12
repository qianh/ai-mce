# desktop-continuous-scan Delta

## ADDED Requirements

### Requirement: daemon 子命令持续运行
`mce-scanner daemon` SHALL 以常驻进程运行：启动后立即执行首次全量扫描，之后按固定间隔周期性重扫。无参数 `mce-scanner` SHALL 保持单次扫描后退出的语义不变。

#### Scenario: daemon 启动立即首扫
- **WHEN** 用户执行 `mce-scanner daemon`
- **THEN** 进程立即执行一次完整扫描
- **AND** 扫描完成后进程不退出，等待下一个间隔

#### Scenario: 无参数仍为单次扫描
- **WHEN** 用户执行 `mce-scanner`（无参数）
- **THEN** 进程执行一次完整扫描后退出，行为与现状一致

### Requirement: 扫描间隔可配置
扫描间隔 SHALL 默认 1 小时，并 SHALL 可通过 `MCE_SCAN_INTERVAL` 环境变量以秒为单位覆盖。非法值（非正整数）SHALL 回落到默认值并打印告警日志。

#### Scenario: 默认间隔
- **WHEN** 未设置 `MCE_SCAN_INTERVAL`
- **THEN** daemon 每 3600 秒触发一次扫描

#### Scenario: 环境变量覆盖
- **WHEN** 设置 `MCE_SCAN_INTERVAL=300`
- **THEN** daemon 每 300 秒触发一次扫描

#### Scenario: 非法值回落
- **WHEN** 设置 `MCE_SCAN_INTERVAL=abc` 或 `0` 或负数
- **THEN** daemon 使用默认 3600 秒并输出告警日志

### Requirement: 增量检测覆盖新会话与更新会话
每个扫描 tick SHALL 重新发现全部渠道的会话并逐个判定：水印中不存在的新会话 SHALL 上报；水印中已存在但 content_hash 发生变化的会话（即有新消息产生）SHALL 重新上报完整内容。content_hash 未变化的会话 SHALL 跳过，不产生上传请求。

#### Scenario: 新会话上报
- **WHEN** tick 发现一个水印中不存在且满足完成阈值与 MinMessages 的会话
- **THEN** 该会话被解析并上传，水印记录其 file_path + content_hash

#### Scenario: 已上报会话追加消息后重新上报
- **WHEN** 某会话此前已上传，之后文件追加了新消息且再次满足完成阈值
- **THEN** 下一个 tick 解析出新的 content_hash，`IsProcessed` 返回 false
- **AND** 完整会话内容被重新上传，水印更新为新 hash

#### Scenario: 无变化会话不重复上传
- **WHEN** 某会话自上次上传后内容无变化
- **THEN** content_hash 与水印一致，tick 跳过该会话，不发起 HTTP 请求

### Requirement: 被 MinMessages 跳过的会话自然重评估
消息数低于 MinMessages 阈值而被跳过的会话（水印 `skipped:minN:v1`），SHALL 在后续 tick 中重新解析评估；当消息数达到阈值时 SHALL 正常上传。

#### Scenario: 跳过会话增长后上传
- **WHEN** 某会话首次扫描时只有 2 条消息被标记 skipped，之后增长到 5 条
- **THEN** 下一个 tick 重新解析，消息数 ≥ MinMessages，会话被上传
- **AND** 水印从 `skipped:min4:v1` 更新为真实 content_hash

### Requirement: 失败上传依赖自然重扫重试
上传失败的会话 SHALL NOT 写入水印 uploaded 状态，从而在下一个 tick 被重新发现并重试。daemon 模式 SHALL NOT 依赖 `pending_uploads` 队列做重试。`pending_uploads` 表 SHALL 按 file_path 去重，同一文件多次失败只保留最新一条记录。

#### Scenario: 上传失败下一 tick 重试
- **WHEN** 某会话上传因网络错误失败
- **THEN** 该会话水印不更新
- **AND** 下一个 tick 重新发现、重新解析、重新上传该会话

#### Scenario: pending_uploads 不重复累积
- **WHEN** 同一会话连续 3 个 tick 上传失败
- **THEN** `pending_uploads` 中该 file_path 只有 1 条记录（最新失败信息）

### Requirement: tick 间互斥
单个 tick 的扫描 SHALL 复用现有 flock 扫描锁；若上一轮扫描尚未完成（或有其他 scanner 进程在扫描），当前 tick SHALL 跳过并打印日志，不并发执行两轮扫描。

#### Scenario: 长扫描跳过下一 tick
- **WHEN** 一轮扫描耗时超过扫描间隔
- **THEN** 到期的下一个 tick 获取锁失败，记录 "scan skipped" 日志后等待再下一个间隔
