export default function SuccessScreen() {
  return (
    <div className="scr" style={{ width: 392, padding: 18 }}>
      <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-display)', marginBottom: 8 }}>
        ✓ 已保存到 AI Memory
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 16 }}>
        对话原文已写入本地 SQLite
      </div>
      <button
        onClick={() => chrome.runtime.openOptionsPage()}
        style={{ width: '100%', padding: '10px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600 }}
      >
        查看控制台 →
      </button>
    </div>
  );
}
