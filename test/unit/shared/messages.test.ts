import { describe, expect, it } from 'vitest';
import { isMeta, isToContent, isToPanel } from '../../../src/shared/messages';

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
});

describe('isToContent', () => {
  it('accepts only ready', () => {
    expect(isToContent({ type: 'ready' })).toBe(true);
    expect(isToContent({ type: 'context' })).toBe(false);
    expect(isToContent(null)).toBe(false);
  });
});
