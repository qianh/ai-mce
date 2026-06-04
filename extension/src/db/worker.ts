// Dedicated Worker — runs wa-sqlite with OPFS backend.
// Uses AccessHandlePoolVFS (synchronous access handles) + wa-sqlite sync build.
// This avoids the NotFoundError bug in OriginPrivateFileSystemVFS.xDelete.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — wa-sqlite ships JS-only, no bundled TS types
import SQLiteFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
// @ts-ignore
import * as SQLite from 'wa-sqlite';
// @ts-ignore
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js';
import type { DbCommand, DbResponse } from './bridge';

const DB_FILE = 'ai-memory.sqlite';
const VFS_DIR = 'ai-memory-pool';
let sqlite3: any;
let db: number;
let _initDone = false;

async function init() {
  if (_initDone) return;
  const module = await SQLiteFactory();
  sqlite3 = SQLite.Factory(module);
  const vfs = new AccessHandlePoolVFS(VFS_DIR);
  await vfs.isReady;
  await sqlite3.vfs_register(vfs, true);
  db = await sqlite3.open_v2(
    DB_FILE,
    SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE,
    vfs.name
  );
  await runExec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY, source_platform TEXT NOT NULL, source_url TEXT NOT NULL,
      source_title TEXT NOT NULL, content_hash TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL DEFAULT '',
      extraction_quality TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'saved', created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS source_documents (
      id TEXT PRIMARY KEY, capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
      title TEXT NOT NULL, normalized_text TEXT,
      message_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_captures_fingerprint ON captures(source_fingerprint) WHERE source_fingerprint != '';
    CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at DESC);
  `);
  // schema_version 2: drop AI tables if they exist (migration from v1)
  await runExec(`
    DROP TABLE IF EXISTS context_packs;
    DROP TABLE IF EXISTS memory_items;
    DROP TABLE IF EXISTS memory_candidates;
  `);
  _initDone = true;
}

async function runExec(sql: string, params?: unknown[]): Promise<void> {
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params?.length) {
      params.forEach((p, i) => sqlite3.bind(stmt, i + 1, p));
    }
    while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) { /* drain */ }
  }
}

async function runQuery(sql: string, params?: unknown[]): Promise<unknown[][]> {
  const rows: unknown[][] = [];
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params?.length) {
      params.forEach((p, i) => sqlite3.bind(stmt, i + 1, p));
    }
    while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
      const n = sqlite3.column_count(stmt);
      const row: unknown[] = [];
      for (let i = 0; i < n; i++) row.push(sqlite3.column(stmt, i));
      rows.push(row);
    }
  }
  return rows;
}

async function exportBytes(): Promise<Uint8Array> {
  // Flush WAL to main database file before export
  await runExec('PRAGMA wal_checkpoint(FULL)');
  // Read from OPFS pool directory - find main DB file
  const root = await navigator.storage.getDirectory();
  const poolDir = await root.getDirectoryHandle(VFS_DIR);
  // Iterate pool files to find the one mapped to DB_FILE
  for await (const [, handle] of (poolDir as any).entries()) {
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      const buf = await file.slice(0, 15).arrayBuffer();
      const magic = new TextDecoder().decode(buf);
      if (magic === 'SQLite format 3') {
        return new Uint8Array(await file.arrayBuffer());
      }
    }
  }
  return new Uint8Array(0);
}

self.onmessage = async (e: MessageEvent<DbCommand>) => {
  const { id, cmd } = e.data;
  try {
    if (cmd === 'init') {
      await init();
      (self as any).postMessage({ id, ok: true } satisfies DbResponse);
    } else if (cmd === 'exec') {
      await runExec(e.data.sql, e.data.params);
      (self as any).postMessage({ id, ok: true } satisfies DbResponse);
    } else if (cmd === 'query') {
      const rows = await runQuery(e.data.sql, e.data.params);
      (self as any).postMessage({ id, ok: true, rows } satisfies DbResponse);
    } else if (cmd === 'export_bytes') {
      const bytes = await exportBytes();
      (self as any).postMessage({ id, ok: true, rows: [[bytes]] } satisfies DbResponse, [bytes.buffer]);
    }
  } catch (err) {
    (self as any).postMessage({ id, ok: false, error: String(err) } satisfies DbResponse);
  }
};
