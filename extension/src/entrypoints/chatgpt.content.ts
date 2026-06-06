import { chatgptExtractor } from '../lib/extractors/chatgpt';
import { detectSensitive } from '../lib/sensitive';

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'EXTRACT_CONVERSATION') {
        chatgptExtractor.extract(document, location.href).then((conversation) => {
          sendResponse({ type: 'EXTRACTION_RESULT', conversation, sensitive: detectSensitive(conversation.content.messages) });
        }).catch((err) => {
          sendResponse({ type: 'EXTRACTION_ERROR', error: String(err) });
        });
        return true;
      }
      if (msg.type === 'GET_SELECTION') {
        const text = window.getSelection()?.toString() ?? '';
        sendResponse({ type: 'SELECTION_CONTENT', text, url: location.href, title: document.title });
      }
    });
  },
});
