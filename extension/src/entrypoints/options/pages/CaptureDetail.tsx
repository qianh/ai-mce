import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { deleteCapture } from '../../../db/repos/captures';
import { listCandidatesForCapture, confirmCandidate } from '../../../db/repos/memories';
import { getContextPackForCapture } from '../../../db/repos/context-packs';
import type { MemoryCandidateRow, ContextPack } from '../../../lib/types';

export default function CaptureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<MemoryCandidateRow[]>([]);
  const [pack, setPack] = useState<ContextPack | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    listCandidatesForCapture(id).then(setCandidates);
    getContextPackForCapture(id).then(setPack);
  }, [id]);

  const handleConfirm = async (candidateId: string) => {
    await confirmCandidate(candidateId);
    if (id) setCandidates(await listCandidatesForCapture(id));
  };

  const handleDelete = async () => {
    if (!id) return;
    if (confirm('确认删除此 Capture？此操作不可撤销。')) {
      await deleteCapture(id);
      navigate('/');
    }
  };

  const copyPack = async () => {
    if (pack) {
      await navigator.clipboard.writeText(pack.content_markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const levelStyle = (level: string) => {
    const map: Record<string, { bg: string; color: string; border: string }> = {
      L5: { bg: 'var(--l5-bg)', color: 'var(--l5-fg)', border: 'var(--l5-line)' },
      L4: { bg: 'var(--l4-bg)', color: 'var(--l4-fg)', border: 'var(--l4-line)' },
      L3: { bg: 'var(--l3-bg)', color: 'var(--l3-fg)', border: 'var(--l3-line)' },
      L2: { bg: 'var(--l2-bg)', color: 'var(--l2-fg)', border: 'var(--l2-line)' },
      L1: { bg: 'var(--l1-bg)', color: 'var(--l1-fg)', border: 'var(--l1-line)' },
      L0: { bg: 'var(--l0-bg)', color: 'var(--l0-fg)', border: 'var(--l0-line)' },
    };
    return map[level] ?? map['L0']!;
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 13 }}>← 返回</button>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Capture 详情</div>
        <button onClick={handleDelete} style={{ padding: '7px 13px', borderRadius: 7, border: '1px solid color-mix(in oklab, var(--danger-fg) 35%, transparent)', background: 'transparent', color: 'var(--danger-fg)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          删除
        </button>
      </div>

      {pack && (
        <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 15px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Context Pack</span>
            <button onClick={copyPack} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              {copied ? '已复制 ✓' : '复制'}
            </button>
          </div>
          <pre style={{ padding: '13px 15px', fontSize: 11.5, lineHeight: 1.7, color: 'var(--ink-2)', background: 'var(--surface-2)', fontFamily: 'var(--font-mono)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {pack.content_markdown}
          </pre>
        </div>
      )}

      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
        候选记忆 <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 13 }}>· {candidates.length} 条</span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {candidates.map((c) => {
          const ls = levelStyle(c.level);
          return (
            <div key={c.id} className="card" style={{ padding: '13px 15px', borderColor: c.status === 'pending' ? ls.border : 'var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: ls.bg, color: ls.color, border: `1px solid ${ls.border}` }}>{c.level}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: c.status === 'confirmed' ? 'var(--ok-bg)' : c.status === 'pending' ? 'var(--warn-bg)' : 'var(--surface-3)', color: c.status === 'confirmed' ? 'var(--ok-fg)' : c.status === 'pending' ? 'var(--warn-fg)' : 'var(--ink-3)' }}>
                  {c.status === 'confirmed' ? '已入库' : c.status === 'pending' ? '待确认' : '已忽略'}
                </span>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 6 }}>{c.content}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: c.status === 'pending' ? 10 : 0 }}>{c.reason}</div>
              {c.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleConfirm(c.id)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✓ 确认入库</button>
                  <button onClick={() => setCandidates((prev) => prev.map((x) => x.id === c.id ? { ...x, status: 'ignored' } : x))} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>忽略</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
