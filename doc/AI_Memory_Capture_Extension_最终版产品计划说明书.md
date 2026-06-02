# AI Memory Capture Extension 最终版产品计划说明书

> 版本：V1.0 产品实施说明书  
> 输出格式：Markdown  
> 适用范围：浏览器插件、云端 Memory API、Web 控制台、CLI / MCP 后续集成  
> 核心定位：给 AI Web 对话增加一个用户主动触发的「沉淀为可复用项目上下文」按钮。

---

## 1. 产品总览

### 1.1 产品名称

```text
AI Memory Capture Extension
```

内部简称：

```text
AI Memory Capture
```

---

### 1.2 一句话定位

> 在 ChatGPT、Claude、Gemini、Perplexity 等 AI Web 应用中，用户看到重要对话后，点击一次，即可将其沉淀为可复用的项目记忆、关键决策、上下文包和后续 AI 工作流资料。

---

### 1.3 产品不是做什么

本产品不是：

```text
网页爬虫
浏览器历史采集器
自动监控工具
无感数据同步工具
普通收藏夹
全量知识库导入工具
```

产品必须避免让用户产生这种感觉：

```text
它在偷偷监控我的网页。
```

产品应该让用户明确感受到：

```text
我看到重要 AI 对话，主动点一下，它帮我整理成长期可用的记忆。
```

---

### 1.4 核心用户价值

AI Memory Capture 解决的问题是：

```text
用户在 ChatGPT / Claude / Cursor / Perplexity / Gemini 中反复讨论项目，
但这些讨论无法自然沉淀为长期上下文。
下一次打开新 AI 会话时，用户仍然需要重新解释背景、方案、约束和历史决策。
```

产品提供的价值是：

```text
1. 一键保存 AI 对话
2. 自动整理摘要、决策、任务、项目记忆
3. 把零散对话变成可复用上下文
4. 通过 Web 控制台、CLI、MCP 再次提供给 Claude Code / Cursor / Codex / ChatGPT
5. 形成「对话 → 记忆 → 上下文 → 新对话 → 再沉淀」闭环
```

---

## 2. 产品原则

### 2.1 用户主动控制

第一版默认只支持用户主动保存。

```text
用户点击保存
用户选择保存范围
用户确认敏感内容处理方式
用户可以删除已保存内容
用户可以关闭某个平台采集能力
```

不做：

```text
默认自动保存所有对话
默认后台监控所有页面
默认读取浏览器历史
默认抓取其他标签页
```

---

### 2.2 权限最小化

权限策略必须遵循：

```text
不申请 cookies
不申请 history
不申请 bookmarks
不默认申请 <all_urls>
不默认读取所有网站
优先使用 activeTab 处理用户主动触发的通用网页保存
```

建议采用「默认权限 + 可选权限」策略：

```text
默认支持：
- ChatGPT
- activeTab
- contextMenus
- storage
- scripting
- alarms
- identity
- api.your-memory-app.com

用户启用后再申请：
- Claude
- Gemini
- Perplexity
- 其他 AI Web 平台
```

---

### 2.3 保存前明确告知

保存前必须展示：

```text
将保存：
- 当前页面标题
- 当前页面 URL
- 用户选择保存的对话或选中内容
- 保存时间
- 插件版本

不会保存：
- Cookie
- 密码
- 浏览器历史
- 其他标签页内容
- 未选中的网页内容
```

同时必须说明：

```text
保存内容会被用于生成摘要、标签、候选记忆、向量索引和项目上下文。
```

---

### 2.4 默认保护隐私

默认保存策略：

```text
默认：只保存摘要 + 结构化记忆
可选：保存完整原文
高级设置：允许保存全文并进入向量索引
隐私模式：仅保存用户手动编辑后的笔记
```

不建议第一版默认长期保存完整原文。

---

### 2.5 可解释、可追溯、可删除

每条记忆都应能回答：

```text
它来自哪一次保存？
来自哪个页面？
来自哪几条消息？
为什么被判断为项目记忆 / 长期偏好 / 关键决策？
是否经过用户确认？
是否可以删除或撤销？
```

---

## 3. 总体系统架构

### 3.1 端到端链路

```text
ChatGPT / Claude / Gemini / Perplexity / 通用网页
              ↓
        浏览器插件提取内容
              ↓
        用户预览并确认保存
              ↓
        本地短期队列
              ↓
        云端 Memory API
              ↓
        清洗 / 摘要 / 分类 / 敏感信息检测
              ↓
        Capture / SourceDocument / MemoryCandidate / MemoryItem
              ↓
        Web 控制台
              ↓
        CLI / MCP / Context Pack
              ↓
Claude Code / Cursor / Codex / ChatGPT 新会话
```

---

### 3.2 插件端职责

插件只负责：

```text
1. 页面识别
2. 内容提取
3. 提取质量评估
4. 保存前预览
5. 用户选择项目和保存范围
6. 本地短期失败队列
7. 上传到云端 Memory API
8. 展示保存结果
```

插件不负责：

```text
复杂知识图谱
长期记忆判断最终决策
大模型调用
长期数据存储
跨设备同步
团队权限管理
```

---

### 3.3 云端职责

云端负责：

```text
1. 接收 Capture
2. 保存 SourceDocument
3. 异步分析内容
4. 生成摘要
5. 识别项目
6. 提取候选记忆
7. 判断记忆等级
8. 检测敏感信息
9. 生成 Context Pack
10. 提供 Web 控制台、CLI、MCP 查询能力
```

---

## 4. 技术架构建议

### 4.1 浏览器插件技术栈

建议：

```text
Chrome Extension Manifest V3
TypeScript
React
WXT 或 Plasmo
Vite
IndexedDB
chrome.storage
chrome.identity
```

---

### 4.2 插件目录结构

```text
extension/
├── manifest.json
├── src/
│   ├── background/
│   │   ├── service-worker.ts
│   │   ├── queue-worker.ts
│   │   └── auth-listener.ts
│   │
│   ├── content-scripts/
│   │   ├── main.ts
│   │   ├── floating-button.ts
│   │   ├── selection-listener.ts
│   │   └── extractors/
│   │       ├── base.ts
│   │       ├── chatgpt.ts
│   │       ├── claude.ts
│   │       ├── gemini.ts
│   │       ├── perplexity.ts
│   │       └── generic-page.ts
│   │
│   ├── popup/
│   │   ├── Popup.tsx
│   │   ├── SavePanel.tsx
│   │   ├── ProjectSelector.tsx
│   │   └── PrivacyNotice.tsx
│   │
│   ├── sidepanel/
│   │   ├── SidePanel.tsx
│   │   ├── SuggestedMemories.tsx
│   │   └── CaptureHistory.tsx
│   │
│   ├── lib/
│   │   ├── api-client.ts
│   │   ├── auth.ts
│   │   ├── hash.ts
│   │   ├── platform-detector.ts
│   │   ├── sensitive-detector.ts
│   │   ├── text-cleaner.ts
│   │   └── schema.ts
│   │
│   └── storage/
│       ├── queue-store.ts
│       ├── payload-store.ts
│       └── settings-store.ts
│
├── fixtures/
│   ├── chatgpt/
│   ├── claude/
│   └── generic/
│
└── tests/
    ├── extractor/
    ├── queue/
    └── api-client/
```

