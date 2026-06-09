# Console Captures List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Web Console (`console/`) with login, captures list (dual filters + pagination), capture detail, and delete — plus the API-side filter/pagination params.

**Architecture:** 5 tasks in dependency order: (1) API filter params first so the contract is settled, (2) Bun+React scaffold, (3) auth layer + login page, (4) list page, (5) detail+delete page. Each task is self-contained and commits independently.

**Tech Stack:** Python/FastAPI (api-server), Bun + React 19 + React Router 7 (console), TypeScript, `bun test` for frontend tests, `pytest` for API tests.

---

### Task 1: API — Add filter/pagination params to GET /v1/captures

**Files:**
- Modify: `api-server/app/supabase_client.py` (update `list_captures` signature)
- Modify: `api-server/app/routes/captures.py` (add Query params)
- Modify: `api-server/tests/test_captures.py` (update `FakeSupabaseClient.list_captures`, add filter tests)

- [ ] **Step 1: Write failing tests for source_side, source_platform, pagination, limit validation**

Add to `api-server/tests/test_captures.py` after the existing tests.

First update `FakeSupabaseClient.list_captures` (around line 35):

```python
    def list_captures(
        self,
        user_id: str,
        source_side: str | None = None,
        source_platform: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[dict]:
        rows = list(self.captures.get(user_id, []))
        if source_side == "browser":
            rows = [r for r in rows if r["source_url"] != "desktop"]
        elif source_side == "desktop":
            rows = [r for r in rows if r["source_url"] == "desktop"]
        if source_platform:
            rows = [r for r in rows if r["source_platform"] == source_platform]
        return rows[offset : offset + limit]
```

Then add a helper and four new tests at the bottom of the file:

```python
def desktop_payload(title: str = "Desktop cap", platform: str = "claude") -> dict:
    return {
        "source": {
            "platform": platform,
            "url": "desktop",
            "browser_title": title,
            "captured_at": "2026-06-05T10:00:00.000Z",
        },
        "content": {
            "title": title,
            "messages": [{"role": "user", "content": "hello", "index": 0}],
        },
        "extraction_quality": {"confidence": 0.9, "method": "dom_attr", "warnings": [], "message_count": 1, "empty_message_count": 0},
        "hashes": {
            "content_hash": f"desktop-hash-{title}",
            "message_hashes": ["m1"],
            "source_fingerprint": f"desktop:{platform}:{title}",
        },
        "metadata": {},
    }


def test_list_captures_filter_source_side_browser():
    client = make_client()
    token = register(client, "side@example.com")

    client.post("/v1/captures", json=payload(title="Browser cap"), headers=auth(token))
    client.post("/v1/captures", json=desktop_payload(title="Desktop cap"), headers=auth(token))

    resp = client.get("/v1/captures?source_side=browser", headers=auth(token))
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["source_url"] != "desktop"


def test_list_captures_filter_source_side_desktop():
    client = make_client()
    token = register(client, "desk@example.com")

    client.post("/v1/captures", json=payload(title="Browser cap"), headers=auth(token))
    client.post("/v1/captures", json=desktop_payload(title="Desktop cap"), headers=auth(token))

    resp = client.get("/v1/captures?source_side=desktop", headers=auth(token))
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["source_url"] == "desktop"


def test_list_captures_filter_source_platform():
    client = make_client()
    token = register(client, "plat@example.com")

    client.post("/v1/captures", json=payload(title="ChatGPT cap"), headers=auth(token))
    client.post("/v1/captures", json=desktop_payload(title="Claude cap", platform="claude"), headers=auth(token))

    resp = client.get("/v1/captures?source_platform=chatgpt", headers=auth(token))
    assert resp.status_code == 200
    assert all(r["source_platform"] == "chatgpt" for r in resp.json())


def test_list_captures_pagination():
    client = make_client()
    token = register(client, "page@example.com")

    for i in range(5):
        p = payload(title=f"Cap {i}", fingerprint=f"fp:{i}")
        p["hashes"]["content_hash"] = f"hash-pg-{i}"
        client.post("/v1/captures", json=p, headers=auth(token))

    page1 = client.get("/v1/captures?limit=2&offset=0", headers=auth(token))
    assert len(page1.json()) == 2

    page2 = client.get("/v1/captures?limit=2&offset=2", headers=auth(token))
    assert len(page2.json()) == 2

    last = client.get("/v1/captures?limit=2&offset=4", headers=auth(token))
    assert len(last.json()) == 1


def test_list_captures_limit_over_100_is_422():
    client = make_client()
    token = register(client, "lim@example.com")
    resp = client.get("/v1/captures?limit=101", headers=auth(token))
    assert resp.status_code == 422
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd api-server && python -m pytest tests/test_captures.py -v -k "filter or pagination or limit_over" 2>&1 | tail -20
```

