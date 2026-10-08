import AsyncStorage from '@react-native-async-storage/async-storage';
import { dedupeById } from '../../utils/dedupe';
import { backfillSktLogPekerjaId } from '../../utils/mejaGrouping';
import type { SetoranWorker } from '../skt';

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

export async function removeFromCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove cache "${key}":`, error);
  }
}

export const CACHE_KEYS = {
  NAV_STATE: 'nav-state',
  FILTER_DATA: 'skt-filter-data',
  SKT_LIST: 'skt-header-list-v2', // bumped: v1 shape is incompatible with current SKTHeaderItem
  TEST_TEMP: 'skt-test-temp', // skt/test_temp rows, refreshed on Dashboard "Get Data"
  // skt_master_pekerja rows (active, non-training only — see
  // fetchMasterPekerja's default filters), refreshed on Dashboard "Get
  // Data" alongside TEST_TEMP above. AbsensiScanScreenCamera's badge-scan
  // lookup (findMasterPekerjaByNik in pekerjaApi.ts) reads this instead of
  // hitting ORDS live on every single scan.
  MASTER_PEKERJA: 'skt-master-pekerja',
} as const;

// Each SKT detail record is cached individually, keyed by its id, so a
// user can open one record offline without needing the whole list cached.
// "v2" because the cached shape changed from a flat SKTDetail to
// { detail, workers } — bumping avoids reading stale-shape data from
// earlier builds.
export const sktDetailCacheKey = (id: string | number) => `skt-detail-v2-${id}`;

export const setoranSummaryCacheKey = (id: string | number) => `setoran-summary-${id}`;

// Normalizes the whole local cache in place — run on Dashboard load and
// after every "Get Data". Drops:
//   - duplicate skt_master_pekerja rows (same id, or same NIK — NIK is
//     unique per person; nomor_absen is NOT, it repeats across Braks),
//   - duplicate SKT header / test_temp rows (same id),
//   - duplicate worker rows inside each cached header detail (same id),
//   - skt-detail-v2-* entries for a header that's no longer in the cached
//     header list (removed server-side), and every legacy
//     setoran-summary-* entry (no longer used).
// Same-name pekerja are left alone: they're different people with
// different NIKs. Same-seat worker rows are left alone too: each Tambah
// Setoran submission is its own row at the submitter's seat kode.
export async function cleanupCache(): Promise<void> {
  try {
    const writeIfChanged = async <T>(key: string, rows: T[] | null, deduped: T[]) => {
      if (rows && deduped.length !== rows.length) await saveToCache(key, deduped);
    };

    const pekerja = await loadFromCache<{ id: number; nik: string }[]>(CACHE_KEYS.MASTER_PEKERJA);
    if (pekerja) {
      await writeIfChanged(
        CACHE_KEYS.MASTER_PEKERJA,
        pekerja,
        dedupeById(
          dedupeById(pekerja, (p) => p.id),
          (p) => p.nik
        )
      );
    }

    const testTemp = await loadFromCache<{ id: number }[]>(CACHE_KEYS.TEST_TEMP);
    if (testTemp) await writeIfChanged(CACHE_KEYS.TEST_TEMP, testTemp, dedupeById(testTemp, (r) => r.id));

    const headers = await loadFromCache<{ id: number }[]>(CACHE_KEYS.SKT_LIST);
    if (!headers) return; // never synced — nothing to compare orphans against
    await writeIfChanged(CACHE_KEYS.SKT_LIST, headers, dedupeById(headers, (h) => h.id));
    const headerIds = new Set(headers.map((h) => String(h.id)));

    for (const key of await AsyncStorage.getAllKeys()) {
      const match = /^(skt-detail-v2|setoran-summary)-(.+)$/.exec(key);
      if (!match) continue;
      // setoran-summary-* is no longer written (Setoran Summary is built
      // from the skt-detail-v2-* workers instead), so every one is stale.
      if (match[1] === 'setoran-summary') {
        await removeFromCache(key);
        continue;
      }
      if (!headerIds.has(match[2])) {
        // Never drop a header holding posted setoran — those are locked
        // locally (see hasPostedSetoran in services/API/setoranPost.ts).
        const orphan = await loadFromCache<{ workers?: SetoranWorker[] }>(key);
        if (!orphan?.workers?.some((w) => !!w.postedAt)) await removeFromCache(key);
        continue;
      }
      if (match[1] === 'skt-detail-v2') {
        const cached = await loadFromCache<{ detail: unknown; workers: SetoranWorker[] }>(key);
        if (cached?.workers) {
          const deduped = dedupeById(cached.workers, (w) => w.id);
          // Rows cached before sktLogPekerjaId existed get it filled in here.
          const workers = backfillSktLogPekerjaId(deduped);
          if (workers !== deduped || deduped.length !== cached.workers.length) {
            await saveToCache(key, { ...cached, workers });
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to clean up cache:', error);
  }
}