---

### 4.3 推荐 Manifest V3 配置

V0.1 只默认支持 ChatGPT 和通用选中内容，Claude 放到 V0.2 或 V0.1.1。

```json
{
  "manifest_version": 3,
  "name": "AI Memory Capture",
  "version": "0.1.0",
  "description": "Save AI conversations into your personal memory hub.",
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "contextMenus",
    "alarms",
    "identity"
  ],
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://api.your-memory-app.com/*"
  ],
  "optional_host_permissions": [
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://www.perplexity.ai/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "Save to AI Memory"
  },
  "content_scripts": [
    {
      "matches": ["https://chatgpt.com/*"],
      "js": ["content-scripts/main.js"],
      "run_at": "document_idle"
    }
  ]
}
```

注意事项：

```text
1. V0.1 不加 sidePanel 权限。
2. Claude / Gemini / Perplexity 用 optional_host_permissions。
3. 通用网页保存通过 activeTab + 用户主动触发实现。
4. 不使用 <all_urls>。
5. 不申请 cookies / history。
```

---

## 5. 核心数据模型

### 5.1 插件端提取结构

```ts
type ExtractedConversation = {
  schema_version: string;
  extractor_version: string;

  source: {
    platform:
      | "chatgpt"
      | "claude"
      | "gemini"
      | "perplexity"
      | "generic_web";
    url: string;
    browser_title: string;
    captured_at: string;
    locale?: string;
  };

  content: {
    title: string;
    messages: Array<{
      role: "user" | "assistant" | "system" | "unknown";
      content: string;
      index: number;
      timestamp?: string;
      message_hash?: string;
    }>;
  };

  extraction_quality: {
    confidence: number;
    method:
      | "dom_attr"
      | "testid"
      | "article"
      | "large_text_blocks"
      | "selection"
      | "manual_paste";
    warnings: string[];
    message_count: number;
    empty_message_count: number;
  };

  hashes: {
    content_hash: string;
    message_hashes: string[];
    visible_range_hash?: string;
    source_fingerprint: string;
  };

  metadata?: {
    conversation_id?: string;
    model_name?: string;
    language?: string;
  };
};
```

---

### 5.2 云端核心实体

#### 5.2.1 Capture

表示用户的一次保存动作。

```text
Capture
- id
- user_id
- workspace_id
- project_hint
- capture_mode
- source_platform
- source_url
- source_title
- client_capture_id
- content_hash
- extractor_version
- extraction_quality
- created_at
- status
```

---

#### 5.2.2 SourceDocument

表示从 Capture 中解析出的规范化内容。

```text
SourceDocument
- id
- capture_id
- document_type
- title
- normalized_text
- message_count
- token_estimate
- language
- raw_payload_ref
- retention_policy
- created_at
```

---

#### 5.2.3 MemoryCandidate

表示 AI 提取出的候选记忆，不一定正式入库。

```text
MemoryCandidate
- id
- source_document_id
- project_id
- content
- level
- confidence
- reason
- requires_confirmation
- source_message_indexes
- sensitive_flags
- status
- created_at
```

---

#### 5.2.4 MemoryItem

表示正式进入长期记忆系统的内容。

```text
MemoryItem
- id
- project_id
- user_id
- content
- memory_type
- level
- source_candidate_id
- source_capture_id
- confidence
- confirmed_by_user
- valid_from
- expires_at
- version
- supersedes_memory_id
- created_at
- updated_at
```

---

#### 5.2.5 Decision

关键决策建议单独建模，避免被普通项目记忆淹没。

```text
Decision
- id
- project_id
- title
- decision
- rationale
- alternatives
- status
- source_capture_id
- confirmed_by_user
- decided_at
- supersedes_decision_id
```

---

#### 5.2.6 Task / ActionItem

```text
Task
- id
- project_id
- title
- description
- owner
- due_date
- status
- source_capture_id
- created_at
```

---

#### 5.2.7 ContextPack

给下一个 AI 会话使用的上下文包。

```text
ContextPack
- id
- project_id
- generated_for
- summary
- recent_decisions
- active_constraints
- open_questions
- next_actions
- source_memory_ids
- created_at
```

---

## 6. 记忆等级规则

### 6.1 等级定义

| 等级 | 名称 | 含义 | 默认动作 |
|---|---|---|---|
| L0 | 噪音 | 无复用价值 | 丢弃 |
| L1 | 临时信息 | 短期有用 | 保存，设置 TTL |
| L2 | 会话上下文 | 当前任务有用 | 保存到当前项目，较短 TTL |
| L3 | 项目记忆 | 项目后续会复用 | 自动入库，可撤销 |
| L4 | 长期偏好 | 用户长期偏好、习惯、原则 | 必须用户确认 |
| L5 | 核心事实 / 关键决策 | 重要事实、架构决策、产品决策 | 必须用户确认，保留版本 |

---

### 6.2 候选记忆结构

```ts
type MemoryCandidate = {
  content: string;
  level: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  confidence: number;
  reason: string;
  requires_confirmation: boolean;
  ttl_days?: number;
  source_capture_id: string;
  source_message_indexes: number[];
};
```

---

### 6.3 必须用户确认的情况

```text
1. L4 长期偏好
2. L5 核心事实 / 关键决策
3. 覆盖旧决策
4. 改写用户长期画像
5. 涉及账号、财务、法律、健康、身份信息
6. AI 置信度低于阈值
7. 检测到密钥、token、密码、身份证号、银行卡等敏感内容
```

---

## 7. 云端 API 设计

### 7.1 创建 Capture

```http
POST /v1/captures
Authorization: Bearer <access_token>
Content-Type: application/json
Idempotency-Key: <client_capture_id>
```

请求示例：

```json
{
  "schema_version": "2026-06-02.v1",
  "client_capture_id": "cap_local_01J...",
  "capture_mode": "full_conversation",
  "save_mode": "summary_and_memory",
  "project_hint": "AI Memory Hub",
  "memory_type_hint": "auto",

  "source": {
    "platform": "chatgpt",
    "url": "https://chatgpt.com/c/xxx",
    "browser_title": "ChatGPT - AI Memory Plugin",
    "captured_at": "2026-06-02T10:30:00Z"
  },

  "content": {
    "title": "AI Memory 浏览器插件方案",
    "messages": [
      {
        "role": "user",
        "content": "请仔细审阅该方案，看是否需要优化，以及是否有其他建议",
        "index": 0
      },
      {
        "role": "assistant",
        "content": "...",
        "index": 1
      }
    ]
  },

  "hashes": {
    "content_hash": "sha256_xxx",
    "message_hashes": ["sha256_a", "sha256_b"],
    "source_fingerprint": "chatgpt:https://chatgpt.com/c/xxx"
  },

  "extraction_quality": {
    "confidence": 0.91,
    "method": "dom_attr",
    "warnings": [],
    "message_count": 18,
    "empty_message_count": 0
  },

  "client": {
    "extension_version": "0.1.0",
    "browser": "chrome",
    "locale": "zh-CN"
  }
}
```

