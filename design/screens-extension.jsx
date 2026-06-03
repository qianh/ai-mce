/* ============================================================
   screens-extension.jsx — Popup variants + Side Panel
   rendered over Browser + ChatBackdrop
   ============================================================ */
const { Icon, Brand, Level, Btn, Browser, ChatBackdrop, FieldLabel, Stat } = window;

function PopupShell({ children, w = 392, pointer = true }) {
  return (
    <div className="scr" style={{ position: 'relative' }}>
      <Browser url="chatgpt.com/c/ai-memory-plugin" popup>
        <ChatBackdrop blur />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,16,12,.12)' }} />
        {pointer && (
          <div style={{ position: 'absolute', top: -1, right: 70, width: 14, height: 14, background: 'var(--surface)',
            borderLeft: '1px solid var(--line)', borderTop: '1px solid var(--line)', transform: 'rotate(45deg)', zIndex: 3 }} />
        )}
        <div style={{ position: 'absolute', top: 8, right: 16, width: w, zIndex: 4,
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
          {children}
        </div>
      </Browser>
    </div>
  );
}

function PopupHead({ sub = '当前页面 · AI 对话' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 18px', borderBottom: '1px solid var(--line)' }}>
      <Brand size={24} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em' }}>AI Memory Capture</div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{sub}</div>
      </div>
      <button className="btn btn-soft btn-sm" style={{ padding: 6, borderRadius: 7 }}><Icon name="x" size={14} /></button>
    </div>
  );
}

function Sec({ children, pad = '14px 18px', divide = true }) {
  return <div style={{ padding: pad, borderTop: divide ? '1px solid var(--line)' : 'none' }}>{children}</div>;
}

function Opt({ on, title, desc, icon }) {
  return (
    <label className={'opt' + (on ? ' on' : '')}>
      <span className="radio" />
      <span style={{ flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
          {icon && <Icon name={icon} size={13} style={{ color: on ? 'var(--accent-ink)' : 'var(--ink-3)' }} />}{title}
        </span>
        {desc && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{desc}</span>}
      </span>
    </label>
  );
}

/* ---------- 1. 保存预览（主界面） ---------- */
function ExtSave() {
  return (
    <PopupShell>
      <PopupHead />
      <Sec divide={false}>
        <FieldLabel hint="提取质量 · 高">检测结果</FieldLabel>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, padding: '10px 14px', borderRadius: 'var(--r-sm)',
          border: '1px solid var(--line-2)', background: 'var(--surface-2)' }}>
          <Stat value="18" label="条消息" />
          <div style={{ width: 1, background: 'var(--line)' }} />
          <div style={{ flex: 1, paddingLeft: 14 }}><Stat value="5.2k" label="字数（约）" /></div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="pill tag-ok"><Icon name="check" size={11} />识别完整</span>
          </div>
        </div>
      </Sec>
      <Sec>
        <FieldLabel>保存范围</FieldLabel>
        <div style={{ display: 'grid', gap: 7 }}>
          <Opt on title="整个对话" desc="18 条消息 · 包含代码块与列表" icon="layers" />
          <Opt title="最近一轮问答" icon="bolt" />
          <Opt title="选中内容" icon="doc" />
        </div>
      </Sec>
      <Sec>
        <FieldLabel hint="自动识别">保存到项目</FieldLabel>
        <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px',
          borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', cursor: 'pointer' }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent-ink)',
            display: 'grid', placeItems: 'center' }}><Icon name="folder" size={13} /></span>
          <span style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 600 }}>AI Memory Hub</span>
          <span className="pill" style={{ fontSize: 10.5 }}>可编辑</span>
          <Icon name="chevd" size={14} style={{ color: 'var(--ink-3)' }} />
        </button>
      </Sec>
      <Sec>
        <FieldLabel>保存方式</FieldLabel>
        <div style={{ display: 'grid', gap: 7 }}>
          <Opt on title="摘要 + 结构化记忆" desc="默认 · 不长期保留完整原文" icon="sparkle" />
          <Opt title="完整原文 + 摘要 + 结构化记忆" icon="doc" />
          <Opt title="仅保存我编辑后的笔记" icon="edit" />
        </div>
      </Sec>
      <Sec>
        <PrivacyNote />
      </Sec>
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
        <Btn kind="primary" icon="bolt" block>保存到 AI Memory</Btn>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 9, fontSize: 11, color: 'var(--ink-3)' }}>
          <Icon name="shield" size={12} />仅在你点击时保存 · 不读取其他标签页
        </div>
      </div>
    </PopupShell>
  );
}

