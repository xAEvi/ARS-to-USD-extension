import { beforeEach, describe, expect, it } from 'vitest';
import { getConfiguration, setConfiguration } from '../src/config/store';
import { DEFAULT_CONFIGURATION } from '../src/config/defaults';
import { resetFakeChromeStorage } from './setup/chrome-storage';

beforeEach(() => {
  resetFakeChromeStorage();
});

describe('getConfiguration', () => {
  it('returns the defaults when nothing has been saved', async () => {
    expect(await getConfiguration()).toEqual(DEFAULT_CONFIGURATION);
  });
});

describe('setConfiguration', () => {
  it('persists a patch merged over the defaults', async () => {
    const result = await setConfiguration({
      rateSource: 'manual',
      manualRate: 1200,
    });

    expect(result).toEqual({
      ...DEFAULT_CONFIGURATION,
      rateSource: 'manual',
      manualRate: 1200,
    });
    expect(await getConfiguration()).toEqual(result);
  });

  it('merges successive patches instead of overwriting the whole configuration', async () => {
    await setConfiguration({ rateSource: 'manual', manualRate: 1200 });
    const result = await setConfiguration({ rateSide: 'compra' });

    expect(result).toEqual({
      ...DEFAULT_CONFIGURATION,
      rateSource: 'manual',
      manualRate: 1200,
      rateSide: 'compra',
    });
  });
});
