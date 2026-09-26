import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_VERSION = '0.1.7';
const GITHUB_RELEASE_BASE = `https://github.com/plurivexapp/plurivex-app/releases/download/v${DEFAULT_VERSION}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/downloads': {
        target: GITHUB_RELEASE_BASE,
        changeOrigin: true,
        rewrite: (path) => {
          if (path.includes('setup.exe')) return `/Plurivex_${DEFAULT_VERSION}_x64-setup.exe`;
          if (path.includes('.msi')) return `/Plurivex_${DEFAULT_VERSION}_x64_en-US.msi`;
          return path;
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
