import type { ExtractedConversation } from '../../../lib/types';

interface Props { conversation: ExtractedConversation; onSave: (c: ExtractedConversation) => void }

export default function SaveScreen({ conversation, onSave }: Props) {
  const msgCount = conversation.content.messages.length;
  const charCount = conversation.content.messages.reduce((n, m) => n + m.content.length, 0);
  const conf = conversation.extraction_quality.confidence;

  return (
    <div className="scr" style={{ width: 392 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 18px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>AI Memory Capture</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>当前页面 · AI 对话</div>
        </div>
      </div>

      <div style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>检测结果</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface-2)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-display)' }}>{msgCount}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>条消息</div>
          </div>
          <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />
          <div style={{ flex: 1, paddingLeft: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-display)' }}>{(charCount / 1000).toFixed(1)}k</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>字数（约）</div>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'var(--ok-bg)', color: 'var(--ok-fg)', border: '1px solid color-mix(in oklab, var(--ok-fg) 28%, transparent)', whiteSpace: 'nowrap' }}>
            ✓ {conf >= 0.8 ? '识别完整' : '部分识别'}
          </span>
        </div>
      </div>

      <div style={{ padding: '0 18px 14px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 11.5, color: 'var(--ink-3)' }}>
          <span style={{ color: 'var(--ok-fg)' }}>✓</span>
          <span>将保存：页面标题 · URL · 选择的对话 · 保存时间</span>
          <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>✕ 不含 Cookie · 历史 · 其他标签页</span>
        </div>
      </div>

      <div style={{ padding: '14px 18px', background: 'var(--surface-2)' }}>
        <button
          onClick={() => onSave(conversation)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px 16px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
        >
          ⚡ 保存到 AI Memory
        </button>
        <div style={{ textAlign: 'center', marginTop: 9, fontSize: 11, color: 'var(--ink-3)' }}>
          🔒 仅在你点击时保存 · 不读取其他标签页
        </div>
      </div>
    </div>
  );
}