Expected: FAIL (TypeError — `list_captures()` got unexpected keyword arguments)

- [ ] **Step 3: Update `supabase_client.py` — add params to `list_captures`**

Replace the existing `list_captures` method (lines 112–121):

```python
    def list_captures(
        self,
        user_id: str,
        source_side: str | None = None,
        source_platform: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "select": "*",
            "user_id": f"eq.{user_id}",
            "order": "created_at.desc",
            "limit": str(limit),
            "offset": str(offset),
        }
        if source_side == "browser":
            params["source_url"] = "neq.desktop"
        elif source_side == "desktop":
            params["source_url"] = "eq.desktop"
        if source_platform:
            params["source_platform"] = f"eq.{source_platform}"
        return self._request("GET", "/rest/v1/captures", params=params)
```

- [ ] **Step 4: Update `routes/captures.py` — add Query params to `list_captures` endpoint**

Add `Query` to the fastapi import at the top:
```python
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
```

Replace the existing `list_captures` route function:

```python
@router.get("", response_model=list[CaptureListItem])
def list_captures(
    source_side: str | None = Query(default=None, pattern="^(browser|desktop)$"),
    source_platform: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(current_user_id),
    client: SupabaseRestClient = Depends(get_supabase_client),
) -> list[CaptureListItem]:
    try:
        return [
            _capture_item(row)
            for row in client.list_captures(
                user_id,
                source_side=source_side,
                source_platform=source_platform,
                limit=limit,
                offset=offset,
            )
        ]
    except SupabaseApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
```

- [ ] **Step 5: Run all API tests to confirm green**

```bash
cd api-server && python -m pytest tests/ -v 2>&1 | tail -30
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add api-server/app/supabase_client.py api-server/app/routes/captures.py api-server/tests/test_captures.py
git commit -m "feat: add source_side/source_platform/limit/offset filter params to GET /v1/captures"
```

---

### Task 2: Console — Project scaffold (Bun + React 19)

**Files:**
- Create: `console/package.json`
- Create: `console/tsconfig.json`
- Create: `console/index.html`
- Create: `console/server.ts`
- Create: `console/src/tokens.css` (copy from extension)
- Create: `console/src/main.tsx`
- Create: `console/src/App.tsx` (stub with placeholder routes)
- Create: `console/CLAUDE.md`

- [ ] **Step 1: Create `console/package.json`**

```json
{
  "name": "mce-console",
  "private": true,
  "scripts": {
    "dev": "bun --hot server.ts",
    "test": "bun test"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.6.2"
  },
  "devDependencies": {
    "@types/react": "^19.1.6",
    "@types/react-dom": "^19.1.5",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create `console/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 3: Create `console/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Memory Console</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 4: Create `console/server.ts`**

```typescript
import index from "./index.html";

Bun.serve({
  routes: { "/*": index },
  development: { hmr: true, console: true },
});

console.log("Console running at http://localhost:3000");
```

- [ ] **Step 5: Copy tokens.css from extension**

```bash
cp extension/src/assets/tokens.css console/src/tokens.css
```

- [ ] **Step 6: Create `console/src/main.tsx`**

```tsx
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './tokens.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
```

- [ ] **Step 7: Create `console/src/App.tsx` (stub)**

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';

export default function App() {
  return (
    <div className="scr" style={{ minHeight: '100vh' }}>
      <Routes>
        <Route path="/login" element={<div>Login (coming)</div>} />
        <Route path="/" element={<div>List (coming)</div>} />
        <Route path="/capture/:id" element={<div>Detail (coming)</div>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
```

- [ ] **Step 8: Create `console/CLAUDE.md`**

```markdown
# Console — Web Console

Standalone Bun + React 19 web app. Run: `bun run dev` (port 3000).
API Server: http://localhost:8008
```

