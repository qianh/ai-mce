// Offscreen document — the only context that can spawn a Dedicated Worker in MV3.
// Bridges chrome.runtime messages to the SQLite worker (OPFS).

const worker = new Worker(new URL('../../db/worker.ts', import.meta.url), { type: 'module' });
const pending = new Map<string, (r: any) => void>();

worker.onmessage = (e) => {
  const cb = pending.get(e.data.id);
  if (cb) { pending.delete(e.data.id); cb(e.data); }
};
worker.onerror = (e) => console.error('[SQLite Worker]', e.message);

function forwardToWorker(msg: any): Promise<any> {
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ ...msg, id });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ id, ok: false, error: `timeout: ${msg.cmd}` });
      }
    }, 15_000);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen-db') return false;
  forwardToWorker(msg)
    .then((r) => {
      // export_bytes returns Uint8Array inside rows — convert to plain array for structured clone
      if (msg.cmd === 'export_bytes' && r.ok) {
        const bytes: Uint8Array = r.rows?.[0]?.[0] ?? new Uint8Array(0);
        sendResponse({ ok: true, bytes: Array.from(bytes) });
      } else {
        sendResponse(r);
      }
    })
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});
