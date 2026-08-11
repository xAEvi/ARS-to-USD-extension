import { describe, expect, it } from 'vitest';
import { normalizeHostname } from '../src/core/hostname';

describe('normalizeHostname', () => {
  it.each([
    ['example.com', 'example.com'],
    ['www.example.com', 'example.com'],
    ['WWW.Example.com', 'example.com'],
    ['sub.example.com', 'sub.example.com'],
    ['www.sub.example.com', 'sub.example.com'],
  ] as const)('normalizes %s to %s', (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });
});
