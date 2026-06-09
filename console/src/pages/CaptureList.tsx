import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listCaptures } from '../lib/api';
import { clearTokens } from '../lib/auth';
import { PLATFORM_LABELS, platformLabel, isDesktop, formatDate } from '../lib/utils';
import type { CaptureListItem } from '../lib/types';
import './captures.css';

const PAGE_SIZE = 20;

const CHAN_COLORS: Record<string, string> = {
  claude:   '#cc7c5e',
  codex:    '#10a37f',
  grok:     '#0a0a0a',
  chatgpt:  '#10a37f',
  cursor:   '#3b82f6',
  gemini:   '#8b5cf6',
  opencode: '#6b7280',
  deepseek: '#3b82f6',
};

function DocIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M4 1.5h5l3 3V14a.5.5 0 01-.5.5h-7A.5.5 0 014 14V2a.5.5 0 010-.5z"/>
      <path d="M9 1.5V4.5h3" strokeLinejoin="round"/>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="4.5"/>
      <path d="M10.5 10.5L14 14" strokeLinecap="round"/>
    </svg>
  );
}

export default function CaptureList() {
  const [captures, setCaptures] = useState<CaptureListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [retryKey, setRetryKey] = useState(0);
  const [sourceSide, setSourceSide] = useState<'' | 'browser' | 'desktop'>('');
  const [sourcePlatform, setSourcePlatform] = useState('');
  const cancelRef = useRef<{ cancelled: boolean } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (cancelRef.current) cancelRef.current.cancelled = true;
    const token = { cancelled: false };
    cancelRef.current = token;
    setLoading(true);
    listCaptures({
      source_side: sourceSide || undefined,
      source_platform: sourcePlatform || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })
      .then(rows => {
        if (token.cancelled) return;
        setCaptures(rows);
        setHasNext(rows.length === PAGE_SIZE);
        setError('');
      })
      .catch(err => {
        if (token.cancelled) return;
        setError(err instanceof Error ? err.message : '加载失败');
      })
      .finally(() => { if (!token.cancelled) setLoading(false); });
  }, [page, sourceSide, sourcePlatform, retryKey]);

  function handleSideChange(val: typeof sourceSide) {
    setPage(1);
    setSourceSide(val);
  }

  function handlePlatformChange(val: string) {
    setPage(1);
    setSourcePlatform(val);
  }

  function handleLogout() {
    clearTokens();
    navigate('/login', { replace: true });
  }

  const showPager = !loading && !error && (captures.length > 0 || page > 1);
  const countText = loading
    ? '加载中…'
    : error
    ? ''
    : `共 ${captures.length}${hasNext ? '+' : ''} 条记录`;

  return (
    <div className="cap-page">
      <div className="cap-wrap">

        <header className="cap-head">
          <div>
            <h1 className="cap-h1">Captures</h1>
            <div className="cap-sub">{countText}</div>
          </div>
          <button className="cap-logout" onClick={handleLogout}>退出</button>
        </header>

        <div className="cap-filters">
          <div className="cap-sel">
            <select
              aria-label="端侧筛选"
              value={sourceSide}
              onChange={e => handleSideChange(e.target.value as typeof sourceSide)}
            >
              <option value="">全部端侧</option>
              <option value="browser">浏览器端</option>
              <option value="desktop">桌面端</option>
            </select>
          </div>
          <div className="cap-sel">
            <select
              aria-label="渠道筛选"
              value={sourcePlatform}
              onChange={e => handlePlatformChange(e.target.value)}
            >
              <option value="">全部渠道</option>
              {Object.entries(PLATFORM_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }} />
          <div className="cap-search">
            <SearchIcon />
            搜索 Capture…
          </div>
        </div>

        {loading && (
          <div className="cap-state-center">加载中…</div>
        )}

        {error && !loading && (
          <div className="cap-state-center">
            <div className="cap-error-msg">{error}</div>
            <button className="cap-retry-btn" onClick={() => setRetryKey(k => k + 1)}>重试</button>
          </div>
        )}

        {!loading && !error && captures.length === 0 && (
          <div className="cap-empty">没有匹配的 Capture</div>
        )}

        {!loading && !error && captures.length > 0 && (
          <div className="cap-table">
            <div className="cap-row cap-thead" role="row">
              <span className="cap-th">标题</span>
              <span className="cap-th">渠道</span>
              <span className="cap-th">端侧</span>
              <span className="cap-th cap-th-right">消息数</span>
              <span className="cap-th cap-th-right">时间</span>
            </div>
            <div>
              {captures.map(c => {
                const dot = CHAN_COLORS[c.source_platform] ?? '#9a9a9f';
                const desktop = isDesktop(c);
                return (
                  <div
                    key={c.id}
                    className="cap-row cap-trow"
                    role="row"
                    onClick={() => navigate(`/capture/${c.id}`)}
                  >
                    <div className="cap-title-cell">
                      <span className="cap-ficon"><DocIcon /></span>
                      <span className="cap-title-txt" title={c.source_title || '(无标题)'}>
                        {c.source_title || '(无标题)'}
                      </span>
                    </div>
                    <div>
                      <span className="cap-chan">
                        <span className="cap-chan-dot" style={{ background: dot }} />
                        <span className="cap-chan-nm">{platformLabel(c.source_platform)}</span>
                      </span>
                    </div>
                    <div>
                      <span className={`cap-client ${desktop ? 'cap-client-desktop' : 'cap-client-ext'}`}>
                        <span className="cap-client-dot" />
                        {desktop ? '桌面端' : '浏览器端'}
                      </span>
                    </div>
                    <div className={`cap-count cap-tnum${c.message_count >= 100 ? ' cap-count-hi' : ''}`}>
                      {c.message_count}
                    </div>
                    <div className="cap-time cap-tnum">
                      {formatDate(c.created_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showPager && (
          <div className="cap-pager">
            <button className="cap-pager-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              ← 上一页
            </button>
            <span className="cap-pager-page">第 {page} 页</span>
            <button className="cap-pager-btn" disabled={!hasNext} onClick={() => setPage(p => p + 1)}>
              下一页 →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
