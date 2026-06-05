import { dbExec, dbQuery } from '../bridge';
import type { Settings } from '../../lib/types';

const DEFAULTS: Settings = {
  report_mode: 'manual',
  storage_mode: 'local',
  api_base_url: 'http://localhost:8000',
  schema_version: 3,
};

export async function getSettings(): Promise<Settings> {
  const rows = await dbQuery<[string, string]>('SELECT key, value FROM settings');
  const map = Object.fromEntries(rows.map(([k, v]) => [k as string, v as string]));
  return {
    report_mode: (map['report_mode'] as Settings['report_mode']) ?? DEFAULTS.report_mode,
    storage_mode: (map['storage_mode'] as Settings['storage_mode']) ?? DEFAULTS.storage_mode,
    api_base_url: map['api_base_url'] ?? DEFAULTS.api_base_url,
    cloud_access_token: map['cloud_access_token'],
    cloud_refresh_token: map['cloud_refresh_token'],
    cloud_user_email: map['cloud_user_email'],
    schema_version: Number(map['schema_version'] ?? DEFAULTS.schema_version),
  };
}

export async function setSetting(key: keyof Settings, value: string | null): Promise<void> {
  if (value === null) {
    await dbExec('DELETE FROM settings WHERE key = ?', [key]);
  } else {
    await dbExec(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value]
    );
  }
}
