import type { ExtractedConversation } from './types';

export interface CloudAuthResponse {
  user: { id: string; email: string };
  access_token: string;
  refresh_token: string;
}

export interface CloudCaptureUploadResponse {
  id: string;
  created: boolean;
  updated_at: string;
}

export interface CloudCaptureListItem {
  id: string;
  source_platform: string;
  source_url: string;
  source_title: string;
  content_hash: string;
  source_fingerprint: string;
  extraction_quality: Record<string, unknown>;
  metadata: Record<string, unknown>;
  analysis_status: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface CloudCaptureDetail extends CloudCaptureListItem {
  messages: Array<{ role: string; content: string; index: number }>;
}

export type CloudCaptureListParams = {
  sourceSide?: 'browser' | 'desktop';
};

export class CloudApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'CloudApiError';
    this.status = status;
  }
}

type RequestOptions = {
  method?: string;
  token?: string;
  body?: unknown;
};

function normalizeBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, '');
}

function captureListPath(params: CloudCaptureListParams = {}): string {
  const qs = new URLSearchParams();
  if (params.sourceSide) qs.set('source_side', params.sourceSide);
  const query = qs.toString();
  return query ? `/v1/captures?${query}` : '/v1/captures';
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch {
    // fall through to status text
  }
  return response.statusText || `HTTP ${response.status}`;
}

export function createCloudApiClient(apiBaseUrl: string) {
  const base = normalizeBaseUrl(apiBaseUrl);

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {};
    let body: string | undefined;

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    const response = await fetch(`${base}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
    });

    if (!response.ok) {
      throw new CloudApiError(response.status, await readError(response));
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  return {
    register(email: string, password: string) {
      return request<CloudAuthResponse>('/v1/auth/register', {
        method: 'POST',
        body: { email, password },
      });
    },
    login(email: string, password: string) {
      return request<CloudAuthResponse>('/v1/auth/login', {
        method: 'POST',
        body: { email, password },
      });
    },
    refresh(refreshToken: string) {
      return request<CloudAuthResponse>('/v1/auth/refresh', {
        method: 'POST',
        body: { refresh_token: refreshToken },
      });
    },
    logout(refreshToken: string) {
      return request<void>('/v1/auth/logout', {
        method: 'POST',
        body: { refresh_token: refreshToken },
      });
    },
    uploadCapture(token: string, conversation: ExtractedConversation) {
      return request<CloudCaptureUploadResponse>('/v1/captures', {
        method: 'POST',
        token,
        body: conversation,
      });
    },
    listCaptures(token: string, params?: CloudCaptureListParams) {
      return request<CloudCaptureListItem[]>(captureListPath(params), { token });
    },
    getCapture(token: string, id: string) {
      return request<CloudCaptureDetail>(`/v1/captures/${encodeURIComponent(id)}`, { token });
    },
    deleteCapture(token: string, id: string) {
      return request<void>(`/v1/captures/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        token,
      });
    },
  };
}
