/* ============================================================
   screens-console.jsx — Web Console (list, detail, review, pack, settings)
   ============================================================ */
const { Icon, Brand, Level, Btn, Browser, FieldLabel } = window;

function ConsoleShell({ active, title, sub, actions, children, pad = 26 }) {
  const nav = [
    ['captures', 'list', 'Captures', null],
    ['review', 'inbox', 'Review Inbox', '5'],
    ['projects', 'folder', '项目', null],
    ['packs', 'layers', 'Context Packs', null],
    ['settings', 'gear', '设置', null],
  ];
  return (
    <div className="scr">
      <Browser url="app.your-memory-app.com" extIcon={false}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          {/* sidebar */}
          <div style={{ width: 226, flex: '0 0 auto', background: 'var(--paper-2)', borderRight: '1px solid var(--line)',
            display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '17px 16px 15px' }}>
              <Brand size={24} />
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em' }}>AI Memory</div>
            </div>
            <div style={{ padding: '0 12px 12px' }}>
              <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 'var(--r-sm)',
                border: '1px solid var(--line-2)', background: 'var(--surface)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>Y</span>
                <span style={{ flex: 1, textAlign: 'left' }}>个人 Workspace</span>
                <Icon name="chevd" size={13} style={{ color: 'var(--ink-3)' }} />
              </button>
            </div>
            <div style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {nav.map(([id, ic, label, badge]) => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 'var(--r-sm)',
                  background: active === id ? 'var(--surface)' : 'transparent',
                  border: active === id ? '1px solid var(--line-2)' : '1px solid transparent',
                  color: active === id ? 'var(--ink)' : 'var(--ink-2)', fontWeight: active === id ? 600 : 500,
                  fontSize: 13, boxShadow: active === id ? 'var(--shadow-sm)' : 'none', cursor: 'pointer' }}>
                  <Icon name={ic} size={15} style={{ color: active === id ? 'var(--accent-ink)' : 'var(--ink-3)' }} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {badge && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'var(--accent)', color: 'var(--on-accent)' }}>{badge}</span>}
                </div>
              ))}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 99, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', color: 'var(--ink-2)' }}><Icon name="user" size={15} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>You</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>you@example.com</div>
              </div>
            </div>
          </div>
          {/* main */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--paper)' }}>
            <div style={{ height: 58, flex: '0 0 auto', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 14, padding: '0 26px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.01em' }}>{title}</div>
                {sub && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{sub}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px', width: 220,
                background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 99, color: 'var(--ink-3)', fontSize: 12.5 }}>
                <Icon name="search" size={14} /> 搜索记忆…
              </div>
              {actions}
            </div>
            <div style={{ flex: 1, overflow: 'hidden', padding: pad }}>{children}</div>
          </div>
        </div>
      </Browser>
    </div>
  );
}

/* ---------- Capture 列表 ---------- */
function ConsoleList() {
  const rows = [
    ['AI Memory 浏览器插件方案','chatgpt','AI Memory Hub','L3',4,'已处理','14:30'],
    ['记忆等级 L0–L5 规则讨论','claude','AI Memory Hub','L5',6,'待确认','11:02'],
    ['Extractor 降级与 fixtures','chatgpt','AI Memory Hub','L3',3,'已处理','昨天'],
    ['Chrome 权限最小化策略','generic_web','隐私与合规','L4',2,'待确认','昨天'],
    ['Context Pack 注入实验','claude','AI Memory Hub','L2',1,'已处理','周一'],
    ['OAuth + PKCE 登录流程','chatgpt','账号体系','L3',3,'处理中','周一'],
    ['本地队列重试策略','generic_web','AI Memory Hub','L1',2,'已处理','上周'],
  ];
  const src = { chatgpt: 'ChatGPT', claude: 'Claude', generic_web: '网页选中' };
  const stClass = { '已处理': 'tag-ok', '待确认': 'tag-warn', '处理中': '' };
  return (
    <ConsoleShell active="captures" title="Captures" sub="共 34 次保存 · 本月 12 次"
      actions={<Btn kind="primary" icon="download">导出</Btn>}>
      <div className="card" style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 150px 120px 96px 78px 40px', gap: 14, padding: '11px 18px',
          borderBottom: '1px solid var(--line)', background: 'var(--surface-2)', fontSize: 11, fontWeight: 700, letterSpacing: '.05em',
          textTransform: 'uppercase', color: 'var(--ink-3)' }}>
          <span>标题</span><span>来源</span><span>项目</span><span>记忆</span><span>状态</span><span>时间</span><span></span>
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 150px 120px 96px 78px 40px', gap: 14, padding: '14px 18px',
            alignItems: 'center', borderBottom: i < rows.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ width: 28, height: 28, borderRadius: 7, flex: '0 0 auto', background: 'var(--surface-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}><Icon name="doc" size={14} /></span>
              <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r[0]}</span>
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{src[r[1]]}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' }}><Icon name="folder" size={13} style={{ color: 'var(--ink-3)' }} />{r[2]}</span>
            <span><Level lv={r[3]} withName={false} /> <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>· {r[4]} 条</span></span>
            <span className={'pill ' + stClass[r[5]]} style={{ fontSize: 10.5 }}>{r[5] === '处理中' && <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--accent)' }} />}{r[5]}</span>
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{r[6]}</span>
            <button className="btn btn-soft btn-sm" style={{ padding: 6, justifySelf: 'end' }}><Icon name="dots" size={14} /></button>
          </div>
        ))}
      </div>
    </ConsoleShell>
  );
}

