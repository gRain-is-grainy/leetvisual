import { describe, expect, it } from 'vitest';
import { isStr, ParseError, parseLiteral, splitChars } from '../../../src/panel/parse/tokens';

describe('parseLiteral', () => {
  it('keeps scalars as written', () => {
    expect(parseLiteral('7')).toBe('7');
    expect(parseLiteral('-3')).toBe('-3');
    expect(parseLiteral('3.5')).toBe('3.5');
    expect(parseLiteral('null')).toBe('null');
    expect(parseLiteral('true')).toBe('true');
  });

  it('keeps 64-bit integers exact', () => {
    expect(parseLiteral('[9223372036854775807,-9223372036854775808,1000000000000000000]')).toEqual([
      '9223372036854775807',
      '-9223372036854775808',
      '1000000000000000000',
    ]);
  });

  it('keeps strings with their quotes, escapes and unicode', () => {
    expect(parseLiteral('"a\\"b"')).toBe('"a\\"b"');
    expect(parseLiteral('"héllo 日本 😀"')).toBe('"héllo 日本 😀"');
    expect(parseLiteral('["a,b","]"]')).toEqual(['"a,b"', '"]"']);
  });

  it('parses empty, nested and ragged arrays', () => {
    expect(parseLiteral('[]')).toEqual([]);
    expect(parseLiteral('[[]]')).toEqual([[]]);
    expect(parseLiteral('[[1,2],[3],[]]')).toEqual([['1', '2'], ['3'], []]);
    expect(parseLiteral('[[1,[2,[3]]],null]')).toEqual([['1', ['2', ['3']]], 'null']);
  });

  it('strips \\r and ignores stray whitespace', () => {
    expect(parseLiteral('[1,\r\n2]')).toEqual(['1', '2']);
    expect(parseLiteral('  [ 1 ,\t 2 ]  \n')).toEqual(['1', '2']);
    expect(parseLiteral('"a\rb"')).toBe('"ab"');
  });

  it.each(['', '   ', '[1,2', '[1,,2]', '[1 2]', '[1,2,]', '[,]', ']', '"abc', '"abc\\', '1 2', '[1]]'])(
    'throws ParseError on %j',
    (text) => {
      expect(() => parseLiteral(text)).toThrow(ParseError);
    },
  );
});

describe('isStr', () => {
  it('recognises quoted string tokens only', () => {
    expect(isStr('"a"')).toBe(true);
    expect(isStr('""')).toBe(true);
    expect(isStr('a')).toBe(false);
    expect(isStr('"')).toBe(false);
    expect(isStr('7')).toBe(false);
  });
});

describe('splitChars', () => {
  it('splits a string token into one literal per character', () => {
    expect(splitChars('"abc"')).toEqual(['"a"', '"b"', '"c"']);
    expect(splitChars('""')).toEqual([]);
  });

  it('decodes escapes and re-encodes each character', () => {
    expect(splitChars('"a\\"b"')).toEqual(['"a"', '"\\""', '"b"']);
    expect(splitChars('"\\\\n"')).toEqual(['"\\\\"', '"n"']);
    expect(splitChars('"\\u0041"')).toEqual(['"A"']);
  });

  it('keeps astral code points whole', () => {
    expect(splitChars('"😀x日"')).toEqual(['"😀"', '"x"', '"日"']);
  });
});
