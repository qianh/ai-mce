import { CloudApiError, createCloudApiClient } from './cloud-api';
import type { CloudCaptureDetail, CloudCaptureListItem, CloudCaptureUploadResponse } from './cloud-api';
import type { ExtractedConversation, Settings } from './types';

type CloudClient = ReturnType<typeof createCloudApiClient>;

export type CloudSessionDeps = {
  getSettings: () => Promise<Settings>;
  setSetting: (key: keyof Settings, value: string | null) => Promise<void>;
  createClient?: (apiBaseUrl: string) => CloudClient;
};

export const CLOUD_SESSION_ALARM = 'cloud-session-refresh';
const REFRESH_BUFFER_MS = 2 * 60 * 1000;
const REFRESH_INTERVAL_MINUTES = 10;
const REFRESH_LOCK_NAME = 'ai-mce-cloud-session-refresh';

let refreshPromise: Promise<string> | null = null;

type RefreshOptions = {
  force?: boolean;
};

type ActiveCloudSettings = Settings & {
  storage_mode: 'cloud';
  cloud_refresh_token: string;
};

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
}

export function getAccessTokenExpiry(accessToken: string): number | null {
  try {
    const payloadSegment = accessToken.split('.')[1];
    if (!payloadSegment) return null;
    const payload = JSON.parse(decodeBase64Url(payloadSegment)) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isAccessTokenStale(accessToken: string, bufferMs = REFRESH_BUFFER_MS): boolean {
  const expiresAt = getAccessTokenExpiry(accessToken);
  if (!expiresAt) return true;
  return Date.now() >= expiresAt - bufferMs;
}

function assertActiveCloudSettings(settings: Settings): asserts settings is ActiveCloudSettings {
  if (settings.storage_mode !== 'cloud' || !settings.cloud_refresh_token) {
    throw new CloudApiError(401, 'Invalid token');
  }
}

async function getActiveCloudSettings(deps: CloudSessionDeps): Promise<ActiveCloudSettings> {
  const settings = await deps.getSettings();
  assertActiveCloudSettings(settings);
  return settings;
}

async function persistCloudSession(
  deps: CloudSessionDeps,
  refreshed: { access_token: string; refresh_token: string; user: { email: string } },
  expectedRefreshToken: string,
): Promise<string> {
  const currentSettings = await deps.getSettings();
  assertActiveCloudSettings(currentSettings);
  if (currentSettings.cloud_refresh_token !== expectedRefreshToken) {
    throw new CloudApiError(401, 'Invalid token');
  }

  await deps.setSetting('cloud_access_token', refreshed.access_token);
  await deps.setSetting('cloud_refresh_token', refreshed.refresh_token);
  await deps.setSetting('cloud_user_email', refreshed.user.email);
  return refreshed.access_token;
}

async function withCrossContextRefreshLock<T>(callback: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) {
    return callback();
  }

  return navigator.locks.request(REFRESH_LOCK_NAME, { mode: 'exclusive' }, callback);
}

async function refreshAccessToken(deps: CloudSessionDeps, options: RefreshOptions = {}): Promise<string> {
  const settings = await getActiveCloudSettings(deps);
  if (!options.force && settings.cloud_access_token && !isAccessTokenStale(settings.cloud_access_token)) {
    return settings.cloud_access_token;
  }

  const refreshToken = settings.cloud_refresh_token;
  const client = (deps.createClient ?? createCloudApiClient)(settings.api_base_url);
  const refreshed = await client.refresh(refreshToken);
  return persistCloudSession(deps, refreshed, refreshToken);
}

async function refreshAccessTokenLocked(deps: CloudSessionDeps, options: RefreshOptions = {}): Promise<string> {
  return withCrossContextRefreshLock(() => refreshAccessToken(deps, options));
}

async function refreshAccessTokenDeduped(deps: CloudSessionDeps, options: RefreshOptions = {}): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessTokenLocked(deps, options).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function recoverAccessTokenAfterUnauthorized(deps: CloudSessionDeps, failedToken: string): Promise<string> {
  const settings = await getActiveCloudSettings(deps);

  if (
    settings.cloud_access_token &&
    settings.cloud_access_token !== failedToken &&
    !isAccessTokenStale(settings.cloud_access_token)
  ) {
    return settings.cloud_access_token;
  }

  return refreshAccessTokenDeduped(deps, { force: true });
}

export async function ensureCloudAccessToken(deps: CloudSessionDeps): Promise<string | null> {
  const settings = await deps.getSettings();
  if (settings.storage_mode !== 'cloud' || !settings.cloud_refresh_token) return null;

  if (settings.cloud_access_token && !isAccessTokenStale(settings.cloud_access_token)) {
    return settings.cloud_access_token;
  }

  return refreshAccessTokenDeduped(deps);
}

export async function refreshCloudSessionIfNeeded(deps: CloudSessionDeps): Promise<void> {
  try {
    await ensureCloudAccessToken(deps);
  } catch {
    // Background refresh should never interrupt capture flows.
  }
}

function hasAlarmsApi(): boolean {
  const extensionChrome = (globalThis as unknown as {
    chrome?: { alarms?: { create?: unknown; clear?: unknown; get?: unknown } };
  }).chrome;
  return Boolean(extensionChrome?.alarms?.create && extensionChrome.alarms.clear && extensionChrome.alarms.get);
}

export async function syncCloudSessionSchedule(settings: Settings): Promise<void> {
  if (!hasAlarmsApi()) return;

  if (settings.storage_mode !== 'cloud' || !settings.cloud_refresh_token) {
    await chrome.alarms.clear(CLOUD_SESSION_ALARM);
    return;
  }

  const existing = await chrome.alarms.get(CLOUD_SESSION_ALARM);
  if (!existing) {
    await chrome.alarms.create(CLOUD_SESSION_ALARM, { periodInMinutes: REFRESH_INTERVAL_MINUTES });
  }
}

export async function withCloudSessionRefresh<T>(
  operation: (accessToken: string, client: CloudClient) => Promise<T>,
  deps: CloudSessionDeps,
): Promise<T> {
  const accessToken = await ensureCloudAccessToken(deps);
  if (!accessToken) {
    throw new CloudApiError(401, 'Not logged in');
  }

  const settings = await getActiveCloudSettings(deps);
  const client = (deps.createClient ?? createCloudApiClient)(settings.api_base_url);

  try {
    return await operation(accessToken, client);
  } catch (error) {
    if (!(error instanceof CloudApiError) || error.status !== 401) {
      throw error;
    }
  }

  const freshToken = await recoverAccessTokenAfterUnauthorized(deps, accessToken);
  const freshSettings = await getActiveCloudSettings(deps);
  const freshClient = (deps.createClient ?? createCloudApiClient)(freshSettings.api_base_url);
  return operation(freshToken, freshClient);
}

export async function uploadCaptureWithSessionRefresh(
  conversation: ExtractedConversation,
  deps: CloudSessionDeps,
): Promise<CloudCaptureUploadResponse> {
  return withCloudSessionRefresh(
    (token, client) => client.uploadCapture(token, conversation),
    deps,
  );
}

export async function getCaptureWithSessionRefresh(
  captureId: string,
  deps: CloudSessionDeps,
): Promise<CloudCaptureDetail> {
  return withCloudSessionRefresh(
    (token, client) => client.getCapture(token, captureId),
    deps,
  );
}

export async function listCapturesWithSessionRefresh(
  deps: CloudSessionDeps,
): Promise<CloudCaptureListItem[]> {
  return withCloudSessionRefresh(
    (token, client) => client.listCaptures(token),
    deps,
  );
}

export async function deleteCaptureWithSessionRefresh(
  captureId: string,
  deps: CloudSessionDeps,
): Promise<void> {
  return withCloudSessionRefresh(
    (token, client) => client.deleteCapture(token, captureId),
    deps,
  );
}
