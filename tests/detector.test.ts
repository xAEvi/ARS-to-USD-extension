import { describe, expect, it } from 'vitest';
import { detect } from '../src/core/detector';
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
