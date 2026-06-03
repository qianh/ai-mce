/* ============================================================
   shared-ui.jsx — primitives, icons, browser chrome, chat backdrop
   ============================================================ */

// ---- minimal line-icon set (simple geometric strokes only) ----
const _ic = {
  check:   'M3.5 8.5l3 3 6-7',
  x:       'M4 4l8 8M12 4l-8 8',
  copy:    'M5.5 5.5h6v6h-6z M3.5 9.5v-6h6',
  trash:   'M3.5 4.5h9 M5.5 4.5V3h5v1.5 M5 4.5l.6 8h4.8l.6-8',
  clock:   'M8 4.2v4l2.6 1.6',
  lock:    'M4.5 7V5.4a3.5 3.5 0 017 0V7 M3.6 7h8.8v6H3.6z',
  shield:  'M8 2.4l4.5 1.8v3.3c0 3-2 5-4.5 6-2.5-1-4.5-3-4.5-6V4.2z',
  bolt:    'M9 2.2L4 9h3.4l-.8 4.6L12 6.6H8.4z',
  arrow:   'M3.5 8h9 M9 4.5L12.5 8 9 11.5',
  chevron: 'M6 4l4 4-4 4',
  chevd:   'M4 6l4 4 4-4',
  plus:    'M8 3.5v9 M3.5 8h9',
  search:  'M7.3 7.3a3.2 3.2 0 10-4.6-4.6 3.2 3.2 0 004.6 4.6z M7.2 7.2l3 3',
  doc:     'M4.5 2.5h4l3 3v8h-7z M8.5 2.5v3h3',
  folder:  'M2.5 4.5h4l1.2 1.4h5.8v6.6h-11z',
  edit:    'M4 12l-.6 2 2-.6 7-7-1.4-1.4z M10.5 4.5l1.4 1.4',
  sparkle: 'M8 2.5l1.2 3.3L12.5 7l-3.3 1.2L8 11.5 6.8 8.2 3.5 7l3.3-1.2z',
  layers:  'M8 2.5l5.5 3-5.5 3-5.5-3z M2.5 8.5L8 11.5l5.5-3',
  warn:    'M8 2.8l5.5 9.5h-11z M8 7v2.6 M8 10.8v.2',
  link:    'M6.5 9.5l3-3 M5.5 8L4 9.5a2 2 0 002.8 2.8L8.3 11 M10.5 8L12 6.5A2 2 0 009.2 3.7L7.7 5.2',
  flag:    'M4 13V3 M4 3.5h7l-1.5 2.5L11 8.5H4',
  eye:     'M1.8 8S4 4 8 4s6.2 4 6.2 4-2.2 4-6.2 4-6.2-4-6.2-4z M8 9.7A1.7 1.7 0 108 6.3a1.7 1.7 0 000 3.4',
  inbox:   'M2.5 8.5L4 3.5h8l1.5 5 M2.5 8.5v4h11v-4 M2.5 8.5H6l.8 1.4h2.4l.8-1.4h3.5',
  list:    'M5.5 4.5h8 M5.5 8h8 M5.5 11.5h8 M2.6 4.5h.01 M2.6 8h.01 M2.6 11.5h.01',
  undo:    'M5.5 5.5L3 8l2.5 2.5 M3 8h6.5a3 3 0 010 6',
  download:'M8 3v6.5 M5 7l3 3 3-3 M3.5 12.5h9',
  gear:    'M8 6a2 2 0 100 4 2 2 0 000-4 M8 2.5v1.6M8 11.9v1.6M13.5 8h-1.6M4.1 8H2.5M11.9 4.1l-1.1 1.1M5.2 10.8l-1.1 1.1M11.9 11.9l-1.1-1.1M5.2 5.2L4.1 4.1',
  user:    'M8 8.2a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8 M3.5 13c.4-2.3 2.2-3.4 4.5-3.4s4.1 1.1 4.5 3.4',
  dots:    'M4 8h.01M8 8h.01M12 8h.01',
};
function Icon({ name, size = 16, sw = 1.5, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={{ flex: '0 0 auto', ...style }}>
      <path d={_ic[name]} />
    </svg>
  );
}

// brand glyph — overlapping memory layers (simple shapes only)
function Brand({ size = 26, on }) {
  const c = on || 'var(--accent)';
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" style={{ flex: '0 0 auto' }}>
      <rect x="4" y="9.5" width="20" height="14" rx="4" fill={c} opacity="0.16" />
      <rect x="4" y="9.5" width="20" height="14" rx="4" stroke={c} strokeWidth="1.6" />
      <path d="M8 9.5V7.2A2.2 2.2 0 0110.2 5h7.6A2.2 2.2 0 0120 7.2V9.5" stroke={c} strokeWidth="1.6" />
      <circle cx="14" cy="16.4" r="2.5" fill={c} />
    </svg>
  );
}

const LV = {
  L0: ['噪音', 'l0'], L1: ['临时', 'l1'], L2: ['会话', 'l2'],
  L3: ['项目记忆', 'l3'], L4: ['长期偏好', 'l4'], L5: ['核心决策', 'l5'],
};
function Level({ lv, withName = true }) {
  const [name, cls] = LV[lv];
  return <span className={'lv ' + cls}><span className="dot" />{lv}{withName ? ' · ' + name : ''}</span>;
}

