import { chatgptObserver, chatgptExtractor } from '../../lib/extractors/chatgpt';
import { detectSensitive } from '../../lib/sensitive';

function getConversationId(): string | null {
  return chatgptExtractor.extractConversationId(location.href);
}

function patchHistoryMethod(method: 'pushState' | 'replaceState') {
  const original = history[method].bind(history);
  history[method] = function (...args: Parameters<typeof history.pushState>) {
    original(...args);
    window.dispatchEvent(new Event('locationchange'));
  };
}

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  main() {
    chatgptObserver.start(document);

    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));

    window.addEventListener('locationchange', () => {
      chatgptObserver.reset();
      chatgptObserver.start(document);
    });

    // Auto-save: watch for assistant stream completion
    let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
    const streamObserver = new MutationObserver(() => {
      const assistantNodes = document.querySelectorAll('[data-message-author-role="assistant"]');
      if (!assistantNodes.length) return;
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(async () => {
        const convId = getConversationId();
        if (!convId) return;
        const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        if (settings?.report_mode !== 'auto') return;
        const conversation = await chatgptExtractor.extract(document, location.href);
        const sensitive = detectSensitive(conversation.content.messages);
        if (!sensitive.has_sensitive) {
          chrome.runtime.sendMessage({ type: 'SAVE_REQUEST', conversation });
        }
      }, 500);
    });
    streamObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'EXTRACT_CONVERSATION') {
        chatgptExtractor.extract(document, location.href).then((conversation) => {
          const sensitive = detectSensitive(conversation.content.messages);
          sendResponse({ type: 'EXTRACTION_RESULT', conversation, sensitive });
        }).catch((err) => {
          sendResponse({ type: 'EXTRACTION_ERROR', error: String(err) });
        });
        return true;
      }

      if (msg.type === 'GET_CONVERSATION_ID') {
        sendResponse({ conversationId: getConversationId() });
      }

      if (msg.type === 'GET_SELECTION') {
        const text = window.getSelection()?.toString() ?? '';
        sendResponse({ type: 'SELECTION_CONTENT', text, url: location.href, title: document.title });
      }
    });
  },
});
