import { copyFileSync } from 'node:fs';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) =>
  mode === 'content'
    ? {
        build: {
          emptyOutDir: false,
          lib: {
            entry: 'src/content/index.ts',
            formats: ['iife'],
            name: 'LeetVisual',
            fileName: () => 'content.js',
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
