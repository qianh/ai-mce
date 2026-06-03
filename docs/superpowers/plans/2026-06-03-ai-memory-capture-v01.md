# AI Memory Capture Extension V0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome Extension (MV3) that lets users one-click save ChatGPT conversations to a local SQLite database, generate AI summaries via their own Claude API key, and copy a Context Pack for their next AI session — zero cloud dependency, full privacy.

**Architecture:** Extension uses WXT + React + TypeScript. All data lives in a wa-sqlite database stored in OPFS (Origin Private File System) inside a Dedicated DB Worker, communicated with via a typed message bridge from the Service Worker. The options_page Console reads the same SQLite directly (same origin = direct OPFS access). Claude API calls originate from the Background Service Worker using the user's own API key stored locally.

**Tech Stack:** WXT 0.20+, React 18, TypeScript 5 (strict), wa-sqlite (OPFS async VFS), Anthropic SDK (browser-compatible fetch), Vitest, Tailwind (design tokens via CSS variables from `design/tokens.css`)

---

## File Map

```
extension/
├── package.json
├── wxt.config.ts
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── entrypoints/
│   │   ├── background.ts          # Service Worker — message router
│   │   ├── popup.html
│   │   ├── popup/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx            # Popup state machine (5 screens)
│   │   │   └── screens/
│   │   │       ├── SaveScreen.tsx
│   │   │       ├── DegradedScreen.tsx
│   │   │       ├── SensitiveScreen.tsx
│   │   │       ├── SuccessScreen.tsx
│   │   │       └── FailScreen.tsx
│   │   ├── options.html
│   │   ├── options/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx            # React Router shell
│   │   │   └── pages/
│   │   │       ├── CaptureList.tsx
│   │   │       ├── CaptureDetail.tsx
│   │   │       ├── ReviewInbox.tsx
│   │   │       ├── ContextPackPage.tsx
│   │   │       └── Settings.tsx
│   │   └── content/
│   │       └── chatgpt.ts         # Content script for chatgpt.com
│   ├── lib/
│   │   ├── types.ts               # All shared TypeScript types
│   │   ├── hash.ts                # SHA-256 content_hash
│   │   ├── sensitive.ts           # Sensitive content detector
│   │   ├── context-pack.ts        # Context Pack Markdown builder
│   │   ├── claude-api.ts          # Claude API client (summary + memory extraction)
│   │   └── extractors/
│   │       ├── base.ts            # ConversationExtractor interface
│   │       ├── chatgpt.ts         # ChatGPT DOM extractor
│   │       └── generic.ts         # Selection fallback extractor
│   ├── db/
│   │   ├── worker.ts              # Dedicated DB Worker (runs wa-sqlite + OPFS)
│   │   ├── bridge.ts              # Type-safe message bridge (SW ↔ DB Worker)
│   │   ├── schema.sql             # SQLite schema (CREATE TABLE statements)
│   │   ├── migrations.ts          # Schema version management
│   │   └── repos/
│   │       ├── captures.ts        # CaptureRepo
│   │       ├── memories.ts        # MemoryCandidateRepo
│   │       ├── settings.ts        # SettingsRepo
│   │       └── context-packs.ts   # ContextPackRepo
│   └── assets/
│       └── tokens.css             # copied from design/tokens.css
├── fixtures/
│   ├── chatgpt-normal.html
│   ├── chatgpt-with-code.html
│   └── chatgpt-long.html
└── tests/
    ├── extractors/
    │   └── chatgpt.test.ts
    ├── lib/
    │   ├── sensitive.test.ts
    │   ├── hash.test.ts
    │   └── context-pack.test.ts
    └── db/
        └── repos.test.ts
```

---

### Task 1: WXT Project Scaffold

**Files:**
- Create: `extension/package.json`
- Create: `extension/wxt.config.ts`
- Create: `extension/tsconfig.json`
- Create: `extension/vitest.config.ts`

- [ ] **Step 1: Initialize WXT project non-interactively**

```bash
cd /Users/hong/John/ai/ai-mce
mkdir extension && cd extension
bun init -y
```

- [ ] **Step 2: Install dependencies**

```bash
bun add wxt react react-dom react-router-dom wa-sqlite @anthropic-ai/sdk
bun add -d @types/react @types/react-dom typescript vitest @vitejs/plugin-react jsdom
```

- [ ] **Step 3: Write `wxt.config.ts`**

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'AI Memory Capture',
    version: '0.1.0',
    description: 'Save AI conversations to your local memory — fully private.',
    permissions: [
      'storage',
      'activeTab',
      'scripting',
      'contextMenus',
      'unlimitedStorage',
      'downloads',
    ],
    host_permissions: ['https://chatgpt.com/*'],
    action: { default_popup: 'popup.html', default_title: 'Save to AI Memory' },
    options_page: 'options.html',
    content_scripts: [
      { matches: ['https://chatgpt.com/*'], js: ['content-scripts/chatgpt.js'], run_at: 'document_idle' },
    ],
  },
});
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "jsx": "react-jsx"
  }
}
```

- [ ] **Step 5: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
```

- [ ] **Step 6: Create `tests/setup.ts`**

```typescript
// Mock chrome APIs not available in jsdom
(globalThis as any).chrome = {
  runtime: { sendMessage: vi.fn(), onMessage: { addListener: vi.fn() } },
  storage: { local: { get: vi.fn(), set: vi.fn() } },
};
```

- [ ] **Step 7: Copy design tokens**

```bash
cp /Users/hong/John/ai/ai-mce/design/tokens.css src/assets/tokens.css
```

- [ ] **Step 8: Verify scaffold builds**

```bash
bun run wxt build 2>&1 | tail -5
```
Expected: Build succeeds (warnings OK, errors not OK)

- [ ] **Step 9: Commit**

```bash
cd /Users/hong/John/ai/ai-mce
git add extension/
git commit -m "chore: scaffold WXT Chrome Extension project"
```

---

### Task 2: Shared TypeScript Types

**Files:**
- Create: `extension/src/lib/types.ts`

- [ ] **Step 1: Write `types.ts`**

```typescript
// ─── Extractor ───────────────────────────────────────────────────────────────

export type ExtractionMethod =
  | 'dom_attr' | 'testid' | 'article' | 'large_text_blocks'
  | 'selection' | 'manual_paste';

export interface ExtractionQuality {
  confidence: number;        // 0–1
  method: ExtractionMethod;
  warnings: string[];
  message_count: number;
  empty_message_count: number;
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'unknown';

export interface ExtractedMessage {
  role: MessageRole;
  content: string;
  index: number;
  timestamp?: string;
  message_hash?: string;
}

export interface ExtractedConversation {
  schema_version: string;
  extractor_version: string;
  source: {
    platform: 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'generic_web';
    url: string;
    browser_title: string;
    captured_at: string;
    locale?: string;
  };
  content: {
    title: string;
    messages: ExtractedMessage[];
  };
  extraction_quality: ExtractionQuality;
  hashes: {
    content_hash: string;
    message_hashes: string[];
    source_fingerprint: string;
  };
  metadata?: {
    conversation_id?: string;
    model_name?: string;
    language?: string;
  };
}

// ─── Sensitive Detection ──────────────────────────────────────────────────────

export type SensitiveType = 'api_key' | 'token' | 'password' | 'email' | 'phone' | 'id_number';

export interface SensitiveMatch {
  type: SensitiveType;
  masked: string;       // e.g. "sk-••••••3f2a"
  message_index: number;
}

export interface SensitiveResult {
  has_sensitive: boolean;
  matches: SensitiveMatch[];
}

// ─── Memory Level ─────────────────────────────────────────────────────────────

export type MemoryLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export interface MemoryCandidate {
  content: string;
  level: MemoryLevel;
  confidence: number;
  reason: string;
  requires_confirmation: boolean;
  ttl_days?: number;
  source_message_indexes: number[];
}

// ─── DB Entities ──────────────────────────────────────────────────────────────

export type CaptureStatus = 'pending_ai' | 'processed' | 'ai_failed';
export type CandidateStatus = 'pending' | 'confirmed' | 'ignored' | 'degraded';

export interface Capture {
  id: string;
  source_platform: string;
  source_url: string;
  source_title: string;
  content_hash: string;
  extraction_quality: ExtractionQuality;
  status: CaptureStatus;
  created_at: string;
}

export interface SourceDocument {
  id: string;
  capture_id: string;
  title: string;
  normalized_text: string | null;
  summary: string | null;
  message_count: number;
  language: string | null;
  created_at: string;
}

export interface MemoryCandidateRow {
  id: string;
  capture_id: string;
  content: string;
  level: MemoryLevel;
  confidence: number;
  reason: string;
  status: CandidateStatus;
  source_message_indexes: string; // JSON array
  confirmed_at: string | null;
  created_at: string;
}

export interface ContextPack {
  id: string;
  capture_id: string;
  project_name: string;
  content_markdown: string;
  created_at: string;
}

export interface Settings {
  claude_api_key: string | null;
  default_save_mode: 'summary_and_memory' | 'full_text' | 'notes_only';
  raw_text_retention: 'delete_after_processing' | '7_days' | '30_days' | 'forever';
  schema_version: number;
}

// ─── Message Bridge ───────────────────────────────────────────────────────────

export interface SaveRequest {
  type: 'SAVE_REQUEST';
  conversation: ExtractedConversation;
  save_mode: Settings['default_save_mode'];
  user_note?: string;
}

export type ProgressStep =
  | { step: 'writing_local'; status: 'done' }
  | { step: 'generating_summary'; status: 'running' | 'done' | 'failed' }
  | { step: 'extracting_memories'; status: 'running' | 'done' | 'failed' }
  | { step: 'building_context_pack'; status: 'running' | 'done' | 'failed' };

export interface ProgressUpdate {
  type: 'PROGRESS_UPDATE';
  capture_id: string;
  step: ProgressStep;
  result?: { memory_count?: number; context_pack_id?: string };
}

export interface SaveResult {
  type: 'SAVE_RESULT';
  success: boolean;
  capture_id?: string;
  error?: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd extension && bunx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add extension/src/lib/types.ts
git commit -m "feat: add shared TypeScript types for extension"
```

