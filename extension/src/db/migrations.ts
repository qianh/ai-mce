const CAPTURE_COLUMN_MIGRATIONS = [
  {
    name: 'source_fingerprint',
    sql: "ALTER TABLE captures ADD COLUMN source_fingerprint TEXT NOT NULL DEFAULT ''",
  },
  {
    name: 'updated_at',
    sql: "ALTER TABLE captures ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
  },
  {
    name: 'storage_state',
    sql: "ALTER TABLE captures ADD COLUMN storage_state TEXT NOT NULL DEFAULT 'local'",
  },
  {
    name: 'cloud_capture_id',
    sql: 'ALTER TABLE captures ADD COLUMN cloud_capture_id TEXT',
  },
  {
    name: 'cloud_uploaded_at',
    sql: 'ALTER TABLE captures ADD COLUMN cloud_uploaded_at TEXT',
  },
  {
    name: 'upload_error',
    sql: 'ALTER TABLE captures ADD COLUMN upload_error TEXT',
  },
] as const;

export type CaptureFingerprintBackfillRow = [
  id: string,
  sourcePlatform: string,
  sourceUrl: string,
  createdAt: string,
];

export function tableInfoColumnNames(rows: unknown[][]): string[] {
  return rows
    .map((row) => row[1])
    .filter((name): name is string => typeof name === 'string');
}

export function captureColumnMigrationSql(existingColumns: Iterable<string>): string[] {
  const existing = new Set(existingColumns);
  return CAPTURE_COLUMN_MIGRATIONS
    .filter((migration) => !existing.has(migration.name))
    .map((migration) => migration.sql);
}

export function captureFingerprintFromSource(sourcePlatform: string, sourceUrl: string): string | null {
  if (sourcePlatform !== 'chatgpt') return null;
  const match = sourceUrl.match(/\/c\/([^/?#]+)/i);
  return match?.[1] ? `chatgpt:${match[1]}` : null;
}

export function fingerprintBackfillPlan(rows: CaptureFingerprintBackfillRow[]): Array<{ id: string; fingerprint: string }> {
  const latestByFingerprint = new Map<string, { id: string; createdAt: string; index: number }>();

  rows.forEach(([id, sourcePlatform, sourceUrl, createdAt], index) => {
    const fingerprint = captureFingerprintFromSource(sourcePlatform, sourceUrl);
    if (!fingerprint) return;

    const current = latestByFingerprint.get(fingerprint);
    if (!current || createdAt > current.createdAt || (createdAt === current.createdAt && index > current.index)) {
      latestByFingerprint.set(fingerprint, { id, createdAt, index });
    }
  });

  return Array.from(latestByFingerprint.entries()).map(([fingerprint, row]) => ({
    id: row.id,
    fingerprint,
  }));
}
