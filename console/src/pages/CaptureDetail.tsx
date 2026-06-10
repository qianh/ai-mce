import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getCapture, deleteCapture } from '../lib/api';
import { PLATFORM_LABELS, isDesktop as checkDesktop, formatDate } from '../lib/utils';
import type { CaptureDetail as CaptureDetailType, Message } from '../lib/types';

export default function CaptureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [capture, setCapture] = useState<CaptureDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setLoadError('');
    getCapture(id)
      .then(setCapture)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        setLoadError(err instanceof Error ? err.message : '加载失败');
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
        <div style={{ color: 'var(--ink-3)', marginBottom: 16 }}>{loadError || '记录不存在'}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← 返回列表</button>
      </div>
    );
  }

  const isDesktop = checkDesktop(capture);

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
            <span className={isDesktop ? 'pill l4' : 'pill'}>
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
