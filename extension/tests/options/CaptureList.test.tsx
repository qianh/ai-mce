import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Capture } from '../../src/lib/types';
import CaptureList from '../../src/entrypoints/options/pages/CaptureList';

const captures = vi.hoisted<Capture[]>(() => [
  {
    id: '1',
    source_platform: 'chatgpt',
    source_url: 'https://chatgpt.com/c/1',
    source_title: 'Obsidian CLI Skill 作用',
    content_hash: 'hash-1',
    extraction_quality: { confidence: 0.9, method: 'dom_attr', warnings: [], message_count: 2, empty_message_count: 0 },
    status: 'error',
    created_at: '2026-06-04T03:15:07.000Z',
  },
  {
    id: '2',
    source_platform: 'chatgpt',
    source_url: 'https://chatgpt.com/c/2',
    source_title: 'gifgaff 卡使用指南',
    content_hash: 'hash-2',
    extraction_quality: { confidence: 0.9, method: 'dom_attr', warnings: [], message_count: 2, empty_message_count: 0 },
    status: 'saved',
    created_at: '2026-06-03T09:15:55.000Z',
  },
  {
    id: '3',
    source_platform: 'deepseek',
    source_url: 'https://chat.deepseek.com/a/chat/s/3',
    source_title: 'DeepSeek 本地优先讨论',
    content_hash: 'hash-3',
    extraction_quality: { confidence: 0.9, method: 'dom_attr', warnings: [], message_count: 2, empty_message_count: 0 },
    status: 'saved',
    created_at: '2026-06-02T09:15:55.000Z',
  },
]);

vi.mock('../../src/db/bridge', () => ({
  dbInit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/db/repos/captures', () => ({
  listCaptures: vi.fn().mockResolvedValue(captures),
}));

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('CaptureList', () => {
  async function renderList() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CaptureList />
        </MemoryRouter>
      );
    });
    await flushEffects();

    return { container, root };
  }

  it('renders capture rows with channel labels and without status badges', async () => {
    const { container, root } = await renderList();

    expect(container.textContent).toContain('Obsidian CLI Skill 作用');
    expect(container.textContent).toContain('gifgaff 卡使用指南');
    expect(container.textContent).toContain('DeepSeek 本地优先讨论');
    expect(container.textContent).toContain('ChatGPT');
    expect(container.textContent).toContain('DeepSeek');
    expect(container.textContent).not.toContain('AI失败');
    expect(container.textContent).not.toContain('已处理');
    expect(container.textContent).not.toContain('处理中');

    root.unmount();
    container.remove();
  });

  it('filters captures by platform', async () => {
    const { container, root } = await renderList();
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="渠道筛选"]');
    expect(select).not.toBeNull();

    await act(async () => {
      select!.value = 'deepseek';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('DeepSeek 本地优先讨论');
    expect(container.textContent).not.toContain('Obsidian CLI Skill 作用');
    expect(container.textContent).not.toContain('gifgaff 卡使用指南');

    root.unmount();
    container.remove();
  });

  it('filters captures by fuzzy title search', async () => {
    const { container, root } = await renderList();
    const input = container.querySelector<HTMLInputElement>('input[aria-label="标题搜索"]');
    expect(input).not.toBeNull();

    await act(async () => {
      input!.value = '本地';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.textContent).toContain('DeepSeek 本地优先讨论');
    expect(container.textContent).not.toContain('Obsidian CLI Skill 作用');

    root.unmount();
    container.remove();
  });

  it('combines platform and title filters and shows a filtered empty state', async () => {
    const { container, root } = await renderList();
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="渠道筛选"]');
    const input = container.querySelector<HTMLInputElement>('input[aria-label="标题搜索"]');

    await act(async () => {
      select!.value = 'deepseek';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
      input!.value = 'Obsidian';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.textContent).toContain('没有匹配的记录');
    expect(container.textContent).not.toContain('还没有保存记录');

    root.unmount();
    container.remove();
  });
});