/* ---------- Capture 详情 ---------- */
function ConsoleDetail() {
  return (
    <ConsoleShell active="captures" title="AI Memory 浏览器插件方案" sub="ChatGPT · 2026-06-03 14:30 · cap_8f3a"
      actions={<><Btn kind="ghost" icon="link">来源</Btn><Btn kind="danger" icon="trash">删除</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 318px', gap: 20, height: '100%' }}>
        {/* left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
          <div className="card" style={{ padding: 18 }}>
            <FieldLabel hint="自动生成">摘要</FieldLabel>
            <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)' }}>
              本次讨论围绕浏览器插件的<b style={{ color: 'var(--ink)' }}>产品定位、MVP 收敛、隐私安全、Extractor 稳定性</b>和路线规划展开，明确第一版以用户主动保存为核心，默认仅保存摘要与结构化记忆。
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              {[['18','条消息'],['5.2k','字数'],['zh-CN','语言'],['0.91','提取置信度']].map(([v,l]) => (
                <div key={l}><div className="serif tnum" style={{ fontSize: 18 }}>{v}</div><div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{l}</div></div>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel hint="4 条 · 1 待确认">候选记忆</FieldLabel>
            <div style={{ display: 'grid', gap: 9 }}>
              {[
                ['L5','浏览器插件第一版应以用户主动保存为核心，不做默认自动抓取。','检测到「决定 / 第一版 / 不做」等决策信号','待确认',true],
                ['L3','Popup 先承担保存预览与项目选择能力。','项目方案中的明确范围约定','已入库',false],
                ['L3','默认只保存摘要 + 结构化记忆，不默认长期保留原文。','隐私默认策略','已入库',false],
              ].map(([lv,txt,reason,status,pending],i) => (
                <div key={i} className="card" style={{ padding: '13px 15px', borderColor: pending ? 'var(--l5-line)' : 'var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Level lv={lv} />
                    <span className={'pill ' + (pending ? 'tag-warn' : 'tag-ok')} style={{ fontSize: 10.5 }}>{status}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: 'var(--ink-3)', display: 'flex', gap: 5, alignItems: 'center' }}><Icon name="link" size={11} />msg #2,#6</span>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)' }}>{txt}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Icon name="sparkle" size={12} />{reason}
                  </div>
                  <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
                    {pending
                      ? <><button className="btn btn-primary btn-sm"><Icon name="check" size={12} />确认入库</button>
                          <button className="btn btn-ghost btn-sm"><Icon name="edit" size={12} />编辑</button>
                          <button className="btn btn-soft btn-sm">忽略</button></>
                      : <button className="btn btn-soft btn-sm"><Icon name="undo" size={12} />撤销入库</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 15px', borderBottom: '1px solid var(--line)' }}>
              <Icon name="layers" size={15} style={{ color: 'var(--accent-ink)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Context Pack</span>
              <button className="btn btn-primary btn-sm"><Icon name="copy" size={12} />复制</button>
            </div>
            <div className="mono" style={{ padding: '13px 15px', fontSize: 11, lineHeight: 1.7, color: 'var(--ink-2)', background: 'var(--surface-2)' }}>
              <div style={{ color: 'var(--accent-ink)', fontWeight: 600 }}># Project: AI Memory Hub</div>
              <div style={{ marginTop: 8, color: 'var(--ink-3)' }}>## Recent Decisions</div>
              <div>- 第一版只做用户主动保存</div>
              <div>- V0.1 优先 ChatGPT + 选中内容</div>
              <div>- 默认仅保存摘要与结构化记忆</div>
              <div style={{ marginTop: 6, color: 'var(--ink-3)' }}>## Next Actions</div>
              <div>- 实现 ChatGPT Extractor</div>
              <div>- 实现 POST /v1/captures</div>
            </div>
          </div>

          <div className="card" style={{ padding: 15 }}>
            <FieldLabel>待办 · 决策</FieldLabel>
            <div style={{ display: 'grid', gap: 8 }}>
              {[['flag','决策','覆盖：V0.1 平台范围','l5'],['check','待办','实现 ChatGPT Extractor',''],['check','待办','建立 Extractor fixtures','']].map(([ic,t,d,lv],i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 6, flex: '0 0 auto', background: lv ? 'var(--l5-bg)' : 'var(--surface-2)', color: lv ? 'var(--l5-fg)' : 'var(--ink-3)', display: 'grid', placeItems: 'center' }}><Icon name={ic} size={12} /></span>
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '.04em' }}>{t}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink)', marginTop: 1 }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 15 }}>
            <FieldLabel>来源</FieldLabel>
            <div style={{ display: 'grid', gap: 7, fontSize: 12 }}>
              {[['平台','ChatGPT'],['保存方式','摘要 + 结构化记忆'],['原文保留','处理后删除'],['提取方式','dom_attr']].map(([k,v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--ink-3)' }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}

/* ---------- Review Inbox ---------- */
function ConsoleReview() {
  const tabs = [['全部','5',true],['长期偏好 L4','2',false],['核心决策 L5','1',false],['覆盖旧决策','1',false],['敏感命中','1',false]];
  const items = [
    ['L5','浏览器插件第一版应以用户主动保存为核心，不做默认自动抓取。','决策信号 · 高影响','cap_8f3a · msg #2','decision'],
    ['L4','用户长期偏好：默认只保存摘要，不长期保留完整原文。','长期偏好 · 需确认','cap_8f3a · msg #9','pref'],
    ['L5','覆盖旧决策：V0.1 范围由「ChatGPT + Claude」改为「ChatGPT + 选中内容」。','检测到与既有决策冲突','cap_2b1c','conflict'],
    ['L4','检测到敏感信息：保存内容包含 API Key，建议打码后入库。','敏感命中 · 默认不自动入库','cap_7d4e · msg #6','sensitive'],
  ];
  const flag = { decision: ['核心决策','tag-danger','flag'], pref: ['长期偏好','tag-warn','user'], conflict: ['覆盖旧决策','tag-warn','undo'], sensitive: ['敏感命中','tag-danger','shield'] };
  return (
    <ConsoleShell active="review" title="Review Inbox" sub="只让你确认高影响记忆 · 5 项待处理"
      actions={<Btn kind="ghost" icon="check">全部确认</Btn>}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabs.map(([t,n,on]) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 99, fontSize: 12.5, fontWeight: 600,
            border: '1px solid ' + (on ? 'var(--accent)' : 'var(--line-2)'), background: on ? 'var(--accent-soft)' : 'var(--surface)', color: on ? 'var(--accent-ink)' : 'var(--ink-2)', cursor: 'pointer' }}>
            {t}<span style={{ fontSize: 10.5, fontWeight: 700, padding: '0px 6px', borderRadius: 99, background: on ? 'var(--accent)' : 'var(--surface-3)', color: on ? 'var(--on-accent)' : 'var(--ink-3)' }}>{n}</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {items.map(([lv,txt,reason,src,kind],i) => {
          const [fl, fcls, fic] = flag[kind];
          return (
            <div key={i} className="card" style={{ padding: '15px 18px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                  <Level lv={lv} />
                  <span className={'pill ' + fcls} style={{ fontSize: 10.5 }}><Icon name={fic} size={11} />{fl}</span>
                  <span style={{ flex: 1 }} />
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{src}</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink)', maxWidth: 620 }}>{txt}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 7, display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="sparkle" size={12} />{reason}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: 150, flex: '0 0 auto' }}>
                <button className="btn btn-primary btn-sm" style={{ justifyContent: 'flex-start' }}><Icon name="check" size={12} />确认入库</button>
                <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }}><Icon name="edit" size={12} />编辑后入库</button>
                <div style={{ display: 'flex', gap: 7 }}>
                  <button className="btn btn-soft btn-sm" style={{ flex: 1 }}>降级</button>
                  <button className="btn btn-soft btn-sm" style={{ flex: 1 }}>忽略</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ConsoleShell>
  );
}

/* ---------- Context Pack ---------- */
function ConsolePack() {
  const H = ({ children }) => <div className="mono" style={{ color: 'var(--accent-ink)', fontWeight: 600, fontSize: 12.5, margin: '20px 0 9px' }}>{children}</div>;
  const Li = ({ children }) => <div style={{ display: 'flex', gap: 9, fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)', marginBottom: 5 }}><span style={{ color: 'var(--accent)' }}>—</span><span>{children}</span></div>;
  return (
    <ConsoleShell active="packs" title="Context Pack" sub="AI Memory Hub · 为下一个 AI 会话准备的上下文" pad={0}
      actions={<><Btn kind="ghost" icon="undo">重新生成</Btn><Btn kind="primary" icon="copy">复制 Pack</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', height: '100%' }}>
        {/* document */}
        <div style={{ overflow: 'hidden', padding: '26px 36px', borderRight: '1px solid var(--line)' }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
              <span className="pill" style={{ fontSize: 11 }}><Icon name="folder" size={12} />AI Memory Hub</span>
              <span className="pill tag-ok" style={{ fontSize: 11 }}><Icon name="check" size={11} />已更新</span>
            </div>
            <h1 className="serif" style={{ fontSize: 30, fontWeight: 600, margin: '6px 0 0', letterSpacing: '-.02em' }}>Project Context</h1>
            <H># Current Goal</H>
            <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-2)' }}>构建一个浏览器插件，让用户可以将 ChatGPT / Claude 等 AI Web 对话沉淀为长期项目记忆。</div>
            <H>## Recent Decisions</H>
            <Li>第一版只做用户主动保存，不做默认自动抓取。</Li>
            <Li>V0.1 优先支持 ChatGPT 当前对话与通用网页选中内容。</Li>
            <Li>Side Panel 延后到 V0.2。</Li>
            <Li>默认只保存摘要和结构化记忆，不默认长期保留完整原文。</Li>
            <H>## Architecture</H>
            <Li>Browser Extension：页面识别、内容提取、保存前确认与上传。</Li>
            <Li>Cloud Memory API：摘要、分类、记忆等级判断与项目归档。</Li>
            <Li>Web Console：查看、确认、删除与复制上下文。</Li>
            <H>## Open Questions</H>
            <Li>原文默认保留 7 天、30 天还是完全不保留？</Li>
            <Li>项目自动识别是否应在 V0.1 做到可编辑？</Li>
          </div>
        </div>
        {/* meta rail */}
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18, background: 'var(--paper-2)' }}>
          <div>
            <FieldLabel>生成对象</FieldLabel>
            <div style={{ display: 'grid', gap: 7 }}>
              {['Claude Code','Cursor','ChatGPT 新会话'].map((t,i) => (
                <label key={t} className={'opt' + (i===0?' on':'')} style={{ padding: '9px 11px' }}>
                  <span className="radio" /><span style={{ fontSize: 12.5, fontWeight: 600 }}>{t}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel>长度控制</FieldLabel>
            <div style={{ display: 'flex', gap: 7 }}>
              {['精简','标准','完整'].map((t,i) => (
                <span key={t} style={{ flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600,
                  border: '1px solid ' + (i===1?'var(--accent)':'var(--line-2)'), background: i===1?'var(--accent-soft)':'var(--surface)', color: i===1?'var(--accent-ink)':'var(--ink-2)' }}>{t}</span>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 8, display: 'flex', justifyContent: 'space-between' }}><span>约 320 tokens</span><span>12 条记忆来源</span></div>
          </div>
          <div style={{ marginTop: 'auto', padding: 13, borderRadius: 'var(--r-md)', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)' }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent-ink)' }}><Icon name="bolt" size={13} />即时价值</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.5 }}>这段对话已变成可以直接粘贴给下一个 AI 的项目上下文。</div>
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}

/* ---------- 设置 ---------- */
function ConsoleSettings() {
  const Card = ({ icon, title, desc, children }) => (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', gap: 11, marginBottom: 14 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, flex: '0 0 auto', background: 'var(--accent-soft)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center' }}><Icon name={icon} size={16} /></span>
        <div><div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{desc}</div></div>
      </div>
      {children}
    </div>
  );
  const Toggle = ({ on }) => (
    <span style={{ width: 36, height: 21, borderRadius: 99, background: on ? 'var(--accent)' : 'var(--line-2)', position: 'relative', flex: '0 0 auto' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 17 : 2, width: 17, height: 17, borderRadius: 99, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.3)' }} />
    </span>
  );
  return (
    <ConsoleShell active="settings" title="设置" sub="隐私 · 数据保留 · 平台与授权">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, height: '100%', alignContent: 'start' }}>
        <Card icon="shield" title="原文保留策略" desc="默认不长期保留完整原文 · 仅影响新 Capture">
          <div style={{ display: 'grid', gap: 8 }}>
            {[['处理完成后删除原文，仅保留摘要与结构化记忆',true],['保留 7 天',false],['保留 30 天',false],['长期保留',false]].map(([t,on]) => (
              <label key={t} className={'opt' + (on?' on':'')}><span className="radio" /><span style={{ fontSize: 12.5, fontWeight: on?600:500 }}>{t}</span></label>
            ))}
          </div>
        </Card>

        <Card icon="sparkle" title="默认保存方式" desc="新保存时的默认选项">
          <div style={{ display: 'grid', gap: 8 }}>
            {[['摘要 + 结构化记忆',true],['完整原文 + 摘要 + 结构化记忆',false],['仅保存我编辑后的笔记',false]].map(([t,on]) => (
              <label key={t} className={'opt' + (on?' on':'')}><span className="radio" /><span style={{ fontSize: 12.5, fontWeight: on?600:500 }}>{t}</span></label>
            ))}
          </div>
        </Card>

        <Card icon="layers" title="平台采集" desc="启用后才会申请对应站点权限">
          <div style={{ display: 'grid', gap: 2 }}>
            {[['ChatGPT','默认支持',true,true],['通用网页选中','activeTab',true,true],['Claude','需启用授权',true,false],['Gemini','需启用授权',false,false],['Perplexity','需启用授权',false,false]].map(([t,d,on,locked]) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 2px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{t}</div><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{d}</div></div>
                {locked && <span className="pill" style={{ fontSize: 10 }}>内置</span>}
                <Toggle on={on} />
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card icon="user" title="已授权设备" desc="可随时撤销插件授权">
            <div style={{ display: 'grid', gap: 9 }}>
              {[['Chrome · macOS','当前设备 · 刚刚',true],['Chrome · Windows','3 天前',false]].map(([t,d,cur]) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}><Icon name="user" size={13} /></span>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{t}{cur && <span className="pill tag-ok" style={{ fontSize: 9.5, marginLeft: 7 }}>当前</span>}</div><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{d}</div></div>
                  <button className="btn btn-danger btn-sm">撤销</button>
                </div>
              ))}
            </div>
          </Card>
          <Card icon="trash" title="数据与账号" desc="导出或清除你的记忆数据">
            <div style={{ display: 'flex', gap: 9 }}>
              <Btn kind="ghost" icon="download" block>导出全部</Btn>
              <Btn kind="danger" icon="trash" block>清除原文</Btn>
            </div>
          </Card>
        </div>
      </div>
    </ConsoleShell>
  );
}

Object.assign(window, { ConsoleList, ConsoleDetail, ConsoleReview, ConsolePack, ConsoleSettings });
