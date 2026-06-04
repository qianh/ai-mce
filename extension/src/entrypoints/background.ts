import { dbInit, dbExportBytes } from '../db/bridge';
import { upsertCapture, insertCapture, getCaptureByFingerprint } from '../db/repos/captures';
import { getSettings, setSetting } from '../db/repos/settings';
import type { SaveRequest, SaveResult, Settings } from '../lib/types';

async function ensureOffscreenDocument() {
  const existing = await chrome.offscreen.hasDocument();
  if (existing) return;
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL('offscreen.html'),
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: 'SQLite OPFS worker requires Dedicated Worker context not available in MV3 service workers',
  });
}

// Shared init promise — prevents concurrent createDocument() calls (Chrome allows only one).
// Reset on failure so a retry is possible.
let _readyPromise: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (!_readyPromise) {
    _readyPromise = ensureOffscreenDocument()
      .then(() => dbInit())
      .catch((err) => {
        _readyPromise = null;
        throw err;
      });
  }
  return _readyPromise;
}

export default defineBackground(async () => {
  // Register listeners synchronously before any await — prevents race where popup
  // sends SAVE_REQUEST before the listener is registered during slow DB init.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'save-selection',
      title: '保存到 AI Memory',
      contexts: ['selection'],
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'save-selection' && tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' });
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.type) {
      case 'SAVE_REQUEST':
        handleSave(msg as SaveRequest, sendResponse);
        return true;
      case 'SET_SETTING':
        setSetting(msg.key as keyof Settings, msg.value as string | null)
          .then(() => sendResponse({ ok: true }));
        return true;
      case 'GET_SETTINGS':
        getSettings().then(sendResponse);
        return true;
      case 'EXPORT_DB':
        handleExport(sendResponse);
        return true;
    }
  });

  await ensureReady();
});

async function handleSave(req: SaveRequest, sendResponse: (r: SaveResult) => void) {
  const { conversation } = req;
  try {
    await ensureReady();
    if (conversation.metadata?.conversation_id) {
      await upsertCapture(conversation);
    } else {
      const existing = await getCaptureByFingerprint(conversation.hashes.content_hash);
      if (existing) {
        sendResponse({ type: 'SAVE_RESULT', success: false, error: 'DUPLICATE', capture_id: existing.id });
        return;
      }
      await insertCapture(conversation);
    }
    sendResponse({ type: 'SAVE_RESULT', success: true });
  } catch {
    sendResponse({ type: 'SAVE_RESULT', success: false, error: 'WRITE_ERROR' });
  }
}

async function handleExport(sendResponse: (r: { ok: boolean; bytes?: ArrayBuffer }) => void) {
  try {
    await ensureReady();
    const bytes = await dbExportBytes();
    sendResponse({ ok: true, bytes: bytes.buffer as ArrayBuffer });
  } catch { sendResponse({ ok: false }); }
}