响应示例：

```json
{
  "capture_id": "cap_123",
  "status": "queued",
  "estimated_result": {
    "project": "AI Memory Hub",
    "memory_level": "L3",
    "processing_eta": "short"
  }
}
```

---

### 7.2 查询 Capture 状态

```http
GET /v1/captures/{capture_id}
Authorization: Bearer <access_token>
```

响应示例：

```json
{
  "capture_id": "cap_123",
  "status": "processed",
  "result": {
    "summary": "本次讨论围绕浏览器插件的产品定位、MVP 收敛、隐私安全、Extractor 稳定性和路线规划展开。",
    "project": "AI Memory Hub",
    "memory_items_created": 4,
    "candidates_requiring_review": 2,
    "action_items": 3
  }
}
```

---

### 7.3 获取项目 Context Pack

```http
GET /v1/projects/{project_id}/context-pack
Authorization: Bearer <access_token>
```

响应示例：

```json
{
  "project_id": "proj_123",
  "title": "AI Memory Hub",
  "context_pack": {
    "project_summary": "...",
    "recent_decisions": [],
    "active_constraints": [],
    "open_questions": [],
    "next_actions": []
  }
}
```

---

### 7.4 审核候选记忆

```http
POST /v1/memory-candidates/{candidate_id}/confirm
Authorization: Bearer <access_token>
```

请求示例：

```json
{
  "action": "confirm",
  "edited_content": "浏览器插件第一版应以用户主动保存为核心，不做默认自动抓取。",
  "level": "L5"
}
```

---

## 8. 本地存储与队列策略

### 8.1 存储原则

推荐策略：

```text
storage.local：
- 用户设置
- 队列 metadata
- 最近保存状态
- 项目列表缓存

storage.session：
- 短期 access_token
- 当前会话临时状态

IndexedDB：
- 短期 payload 缓存
- 上传失败时的完整内容
- 设置 TTL，上传成功后删除
```

---

### 8.2 Capture Job Metadata

```ts
type CaptureJobMeta = {
  id: string;
  payload_ref: string;
  status: "pending" | "uploading" | "uploaded" | "failed";
  created_at: string;
  updated_at: string;
  retry_count: number;
  next_retry_at?: string;
  last_error?: string;
  content_hash: string;
  size_bytes: number;
  expires_at: string;
};
```

---

### 8.3 队列规则

```text
1. 保存时先创建本地 job。
2. payload 存 IndexedDB。
3. metadata 存 storage.local。
4. 上传成功后立即删除本地 payload。
5. 上传失败进入重试队列。
6. 超过最大重试次数后提示用户手动重试。
7. 超过 TTL 后自动删除。
8. 任何日志和错误上报不得包含原文。
```

---

### 8.4 重试策略

```text
第 1 次失败：30 秒后重试
第 2 次失败：2 分钟后重试
第 3 次失败：10 分钟后重试
第 4 次失败：1 小时后重试
超过 24 小时仍失败：标记为 failed_expired
```

---

### 8.5 大内容处理

如果提取内容过大：

```text
小于 200 KB：正常上传
200 KB - 2 MB：提示用户建议只保存摘要
大于 2 MB：默认不上传全文，要求用户选择：
  - 只保存摘要
  - 保存最近 N 轮
  - 手动编辑后保存
```

---

## 9. 登录与账号体系

### 9.1 登录原则

不要让用户在插件中输入长期 API Key。

推荐流程：

```text
插件点击登录
    ↓
chrome.identity.launchWebAuthFlow
    ↓
打开 Web 登录页
    ↓
OAuth Authorization Code + PKCE
    ↓
重定向到扩展 redirect URL
    ↓
插件获取短期 access_token
    ↓
后续调用 Memory API
```

---

### 9.2 Token 策略

```text
access_token：
- 短期有效
- 建议 15 - 60 分钟
- 优先放 storage.session

refresh_token：
- 尽量由服务端 session 管理
- 如必须在插件端保存，需短有效期、可撤销、最小权限

用户：
- 可在 Web 控制台撤销插件授权
- 可查看已授权设备
- 可退出登录并清除本地 token
```

---

### 9.3 账号与 workspace

```text
User
- id
- email
- name
- created_at

Workspace
- id
- owner_user_id
- name
- plan
- created_at

Membership
- user_id
- workspace_id
- role
```

V0.1 可以先只支持单用户、单 workspace。

---

## 10. Extractor 设计

### 10.1 Extractor 统一接口

```ts
interface ConversationExtractor {
  platform: string;

  canHandle(location: Location, document: Document): boolean;

  extract(document: Document): Promise<ExtractedConversation>;

  extractSelection?(
    document: Document
  ): Promise<ExtractedConversation | ExtractedSnippet>;
}
```

---

### 10.2 Extractor Registry

```ts
const extractors = [
  chatgptExtractor,
  claudeExtractor,
  geminiExtractor,
  perplexityExtractor,
  genericPageExtractor
];

export async function extractCurrentPage() {
  const extractor = extractors.find(e =>
    e.canHandle(window.location, document)
  );

  if (!extractor) {
    return genericPageExtractor.extract(document);
  }

  return extractor.extract(document);
}
```

---

### 10.3 提取质量评分

每次提取都必须返回质量评分：

```ts
type ExtractionQuality = {
  confidence: number;
  method:
    | "dom_attr"
    | "testid"
    | "article"
    | "large_text_blocks"
    | "selection"
    | "manual_paste";
  warnings: string[];
  message_count: number;
  empty_message_count: number;
};
```

---

### 10.4 降级路径

页面结构变化时，不允许直接失败。必须降级：

```text
优先级 1：平台专用 DOM Extractor
优先级 2：通用 article / main 文本块提取
优先级 3：用户选中内容
优先级 4：手动粘贴模式
```

用户提示：

```text
当前页面结构发生变化，无法完整识别对话。

你可以：
[保存当前选中内容]
[保存页面可读文本]
[手动粘贴内容]
[反馈页面结构变化]
```

---

### 10.5 Extractor 测试样本

每个平台都要建立 fixtures：

```text
fixtures/
  chatgpt/
    normal-conversation.html
    conversation-with-code.html
    conversation-with-table.html
    conversation-with-regenerated-answer.html
    long-conversation.html
    empty-conversation.html

  claude/
    normal-conversation.html
    artifact-conversation.html
    long-conversation.html

  generic/
    selected-article.html
    selected-code.html
    selected-doc.html
```

测试项目：

```text
1. 是否能正确识别 message_count
2. 是否能区分 user / assistant
3. 是否保留代码块
4. 是否保留列表和表格语义
5. 是否过滤掉 Copy / Share / Regenerate 等 UI 文案
6. 是否生成 content_hash
7. extraction_quality 是否合理
```

---

## 11. 去重与增量保存

### 11.1 Hash 结构

