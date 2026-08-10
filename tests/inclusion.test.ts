import { describe, expect, it } from 'vitest';
import {
  buildInclusionRuleId,
  matchesInclusion,
  type InclusionRule,
} from '../src/core/inclusion';

function rule(overrides: Partial<InclusionRule> = {}): InclusionRule {
  return {
    id: 'example.com:.price',
    hostname: 'example.com',
    signatureGroup: '.price',
    createdAt: 1,
    ...overrides,
  };
}

describe('matchesInclusion', () => {
  it('matches a candidate with the same signatureGroup', () => {
    expect(
      matchesInclusion(rule(), { signatureGroup: '.price' }),
    ).toBe(true);
  });

  it('does not match a candidate with a different signatureGroup', () => {
    expect(
      matchesInclusion(rule(), { signatureGroup: '.other' }),
    ).toBe(false);
  });
});

describe('buildInclusionRuleId', () => {
  it('is deterministic for the same hostname and signature', () => {
    expect(buildInclusionRuleId('example.com', '.price')).toBe(
      buildInclusionRuleId('example.com', '.price'),
    );
  });

  it('differs for a different hostname or signature', () => {
    const base = buildInclusionRuleId('example.com', '.price');
    expect(buildInclusionRuleId('other.com', '.price')).not.toBe(base);
    expect(buildInclusionRuleId('example.com', '.other')).not.toBe(base);
  });
});
