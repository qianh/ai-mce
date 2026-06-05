import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSettings, setSetting } from '../../src/db/repos/settings';

const dbQuery = vi.hoisted(() => vi.fn());
const dbExec = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/bridge', () => ({
  dbQuery,
  dbExec,
}));

describe('settings repo', () => {
  beforeEach(() => {
    dbQuery.mockReset();
    dbExec.mockReset();
  });

  it('defaults to local storage mode and manual report mode', async () => {
    dbQuery.mockResolvedValue([]);

    await expect(getSettings()).resolves.toMatchObject({
      report_mode: 'manual',
      storage_mode: 'local',
      api_base_url: 'http://localhost:8000',
    });
  });

  it('reads cloud settings from persisted rows', async () => {
    dbQuery.mockResolvedValue([
      ['report_mode', 'auto'],
      ['storage_mode', 'cloud'],
      ['api_base_url', 'https://memory.example.com'],
      ['cloud_access_token', 'access-token'],
      ['cloud_refresh_token', 'refresh-token'],
      ['cloud_user_email', 'me@example.com'],
    ]);

    await expect(getSettings()).resolves.toMatchObject({
      report_mode: 'auto',
      storage_mode: 'cloud',
      api_base_url: 'https://memory.example.com',
      cloud_access_token: 'access-token',
      cloud_refresh_token: 'refresh-token',
      cloud_user_email: 'me@example.com',
    });
  });

  it('persists cloud setting keys through the generic setter', async () => {
    await setSetting('storage_mode', 'cloud');

    expect(dbExec).toHaveBeenCalledWith(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['storage_mode', 'cloud']
    );
  });
});
