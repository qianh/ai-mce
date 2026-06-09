import { getTokens, setTokens, clearTokens } from './auth';
import type { CaptureListItem, CaptureDetail, ListParams } from './types';

const BASE_URL: string = (import.meta as unknown as { env?: Record<string, string> }).env?.API_URL ?? 'http://localhost:8008';

async function request<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const tokens = getTokens();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (tokens) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }

  const resp = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (resp.status === 401 && !retried && tokens) {
    const refreshed = await tryRefresh(tokens.refreshToken);
    if (refreshed) {
      return request<T>(path, options, true);
    }
    clearTokens();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${resp.status}`);
  }

  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

async function tryRefresh(refreshToken: string): Promise<boolean> {
  try {
    const resp = await fetch(`${BASE_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export async function login(email: string, password: string): Promise<void> {
  const data = await request<{ access_token: string; refresh_token: string }>(
    '/v1/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  setTokens(data.access_token, data.refresh_token);
}

export async function listCaptures(params: ListParams = {}): Promise<CaptureListItem[]> {
  const qs = new URLSearchParams();
  if (params.source_side) qs.set('source_side', params.source_side);
  if (params.source_platform) qs.set('source_platform', params.source_platform);
  qs.set('limit', String(params.limit ?? 20));
  qs.set('offset', String(params.offset ?? 0));
  return request<CaptureListItem[]>(`/v1/captures?${qs}`);
}

export async function getCapture(id: string): Promise<CaptureDetail> {
  return request<CaptureDetail>(`/v1/captures/${id}`);
}

export async function deleteCapture(id: string): Promise<void> {
  return request<void>(`/v1/captures/${id}`, { method: 'DELETE' });
}
