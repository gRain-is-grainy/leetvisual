import { describe, expect, it } from 'vitest';
import { isFromPage, isMeta, isToContent, isToPage, isToPanel } from '../../../src/shared/messages';

const ctx = {
  type: 'context',
  slug: 'two-sum',
  metaData: { name: 'twoSum', params: [{ name: 'nums', type: 'integer[]' }, { name: 'target', type: 'integer' }] },
  inputs: ['[2,7,11,15]', '9'],
  theme: 'light',
};

describe('isMeta', () => {
  it('accepts function, design and empty metaData', () => {
    expect(isMeta(ctx.metaData)).toBe(true);
    expect(
      isMeta({
        classname: 'LRUCache',
        maxbytesperline: 200000,
        constructor: { params: [{ type: 'integer', name: 'capacity' }] },
        methods: [{ name: 'get', params: [{ type: 'integer', name: 'key' }], return: { type: 'integer' } }],
        systemdesign: true,
        params: [
          { name: 'inputs', type: 'integer[]' },
          { name: 'inputs', type: 'integer[]' },
        ],
        return: { type: 'list<String>', dealloc: true },
      }),
    ).toBe(true);
    expect(isMeta({})).toBe(true);
  });

  it('rejects wrong field types', () => {
    expect(isMeta(null)).toBe(false);
    expect(isMeta([])).toBe(false);
    expect(isMeta({ params: 'nums' })).toBe(false);
    expect(isMeta({ params: [{ name: 'nums' }] })).toBe(false);
    expect(isMeta({ params: [{ name: 1, type: 'integer' }] })).toBe(false);
    expect(isMeta({ classname: 7 })).toBe(false);
    expect(isMeta({ manual: 'yes' })).toBe(false);
  });
});

describe('isToPanel', () => {
  it('accepts context and theme messages', () => {
    expect(isToPanel(ctx)).toBe(true);
    expect(isToPanel({ ...ctx, metaData: null, inputs: [] })).toBe(true);
    expect(isToPanel({ type: 'theme', theme: 'dark' })).toBe(true);
  });

  it('accepts a slug message only with a non-empty string slug', () => {
    expect(isToPanel({ type: 'slug', slug: 'two-sum' })).toBe(true);
    expect(isToPanel({ type: 'slug', slug: '' })).toBe(false);
    expect(isToPanel({ type: 'slug' })).toBe(false);
    expect(isToPanel({ type: 'slug', slug: 5 })).toBe(false);
  });

  it('rejects malformed shapes', () => {
    expect(isToPanel(undefined)).toBe(false);
    expect(isToPanel('context')).toBe(false);
    expect(isToPanel({ type: 'ready' })).toBe(false);
    expect(isToPanel({ type: 'theme', theme: 'blue' })).toBe(false);
    expect(isToPanel({ ...ctx, slug: '' })).toBe(false);
    expect(isToPanel({ ...ctx, slug: undefined })).toBe(false);
    expect(isToPanel({ ...ctx, theme: 'sepia' })).toBe(false);
    expect(isToPanel({ ...ctx, inputs: '[1,2]' })).toBe(false);
    expect(isToPanel({ ...ctx, inputs: ['[1]', 2] })).toBe(false);
    expect(isToPanel({ ...ctx, metaData: undefined })).toBe(false);
    expect(isToPanel({ ...ctx, metaData: { params: [{ type: 'integer' }] } })).toBe(false);
  });

  it('accepts code replies and edit notices', () => {
    expect(isToPanel({ type: 'code', code: 'x = 1', lang: 'python3' })).toBe(true);
    expect(isToPanel({ type: 'code', code: '', lang: 'cpp' })).toBe(true);
    expect(isToPanel({ type: 'code', error: 'no-editor' })).toBe(true);
    expect(isToPanel({ type: 'codeChanged' })).toBe(true);
  });

  it('rejects malformed code replies and content-bound messages', () => {
    expect(isToPanel({ type: 'code' })).toBe(false);
    expect(isToPanel({ type: 'code', code: 'x = 1' })).toBe(false);
    expect(isToPanel({ type: 'code', code: 1, lang: 'python3' })).toBe(false);
    expect(isToPanel({ type: 'code', code: 'x', lang: null })).toBe(false);
    expect(isToPanel({ type: 'code', error: 'timeout' })).toBe(false);
    expect(isToPanel({ type: 'code', error: 'no-editor', code: 'x', lang: 'python3' })).toBe(false);
    expect(isToPanel({ type: 'line', line: 3 })).toBe(false);
    expect(isToPanel({ type: 'getCode' })).toBe(false);
  });
});

