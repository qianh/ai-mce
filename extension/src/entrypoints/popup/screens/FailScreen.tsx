interface Props { errorMessage: string }

export default function FailScreen({ errorMessage }: Props) {
  return (
    <div className="scr" style={{ width: 392, padding: 18 }}>
      <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-display)', marginBottom: 8 }}>保存失败</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 16 }}>{errorMessage}</div>
      <button
        onClick={() => window.close()}
        style={{ width: '100%', padding: '10px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600 }}
      >
        关闭
      </button>
    </div>
  );
}
