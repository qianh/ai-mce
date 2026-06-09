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