describe('isToContent', () => {
  it('accepts ready, getCode and line', () => {
    expect(isToContent({ type: 'ready' })).toBe(true);
    expect(isToContent({ type: 'getCode' })).toBe(true);
    expect(isToContent({ type: 'line', line: 1 })).toBe(true);
    expect(isToContent({ type: 'line', line: 12, err: true })).toBe(true);
    expect(isToContent({ type: 'line', line: null })).toBe(true);
  });

  it('rejects other messages and bad lines', () => {
    expect(isToContent({ type: 'context' })).toBe(false);
    expect(isToContent({ type: 'code', code: '', lang: 'python3' })).toBe(false);
    expect(isToContent(null)).toBe(false);
    expect(isToContent({ type: 'line' })).toBe(false);
    expect(isToContent({ type: 'line', line: 0 })).toBe(false);
    expect(isToContent({ type: 'line', line: -2 })).toBe(false);
    expect(isToContent({ type: 'line', line: 2.5 })).toBe(false);
    expect(isToContent({ type: 'line', line: Infinity })).toBe(false);
    expect(isToContent({ type: 'line', line: '3' })).toBe(false);
    expect(isToContent({ type: 'line', line: 3, err: false })).toBe(false);
    expect(isToContent({ type: 'line', line: 3, err: 'yes' })).toBe(false);
  });
});

describe('isToPage', () => {
  it('accepts tagged getCode and line requests', () => {
    expect(isToPage({ source: 'leetvisual', type: 'getCode', id: 1 })).toBe(true);
    expect(isToPage({ source: 'leetvisual', type: 'line', line: 4 })).toBe(true);
    expect(isToPage({ source: 'leetvisual', type: 'line', line: 4, err: true })).toBe(true);
    expect(isToPage({ source: 'leetvisual', type: 'line', line: null })).toBe(true);
  });

  it('rejects untagged, mistagged and malformed requests', () => {
    expect(isToPage({ type: 'getCode', id: 1 })).toBe(false);
    expect(isToPage({ source: 'leetvisual-page', type: 'getCode', id: 1 })).toBe(false);
    expect(isToPage({ source: 'leetvisual', type: 'getCode' })).toBe(false);
    expect(isToPage({ source: 'leetvisual', type: 'getCode', id: -1 })).toBe(false);
    expect(isToPage({ source: 'leetvisual', type: 'getCode', id: 1.5 })).toBe(false);
    expect(isToPage({ source: 'leetvisual', type: 'line', line: 0 })).toBe(false);
    expect(isToPage({ source: 'leetvisual', type: 'codeChanged' })).toBe(false);
    expect(isToPage('getCode')).toBe(false);
  });
});

describe('isFromPage', () => {
  it('accepts tagged code answers and edit notices', () => {
    expect(isFromPage({ source: 'leetvisual-page', type: 'code', id: 3, code: 'x', lang: 'python3' })).toBe(true);
    expect(isFromPage({ source: 'leetvisual-page', type: 'code', id: 3, error: 'no-editor' })).toBe(true);
    expect(isFromPage({ source: 'leetvisual-page', type: 'codeChanged' })).toBe(true);
  });

  it('rejects untagged, mistagged and malformed answers', () => {
    expect(isFromPage({ type: 'code', id: 3, code: 'x', lang: 'python3' })).toBe(false);
    expect(isFromPage({ source: 'leetvisual', type: 'code', id: 3, code: 'x', lang: 'python3' })).toBe(false);
    expect(isFromPage({ source: 'leetvisual-page', type: 'code', code: 'x', lang: 'python3' })).toBe(false);
    expect(isFromPage({ source: 'leetvisual-page', type: 'code', id: 3, code: 'x' })).toBe(false);
    expect(isFromPage({ source: 'leetvisual-page', type: 'code', id: 3, error: 'gone' })).toBe(false);
    expect(isFromPage({ source: 'leetvisual-page', type: 'line', line: 1 })).toBe(false);
    expect(isFromPage(null)).toBe(false);
  });
});