function PrivacyNote() {
  return (
    <div style={{ borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', overflow: 'hidden' }}>
      <div style={{ padding: '9px 12px', background: 'var(--accent-soft)', display: 'flex', gap: 7, alignItems: 'center',
        color: 'var(--accent-ink)', fontSize: 12, fontWeight: 700 }}>
        <Icon name="shield" size={13} />保存前明确告知
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--line)' }}>
        <div style={{ flex: 1, padding: '10px 12px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ok-fg)', marginBottom: 6, letterSpacing: '.04em' }}>将保存</div>
          {['页面标题与 URL', '你选择的对话', '保存时间 · 版本'].map((t,i) => (
            <div key={i} style={{ display: 'flex', gap: 6, fontSize: 11.5, color: 'var(--ink-2)', marginBottom: 4 }}>
              <Icon name="check" size={12} style={{ color: 'var(--ok-fg)', marginTop: 1 }} />{t}
            </div>
          ))}
        </div>
        <div style={{ width: 1, background: 'var(--line)' }} />
        <div style={{ flex: 1, padding: '10px 12px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 6, letterSpacing: '.04em' }}>不会保存</div>
          {['Cookie · 密码', '浏览器历史', '其他标签页内容'].map((t,i) => (
            <div key={i} style={{ display: 'flex', gap: 6, fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 4 }}>
              <Icon name="x" size={12} style={{ marginTop: 1 }} />{t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- 2. 提取质量低 / 降级 ---------- */
function ExtDegraded() {
  return (
    <PopupShell>
      <PopupHead sub="页面结构可能已变化" />
      <Sec divide={false}>
        <div style={{ display: 'flex', gap: 11, padding: '13px 14px', borderRadius: 'var(--r-md)',
          background: 'var(--warn-bg)', border: '1px solid color-mix(in oklab, var(--warn-fg) 26%, transparent)' }}>
          <Icon name="warn" size={18} style={{ color: 'var(--warn-fg)', marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>当前页面可识别，但提取质量较低</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.5 }}>
              只识别到 <b>2 条消息</b>，页面结构可能发生变化。你仍然可以用下面的备用方式保存。
            </div>
          </div>
        </div>
      </Sec>
      <Sec>
        <FieldLabel>请选择备用保存方式</FieldLabel>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            ['doc','保存选中内容','读取你在页面上选中的文本','on'],
            ['list','保存页面可读文本','提取 main / article 主体文本',''],
            ['edit','手动粘贴内容','自己粘贴需要沉淀的对话',''],
          ].map(([ic,t,d,on]) => (
            <Opt key={t} on={!!on} icon={ic} title={t} desc={d} />
          ))}
        </div>
      </Sec>
      <Sec>
        <div style={{ display: 'flex', gap: 9 }}>
          <Btn kind="primary" icon="check" block>用此方式保存</Btn>
          <Btn kind="ghost" icon="flag" style={{ flex: '0 0 auto' }}>反馈</Btn>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--ink-3)' }}>
          <Icon name="lock" size={12} />反馈不会包含对话原文，仅含页面结构特征
        </div>
      </Sec>
    </PopupShell>
  );
}

/* ---------- 3. 敏感内容命中 ---------- */
function ExtSensitive() {
  return (
    <PopupShell>
      <PopupHead sub="检测到可能的敏感信息" />
      <Sec divide={false}>
        <div style={{ display: 'flex', gap: 11, padding: '13px 14px', borderRadius: 'var(--r-md)',
          background: 'var(--danger-bg)', border: '1px solid color-mix(in oklab, var(--danger-fg) 26%, transparent)' }}>
          <Icon name="shield" size={18} style={{ color: 'var(--danger-fg)', marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>检测到 3 处可能的敏感信息</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4 }}>请确认处理方式后再保存。</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
          {[['API Key','sk-••••••••••3f2a','msg #6'],['访问令牌','Bearer ••••••••','msg #6'],['邮箱地址','j••••@••••.com','msg #11']].map(([t,v,m]) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--r-sm)',
              border: '1px solid var(--line-2)', background: 'var(--surface-2)' }}>
              <Icon name="lock" size={14} style={{ color: 'var(--danger-fg)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t}</span>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', flex: 1 }}>{v}</span>
              <span className="pill" style={{ fontSize: 10 }}>{m}</span>
            </div>
          ))}
        </div>
      </Sec>
      <Sec>
        <FieldLabel>建议处理方式</FieldLabel>
        <div style={{ display: 'grid', gap: 7 }}>
          <Opt on icon="eye" title="自动打码后保存" desc="敏感片段以 •••• 替换，推荐" />
          <Opt icon="sparkle" title="只保存摘要" />
          <Opt icon="edit" title="手动编辑内容" />
          <Opt icon="doc" title="仍然保存全文" />
        </div>
      </Sec>
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
        <Btn kind="primary" icon="shield" block>打码后保存</Btn>
      </div>
    </PopupShell>
  );
}

/* ---------- 4. 保存成功 ---------- */
function ExtSuccess() {
  const steps = [['已上传',1],['正在生成摘要',1],['正在提取候选记忆',1],['等待生成 Context Pack',0]];
  return (
    <PopupShell>
      <PopupHead sub="已保存 · 正在分析" />
      <Sec divide={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 99, background: 'var(--ok-bg)', color: 'var(--ok-fg)',
            display: 'grid', placeItems: 'center', border: '1px solid color-mix(in oklab,var(--ok-fg) 30%,transparent)' }}>
            <Icon name="check" size={20} sw={2} />
          </div>
          <div>
            <div className="serif" style={{ fontSize: 18 }}>已保存到 AI Memory</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>cap_8f3a · 2026-06-03 14:30</div>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gap: 9 }}>
          {steps.map(([t,done]) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
              {done
                ? <span style={{ width: 17, height: 17, borderRadius: 99, background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center' }}><Icon name="check" size={11} sw={2.2} /></span>
                : <span style={{ width: 17, height: 17, borderRadius: 99, border: '2px solid var(--line-2)' }} />}
              <span style={{ color: done ? 'var(--ink)' : 'var(--ink-3)', fontWeight: done ? 600 : 400 }}>{t}</span>
              {!done && <span className="pill" style={{ fontSize: 10, marginLeft: 'auto' }}>处理中</span>}
            </div>
          ))}
        </div>
      </Sec>
      <Sec>
        <FieldLabel>初步结果</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['项目','AI Memory Hub','folder'],['候选记忆','4 条','sparkle'],['待确认决策','1 条','flag'],['待办','2 条','check']].map(([l,v,ic]) => (
            <div key={l} style={{ flex: 1, padding: '11px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', background: 'var(--surface-2)' }}>
              <Icon name={ic} size={14} style={{ color: 'var(--accent-ink)' }} />
              <div className="serif tnum" style={{ fontSize: 16, marginTop: 6 }}>{v}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </Sec>
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)', display: 'flex', gap: 9 }}>
        <Btn kind="primary" icon="copy" block>复制 Context Pack</Btn>
        <Btn kind="ghost" icon="arrow" style={{ flex: '0 0 auto' }}>查看结果</Btn>
      </div>
    </PopupShell>
  );
}

