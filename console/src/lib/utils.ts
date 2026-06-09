import type { CaptureListItem } from './types';

export const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  deepseek: 'DeepSeek',
  claude: 'Claude Code',
  codex: 'Codex',
  grok: 'Grok',
  opencode: 'OpenCode',
};

export function platformLabel(p: string): string {
  return PLATFORM_LABELS[p] ?? p;
}

export function isDesktop(item: Pick<CaptureListItem, 'source_url'>): boolean {
  return item.source_url === 'desktop';
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
