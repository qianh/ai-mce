import type { ExtractedConversation, SaveResult, Settings } from './types';

type UploadResult = {
  id: string;
  updated_at: string;
};

type SaveDeps = {
  ensureReady: () => Promise<void>;
  getSettings: () => Promise<Settings>;
  saveLocal: (conversation: ExtractedConversation, uploadError?: string) => Promise<string>;
  saveCloudLink: (conversation: ExtractedConversation, cloudCaptureId: string, uploadedAt: string) => Promise<string>;
  uploadCapture: (accessToken: string, conversation: ExtractedConversation) => Promise<UploadResult>;
  hasSensitiveContent: (conversation: ExtractedConversation) => boolean;
};

type SaveOptions = {
  confirmedSensitiveUpload?: boolean;
};

export async function saveConversation(conversation: ExtractedConversation, deps: SaveDeps, options: SaveOptions = {}): Promise<SaveResult> {
  await deps.ensureReady();
  const settings = await deps.getSettings();

  if (settings.storage_mode !== 'cloud' || !settings.cloud_access_token) {
    const captureId = await deps.saveLocal(conversation, undefined);
    return { type: 'SAVE_RESULT', success: true, capture_id: captureId, storage_state: 'local' };
  }

  if (deps.hasSensitiveContent(conversation) && !options.confirmedSensitiveUpload) {
    const captureId = await deps.saveLocal(conversation, 'SENSITIVE_UPLOAD_REQUIRES_CONFIRMATION');
    return {
      type: 'SAVE_RESULT',
      success: true,
      capture_id: captureId,
      storage_state: 'local',
      upload_error: 'SENSITIVE_UPLOAD_REQUIRES_CONFIRMATION',
    };
  }

  try {
    const uploaded = await deps.uploadCapture(settings.cloud_access_token, conversation);
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
