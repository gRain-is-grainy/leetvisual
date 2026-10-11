import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

describe('manifest.json', () => {
  it('is an MV3 extension named LeetVisual', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('LeetVisual');
    expect(manifest.description).toContain('Not affiliated with LeetCode');
  });

  it('asks only for storage', () => {
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.host_permissions).toBeUndefined();
  });

  it('runs the content script, and the page script in the MAIN world, on leetcode.com at document_idle', () => {
    expect(manifest.content_scripts).toEqual([
      { matches: ['https://leetcode.com/*'], js: ['content.js'], run_at: 'document_idle' },
      { matches: ['https://leetcode.com/*'], js: ['page.js'], run_at: 'document_idle', world: 'MAIN' },
    ]);
  });

  it('exposes only the panel and its assets to leetcode.com', () => {
    expect(manifest.web_accessible_resources).toEqual([
      { resources: ['panel.html', 'assets/*'], matches: ['https://leetcode.com/*'] },
    ]);
  });

  it('allows WebAssembly in extension pages but never eval', () => {
    expect(manifest.content_security_policy).toEqual({
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    });
    expect(manifest.content_security_policy.extension_pages).not.toMatch(/(?<!wasm-)'unsafe-eval'/);
  });

  it('serves extension pages with COEP require-corp', () => {
    expect(manifest.cross_origin_embedder_policy).toEqual({ value: 'require-corp' });
  });
});
