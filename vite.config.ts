import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import manifest from './public/manifest.json' with { type: 'json' }

export default defineConfig({
  plugins: [
    vue(),
    crx({ manifest }),
  ],
  server: {
    // Vite 5.4+ blocks cross-origin requests by default, which stops the extension
    // from loading its dev-mode scripts from localhost. Allow extension origins.
    cors: { origin: [/chrome-extension:\/\/.+/] },
  },
  build: {
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        options: 'src/options/index.html',
      },
    },
  },
})
