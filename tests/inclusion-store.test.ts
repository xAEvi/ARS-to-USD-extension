import { beforeEach, describe, expect, it } from 'vitest';
import {
  addRule,
  getRules,
  touchRules,
} from '../src/background/inclusion-store';
import type { InclusionRule } from '../src/core/inclusion';
import { resetFakeChromeStorage } from './setup/chrome-storage';

function rule(overrides: Partial<InclusionRule> = {}): InclusionRule {
  return {
    id: 'example.com:.price',
    hostname: 'example.com',
    signatureGroup: '.price',
    createdAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  resetFakeChromeStorage();
});

describe('getRules', () => {
  it('returns an empty array when nothing was saved', async () => {
    expect(await getRules('example.com')).toEqual([]);
  });
});

describe('addRule', () => {
  it('persists a rule under its hostname', async () => {
    const persisted = rule();
    await addRule(persisted, 200);
    expect(await getRules('example.com')).toEqual([persisted]);
  });

  it('does not leak rules across hostnames', async () => {
    await addRule(rule({ hostname: 'example.com' }), 200);
    await addRule(
      rule({ id: 'other.com:.price', hostname: 'other.com' }),
      200,
    );

    expect(await getRules('example.com')).toHaveLength(1);
    expect(await getRules('other.com')).toHaveLength(1);
  });

  it('upserts a rule with the same id instead of duplicating it', async () => {
    await addRule(rule({ createdAt: 1 }), 200);
    await addRule(rule({ createdAt: 2 }), 200);

    const rules = await getRules('example.com');
    expect(rules).toHaveLength(1);
    expect(rules[0]!.createdAt).toBe(2);
  });

  it('prunes the least recently matched rule once the cap is exceeded', async () => {
    const oldest = rule({
      id: 'a',
      signatureGroup: '.a',
      createdAt: 1,
      lastMatchedAt: 1,
    });
    const middle = rule({
      id: 'b',
      signatureGroup: '.b',
      createdAt: 2,
      lastMatchedAt: 2,
    });
    const newest = rule({
      id: 'c',
      signatureGroup: '.c',
      createdAt: 3,
      lastMatchedAt: 3,
    });

    await addRule(oldest, 2);
    await addRule(middle, 2);
    await addRule(newest, 2);

    const rules = await getRules('example.com');
    expect(rules.map((r) => r.id).sort()).toEqual(['b', 'c']);
  });
});

describe('touchRules', () => {
  it('sets lastMatchedAt only on the matched rules', async () => {
    await addRule(rule({ id: 'a', signatureGroup: '.a' }), 200);
    await addRule(rule({ id: 'b', signatureGroup: '.b' }), 200);

    await touchRules('example.com', ['a']);

    const rules = await getRules('example.com');
    const a = rules.find((r) => r.id === 'a');
    const b = rules.find((r) => r.id === 'b');
    expect(a?.lastMatchedAt).toBeDefined();
    expect(b?.lastMatchedAt).toBeUndefined();
  });

  it('is a no-op for an empty list of ids', async () => {
    await addRule(rule({ id: 'a', signatureGroup: '.a' }), 200);

    await touchRules('example.com', []);

    const rules = await getRules('example.com');
    expect(rules[0]?.lastMatchedAt).toBeUndefined();
  });
});
