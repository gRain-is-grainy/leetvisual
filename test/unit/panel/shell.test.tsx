// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { Shell } from '../../../src/panel/Shell';
import { initState, openContext, session, viewing } from '../../../src/panel/state';
import { memoryKV } from '../../helpers/memory-kv';

beforeEach(() => {
  session.value = null;
  viewing.value = null;
  initState(memoryKV());
});

afterEach(cleanup);

it('lists the shown structures with their id and kind', async () => {
  await openContext({
    type: 'context',
    slug: 'two-sum',
    metaData: { name: 'twoSum', params: [{ name: 'nums', type: 'integer[]' }, { name: 'target', type: 'integer' }] },
    inputs: ['[2,7,11,15]', '9'],
    theme: 'light',
  });
  render(<Shell />);
  const items = [...screen.getByTestId('shell').querySelectorAll('li')];
  expect(items.map((li) => [li.textContent, li.getAttribute('data-kind')])).toEqual([
    ['nums', 'array'],
    ['target', 'var'],
  ]);
  expect(items.every((li) => li.getAttribute('data-card'))).toBe(true);
});
