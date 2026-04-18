import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { copyFileSync, mkdirSync } from 'node:fs'

// @lottiefiles/dotlottie-web has a strict exports map that blocks `?url` deep imports in Vite 7.
// This plugin copies the WASM to public/wasm/ so it's served at /wasm/dotlottie-player.wasm
// in both dev and prod — no CDN dependency, no exports map bypass needed.
const dotLottieWasmPlugin: Plugin = {
  name: 'dotlottie-wasm-copy',
  enforce: 'pre',
  buildStart() {
    const src = path.resolve(__dirname, 'node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm');
    const dest = path.resolve(__dirname, 'public/wasm/dotlottie-player.wasm');
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), dotLottieWasmPlugin],
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    include: ['@rive-app/canvas'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
