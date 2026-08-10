import { describe, expect, it } from 'vitest';
import { NUMBER_PATTERN } from '../src/core/patterns';

function matchAll(text: string): Array<string> {
  NUMBER_PATTERN.lastIndex = 0;
  const matches: Array<string> = [];
  let match: RegExpExecArray | null;
  while ((match = NUMBER_PATTERN.exec(text))) matches.push(match[0]);
  return matches;
}

describe('NUMBER_PATTERN', () => {
  it('matches an es-AR formatted number', () => {
    expect(matchAll('148.404')).toEqual(['148.404']);
  });

  it('matches an en-US formatted number', () => {
    expect(matchAll('1,234.56')).toEqual(['1,234.56']);
  });

  it('matches a plain number without separators', () => {
    expect(matchAll('500')).toEqual(['500']);
  });

  it('matches every number in text with more than one', () => {
    expect(matchAll('3 cuotas de $200')).toEqual(['3', '200']);
  });

  it('does not match text without digits', () => {
    expect(matchAll('sin precio')).toEqual([]);
  });
});
