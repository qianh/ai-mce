import { dbInit, dbExportBytes } from '../db/bridge';
import { insertCapture, getCaptureByHash, updateCaptureStatus, updateCaptureSummary } from '../db/repos/captures';
import { insertCandidates, listCandidatesForCapture } from '../db/repos/memories';
import { insertContextPack, getContextPackForCapture } from '../db/repos/context-packs';
import { getSettings, setSetting } from '../db/repos/settings';
import { generateSummary, extractMemoryCandidates, validateApiKey } from '../lib/claude-api';
import { buildContextPack } from '../lib/context-pack';
import type { SaveRequest, SaveResult, ProgressUpdate, ProgressStep, Settings } from '../lib/types';

export default defineBackground(async () => {
  await dbInit();

  chrome.contextMenus.create({
    id: 'save-selection',
    title: '保存到 AI Memory',
    contexts: ['selection'],
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
      case 'VALIDATE_API_KEY':
        validateApiKey(msg.key as string).then((ok) => sendResponse({ ok }));
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
      case 'GET_CONTEXT_PACK':
        getContextPackForCapture(msg.capture_id as string)
          .then((pack) => sendResponse({ markdown: pack?.content_markdown ?? null }));
        return true;
    }
  });
});

function pushProgress(captureId: string, step: ProgressStep, result?: ProgressUpdate['result']) {
  chrome.runtime.sendMessage({
    type: 'PROGRESS_UPDATE', capture_id: captureId, step, result,
  } satisfies ProgressUpdate).catch(() => {});
}

async function handleSave(req: SaveRequest, sendResponse: (r: SaveResult) => void) {
  const { conversation } = req;
  const existing = await getCaptureByHash(conversation.hashes.content_hash);
  if (existing) {
    sendResponse({ type: 'SAVE_RESULT', success: false, error: 'DUPLICATE', capture_id: existing.id });
    return;
  }
  const captureId = await insertCapture(conversation);
  pushProgress(captureId, { step: 'writing_local', status: 'done' });
  sendResponse({ type: 'SAVE_RESULT', success: true, capture_id: captureId });

  const settings = await getSettings();
  if (!settings.claude_api_key) { await updateCaptureStatus(captureId, 'ai_failed'); return; }

  const text = conversation.content.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
  pushProgress(captureId, { step: 'generating_summary', status: 'running' });
  let summary = '';
  try {
    summary = await generateSummary(settings.claude_api_key, text);
    await updateCaptureSummary(captureId, summary);
    pushProgress(captureId, { step: 'generating_summary', status: 'done' });
  } catch { pushProgress(captureId, { step: 'generating_summary', status: 'failed' }); }

  pushProgress(captureId, { step: 'extracting_memories', status: 'running' });
  try {
    const candidates = await extractMemoryCandidates(settings.claude_api_key, text);
    await insertCandidates(captureId, candidates);
    pushProgress(captureId, { step: 'extracting_memories', status: 'done' }, { memory_count: candidates.length });
  } catch { pushProgress(captureId, { step: 'extracting_memories', status: 'failed' }); }

  pushProgress(captureId, { step: 'building_context_pack', status: 'running' });
  try {
    const all = await listCandidatesForCapture(captureId);
    const decisions = all.filter((c) => ['L3','L4','L5'].includes(c.level));
    const actions = all.filter((c) => ['L1','L2'].includes(c.level));
    const markdown = buildContextPack(conversation.content.title, summary, decisions, actions);
    const packId = await insertContextPack(captureId, conversation.content.title, markdown);
    await updateCaptureStatus(captureId, 'processed');
    pushProgress(captureId, { step: 'building_context_pack', status: 'done' }, { context_pack_id: packId });
  } catch {
    await updateCaptureStatus(captureId, 'ai_failed');
    pushProgress(captureId, { step: 'building_context_pack', status: 'failed' });
  }
}

async function handleExport(sendResponse: (r: { ok: boolean; bytes?: ArrayBuffer }) => void) {
  try {
    const bytes = await dbExportBytes();
    sendResponse({ ok: true, bytes: bytes.buffer });
  } catch { sendResponse({ ok: false }); }
}
