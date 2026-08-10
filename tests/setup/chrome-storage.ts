type StorageData = Record<string, unknown>;

function createFakeStorageArea(data: StorageData) {
  return {
    get: async (keys?: string | Array<string> | null) => {
      if (keys === undefined || keys === null) return { ...data };

      const requested = Array.isArray(keys) ? keys : [keys];
      const result: StorageData = {};
      for (const key of requested) if (key in data) result[key] = data[key];
      return result;
    },
    set: async (items: StorageData) => {
      Object.assign(data, items);
    },
    remove: async (keys: string | Array<string>) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
    clear: async () => {
      for (const key of Object.keys(data)) delete data[key];
    },
  };
}

const localData: StorageData = {};
const syncData: StorageData = {};

(globalThis as { chrome?: unknown }).chrome = {
  storage: {
    local: createFakeStorageArea(localData),
    sync: createFakeStorageArea(syncData),
  },
};

/** Clears the in-memory fake `chrome.storage`. Call between tests that touch storage. */
export function resetFakeChromeStorage(): void {
  for (const key of Object.keys(localData)) delete localData[key];
  for (const key of Object.keys(syncData)) delete syncData[key];
}
