import { dbExec, dbQuery } from '../bridge';
import type { Settings } from '../../lib/types';

const DEFAULTS: Settings = {
  claude_api_key: null,
  default_save_mode: 'summary_and_memory',
  raw_text_retention: 'delete_after_processing',
  schema_version: 1,
};

export async function getSettings(): Promise<Settings> {
  const rows = await dbQuery<[string, string]>('SELECT key, value FROM settings');
  const map = Object.fromEntries(rows.map(([k, v]) => [k as string, v as string]));
  return {
    claude_api_key: map['claude_api_key'] ?? DEFAULTS.claude_api_key,
    default_save_mode: (map['default_save_mode'] as Settings['default_save_mode']) ?? DEFAULTS.default_save_mode,
    raw_text_retention: (map['raw_text_retention'] as Settings['raw_text_retention']) ?? DEFAULTS.raw_text_retention,
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
