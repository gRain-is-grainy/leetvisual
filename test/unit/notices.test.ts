import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const notices = readFileSync('THIRD_PARTY_NOTICES.txt', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

describe('THIRD_PARTY_NOTICES.txt', () => {
  it('carries the MPL-2.0 text and the source of the Pyodide version that ships', () => {
    expect(pkg.dependencies.pyodide).toBe('314.0.7');
    expect(notices).toContain('Pyodide 314.0.7');
    expect(notices).toContain('https://github.com/pyodide/pyodide/tree/314.0.7');
    expect(notices).toContain('Mozilla Public License Version 2.0');
    expect(notices).toContain('Exhibit B - "Incompatible With Secondary Licenses" Notice');
  });

  it('carries the CPython and sortedcontainers licenses', () => {
    expect(notices).toContain('PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2');
    expect(notices).toContain('Copyright 2014-2019 Grant Jenks');
    expect(notices).toContain('Version 2.0, January 2004');
    expect(notices).toContain('END OF TERMS AND CONDITIONS');
  });

  it('is a tracked doc', () => {
    expect(readFileSync('AGENTS.md', 'utf8')).toContain('`THIRD_PARTY_NOTICES.txt`');
  });
});
