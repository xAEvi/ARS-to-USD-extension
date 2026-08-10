/** Which `chrome.storage` area to read from or write to. */
export type StorageArea = 'local' | 'sync';

/**
 * Reads a single typed value from `chrome.storage`.
 *
 * @param {string} key The storage key to read.
 * @param {StorageArea} [area] Which storage area to read from. Defaults to `local`.
 * @returns {Promise<T | undefined>} The stored value, or `undefined` if absent.
 */
export async function getStorageValue<T>(
  key: string,
  area: StorageArea = 'local',
): Promise<T | undefined> {
  const result = await chrome.storage[area].get(key);
  return result[key] as T | undefined;
}

/**
 * Writes a single typed value to `chrome.storage`.
 *
 * @param {string} key The storage key to write.
 * @param {T} value The value to store.
 * @param {StorageArea} [area] Which storage area to write to. Defaults to `local`.
 * @returns {Promise<void>} A promise that resolves when the value is persisted.
 */
export async function setStorageValue<T>(
  key: string,
  value: T,
  area: StorageArea = 'local',
): Promise<void> {
  await chrome.storage[area].set({ [key]: value });
}
