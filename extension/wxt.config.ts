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
      'unlimitedStorage',
      'downloads',
    ],
    host_permissions: ['https://chatgpt.com/*'],
    action: { default_popup: 'popup.html', default_title: 'Save to AI Memory' },
    options_page: 'options.html',
  },
  vite: () => ({
    optimizeDeps: { exclude: ['wa-sqlite'] },
  }),
});
