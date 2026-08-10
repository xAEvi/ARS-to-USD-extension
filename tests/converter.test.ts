import { describe, expect, it } from 'vitest';
import { convertToUsd } from '../src/core/converter';
import type { ExchangeRate } from '../src/core/types';

function rate(value: number): ExchangeRate {
  return {
    value,
    side: 'venta',
    provider: 'dolarapi',
    fetchedAt: Date.now(),
    isStale: false,
  };
}

describe('convertToUsd', () => {
  it('divides the ARS amount by the rate value', () => {
    expect(convertToUsd(15000, rate(1200))).toBeCloseTo(12.5);
  });

  it('handles a manual rate the same way', () => {
    expect(convertToUsd(1000, rate(1000))).toBeCloseTo(1);
  });

  it('returns zero for a zero amount', () => {
    expect(convertToUsd(0, rate(1200))).toBe(0);
  });
});
