/* ============================================================
   screens-auth.jsx — Login + OAuth consent (PKCE web flow)
   ============================================================ */
const { Icon, Brand, Btn, Browser } = window;

function BrandPanel({ children }) {
  return (
    <div style={{ width: 420, flex: '0 0 auto', position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(155deg, var(--accent-2), var(--accent))', color: 'var(--on-accent)',
      display: 'flex', flexDirection: 'column', padding: '40px 38px' }}>
      <div style={{ position: 'absolute', right: -90, top: -60, width: 280, height: 280, borderRadius: 99, border: '1px solid rgba(255,255,255,.18)' }} />
      <div style={{ position: 'absolute', right: -40, top: 30, width: 180, height: 180, borderRadius: 99, border: '1px solid rgba(255,255,255,.14)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(255,255,255,.16)', display: 'grid', placeItems: 'center' }}>
          <Brand size={24} on="var(--on-accent)" />
        </div>
        <span style={{ fontSize: 16, fontWeight: 700 }}>AI Memory</span>
      </div>
      {children}
    </div>
  );
}

/* ---------- 登录 ---------- */
function AuthLogin() {
  return (
    <div className="scr">
      <Browser url="app.your-memory-app.com/login" extIcon={false}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          <BrandPanel>
            <div style={{ marginTop: 'auto' }}>
              <div className="serif" style={{ fontSize: 34, fontWeight: 600, lineHeight: 1.22, letterSpacing: '-.02em', maxWidth: 320 }}>
                把一次次 AI 对话，<br/>变成下次能直接用的上下文。
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 18, opacity: .9, maxWidth: 320 }}>
                看到重要对话，点击一次，即可沉淀为可复用的项目记忆、关键决策与 Context Pack。
              </div>
              <div style={{ display: 'flex', gap: 22, marginTop: 30 }}>
                {[['一键','主动保存'],['L0–L5','记忆分级'],['MCP','回流工作流']].map(([v,l]) => (
                  <div key={l}><div className="serif" style={{ fontSize: 21 }}>{v}</div><div style={{ fontSize: 11.5, opacity: .8, marginTop: 2 }}>{l}</div></div>
                ))}
              </div>
            </div>
          </BrandPanel>
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: 'var(--paper)' }}>
            <div style={{ width: 360 }}>
              <h1 className="serif" style={{ fontSize: 27, fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>登录到 AI Memory</h1>
              <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 8 }}>插件与控制台共用同一账号</p>
              <div style={{ display: 'grid', gap: 10, marginTop: 26 }}>
                <button className="btn btn-ghost btn-block" style={{ gap: 10 }}>
                  <span style={{ width: 17, height: 17, borderRadius: 4, background: 'conic-gradient(from -45deg,#ea4335,#fbbc05,#34a853,#4285f4,#ea4335)' }} />用 Google 继续
                </button>
                <button className="btn btn-ghost btn-block" style={{ gap: 10 }}><Icon name="user" size={16} />用 GitHub 继续</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: 'var(--ink-3)', fontSize: 12 }}>
                <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />或<span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              </div>
              <div style={{ display: 'grid', gap: 11 }}>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 6, letterSpacing: '.04em' }}>邮箱</div>
                  <div style={{ height: 42, borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', display: 'flex', alignItems: 'center', padding: '0 13px', fontSize: 13.5, color: 'var(--ink-2)' }}>you@example.com</div>
                </div>
                <Btn kind="primary" icon="arrow" block>用邮箱继续</Btn>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 22, fontSize: 11.5, color: 'var(--ink-3)' }}>
                <Icon name="lock" size={12} />通过 OAuth + PKCE 安全登录 · 不存储长期 API Key
              </div>
            </div>
          </div>
        </div>
      </Browser>
    </div>
  );
}

/* ---------- OAuth 授权页 ---------- */
function AuthConsent() {
  return (
    <div className="scr">
      <Browser url="app.your-memory-app.com/oauth/authorize" extIcon={false}>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--paper-2)', padding: 24 }}>
          <div style={{ width: 460, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '26px 28px 20px', textAlign: 'center', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--surface-2)', border: '1px solid var(--line-2)', display: 'grid', placeItems: 'center' }}><Brand size={28} /></div>
                <div style={{ display: 'flex', gap: 4, color: 'var(--ink-3)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: 99, background: 'currentColor' }} />
                  <span style={{ width: 5, height: 5, borderRadius: 99, background: 'currentColor' }} />
                  <span style={{ width: 5, height: 5, borderRadius: 99, background: 'currentColor' }} />
                </div>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', display: 'grid', placeItems: 'center', color: 'var(--accent-ink)' }}><Icon name="user" size={22} /></div>
              </div>
              <h1 className="serif" style={{ fontSize: 21, fontWeight: 600, margin: '18px 0 4px' }}>授权 AI Memory Capture 插件</h1>
              <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: 0 }}>插件将以 <b style={{ color: 'var(--ink-2)' }}>you@example.com</b> 的身份访问你的记忆</p>
            </div>
            <div style={{ padding: '20px 28px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '.05em', marginBottom: 10 }}>插件将可以</div>
              <div style={{ display: 'grid', gap: 11 }}>
                {[['check','保存你主动选择的对话与选中内容'],['sparkle','创建摘要、候选记忆与 Context Pack'],['folder','读取与管理你的项目记忆']].map(([ic,t]) => (
                  <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, flex: '0 0 auto', background: 'var(--ok-bg)', color: 'var(--ok-fg)', display: 'grid', placeItems: 'center' }}><Icon name={ic} size={13} /></span>
                    <span style={{ fontSize: 13, color: 'var(--ink)' }}>{t}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '.05em', margin: '18px 0 10px' }}>插件不会</div>
              <div style={{ display: 'grid', gap: 11 }}>
                {[['读取 Cookie、密码或浏览器历史'],['抓取其他标签页或未选中的网页内容'],['在后台自动保存任何内容']].map(([t]) => (
                  <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, flex: '0 0 auto', background: 'var(--surface-2)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}><Icon name="x" size={13} /></span>
                    <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '16px 28px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn kind="soft" block>取消</Btn>
                <Btn kind="primary" icon="shield" block>授权访问</Btn>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, fontSize: 11, color: 'var(--ink-3)' }}>
                <Icon name="lock" size={11} />授权可随时在控制台撤销 · access_token 短期有效
              </div>
            </div>
          </div>
        </div>
      </Browser>
    </div>
  );
}

Object.assign(window, { AuthLogin, AuthConsent });
