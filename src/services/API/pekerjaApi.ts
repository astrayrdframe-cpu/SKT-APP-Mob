import { buildDetailPekerja, MasterPekerja } from '../pekerja';
import { loadFromCache, CACHE_KEYS } from '../Offline/persistence';
import { dedupeById } from '../../utils/dedupe';

const SKT_MASTER_PEKERJA_ENDPOINT =
  'http://apps.nti-skt.net:8080/ords/sktntidev/skt/skt_master_pekerja';

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
  const rowsRaw = (await fetchAllOrdsRows(SKT_MASTER_PEKERJA_ENDPOINT)) as RawPekerjaRow[];
  // Dropped here, at the fetch boundary — see dedupeById's own comment in
  // utils/dedupe.ts for why (a dirty view/join, or a pagination overlap,
  // shouldn't surface downstream as a duplicate name in the "Pilih
  // Pekerja" combobox or CACHE_KEYS.MASTER_PEKERJA).
  const rows = dedupeById(rowsRaw, (r) => r.id);

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