- [ ] **Step 9: Install dependencies and verify dev server starts**

```bash
cd console && bun install && bun run dev
```

Open http://localhost:3000 — should show "List (coming)".

- [ ] **Step 10: Commit**

```bash
git add console/
git commit -m "feat: scaffold console/ Bun+React19 project with routing stub"
```

---

### Task 3: Auth layer — types, api client, auth module, login page

**Files:**
- Create: `console/src/lib/types.ts`
- Create: `console/src/lib/auth.ts`
- Create: `console/src/lib/api.ts`
- Create: `console/src/pages/Login.tsx`
- Modify: `console/src/App.tsx` (wire login page + route guard)

- [ ] **Step 1: Write failing test for auth module**

Create `console/src/lib/auth.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import { getTokens, setTokens, clearTokens, isLoggedIn } from './auth';

beforeEach(() => {
  localStorage.clear();
});

describe('auth', () => {
  test('isLoggedIn returns false when no tokens stored', () => {
    expect(isLoggedIn()).toBe(false);
  });

  test('isLoggedIn returns true after setTokens', () => {
    setTokens('acc-tok', 'ref-tok');
    expect(isLoggedIn()).toBe(true);
  });

  test('getTokens returns null when nothing stored', () => {
    expect(getTokens()).toBeNull();
  });

  test('getTokens returns stored tokens', () => {
    setTokens('acc-tok', 'ref-tok');
    expect(getTokens()).toEqual({ accessToken: 'acc-tok', refreshToken: 'ref-tok' });
  });

  test('clearTokens removes tokens', () => {
    setTokens('acc-tok', 'ref-tok');
    clearTokens();
    expect(isLoggedIn()).toBe(false);
    expect(getTokens()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd console && bun test src/lib/auth.test.ts 2>&1
```

Expected: error — module not found `./auth`

- [ ] **Step 3: Create `console/src/lib/types.ts`**

```typescript
export interface CaptureListItem {
  id: string;
  source_platform: string;
  source_url: string;
  source_title: string;
  content_hash: string;
  source_fingerprint: string;
  extraction_quality: Record<string, unknown>;
  metadata: Record<string, unknown>;
  analysis_status: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  index: number;
}

export interface CaptureDetail extends CaptureListItem {
  messages: Message[];
}

export interface ListParams {
  source_side?: 'browser' | 'desktop';
  source_platform?: string;
  limit?: number;
  offset?: number;
}
```

- [ ] **Step 4: Create `console/src/lib/auth.ts`**

```typescript
const ACCESS_KEY = 'mce_access_token';
const REFRESH_KEY = 'mce_refresh_token';

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function getTokens(): { accessToken: string; refreshToken: string } | null {
  const accessToken = localStorage.getItem(ACCESS_KEY);
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function isLoggedIn(): boolean {
  return getTokens() !== null;
}
```

- [ ] **Step 5: Run auth tests to confirm green**

```bash
cd console && bun test src/lib/auth.test.ts 2>&1
```

Expected: all PASS

- [ ] **Step 6: Create `console/src/lib/api.ts`**

```typescript
import { getTokens, setTokens, clearTokens } from './auth';
import type { CaptureListItem, CaptureDetail, ListParams } from './types';

const BASE_URL = 'http://localhost:8008';

async function request<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const tokens = getTokens();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (tokens) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }

  const resp = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (resp.status === 401 && !retried && tokens) {
    const refreshed = await tryRefresh(tokens.refreshToken);
    if (refreshed) {
      return request<T>(path, options, true);
    }
    clearTokens();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${resp.status}`);
  }

  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

