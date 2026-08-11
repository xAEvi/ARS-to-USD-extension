import { beforeEach, describe, expect, it } from 'vitest';
import { isTabActive, setTabActive } from '../src/background/active-tabs';
import { fakeBadgeCalls, resetFakeChromeStorage } from './setup/chrome-storage';

beforeEach(() => {
  resetFakeChromeStorage();
});

describe('isTabActive', () => {
  it('is false for a tab that was never activated', async () => {
    expect(await isTabActive(1)).toBe(false);
  });
});

describe('setTabActive', () => {
  it('marks a tab active and sets the badge', async () => {
    await setTabActive(1, true);

    expect(await isTabActive(1)).toBe(true);
    expect(fakeBadgeCalls).toContainEqual({ tabId: 1, text: 'ON' });
  });

  it('marks a tab inactive and clears the badge', async () => {
    await setTabActive(1, true);
    await setTabActive(1, false);

    expect(await isTabActive(1)).toBe(false);
    expect(fakeBadgeCalls).toContainEqual({ tabId: 1, text: '' });
  });

  it('tracks multiple tabs independently', async () => {
    await setTabActive(1, true);
    await setTabActive(2, true);
    await setTabActive(1, false);

    expect(await isTabActive(1)).toBe(false);
    expect(await isTabActive(2)).toBe(true);
  });

  it('is idempotent when activating an already active tab', async () => {
    await setTabActive(1, true);
    await setTabActive(1, true);

    expect(await isTabActive(1)).toBe(true);
  });
});
