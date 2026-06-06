import { dbInit, dbExportBytes } from '../db/bridge';
import { upsertCapture, insertCapture, getCaptureByFingerprint, upsertCloudCaptureLink } from '../db/repos/captures';
import { getSettings, setSetting } from '../db/repos/settings';
import type { ExtractedConversation, SaveRequest, SaveResult, Settings } from '../lib/types';
import { createContextMenuSelectionConversation } from '../lib/context-menu-selection';
import {
  CLOUD_SESSION_ALARM,
  refreshCloudSessionIfNeeded,
  syncCloudSessionSchedule,
  uploadCaptureWithSessionRefresh,
} from '../lib/cloud-session';
import { detectSensitive } from '../lib/sensitive';
import { saveConversation } from '../lib/save-handler';

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
    if (info.menuItemId === 'save-selection') {
      void saveSelectionFromContextMenu(info, tab).catch(() => undefined);
    }
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CLOUD_SESSION_ALARM) {
      void refreshCloudSessionIfNeeded({ getSettings, setSetting });
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
  const settings = await getSettings();
  await syncCloudSessionSchedule(settings);
  await refreshCloudSessionIfNeeded({ getSettings, setSetting });
});

async function handleSave(req: SaveRequest, sendResponse: (r: SaveResult) => void) {
  try {
    const result = await saveCapturedConversation(req.conversation, req.confirmed_sensitive_upload === true);
    sendResponse(result);
  } catch {
    sendResponse({ type: 'SAVE_RESULT', success: false, error: 'WRITE_ERROR' });
  }
}

async function saveSelectionFromContextMenu(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<SaveResult | null> {
  const conversation = await createContextMenuSelectionConversation(info, tab);
  if (!conversation) return null;
  return saveCapturedConversation(conversation, false);
}

async function saveCapturedConversation(
  conversation: ExtractedConversation,
  confirmedSensitiveUpload: boolean
): Promise<SaveResult> {
  return saveConversation(conversation, {
    ensureReady,
    getSettings,
    saveLocal: async (conv, uploadError) => {
      const options = { storage_state: 'local' as const, upload_error: uploadError ?? null };
      if (conv.metadata?.conversation_id) return upsertCapture(conv, options);
      const existing = await getCaptureByFingerprint(conv.hashes.content_hash);
      if (existing) return existing.id;
      return insertCapture(conv, options);
    },
    saveCloudLink: upsertCloudCaptureLink,
    uploadCapture: async (conv) => {
      return uploadCaptureWithSessionRefresh(conv, { getSettings, setSetting });
    },
    hasSensitiveContent: (conv) => detectSensitive(conv.content.messages).has_sensitive,
  }, { confirmedSensitiveUpload });
}

async function handleExport(sendResponse: (r: { ok: boolean; bytes?: ArrayBuffer }) => void) {
  try {
    await ensureReady();
    const bytes = await dbExportBytes();
    sendResponse({ ok: true, bytes: bytes.buffer as ArrayBuffer });
  } catch { sendResponse({ ok: false }); }
}
