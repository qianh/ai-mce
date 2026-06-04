import type { ExtractedConversation } from '../../../lib/types';

interface Props { conversation: ExtractedConversation; onSave: (c: ExtractedConversation) => void; onOpenConsole: () => void }

const ROLE_LABEL: Record<string, string> = {
  user: '你',
  assistant: 'AI',
  system: '系统',
  unknown: '?',
};

const ROLE_COLOR: Record<string, string> = {
  user: 'var(--accent)',
  assistant: 'var(--ok-fg)',
  system: 'var(--ink-3)',
  unknown: 'var(--ink-3)',
};

export default function SaveScreen({ conversation, onSave, onOpenConsole }: Props) {
  const msgs = conversation.content.messages;
  const msgCount = msgs.length;
  const charCount = msgs.reduce((n, m) => n + m.content.length, 0);
  const conf = conversation.extraction_quality.confidence;
  const title = conversation.content.title || conversation.source.browser_title;

  return (
    <div className="scr" style={{ width: 392 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 12px 18px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>AI Memory Capture</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'var(--ok-bg)', color: 'var(--ok-fg)', border: '1px solid color-mix(in oklab, var(--ok-fg) 28%, transparent)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          ✓ {conf >= 0.8 ? '识别完整' : '部分识别'}
        </span>
        <button
          onClick={onOpenConsole}
          style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}
        >
          控制台 ↗
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 0, padding: '8px 18px', borderBottom: '1px solid var(--line-2)', background: 'var(--surface-2)', fontSize: 11.5, color: 'var(--ink-3)' }}>
        <span style={{ marginRight: 16 }}><b style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>{msgCount}</b> 条消息</span>
        <span><b style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>{charCount >= 1000 ? `${(charCount / 1000).toFixed(1)}k` : charCount}</b> 字</span>
      </div>

      {/* Message preview */}
      <div style={{ maxHeight: 240, overflowY: 'auto', padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {msgs.map((msg) => {
          const role = msg.role in ROLE_LABEL ? msg.role : 'unknown';
          const preview = msg.content.length > 120 ? msg.content.slice(0, 120).trimEnd() + '…' : msg.content;
          return (
            <div key={msg.index} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 5, background: role === 'user' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : 'color-mix(in oklab, var(--ok-fg) 12%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: ROLE_COLOR[role] }}>
                {ROLE_LABEL[role]}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55, wordBreak: 'break-all' }}>{preview}</span>
            </div>
          );
        })}
      </div>

      {/* Privacy notice */}
      <div style={{ padding: '0 18px 12px', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 11, color: 'var(--ink-3)', marginTop: 12 }}>
          <span style={{ color: 'var(--ok-fg)' }}>✓</span>
          <span>将保存：页面标题 · URL · 以上对话 · 保存时间</span>
          <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>✕ 不含 Cookie · 历史</span>
        </div>
      </div>

      {/* Save button */}
      <div style={{ padding: '0 18px 14px', background: 'var(--surface-2)', borderTop: '1px solid var(--line)' }}>
        <button
          onClick={() => onSave(conversation)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px 16px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', marginTop: 12 }}
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
