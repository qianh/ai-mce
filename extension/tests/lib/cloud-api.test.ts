import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudApiClient, CloudApiError } from '../../src/lib/cloud-api';
import type { ExtractedConversation } from '../../src/lib/types';

const fetchMock = vi.hoisted(() => vi.fn());

vi.stubGlobal('fetch', fetchMock);

const conversation: ExtractedConversation = {
  schema_version: '1',
  extractor_version: 'test',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/abc',
    browser_title: 'Cloud Spec',
    captured_at: '2026-06-05T00:00:00.000Z',
  },
  content: {
    title: 'Cloud Spec',
    messages: [{ role: 'user', content: 'hello', index: 0 }],
  },
  extraction_quality: {
    confidence: 0.9,
    method: 'dom_attr',
    warnings: [],
    message_count: 1,
    empty_message_count: 0,
  },
  hashes: {
    content_hash: 'hash',
    message_hashes: ['m1'],
    source_fingerprint: 'chatgpt:abc',
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('cloud api client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('registers users against the configured base url', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      user: { id: 'user-1', email: 'me@example.com' },
      access_token: 'access',
      refresh_token: 'refresh',
    }, 201));
    const client = createCloudApiClient('https://memory.example.com/');

    const result = await client.register('me@example.com', 'secret123');

    expect(result.access_token).toBe('access');
    expect(fetchMock).toHaveBeenCalledWith('https://memory.example.com/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'me@example.com', password: 'secret123' }),
    });
  });

  it('uploads captures with bearer auth', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'cap-1', created: true, updated_at: 'now' }, 201));
    const client = createCloudApiClient('https://memory.example.com');

    await expect(client.uploadCapture('access', conversation)).resolves.toMatchObject({ id: 'cap-1' });

    expect(fetchMock).toHaveBeenCalledWith('https://memory.example.com/v1/captures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer access',
      },
      body: JSON.stringify(conversation),
    });
  });

  it('maps non-ok responses to CloudApiError', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Invalid token' }, 401));
    const client = createCloudApiClient('https://memory.example.com');

    await expect(client.listCaptures('bad-token')).rejects.toMatchObject({
      name: 'CloudApiError',
      status: 401,
      message: 'Invalid token',
    });
  });

  it('supports filtering captures to browser sources', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    const client = createCloudApiClient('https://memory.example.com');

    await client.listCaptures('access', { sourceSide: 'browser' });

    expect(fetchMock).toHaveBeenCalledWith('https://memory.example.com/v1/captures?source_side=browser', {
      method: 'GET',
      headers: { Authorization: 'Bearer access' },
      body: undefined,
    });
  });

  it('supports login, refresh, detail, and delete routes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { id: 'user-1', email: 'me@example.com' }, access_token: 'a', refresh_token: 'r' }))
      .mockResolvedValueOnce(jsonResponse({ user: { id: 'user-1', email: 'me@example.com' }, access_token: 'a2', refresh_token: 'r2' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'cap-1', messages: [], extraction_quality: {}, metadata: {}, analysis_status: 'not_started', message_count: 0 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createCloudApiClient('https://memory.example.com');

    await client.login('me@example.com', 'secret123');
    await client.refresh('refresh');
    await client.getCapture('access', 'cap-1');
    await client.deleteCapture('access', 'cap-1');

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://memory.example.com/v1/auth/login',
      'https://memory.example.com/v1/auth/refresh',
      'https://memory.example.com/v1/captures/cap-1',
      'https://memory.example.com/v1/captures/cap-1',
    ]);
  });
});
