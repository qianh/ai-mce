import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Capture } from '../../src/lib/types';
import CaptureDetail from '../../src/entrypoints/options/pages/CaptureDetail';

const getCaptureById = vi.hoisted(() => vi.fn());
const getCaptureMessages = vi.hoisted(() => vi.fn());
const deleteCapture = vi.hoisted(() => vi.fn());
const upsertCloudCaptureLink = vi.hoisted(() => vi.fn());
const getSettings = vi.hoisted(() => vi.fn());
const setSetting = vi.hoisted(() => vi.fn());
const getCloudCapture = vi.hoisted(() => vi.fn());
const deleteCloudCapture = vi.hoisted(() => vi.fn());
const uploadCloudCapture = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/repos/captures', () => ({
  getCaptureById,
  getCaptureMessages,
  deleteCapture,
  upsertCloudCaptureLink,
}));

vi.mock('../../src/db/repos/settings', () => ({
  getSettings,
  setSetting,
}));

vi.mock('../../src/lib/cloud-api', () => ({
  createCloudApiClient: vi.fn(() => ({
    getCapture: getCloudCapture,
    deleteCapture: deleteCloudCapture,
    uploadCapture: uploadCloudCapture,
  })),
}));

vi.mock('../../src/lib/cloud-session', () => ({
  uploadCaptureWithSessionRefresh: uploadCloudCapture,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

const cloudCapture: Capture = {
  id: 'local-1',
  source_platform: 'chatgpt',
  source_url: 'https://chatgpt.com/c/abc',
  source_title: 'Cloud Spec',
  content_hash: 'hash',
  source_fingerprint: 'chatgpt:abc',
  extraction_quality: { confidence: 0.9, method: 'dom_attr', warnings: [], message_count: 1, empty_message_count: 0 },
  status: 'saved',
  created_at: '2026-06-05T00:00:00.000Z',
  storage_state: 'cloud',
  cloud_capture_id: 'cloud-1',
};

const localCapture: Capture = {
  ...cloudCapture,
  storage_state: 'local',
  cloud_capture_id: null,
};

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderDetail(initialEntry = '/capture/local-1') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/capture/:id" element={<CaptureDetail />} />
        </Routes>
      </MemoryRouter>
    );
  });
  await flushEffects();
  return { container, root };
}

describe('CaptureDetail cloud behavior', () => {
  beforeEach(() => {
    getCaptureById.mockReset().mockResolvedValue(cloudCapture);
    getCaptureMessages.mockReset().mockResolvedValue(null);
    deleteCapture.mockReset().mockResolvedValue(undefined);
    upsertCloudCaptureLink.mockReset().mockResolvedValue('local-1');
    setSetting.mockReset().mockResolvedValue(undefined);
    getSettings.mockReset().mockResolvedValue({
      report_mode: 'manual',
      storage_mode: 'cloud',
      api_base_url: 'http://localhost:8000',
      cloud_access_token: 'access',
      cloud_refresh_token: 'refresh',
      cloud_user_email: 'me@example.com',
      schema_version: 3,
    });
    getCloudCapture.mockReset().mockResolvedValue({
      messages: [{ role: 'assistant', content: 'Remote full text', index: 0 }],
    });
    deleteCloudCapture.mockReset().mockResolvedValue(undefined);
    uploadCloudCapture.mockReset().mockResolvedValue({ id: 'cloud-2', updated_at: '2026-06-05T00:00:02.000Z' });
    navigate.mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('loads cloud detail when local full text is absent', async () => {
    const { container, root } = await renderDetail();

    expect(getCloudCapture).toHaveBeenCalledWith('access', 'cloud-1');
    expect(container.textContent).toContain('Remote full text');

    root.unmount();
    container.remove();
  });

  it('loads cloud-only captures directly from the cloud API', async () => {
    getCaptureById.mockResolvedValue(null);
    getCaptureMessages.mockResolvedValue(null);
    getCloudCapture.mockResolvedValue({
      id: 'cloud-9',
      source_platform: 'claude',
      source_url: 'https://claude.ai/chat/9',
      source_title: '另一设备上传的云端记录',
      content_hash: 'hash-9',
      source_fingerprint: 'claude:9',
      extraction_quality: { confidence: 0.92, method: 'dom_attr', warnings: [], message_count: 1, empty_message_count: 0 },
      metadata: {},
      analysis_status: 'not_started',
      message_count: 1,
      created_at: '2026-06-05T09:15:55.000Z',
      updated_at: '2026-06-05T09:15:55.000Z',
      messages: [{ role: 'assistant', content: 'Remote only full text', index: 0 }],
    });

    const { container, root } = await renderDetail('/capture/cloud:cloud-9');

    expect(getCloudCapture).toHaveBeenCalledWith('access', 'cloud-9');
    expect(container.textContent).toContain('Remote only full text');

    root.unmount();
    container.remove();
  });

  it('deletes cloud-backed captures from cloud and local mapping together', async () => {
    const { container, root } = await renderDetail();
    const deleteButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === '删除');

    await act(async () => {
      deleteButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(deleteCloudCapture).toHaveBeenCalledWith('access', 'cloud-1');
    expect(deleteCapture).toHaveBeenCalledWith('local-1');
    expect(navigate).toHaveBeenCalledWith('/');

    root.unmount();
    container.remove();
  });

  it('uploads a local capture to cloud from detail', async () => {
    getCaptureById.mockResolvedValue(localCapture);
    getCaptureMessages.mockResolvedValue('user: Local full text');
    const { container, root } = await renderDetail();
    const uploadButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === '上传云端');

    await act(async () => {
      uploadButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(uploadCloudCapture).toHaveBeenCalledWith(
      'access',
      expect.objectContaining({
        hashes: expect.objectContaining({
          source_fingerprint: 'chatgpt:abc',
        }),
        content: expect.objectContaining({
          messages: [expect.objectContaining({ content: 'Local full text' })],
        }),
      }),
      expect.objectContaining({ getSettings, setSetting })
    );
    expect(upsertCloudCaptureLink).toHaveBeenCalledWith(
      expect.any(Object),
      'cloud-2',
      '2026-06-05T00:00:02.000Z'
    );

    root.unmount();
    container.remove();
  });
});