/* ---------- 5. 保存失败 ---------- */
function ExtFail() {
  return (
    <PopupShell>
      <PopupHead sub="保存失败 · 已暂存本地" />
      <Sec divide={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 99, background: 'var(--danger-bg)', color: 'var(--danger-fg)',
            display: 'grid', placeItems: 'center', border: '1px solid color-mix(in oklab,var(--danger-fg) 30%,transparent)' }}>
            <Icon name="warn" size={19} />
          </div>
          <div>
            <div className="serif" style={{ fontSize: 18 }}>保存失败</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>内容已安全暂存在本地</div>
          </div>
        </div>
        <div style={{ marginTop: 13, padding: '11px 13px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)',
          background: 'var(--surface-2)', fontSize: 12, color: 'var(--ink-2)' }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 6 }}>
            <Icon name="warn" size={13} style={{ color: 'var(--warn-fg)' }} /><b style={{ color: 'var(--ink)' }}>网络连接失败</b>
          </div>
          系统将自动重试 · 下一次重试 <b className="tnum">00:28</b> 后
        </div>
        <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--ink-3)' }}>
          <span className="pill"><Icon name="clock" size={11} />重试 1 / 5</span>
          <span className="pill"><Icon name="lock" size={11} />本地缓存 TTL 24h</span>
        </div>
      </Sec>
      <Sec>
        <div style={{ display: 'grid', gap: 8 }}>
          <Btn kind="primary" icon="undo" block>立即重试</Btn>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn kind="ghost" icon="copy" block>复制为 Markdown</Btn>
            <Btn kind="danger" icon="trash" block>删除本地缓存</Btn>
          </div>
        </div>
      </Sec>
    </PopupShell>
  );
}

