import { useEffect, useState } from 'react';
import { getSettings, setSetting } from '../../../db/repos/settings';
import { CloudApiError, createCloudApiClient, type CloudAuthResponse } from '../../../lib/cloud-api';
import { refreshCloudSessionIfNeeded, syncCloudSessionSchedule } from '../../../lib/cloud-session';
import type { Settings as SettingsType } from '../../../lib/types';

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => { getSettings().then(setSettings); }, []);

  const toggleReportMode = async () => {
    if (!settings) return;
    const next = settings.report_mode === 'auto' ? 'manual' : 'auto';
    await setSetting('report_mode', next);
    setSettings((s) => s ? { ...s, report_mode: next } : s);
  };

  const setStorageMode = async (mode: SettingsType['storage_mode']) => {
    if (!settings) return;
    const nextSettings = { ...settings, storage_mode: mode };
    await setSetting('storage_mode', mode);
    setSettings(nextSettings);
    await syncCloudSessionSchedule(nextSettings);
  };

  const updateApiBaseUrl = async (value: string) => {
    await setSetting('api_base_url', value);
    setSettings((s) => s ? { ...s, api_base_url: value } : s);
  };

  const loginCloud = async () => {
    if (!settings) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      const client = createCloudApiClient(settings.api_base_url);
      const result = await loginOrRegisterCloud(client, email.trim(), password);
      await setSetting('storage_mode', 'cloud');
      await setSetting('cloud_access_token', result.access_token);
      await setSetting('cloud_refresh_token', result.refresh_token);
      await setSetting('cloud_user_email', result.user.email);
      const nextSettings = {
        ...settings,
        storage_mode: 'cloud' as const,
        cloud_access_token: result.access_token,
        cloud_refresh_token: result.refresh_token,
        cloud_user_email: result.user.email,
      };
      setSettings(nextSettings);
      await syncCloudSessionSchedule(nextSettings);
      await refreshCloudSessionIfNeeded({ getSettings, setSetting });
    } catch (error) {
      setAuthError(error instanceof CloudApiError ? error.message : '登录或注册失败，请重试');
    } finally {
      setAuthBusy(false);
    }
  };

  const logoutCloud = async () => {
    if (!settings) return;
    if (settings.cloud_refresh_token) {
      try {
        await createCloudApiClient(settings.api_base_url).logout(settings.cloud_refresh_token);
      } catch {
        // Local session cleanup still matters if the network is unavailable.
      }
    }
    await setSetting('cloud_access_token', null);
    await setSetting('cloud_refresh_token', null);
    await setSetting('cloud_user_email', null);
    const nextSettings = {
      ...settings,
      cloud_access_token: undefined,
      cloud_refresh_token: undefined,
      cloud_user_email: undefined,
    };
    setSettings(nextSettings);
    await syncCloudSessionSchedule(nextSettings);
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
  const isCloud = settings.storage_mode === 'cloud';
  const isLoggedIn = Boolean(settings.cloud_user_email && settings.cloud_refresh_token);

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>设置</div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>存储版本</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, marginBottom: 14 }}>
          <button
            onClick={() => setStorageMode('local')}
            style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid var(--line-2)', background: !isCloud ? 'var(--ink)' : 'var(--surface)', color: !isCloud ? 'var(--paper)' : 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13 }}
          >
            个人本地版
          </button>
          <button
            onClick={() => setStorageMode('cloud')}
            style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid var(--line-2)', background: isCloud ? 'var(--ink)' : 'var(--surface)', color: isCloud ? 'var(--paper)' : 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13 }}
          >
            云端版
          </button>
        </div>

        {!isCloud ? (
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            不需要注册，保存和查看都只使用本地 SQLite。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
              需要注册或登录后保存到云端数据库。
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}>
              API
              <input
                aria-label="API Base URL"
                value={settings.api_base_url}
                onChange={(event) => updateApiBaseUrl(event.currentTarget.value)}
                onInput={(event) => updateApiBaseUrl(event.currentTarget.value)}
                style={{ height: 34, padding: '0 10px', border: '1px solid var(--line-2)', borderRadius: 6, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-ui)', fontSize: 13 }}
              />
            </label>
            {isLoggedIn ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{settings.cloud_user_email}</div>
                <button onClick={logoutCloud} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13 }}>
                  退出登录
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
                  <input
                    aria-label="邮箱"
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    onInput={(event) => setEmail(event.currentTarget.value)}
                    placeholder="邮箱"
                    style={{ height: 34, padding: '0 10px', border: '1px solid var(--line-2)', borderRadius: 6, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-ui)', fontSize: 13 }}
                  />
                  <input
                    aria-label="密码"
                    value={password}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    onInput={(event) => setPassword(event.currentTarget.value)}
                    placeholder="密码"
                    type="password"
                    style={{ height: 34, padding: '0 10px', border: '1px solid var(--line-2)', borderRadius: 6, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-ui)', fontSize: 13 }}
                  />
                  <button
                    onClick={loginCloud}
                    disabled={authBusy || !email.trim() || !password}
                    style={{ padding: '0 14px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--ink)', color: 'var(--paper)', cursor: authBusy ? 'default' : 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, opacity: authBusy ? 0.7 : 1 }}
                  >
                    {authBusy ? '处理中…' : '登录 / 注册'}
                  </button>
                </div>
                {authError && (
                  <div style={{ marginTop: 8, color: 'var(--danger-fg)', fontSize: 12 }}>
                    {authError}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

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

async function loginOrRegisterCloud(
  client: ReturnType<typeof createCloudApiClient>,
  email: string,
  password: string
): Promise<CloudAuthResponse> {
  try {
    return await client.login(email, password);
  } catch (error) {
    if (!(error instanceof CloudApiError) || error.status !== 401) throw error;
  }

  try {
    return await client.register(email, password);
  } catch (error) {
    if (error instanceof CloudApiError && error.status === 409) {
      throw new CloudApiError(401, '邮箱或密码不正确');
    }
    throw error;
  }
}
