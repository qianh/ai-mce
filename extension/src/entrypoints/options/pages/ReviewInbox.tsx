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
  const ignore = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  if (!items.length) return (
    <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--ink-3)' }}>
      <div style={{ fontSize: 24, marginBottom: 12 }}>✓</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)' }}>没有待确认的记忆</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
        Review Inbox <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-3)' }}>· {items.length} 项待确认</span>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((item) => {
          const isL5 = item.level === 'L5';
          return (
            <div key={item.id} className="card" style={{ padding: '15px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: isL5 ? 'var(--l5-bg)' : 'var(--l4-bg)', color: isL5 ? 'var(--l5-fg)' : 'var(--l4-fg)', border: `1px solid ${isL5 ? 'var(--l5-line)' : 'var(--l4-line)'}` }}>
                  {item.level}
                </span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--warn-bg)', color: 'var(--warn-fg)', fontWeight: 600 }}>
                  {isL5 ? '核心决策' : '长期偏好'}
                </span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 6 }}>{item.content}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 12 }}>{item.reason}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => confirm(item.id)} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>✓ 确认入库</button>
                <button onClick={() => ignore(item.id)} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>忽略</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
