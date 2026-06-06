import type { ExtractedConversation, SaveResult, Settings } from './types';
import { detectSensitive } from './sensitive';

type UploadResult = {
  id: string;
  updated_at: string;
};

type SaveDeps = {
  ensureReady: () => Promise<void>;
  getSettings: () => Promise<Settings>;
  saveLocal: (conversation: ExtractedConversation, uploadError?: string) => Promise<string>;
  saveCloudLink: (conversation: ExtractedConversation, cloudCaptureId: string, uploadedAt: string) => Promise<string>;
  uploadCapture: (conversation: ExtractedConversation) => Promise<UploadResult>;
};

type SaveOptions = {
  confirmedSensitiveUpload?: boolean;
};

export async function saveConversation(
  conversation: ExtractedConversation,
  deps: SaveDeps,
  options: SaveOptions = {},
): Promise<SaveResult> {
  await deps.ensureReady();
  const settings = await deps.getSettings();

  if (settings.storage_mode !== 'cloud' || !settings.cloud_refresh_token) {
    const captureId = await deps.saveLocal(conversation, undefined);
    return { type: 'SAVE_RESULT', success: true, capture_id: captureId, storage_state: 'local' };
  }

  const sensitive = detectSensitive(conversation.content.messages);
  if (sensitive.has_sensitive && !options.confirmedSensitiveUpload) {
    const captureId = await deps.saveLocal(conversation, 'SENSITIVE_UPLOAD_NOT_CONFIRMED');
    return {
      type: 'SAVE_RESULT',
      success: true,
      capture_id: captureId,
      storage_state: 'local',
      upload_error: 'SENSITIVE_UPLOAD_NOT_CONFIRMED',
    };
  }

  try {
    const uploaded = await deps.uploadCapture(conversation);
    const captureId = await deps.saveCloudLink(conversation, uploaded.id, uploaded.updated_at);
    return { type: 'SAVE_RESULT', success: true, capture_id: captureId, storage_state: 'cloud' };
  } catch {
    const captureId = await deps.saveLocal(conversation, 'CLOUD_UPLOAD_FAILED');
    return {
      type: 'SAVE_RESULT',
      success: true,
      capture_id: captureId,
      storage_state: 'local',
      upload_error: 'CLOUD_UPLOAD_FAILED',
    };
  }
}
