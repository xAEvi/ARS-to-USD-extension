import { describe, expect, it } from 'vitest';
import { detect, meetsMinConfidence } from '../src/core/detector';
import { DETECTION_CORPUS } from './fixtures/detection-corpus';

describe('detect', () => {
  it.each(DETECTION_CORPUS)('$description', ({ text, context, expected }) => {
    const results = detect(text, context);

    expect(
      results.map(({ rawText, valueArs, confidence }) => ({
        rawText,
        valueArs,
        confidence,
      })),
    ).toEqual(expected);
  });
});

describe('meetsMinConfidence', () => {
  it.each([
    ['high', 'low', true],
    ['high', 'medium', true],
    ['high', 'high', true],
    ['medium', 'high', false],
    ['medium', 'medium', true],
    ['low', 'medium', false],
    ['low', 'low', true],
  ] as const)(
    '%s meets minimum %s -> %s',
    (confidence, minConfidence, expected) => {
      expect(meetsMinConfidence(confidence, minConfidence)).toBe(expected);
    },
  );
});
