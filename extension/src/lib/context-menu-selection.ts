import { createGenericSelectionConversation } from './extractors/generic';
import type { ExtractedConversation } from './types';

type ContextMenuSelectionInfo = Pick<chrome.contextMenus.OnClickData, 'menuItemId' | 'selectionText' | 'pageUrl' | 'frameUrl'>;
type ContextMenuSelectionTab = Pick<chrome.tabs.Tab, 'title' | 'url'>;

export async function createContextMenuSelectionConversation(
  info: ContextMenuSelectionInfo,
  tab?: ContextMenuSelectionTab
): Promise<ExtractedConversation | null> {
  const text = info.selectionText?.trim();
  if (!text) return null;

  return createGenericSelectionConversation({
    text,
    url: info.pageUrl ?? info.frameUrl ?? tab?.url ?? '',
    title: tab?.title,
  });
}
