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
              copyFileSync('THIRD_PARTY_NOTICES.txt', 'dist/THIRD_PARTY_NOTICES.txt');
            },
          },
        ],
        build: { rollupOptions: { input: 'panel.html' } },
        // A fixed name for the worker bundle, so the end-to-end tests can start it from an extension page.
        worker: { format: 'es', rollupOptions: { output: { entryFileNames: 'assets/[name].js' } } },
        test: { include: ['test/unit/**/*.test.{ts,tsx}'], environment: 'node' },
      },
);
