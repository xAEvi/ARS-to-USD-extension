import { getStorageValue, setStorageValue } from '../shared/storage';
import { DEFAULT_CONFIGURATION } from './defaults';
import type { ArsToUsdConfiguration } from './schema';

const CONFIGURATION_KEY = 'configuration';

/**
 * Reads the user's saved configuration from `chrome.storage.sync`, filling
 * in any missing field with its default. Returns the defaults untouched
 * when nothing has been saved yet.
 *
 * @returns {Promise<ArsToUsdConfiguration>} The resolved configuration.
 */
export async function getConfiguration(): Promise<ArsToUsdConfiguration> {
  const stored = await getStorageValue<Partial<ArsToUsdConfiguration>>(
    CONFIGURATION_KEY,
    'sync',
  );
  return { ...DEFAULT_CONFIGURATION, ...stored };
}

/**
 * Merges `patch` into the saved configuration and persists the result.
 *
 * @param {Partial<ArsToUsdConfiguration>} patch The fields to update.
 * @returns {Promise<ArsToUsdConfiguration>} The configuration after the update.
 */
export async function setConfiguration(
  patch: Partial<ArsToUsdConfiguration>,
): Promise<ArsToUsdConfiguration> {
  const current = await getConfiguration();
  const next = { ...current, ...patch };
  await setStorageValue(CONFIGURATION_KEY, next, 'sync');
  return next;
}