```ts
type CaptureHashes = {
  content_hash: string;
  message_hashes: string[];
  visible_range_hash?: string;
  source_fingerprint: string;
};
```

---

### 11.2 归一化规则

生成 hash 前先做归一化：

```text
1. trim 前后空格
2. 合并连续空行
3. 去除平台 UI 文案
4. 保留 role
5. 保留 message index
6. 保留代码块内容
7. 不保留动态按钮文案
```

---

### 11.3 服务端去重规则

```text
同 user_id + client_capture_id：
- 幂等返回，不重复处理

同 user_id + content_hash：
- 不重复入库，返回已有 capture

同 source_fingerprint + 新 message_hashes：
- 识别为同一对话增量保存

同 URL 但 content_hash 不同：
- 保存为同一来源的新版本

同 title 但 URL 不同：
- 作为不同来源处理
```

---

## 12. 敏感内容检测

### 12.1 插件端轻量检测

插件端只做轻量提示，不做最终安全判断。

检测规则：

```text
api_key
secret
password
token
bearer
sk-
AKIA
private key
身份证号
银行卡号
手机号
邮箱
访问令牌
```

---

### 12.2 命中提示

```text
检测到可能包含敏感信息。

建议选择：
[自动打码后保存]
[只保存摘要]
[手动编辑内容]
[仍然保存全文]
```

---

### 12.3 云端二次检测

云端必须再次检测：

```text
密钥
密码
身份信息
财务信息
医疗信息
账号信息
法律相关敏感内容
```

并记录：

```text
sensitive_flags
redaction_status
retention_policy
requires_review
```

---

## 13. Popup 产品设计

### 13.1 V0.1 Popup 主界面

```text
AI Memory Capture

当前页面：
ChatGPT 对话

检测结果：
18 条消息
约 5,200 字
提取质量：高

保存范围：
(•) 整个对话
( ) 最近一轮问答
( ) 选中内容

保存到：
[ 自动识别项目 v ]

保存方式：
(•) 摘要 + 结构化记忆
( ) 完整原文 + 摘要 + 结构化记忆
( ) 仅保存我编辑后的笔记

备注：
[ 选填：这次讨论主要关于... ]

[保存到 AI Memory]
```

---

### 13.2 提取质量较低时

```text
AI Memory Capture

当前页面可识别，但提取质量较低。

原因：
- 只识别到 2 条消息
- 页面结构可能发生变化

建议：
[保存选中内容]
[保存页面可读文本]
[手动粘贴]
```

---

### 13.3 保存成功状态

```text
已保存到 AI Memory

正在分析：
✓ 已上传
✓ 正在生成摘要
✓ 正在提取候选记忆
○ 等待生成 Context Pack

初步结果：
项目：AI Memory Hub
候选记忆：4 条
待确认决策：1 条
待办：2 条

[查看结果]
[复制 Context Pack]
```

---

### 13.4 保存失败状态

```text
保存失败，但内容已暂存在本地。

原因：
网络连接失败

系统将自动重试。
你也可以：

[立即重试]
[只复制为 Markdown]
[删除本地缓存]
```

---

## 14. Web 控制台设计

### 14.1 V0.1 控制台页面

V0.1 只需要最小控制台：

```text
1. Capture 列表
2. Capture 详情
3. 自动摘要
4. 候选记忆
5. 项目归属
6. Context Pack 复制按钮
7. 删除 Capture
```

---

### 14.2 Capture 详情页

```text
标题：AI Memory 浏览器插件方案
来源：ChatGPT
保存时间：2026-06-02 10:30
项目：AI Memory Hub

摘要：
...

候选记忆：
1. 浏览器插件第一版应以用户主动保存为核心。
   等级：L5
   状态：待确认
   [确认] [编辑] [忽略]

2. Popup 应先承担保存预览和项目选择能力。
   等级：L3
   状态：已入库
   [撤销]

待办：
- 设计 V0.1 API
- 实现 ChatGPT Extractor
- 建立 Extractor fixtures
```

---

### 14.3 Review Inbox

V0.2 增加 Review Inbox：

```text
待确认：
- 长期偏好
- 核心决策
- 覆盖旧决策
- 低置信度候选记忆
- 敏感内容命中项
```

---

## 15. Context Pack 设计

### 15.1 为什么 V0.1 就要做 Context Pack

Context Pack 是保存后的即时价值。

用户保存成功后，不应该只看到：

```text
已保存。
```

而应该马上得到：

```text
这段对话已经变成可以复制给下一个 AI 的项目上下文。
```

这能让产品从“收藏夹”变成“AI 工作流基础设施”。

---

### 15.2 Context Pack 格式

```md
# Project Context: AI Memory Hub

## Current Goal
构建一个浏览器插件，让用户可以将 ChatGPT / Claude 等 AI Web 对话沉淀为长期项目记忆。

## Recent Decisions
- 第一版只做用户主动保存，不做默认自动抓取。
- V0.1 优先支持 ChatGPT 当前对话和通用网页选中内容。
- Side Panel 延后到 V0.2。
- 默认只保存摘要和结构化记忆，不默认长期保存完整原文。

## Architecture
- Browser Extension 负责页面识别、内容提取、保存前确认和上传。
- Cloud Memory API 负责摘要、分类、记忆等级判断和项目归档。
- Web Console 负责查看、确认、删除和复制上下文。
- CLI / MCP 后续负责把记忆带入 Claude Code / Cursor / Codex。

## Open Questions
- 是否需要端到端加密模式？
- 原文默认保留 7 天、30 天还是完全不保留？
- 项目自动识别是否应该在 V0.1 做到可编辑？

## Next Actions
- 实现 ChatGPT Extractor。
- 实现 POST /v1/captures。
- 实现 Popup 保存预览。
- 建立 Extractor 测试 fixtures。
```

---

## 16. 产品迭代路线

下面是建议的正式实施路线。

---

# Phase 0：产品和技术准备

## 16.1 阶段目标

在正式开发前，完成产品边界、技术选型、隐私策略、数据模型和原型设计。

---

## 16.2 功能范围

```text
1. 明确 V0.1 产品范围
2. 输出插件信息架构
3. 输出云端数据模型
4. 输出 API 草案
5. 输出隐私文案
6. 输出 Chrome Web Store 权限策略
7. 输出 Popup 原型
8. 输出 Web Console 最小原型
```

---

## 16.3 交付物

```text
产品：
- V0.1 PRD
- 用户流程图
- Popup 原型
- Web Console 原型
- 隐私说明文案

技术：
- Manifest 权限设计
- 插件模块设计
- 云端数据模型
- API OpenAPI 草案
- 数据保留策略
- Extractor 测试计划
```

---

## 16.4 注意事项

```text
1. 不要在准备阶段扩大 MVP。
2. 不要把 Claude、Gemini、Side Panel、MCP 全塞进 V0.1。
3. 隐私文案必须和实际数据行为一致。
4. Chrome Web Store 页面描述、插件 UI、隐私政策三处说法必须一致。
5. API 和数据模型要为后续 Review Inbox、MCP、Context Pack 留扩展空间。
```

