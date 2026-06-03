import { useState } from 'react';
import type { ProgressStep } from '../../../lib/types';

const STEPS: Array<{ key: ProgressStep['step']; label: string }> = [
  { key: 'writing_local', label: '已写入本地' },
  { key: 'generating_summary', label: '正在生成摘要' },
  { key: 'extracting_memories', label: '正在提取候选记忆' },
  { key: 'building_context_pack', label: '生成 Context Pack' },
];

interface Props { captureId: string; progress: ProgressStep[] }

export default function SuccessScreen({ captureId, progress }: Props) {
  const [copied, setCopied] = useState(false);
  const done = new Set(progress.filter((s) => s.status === 'done').map((s) => s.step));

  const copyPack = () => {
    chrome.runtime.sendMessage({ type: 'GET_CONTEXT_PACK', capture_id: captureId }, (result) => {
      if (result?.markdown) {
        navigator.clipboard.writeText(result.markdown).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }
    });
  };

  return (
    <div className="scr" style={{ width: 392, padding: 18 }}>
      <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-display)', marginBottom: 14 }}>
        ✓ 已保存到 AI Memory
      </div>
      <div style={{ display: 'grid', gap: 9, marginBottom: 16 }}>
        {STEPS.map(({ key, label }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
            <span style={{ width: 17, height: 17, borderRadius: 99, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 10, background: done.has(key) ? 'var(--accent)' : 'var(--line-2)', color: done.has(key) ? 'var(--on-accent)' : 'transparent' }}>
              {done.has(key) ? '✓' : ''}
            </span>
            <span style={{ color: done.has(key) ? 'var(--ink)' : 'var(--ink-3)', fontWeight: done.has(key) ? 600 : 400 }}>{label}</span>
            {!done.has(key) && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--surface-2)', color: 'var(--ink-3)', marginLeft: 'auto' }}>处理中</span>}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <button
          onClick={copyPack}
          style={{ padding: '11px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600 }}
        >
          {copied ? '已复制 ✓' : '复制 Context Pack'}
        </button>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          style={{ padding: '10px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600 }}
        >
          查看控制台 →
        </button>
      </div>
    </div>
  );
}
