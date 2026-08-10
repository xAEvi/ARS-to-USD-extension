import { describe, expect, it } from 'vitest';
import { formatUsd } from '../src/core/formatter';

describe('formatUsd', () => {
  it('formats a typical amount with es-AR separators and a USD prefix', () => {
    expect(formatUsd(12.5)).toBe('USD 12,50');
  });

  it('formats a whole amount with two decimal places', () => {
    expect(formatUsd(100)).toBe('USD 100,00');
  });

  it('formats amounts with thousands separators', () => {
    expect(formatUsd(1234.5)).toBe('USD 1.234,50');
  });

  it('floors anything under a cent to the minimum message', () => {
    expect(formatUsd(0.005)).toBe('< USD 0,01');
  });

  it('floors zero to the minimum message', () => {
    expect(formatUsd(0)).toBe('< USD 0,01');
  });
});
