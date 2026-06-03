import type { ExtractedConversation, SensitiveResult } from '../../../lib/types';

interface Props { conversation: ExtractedConversation; sensitive: SensitiveResult; onSave: (c: ExtractedConversation) => void }

export default function SensitiveScreen({ conversation, sensitive, onSave }: Props) {
  return (
    <div className="scr" style={{ width: 392, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger-fg)', marginBottom: 10 }}>
        ⚠️ 检测到 {sensitive.matches.length} 处可能的敏感信息
      </div>
      <div style={{ display: 'grid', gap: 7, marginBottom: 16 }}>
        {sensitive.matches.map((m, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--line-2)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger-fg)', textTransform: 'uppercase' }}>{m.type}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-2)', flex: 1 }}>{m.masked}</span>
            <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>msg #{m.message_index}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <button
          onClick={() => onSave(conversation)}
          style={{ padding: '10px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600 }}
        >
          仍然保存（含敏感内容）
        </button>
        <button
          onClick={() => window.close()}
          style={{ padding: '10px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600 }}
        >
          取消
        </button>
      </div>
    </div>
  );
}
