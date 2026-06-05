import { describe, expect, it } from 'vitest';
import {
  captureColumnMigrationSql,
  captureFingerprintFromSource,
  fingerprintBackfillPlan,
  tableInfoColumnNames,
} from '../../src/db/migrations';

describe('capture schema migrations', () => {
  it('adds all columns required by current capture writes to a v1 table', () => {
    const existingColumns = [
      'id',
      'source_platform',
      'source_url',
      'source_title',
      'content_hash',
      'extraction_quality',
      'status',
      'created_at',
    ];

    expect(captureColumnMigrationSql(existingColumns)).toEqual([
      "ALTER TABLE captures ADD COLUMN source_fingerprint TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE captures ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE captures ADD COLUMN storage_state TEXT NOT NULL DEFAULT 'local'",
      "ALTER TABLE captures ADD COLUMN cloud_capture_id TEXT",
      "ALTER TABLE captures ADD COLUMN cloud_uploaded_at TEXT",
      "ALTER TABLE captures ADD COLUMN upload_error TEXT",
    ]);
  });

  it('does not emit ALTER statements for columns that already exist', () => {
    expect(captureColumnMigrationSql([
      'source_fingerprint',
      'updated_at',
      'storage_state',
      'cloud_capture_id',
      'cloud_uploaded_at',
      'upload_error',
    ])).toEqual([]);
  });

  it('reads column names from PRAGMA table_info rows', () => {
    expect(tableInfoColumnNames([
      [0, 'id', 'TEXT', 0, null, 1],
      [1, 'source_url', 'TEXT', 1, null, 0],
    ])).toEqual(['id', 'source_url']);
  });

  it('derives ChatGPT fingerprints from historical capture URLs', () => {
    expect(captureFingerprintFromSource('chatgpt', 'https://chatgpt.com/c/abc-123?model=gpt-5')).toBe('chatgpt:abc-123');
    expect(captureFingerprintFromSource('generic_web', 'https://chatgpt.com/c/abc-123')).toBeNull();
  });

  it('backfills only the newest row when old rows share one conversation URL', () => {
    expect(fingerprintBackfillPlan([
      ['old', 'chatgpt', 'https://chatgpt.com/c/abc-123', '2026-06-04T08:00:00.000Z'],
      ['new', 'chatgpt', 'https://chatgpt.com/c/abc-123', '2026-06-04T09:00:00.000Z'],
      ['other', 'chatgpt', 'https://chatgpt.com/c/def-456', '2026-06-04T07:00:00.000Z'],
    ])).toEqual([
      { id: 'new', fingerprint: 'chatgpt:abc-123' },
      { id: 'other', fingerprint: 'chatgpt:def-456' },
    ]);
  });
});
