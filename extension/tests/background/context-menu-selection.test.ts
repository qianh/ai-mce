import { describe, expect, it } from 'vitest';
import { createContextMenuSelectionConversation } from '../../src/lib/context-menu-selection';

describe('context menu selection capture', () => {
  it('builds a generic web capture from selected text without requiring a content script', async () => {
    const conversation = await createContextMenuSelectionConversation(
      {
        menuItemId: 'save-selection',
        selectionText: '  Selected note from the page.  ',
        pageUrl: 'https://example.com/articles/1',
      },
      {
        title: 'Example Article',
        url: 'https://example.com/articles/1',
      }
    );

    expect(conversation).toMatchObject({
      source: {
        platform: 'generic_web',
        url: 'https://example.com/articles/1',
        browser_title: 'Example Article',
      },
      content: {
        title: 'Example Article',
        messages: [{ role: 'unknown', content: 'Selected note from the page.', index: 0 }],
      },
      extraction_quality: {
        method: 'selection',
        message_count: 1,
        empty_message_count: 0,
      },
      hashes: {
        source_fingerprint: 'generic:https://example.com/articles/1',
      },
    });
    expect(conversation?.hashes.content_hash).toBeTruthy();
  });

  it('skips blank selected text', async () => {
    await expect(createContextMenuSelectionConversation({
      menuItemId: 'save-selection',
      selectionText: '   ',
      pageUrl: 'https://example.com',
    })).resolves.toBeNull();
  });
});