---

### Task 3: SHA-256 Hash Utility

**Files:**
- Create: `extension/src/lib/hash.ts`
- Create: `extension/tests/lib/hash.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/lib/hash.test.ts
import { describe, it, expect } from 'vitest';
import { contentHash, normalizeForHash } from '../../src/lib/hash';

describe('normalizeForHash', () => {
  it('trims whitespace and collapses blank lines', () => {
    const input = '  hello\n\n\n  world  ';
    expect(normalizeForHash(input)).toBe('hello\nworld');
  });

  it('strips common ChatGPT UI copy', () => {
    const input = 'Some content\nCopy code\nRegenerate\nMore content';
    expect(normalizeForHash(input)).toBe('Some content\nMore content');
  });
});

describe('contentHash', () => {
  it('returns a 64-char hex string', async () => {
    const hash = await contentHash('hello world');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same input produces same hash', async () => {
    const a = await contentHash('test');
    const b = await contentHash('test');
    expect(a).toBe(b);
  });

  it('different input produces different hash', async () => {
    const a = await contentHash('test1');
    const b = await contentHash('test2');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd extension && bunx vitest run tests/lib/hash.test.ts
```
Expected: FAIL — "Cannot find module '../../src/lib/hash'"

- [ ] **Step 3: Implement `hash.ts`**

```typescript
// src/lib/hash.ts

const UI_COPY_PATTERNS = [
  /^Copy code$/m,
  /^Regenerate$/m,
  /^Copy$/m,
  /^Share$/m,
  /^Edit message$/m,
  /^\d+ \/ \d+$/m, // pagination like "1 / 3"
];

export function normalizeForHash(text: string): string {
  let normalized = text.trim();
  for (const pattern of UI_COPY_PATTERNS) {
    normalized = normalized.replace(pattern, '');
  }
  // collapse 3+ blank lines to single blank, then trim each line
  normalized = normalized
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized;
}

export async function contentHash(text: string): Promise<string> {
  const normalized = normalizeForHash(text);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function messageHash(role: string, content: string, index: number): Promise<string> {
  return contentHash(`${role}:${index}:${content}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bunx vitest run tests/lib/hash.test.ts
```
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add extension/src/lib/hash.ts extension/tests/lib/hash.test.ts
git commit -m "feat: add SHA-256 content hash utility with normalization"
```

---

### Task 4: Sensitive Content Detector

**Files:**
- Create: `extension/src/lib/sensitive.ts`
- Create: `extension/tests/lib/sensitive.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/lib/sensitive.test.ts
import { describe, it, expect } from 'vitest';
import { detectSensitive } from '../../src/lib/sensitive';

describe('detectSensitive', () => {
  it('detects OpenAI API keys', () => {
    const result = detectSensitive([{ role: 'user', content: 'my key is sk-abc123def456', index: 0 }]);
    expect(result.has_sensitive).toBe(true);
    expect(result.matches[0].type).toBe('api_key');
    expect(result.matches[0].masked).toContain('sk-');
    expect(result.matches[0].masked).toContain('••••');
  });

  it('detects AWS access keys', () => {
    const result = detectSensitive([{ role: 'user', content: 'AKIAIOSFODNN7EXAMPLE', index: 0 }]);
    expect(result.has_sensitive).toBe(true);
    expect(result.matches[0].type).toBe('api_key');
  });

  it('detects Bearer tokens', () => {
    const result = detectSensitive([{ role: 'assistant', content: 'Bearer eyJhbGciOiJIUzI1NiJ9', index: 1 }]);
    expect(result.has_sensitive).toBe(true);
    expect(result.matches[0].message_index).toBe(1);
  });

  it('returns no matches for clean text', () => {
    const result = detectSensitive([{ role: 'user', content: 'What is the weather today?', index: 0 }]);
    expect(result.has_sensitive).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it('scans multiple messages', () => {
    const result = detectSensitive([
      { role: 'user', content: 'normal text', index: 0 },
      { role: 'user', content: 'sk-secret123', index: 1 },
      { role: 'assistant', content: 'also normal', index: 2 },
    ]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].message_index).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx vitest run tests/lib/sensitive.test.ts
```
Expected: FAIL — "Cannot find module '../../src/lib/sensitive'"

- [ ] **Step 3: Implement `sensitive.ts`**

```typescript
// src/lib/sensitive.ts
import type { SensitiveMatch, SensitiveResult, SensitiveType } from './types';

interface Pattern { type: SensitiveType; regex: RegExp; mask: (m: string) => string }

const PATTERNS: Pattern[] = [
  {
    type: 'api_key',
    regex: /sk-[A-Za-z0-9]{8,}/g,
    mask: (m) => m.slice(0, 3) + '••••' + m.slice(-4),
  },
  {
    type: 'api_key',
    regex: /AKIA[0-9A-Z]{12,}/g,
    mask: (m) => m.slice(0, 4) + '••••' + m.slice(-4),
  },
  {
    type: 'token',
    regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    mask: (m) => 'Bearer ••••',
  },
  {
    type: 'token',
    regex: /eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}/g,
    mask: (m) => 'eyJ••••',
  },
  {
    type: 'password',
    regex: /(?:password|passwd|pwd)\s*[:=]\s*\S{6,}/gi,
    mask: (m) => m.replace(/[:=]\s*\S+/, ': ••••'),
  },
  {
    type: 'email',
    regex: /[a-zA-Z0-9._%+\-]{2,}@[a-zA-Z0-9.\-]{2,}\.[a-zA-Z]{2,}/g,
    mask: (m) => { const [u, d] = m.split('@'); return u[0] + '••••@' + d; },
  },
];

export function detectSensitive(
  messages: Array<{ role: string; content: string; index: number }>
): SensitiveResult {
  const matches: SensitiveMatch[] = [];

  for (const msg of messages) {
    for (const p of PATTERNS) {
      const found = [...msg.content.matchAll(p.regex)];
      for (const match of found) {
        matches.push({
          type: p.type,
          masked: p.mask(match[0]),
          message_index: msg.index,
        });
      }
    }
  }

  return { has_sensitive: matches.length > 0, matches };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bunx vitest run tests/lib/sensitive.test.ts
```
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add extension/src/lib/sensitive.ts extension/tests/lib/sensitive.test.ts
git commit -m "feat: add sensitive content detector (API keys, tokens, emails)"
```

---

### Task 5: ChatGPT Extractor

**Files:**
- Create: `extension/src/lib/extractors/base.ts`
- Create: `extension/src/lib/extractors/chatgpt.ts`
- Create: `extension/src/lib/extractors/generic.ts`
- Create: `extension/fixtures/chatgpt-normal.html`
- Create: `extension/fixtures/chatgpt-with-code.html`
- Create: `extension/tests/extractors/chatgpt.test.ts`

- [ ] **Step 1: Write `base.ts` interface**

```typescript
// src/lib/extractors/base.ts
import type { ExtractedConversation, ExtractionQuality } from '../types';

export interface ConversationExtractor {
  platform: string;
  canHandle(url: string, document: Document): boolean;
  extract(document: Document, url: string): Promise<ExtractedConversation>;
}

