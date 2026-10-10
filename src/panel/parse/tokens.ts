export type Lit = string | Lit[];

export class ParseError extends Error {}

const BARE = /[^\s,[\]"]+/y;

export function parseLiteral(text: string): Lit {
  const src = text.replace(/\r/g, '');
  let i = 0;
  const skip = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const fail = (what: string): never => {
    throw new ParseError(`${what} at ${i}`);
  };
  const value = (): Lit => {
    skip();
    if (i >= src.length) fail('Unexpected end of input');
    if (src[i] === '[') {
      i++;
      const items: Lit[] = [];
      skip();
      if (src[i] === ']') {
        i++;
        return items;
      }
      for (;;) {
        items.push(value());
        skip();
        if (src[i] === ']') {
          i++;
          return items;
        }
        if (src[i] !== ',') fail('Expected , or ]');
        i++;
      }
    }
    if (src[i] === '"') {
      const start = i++;
      while (i < src.length && src[i] !== '"') i += src[i] === '\\' ? 2 : 1;
      if (i >= src.length) fail('Unterminated string');
      i++;
      return src.slice(start, i);
    }
    BARE.lastIndex = i;
    const m = BARE.exec(src);
    if (!m) return fail(`Unexpected ${src[i]}`);
    i += m[0].length;
    return m[0];
  };
  const out = value();
  skip();
  if (i < src.length) fail(`Unexpected ${src[i]}`);
  return out;
}

export function isStr(tok: string): boolean {
  return tok.length >= 2 && tok.startsWith('"') && tok.endsWith('"');
}

export function splitChars(tok: string): string[] {
  let text: string;
  try {
    text = JSON.parse(tok);
  } catch {
    text = tok.slice(1, -1);
  }
  return [...text].map((ch) => JSON.stringify(ch));
}
