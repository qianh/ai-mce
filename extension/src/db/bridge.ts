// Type-safe message bridge between Service Worker and DB Dedicated Worker.

export type DbCommand =
  | { id: string; cmd: 'init' }
  | { id: string; cmd: 'exec'; sql: string; params?: unknown[] }
  | { id: string; cmd: 'query'; sql: string; params?: unknown[] }
  | { id: string; cmd: 'export_bytes' };

export type DbResponse =
  | { id: string; ok: true; rows?: unknown[][] }
  | { id: string; ok: false; error: string };

let _worker: Worker | null = null;
const _pending = new Map<string, (r: DbResponse) => void>();

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    _worker.onmessage = (e: MessageEvent<DbResponse>) => {
      const cb = _pending.get(e.data.id);
      if (cb) { _pending.delete(e.data.id); cb(e.data); }
    };
    _worker.onerror = (e) => console.error('[DB Worker]', e.message);
  }
  return _worker;
}

type CmdPayload =
  | { cmd: 'init' }
  | { cmd: 'exec'; sql: string; params?: unknown[] }
  | { cmd: 'query'; sql: string; params?: unknown[] }
  | { cmd: 'export_bytes' };

function send(cmd: CmdPayload): Promise<DbResponse> {
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    _pending.set(id, resolve);
    getWorker().postMessage({ ...cmd, id });
    setTimeout(() => {
      if (_pending.has(id)) { _pending.delete(id); resolve({ id, ok: false, error: `timeout: ${cmd.cmd}` }); }
    }, 15_000);
  });
}

export async function dbInit(): Promise<void> {
  const r = await send({ cmd: 'init' });
  if (!r.ok) throw new Error(r.error);
}

export async function dbExec(sql: string, params?: unknown[]): Promise<void> {
  const r = await send({ cmd: 'exec', sql, params });
  if (!r.ok) throw new Error(r.error);
}

export async function dbQuery<T = unknown[]>(sql: string, params?: unknown[]): Promise<T[]> {
  const r = await send({ cmd: 'query', sql, params });
  if (!r.ok) throw new Error(r.error);
  return (r.rows ?? []) as T[];
}

export async function dbExportBytes(): Promise<Uint8Array> {
  const r = await send({ cmd: 'export_bytes' });
  if (!r.ok) throw new Error(r.error);
  return (r.rows?.[0]?.[0] as Uint8Array) ?? new Uint8Array(0);
}