---

## 16.5 阶段验收标准

```text
1. 团队能清楚说明 V0.1 做什么、不做什么。
2. Manifest 权限清单确定。
3. 云端数据表第一版确定。
4. POST /v1/captures 请求结构确定。
5. Popup 保存流程原型确定。
6. 隐私提示文案确定。
```

---

# Phase 1：V0.1 Capture MVP

## 17.1 阶段目标

验证最小闭环：

```text
用户在 ChatGPT 中讨论项目
        ↓
点击插件保存
        ↓
云端生成摘要和候选记忆
        ↓
用户能在 Web 控制台查看
        ↓
用户能复制 Context Pack 给下一个 AI 会话使用
```

---

## 17.2 V0.1 功能范围

V0.1 必须做：

```text
1. ChatGPT 当前对话提取
2. 通用网页选中内容右键保存
3. Popup 保存前预览
4. 项目选择 / 默认 Inbox
5. 保存方式选择
6. 本地短期失败队列
7. 上传到云端 POST /v1/captures
8. 云端生成摘要
9. 云端生成 MemoryCandidate
10. Web 控制台查看 Capture 结果
11. Context Pack 生成和复制
12. 删除 Capture
```

V0.1 不做：

```text
Claude 全量支持
Gemini
Perplexity
Side Panel
半自动建议
自动保存
MCP
CLI
团队协作
知识图谱
移动端
浏览器历史采集
```

---

## 17.3 插件端功能

### 17.3.1 ChatGPT Extractor

功能：

```text
1. 检测 chatgpt.com
2. 提取当前可见对话消息
3. 区分 user / assistant
4. 清洗 UI 文案
5. 保留代码块、列表、表格文本
6. 生成 content_hash
7. 返回 extraction_quality
```

注意事项：

```text
1. 不强依赖 conversationId。
2. 不假设 ChatGPT DOM 永远稳定。
3. 至少准备 5 个 HTML fixture 做测试。
4. 如果提取不到完整消息，降级到页面可读文本或选中内容。
5. 不读取其他标签页。
```

---

### 17.3.2 通用网页选中内容保存

功能：

```text
1. 用户选中网页内容
2. 右键点击「保存到 AI Memory」
3. 插件读取 selection text
4. 弹出保存预览
5. 用户选择项目和保存方式
6. 上传云端
```

注意事项：

```text
1. 必须由用户主动选中和触发。
2. 不自动读取整个网页。
3. 对通用网页优先使用 activeTab。
4. 保存时必须展示来源 URL 和标题。
```

---

### 17.3.3 Popup 保存前预览

功能：

```text
1. 显示当前页面类型
2. 显示识别出的消息数量
3. 显示字数估算
4. 显示提取质量
5. 选择保存范围
6. 选择保存项目
7. 选择保存方式
8. 输入用户备注
9. 点击保存
```

保存范围：

```text
- 整个对话
- 最近一轮问答
- 选中内容
- 手动编辑内容
```

保存方式：

```text
- 摘要 + 结构化记忆
- 完整原文 + 摘要 + 结构化记忆
- 仅保存用户编辑后的笔记
```

注意事项：

```text
1. 默认选择“摘要 + 结构化记忆”。
2. 完整原文保存必须让用户明确选择。
3. 敏感内容命中时必须二次确认。
```

---

### 17.3.4 本地失败队列

功能：

```text
1. 保存时创建本地 job
2. 网络失败时保留短期 payload
3. 自动重试
4. 上传成功后删除本地 payload
5. 超过 TTL 后删除
```

注意事项：

```text
1. 不长期保存全文。
2. 不把全文写入日志。
3. 不把完整 payload 存 storage.local。
4. payload 使用 IndexedDB 短期保存。
5. metadata 使用 storage.local。
```

---

## 17.4 云端功能

### 17.4.1 POST /v1/captures

功能：

```text
1. 验证 access_token
2. 校验 workspace_id / user_id
3. 校验 Idempotency-Key
4. 保存 Capture
5. 保存 SourceDocument
6. 创建异步处理任务
7. 返回 queued 状态
```

注意事项：

```text
1. 必须幂等。
2. 必须按 user_id 隔离数据。
3. 必须限制 payload 大小。
4. 必须记录 schema_version 和 extractor_version。
5. 必须保留 source_url 和 content_hash，方便去重。
```

---

### 17.4.2 异步分析任务

功能：

```text
1. 文本清洗
2. 语言识别
3. 敏感内容检测
4. 摘要生成
5. 项目识别
6. 候选记忆提取
7. 记忆等级判断
8. 待办提取
9. 决策提取
10. Context Pack 生成
```

注意事项：

```text
1. 先保存原始 Capture，再异步处理。
2. 大模型失败不应影响 Capture 保存。
3. 摘要失败时要允许重试。
4. 敏感内容命中后，不应自动入长期记忆。
5. L4 / L5 默认进入待确认状态。
```

---

### 17.4.3 Web 控制台最小版本

功能：

```text
1. 登录
2. 查看 Capture 列表
3. 查看 Capture 详情
4. 查看摘要
5. 查看候选记忆
6. 查看待办和决策
7. 复制 Context Pack
8. 删除 Capture
```

注意事项：

```text
1. 不做复杂知识图谱。
2. 不做团队权限。
3. 不做高级搜索。
4. 优先让用户看到保存后的即时价值。
```

---

## 17.5 V0.1 验收标准

产品验收：

```text
1. 用户可以在 ChatGPT 页面点击插件保存当前对话。
2. 用户可以在任意网页选中内容后右键保存。
3. 保存前能看到保存范围、项目和隐私提示。
4. 保存成功后能看到摘要和候选记忆。
5. 用户可以复制 Context Pack。
6. 用户可以删除 Capture。
```

技术验收：

```text
1. ChatGPT Extractor 在测试 fixtures 中通过率 ≥ 90%。
2. 上传接口具备幂等能力。
3. 本地队列断网后可恢复上传。
4. 上传成功后本地 payload 被删除。
5. L4 / L5 不自动入库，必须待确认。
6. 不申请 cookies / history / <all_urls>。
```

业务验收：

```text
1. 10 个真实用户完成至少 3 次保存。
2. 保存成功率 ≥ 95%。
3. 用户能理解保存了什么、没保存什么。
4. 至少 50% 测试用户愿意复制 Context Pack 到另一个 AI 会话使用。
```

---

# Phase 2：V0.1.1 稳定性与信任版本

## 18.1 阶段目标

提升 V0.1 的可靠性、隐私信任和可维护性。

---

## 18.2 功能范围

```text
1. Extractor 测试集完善
2. 提取失败降级体验
3. 敏感信息提示增强
4. 本地队列 TTL 管理
5. 保存历史
6. 上传状态详情
7. 手动粘贴模式
8. 原文保留策略设置
9. 插件授权撤销
10. 错误反馈入口
```

---

## 18.3 重点功能说明

### 18.3.1 提取失败降级

用户遇到 DOM 变化时：

