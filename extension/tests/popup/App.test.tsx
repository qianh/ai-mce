import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/entrypoints/popup/App';
import type { ExtractedConversation } from '../../src/lib/types';

const conversation: ExtractedConversation = {
  schema_version: '1',
  extractor_version: 'test',
  source: {
    platform: 'deepseek',
    url: 'https://chat.deepseek.com/a/chat/s/abc',
    browser_title: 'Cloud fallback',
    captured_at: '2026-06-05T00:00:00.000Z',
  },
  content: {
    title: 'Cloud fallback',
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
    source_fingerprint: 'deepseek:abc',
  },
};

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('popup save result handling', () => {
  beforeEach(() => {
    (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mockReset();
    (chrome.tabs.query as unknown as ReturnType<typeof vi.fn>).mockReset();
    (chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>).mockReset();
    Object.defineProperty(chrome.runtime, 'lastError', { value: null, configurable: true });
    chrome.runtime.openOptionsPage = vi.fn();

    (chrome.tabs.query as unknown as ReturnType<typeof vi.fn>).mockImplementation((_query, callback) => {
      callback([{ id: 7, url: 'https://chat.deepseek.com/a/chat/s/abc' }]);
    });
    (chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>).mockImplementation((_tabId, msg, callback) => {
      if (msg.type === 'EXTRACT_CONVERSATION') {
        callback({
          type: 'EXTRACTION_RESULT',
          conversation,
          sensitive: { has_sensitive: false, matches: [] },
        });
      }
    });
  });

  it('shows a local fallback success message when cloud upload fails', async () => {
    (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mockImplementation((_msg, callback) => {
      callback({
        type: 'SAVE_RESULT',
        success: true,
        capture_id: 'local-fallback',
        storage_state: 'local',
        upload_error: 'CLOUD_UPLOAD_FAILED',
      });
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    const saveButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('保存到 AI Memory'));
    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('已保存到本地');
    expect(container.textContent).toContain('稍后上传云端');

    root.unmount();
    container.remove();
  });
});
