import { CloudApiError, createCloudApiClient } from './cloud-api';
import type { CloudCaptureUploadResponse } from './cloud-api';
import type { ExtractedConversation, Settings } from './types';

type CloudClient = ReturnType<typeof createCloudApiClient>;

type CloudSessionDeps = {
  getSettings: () => Promise<Settings>;
  setSetting: (key: keyof Settings, value: string | null) => Promise<void>;
  createClient?: (apiBaseUrl: string) => Pick<CloudClient, 'uploadCapture' | 'refresh'>;
};

export async function uploadCaptureWithSessionRefresh(
  accessToken: string,
  conversation: ExtractedConversation,
  deps: CloudSessionDeps
): Promise<CloudCaptureUploadResponse> {
  const settings = await deps.getSettings();
  const client = (deps.createClient ?? createCloudApiClient)(settings.api_base_url);

  try {
    return await client.uploadCapture(accessToken, conversation);
  } catch (error) {
    if (!(error instanceof CloudApiError) || error.status !== 401 || !settings.cloud_refresh_token) {
      throw error;
    }
  }

  const refreshed = await client.refresh(settings.cloud_refresh_token);
  await deps.setSetting('cloud_access_token', refreshed.access_token);
  await deps.setSetting('cloud_refresh_token', refreshed.refresh_token);
  await deps.setSetting('cloud_user_email', refreshed.user.email);

  return client.uploadCapture(refreshed.access_token, conversation);
}
