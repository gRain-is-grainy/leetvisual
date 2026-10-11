import { copyFileSync } from 'node:fs';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) =>
  // The content script (isolated world) and the page script (MAIN world) each build to one IIFE.
  mode === 'content' || mode === 'page'
    ? {
        build: {
          emptyOutDir: false,
          lib: {
            entry: `src/${mode}/index.ts`,
            formats: ['iife'],
            name: 'LeetVisual',
            fileName: () => `${mode}.js`,
          },
        },
      }
    : {
        plugins: [
          preact(),
          {
            name: 'copy-manifest',
            closeBundle() {
              copyFileSync('manifest.json', 'dist/manifest.json');
            },
          },
        ],
        build: { rollupOptions: { input: 'panel.html' } },
        test: { include: ['test/unit/**/*.test.{ts,tsx}'], environment: 'node' },
      },
);
