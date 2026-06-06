import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from '../../src/entrypoints/options/pages/Settings';
import { CLOUD_SESSION_ALARM } from '../../src/lib/cloud-session';
import type { Settings as SettingsType } from '../../src/lib/types';

const getSettings = vi.hoisted(() => vi.fn());
const setSetting = vi.hoisted(() => vi.fn());
const login = vi.hoisted(() => vi.fn());
const register = vi.hoisted(() => vi.fn());
const logout = vi.hoisted(() => vi.fn());
const CloudApiError = vi.hoisted(() => class CloudApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'CloudApiError';
    this.status = status;
  }
});

vi.mock('../../src/db/repos/settings', () => ({
  getSettings,
  setSetting,
}));

vi.mock('../../src/lib/cloud-api', () => ({
  CloudApiError,
  createCloudApiClient: vi.fn(() => ({ login, register, logout })),
}));

const baseSettings: SettingsType = {
  report_mode: 'manual',
  storage_mode: 'local',
  api_base_url: 'http://localhost:8000',
  schema_version: 3,
};

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderSettings(settings: SettingsType = baseSettings) {
  getSettings.mockResolvedValue(settings);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<Settings />);
  });
  await flushEffects();

  return { container, root };
}

describe('Settings cloud mode UI', () => {
  beforeEach(() => {
    getSettings.mockReset();
    setSetting.mockReset();
    login.mockReset();
    register.mockReset();
    logout.mockReset();
    Reflect.deleteProperty(chrome, 'alarms');
  });

  it('shows Local Mode as the default non-cloud path', async () => {
    const { container, root } = await renderSettings();

    expect(container.textContent).toContain('个人本地版');
    expect(container.textContent).toContain('不需要注册');
    expect(container.textContent).not.toContain('邮箱');

    root.unmount();
    container.remove();
  });

  it('registers with the first email and password when login has no account yet', async () => {
    login.mockRejectedValue(new CloudApiError(401, 'Invalid email or password'));
    register.mockResolvedValue({
      user: { id: 'user-1', email: 'new@example.com' },
      access_token: 'new-access',
      refresh_token: 'new-refresh',
    });
    const { container, root } = await renderSettings({ ...baseSettings, storage_mode: 'cloud' });

    await act(async () => {
      const email = container.querySelector<HTMLInputElement>('input[aria-label="邮箱"]')!;
      const password = container.querySelector<HTMLInputElement>('input[aria-label="密码"]')!;
      email.value = 'new@example.com';
      email.dispatchEvent(new Event('input', { bubbles: true }));
      password.value = 'secret123';
      password.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const loginButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === '登录 / 注册');
    await act(async () => {
      loginButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(login).toHaveBeenCalledWith('new@example.com', 'secret123');
    expect(register).toHaveBeenCalledWith('new@example.com', 'secret123');
    expect(setSetting).toHaveBeenCalledWith('cloud_access_token', 'new-access');
    expect(setSetting).toHaveBeenCalledWith('cloud_refresh_token', 'new-refresh');
    expect(setSetting).toHaveBeenCalledWith('cloud_user_email', 'new@example.com');

    root.unmount();
    container.remove();
  });

  it('shows login controls when switching to Cloud Mode', async () => {
    const { container, root } = await renderSettings();

    const cloudButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('云端版'));
    expect(cloudButton).toBeTruthy();
    await act(async () => {
      cloudButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('需要注册或登录');
    expect(container.querySelector('input[aria-label="邮箱"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="密码"]')).not.toBeNull();

    root.unmount();
    container.remove();
  });

  it('clears the refresh alarm when switching back to Local Mode', async () => {
    const clear = vi.fn().mockResolvedValue(true);
    const get = vi.fn().mockResolvedValue({ name: CLOUD_SESSION_ALARM });
    const create = vi.fn().mockResolvedValue(undefined);
    chrome.alarms = { clear, get, create } as unknown as typeof chrome.alarms;
    const { container, root } = await renderSettings({
      ...baseSettings,
      storage_mode: 'cloud',
      cloud_user_email: 'me@example.com',
      cloud_refresh_token: 'refresh',
      cloud_access_token: 'access',
    });

    const localButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('个人本地版'));
    await act(async () => {
      localButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(setSetting).toHaveBeenCalledWith('storage_mode', 'local');
    expect(clear).toHaveBeenCalledWith(CLOUD_SESSION_ALARM);
    expect(get).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });

  it('logs in and persists cloud session settings', async () => {
    login.mockResolvedValue({
      user: { id: 'user-1', email: 'me@example.com' },
      access_token: 'access',
      refresh_token: 'refresh',
    });
    const { container, root } = await renderSettings({ ...baseSettings, storage_mode: 'cloud' });

    await act(async () => {
      const email = container.querySelector<HTMLInputElement>('input[aria-label="邮箱"]')!;
      const password = container.querySelector<HTMLInputElement>('input[aria-label="密码"]')!;
      email.value = 'me@example.com';
      email.dispatchEvent(new Event('input', { bubbles: true }));
      password.value = 'secret123';
      password.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const loginButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === '登录 / 注册');
    await act(async () => {
      loginButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(setSetting).toHaveBeenCalledWith('storage_mode', 'cloud');
    expect(setSetting).toHaveBeenCalledWith('cloud_access_token', 'access');
    expect(setSetting).toHaveBeenCalledWith('cloud_refresh_token', 'refresh');
    expect(setSetting).toHaveBeenCalledWith('cloud_user_email', 'me@example.com');

    root.unmount();
    container.remove();
  });

  it('logs out by clearing local cloud session', async () => {
    const { container, root } = await renderSettings({
      ...baseSettings,
      storage_mode: 'cloud',
      cloud_user_email: 'me@example.com',
      cloud_refresh_token: 'refresh',
      cloud_access_token: 'access',
    });

    const logoutButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === '退出登录');
    await act(async () => {
      logoutButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(logout).toHaveBeenCalledWith('refresh');
    expect(setSetting).toHaveBeenCalledWith('cloud_access_token', null);
    expect(setSetting).toHaveBeenCalledWith('cloud_refresh_token', null);
    expect(setSetting).toHaveBeenCalledWith('cloud_user_email', null);

    root.unmount();
    container.remove();
  });

  it('treats refresh-token-only sessions as logged in', async () => {
    const { container, root } = await renderSettings({
      ...baseSettings,
      storage_mode: 'cloud',
      cloud_user_email: 'me@example.com',
      cloud_refresh_token: 'refresh',
    });

    expect(container.textContent).toContain('me@example.com');
    expect(container.textContent).toContain('退出登录');
    expect(container.querySelector('input[aria-label="邮箱"]')).toBeNull();

    root.unmount();
    container.remove();
  });
});
