import { buildDetailPekerja, MasterPekerja, ScannedBadge } from '../pekerja';
import { loadFromCache, saveToCache, CACHE_KEYS } from '../Offline/persistence';
import { dedupeById } from '../../utils/dedupe';
import { SKT_API_URL } from '../../config/api';

const SKT_MASTER_PEKERJA_ENDPOINT =
  `${SKT_API_URL}/skt_master_pekerja`;

interface RawOrdsResponse {
  items: Record<string, any>[];
  hasMore?: boolean;
}

// Same pagination pattern as sktApi.ts's fetchAllOrdsRows — ORDS caps each
// page, so a single request isn't guaranteed to return every row.
async function fetchAllOrdsRows(baseUrl: string): Promise<Record<string, any>[]> {
  const allRows: Record<string, any>[] = [];
  let offset = 0;
  const limit = 1000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const response = await fetch(`${baseUrl}${separator}limit=${limit}&offset=${offset}`);

    if (!response.ok) {
      throw new Error(`Request to ${baseUrl} failed with status ${response.status}`);
    }

    const data: RawOrdsResponse = await response.json();
    allRows.push(...(data.items ?? []));

    if (!data.hasMore) break;
    offset += limit;
  }

  return allRows;
}

interface RawPekerjaRow {
  id: number;
  nomor_absen: string;
  nik: string;
  nama_pekerja: string;
  active: number; // 0 | 1
  is_training: number; // 0 | 1
  skt_master_brak_id: number;
}

export interface FetchMasterPekerjaOptions {
  brakId?: number; // scope to one Brak (skt_master_brak_id)
  includeInactive?: boolean; // default: false — only active=1 rows
  includeTraining?: boolean; // default: false — only is_training=0 rows
}

/**
 * Full pekerja directory (skt_master_pekerja), used to populate the
 * "Pilih Pekerja" search combobox in TambahPekerjaModal. Filters out
 * inactive and training-only workers by default, and can be scoped to a
 * single Brak.
 */
export async function fetchMasterPekerja(
  options?: FetchMasterPekerjaOptions
): Promise<MasterPekerja[]> {
  // A Brak scope is filtered by ORDS itself (q=), so only that Brak's rows
  // are downloaded — the endpoint also returns each pekerja's `foto` blob,
  // which makes the full list several MB.
  const url =
    options?.brakId === undefined
      ? SKT_MASTER_PEKERJA_ENDPOINT
      : `${SKT_MASTER_PEKERJA_ENDPOINT}?q=${encodeURIComponent(
          JSON.stringify({ skt_master_brak_id: options.brakId })
        )}`;
  const rowsRaw = (await fetchAllOrdsRows(url)) as RawPekerjaRow[];
  // Dropped here, at the fetch boundary — see dedupeById's own comment in
  // utils/dedupe.ts for why (a dirty view/join, or a pagination overlap,
  // shouldn't surface downstream as a duplicate name in the "Pilih
  // Pekerja" combobox or CACHE_KEYS.MASTER_PEKERJA).
  const byId = dedupeById(rowsRaw, (r) => r.id);
  // Second pass, keyed on the same "nomor_absen - nama_pekerja - nik"
  // identity used everywhere else (buildDetailPekerja) rather than the raw
  // row id — catches the same PERSON showing up twice in
  // skt_master_pekerja under two different ids (e.g. re-entered rather
  // than corrected), which the id-only pass above can't see since the ids
  // genuinely differ. First occurrence wins, same "first wins" rule as
  // dedupeById.
  const rows = dedupeById(byId, (r) => buildDetailPekerja(r.nomor_absen, r.nama_pekerja, r.nik));

  return rows
    .filter((row) => options?.includeInactive || row.active === 1)
    .filter((row) => options?.includeTraining || row.is_training === 0)
    .filter((row) => options?.brakId === undefined || row.skt_master_brak_id === options.brakId)
    .map(
      (row): MasterPekerja => ({
        id: row.id,
        nomorAbsen: row.nomor_absen,
        nik: row.nik,
        namaPekerja: row.nama_pekerja,
        detailPekerja: buildDetailPekerja(row.nomor_absen, row.nama_pekerja, row.nik),
        active: row.active === 1,
        isTraining: row.is_training === 1,
        brakId: row.skt_master_brak_id,
      })
    )
    .sort((a, b) => a.namaPekerja.localeCompare(b.namaPekerja));
}

/**
 * Re-downloads one Brak's pekerja and swaps them into the shared
 * CACHE_KEYS.MASTER_PEKERJA list — that Brak's cached rows are replaced,
 * every other Brak's are kept (the cache is shared by every login on the
 * device). Deduped by NIK with the fresh rows winning. Returns the fresh
 * rows. Throws if the fetch fails, leaving the cache untouched.
 */
