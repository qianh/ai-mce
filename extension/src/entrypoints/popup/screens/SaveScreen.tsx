import type { ExtractedConversation, SensitiveResult, SensitiveType } from '../../../lib/types';

interface Props {
  conversation: ExtractedConversation;
  sensitive?: SensitiveResult | null;
  onSave: (c: ExtractedConversation, confirmedSensitiveUpload?: boolean) => void;
  onOpenConsole: () => void;
}

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

const SENSITIVE_TYPE_LABEL: Record<SensitiveType, string> = {
  api_key: 'API Key',
  token: 'Token',
  email: '邮箱',
  phone: '手机号',
  id_number: '身份证',
  password: '密码',
};

export default function SaveScreen({ conversation, sensitive, onSave, onOpenConsole }: Props) {
  const msgs = conversation.content.messages;
  const msgCount = msgs.length;
  const charCount = msgs.reduce((n, m) => n + m.content.length, 0);
  const conf = conversation.extraction_quality.confidence;
  const title = conversation.content.title || conversation.source.browser_title;
  const sensitiveMatches = sensitive?.matches ?? [];

  const messagePreview = (msg: (typeof msgs)[number]) => {
    const related = sensitiveMatches.filter((match) => match.message_index === msg.index);
    if (related.length > 0 && related[0]?.context) {
      return related[0].context;
    }
    return msg.content.length > 120 ? `${msg.content.slice(0, 120).trimEnd()}…` : msg.content;
  };

  const messageOrdinal = (msg: (typeof msgs)[number]) => {
    const position = msgs.findIndex((item) => item.index === msg.index);
    return position >= 0 ? position + 1 : msg.index + 1;
  };

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
        {sensitiveMatches.length > 0 && (
          <div style={{ border: '1px solid color-mix(in oklab, var(--danger-fg) 26%, var(--line))', background: 'color-mix(in oklab, var(--danger-fg) 8%, var(--surface))', borderRadius: 7, padding: '9px 10px', color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger-fg)' }}>
              ⚠ 检测到 {sensitiveMatches.length} 处可能的敏感信息
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {sensitiveMatches.map((match, index) => {
                const msg = msgs.find((item) => item.index === match.message_index);
                const ordinal = msg ? messageOrdinal(msg) : match.message_index + 1;
                return (
                  <div key={`${match.type}-${match.message_index}-${index}`} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, minWidth: 0 }}>
                      <span style={{ flexShrink: 0, fontWeight: 700, color: 'var(--danger-fg)' }}>{SENSITIVE_TYPE_LABEL[match.type] ?? match.type}</span>
                      <span style={{ flexShrink: 0, color: 'var(--ink-3)' }}>第 {ordinal} 条</span>
                    </div>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-1)' }}>
                      {match.context ?? match.masked}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.45 }}>
              若当前为云端模式，点击保存将视为同意上传这些内容。
            </div>
          </div>
        )}
        {msgs.map((msg) => {
          const role = msg.role in ROLE_LABEL ? msg.role : 'unknown';
          const preview = messagePreview(msg);
          const hasSensitive = sensitiveMatches.some((match) => match.message_index === msg.index);
          return (
            <div
              key={msg.index}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                ...(hasSensitive ? {
                  borderRadius: 6,
                  padding: '6px 8px',
                  margin: '-6px -8px',
                  background: 'color-mix(in oklab, var(--danger-fg) 6%, var(--surface))',
                } : {}),
              }}
            >
              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 5, background: role === 'user' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : 'color-mix(in oklab, var(--ok-fg) 12%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: ROLE_COLOR[role] }}>
                {ROLE_LABEL[role]}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55, wordBreak: 'break-all' }}>{preview}</span>
            </div>
          );
        })}
      </div>

      {/* Save button */}
      <div style={{ padding: '0 18px 14px', background: 'var(--surface-2)', borderTop: '1px solid var(--line)' }}>
        <button
          onClick={() => onSave(conversation, sensitiveMatches.length > 0)}
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
