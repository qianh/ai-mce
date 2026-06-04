import { dbExec, dbQuery } from '../bridge';
import type { Settings } from '../../lib/types';

const DEFAULTS: Settings = {
  report_mode: 'manual',
  schema_version: 2,
};

export async function getSettings(): Promise<Settings> {
  const rows = await dbQuery<[string, string]>('SELECT key, value FROM settings');
  const map = Object.fromEntries(rows.map(([k, v]) => [k as string, v as string]));
  return {
    report_mode: (map['report_mode'] as Settings['report_mode']) ?? DEFAULTS.report_mode,
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
