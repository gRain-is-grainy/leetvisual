import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'leetcode.html'), 'utf8');

export function loadFixture(doc: Document = document): void {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  doc.documentElement.className = parsed.documentElement.className;
  doc.head.innerHTML = '';
  doc.body.innerHTML = parsed.body.innerHTML;
}
