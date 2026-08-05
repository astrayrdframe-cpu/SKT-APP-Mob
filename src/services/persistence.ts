import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Generic helpers for persisting data locally so the app has something
 * to show even when there's no network connection.
 */

export async function saveToCache<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to cache "${key}":`, error);
  }
}

export async function loadFromCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.warn(`Failed to read cache "${key}":`, error);
    return null;
  }
}

export const CACHE_KEYS = {
  NAV_STATE: 'nav-state',
  FILTER_DATA: 'skt-filter-data',
  SKT_LIST: 'skt-header-list-v2', // bumped: v1 shape is incompatible with current SKTHeaderItem
} as const;

// Each SKT detail record is cached individually, keyed by its id, so a
// user can open one record offline without needing the whole list cached.
// "v2" because the cached shape changed from a flat SKTDetail to
// { detail, workers } — bumping avoids reading stale-shape data from
// earlier builds.
export const sktDetailCacheKey = (id: string | number) => `skt-detail-v2-${id}`;

export const setoranSummaryCacheKey = (id: string | number) => `setoran-summary-${id}`;
