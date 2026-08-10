import { describe, expect, it } from 'vitest';
import {
  buildRuleId,
  matches,
  normalizeHostname,
  type SuppressionRule,
} from '../src/core/suppression';

function rule(overrides: Partial<SuppressionRule> = {}): SuppressionRule {
  return {
    id: 'example.com:location:.price',
    hostname: 'example.com',
    scope: 'location',
    signature: '.product-card > .price',
    reason: 'not-a-price',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('matches', () => {
  it('matches a token rule by exact literal text, anywhere in the host', () => {
    const tokenRule = rule({
      scope: 'token',
      token: 'SKU-1500',
      signature: undefined,
    });

    expect(
      matches(tokenRule, {
        token: 'SKU-1500',
        signature: '.anything',
        signatureGroup: '.anything',
      }),
    ).toBe(true);

    expect(
      matches(tokenRule, {
        token: 'SKU-1600',
        signature: '.anything',
        signatureGroup: '.anything',
      }),
    ).toBe(false);
  });

  it('matches a location rule only against the exact positional signature', () => {
    const locationRule = rule({
      scope: 'location',
      signature: '.product-card:nth-child(2) > .price',
    });

    expect(
      matches(locationRule, {
        token: '$1.500',
        signature: '.product-card:nth-child(2) > .price',
        signatureGroup: '.product-card > .price',
      }),
    ).toBe(true);

    expect(
      matches(locationRule, {
        token: '$1.500',
        signature: '.product-card:nth-child(3) > .price',
        signatureGroup: '.product-card > .price',
      }),
    ).toBe(false);
  });

  it('matches a location-group rule against every row sharing the same generalized signature', () => {
    const groupRule = rule({
      scope: 'location-group',
      signature: '.product-card > .price',
    });

    const rowTwo = {
      token: '$1.500',
      signature: '.product-card:nth-child(2) > .price',
      signatureGroup: '.product-card > .price',
    };
    const rowFive = {
      token: '$2.300',
      signature: '.product-card:nth-child(5) > .price',
      signatureGroup: '.product-card > .price',
    };
    const otherContainer = {
      token: '$999',
      signature: '.sidebar:nth-child(1) > .promo',
      signatureGroup: '.sidebar > .promo',
    };

    expect(matches(groupRule, rowTwo)).toBe(true);
    expect(matches(groupRule, rowFive)).toBe(true);
    expect(matches(groupRule, otherContainer)).toBe(false);
  });
});

describe('normalizeHostname', () => {
  it.each([
    ['www.example.com', 'example.com'],
    ['WWW.example.com', 'example.com'],
    ['example.com', 'example.com'],
    ['shop.example.com', 'shop.example.com'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });
});

describe('buildRuleId', () => {
  it('is deterministic for the same inputs', () => {
    expect(buildRuleId('example.com', 'location', '.price')).toBe(
      buildRuleId('example.com', 'location', '.price'),
    );
  });

  it('differs when the scope or matcher differs', () => {
    const base = buildRuleId('example.com', 'location', '.price');
    expect(buildRuleId('example.com', 'location-group', '.price')).not.toBe(
      base,
    );
    expect(buildRuleId('example.com', 'location', '.other')).not.toBe(base);
  });
});
