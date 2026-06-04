// Routes all DB commands to the offscreen document via chrome.runtime.sendMessage.
// The offscreen document hosts a Dedicated Worker with OriginPrivateFileSystemVFS (OPFS).
// This works from both background service workers and extension pages.

export type DbCommand =
  | { id: string; cmd: 'init' }
  | { id: string; cmd: 'exec'; sql: string; params?: unknown[] }
  | { id: string; cmd: 'query'; sql: string; params?: unknown[] }
  | { id: string; cmd: 'export_bytes' };

export type DbResponse =
  | { id: string; ok: true; rows?: unknown[][]; bytes?: number[] }
  | { id: string; ok: false; error: string };

type CmdPayload =
  | { cmd: 'init' }
  | { cmd: 'exec'; sql: string; params?: unknown[] }
  | { cmd: 'query'; sql: string; params?: unknown[] }
  | { cmd: 'export_bytes' };

function send(cmd: CmdPayload): Promise<DbResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ target: 'offscreen-db', ...cmd }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response?.ok) {
        reject(new Error(response?.error ?? 'unknown DB error'));
      } else {
        resolve(response);
      }
    });
  });
}

export async function dbInit(): Promise<void> {
  await send({ cmd: 'init' });
}

export async function dbExec(sql: string, params?: unknown[]): Promise<void> {
  await send({ cmd: 'exec', sql, params });
}

export async function dbQuery<T = unknown[]>(sql: string, params?: unknown[]): Promise<T[]> {
  const r = await send({ cmd: 'query', sql, params }) as { id: string; ok: true; rows?: unknown[][] };
  return (r.rows ?? []) as T[];
}

export async function dbExportBytes(): Promise<Uint8Array> {
  const r = await send({ cmd: 'export_bytes' }) as { id: string; ok: true; bytes?: number[] };
  return r.bytes ? new Uint8Array(r.bytes) : new Uint8Array(0);
}
