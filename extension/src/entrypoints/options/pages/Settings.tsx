import { useEffect, useState } from 'react';
import { getSettings, setSetting } from '../../../db/repos/settings';
import type { Settings as SettingsType } from '../../../lib/types';

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);

  useEffect(() => { getSettings().then(setSettings); }, []);

  const toggleReportMode = async () => {
    if (!settings) return;
    const next = settings.report_mode === 'auto' ? 'manual' : 'auto';
    await setSetting('report_mode', next);
    setSettings((s) => s ? { ...s, report_mode: next } : s);
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

  const isAuto = settings.report_mode === 'auto';

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>设置</div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>上报模式</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 16, lineHeight: 1.5 }}>
          自动模式：AI 每次回复结束后自动保存到本地，无需手动点击。<br />
          手动模式（默认）：点击插件图标后手动确认保存。
        </div>
        <div
          onClick={toggleReportMode}
          style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{
            width: 44, height: 24, borderRadius: 99, position: 'relative', flexShrink: 0,
            background: isAuto ? 'var(--accent)' : 'var(--line-2)',
            transition: 'background .15s',
          }}>
            <div style={{
              position: 'absolute', top: 3, left: isAuto ? 23 : 3, width: 18, height: 18,
              borderRadius: 99, background: 'white',
              transition: 'left .15s',
            }} />
          </div>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: isAuto ? 'var(--ink)' : 'var(--ink-2)' }}>
            {isAuto ? '自动上报' : '手动上报'}
          </span>
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
