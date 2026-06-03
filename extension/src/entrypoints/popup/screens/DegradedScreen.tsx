export default function DegradedScreen() {
  return (
    <div className="scr" style={{ width: 392, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>提取质量较低</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 16 }}>
        页面结构可能发生变化，无法完整识别对话。<br />
        请在页面上<b>选中想保存的文本</b>，再右键点击「保存到 AI Memory」。
      </div>
      <button
        onClick={() => window.close()}
        style={{ width: '100%', padding: '10px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600 }}
      >
        关闭
      </button>
    </div>
  );
}
