import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudApiError } from '../../src/lib/cloud-api';
import { uploadCaptureWithSessionRefresh } from '../../src/lib/cloud-session';
import type { ExtractedConversation, Settings } from '../../src/lib/types';

const conversation: ExtractedConversation = {
  schema_version: '1',
  extractor_version: 'test',
  source: {
    platform: 'generic_web',
    url: 'https://claude.ai/chat/abc',
    browser_title: 'Claude note',
    captured_at: '2026-06-06T00:00:00.000Z',
  },
  content: {
    title: 'Claude note',
    messages: [{ role: 'unknown', content: 'selected text', index: 0 }],
  },
  extraction_quality: {
    confidence: 0.75,
    method: 'selection',
    warnings: [],
    message_count: 1,
    empty_message_count: 0,
  },
  hashes: {
    content_hash: 'hash',
    message_hashes: ['hash'],
    source_fingerprint: 'generic:https://claude.ai/chat/abc',
  },
};

const settings: Settings = {
  report_mode: 'manual',
  storage_mode: 'cloud',
  api_base_url: 'http://localhost:8008',
  cloud_access_token: 'expired-access',
  cloud_refresh_token: 'refresh',
  cloud_user_email: 'me@example.com',
  schema_version: 3,
};

describe('cloud session refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes an expired access token and retries capture upload', async () => {
    const uploadCapture = vi.fn()
      .mockRejectedValueOnce(new CloudApiError(401, 'Invalid token'))
      .mockResolvedValueOnce({ id: 'cloud-1', updated_at: '2026-06-06T00:00:01.000Z' });
    const refresh = vi.fn().mockResolvedValue({
      user: { id: 'user-1', email: 'me@example.com' },
      access_token: 'fresh-access',
      refresh_token: 'fresh-refresh',
    });
    const setSetting = vi.fn().mockResolvedValue(undefined);

    await expect(uploadCaptureWithSessionRefresh('expired-access', conversation, {
      getSettings: vi.fn().mockResolvedValue(settings),
      setSetting,
      createClient: vi.fn(() => ({ uploadCapture, refresh })),
    })).resolves.toEqual({ id: 'cloud-1', updated_at: '2026-06-06T00:00:01.000Z' });

    expect(refresh).toHaveBeenCalledWith('refresh');
    expect(uploadCapture).toHaveBeenNthCalledWith(1, 'expired-access', conversation);
    expect(uploadCapture).toHaveBeenNthCalledWith(2, 'fresh-access', conversation);
    expect(setSetting).toHaveBeenCalledWith('cloud_access_token', 'fresh-access');
    expect(setSetting).toHaveBeenCalledWith('cloud_refresh_token', 'fresh-refresh');
    expect(setSetting).toHaveBeenCalledWith('cloud_user_email', 'me@example.com');
  });
});
