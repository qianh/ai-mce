import { describe, expect, it } from 'vitest';
import { getPagePlatform } from '../../src/entrypoints/popup/platform';

describe('popup platform routing', () => {
  it('routes ChatGPT pages to the ChatGPT content script and waits for conversation id', () => {
    expect(getPagePlatform('https://chatgpt.com/c/abc')).toEqual({
      platform: 'chatgpt',
      scriptFile: 'content-scripts/chatgpt.js',
      requiresConversationId: true,
    });
  });

  it('routes DeepSeek pages to the DeepSeek content script without ChatGPT id gating', () => {
    expect(getPagePlatform('https://chat.deepseek.com/a/chat/s/abc')).toEqual({
      platform: 'deepseek',
      scriptFile: 'content-scripts/deepseek.js',
      requiresConversationId: false,
    });
  });

  it('returns null for unsupported pages', () => {
    expect(getPagePlatform('https://example.com/')).toBeNull();
  });
});