async function tryRefresh(refreshToken: string): Promise<boolean> {
  try {
    const resp = await fetch(`${BASE_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export async function login(email: string, password: string): Promise<void> {
  const data = await request<{ access_token: string; refresh_token: string }>(
    '/v1/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  setTokens(data.access_token, data.refresh_token);
}

export async function listCaptures(params: ListParams = {}): Promise<CaptureListItem[]> {
  const qs = new URLSearchParams();
  if (params.source_side) qs.set('source_side', params.source_side);
  if (params.source_platform) qs.set('source_platform', params.source_platform);
  qs.set('limit', String(params.limit ?? 20));
  qs.set('offset', String(params.offset ?? 0));
  return request<CaptureListItem[]>(`/v1/captures?${qs}`);
}

export async function getCapture(id: string): Promise<CaptureDetail> {
  return request<CaptureDetail>(`/v1/captures/${id}`);
}

export async function deleteCapture(id: string): Promise<void> {
  return request<void>(`/v1/captures/${id}`, { method: 'DELETE' });
}
```

- [ ] **Step 7: Create `console/src/pages/Login.tsx`**

```tsx
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--paper)' }}>
      <div className="card" style={{ width: 360, padding: 32 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, fontFamily: 'var(--font-display)' }}>
          AI Memory Console
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--ink-2)' }}>
              邮箱
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
              style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-ui)', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--ink-2)' }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-ui)', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          {error && (
            <div style={{ color: 'var(--danger-fg)', fontSize: 13, marginBottom: 14 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-block"
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Update `console/src/App.tsx` with route guard + real login page**

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { isLoggedIn } from './lib/auth';
import Login from './pages/Login';

function RequireAuth({ children }: { children: React.ReactNode }) {
  return isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <div className="scr" style={{ minHeight: '100vh' }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><div>List (coming)</div></RequireAuth>} />
        <Route path="/capture/:id" element={<RequireAuth><div>Detail (coming)</div></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
```

- [ ] **Step 9: Manual verify — login flow works**

```bash
cd console && bun run dev
```

1. Open http://localhost:3000 → should redirect to /login
2. Enter credentials used in `mce-scanner login` → should redirect to "/" showing "List (coming)"
3. Refresh page → should stay on "/" (tokens in localStorage)
4. Open DevTools → Application → Local Storage → should see `mce_access_token` and `mce_refresh_token`

- [ ] **Step 10: Commit**

```bash
git add console/src/lib/ console/src/pages/Login.tsx console/src/App.tsx
git commit -m "feat: add auth layer (token management, api client, login page) to console"
```

---

### Task 4: Captures list page with filters and pagination

**Files:**
- Create: `console/src/pages/CaptureList.tsx`
- Modify: `console/src/App.tsx` (wire real CaptureList)

- [ ] **Step 1: Create `console/src/pages/CaptureList.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listCaptures } from '../lib/api';
import { clearTokens } from '../lib/auth';
import type { CaptureListItem, ListParams } from '../lib/types';

const PAGE_SIZE = 20;

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  deepseek: 'DeepSeek',
  claude: 'Claude Code',
  codex: 'Codex',
  grok: 'Grok',
  opencode: 'OpenCode',
};

function platformLabel(p: string): string {
  return PLATFORM_LABELS[p] ?? p;
}

function isDesktop(item: CaptureListItem): boolean {
  return item.source_url === 'desktop';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function CaptureList() {
  const [captures, setCaptures] = useState<CaptureListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sourceSide, setSourceSide] = useState<'' | 'browser' | 'desktop'>('');
  const [sourcePlatform, setSourcePlatform] = useState('');
  const offsetRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();

  async function load(params: ListParams, append: boolean) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const rows = await listCaptures(params);
      if (ctrl.signal.aborted) return;
      setCaptures(append ? (prev) => [...prev, ...rows] : rows);
      setHasMore(rows.length === PAGE_SIZE);
      setError('');
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }

  useEffect(() => {
    offsetRef.current = 0;
    setLoading(true);
    load(
      { source_side: sourceSide || undefined, source_platform: sourcePlatform || undefined, limit: PAGE_SIZE, offset: 0 },
      false,
    ).finally(() => setLoading(false));
  }, [sourceSide, sourcePlatform]);

  async function loadMore() {
    offsetRef.current += PAGE_SIZE;
    setLoadingMore(true);
    await load(
      { source_side: sourceSide || undefined, source_platform: sourcePlatform || undefined, limit: PAGE_SIZE, offset: offsetRef.current },
      true,
    );
    setLoadingMore(false);
  }

  function handleLogout() {
    clearTokens();
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>
          Captures
          {!loading && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-3)', marginLeft: 8 }}>· {captures.length} 条{hasMore ? '+' : ''}</span>}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleLogout}>退出</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          aria-label="端侧筛选"
          value={sourceSide}
          onChange={(e) => setSourceSide(e.target.value as '' | 'browser' | 'desktop')}
          style={{ height: 34, padding: '0 10px', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-ui)', fontSize: 13 }}
        >
          <option value="">全部端侧</option>
          <option value="browser">浏览器端</option>
          <option value="desktop">桌面端</option>
        </select>

        <select
          aria-label="渠道筛选"
          value={sourcePlatform}
          onChange={(e) => setSourcePlatform(e.target.value)}
          style={{ height: 34, padding: '0 10px', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-ui)', fontSize: 13 }}
        >
          <option value="">全部渠道</option>
          {Object.entries(PLATFORM_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div style={{ color: 'var(--ink-3)', textAlign: 'center', paddingTop: 60 }}>加载中…</div>
      )}

      {error && !loading && (
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <div style={{ color: 'var(--danger-fg)', marginBottom: 12 }}>{error}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            offsetRef.current = 0;
            setLoading(true);
            load({ source_side: sourceSide || undefined, source_platform: sourcePlatform || undefined, limit: PAGE_SIZE, offset: 0 }, false).finally(() => setLoading(false));
          }}>重试</button>
        </div>
      )}

      {!loading && !error && captures.length === 0 && (
        <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--ink-3)' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>✦</div>
          <div style={{ fontWeight: 600, color: 'var(--ink-2)' }}>还没有上报记录</div>
        </div>
      )}

      {!loading && !error && captures.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {captures.map((c, i) => (
            <div
              key={c.id}
              onClick={() => navigate(`/capture/${c.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < captures.length - 1 ? '1px solid var(--line)' : 'none', cursor: 'pointer' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.source_title || '(无标题)'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="pill">{platformLabel(c.source_platform)}</span>
                  <span className="pill" style={isDesktop(c) ? { color: 'var(--l4-fg)', background: 'var(--l4-bg)', borderColor: 'var(--l4-line)' } : {}}>
                    {isDesktop(c) ? '桌面端' : '浏览器端'}
                  </span>
                  <span>{c.message_count} 条消息</span>
                  <span>{formatDate(c.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && !loading && !error && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? '加载中…' : '加载更多'}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire CaptureList into `console/src/App.tsx`**

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { isLoggedIn } from './lib/auth';
import Login from './pages/Login';
import CaptureList from './pages/CaptureList';

function RequireAuth({ children }: { children: React.ReactNode }) {
  return isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <div className="scr" style={{ minHeight: '100vh' }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><CaptureList /></RequireAuth>} />
        <Route path="/capture/:id" element={<RequireAuth><div>Detail (coming)</div></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
```

- [ ] **Step 3: Manual verify — list page with filters**

```bash
cd console && bun run dev
```

1. Login and confirm list page loads
2. All captures shown in reverse chronological order
3. Select "桌面端" → list updates, all items show "桌面端" badge
4. Select "Claude Code" channel → list filters further
5. Clear both filters → full list returns
6. If you have >20 captures: "加载更多" button appears; clicking appends next 20

- [ ] **Step 4: Commit**

```bash
git add console/src/pages/CaptureList.tsx console/src/App.tsx
git commit -m "feat: add captures list page with source_side/source_platform filters and pagination"
```

---

### Task 5: Capture detail page with delete

**Files:**
- Create: `console/src/pages/CaptureDetail.tsx`
- Modify: `console/src/App.tsx` (wire real CaptureDetail)

- [ ] **Step 1: Create `console/src/pages/CaptureDetail.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCapture, deleteCapture } from '../lib/api';
import type { CaptureDetail as CaptureDetailType, Message } from '../lib/types';

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  deepseek: 'DeepSeek',
  claude: 'Claude Code',
  codex: 'Codex',
  grok: 'Grok',
  opencode: 'OpenCode',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function CaptureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [capture, setCapture] = useState<CaptureDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!id) return;
    getCapture(id)
      .then(setCapture)
      .catch((err) => {
        if (err instanceof Error && err.message.includes('404')) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteCapture(id);
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '删除失败');
      setDeleting(false);
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', paddingTop: 80, color: 'var(--ink-3)' }}>加载中…</div>;
  }

  if (notFound || !capture) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 80 }}>
        <div style={{ color: 'var(--ink-3)', marginBottom: 16 }}>记录不存在</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← 返回列表</button>
      </div>
    );
  }

  const isDesktop = capture.source_url === 'desktop';

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16 }}>
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ marginBottom: 12 }}>
            ← 返回
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
            {capture.source_title || '(无标题)'}
          </h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pill">{PLATFORM_LABELS[capture.source_platform] ?? capture.source_platform}</span>
            <span className="pill" style={isDesktop ? { color: 'var(--l4-fg)', background: 'var(--l4-bg)', borderColor: 'var(--l4-line)' } : {}}>
              {isDesktop ? '桌面端' : '浏览器端'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{formatDate(capture.created_at)}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{capture.message_count} 条消息</span>
          </div>
        </div>

        <div>
          {!confirmDelete ? (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmDelete(true)}
            >
              删除
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>确认删除？</span>
              <button className="btn btn-danger btn-sm" disabled={deleting} onClick={handleDelete}>
                {deleting ? '删除中…' : '确认'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>取消</button>
            </div>
          )}
          {deleteError && <div style={{ color: 'var(--danger-fg)', fontSize: 12, marginTop: 6 }}>{deleteError}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(capture.messages as Message[]).map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4, paddingLeft: msg.role === 'user' ? 0 : 4 }}>
              {msg.role === 'user' ? '用户' : 'AI'}
            </div>
            <div
              style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: 'var(--r-md)',
                fontSize: 13.5,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--font-ui)',
                background: msg.role === 'user' ? 'var(--accent-soft)' : 'var(--surface)',
                border: '1px solid',
                borderColor: msg.role === 'user' ? 'var(--accent-line)' : 'var(--line)',
                color: 'var(--ink)',
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire CaptureDetail into `console/src/App.tsx`**

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { isLoggedIn } from './lib/auth';
import Login from './pages/Login';
import CaptureList from './pages/CaptureList';
import CaptureDetail from './pages/CaptureDetail';