/* ---------- 6. Side Panel ---------- */
function SidePanel() {
  return (
    <div className="scr" style={{ position: 'relative' }}>
      <Browser url="claude.ai/chat/ai-memory">
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}><ChatBackdrop /></div>
          {/* panel */}
          <div style={{ width: 372, flex: '0 0 auto', borderLeft: '1px solid var(--line)', background: 'var(--surface)',
            display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
              <Brand size={22} />
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>AI Memory</div>
              <span className="pill tag-ok" style={{ fontSize: 10.5 }}><Icon name="check" size={11} />已连接</span>
              <button className="btn btn-soft btn-sm" style={{ padding: 6 }}><Icon name="gear" size={13} /></button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* summary */}
              <div>
                <FieldLabel hint="实时">当前对话摘要</FieldLabel>
                <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
                  本次讨论围绕浏览器插件的<b style={{ color: 'var(--ink)' }}>产品定位、MVP 收敛、隐私安全</b>与 Extractor 稳定性展开，并明确了 V0.1 范围。
                </div>
              </div>
              {/* suggested memories */}
              <div>
                <FieldLabel hint="3 条">建议沉淀</FieldLabel>
                <div style={{ display: 'grid', gap: 8 }}>
                  {[
                    ['L5','第一版只做用户主动保存，不做默认自动抓取。',true],
                    ['L4','默认只保存摘要 + 结构化记忆。',true],
                    ['L3','V0.1 优先支持 ChatGPT 与通用网页选中内容。',false],
                  ].map(([lv,txt,confirm],i) => (
                    <div key={i} style={{ padding: '11px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface-2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                        <Level lv={lv} />
                        {confirm && <span className="pill tag-warn" style={{ fontSize: 10 }}>待确认</span>}
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink)' }}>{txt}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                        <button className="btn btn-primary btn-sm" style={{ flex: 1 }}><Icon name="check" size={12} />确认</button>
                        <button className="btn btn-soft btn-sm"><Icon name="edit" size={12} /></button>
                        <button className="btn btn-soft btn-sm"><Icon name="x" size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* history */}
              <div>
                <FieldLabel hint="本会话">最近保存</FieldLabel>
                <div style={{ display: 'grid', gap: 6 }}>
                  {[['14:30','整个对话 · 18 条','已处理'],['11:02','选中内容 · 决策','已处理']].map(([t,d,s],i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' }}>
                      <Icon name="doc" size={13} style={{ color: 'var(--ink-3)' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{d}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{t}</span>
                      <span className="pill tag-ok" style={{ fontSize: 10 }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: 14, borderTop: '1px solid var(--line)', background: 'var(--surface-2)', display: 'flex', gap: 9 }}>
              <Btn kind="primary" icon="bolt" block>保存当前对话</Btn>
              <Btn kind="ghost" icon="copy" style={{ flex: '0 0 auto' }}>Pack</Btn>
            </div>
          </div>
        </div>
      </Browser>
    </div>
  );
}

Object.assign(window, { ExtSave, ExtDegraded, ExtSensitive, ExtSuccess, ExtFail, SidePanel });
