import { beforeEach, describe, expect, it } from 'vitest';
import {
  addRule,
  clearRules,
  getRules,
  removeRule,
  touchRules,
} from '../src/background/suppression-store';
import type { SuppressionRule } from '../src/core/suppression';
import { resetFakeChromeStorage } from './setup/chrome-storage';

function rule(overrides: Partial<SuppressionRule> = {}): SuppressionRule {
  return {
    id: 'example.com:location:.price',
    hostname: 'example.com',
    scope: 'location',
    signature: '.price',
    reason: 'not-a-price',
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
    await addRule(rule(), 200);
    expect(await getRules('example.com')).toEqual([rule()]);
  });

  it('does not leak rules across hostnames', async () => {
    await addRule(rule({ hostname: 'example.com' }), 200);
    await addRule(
      rule({ id: 'other.com:location:.price', hostname: 'other.com' }),
      200,
    );

    expect(await getRules('example.com')).toHaveLength(1);
    expect(await getRules('other.com')).toHaveLength(1);
  });

  it('upserts a rule with the same id instead of duplicating it', async () => {
    await addRule(rule({ reason: 'not-a-price' }), 200);
    await addRule(rule({ reason: 'not-ars' }), 200);

    const rules = await getRules('example.com');
    expect(rules).toHaveLength(1);
    expect(rules[0]!.reason).toBe('not-ars');
  });

  it('prunes the least recently matched rule once the cap is exceeded', async () => {
    const oldest = rule({
      id: 'a',
      signature: '.a',
      createdAt: 1,
      lastMatchedAt: 1,
    });
    const middle = rule({
      id: 'b',
      signature: '.b',
      createdAt: 2,
      lastMatchedAt: 2,
    });
    const newest = rule({
      id: 'c',
      signature: '.c',
      createdAt: 3,
      lastMatchedAt: 3,
    });

    await addRule(oldest, 2);
    await addRule(middle, 2);
    await addRule(newest, 2);

    const rules = await getRules('example.com');
    expect(rules.map((r) => r.id).sort()).toEqual(['b', 'c']);
  });

  it('falls back to createdAt for pruning order when lastMatchedAt is absent', async () => {
    const older = rule({ id: 'a', signature: '.a', createdAt: 1 });
    const newer = rule({ id: 'b', signature: '.b', createdAt: 2 });
    const newest = rule({ id: 'c', signature: '.c', createdAt: 3 });

    await addRule(older, 2);
    await addRule(newer, 2);
    await addRule(newest, 2);

    const rules = await getRules('example.com');
    expect(rules.map((r) => r.id).sort()).toEqual(['b', 'c']);
  });
});

describe('removeRule', () => {
  it('removes only the targeted rule', async () => {
    await addRule(rule({ id: 'a', signature: '.a' }), 200);
    await addRule(rule({ id: 'b', signature: '.b' }), 200);

    await removeRule('example.com', 'a');

    const rules = await getRules('example.com');
    expect(rules.map((r) => r.id)).toEqual(['b']);
  });
});

describe('clearRules', () => {
  it('removes every rule for the host', async () => {
    await addRule(rule({ id: 'a', signature: '.a' }), 200);
    await addRule(rule({ id: 'b', signature: '.b' }), 200);

    await clearRules('example.com');

    expect(await getRules('example.com')).toEqual([]);
  });
});

describe('touchRules', () => {
  it('sets lastMatchedAt only on the matched rules', async () => {
    await addRule(rule({ id: 'a', signature: '.a' }), 200);
    await addRule(rule({ id: 'b', signature: '.b' }), 200);

    await touchRules('example.com', ['a']);

    const rules = await getRules('example.com');
    const a = rules.find((r) => r.id === 'a');
    const b = rules.find((r) => r.id === 'b');
    expect(a?.lastMatchedAt).toBeDefined();
    expect(b?.lastMatchedAt).toBeUndefined();
  });

  it('does nothing for ids that are not present', async () => {
    await addRule(rule({ id: 'a', signature: '.a' }), 200);

    await touchRules('example.com', ['unknown']);

    const rules = await getRules('example.com');
    expect(rules[0]?.lastMatchedAt).toBeUndefined();
  });

  it('is a no-op for an empty list of ids', async () => {
    await addRule(rule({ id: 'a', signature: '.a' }), 200);

    await touchRules('example.com', []);

    const rules = await getRules('example.com');
    expect(rules[0]?.lastMatchedAt).toBeUndefined();
  });
});
