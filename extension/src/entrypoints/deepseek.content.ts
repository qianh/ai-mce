import { deepseekExtractor, deepseekObserver } from '../lib/extractors/deepseek';
import { detectSensitive } from '../lib/sensitive';

function getConversationId(): string | null {
  return deepseekExtractor.extractConversationId(location.href);
}

export default defineContentScript({
  matches: ['https://chat.deepseek.com/*'],
  main(ctx) {
    let currentHref = location.href;
    deepseekObserver.start(document, currentHref);

    const restartObserver = () => {
      currentHref = location.href;
      deepseekObserver.reset();
      deepseekObserver.start(document, currentHref);
    };

    const resetIfRouteChanged = () => {
      if (location.href === currentHref) return;
      restartObserver();
    };

    ctx.addEventListener(window, 'wxt:locationchange', resetIfRouteChanged);
    ctx.addEventListener(window, 'popstate', resetIfRouteChanged);
    ctx.setInterval(resetIfRouteChanged, 1000);

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'EXTRACT_CONVERSATION') {
        resetIfRouteChanged();
        deepseekExtractor.extract(document, location.href).then((conversation) => {
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
