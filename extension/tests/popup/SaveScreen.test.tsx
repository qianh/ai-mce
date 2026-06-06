import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import SaveScreen from '../../src/entrypoints/popup/screens/SaveScreen';
import type { ExtractedConversation } from '../../src/lib/types';

const conversation: ExtractedConversation = {
  schema_version: '1',
  extractor_version: 'test',
  source: {
    platform: 'generic_web',
    url: 'https://x.com/messages',
    browser_title: 'X Chat passcode 获取方法',
    captured_at: '2026-06-06T00:00:00.000Z',
  },
  content: {
    title: 'X Chat passcode 获取方法',
    messages: [
      { role: 'user', content: '我忘记了，也不知道在哪个设备设置过，那么从哪里重置呢', index: 0 },
      { role: 'assistant', content: '只能从已经在使用 Chat 的已登录设备重置。', index: 1 },
    ],
  },
  extraction_quality: {
    confidence: 0.9,
    method: 'dom_attr',
    warnings: [],
    message_count: 2,
    empty_message_count: 0,
  },
  hashes: {
    content_hash: 'hash',
    message_hashes: ['m1', 'm2'],
    source_fingerprint: 'x:messages',
  },
};

const sensitive = {
  has_sensitive: true,
  matches: [
    { type: 'api_key' as const, masked: 'sk-••••XITY', message_index: 0 },
    { type: 'email' as const, masked: 'm••••••••••e@example.com', message_index: 1 },
  ],
};

describe('SaveScreen', () => {
  it('shows sensitive warning details without blocking save', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SaveScreen
          conversation={conversation}
          sensitive={sensitive}
          onSave={vi.fn()}
          onOpenConsole={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('检测到 2 处可能的敏感信息');
    expect(container.textContent).toContain('API Key');
    expect(container.textContent).toContain('邮箱');
    expect(container.textContent).toContain('sk-••••XITY');
    expect(container.textContent).toContain('若当前为云端模式，点击保存将视为同意上传这些内容');
    expect(container.textContent).toContain('保存到 AI Memory');

    root.unmount();
    container.remove();
  });

  it('passes confirmedSensitiveUpload when sensitive matches are present', async () => {
    const onSave = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SaveScreen
          conversation={conversation}
          sensitive={sensitive}
          onSave={onSave}
          onOpenConsole={vi.fn()}
        />,
      );
    });

    const saveButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('保存到 AI Memory'));
    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith(conversation, true);

    root.unmount();
    container.remove();
  });

  it('shows warnings from matches even when has_sensitive is false', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SaveScreen
          conversation={conversation}
          sensitive={{ has_sensitive: false, matches: sensitive.matches }}
          onSave={vi.fn()}
          onOpenConsole={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('检测到 2 处可能的敏感信息');

    root.unmount();
    container.remove();
  });

  it('does not show the privacy notice copy above the save button', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SaveScreen
          conversation={conversation}
          onSave={vi.fn()}
          onOpenConsole={vi.fn()}
        />,
      );
    });

    expect(container.textContent).not.toContain('将保存：页面标题');
    expect(container.textContent).not.toContain('不含 Cookie');
    expect(container.textContent).not.toContain('历史');
    expect(container.textContent).toContain('保存到 AI Memory');

    root.unmount();
    container.remove();
  });
});