export const EXTRACTOR_VERSION = '0.1.0';
export const SCHEMA_VERSION = '2026-06-03.v1';
```

- [ ] **Step 2: Create ChatGPT fixture HTML**

```bash
cat > extension/fixtures/chatgpt-normal.html << 'EOF'
<!DOCTYPE html>
<html>
<body>
  <div data-testid="conversation-turn-0">
    <div data-message-author-role="user">
      <div class="markdown">
        <p>请仔细审阅该方案，看是否需要优化</p>
      </div>
    </div>
  </div>
  <div data-testid="conversation-turn-1">
    <div data-message-author-role="assistant">
      <div class="markdown">
        <p>这是一个很好的方案，建议优化以下几点：</p>
        <ul><li>第一点</li><li>第二点</li></ul>
      </div>
    </div>
  </div>
  <div data-testid="conversation-turn-2">
    <div data-message-author-role="user">
      <div class="markdown"><p>好的，谢谢建议</p></div>
    </div>
  </div>
</body>
</html>
EOF
```

- [ ] **Step 3: Write failing extractor test**

```typescript
// tests/extractors/chatgpt.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ChatGPTExtractor } from '../../src/lib/extractors/chatgpt';

function loadFixture(name: string): Document {
  const html = readFileSync(resolve(__dirname, '../../fixtures', name), 'utf-8');
  return new JSDOM(html).window.document;
}

describe('ChatGPTExtractor', () => {
  const extractor = new ChatGPTExtractor();
  const normalDoc = loadFixture('chatgpt-normal.html');

  it('canHandle chatgpt.com URLs', () => {
    expect(extractor.canHandle('https://chatgpt.com/c/abc', normalDoc)).toBe(true);
    expect(extractor.canHandle('https://claude.ai/c/abc', normalDoc)).toBe(false);
  });

  it('extracts 3 messages from normal conversation', async () => {
    const result = await extractor.extract(normalDoc, 'https://chatgpt.com/c/test');
    expect(result.content.messages).toHaveLength(3);
  });

  it('correctly identifies user and assistant roles', async () => {
    const result = await extractor.extract(normalDoc, 'https://chatgpt.com/c/test');
    expect(result.content.messages[0].role).toBe('user');
    expect(result.content.messages[1].role).toBe('assistant');
    expect(result.content.messages[2].role).toBe('user');
  });

  it('produces a valid content_hash', async () => {
    const result = await extractor.extract(normalDoc, 'https://chatgpt.com/c/test');
    expect(result.hashes.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sets confidence >= 0.8 for complete extraction', async () => {
    const result = await extractor.extract(normalDoc, 'https://chatgpt.com/c/test');
    expect(result.extraction_quality.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('sets confidence < 0.6 when only 1 message found', async () => {
    const sparse = new JSDOM(`
      <html><body>
        <div data-message-author-role="user"><div class="markdown"><p>hi</p></div></div>
      </body></html>
    `).window.document;
    const result = await extractor.extract(sparse, 'https://chatgpt.com/c/test');
    expect(result.extraction_quality.confidence).toBeLessThan(0.6);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
bunx vitest run tests/extractors/chatgpt.test.ts
```
Expected: FAIL — "Cannot find module '../../src/lib/extractors/chatgpt'"

- [ ] **Step 5: Implement `chatgpt.ts` extractor**

```typescript
// src/lib/extractors/chatgpt.ts
import type { ConversationExtractor } from './base';
import type { ExtractedConversation, ExtractedMessage, MessageRole } from '../types';
import { EXTRACTOR_VERSION, SCHEMA_VERSION } from './base';
import { contentHash, messageHash } from '../hash';

export class ChatGPTExtractor implements ConversationExtractor {
  platform = 'chatgpt' as const;

  canHandle(url: string, _document: Document): boolean {
    return url.includes('chatgpt.com');
  }

  async extract(document: Document, url: string): Promise<ExtractedConversation> {
    const messages = await this.extractMessages(document);
    const allText = messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
    const hash = await contentHash(allText);
    const msgHashes = await Promise.all(
      messages.map((m) => messageHash(m.role, m.content, m.index))
    );

    const confidence = this.calcConfidence(messages, document);

    return {
      schema_version: SCHEMA_VERSION,
      extractor_version: EXTRACTOR_VERSION,
      source: {
        platform: 'chatgpt',
        url,
        browser_title: document.title || 'ChatGPT',
        captured_at: new Date().toISOString(),
        locale: document.documentElement.lang || undefined,
      },
      content: {
        title: document.title || 'ChatGPT 对话',
        messages,
      },
      extraction_quality: {
        confidence,
        method: messages.length > 0 ? 'dom_attr' : 'article',
        warnings: messages.length < 2 ? ['few_messages_detected'] : [],
        message_count: messages.length,
        empty_message_count: messages.filter((m) => !m.content.trim()).length,
      },
      hashes: {
        content_hash: hash,
        message_hashes: msgHashes,
        source_fingerprint: `chatgpt:${url}`,
      },
    };
  }

  private async extractMessages(document: Document): Promise<ExtractedMessage[]> {
    const messages: ExtractedMessage[] = [];

    // Strategy 1: data-message-author-role attribute (most reliable)
    const roleNodes = document.querySelectorAll('[data-message-author-role]');
    if (roleNodes.length > 0) {
      for (let i = 0; i < roleNodes.length; i++) {
        const node = roleNodes[i];
        const role = node.getAttribute('data-message-author-role') as MessageRole;
        const content = this.extractText(node);
        if (content.trim()) {
          messages.push({ role, content, index: i });
        }
      }
      return messages;
    }

    // Strategy 2: data-testid="conversation-turn-N" with child role divs
    const turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const roleNode = turn.querySelector('[data-message-author-role]');
      if (roleNode) {
        const role = roleNode.getAttribute('data-message-author-role') as MessageRole;
        const content = this.extractText(roleNode);
        if (content.trim()) {
          messages.push({ role, content, index: i });
        }
      }
    }
    if (messages.length > 0) return messages;

    // Strategy 3: article tags
    const articles = document.querySelectorAll('article');
    for (let i = 0; i < articles.length; i++) {
      const content = this.extractText(articles[i]);
      if (content.trim()) {
        messages.push({ role: 'unknown', content, index: i });
      }
    }
    return messages;
  }

  private extractText(node: Element): string {
    // Remove UI copy buttons (Copy, Regenerate, etc.) from text
    const clone = node.cloneNode(true) as Element;
    clone.querySelectorAll('[data-testid="copy-turn-action-button"], button').forEach((el) => el.remove());
    return (clone.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  private calcConfidence(messages: ExtractedMessage[], _document: Document): number {
    if (messages.length === 0) return 0.1;
    if (messages.length === 1) return 0.45;
    const hasRoles = messages.some((m) => m.role !== 'unknown');
    const base = hasRoles ? 0.85 : 0.65;
    const emptyRatio = messages.filter((m) => !m.content.trim()).length / messages.length;
    return Math.max(0.1, base - emptyRatio * 0.3);
  }
}

export const chatgptExtractor = new ChatGPTExtractor();
```

- [ ] **Step 6: Implement `generic.ts` (Selection fallback)**

```typescript
// src/lib/extractors/generic.ts
import type { ConversationExtractor } from './base';
import type { ExtractedConversation } from '../types';
import { EXTRACTOR_VERSION, SCHEMA_VERSION } from './base';
import { contentHash } from '../hash';

export class GenericSelectionExtractor implements ConversationExtractor {
  platform = 'generic_web' as const;

  canHandle(_url: string, _document: Document): boolean {
    return true; // fallback for any page
  }

  async extract(document: Document, url: string): Promise<ExtractedConversation> {
    const selection = (document as any)._selectionText || '';
    const hash = await contentHash(selection);

    return {
      schema_version: SCHEMA_VERSION,
      extractor_version: EXTRACTOR_VERSION,
      source: {
        platform: 'generic_web',
        url,
        browser_title: document.title,
        captured_at: new Date().toISOString(),
      },
      content: {
        title: document.title || 'Selected Content',
        messages: [{ role: 'unknown', content: selection, index: 0 }],
      },
      extraction_quality: {
        confidence: selection.length > 50 ? 0.75 : 0.45,
        method: 'selection',
        warnings: selection.length === 0 ? ['empty_selection'] : [],
        message_count: 1,
        empty_message_count: selection.trim().length === 0 ? 1 : 0,
      },
      hashes: {
        content_hash: hash,
        message_hashes: [hash],
        source_fingerprint: `generic:${url}`,
      },
    };
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
bunx vitest run tests/extractors/chatgpt.test.ts
```
Expected: PASS (all 6 tests)

- [ ] **Step 8: Commit**

```bash
git add extension/src/lib/extractors/ extension/fixtures/ extension/tests/extractors/
git commit -m "feat: ChatGPT DOM extractor with 3-strategy fallback and quality scoring"
```

---

### Task 6: SQLite DB Worker & Bridge

**Files:**
- Create: `extension/src/db/schema.sql`
- Create: `extension/src/db/worker.ts`
- Create: `extension/src/db/bridge.ts`
- Create: `extension/src/db/migrations.ts`

- [ ] **Step 1: Write `schema.sql`**

```sql
-- extension/src/db/schema.sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS captures (
  id TEXT PRIMARY KEY,
  source_platform TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  extraction_quality TEXT NOT NULL,  -- JSON
  status TEXT NOT NULL DEFAULT 'pending_ai',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  normalized_text TEXT,
  summary TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_candidates (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  level TEXT NOT NULL,
  confidence REAL NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source_message_indexes TEXT NOT NULL DEFAULT '[]',  -- JSON
  confirmed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL,
  candidate_id TEXT REFERENCES memory_candidates(id),
  content TEXT NOT NULL,
  level TEXT NOT NULL,
  confirmed_by_user INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS context_packs (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_candidates_status ON memory_candidates(status);
CREATE INDEX IF NOT EXISTS idx_memory_candidates_capture ON memory_candidates(capture_id);
```

- [ ] **Step 2: Write `bridge.ts` (type-safe message channel)**

```typescript
// src/db/bridge.ts
// Typed message bridge between Service Worker and DB Dedicated Worker.
// The DB Worker runs wa-sqlite; SW sends commands and awaits responses.

export type DbCommand =
  | { id: string; cmd: 'init' }
  | { id: string; cmd: 'exec'; sql: string; params?: unknown[] }
  | { id: string; cmd: 'query'; sql: string; params?: unknown[] }
  | { id: string; cmd: 'export_bytes' };

export type DbResponse =
  | { id: string; ok: true; rows?: unknown[][] }
  | { id: string; ok: false; error: string };

let worker: Worker | null = null;
const pending = new Map<string, { resolve: (r: DbResponse) => void; reject: (e: Error) => void }>();

export function getDbWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<DbResponse>) => {
      const cb = pending.get(e.data.id);
      if (cb) { pending.delete(e.data.id); cb.resolve(e.data); }
    };
    worker.onerror = (e) => console.error('[DB Worker Error]', e);
  }
  return worker;
}

export function dbSend(command: Omit<DbCommand, 'id'>): Promise<DbResponse> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getDbWorker().postMessage({ ...command, id } satisfies DbCommand);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`DB command timeout: ${command.cmd}`));
      }
    }, 10_000);
  });
}

export async function dbExec(sql: string, params?: unknown[]): Promise<void> {
  const r = await dbSend({ cmd: 'exec', sql, params });
  if (!r.ok) throw new Error(r.error);
}

export async function dbQuery<T = unknown[]>(sql: string, params?: unknown[]): Promise<T[]> {
  const r = await dbSend({ cmd: 'query', sql, params });
  if (!r.ok) throw new Error(r.error);
  return (r.rows || []) as T[];
}

export async function dbInit(): Promise<void> {
  const r = await dbSend({ cmd: 'init' });
  if (!r.ok) throw new Error(r.error);
}
```

- [ ] **Step 3: Write `worker.ts` (wa-sqlite + OPFS)**

```typescript
// src/db/worker.ts
// Dedicated Worker — runs wa-sqlite with OPFS async backend.
// Receives DbCommand messages, executes SQL, posts DbResponse.
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import * as SQLite from 'wa-sqlite';
import { OPFSAnyContextVFS } from 'wa-sqlite/src/examples/OPFSAnyContextVFS.js';
import type { DbCommand, DbResponse } from './bridge';
import { readFileSync } from 'fs'; // replaced by fetch at runtime

const DB_NAME = 'ai-memory';
let sqlite3: SQLite.SQLiteAPI;
let db: number; // sqlite3 db pointer

async function initialize(): Promise<void> {
  const module = await SQLiteESMFactory();
  sqlite3 = SQLite.Factory(module);
  const vfs = await OPFSAnyContextVFS.create(DB_NAME, module);
  await sqlite3.vfs_register(vfs, true);
  db = await sqlite3.open_v2(`${DB_NAME}.sqlite`, SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE);

  // Apply schema
  const schemaRes = await fetch(new URL('./schema.sql', import.meta.url));
  const schema = await schemaRes.text();
  await execSQL(schema);
}

async function execSQL(sql: string, params?: unknown[]): Promise<void> {
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params?.length) SQLite.bind_collection(stmt, params as any);
    while (await sqlite3.step(stmt) === SQLite.SQLITE_ROW) { /* drain */ }
  }
}

async function querySQL(sql: string, params?: unknown[]): Promise<unknown[][]> {
  const rows: unknown[][] = [];
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params?.length) SQLite.bind_collection(stmt, params as any);
    while (await sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
      rows.push(sqlite3.row(stmt));
    }
  }
  return rows;
}

