import { MasterPekerja } from '../types/pekerja';

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
  const rows = (await fetchAllOrdsRows(SKT_MASTER_PEKERJA_ENDPOINT)) as RawPekerjaRow[];

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
        active: row.active === 1,
        isTraining: row.is_training === 1,
        brakId: row.skt_master_brak_id,
      })
    )
    .sort((a, b) => a.namaPekerja.localeCompare(b.namaPekerja));
}
