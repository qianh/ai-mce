// Dedicated Worker — runs wa-sqlite with OPFS backend.
// Receives DbCommand, executes SQL, posts DbResponse.
// @ts-expect-error — wa-sqlite has no bundled TS types
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
// @ts-expect-error
import * as SQLite from 'wa-sqlite';
// @ts-expect-error
import { OriginPrivateFileSystemVFS } from 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js';
import type { DbCommand, DbResponse } from './bridge';

const DB_FILE = 'ai-memory.sqlite';
let sqlite3: any;
let db: number;

async function init() {
  const module = await SQLiteESMFactory();
  sqlite3 = SQLite.Factory(module);
  const vfs = new OriginPrivateFileSystemVFS();
  await sqlite3.vfs_register(vfs, true);
  db = await sqlite3.open_v2(
    DB_FILE,
    SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE,
    vfs.name
  );
  // Apply schema
  const schemaRes = await fetch(new URL('./schema.sql', import.meta.url));
  const schema = await schemaRes.text();
  await runExec(schema);
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
  const root = await navigator.storage.getDirectory();
  const fh = await root.getFileHandle(DB_FILE);
  const file = await fh.getFile();
  return new Uint8Array(await file.arrayBuffer());
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
