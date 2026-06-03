import { useEffect, useState } from 'react';
import { getSettings, setSetting } from '../../../db/repos/settings';
import type { Settings as SettingsType } from '../../../lib/types';

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'idle' | 'ok' | 'fail'>('idle');

  useEffect(() => {
    getSettings().then((s) => { setSettings(s); setApiKey(s.claude_api_key ?? ''); });
  }, []);

  const validateAndSave = async () => {
    if (!apiKey.trim()) return;
    setValidating(true);
    setKeyStatus('idle');
    chrome.runtime.sendMessage({ type: 'VALIDATE_API_KEY', key: apiKey }, async (result: { ok: boolean }) => {
      if (result?.ok) {
        await setSetting('claude_api_key', apiKey);
        setKeyStatus('ok');
      } else {
        setKeyStatus('fail');
      }
      setValidating(false);
    });
  };

  const exportDb = () => {
    chrome.runtime.sendMessage({ type: 'EXPORT_DB' }, (result: { ok: boolean; bytes?: ArrayBuffer }) => {
      if (result?.ok && result.bytes) {
        const blob = new Blob([result.bytes], { type: 'application/x-sqlite3' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-memory-export-${new Date().toISOString().slice(0, 10)}.sqlite`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    });
  };

  if (!settings) return <div style={{ color: 'var(--ink-3)', padding: 20 }}>加载中…</div>;

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>设置</div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Claude API Key</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14, lineHeight: 1.5 }}>
          你自己的 Anthropic API Key，用于生成摘要和提取记忆。存储在本地 OPFS 数据库，不上传任何地方。
        </div>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => { setApiKey(e.target.value); setKeyStatus('idle'); }}
          placeholder="sk-ant-api03-..."
          style={{ width: '100%', padding: '10px 13px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={validateAndSave}
            disabled={validating || !apiKey.trim()}
            style={{ padding: '9px 16px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: validating ? 'wait' : 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, opacity: (!apiKey.trim() || validating) ? 0.6 : 1 }}
          >
            {validating ? '验证中…' : '验证并保存'}
          </button>
          {keyStatus === 'ok' && <span style={{ color: 'var(--ok-fg)', fontSize: 13, fontWeight: 600 }}>✓ 已连接</span>}
          {keyStatus === 'fail' && <span style={{ color: 'var(--danger-fg)', fontSize: 13, fontWeight: 600 }}>✗ Key 无效，请检查</span>}
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>数据与备份</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14, lineHeight: 1.5 }}>
          导出完整数据库为标准 SQLite 3 文件，可用 DB Browser for SQLite 等工具打开，也可手动备份到 Google Drive。
        </div>
        <button
          onClick={exportDb}
          style={{ padding: '9px 16px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13 }}
        >
          ⬇ 导出 .sqlite 文件
        </button>
      </div>
    </div>
  );
}
