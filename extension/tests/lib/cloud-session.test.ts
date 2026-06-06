import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudApiError, type createCloudApiClient } from '../../src/lib/cloud-api';
import {
  CLOUD_SESSION_ALARM,
  ensureCloudAccessToken,
  getAccessTokenExpiry,
  isAccessTokenStale,
  refreshCloudSessionIfNeeded,
  syncCloudSessionSchedule,
  uploadCaptureWithSessionRefresh,
  withCloudSessionRefresh,
} from '../../src/lib/cloud-session';
import type { ExtractedConversation, Settings } from '../../src/lib/types';

type CloudClient = ReturnType<typeof createCloudApiClient>;

const conversation: ExtractedConversation = {
  schema_version: '1',
  extractor_version: 'test',
  source: {
    platform: 'generic_web',
    url: 'https://claude.ai/chat/abc',
    browser_title: 'Claude note',
    captured_at: '2026-06-06T00:00:00.000Z',
  },
  content: {
    title: 'Claude note',
    messages: [{ role: 'unknown', content: 'selected text', index: 0 }],
  },
  extraction_quality: {
    confidence: 0.75,
    method: 'selection',
    warnings: [],
    message_count: 1,
    empty_message_count: 0,
  },
  hashes: {
    content_hash: 'hash',
    message_hashes: ['hash'],
    source_fingerprint: 'generic:https://claude.ai/chat/abc',
  },
};

const settings: Settings = {
  report_mode: 'manual',
  storage_mode: 'cloud',
  api_base_url: 'http://localhost:8008',
  cloud_access_token: 'expired-access',
  cloud_refresh_token: 'refresh',
  cloud_user_email: 'me@example.com',
  schema_version: 3,
};

function fakeJwt(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: 'user-1', exp: expSeconds }));
  return `${header}.${payload}.signature`;
}