export async function refreshMasterPekerjaForBrak(brakId: number): Promise<MasterPekerja[]> {
  const fresh = await fetchMasterPekerja({ brakId });
  const cached = (await loadFromCache<MasterPekerja[]>(CACHE_KEYS.MASTER_PEKERJA)) ?? [];
  const merged = dedupeById(
    [...fresh, ...cached.filter((row) => row.brakId !== brakId)],
    (row) => row.nik
  ).sort((a, b) => a.namaPekerja.localeCompare(b.namaPekerja));
  await saveToCache(CACHE_KEYS.MASTER_PEKERJA, merged);
  return fresh;
}

const selectablePekerja = (rows: MasterPekerja[], brakId?: number) =>
  rows
    .filter((row) => row.active && !row.isTraining)
    .filter((row) => brakId === undefined || row.brakId === brakId)
    .sort((a, b) => a.namaPekerja.localeCompare(b.namaPekerja));

/**
 * The "Pilih Pekerja" list for Tambah Pekerja — read from the local
 * skt_master_pekerja cache that the Dashboard's "Get Data" fills (see
 * refreshMasterPekerja in SKTHeaderDashboardScreen), scoped to `brakId`
 * when given so an MK only ever picks from its own Brak's pekerja. Only
 * when the cache has none for that Brak (Get Data never run here, or its
 * pekerja download failed — e.g. another login synced this device) is the
 * API called, for that Brak alone, and the result cached. Throws with the
 * reason if there's still nothing to pick from.
 */
export async function loadMasterPekerja(brakId?: number): Promise<MasterPekerja[]> {
  const rows = (await loadFromCache<MasterPekerja[]>(CACHE_KEYS.MASTER_PEKERJA)) ?? [];
  const cached = selectablePekerja(rows, brakId);
  if (cached.length > 0 || brakId === undefined) {
    if (rows.length === 0) {
      throw new Error('Daftar pekerja belum tersedia. Jalankan Get Data terlebih dahulu.');
    }
    return cached;
  }
  try {
    return selectablePekerja(await refreshMasterPekerjaForBrak(brakId), brakId);
  } catch (error: any) {
    throw new Error(
      `Daftar pekerja untuk Brak ini belum tersedia dan gagal diunduh (${
        error?.message || 'tidak ada koneksi'
      }). Pastikan terhubung ke jaringan kantor lalu jalankan Get Data.`
    );
  }
}

/**
 * Looks up a single pekerja by NIK — used by the attendance QR scanner so
 * an admin can scan a worker's ID card/QR instead of searching by name.
 *
 * Reads CACHE_KEYS.MASTER_PEKERJA instead of hitting ORDS live — same
 * "no direct GET from a feature screen" rule the rest of the app follows
 * (see loadDetail's disabled GET in SKTHeaderDetailScreen.tsx). That cache
 * is populated by fetchMasterPekerja() during the Dashboard's "Get Data"
 * sync, so a scan works fully offline between syncs; it just won't see a
 * worker added to skt_master_pekerja after the last sync until the next
 * one runs. `active`/`isTraining` are re-checked here rather than trusted
 * blindly, since a stale cache entry could in principle predate a
 * deactivation.
 */
export async function findMasterPekerjaByNik(nik: string): Promise<MasterPekerja | null> {
  const cached = (await loadFromCache<MasterPekerja[]>(CACHE_KEYS.MASTER_PEKERJA)) ?? [];
  const match = cached.find((row) => row.nik === nik && row.active && !row.isTraining);
  return match ?? null;
}

/**
 * Looks up a scanned badge (see parseBadgeScan in services/pekerja.ts) in
 * the cached master list. The ID's Brak id, nomor absen and NIK must ALL
 * match the same active, non-training row — a NIK that exists but under a
 * different Brak or absen is not a match. Parts an older badge doesn't
 * carry (Brak id, absen) are skipped. Same cache-only rule as
 * findMasterPekerjaByNik above.
 */
export async function findMasterPekerjaByBadge(badge: ScannedBadge): Promise<MasterPekerja | null> {
  const cached = (await loadFromCache<MasterPekerja[]>(CACHE_KEYS.MASTER_PEKERJA)) ?? [];
  const match = cached.find(
    (row) =>
      row.nik === badge.nik &&
      (badge.brakId === null || row.brakId === badge.brakId) &&
      (badge.nomorAbsen === null ||
        row.nomorAbsen.trim().toUpperCase() === badge.nomorAbsen.toUpperCase()) &&
      row.active &&
      !row.isTraining
  );
  return match ?? null;
}