export type SupportedPagePlatform = 'chatgpt' | 'deepseek';

export interface PagePlatformRoute {
  platform: SupportedPagePlatform;
  scriptFile: string;
  requiresConversationId: boolean;
}

export function getPagePlatform(url: string | undefined | null): PagePlatformRoute | null {
  if (!url) return null;
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  if (hostname.includes('chatgpt.com')) {
    return {
      platform: 'chatgpt',
      scriptFile: 'content-scripts/chatgpt.js',
      requiresConversationId: true,
    };
  }

  if (hostname === 'chat.deepseek.com') {
    return {
      platform: 'deepseek',
      scriptFile: 'content-scripts/deepseek.js',
      requiresConversationId: false,
    };
  }

  return null;
}