```text
当前页面结构发生变化，无法完整识别对话。
你仍然可以保存：

[保存选中内容]
[保存页面可读文本]
[手动粘贴]
[反馈问题]
```

注意事项：

```text
1. 不让用户看到技术错误。
2. 错误反馈中不得自动包含原文。
3. 可以附带 extractor_version、platform、DOM 特征摘要。
```

---

### 18.3.2 保存历史

功能：

```text
1. 最近保存列表
2. 保存状态
3. 重试状态
4. 云端处理状态
5. 跳转 Web 控制台
6. 删除本地失败任务
```

注意事项：

```text
1. 本地历史只保存 metadata。
2. 不在本地长期展示完整内容。
3. 用户退出登录时清除本地敏感缓存。
```

---

### 18.3.3 原文保留策略

Web 控制台提供设置：

```text
原文保留：
(•) 处理完成后删除原文，仅保留摘要和结构化记忆
( ) 保留 7 天
( ) 保留 30 天
( ) 长期保留
```

注意事项：

```text
1. 默认不长期保留全文。
2. 用户改设置后只影响新 Capture。
3. 旧 Capture 需要提供批量删除原文功能。
```

---

## 18.4 V0.1.1 验收标准

```text
1. ChatGPT Extractor 有稳定 fixtures。
2. 提取失败时用户能通过备用路径保存内容。
3. 队列 payload TTL 生效。
4. 敏感内容命中时有明确提示。
5. 用户能查看最近保存历史。
6. 用户能在 Web 控制台配置原文保留策略。
```

---

# Phase 3：V0.2 多平台与确认流

## 19.1 阶段目标

从“能保存”升级为“能管理记忆”，并开始支持更多 AI 平台。

---

## 19.2 功能范围

```text
1. Claude 当前对话保存
2. Gemini / Perplexity 可选支持
3. Side Panel
4. Review Inbox
5. 长期偏好确认
6. 关键决策确认
7. 增量保存
8. 项目自动识别增强
9. 候选记忆编辑
10. 半自动沉淀建议
```

---

## 19.3 Claude Extractor

功能：

```text
1. 检测 claude.ai
2. 提取当前对话
3. 处理 Claude Artifact 上下文
4. 识别 user / assistant
5. 生成 extraction_quality
```

注意事项：

```text
1. Claude Artifact 不一定要在第一版完整保存。
2. Artifact 可以先作为附件摘要或引用处理。
3. DOM 提取失败时必须降级到选中内容。
4. Claude 权限使用 optional_host_permissions，由用户启用。
```

---

## 19.4 Side Panel

功能：

```text
1. 当前对话摘要预览
2. 建议沉淀内容
3. 项目选择
4. 记忆等级调整
5. 候选记忆确认 / 忽略
6. 最近保存历史
7. Context Pack 预览
```

注意事项：

```text
1. Side Panel 不应成为 V0.1 阻塞项。
2. Side Panel 适合 V0.2 作为增强入口。
3. 需要单独申请 sidePanel 权限。
4. 保持 Popup 仍然可完成快速保存。
```

---

## 19.5 Review Inbox

功能：

```text
1. 展示待确认 L4 / L5
2. 展示低置信度候选记忆
3. 展示覆盖旧决策请求
4. 展示敏感内容命中项
5. 支持确认、编辑、忽略、降级
```

候选记忆操作：

```text
确认入库
编辑后入库
改为项目记忆
改为临时记忆
忽略
删除来源
```

注意事项：

```text
1. 不要把所有记忆都推给用户确认，否则会造成负担。
2. 只让用户确认高影响记忆。
3. Review Inbox 要支持批量处理。
```

---

## 19.6 增量保存

功能：

```text
1. 同一对话再次保存时识别新增消息
2. 只处理新增部分
3. 保留同一 SourceDocument 的版本关系
4. 更新 Context Pack
```

注意事项：

```text
1. 不能只靠 URL 判断。
2. 应结合 source_fingerprint + message_hashes。
3. 用户可以选择“覆盖上次保存”或“作为新版本保存”。
```

---

## 19.7 半自动沉淀建议

触发条件：

```text
1. 对话超过 6 轮
2. 包含“决定 / 方案 / 架构 / MVP / TODO / 下一步”等关键词
3. 出现项目名称
4. 用户停留时间较长
5. 用户频繁复制对话内容
```

提示方式：

```text
这次对话可能包含项目决策，是否沉淀到 AI Memory？

[保存]
[稍后]
[不再提示此网站]
```

注意事项：

```text
1. 半自动建议不能自动上传。
2. 必须用户点击确认。
3. 提示频率要有限制。
4. 用户必须可以关闭。
```

---

## 19.8 V0.2 验收标准

```text
1. Claude 保存闭环可用。
2. 用户可以在 Side Panel 中查看候选记忆。
3. L4 / L5 进入 Review Inbox。
4. 用户可以编辑候选记忆。
5. 同一对话重复保存时能识别增量。
6. 半自动提示可以关闭。
7. optional_host_permissions 机制正常。
```

---

# Phase 4：V0.3 开发者工作流：CLI / MCP

## 20.1 阶段目标

让保存下来的记忆重新进入开发者 AI 工作流。

---

## 20.2 功能范围

```text
1. memory CLI
2. memory search
3. memory context
4. memory decisions
5. memory tasks
6. MCP Server
7. Cursor / Claude Code / Codex 上下文接入
8. 本地开发项目绑定
```

---

## 20.3 CLI 命令设计

```bash
memory login

memory search "浏览器插件实现方案"

memory context --project "AI Memory Hub"

memory decisions --project "AI Memory Hub"

memory tasks --project "AI Memory Hub"

memory capture list

memory capture show cap_123

memory mcp start
```

---

## 20.4 MCP 工具设计

```text
search_memory(query)
get_project_context(project_name)
get_recent_decisions(project_name)
get_active_tasks(project_name)
get_user_preferences()
save_memory(content, project_name)
confirm_memory(candidate_id)
```

---

## 20.5 开发者使用场景

### 场景 1：在 Claude Code 中恢复项目上下文

```text
用户：
memory context --project "AI Memory Hub"

CLI 输出：
项目目标、近期决策、当前架构、未解决问题、下一步任务。

用户复制到 Claude Code 或通过 MCP 自动注入。
```

---

### 场景 2：Cursor 自动查询相关记忆

```text
Cursor Agent：
调用 get_project_context("AI Memory Hub")
调用 get_recent_decisions("AI Memory Hub")
调用 search_memory("Chrome extension privacy strategy")
```

---

### 场景 3：开发结束后回流

```text
开发者在 Claude Code 完成新方案
        ↓
MCP save_memory
        ↓
进入 MemoryCandidate
        ↓
Web 控制台待确认
```

---

## 20.6 注意事项

```text
1. CLI / MCP 只读能力先做，写入能力后做。
2. MCP 不应返回过长上下文。
3. Context Pack 要控制 token 长度。
4. 开发者可以选择项目默认上下文长度。
5. 所有 MCP 写入仍需遵循记忆等级确认规则。
```

---

## 20.7 V0.3 验收标准

