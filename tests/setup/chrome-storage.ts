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
const sessionData: StorageData = {};

/** Records of `chrome.action.setBadgeText`/`setBadgeBackgroundColor` calls, for assertions. */
export const fakeBadgeCalls: Array<{
  tabId: number;
  text?: string;
  color?: string;
}> = [];

(globalThis as { chrome?: unknown }).chrome = {
  storage: {
    local: createFakeStorageArea(localData),
    sync: createFakeStorageArea(syncData),
    session: createFakeStorageArea(sessionData),
  },
  action: {
    setBadgeText: async ({ tabId, text }: { tabId: number; text: string }) => {
      fakeBadgeCalls.push({ tabId, text });
    },
    setBadgeBackgroundColor: async ({
      tabId,
      color,
    }: {
      tabId: number;
      color: string;
    }) => {
      fakeBadgeCalls.push({ tabId, color });
    },
  },
  tabs: {
    onRemoved: { addListener: () => {} },
    onUpdated: { addListener: () => {} },
  },
};

/** Clears the in-memory fake `chrome.storage`. Call between tests that touch storage. */
export function resetFakeChromeStorage(): void {
  for (const key of Object.keys(localData)) delete localData[key];
  for (const key of Object.keys(syncData)) delete syncData[key];
  for (const key of Object.keys(sessionData)) delete sessionData[key];
  fakeBadgeCalls.length = 0;
}
