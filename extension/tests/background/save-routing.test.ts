import { describe, expect, it, vi } from 'vitest';
import { saveConversation } from '../../src/lib/save-handler';
import type { ExtractedConversation, Settings } from '../../src/lib/types';

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
  metadata: { conversation_id: 'abc' },
};

function settings(overrides: Partial<Settings>): Settings {
  return {
    report_mode: 'manual',
    storage_mode: 'local',
    api_base_url: 'http://localhost:8000',
    schema_version: 3,
    ...overrides,
  };
}

describe('save routing', () => {
  it('keeps Local Mode local-only', async () => {
    const deps = {
      ensureReady: vi.fn().mockResolvedValue(undefined),
      getSettings: vi.fn().mockResolvedValue(settings({ storage_mode: 'local' })),
      saveLocal: vi.fn().mockResolvedValue('local-1'),
      saveCloudLink: vi.fn(),
      uploadCapture: vi.fn(),
      hasSensitiveContent: vi.fn().mockReturnValue(false),
    };

    await expect(saveConversation(conversation, deps)).resolves.toMatchObject({
      success: true,
      capture_id: 'local-1',
      storage_state: 'local',
    });
    expect(deps.uploadCapture).not.toHaveBeenCalled();
    expect(deps.saveLocal).toHaveBeenCalledWith(conversation, undefined);
  });

  it('stores cloud metadata after Cloud Mode upload succeeds', async () => {
    const deps = {
      ensureReady: vi.fn().mockResolvedValue(undefined),
      getSettings: vi.fn().mockResolvedValue(settings({
        storage_mode: 'cloud',
        cloud_access_token: 'access',
        cloud_refresh_token: 'refresh',
      })),
      saveLocal: vi.fn(),
      saveCloudLink: vi.fn().mockResolvedValue('local-cloud-link'),
      uploadCapture: vi.fn().mockResolvedValue({ id: 'cloud-1', updated_at: '2026-06-05T00:00:01.000Z' }),
      hasSensitiveContent: vi.fn().mockReturnValue(false),
    };

    await expect(saveConversation(conversation, deps)).resolves.toMatchObject({
      success: true,
      capture_id: 'local-cloud-link',
      storage_state: 'cloud',
    });
    expect(deps.uploadCapture).toHaveBeenCalledWith(conversation);
    expect(deps.saveCloudLink).toHaveBeenCalledWith(conversation, 'cloud-1', '2026-06-05T00:00:01.000Z');
    expect(deps.saveLocal).not.toHaveBeenCalled();
  });

  it('falls back to Local Data when Cloud Mode upload fails', async () => {
    const deps = {
      ensureReady: vi.fn().mockResolvedValue(undefined),
      getSettings: vi.fn().mockResolvedValue(settings({
        storage_mode: 'cloud',
        cloud_access_token: 'access',
        cloud_refresh_token: 'refresh',
      })),
      saveLocal: vi.fn().mockResolvedValue('local-fallback'),
      saveCloudLink: vi.fn(),
      uploadCapture: vi.fn().mockRejectedValue(new Error('network')),
      hasSensitiveContent: vi.fn().mockReturnValue(false),
    };

    await expect(saveConversation(conversation, deps)).resolves.toMatchObject({
      success: true,
      capture_id: 'local-fallback',
      storage_state: 'local',
      upload_error: 'CLOUD_UPLOAD_FAILED',
    });
    expect(deps.saveLocal).toHaveBeenCalledWith(conversation, 'CLOUD_UPLOAD_FAILED');
  });

  it('stores cloud metadata when the upload dependency refreshes an expired token and succeeds', async () => {
    const deps = {
      ensureReady: vi.fn().mockResolvedValue(undefined),
      getSettings: vi.fn().mockResolvedValue(settings({
        storage_mode: 'cloud',
        cloud_access_token: 'expired-access',
        cloud_refresh_token: 'refresh',
      })),
      saveLocal: vi.fn(),
      saveCloudLink: vi.fn().mockResolvedValue('local-cloud-link'),
      uploadCapture: vi.fn().mockResolvedValue({ id: 'cloud-1', updated_at: '2026-06-06T00:00:01.000Z' }),
      hasSensitiveContent: vi.fn().mockReturnValue(false),
    };

    await expect(saveConversation(conversation, deps)).resolves.toMatchObject({
      success: true,
      capture_id: 'local-cloud-link',
      storage_state: 'cloud',
    });
    expect(deps.uploadCapture).toHaveBeenCalledWith(conversation);
    expect(deps.saveCloudLink).toHaveBeenCalledWith(conversation, 'cloud-1', '2026-06-06T00:00:01.000Z');
    expect(deps.saveLocal).not.toHaveBeenCalled();
  });

  it('stores cloud metadata when only the refresh token remains', async () => {
    const deps = {
      ensureReady: vi.fn().mockResolvedValue(undefined),
      getSettings: vi.fn().mockResolvedValue(settings({
        storage_mode: 'cloud',
        cloud_refresh_token: 'refresh',
      })),
      saveLocal: vi.fn(),
      saveCloudLink: vi.fn().mockResolvedValue('local-cloud-link'),
      uploadCapture: vi.fn().mockResolvedValue({ id: 'cloud-1', updated_at: '2026-06-06T00:00:01.000Z' }),
      hasSensitiveContent: vi.fn().mockReturnValue(false),
    };

    await expect(saveConversation(conversation, deps)).resolves.toMatchObject({
      success: true,
      capture_id: 'local-cloud-link',
      storage_state: 'cloud',
    });
    expect(deps.uploadCapture).toHaveBeenCalledWith(conversation);
    expect(deps.saveCloudLink).toHaveBeenCalledWith(conversation, 'cloud-1', '2026-06-06T00:00:01.000Z');
    expect(deps.saveLocal).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation before uploading sensitive content to cloud', async () => {
    const deps = {
      ensureReady: vi.fn().mockResolvedValue(undefined),
      getSettings: vi.fn().mockResolvedValue(settings({
        storage_mode: 'cloud',
        cloud_access_token: 'access',
        cloud_refresh_token: 'refresh',
      })),
      saveLocal: vi.fn().mockResolvedValue('local-sensitive'),
      saveCloudLink: vi.fn(),
      uploadCapture: vi.fn(),
      hasSensitiveContent: vi.fn().mockReturnValue(true),
    };

    await expect(saveConversation(conversation, deps, { confirmedSensitiveUpload: false })).resolves.toMatchObject({
      success: true,
      capture_id: 'local-sensitive',
      storage_state: 'local',
      upload_error: 'SENSITIVE_UPLOAD_REQUIRES_CONFIRMATION',
    });
    expect(deps.uploadCapture).not.toHaveBeenCalled();
    expect(deps.saveLocal).toHaveBeenCalledWith(conversation, 'SENSITIVE_UPLOAD_REQUIRES_CONFIRMATION');
  });
});