function fakeCloudClient(overrides: Partial<CloudClient>): CloudClient {
  return {
    register: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    uploadCapture: vi.fn().mockResolvedValue(undefined),
    listCaptures: vi.fn().mockResolvedValue([]),
    getCapture: vi.fn().mockResolvedValue(undefined),
    deleteCapture: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as CloudClient;
}

describe('cloud session refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(chrome, 'alarms');
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks');
  });

  it('detects stale access tokens from JWT expiry', () => {
    const freshToken = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    const staleToken = fakeJwt(Math.floor(Date.now() / 1000) - 60);

    expect(isAccessTokenStale(freshToken)).toBe(false);
    expect(isAccessTokenStale(staleToken)).toBe(true);
    expect(getAccessTokenExpiry(staleToken)).toBeTypeOf('number');
  });

  it('refreshes proactively before making a cloud request', async () => {
    const staleToken = fakeJwt(Math.floor(Date.now() / 1000) - 60);
    const freshToken = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    const listCaptures = vi.fn().mockResolvedValue([]);
    const refresh = vi.fn().mockResolvedValue({
      user: { id: 'user-1', email: 'me@example.com' },
      access_token: freshToken,
      refresh_token: 'fresh-refresh',
    });
    const setSetting = vi.fn().mockResolvedValue(undefined);

    await expect(withCloudSessionRefresh(
      (token, client) => client.listCaptures(token),
      {
        getSettings: vi.fn().mockResolvedValue({
          ...settings,
          cloud_access_token: staleToken,
        }),
        setSetting,
        createClient: vi.fn(() => fakeCloudClient({ listCaptures, refresh })),
      },
    )).resolves.toEqual([]);

    expect(refresh).toHaveBeenCalledWith('refresh');
    expect(listCaptures).toHaveBeenCalledWith(freshToken);
    expect(setSetting).toHaveBeenCalledWith('cloud_access_token', freshToken);
  });

  it('does not refresh a stale cloud token while Local Mode is selected', async () => {
    const staleToken = fakeJwt(Math.floor(Date.now() / 1000) - 60);
    const refresh = vi.fn().mockResolvedValue({
      user: { id: 'user-1', email: 'me@example.com' },
      access_token: 'unexpected-access',
      refresh_token: 'unexpected-refresh',
    });
    const setSetting = vi.fn().mockResolvedValue(undefined);

    await expect(ensureCloudAccessToken({
      getSettings: vi.fn().mockResolvedValue({
        ...settings,
        storage_mode: 'local',
        cloud_access_token: staleToken,
      }),
      setSetting,
      createClient: vi.fn(() => fakeCloudClient({ refresh })),
    })).resolves.toBeNull();

    expect(refresh).not.toHaveBeenCalled();
    expect(setSetting).not.toHaveBeenCalled();
  });

  it('clears the background refresh alarm while Local Mode is selected', async () => {
    const clear = vi.fn().mockResolvedValue(true);
    const get = vi.fn().mockResolvedValue({ name: CLOUD_SESSION_ALARM });
    const create = vi.fn().mockResolvedValue(undefined);
    chrome.alarms = { clear, get, create } as unknown as typeof chrome.alarms;

    await syncCloudSessionSchedule({
      ...settings,
      storage_mode: 'local',
      cloud_refresh_token: 'refresh',
    });

    expect(clear).toHaveBeenCalledWith(CLOUD_SESSION_ALARM);
    expect(get).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('refreshes an expired access token and retries capture upload', async () => {
    const uploadCapture = vi.fn()
      .mockRejectedValueOnce(new CloudApiError(401, 'Invalid token'))
      .mockResolvedValueOnce({ id: 'cloud-1', updated_at: '2026-06-06T00:00:01.000Z' });
    const refresh = vi.fn().mockResolvedValue({
      user: { id: 'user-1', email: 'me@example.com' },
      access_token: 'fresh-access',
      refresh_token: 'fresh-refresh',
    });
    const setSetting = vi.fn().mockResolvedValue(undefined);
    const freshToken = fakeJwt(Math.floor(Date.now() / 1000) + 3600);

    await expect(uploadCaptureWithSessionRefresh(conversation, {
      getSettings: vi.fn().mockResolvedValue({
        ...settings,
        cloud_access_token: freshToken,
      }),
      setSetting,
      createClient: vi.fn(() => fakeCloudClient({ uploadCapture, refresh })),
    })).resolves.toEqual({ id: 'cloud-1', updated_at: '2026-06-06T00:00:01.000Z' });

    expect(refresh).toHaveBeenCalledWith('refresh');
    expect(uploadCapture).toHaveBeenNthCalledWith(1, freshToken, conversation);
    expect(uploadCapture).toHaveBeenNthCalledWith(2, 'fresh-access', conversation);
    expect(setSetting).toHaveBeenCalledWith('cloud_access_token', 'fresh-access');
    expect(setSetting).toHaveBeenCalledWith('cloud_refresh_token', 'fresh-refresh');
    expect(setSetting).toHaveBeenCalledWith('cloud_user_email', 'me@example.com');
  });

  it('deduplicates concurrent refresh attempts', async () => {
    const staleToken = fakeJwt(Math.floor(Date.now() / 1000) - 60);
    const freshToken = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    const refresh = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        user: { id: 'user-1', email: 'me@example.com' },
        access_token: freshToken,
        refresh_token: 'fresh-refresh',
      };
    });
    const setSetting = vi.fn().mockResolvedValue(undefined);
    const deps = {
      getSettings: vi.fn().mockResolvedValue({
        ...settings,
        cloud_access_token: staleToken,
      }),
      setSetting,
      createClient: vi.fn(() => fakeCloudClient({ refresh })),
    };

    const [first, second] = await Promise.all([
      ensureCloudAccessToken(deps),
      ensureCloudAccessToken(deps),
    ]);

    expect(first).toBe(freshToken);
    expect(second).toBe(freshToken);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not restore a cloud session if the refresh token is cleared before refresh completes', async () => {
    const staleToken = fakeJwt(Math.floor(Date.now() / 1000) - 60);
    const refresh = vi.fn().mockResolvedValue({
      user: { id: 'user-1', email: 'me@example.com' },
      access_token: 'unexpected-access',
      refresh_token: 'unexpected-refresh',
    });
    const setSetting = vi.fn().mockResolvedValue(undefined);

    await refreshCloudSessionIfNeeded({
      getSettings: vi.fn()
        .mockResolvedValueOnce({
          ...settings,
          cloud_access_token: staleToken,
          cloud_refresh_token: 'refresh',
        })
        .mockResolvedValueOnce({
          ...settings,
          cloud_access_token: staleToken,
          cloud_refresh_token: 'refresh',
        })
        .mockResolvedValue({
          ...settings,
          cloud_access_token: undefined,
          cloud_refresh_token: undefined,
          cloud_user_email: undefined,
        }),
      setSetting,
      createClient: vi.fn(() => fakeCloudClient({ refresh })),
    });

    expect(refresh).toHaveBeenCalledWith('refresh');
    expect(setSetting).not.toHaveBeenCalled();
  });

  it('does not retry a cloud request after storage switches to Local Mode', async () => {
    const failedToken = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    const replacementToken = fakeJwt(Math.floor(Date.now() / 1000) + 7200);
    const operation = vi.fn()
      .mockRejectedValueOnce(new CloudApiError(401, 'Invalid token'))
      .mockResolvedValueOnce('unexpected');
    const refresh = vi.fn().mockResolvedValue({
      user: { id: 'user-1', email: 'me@example.com' },
      access_token: 'unexpected-access',
      refresh_token: 'unexpected-refresh',
    });

    await expect(withCloudSessionRefresh(operation, {
      getSettings: vi.fn()
        .mockResolvedValueOnce({
          ...settings,
          cloud_access_token: failedToken,
          cloud_refresh_token: 'refresh',
        })
        .mockResolvedValueOnce({
          ...settings,
          cloud_access_token: failedToken,
          cloud_refresh_token: 'refresh',
        })
        .mockResolvedValue({
          ...settings,
          storage_mode: 'local',
          cloud_access_token: replacementToken,
          cloud_refresh_token: 'refresh',
        }),
      setSetting: vi.fn().mockResolvedValue(undefined),
      createClient: vi.fn(() => fakeCloudClient({ refresh })),
    })).rejects.toMatchObject({ status: 401 });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('re-reads settings inside a cross-context refresh lock before consuming a refresh token', async () => {
    const staleToken = fakeJwt(Math.floor(Date.now() / 1000) - 60);
    const freshToken = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    const refresh = vi.fn().mockResolvedValue({
      user: { id: 'user-1', email: 'me@example.com' },
      access_token: 'unexpected-access',
      refresh_token: 'unexpected-refresh',
    });
    const locks = {
      request: vi.fn((_name: string, _options: LockOptions, callback: () => Promise<string>) => callback()),
    };
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });

    const deps = {
      getSettings: vi.fn()
        .mockResolvedValueOnce({
          ...settings,
          cloud_access_token: staleToken,
          cloud_refresh_token: 'old-refresh',
        })
        .mockResolvedValueOnce({
          ...settings,
          cloud_access_token: freshToken,
          cloud_refresh_token: 'new-refresh',
        }),
      setSetting: vi.fn().mockResolvedValue(undefined),
      createClient: vi.fn(() => fakeCloudClient({ refresh })),
    };

    await expect(ensureCloudAccessToken(deps)).resolves.toBe(freshToken);

    expect(locks.request).toHaveBeenCalledWith(
      'ai-mce-cloud-session-refresh',
      { mode: 'exclusive' },
      expect.any(Function)
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not reuse an access token after storage switches to Local Mode inside a refresh lock', async () => {
    const staleToken = fakeJwt(Math.floor(Date.now() / 1000) - 60);
    const freshToken = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    const refresh = vi.fn().mockResolvedValue({
      user: { id: 'user-1', email: 'me@example.com' },
      access_token: 'unexpected-access',
      refresh_token: 'unexpected-refresh',
    });
    const locks = {
      request: vi.fn((_name: string, _options: LockOptions, callback: () => Promise<string>) => callback()),
    };
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });

    await expect(ensureCloudAccessToken({
      getSettings: vi.fn()
        .mockResolvedValueOnce({
          ...settings,
          cloud_access_token: staleToken,
          cloud_refresh_token: 'old-refresh',
        })
        .mockResolvedValueOnce({
          ...settings,
          storage_mode: 'local',
          cloud_access_token: freshToken,
          cloud_refresh_token: 'new-refresh',
        }),
      setSetting: vi.fn().mockResolvedValue(undefined),
      createClient: vi.fn(() => fakeCloudClient({ refresh })),
    })).rejects.toMatchObject({ status: 401 });

    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not reuse an access token after the refresh token is cleared inside a refresh lock', async () => {
    const staleToken = fakeJwt(Math.floor(Date.now() / 1000) - 60);
    const freshToken = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    const refresh = vi.fn().mockResolvedValue({
      user: { id: 'user-1', email: 'me@example.com' },
      access_token: 'unexpected-access',
      refresh_token: 'unexpected-refresh',
    });
    const locks = {
      request: vi.fn((_name: string, _options: LockOptions, callback: () => Promise<string>) => callback()),
    };
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });

    await expect(ensureCloudAccessToken({
      getSettings: vi.fn()
        .mockResolvedValueOnce({
          ...settings,
          cloud_access_token: staleToken,
          cloud_refresh_token: 'old-refresh',
        })
        .mockResolvedValueOnce({
          ...settings,
          cloud_access_token: freshToken,
          cloud_refresh_token: undefined,
        }),
      setSetting: vi.fn().mockResolvedValue(undefined),
      createClient: vi.fn(() => fakeCloudClient({ refresh })),
    })).rejects.toMatchObject({ status: 401 });

    expect(refresh).not.toHaveBeenCalled();
  });
});
