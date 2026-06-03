export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  main() { console.log('AI Memory content script active'); },
});
