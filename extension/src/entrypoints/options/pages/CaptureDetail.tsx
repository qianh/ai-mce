import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { deleteCapture, getCaptureMessages } from '../../../db/repos/captures';

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

interface ParsedMessage {
  role: string;
  content: string;
  index: number;
}

function parseMessages(text: string): ParsedMessage[] {
  const lines = text.split('\n\n');
  return lines.map((block, i) => {
    const colonIdx = block.indexOf(': ');
    if (colonIdx === -1) return { role: 'unknown', content: block, index: i };
    return { role: block.slice(0, colonIdx), content: block.slice(colonIdx + 2), index: i };
  }).filter((m) => m.content.trim());
}

export default function CaptureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ParsedMessage[]>([]);

  useEffect(() => {
    if (!id) return;
    getCaptureMessages(id).then((text) => {
      if (text) setMessages(parseMessages(text));
    });
  }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    if (confirm('确认删除此 Capture？此操作不可撤销。')) {
      await deleteCapture(id);
      navigate('/');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 13 }}>← 返回</button>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>对话原文</div>
        <button onClick={handleDelete} style={{ padding: '7px 13px', borderRadius: 7, border: '1px solid color-mix(in oklab, var(--danger-fg) 35%, transparent)', background: 'transparent', color: 'var(--danger-fg)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          删除
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((msg) => {
          const roleKey = msg.role in ROLE_LABEL ? msg.role : 'unknown';
          return (
            <div key={msg.index} className="card" style={{ padding: '13px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: 'color-mix(in oklab, ' + ROLE_COLOR[roleKey] + ' 12%, transparent)', color: ROLE_COLOR[roleKey], border: '1px solid color-mix(in oklab, ' + ROLE_COLOR[roleKey] + ' 30%, transparent)' }}>
                  {ROLE_LABEL[roleKey] ?? roleKey}
                </span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {msg.content}
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--ink-3)', fontSize: 14 }}>暂无内容</div>
        )}
      </div>
    </div>
  );
}