function Btn({ kind = 'ghost', icon, children, block, sm, style, on }) {
  return (
    <button className={`btn btn-${kind}${block ? ' btn-block' : ''}${sm ? ' btn-sm' : ''}`} style={style}>
      {icon && <Icon name={icon} size={sm ? 14 : 15} />}{children}
    </button>
  );
}

// ---- Browser chrome (window with toolbar). children = page content ----
function Browser({ url, children, width = '100%', height = '100%', extIcon = true, popup }) {
  return (
    <div style={{ width, height, display: 'flex', flexDirection: 'column', background: 'var(--paper)',
      position: 'relative', overflow: 'hidden' }}>
      {/* chrome bar */}
      <div style={{ height: 46, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', gap: 7 }}>
          {['#e9695f','#e9b14b','#5fc36b'].map((c,i) => (
            <span key={i} style={{ width: 11, height: 11, borderRadius: 99, background: c, opacity: .9 }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 3, marginLeft: 4, color: 'var(--ink-3)' }}>
          <Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} />
          <Icon name="chevron" size={15} style={{ opacity: .4 }} />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, height: 28, padding: '0 12px',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 99, color: 'var(--ink-3)', fontSize: 12.5 }}>
          <Icon name="lock" size={12} style={{ color: 'var(--ink-3)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{url}</span>
        </div>
        {extIcon && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, display: 'grid', placeItems: 'center',
              background: popup ? 'var(--accent-soft)' : 'transparent', border: popup ? '1px solid var(--accent-line)' : '1px solid transparent' }}>
              <Brand size={18} />
            </div>
            <div style={{ width: 26, height: 26, borderRadius: 99, background: 'var(--accent)', color: 'var(--on-accent)',
              display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>Y</div>
          </div>
        )}
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

// ---- Generic AI-chat page backdrop (original, non-branded) ----
function ChatBackdrop({ blur }) {
  const bubble = (role, w, lines) => (
    <div style={{ display: 'flex', gap: 12, padding: '16px 0', alignItems: 'flex-start' }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, flex: '0 0 auto',
        background: role === 'u' ? 'var(--surface-3)' : 'var(--accent)',
        color: role === 'u' ? 'var(--ink-2)' : 'var(--on-accent)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
        {role === 'u' ? '你' : <Brand size={16} on="var(--on-accent)" />}
      </div>
      <div style={{ flex: 1, maxWidth: w }}>
        {lines.map((ln, i) => (
          <div key={i} style={{ height: 9, borderRadius: 5, marginBottom: 8, background: 'var(--surface-3)',
            width: ln + '%', opacity: role === 'u' ? .65 : 1 }} />
        ))}
      </div>
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', filter: blur ? 'saturate(.92)' : 'none',
      background: 'var(--paper)' }}>
      {/* sidebar */}
      <div style={{ width: 220, flex: '0 0 auto', borderRight: '1px solid var(--line)', background: 'var(--paper-2)',
        padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
          border: '1px solid var(--line-2)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>
          <Icon name="plus" size={14} /> 新对话
        </div>
        {['AI Memory 浏览器插件方案','记忆等级规则讨论','Extractor 降级策略','Context Pack 设计'].map((t, i) => (
          <div key={i} style={{ padding: '8px 10px', borderRadius: 8, fontSize: 12, color: i===0?'var(--ink)':'var(--ink-3)',
            background: i === 0 ? 'var(--surface-2)' : 'transparent', fontWeight: i===0?600:400,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</div>
        ))}
      </div>
      {/* conversation */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 44, flex: '0 0 auto', borderBottom: '1px solid var(--line)', display: 'flex',
          alignItems: 'center', padding: '0 22px', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
          AI Memory 浏览器插件方案
        </div>
        <div style={{ flex: 1, overflow: 'hidden', padding: '8px 40px' }}>
          <div style={{ maxWidth: 620, margin: '0 auto' }}>
            {bubble('u', 360, [92, 70])}
            {bubble('a', 560, [98, 100, 88, 95, 60])}
            {bubble('u', 300, [80])}
            {bubble('a', 560, [96, 90, 100, 72])}
          </div>
        </div>
        <div style={{ flex: '0 0 auto', padding: '12px 40px 18px' }}>
          <div style={{ maxWidth: 620, margin: '0 auto', height: 46, borderRadius: 14, border: '1px solid var(--line-2)',
            background: 'var(--surface)', display: 'flex', alignItems: 'center', padding: '0 16px', color: 'var(--ink-3)', fontSize: 13 }}>
            发送消息…
          </div>
        </div>
      </div>
    </div>
  );
}

// small labelled section header used across screens
function FieldLabel({ children, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{children}</span>
      {hint && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{hint}</span>}
    </div>
  );
}

function Stat({ value, label, accent }) {
  return (
    <div style={{ flex: 1 }}>
      <div className="serif tnum" style={{ fontSize: 24, color: accent ? 'var(--accent-ink)' : 'var(--ink)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 5 }}>{label}</div>
    </div>
  );
}

Object.assign(window, { Icon, Brand, Level, LV, Btn, Browser, ChatBackdrop, FieldLabel, Stat });