async function exportBytes(): Promise<Uint8Array> {
  const file = await navigator.storage.getDirectory()
    .then((root) => root.getFileHandle(`${DB_NAME}.sqlite`))
    .then((h) => h.getFile());
  return new Uint8Array(await file.arrayBuffer());
}

self.onmessage = async (e: MessageEvent<DbCommand>) => {
  const { id, cmd } = e.data;
  try {
    if (cmd === 'init') {
      await initialize();
      self.postMessage({ id, ok: true } satisfies DbResponse);
    } else if (cmd === 'exec') {
      await execSQL(e.data.sql, e.data.params);
      self.postMessage({ id, ok: true } satisfies DbResponse);
    } else if (cmd === 'query') {
      const rows = await querySQL(e.data.sql, e.data.params);
      self.postMessage({ id, ok: true, rows } satisfies DbResponse);
    } else if (cmd === 'export_bytes') {
      const bytes = await exportBytes();
      self.postMessage({ id, ok: true, rows: [[bytes]] } satisfies DbResponse, [bytes.buffer]);
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) } satisfies DbResponse);
  }
};
```

- [ ] **Step 4: Commit**

```bash
git add extension/src/db/
git commit -m "feat: wa-sqlite OPFS DB worker and typed message bridge"
```

---

### Task 7: Database Repositories

**Files:**
- Create: `extension/src/db/repos/captures.ts`
- Create: `extension/src/db/repos/memories.ts`
- Create: `extension/src/db/repos/settings.ts`
- Create: `extension/src/db/repos/context-packs.ts`

- [ ] **Step 1: Write `captures.ts`**

```typescript
// src/db/repos/captures.ts
import { dbExec, dbQuery } from '../bridge';
import type { Capture, ExtractedConversation } from '../../lib/types';

export async function insertCapture(conv: ExtractedConversation): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await dbExec(
    `INSERT INTO captures (id, source_platform, source_url, source_title, content_hash, extraction_quality, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending_ai', ?)`,
    [
      id,
      conv.source.platform,
      conv.source.url,
      conv.content.title,
      conv.hashes.content_hash,
      JSON.stringify(conv.extraction_quality),
      now,
    ]
  );
  // Insert source document (normalized text)
  const docId = crypto.randomUUID();
  const text = conv.content.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
  await dbExec(
    `INSERT INTO source_documents (id, capture_id, title, normalized_text, message_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [docId, id, conv.content.title, text, conv.content.messages.length, now]
  );
  return id;
}

export async function getCaptureByHash(hash: string): Promise<Capture | null> {
  const rows = await dbQuery<[string, string, string, string, string, string, string, string]>(
    'SELECT id, source_platform, source_url, source_title, content_hash, extraction_quality, status, created_at FROM captures WHERE content_hash = ? LIMIT 1',
    [hash]
  );
  if (!rows.length) return null;
  const [id, source_platform, source_url, source_title, content_hash, eq, status, created_at] = rows[0];
  return { id, source_platform, source_url, source_title, content_hash, extraction_quality: JSON.parse(eq), status: status as any, created_at };
}

export async function listCaptures(): Promise<Capture[]> {
  const rows = await dbQuery<[string, string, string, string, string, string, string, string]>(
    'SELECT id, source_platform, source_url, source_title, content_hash, extraction_quality, status, created_at FROM captures ORDER BY created_at DESC'
  );
  return rows.map(([id, source_platform, source_url, source_title, content_hash, eq, status, created_at]) => ({
    id, source_platform, source_url, source_title, content_hash,
    extraction_quality: JSON.parse(eq), status: status as any, created_at,
  }));
}

export async function updateCaptureStatus(id: string, status: Capture['status']): Promise<void> {
  await dbExec('UPDATE captures SET status = ? WHERE id = ?', [status, id]);
}

export async function deleteCapture(id: string): Promise<void> {
  await dbExec('DELETE FROM captures WHERE id = ?', [id]);
}
```

- [ ] **Step 2: Write `settings.ts`**

```typescript
// src/db/repos/settings.ts
import { dbExec, dbQuery } from '../bridge';
import type { Settings } from '../../lib/types';

const DEFAULTS: Settings = {
  claude_api_key: null,
  default_save_mode: 'summary_and_memory',
  raw_text_retention: 'delete_after_processing',
  schema_version: 1,
};

export async function getSettings(): Promise<Settings> {
  const rows = await dbQuery<[string, string]>('SELECT key, value FROM settings');
  const map = Object.fromEntries(rows.map(([k, v]) => [k, v]));
  return {
    claude_api_key: map.claude_api_key ?? DEFAULTS.claude_api_key,
    default_save_mode: (map.default_save_mode as any) ?? DEFAULTS.default_save_mode,
    raw_text_retention: (map.raw_text_retention as any) ?? DEFAULTS.raw_text_retention,
    schema_version: Number(map.schema_version ?? DEFAULTS.schema_version),
  };
}

export async function setSetting(key: keyof Settings, value: string | null): Promise<void> {
  if (value === null) {
    await dbExec('DELETE FROM settings WHERE key = ?', [key]);
  } else {
    await dbExec(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value]
    );
  }
}
```

- [ ] **Step 3: Write `memories.ts`**

```typescript
// src/db/repos/memories.ts
import { dbExec, dbQuery } from '../bridge';
import type { MemoryCandidateRow, MemoryCandidate, MemoryLevel } from '../../lib/types';

export async function insertCandidates(captureId: string, candidates: MemoryCandidate[]): Promise<void> {
  for (const c of candidates) {
    const id = crypto.randomUUID();
    const requiresConfirm = ['L4', 'L5'].includes(c.level);
    await dbExec(
      `INSERT INTO memory_candidates (id, capture_id, content, level, confidence, reason, status, source_message_indexes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, captureId, c.content, c.level, c.confidence, c.reason,
        requiresConfirm ? 'pending' : 'confirmed',
        JSON.stringify(c.source_message_indexes),
        new Date().toISOString(),
      ]
    );
    if (!requiresConfirm && c.confidence >= 0.7) {
      await autoPromoteToMemoryItem(captureId, id, c);
    }
  }
}

