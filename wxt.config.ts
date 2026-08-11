import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'ARS to USD',
    permissions: ['storage'],
    host_permissions: [
      'https://dolarapi.com/*',
      'https://api.bluelytics.com.ar/*',
    ],
  },
});
