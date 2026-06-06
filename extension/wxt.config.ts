import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'AI Memory Capture',
    version: '0.1.0',
    description: 'Save AI conversations to your local memory — fully private.',
    permissions: [
      'storage',
      'activeTab',
      'scripting',
      'contextMenus',
      'alarms',
      'unlimitedStorage',
      'downloads',
      'offscreen',
    ],
    host_permissions: ['https://chatgpt.com/*', 'https://chat.deepseek.com/*', 'http://localhost/*'],
    action: { default_popup: 'popup.html', default_title: 'Save to AI Memory' },
    options_page: 'options.html',
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
  vite: () => ({
    optimizeDeps: { exclude: ['wa-sqlite'] },
  }),
});
