export function idNum(id: string): number {
  const m = /\d+$/.exec(id);
  return m ? Number(m[0]) : 0;
}

export function byId(a: string, b: string): number {
  return idNum(a) - idNum(b);
}

export function nextId(prefix: 's' | 'n', taken: Iterable<string>): string {
  let max = 0;
  for (const id of taken) max = Math.max(max, idNum(id));
  return prefix + (max + 1);
}
