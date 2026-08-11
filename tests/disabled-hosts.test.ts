import { beforeEach, describe, expect, it } from 'vitest';
import { isHostDisabled, setHostDisabled } from '../src/shared/disabled-hosts';
import { fakeBadgeCalls, resetFakeChromeStorage } from './setup/chrome-storage';

beforeEach(() => {
  resetFakeChromeStorage();
});

describe('isHostDisabled', () => {
  it('is false for a host that was never disabled: active is the default', async () => {
    expect(await isHostDisabled('example.com')).toBe(false);
  });
});

describe('setHostDisabled', () => {
  it('disables a host and sets the badge', async () => {
    await setHostDisabled('example.com', true, 1);

    expect(await isHostDisabled('example.com')).toBe(true);
    expect(fakeBadgeCalls).toContainEqual({ tabId: 1, text: 'OFF' });
  });

  it('re-enables a host and clears the badge', async () => {
    await setHostDisabled('example.com', true, 1);
    await setHostDisabled('example.com', false, 1);

    expect(await isHostDisabled('example.com')).toBe(false);
    expect(fakeBadgeCalls).toContainEqual({ tabId: 1, text: '' });
  });

  it('normalizes the www prefix so both forms share one entry', async () => {
    await setHostDisabled('www.example.com', true);

    expect(await isHostDisabled('example.com')).toBe(true);
    expect(await isHostDisabled('www.example.com')).toBe(true);
  });

  it('tracks multiple hosts independently', async () => {
    await setHostDisabled('a.com', true);
    await setHostDisabled('b.com', true);
    await setHostDisabled('a.com', false);

    expect(await isHostDisabled('a.com')).toBe(false);
    expect(await isHostDisabled('b.com')).toBe(true);
  });

  it('works without a tabId, for hosts updated outside an open tab', async () => {
    await expect(setHostDisabled('example.com', true)).resolves.toBeUndefined();
    expect(await isHostDisabled('example.com')).toBe(true);
  });
});
