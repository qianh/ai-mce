import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listCaptures, getCapture, deleteCapture } from '../lib/api';
import { clearTokens } from '../lib/auth';
import { PLATFORM_LABELS, platformLabel, isDesktop as checkDesktop, formatDate } from '../lib/utils';
import type { CaptureListItem, CaptureDetail, Message } from '../lib/types';
import { isCurrentDetailRequest } from './captureDetailState';
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaptureDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailNotFound, setDetailNotFound] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const cancelRef = useRef<{ cancelled: boolean } | null>(null);
  const detailRequestRef = useRef(0);
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

  function openDetail(id: string) {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    setDetailNotFound(false);
    setDetailError('');
    setConfirmDelete(false);
    setDeleteError('');
    getCapture(id)
      .then(nextDetail => {
        if (!isCurrentDetailRequest(detailRequestRef.current, requestId)) return;
        setDetail(nextDetail);
      })
      .catch((err) => {
        if (!isCurrentDetailRequest(detailRequestRef.current, requestId)) return;
        if (err instanceof ApiError && err.status === 404) {
          setDetailNotFound(true);
          return;
        }
        setDetailError(err instanceof Error ? err.message : '详情加载失败');
      })
      .finally(() => {
        if (isCurrentDetailRequest(detailRequestRef.current, requestId)) {
          setDetailLoading(false);
        }
      });
  }

  function closeDetail() {
    detailRequestRef.current += 1;
    setSelectedId(null);
    setDetail(null);
    setDetailNotFound(false);
    setDetailError('');
    setDetailLoading(false);
    setConfirmDelete(false);
    setDeleteError('');
  }

  async function handleDelete() {
    if (!selectedId) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteCapture(selectedId);
      setCaptures(prev => prev.filter(c => c.id !== selectedId));
      closeDetail();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
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
                const desktop = checkDesktop(c);
                return (
                  <div
                    key={c.id}
                    className="cap-row cap-trow"
                    role="row"
                    onClick={() => openDetail(c.id)}
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

        {selectedId && (
          <div className="cap-modal-overlay" onClick={closeDetail}>
            <div className="cap-modal" onClick={e => e.stopPropagation()}>
              {detailLoading && (
                <div className="cap-modal-state">加载中…</div>
              )}
              {detailNotFound && (
                <div className="cap-modal-state">记录不存在</div>
              )}
              {!detailLoading && detailError && (
                <div className="cap-modal-state">{detailError}</div>
              )}
              {!detailLoading && !detailNotFound && !detailError && detail && (() => {
                const desktop = checkDesktop(detail);
                return (
                  <>
                    <div className="cap-modal-header">
                      <div className="cap-modal-meta">
                        <h2 className="cap-modal-title">{detail.source_title || '(无标题)'}</h2>
                        <div className="cap-modal-tags">
                          <span className="cap-modal-pill">{PLATFORM_LABELS[detail.source_platform] ?? detail.source_platform}</span>
                          <span className={`cap-modal-pill ${desktop ? 'cap-modal-pill-desktop' : 'cap-modal-pill-ext'}`}>
                            {desktop ? '桌面端' : '浏览器端'}
                          </span>
                          <span className="cap-modal-info">{formatDate(detail.created_at)}</span>
                          <span className="cap-modal-info">{detail.message_count} 条消息</span>
                        </div>
                      </div>
                      <div className="cap-modal-actions">
                        {!confirmDelete ? (
                          <button className="cap-modal-btn cap-modal-btn-danger" onClick={() => setConfirmDelete(true)}>删除</button>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: 'var(--cap-ink-2)' }}>确认删除？</span>
                            <button className="cap-modal-btn cap-modal-btn-danger" disabled={deleting} onClick={handleDelete}>
                              {deleting ? '删除中…' : '确认'}
                            </button>
                            <button className="cap-modal-btn" onClick={() => setConfirmDelete(false)}>取消</button>
                          </div>
                        )}
                        {deleteError && <div style={{ color: '#d70015', fontSize: 12, marginTop: 6 }}>{deleteError}</div>}
                      </div>
                      <button className="cap-modal-close" onClick={closeDetail} aria-label="关闭">✕</button>
                    </div>
                    <div className="cap-modal-body">
                      {(detail.messages as Message[]).map((msg, i) => {
                        const roleClass = msg.role === 'user' ? 'cap-msg-user' : msg.role === 'tool' ? 'cap-msg-tool' : 'cap-msg-ai';
                        const bubbleClass = msg.role === 'user' ? 'cap-msg-bubble-user' : msg.role === 'tool' ? 'cap-msg-bubble-tool' : 'cap-msg-bubble-ai';
                        const roleLabel = msg.role === 'user' ? '用户' : msg.role === 'tool' ? 'Tool' : 'AI';
                        return (
                          <div key={i} className={`cap-msg ${roleClass}`}>
                            <div className="cap-msg-role">{roleLabel}</div>
                            <div className={`cap-msg-bubble ${bubbleClass}`}>
                              {msg.content}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