async function autoPromoteToMemoryItem(captureId: string, candidateId: string, c: MemoryCandidate): Promise<void> {
  await dbExec(
    `INSERT INTO memory_items (id, capture_id, candidate_id, content, level, confirmed_by_user, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [crypto.randomUUID(), captureId, candidateId, c.content, c.level, new Date().toISOString()]
  );
}

export async function confirmCandidate(id: string): Promise<void> {
  const rows = await dbQuery<[string, string, string, string]>(
    'SELECT capture_id, content, level FROM memory_candidates WHERE id = ?', [id]
  );
  if (!rows.length) return;
  const [captureId, content, level] = rows[0];
  await dbExec('UPDATE memory_candidates SET status = ?, confirmed_at = ? WHERE id = ?',
    ['confirmed', new Date().toISOString(), id]);
  await dbExec(
    'INSERT INTO memory_items (id, capture_id, candidate_id, content, level, confirmed_by_user, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    [crypto.randomUUID(), captureId, id, content, level, new Date().toISOString()]
  );
}

export async function listCandidatesForCapture(captureId: string): Promise<MemoryCandidateRow[]> {
  const rows = await dbQuery<[string, string, string, string, number, string, string, string, string | null, string]>(
    'SELECT id, capture_id, content, level, confidence, reason, status, source_message_indexes, confirmed_at, created_at FROM memory_candidates WHERE capture_id = ? ORDER BY level DESC',
    [captureId]
  );
  return rows.map(([id, capture_id, content, level, confidence, reason, status, source_message_indexes, confirmed_at, created_at]) => ({
    id, capture_id, content, level: level as MemoryLevel, confidence, reason,
    status: status as any, source_message_indexes, confirmed_at, created_at,
  }));
}

export async function listPendingCandidates(): Promise<MemoryCandidateRow[]> {
  const rows = await dbQuery<[string, string, string, string, number, string, string, string, string | null, string]>(
    `SELECT id, capture_id, content, level, confidence, reason, status, source_message_indexes, confirmed_at, created_at
     FROM memory_candidates WHERE status = 'pending' ORDER BY created_at DESC`
  );
  return rows.map(([id, capture_id, content, level, confidence, reason, status, source_message_indexes, confirmed_at, created_at]) => ({
    id, capture_id, content, level: level as MemoryLevel, confidence, reason,
    status: status as any, source_message_indexes, confirmed_at, created_at,
  }));
}
```

- [ ] **Step 4: Write `context-packs.ts`**

```typescript
// src/db/repos/context-packs.ts
import { dbExec, dbQuery } from '../bridge';
import type { ContextPack } from '../../lib/types';

export async function insertContextPack(captureId: string, projectName: string, markdown: string): Promise<string> {
  const id = crypto.randomUUID();
  await dbExec(
    'INSERT INTO context_packs (id, capture_id, project_name, content_markdown, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, captureId, projectName, markdown, new Date().toISOString()]
  );
  return id;
}

export async function getContextPackForCapture(captureId: string): Promise<ContextPack | null> {
  const rows = await dbQuery<[string, string, string, string, string]>(
    'SELECT id, capture_id, project_name, content_markdown, created_at FROM context_packs WHERE capture_id = ? ORDER BY created_at DESC LIMIT 1',
    [captureId]
  );
  if (!rows.length) return null;
  const [id, capture_id, project_name, content_markdown, created_at] = rows[0];
  return { id, capture_id, project_name, content_markdown, created_at };
}
```

- [ ] **Step 5: Commit**

```bash
git add extension/src/db/repos/
git commit -m "feat: SQLite repositories (captures, memories, settings, context-packs)"
```

---

### Task 8: Context Pack Builder

**Files:**
- Create: `extension/src/lib/context-pack.ts`
- Create: `extension/tests/lib/context-pack.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/lib/context-pack.test.ts
import { describe, it, expect } from 'vitest';
import { buildContextPack } from '../../src/lib/context-pack';
import type { MemoryCandidateRow } from '../../src/lib/types';

const makeCandidate = (content: string, level: string, status = 'confirmed'): MemoryCandidateRow => ({
  id: '1', capture_id: 'c1', content, level: level as any,
  confidence: 0.9, reason: 'test', status: status as any,
  source_message_indexes: '[0]', confirmed_at: null, created_at: '2026-06-03',
});

describe('buildContextPack', () => {
  it('generates markdown with project name heading', () => {
    const md = buildContextPack('AI Memory Hub', 'Build a browser extension', [], []);
    expect(md).toContain('# Project Context: AI Memory Hub');
  });

  it('includes Current Goal from summary', () => {
    const md = buildContextPack('Test', 'My goal is to build X', [], []);
    expect(md).toContain('## Current Goal');
    expect(md).toContain('My goal is to build X');
  });

  it('includes confirmed L5 decisions in Recent Decisions', () => {
    const candidates = [makeCandidate('Decision A', 'L5'), makeCandidate('Decision B', 'L4')];
    const md = buildContextPack('Test', 'goal', candidates, []);
    expect(md).toContain('## Recent Decisions');
    expect(md).toContain('- Decision A');
    expect(md).toContain('- Decision B');
  });

  it('omits sections with no content', () => {
    const md = buildContextPack('Test', 'goal', [], []);
    expect(md).not.toContain('## Recent Decisions');
    expect(md).not.toContain('## Next Actions');
  });

  it('includes next actions from L1/L2 task candidates', () => {
    const tasks = [makeCandidate('Implement Extractor', 'L2')];
    const md = buildContextPack('Test', 'goal', [], tasks);
    expect(md).toContain('## Next Actions');
    expect(md).toContain('- Implement Extractor');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx vitest run tests/lib/context-pack.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement `context-pack.ts`**

```typescript
// src/lib/context-pack.ts
import type { MemoryCandidateRow } from './types';

export function buildContextPack(
  projectName: string,
  summary: string,
  decisions: MemoryCandidateRow[],  // L3-L5 confirmed
  actions: MemoryCandidateRow[],    // L1-L2 confirmed
): string {
  const sections: string[] = [];
  sections.push(`# Project Context: ${projectName}\n`);

  if (summary.trim()) {
    sections.push(`## Current Goal\n${summary.trim()}`);
  }

  const decisionItems = decisions.filter((d) => ['L3', 'L4', 'L5'].includes(d.level) && d.status === 'confirmed');
  if (decisionItems.length > 0) {
    sections.push(`## Recent Decisions\n${decisionItems.map((d) => `- ${d.content}`).join('\n')}`);
  }

  const actionItems = actions.filter((a) => ['L1', 'L2'].includes(a.level) && a.status === 'confirmed');
  if (actionItems.length > 0) {
    sections.push(`## Next Actions\n${actionItems.map((a) => `- ${a.content}`).join('\n')}`);
  }

  return sections.join('\n\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bunx vitest run tests/lib/context-pack.test.ts
```
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add extension/src/lib/context-pack.ts extension/tests/lib/context-pack.test.ts
git commit -m "feat: Context Pack Markdown builder with section pruning"
```

---

### Task 9: Claude API Client

**Files:**
- Create: `extension/src/lib/claude-api.ts`

- [ ] **Step 1: Write `claude-api.ts`**

```typescript
// src/lib/claude-api.ts
import type { MemoryCandidate, MemoryLevel } from './types';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-3-5-haiku-20241022';

async function callClaude(apiKey: string, prompt: string, systemPrompt: string): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content[0].text as string;
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    await callClaude(apiKey, 'Reply with just the word "ok"', 'You are a helpful assistant.');
    return true;
  } catch {
    return false;
  }
}

export async function generateSummary(apiKey: string, text: string): Promise<string> {
  const prompt = `以下是一段 AI 对话，请用 150 字以内的中文生成一份简洁摘要，说明本次对话的核心主题、关键讨论点和主要结论：\n\n${text.slice(0, 8000)}`;
  const system = '你是一个专业的对话分析助手，擅长提炼对话要点。直接输出摘要，不要加标题或前缀。';
  return callClaude(apiKey, prompt, system);
}

export async function extractMemoryCandidates(apiKey: string, text: string): Promise<MemoryCandidate[]> {
  const system = `你是一个记忆提取助手。从对话中提取有价值的记忆条目，按重要性分级：
L0=噪音(无价值), L1=临时信息, L2=会话上下文, L3=项目记忆, L4=长期偏好, L5=核心决策。
只输出 JSON 数组，格式：[{"content":"...","level":"L3","confidence":0.9,"reason":"...","source_message_indexes":[0,1]}]`;

  const prompt = `请分析以下对话，提取 3-8 个最有价值的记忆条目：\n\n${text.slice(0, 6000)}`;

  try {
    const raw = await callClaude(apiKey, prompt, system);
    const jsonStr = raw.match(/\[[\s\S]*\]/)?.[0] || '[]';
    const parsed = JSON.parse(jsonStr) as Array<{
      content: string; level: string; confidence: number;
      reason: string; source_message_indexes: number[];
    }>;
    return parsed.map((c) => ({
      content: c.content,
      level: c.level as MemoryLevel,
      confidence: Math.min(1, Math.max(0, c.confidence)),
      reason: c.reason,
      requires_confirmation: ['L4', 'L5'].includes(c.level),
      source_message_indexes: c.source_message_indexes || [],
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/lib/claude-api.ts
git commit -m "feat: Claude API client (summary + memory extraction)"
```

---

### Task 10: Background Service Worker

**Files:**
- Create: `extension/src/entrypoints/background.ts`

- [ ] **Step 1: Write `background.ts`**

```typescript
// src/entrypoints/background.ts
import { dbInit, dbSend } from '../db/bridge';
import { insertCapture, getCaptureByHash, updateCaptureStatus } from '../db/repos/captures';
import { insertCandidates } from '../db/repos/memories';
import { insertContextPack } from '../db/repos/context-packs';
import { getSettings, setSetting } from '../db/repos/settings';
import { generateSummary, extractMemoryCandidates, validateApiKey } from '../lib/claude-api';
import { buildContextPack } from '../lib/context-pack';
import type { SaveRequest, SaveResult, ProgressUpdate, ProgressStep } from '../lib/types';

export default defineBackground(async () => {
  // Initialize DB on startup
  await dbInit();

  // Context menu for right-click selection save
  chrome.contextMenus.create({
    id: 'save-selection',
    title: '保存到 AI Memory',
    contexts: ['selection'],
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'save-selection' && tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' });
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SAVE_REQUEST') {
      handleSave(msg as SaveRequest, sendResponse);
      return true; // keep channel open for async
    }
    if (msg.type === 'VALIDATE_API_KEY') {
      validateApiKey(msg.key).then((ok) => sendResponse({ ok }));
      return true;
    }
    if (msg.type === 'SET_SETTING') {
      setSetting(msg.key, msg.value).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg.type === 'GET_SETTINGS') {
      getSettings().then((s) => sendResponse(s));
      return true;
    }
    if (msg.type === 'EXPORT_DB') {
      exportDb(sendResponse);
      return true;
    }
  });
});

function pushProgress(step: ProgressStep, captureId: string, result?: ProgressUpdate['result']) {
  chrome.runtime.sendMessage({ type: 'PROGRESS_UPDATE', capture_id: captureId, step, result } satisfies ProgressUpdate);
}

async function handleSave(req: SaveRequest, sendResponse: (r: SaveResult) => void) {
  const { conversation } = req;

  // Dedup check
  const existing = await getCaptureByHash(conversation.hashes.content_hash);
  if (existing) {
    sendResponse({ type: 'SAVE_RESULT', success: false, error: 'DUPLICATE', capture_id: existing.id });
    return;
  }

  // Write to local SQLite
  const captureId = await insertCapture(conversation);
  pushProgress({ step: 'writing_local', status: 'done' }, captureId);
  sendResponse({ type: 'SAVE_RESULT', success: true, capture_id: captureId });

  // AI processing (async, after response)
  const settings = await getSettings();
  if (!settings.claude_api_key) {
    await updateCaptureStatus(captureId, 'ai_failed');
    return;
  }

  const text = conversation.content.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');

  // Summary
  pushProgress({ step: 'generating_summary', status: 'running' }, captureId);
  let summary = '';
  try {
    summary = await generateSummary(settings.claude_api_key, text);
    await dbSend({ cmd: 'exec', sql: 'UPDATE source_documents SET summary = ? WHERE capture_id = ?', params: [summary, captureId] });
    pushProgress({ step: 'generating_summary', status: 'done' }, captureId);
  } catch {
    pushProgress({ step: 'generating_summary', status: 'failed' }, captureId);
  }

  // Memory extraction
  pushProgress({ step: 'extracting_memories', status: 'running' }, captureId);
  let candidates: Awaited<ReturnType<typeof extractMemoryCandidates>> = [];
  try {
    candidates = await extractMemoryCandidates(settings.claude_api_key, text);
    await insertCandidates(captureId, candidates);
    pushProgress({ step: 'extracting_memories', status: 'done' }, captureId, { memory_count: candidates.length });
  } catch {
    pushProgress({ step: 'extracting_memories', status: 'failed' }, captureId);
  }

  // Context Pack
  pushProgress({ step: 'building_context_pack', status: 'running' }, captureId);
  try {
    const decisions = candidates.filter((c) => ['L3', 'L4', 'L5'].includes(c.level));
    const actions = candidates.filter((c) => ['L1', 'L2'].includes(c.level));
    const markdown = buildContextPack(conversation.source.browser_title, summary, decisions as any, actions as any);
    const packId = await insertContextPack(captureId, conversation.content.title, markdown);
    await updateCaptureStatus(captureId, 'processed');
    pushProgress({ step: 'building_context_pack', status: 'done' }, captureId, { context_pack_id: packId });
  } catch {
    pushProgress({ step: 'building_context_pack', status: 'failed' }, captureId);
  }
}

async function exportDb(sendResponse: (r: { ok: boolean; bytes?: ArrayBuffer }) => void) {
  const r = await dbSend({ cmd: 'export_bytes' });
  if (r.ok && r.rows?.[0]?.[0]) {
    sendResponse({ ok: true, bytes: (r.rows[0][0] as Uint8Array).buffer });
  } else {
    sendResponse({ ok: false });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/entrypoints/background.ts
git commit -m "feat: Background Service Worker (save handler, AI pipeline, context menu)"
```

---

### Task 11: Content Script (ChatGPT)

**Files:**
- Create: `extension/src/entrypoints/content/chatgpt.ts`

- [ ] **Step 1: Write `chatgpt.ts` content script**

```typescript
// src/entrypoints/content/chatgpt.ts
import { chatgptExtractor } from '../../lib/extractors/chatgpt';
import { detectSensitive } from '../../lib/sensitive';

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  async main() {
    // Listen for extraction request from Popup
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'EXTRACT_CONVERSATION') {
        extractAndSend(sendResponse);
        return true;
      }
      if (msg.type === 'GET_SELECTION') {
        const selection = window.getSelection()?.toString() || '';
        sendResponse({ type: 'SELECTION_CONTENT', text: selection, url: location.href, title: document.title });
      }
    });
  },
});

async function extractAndSend(sendResponse: (r: unknown) => void) {
  try {
    const conversation = await chatgptExtractor.extract(document, location.href);
    const sensitiveResult = detectSensitive(conversation.content.messages);
    sendResponse({ type: 'EXTRACTION_RESULT', conversation, sensitive: sensitiveResult });
  } catch (err) {
    sendResponse({ type: 'EXTRACTION_ERROR', error: String(err) });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/entrypoints/content/
git commit -m "feat: ChatGPT content script (extraction + selection on demand)"
```

---

### Task 12: Popup UI

**Files:**
- Create: `extension/src/entrypoints/popup/App.tsx`
- Create: `extension/src/entrypoints/popup/screens/SaveScreen.tsx`
- Create: `extension/src/entrypoints/popup/screens/DegradedScreen.tsx`
- Create: `extension/src/entrypoints/popup/screens/SensitiveScreen.tsx`
- Create: `extension/src/entrypoints/popup/screens/SuccessScreen.tsx`
- Create: `extension/src/entrypoints/popup/screens/FailScreen.tsx`

- [ ] **Step 1: Write `App.tsx` state machine**

```typescript
// src/entrypoints/popup/App.tsx
import { useEffect, useState } from 'react';
import type { ExtractedConversation, SensitiveResult, ProgressStep } from '../../lib/types';
import SaveScreen from './screens/SaveScreen';
import DegradedScreen from './screens/DegradedScreen';
import SensitiveScreen from './screens/SensitiveScreen';
import SuccessScreen from './screens/SuccessScreen';
import FailScreen from './screens/FailScreen';

type Screen = 'loading' | 'save' | 'degraded' | 'sensitive' | 'success' | 'fail';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [conversation, setConversation] = useState<ExtractedConversation | null>(null);
  const [sensitive, setSensitive] = useState<SensitiveResult | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressStep[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    // Request extraction from content script
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONVERSATION' }, (result) => {
        if (chrome.runtime.lastError || !result) {
          setScreen('degraded');
          return;
        }
        if (result.type === 'EXTRACTION_RESULT') {
          setConversation(result.conversation);
          setSensitive(result.sensitive);
          if (result.conversation.extraction_quality.confidence < 0.6) {
            setScreen('degraded');
          } else if (result.sensitive?.has_sensitive) {
            setScreen('sensitive');
          } else {
            setScreen('save');
          }
        } else {
          setScreen('degraded');
        }
      });
    });

    // Listen for progress from background
    const listener = (msg: any) => {
      if (msg.type === 'PROGRESS_UPDATE') {
        setProgress((prev) => [...prev, msg.step]);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleSave = (conv: ExtractedConversation) => {
    chrome.runtime.sendMessage({ type: 'SAVE_REQUEST', conversation: conv, save_mode: 'summary_and_memory' }, (result) => {
      if (result?.success) {
        setCaptureId(result.capture_id);
        setScreen('success');
      } else if (result?.error === 'DUPLICATE') {
        setErrorMsg('此内容已保存过');
        setScreen('fail');
      } else {
        setErrorMsg('保存失败，请重试');
        setScreen('fail');
      }
    });
  };

  if (screen === 'loading') return <div style={{ padding: 24, fontFamily: 'var(--font-ui)' }}>正在识别页面…</div>;
  if (screen === 'save' && conversation) return <SaveScreen conversation={conversation} onSave={handleSave} />;
  if (screen === 'degraded') return <DegradedScreen />;
  if (screen === 'sensitive' && conversation && sensitive) return <SensitiveScreen conversation={conversation} sensitive={sensitive} onSave={handleSave} />;
  if (screen === 'success') return <SuccessScreen captureId={captureId!} progress={progress} />;
  if (screen === 'fail') return <FailScreen errorMessage={errorMsg} />;
  return null;
}
```

- [ ] **Step 2: Write `SaveScreen.tsx`**

```typescript
// src/entrypoints/popup/screens/SaveScreen.tsx
import type { ExtractedConversation } from '../../../lib/types';

interface Props {
  conversation: ExtractedConversation;
  onSave: (conv: ExtractedConversation) => void;
}

export default function SaveScreen({ conversation, onSave }: Props) {
  const { message_count, extraction_quality: eq } = { message_count: conversation.content.messages.length, extraction_quality: conversation.extraction_quality };
  const wordCount = conversation.content.messages.reduce((n, m) => n + m.content.length, 0);

  return (
    <div className="scr" style={{ width: 392 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 18px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>AI Memory Capture</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>当前页面 · AI 对话</div>
        </div>
      </div>

      {/* Detection */}
      <div style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>检测结果</div>
        <div style={{ display: 'flex', gap: 12, padding: '10px 14px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface-2)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{message_count}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>条消息</div>
          </div>
          <div style={{ width: 1, background: 'var(--line)' }} />
          <div style={{ flex: 1, paddingLeft: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{(wordCount / 1000).toFixed(1)}k</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>字数（约）</div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'var(--ok-bg)', color: 'var(--ok-fg)', border: '1px solid color-mix(in oklab, var(--ok-fg) 28%, transparent)' }}>
            ✓ 识别完整
          </span>
        </div>
      </div>

      {/* Save button */}
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
        <button
          onClick={() => onSave(conversation)}
          className="btn btn-primary btn-block"
        >
          ⚡ 保存到 AI Memory
        </button>
        <div style={{ textAlign: 'center', marginTop: 9, fontSize: 11, color: 'var(--ink-3)' }}>
          🔒 仅在你点击时保存 · 不读取其他标签页
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write remaining screens (DegradedScreen, SensitiveScreen, SuccessScreen, FailScreen)**

```typescript
// src/entrypoints/popup/screens/DegradedScreen.tsx
export default function DegradedScreen() {
  return (
    <div className="scr" style={{ width: 392, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>提取质量较低</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 16 }}>
        页面结构可能发生变化，无法完整识别对话。请选中你想保存的文本后，回到页面右键选择「保存到 AI Memory」。
      </div>
      <button className="btn btn-ghost btn-block" onClick={() => window.close()}>关闭</button>
    </div>
  );
}
```

```typescript
// src/entrypoints/popup/screens/SensitiveScreen.tsx
import type { ExtractedConversation, SensitiveResult } from '../../../lib/types';

interface Props { conversation: ExtractedConversation; sensitive: SensitiveResult; onSave: (c: ExtractedConversation) => void; }
export default function SensitiveScreen({ conversation, sensitive, onSave }: Props) {
  return (
    <div className="scr" style={{ width: 392, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger-fg)', marginBottom: 8 }}>
        ⚠️ 检测到 {sensitive.matches.length} 处可能的敏感信息
      </div>
      {sensitive.matches.map((m, i) => (
        <div key={i} style={{ fontSize: 12.5, padding: '7px 10px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--line-2)', marginBottom: 6 }}>
          <b>{m.type}</b>: <span style={{ fontFamily: 'var(--font-mono)' }}>{m.masked}</span> <span style={{ color: 'var(--ink-3)' }}>msg #{m.message_index}</span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary btn-block" onClick={() => onSave(conversation)}>仍然保存（不打码）</button>
        <button className="btn btn-ghost btn-block" onClick={() => window.close()}>取消</button>
      </div>
    </div>
  );
}
```

```typescript
// src/entrypoints/popup/screens/SuccessScreen.tsx
import type { ProgressStep } from '../../../lib/types';
const STEPS: Array<{ key: ProgressStep['step']; label: string }> = [
  { key: 'writing_local', label: '已写入本地' },
  { key: 'generating_summary', label: '正在生成摘要' },
  { key: 'extracting_memories', label: '正在提取候选记忆' },
  { key: 'building_context_pack', label: '生成 Context Pack' },
];
interface Props { captureId: string; progress: ProgressStep[] }
export default function SuccessScreen({ captureId, progress }: Props) {
  const done = new Set(progress.filter((s) => s.status === 'done').map((s) => s.step));
  const copyPack = async () => {
    const result = await new Promise<any>((r) => chrome.runtime.sendMessage({ type: 'GET_CONTEXT_PACK', capture_id: captureId }, r));
    if (result?.markdown) { await navigator.clipboard.writeText(result.markdown); }
  };
  return (
    <div className="scr" style={{ width: 392, padding: 18 }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 14, fontFamily: 'var(--font-display)' }}>✓ 已保存到 AI Memory</div>
      {STEPS.map((s) => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, marginBottom: 8 }}>
          <span style={{ width: 17, height: 17, borderRadius: 99, background: done.has(s.key) ? 'var(--accent)' : 'var(--line-2)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontSize: 10 }}>
            {done.has(s.key) ? '✓' : '○'}
          </span>
          <span style={{ color: done.has(s.key) ? 'var(--ink)' : 'var(--ink-3)' }}>{s.label}</span>
        </div>
      ))}
      <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={copyPack}>复制 Context Pack</button>
      <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => chrome.runtime.openOptionsPage()}>查看控制台</button>
    </div>
  );
}
```

```typescript
// src/entrypoints/popup/screens/FailScreen.tsx
interface Props { errorMessage: string }
export default function FailScreen({ errorMessage }: Props) {
  return (
    <div className="scr" style={{ width: 392, padding: 18 }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, fontFamily: 'var(--font-display)' }}>保存失败</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 16 }}>{errorMessage}</div>
      <button className="btn btn-ghost btn-block" onClick={() => window.close()}>关闭</button>
    </div>
  );
}
```

- [ ] **Step 4: Write popup entry files**

```typescript
// src/entrypoints/popup/main.tsx
import { createRoot } from 'react-dom/client';
import App from './App';
import '../../assets/tokens.css';

createRoot(document.getElementById('root')!).render(<App />);
```

```html
<!-- src/entrypoints/popup.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><title>AI Memory Capture</title></head>
<body style="margin:0;width:392px;min-height:200px">
  <div id="root"></div>
  <script type="module" src="popup/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: Commit**

```bash
git add extension/src/entrypoints/popup/
git commit -m "feat: Popup UI — 5 screens (save, degraded, sensitive, success, fail)"
```

---

### Task 13: options_page Console

**Files:**
- Create: `extension/src/entrypoints/options/App.tsx`
- Create: `extension/src/entrypoints/options/pages/CaptureList.tsx`
- Create: `extension/src/entrypoints/options/pages/CaptureDetail.tsx`
- Create: `extension/src/entrypoints/options/pages/ReviewInbox.tsx`
- Create: `extension/src/entrypoints/options/pages/Settings.tsx`

- [ ] **Step 1: Write `App.tsx` console shell**

```typescript
// src/entrypoints/options/App.tsx
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import CaptureList from './pages/CaptureList';
import CaptureDetail from './pages/CaptureDetail';
import ReviewInbox from './pages/ReviewInbox';
import Settings from './pages/Settings';
import '../../assets/tokens.css';

const NAV = [
  { to: '/', label: 'Captures', exact: true },
  { to: '/review', label: 'Review Inbox' },
  { to: '/settings', label: '设置' },
];

export default function App() {
  return (
    <div className="scr" style={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: 'var(--paper-2)', borderRight: '1px solid var(--line)', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700, padding: '8px 10px 16px', letterSpacing: '-.01em' }}>AI Memory</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.exact}
            style={({ isActive }) => ({ display: 'block', padding: '9px 11px', borderRadius: 7, fontSize: 13, fontWeight: isActive ? 600 : 500, color: isActive ? 'var(--ink)' : 'var(--ink-2)', background: isActive ? 'var(--surface)' : 'transparent', border: isActive ? '1px solid var(--line-2)' : '1px solid transparent', textDecoration: 'none' })}
          >{n.label}</NavLink>
        ))}
      </aside>
      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', padding: 26 }}>
        <Routes>
          <Route path="/" element={<CaptureList />} />
          <Route path="/capture/:id" element={<CaptureDetail />} />
          <Route path="/review" element={<ReviewInbox />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Write `CaptureList.tsx`**

```typescript
// src/entrypoints/options/pages/CaptureList.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dbInit } from '../../../db/bridge';
import { listCaptures } from '../../../db/repos/captures';
import type { Capture } from '../../../lib/types';

export default function CaptureList() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    dbInit().then(() => listCaptures().then(setCaptures));
  }, []);

  if (!captures.length) return (
    <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--ink-3)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>还没有保存记录</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>在 ChatGPT 点击插件图标，开始保存你的第一次对话</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Captures</div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {captures.map((c, i) => (
          <div key={c.id} onClick={() => navigate(`/capture/${c.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < captures.length - 1 ? '1px solid var(--line)' : 'none', cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.source_title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{c.source_platform} · {new Date(c.created_at).toLocaleString('zh-CN')}</div>
            </div>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: c.status === 'processed' ? 'var(--ok-bg)' : 'var(--warn-bg)', color: c.status === 'processed' ? 'var(--ok-fg)' : 'var(--warn-fg)' }}>
              {c.status === 'processed' ? '已处理' : c.status === 'pending_ai' ? '处理中' : 'AI失败'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `Settings.tsx` (API Key + export)**

```typescript
// src/entrypoints/options/pages/Settings.tsx
import { useEffect, useState } from 'react';
import { getSettings, setSetting } from '../../../db/repos/settings';
import type { Settings as SettingsType } from '../../../lib/types';

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'idle' | 'ok' | 'fail'>('idle');

  useEffect(() => { getSettings().then((s) => { setSettings(s); setApiKey(s.claude_api_key || ''); }); }, []);

  const validateAndSave = async () => {
    setValidating(true);
    const result = await new Promise<{ ok: boolean }>((r) => chrome.runtime.sendMessage({ type: 'VALIDATE_API_KEY', key: apiKey }, r));
    if (result.ok) {
      await setSetting('claude_api_key', apiKey);
      setKeyStatus('ok');
    } else {
      setKeyStatus('fail');
    }
    setValidating(false);
  };

  const exportDb = () => {
    chrome.runtime.sendMessage({ type: 'EXPORT_DB' }, (result) => {
      if (result?.bytes) {
        const blob = new Blob([result.bytes], { type: 'application/x-sqlite3' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-memory-export-${new Date().toISOString().slice(0, 10)}.sqlite`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  };

  if (!settings) return <div>加载中…</div>;

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>设置</div>

      {/* API Key */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Claude API Key</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>你自己的 Anthropic API Key，用于生成摘要和提取记忆。存储在本地，不上传任何地方。</div>
        <input
          type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setKeyStatus('idle'); }}
          placeholder="sk-ant-..." style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={validateAndSave} disabled={validating || !apiKey}>
            {validating ? '验证中…' : '验证并保存'}
          </button>
          {keyStatus === 'ok' && <span style={{ color: 'var(--ok-fg)', fontSize: 12.5 }}>✓ 已连接</span>}
          {keyStatus === 'fail' && <span style={{ color: 'var(--danger-fg)', fontSize: 12.5 }}>✗ Key 无效，请检查</span>}
        </div>
      </div>

      {/* Export */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>数据与备份</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>导出完整数据库为标准 SQLite 文件，可用 DB Browser for SQLite 等工具打开。</div>
        <button className="btn btn-ghost" onClick={exportDb}>⬇ 导出 .sqlite 文件</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `ReviewInbox.tsx`**

```typescript
// src/entrypoints/options/pages/ReviewInbox.tsx
import { useEffect, useState } from 'react';
import { listPendingCandidates, confirmCandidate } from '../../../db/repos/memories';
import type { MemoryCandidateRow } from '../../../lib/types';

export default function ReviewInbox() {
  const [items, setItems] = useState<MemoryCandidateRow[]>([]);
  useEffect(() => { listPendingCandidates().then(setItems); }, []);

  const confirm = async (id: string) => {
    await confirmCandidate(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (!items.length) return <div style={{ color: 'var(--ink-3)', paddingTop: 40, textAlign: 'center' }}>没有待确认的记忆 ✓</div>;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Review Inbox <span style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 400 }}>· {items.length} 项待确认</span></div>
      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((item) => (
          <div key={item.id} className="card" style={{ padding: '15px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 99, background: item.level === 'L5' ? 'var(--l5-bg)' : 'var(--l4-bg)', color: item.level === 'L5' ? 'var(--l5-fg)' : 'var(--l4-fg)', border: `1px solid ${item.level === 'L5' ? 'var(--l5-line)' : 'var(--l4-line)'}` }}>{item.level}</span>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 8 }}>{item.content}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 12 }}>{item.reason}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => confirm(item.id)}>✓ 确认入库</button>
              <button className="btn btn-soft btn-sm" onClick={() => setItems((p) => p.filter((i) => i.id !== item.id))}>忽略</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write options entry files**

```typescript
// src/entrypoints/options/main.tsx
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter><App /></BrowserRouter>
);
```

```html
<!-- src/entrypoints/options.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><title>AI Memory — 控制台</title></head>
<body style="margin:0">
  <div id="root"></div>
  <script type="module" src="options/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 6: Commit**

```bash
git add extension/src/entrypoints/options/
git commit -m "feat: options_page Console (CaptureList, ReviewInbox, Settings)"
```

---

### Task 14: Full Build & Integration Verification

- [ ] **Step 1: Run all unit tests**

```bash
cd extension && bunx vitest run
```
Expected: All tests PASS (hash / sensitive / extractor / context-pack)

- [ ] **Step 2: TypeScript strict check**

```bash
bunx tsc --noEmit
```
Expected: Zero errors

- [ ] **Step 3: Build extension**

```bash
bun run wxt build
```
Expected: `extension/.output/chrome-mv3/` generated, no errors

- [ ] **Step 4: Load in Chrome and manual smoke test**

1. Open `chrome://extensions` → Enable Developer Mode
2. Click "Load unpacked" → select `extension/.output/chrome-mv3/`
3. Navigate to `https://chatgpt.com` with an active conversation
4. Click the extension icon → verify "保存预览" Popup loads with message count
5. Click "保存到 AI Memory" → verify "已保存到 AI Memory" success screen
6. Click "查看控制台" → verify Capture appears in list
7. Navigate to Settings → enter a valid Claude API key → click "验证并保存" → verify "已连接"
8. Go back to a ChatGPT conversation → save again → verify AI summary appears in Console detail
9. In Settings → click "导出 .sqlite 文件" → verify file downloads
10. Open downloaded `.sqlite` with DB Browser for SQLite → verify all tables and data

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: V0.1 AI Memory Capture Extension — complete local-first Chrome extension"
```