```text
1. CLI 可以登录。
2. CLI 可以搜索记忆。
3. CLI 可以输出项目 Context Pack。
4. MCP Server 可以被 Claude Code / Cursor 调用。
5. Agent 能获取项目摘要、近期决策和待办。
6. 上下文输出长度可控。
```

---

# Phase 5：V0.4 自动化与蒸馏

## 21.1 阶段目标

从“保存和查询”升级到“长期维护记忆质量”。

---

## 21.2 功能范围

```text
1. 定期项目蒸馏
2. 记忆合并
3. 过期记忆清理
4. 冲突检测
5. 决策版本管理
6. 项目周报
7. 每日摘要
8. 自动生成下一步建议
```

---

## 21.3 定期蒸馏

功能：

```text
1. 每日 / 每周扫描项目新增 Capture
2. 合并重复记忆
3. 提炼当前项目状态
4. 标记过时内容
5. 更新 Context Pack
```

注意事项：

```text
1. 蒸馏不能无声覆盖关键决策。
2. 冲突内容需要进入 Review Inbox。
3. 旧版本需要保留可追溯关系。
```

---

## 21.4 冲突检测

示例：

```text
旧决策：
V0.1 支持 ChatGPT + Claude。

新决策：
V0.1 只支持 ChatGPT + 选中内容，Claude 延后。

系统提示：
检测到产品范围决策变化，是否覆盖旧决策？
```

---

## 21.5 项目周报

输出：

```text
本周新增：
- Capture 数量
- 新增项目记忆
- 新增关键决策
- 新增待办
- 已完成待办
- 待确认记忆
- 过期或冲突记忆
```

---

## 21.6 V0.4 验收标准

```text
1. 每个项目可生成最新 Context Pack。
2. 重复记忆可自动合并。
3. 冲突决策可进入待确认。
4. 过期记忆可标记或清理。
5. 用户可以查看项目周报。
```

---

# Phase 6：V1.0 完整 AI Memory Platform

## 22.1 阶段目标

形成完整的跨平台 AI 记忆基础设施。

---

## 22.2 功能范围

```text
1. 多 AI 平台稳定采集
2. Web 控制台完整项目空间
3. CLI / MCP 深度集成
4. Context Pack 自动注入
5. 团队 Workspace
6. 权限管理
7. 端到端加密选项
8. 连接器市场
9. 导入 / 导出
10. 记忆审计
11. 数据保留策略
12. 多设备同步
```

---

## 22.3 多平台支持优先级

建议顺序：

```text
1. ChatGPT
2. Claude
3. Gemini
4. Perplexity
5. DeepSeek
6. Kimi
7. 豆包
8. 通义
9. 通用网页
10. 用户手动粘贴
```

---

## 22.4 团队 Workspace

功能：

```text
1. 团队项目空间
2. 成员权限
3. 团队共享决策
4. 个人记忆和团队记忆隔离
5. 审批流
6. 组织级数据保留策略
```

注意事项：

```text
1. 团队功能必须晚于个人版成熟后再做。
2. 个人记忆和团队记忆必须严格隔离。
3. 团队管理员不应默认看到个人私密记忆。
```

---

## 22.5 端到端加密选项

高级用户可启用：

```text
1. 本地加密后上传
2. 云端只保存密文
3. 搜索能力受限
4. Context Pack 在本地解密后生成
```

注意事项：

```text
1. E2EE 会影响云端摘要和向量搜索。
2. 可以作为高级隐私模式，不作为 V0.1 默认能力。
3. 用户必须理解密钥丢失后无法恢复。
```

---

## 22.6 V1.0 验收标准

```text
1. 支持至少 4 个主流 AI Web 平台。
2. 插件月保存成功率 ≥ 98%。
3. 用户可以完整管理项目记忆。
4. CLI / MCP 成为稳定开发者入口。
5. Context Pack 能显著减少用户重复解释项目背景。
6. 隐私、权限、删除、导出能力完整。
7. 可进入 Chrome Web Store 正式发布和商业化。
```

---

## 23. 实施优先级总表

| 优先级 | 功能 | 阶段 | 必要性 |
|---|---|---|---|
| P0 | ChatGPT 对话保存 | V0.1 | 核心闭环 |
| P0 | 选中内容保存 | V0.1 | 稳定通用入口 |
| P0 | Popup 保存预览 | V0.1 | 用户信任 |
| P0 | POST /v1/captures | V0.1 | 云端入口 |
| P0 | 摘要生成 | V0.1 | 即时价值 |
| P0 | Context Pack 复制 | V0.1 | 复用价值 |
| P0 | 本地失败队列 | V0.1 | 基础可靠性 |
| P0 | 删除 Capture | V0.1 | 信任与合规 |
| P1 | Extractor fixtures | V0.1.1 | 稳定性 |
| P1 | 敏感内容提示 | V0.1.1 | 隐私 |
| P1 | 保存历史 | V0.1.1 | 可控性 |
| P1 | Claude 支持 | V0.2 | 多平台 |
| P1 | Review Inbox | V0.2 | 记忆质量 |
| P1 | Side Panel | V0.2 | 深度管理 |
| P2 | 半自动建议 | V0.2 | 增强体验 |
| P2 | CLI | V0.3 | 开发者工作流 |
| P2 | MCP | V0.3 | Agent 集成 |
| P3 | 定期蒸馏 | V0.4 | 长期质量 |
| P3 | 团队 Workspace | V1.0 | 商业化 |
| P3 | E2EE | V1.0 | 高级隐私 |

---

## 24. 指标体系

### 24.1 V0.1 产品指标

```text
Activation：
- 安装后完成登录比例
- 首次保存完成率
- 首次保存耗时

Capture：
- 保存次数
- 保存成功率
- 上传失败率
- 平均消息数
- 平均 payload 大小

Value：
- Context Pack 复制率
- Web 控制台查看率
- 候选记忆确认率
- Capture 删除率

Trust：
- 敏感提示出现率
- 用户选择只保存摘要比例
- 用户主动删除原文比例
```

---

### 24.2 V0.2 指标

```text
Review：
- 待确认记忆数量
- 确认率
- 忽略率
- 编辑率
- L4 / L5 误判反馈

Platform：
- ChatGPT 保存成功率
- Claude 保存成功率
- Extractor 失败率
- 降级路径使用率
```

---

### 24.3 V0.3 指标

```text
Developer Workflow：
- CLI 登录数
- memory context 使用次数
- MCP 调用次数
- Cursor / Claude Code 集成使用率
- Context Pack 平均 token 长度
```

---

## 25. 风险与应对

### 25.1 DOM 结构变化风险

风险：

```text
ChatGPT / Claude 页面结构变化导致 Extractor 失败。
```

应对：

```text
1. 多策略提取。
2. extraction_quality 评分。
3. fixtures 回归测试。
4. 降级到选中内容和手动粘贴。
5. 快速发布 extractor 修复版本。
```

---

### 25.2 隐私信任风险

风险：

```text
用户担心插件偷偷保存对话。
```

应对：

