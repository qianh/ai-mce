import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dbInit } from '../../../db/bridge';
import { listCaptures } from '../../../db/repos/captures';
import type { Capture } from '../../../lib/types';

export default function CaptureList() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    dbInit().then(() => listCaptures()).then((list) => { setCaptures(list); setLoading(false); });
  }, []);

  if (loading) return <div style={{ color: 'var(--ink-3)', paddingTop: 40, textAlign: 'center' }}>加载中…</div>;

  if (!captures.length) return (
    <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--ink-3)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)' }}>还没有保存记录</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>在 ChatGPT 点击插件图标，开始保存你的第一次对话</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
        Captures <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-3)' }}>· {captures.length} 条</span>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {captures.map((c, i) => (
          <div
            key={c.id}
            onClick={() => navigate(`/capture/${c.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < captures.length - 1 ? '1px solid var(--line)' : 'none', cursor: 'pointer' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.source_title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
                {c.source_platform} · {new Date(c.created_at).toLocaleString('zh-CN')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