function RequireAuth({ children }: { children: React.ReactNode }) {
  return isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <div className="scr" style={{ minHeight: '100vh' }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><CaptureList /></RequireAuth>} />
        <Route path="/capture/:id" element={<RequireAuth><CaptureDetail /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
```

- [ ] **Step 3: Manual verify — detail page and delete**

```bash
cd console && bun run dev
```

1. From list, click any capture → detail page loads with messages
2. user messages right-aligned (accent background), AI messages left-aligned (surface background)
3. Click "删除" → confirm prompt appears inline
4. Click "取消" → stays on detail page, no request sent
5. Click "删除" again → "确认" → capture deleted → redirected to list
6. Confirm deleted capture no longer appears in list

- [ ] **Step 4: Run API tests one final time to ensure nothing regressed**

```bash
cd api-server && python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add console/src/pages/CaptureDetail.tsx console/src/App.tsx
git commit -m "feat: add capture detail page with full messages view and delete action"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Login page (email/password) | Task 3 |
| Token persistence + refresh + redirect | Task 3 (auth.ts, api.ts) |
| GET /v1/captures filter params | Task 1 |
| 端侧筛选 (browser/desktop) | Task 1 + Task 4 |
| 渠道筛选 (source_platform) | Task 1 + Task 4 |
| 服务端过滤 | Task 1 |
| limit/offset 分页 | Task 1 + Task 4 |
| created_at 倒序 | Task 1 (order=created_at.desc unchanged) |
| 加载更多按钮 | Task 4 |
| Capture 详情页 messages | Task 5 |
| 删除（二次确认） | Task 5 |
| 删除失败 toast/留页 | Task 5 |
| Bun + React 19 + React Router 7 | Task 2 |
| Design tokens 复用 | Task 2 (copy tokens.css) |
| 向后兼容 (不传参行为不变) | Task 1 (defaults) |

**No placeholders found** — all steps have actual code.

**Type consistency:**
- `CaptureListItem`, `CaptureDetail`, `Message`, `ListParams` defined in `types.ts` (Task 3) and used in Tasks 4 and 5 ✓
- `listCaptures`, `getCapture`, `deleteCapture` defined in `api.ts` (Task 3), called in Tasks 4 and 5 ✓
- `login`, `clearTokens`, `isLoggedIn` defined in Task 3, used in Tasks 3, 4 ✓
- `FakeSupabaseClient.list_captures` updated in Task 1 Step 1 before route is updated ✓