```text
1. 默认手动保存。
2. 保存前预览。
3. 明确展示保存范围。
4. 默认只保存摘要。
5. 支持删除和原文保留策略。
6. 不申请高敏权限。
```

---

### 25.3 Chrome Web Store 审核风险

风险：

```text
权限过大、数据用途不清、隐私政策不一致导致审核受阻。
```

应对：

```text
1. 不使用 <all_urls>。
2. host_permissions 最小化。
3. 使用 optional_host_permissions。
4. 商店页、插件 UI、隐私政策统一描述。
5. 明确说明浏览活动仅用于用户主动保存功能。
```

---

### 25.4 本地数据泄露风险

风险：

```text
失败队列中保存了完整 AI 对话。
```

应对：

```text
1. payload 存 IndexedDB 并设置 TTL。
2. 上传成功后立即删除。
3. 本地 metadata 不含正文。
4. token 不写日志。
5. 用户退出登录后清除敏感缓存。
```

---

### 25.5 AI 误判记忆风险

风险：

```text
AI 把临时信息误判为长期偏好或关键决策。
```

应对：

```text
1. L4 / L5 必须用户确认。
2. 低置信度进入 Review Inbox。
3. 支持编辑、忽略、降级。
4. 保存来源和理由。
5. 决策保留版本。
```

---

## 26. 发布检查清单

### 26.1 V0.1 开发完成检查

```text
[ ] ChatGPT Extractor 可用
[ ] 选中内容保存可用
[ ] Popup 保存预览可用
[ ] 保存方式选择可用
[ ] 项目选择可用
[ ] 本地队列可用
[ ] 上传 API 可用
[ ] 云端摘要可用
[ ] 候选记忆生成可用
[ ] Context Pack 可复制
[ ] Capture 可删除
[ ] 登录流程可用
[ ] token 不写入日志
[ ] 敏感内容提示基础版可用
[ ] 不申请 cookies / history / <all_urls>
```

---

### 26.2 隐私与合规检查

```text
[ ] 插件 UI 说明保存范围
[ ] 插件 UI 说明不会保存什么
[ ] 隐私政策说明数据用途
[ ] Chrome Web Store 页面说明核心功能
[ ] 三处文案一致
[ ] 支持删除数据
[ ] 支持退出登录
[ ] 支持撤销插件授权
[ ] 默认不长期保留全文
[ ] 错误上报不含原文
```

---

### 26.3 技术质量检查

```text
[ ] TypeScript 严格模式
[ ] Extractor 单元测试
[ ] API 幂等测试
[ ] 队列重试测试
[ ] 断网恢复测试
[ ] 大 payload 测试
[ ] token 过期测试
[ ] 删除数据测试
[ ] 浏览器权限检查
[ ] 最小 manifest 权限检查
```

---

## 27. 推荐开发顺序

实际开发时建议按下面顺序推进。

```text
第 1 步：搭建插件工程
- WXT / Plasmo / Vite + React
- Manifest V3
- Popup 空界面
- Service Worker
- Content Script 注入

第 2 步：实现 ChatGPT 页面检测
- platform-detector
- content script 通信
- console 输出当前页面信息

第 3 步：实现 ChatGPT Extractor
- 提取 messages
- 识别 role
- 清洗文本
- 生成 extraction_quality
- 生成 hash

第 4 步：实现 Popup 预览
- 消息数量
- 字数估算
- 保存范围
- 项目选择
- 保存方式

第 5 步：实现云端 POST /v1/captures
- 鉴权
- 幂等
- 保存 Capture
- 保存 SourceDocument
- 返回 queued

第 6 步：打通上传
- 插件调用 API
- 本地队列
- 上传成功状态
- 上传失败重试

第 7 步：实现云端摘要和候选记忆
- summary
- project_guess
- memory_candidates
- action_items
- decisions

第 8 步：实现 Web 控制台
- Capture 列表
- Capture 详情
- 摘要
- 候选记忆
- Context Pack

第 9 步：实现选中内容保存
- contextMenus
- activeTab
- selection text
- 复用保存流程

第 10 步：完善隐私和稳定性
- 敏感提示
- 原文保留策略
- 删除 Capture
- Extractor fixtures
- 错误降级
```

---

## 28. V0.1 最小可发布版本定义

### 28.1 必须具备

```text
1. 用户能登录。
2. 用户能在 ChatGPT 保存当前对话。
3. 用户能在网页保存选中内容。
4. 保存前能看到预览和隐私提示。
5. 云端能生成摘要。
6. 云端能生成候选记忆。
7. 用户能在 Web 控制台查看结果。
8. 用户能复制 Context Pack。
9. 用户能删除 Capture。
10. 插件权限最小化。
```

---

### 28.2 可以简化

```text
1. 项目自动识别可以不准，但必须可编辑。
2. 记忆等级可以先粗略，但 L4 / L5 必须确认。
3. Context Pack 可以先用模板生成。
4. Web 控制台 UI 可以非常简单。
5. 本地队列可以先支持基础重试。
```

---

### 28.3 不能妥协

```text
1. 不能默认后台自动保存。
2. 不能偷偷读取所有网页。
3. 不能申请不必要的高敏权限。
4. 不能在日志里写入对话原文。
5. 不能把完整原文长期留在本地。
6. 不能把长期偏好和关键决策自动入库。
7. 不能让用户不知道保存了什么。
```

---

## 29. 最终产品路线总结

```text
Phase 0：
产品和技术准备，明确边界、权限、数据模型、API、隐私策略。

V0.1：
ChatGPT + 选中内容 + Popup + 云端摘要 + Context Pack，验证核心闭环。

V0.1.1：
强化稳定性、隐私、Extractor 测试、失败降级、本地队列和保存历史。

V0.2：
增加 Claude、Side Panel、Review Inbox、长期记忆确认、关键决策确认和增量保存。

V0.3：
接入 CLI / MCP，让记忆重新进入 Claude Code、Cursor、Codex 等开发者工作流。

V0.4：
做定期蒸馏、冲突检测、项目周报和长期记忆维护。

V1.0：
形成完整 AI Memory Platform，支持多平台采集、项目空间、团队协作、连接器、数据治理和高级隐私模式。
```

---

## 30. 最终结论

AI Memory Capture 的第一阶段目标不是做一个庞大的知识库，而是验证一个非常清晰的闭环：

```text
用户主动保存 AI 对话
        ↓
系统自动整理为摘要、记忆、决策和任务
        ↓
用户能马上复制 Context Pack 复用
        ↓
后续通过 CLI / MCP 进入新的 AI 工作流
```

第一版必须克制。

最推荐的 V0.1 范围是：

```text
ChatGPT 当前对话保存
通用网页选中内容保存
保存前预览
默认只保存摘要 + 结构化记忆
云端生成摘要和候选记忆
Web 控制台查看
Context Pack 复制
删除 Capture
```

只要这个闭环成立，后续 Claude、Side Panel、MCP、定期蒸馏、团队空间都会自然成立。

最终产品的核心不是“把内容存进去”，而是：

> 把一次次 AI 对话，持续转化成下次 AI 能直接使用的上下文资产。
