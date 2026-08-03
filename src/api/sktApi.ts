import { SKTHeaderItem, SKTDetail, SetoranWorker, SetoranSummary, MejaSummary, PekerjaPair, PekerjaSlot, SetoranEntry } from '../types/skt';

const SKT_HEADER_ENDPOINT =
  'http://apps.nti-skt.net:8080/ords/sktntidev/skt/skt_header';

const SKT_VIEW_ENDPOINT =
  'http://apps.nti-skt.net:8080/ords/sktntidev/skt/skt_view';

interface RawOrdsResponse {
  items: Record<string, any>[];
  hasMore?: boolean;
  limit?: number;
  offset?: number;
  count?: number;
}

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

interface RawHeaderRow {
  id: number;
  skt_brand_id: number;
  skt_master_brak_id: number;
  skt_jenis_garapan_id: string;
  header_date: string;
  jumlah_garapan_lembur: number;
}

interface RawViewRow {
  skt_header_id: number;
  jumlah_meja: number;
  nama_brand: string;
  skt_log_pekerja_id: number;
  kode_setoran: string;
  nama_pekerja: string;
  nomor_absen: string;
  nik: string;
  nomor_meja: number;
  total_setoran: number;
  total_defect: number;
  total: number; // wage for this entry
  created_date: string;
  jam_masuk: string;
  jam_keluar: string;
}

function deriveJenisLabel(jenisGarapanId: string, jumlahGarapanLembur: number): string {
  // ASSUMPTION: "2" (or any non-"1" code) plus a nonzero lembur count
  // means overtime ("Lembur"); "1" is the regular ("Biasa") shift.
  // Confirm the real code→label mapping once more header rows with
  // varying skt_jenis_garapan_id values are available.
  if (jenisGarapanId === '2' || jumlahGarapanLembur > 0) return 'Lembur';
  return 'Biasa';
}

/**
 * Dashboard list. skt_header has everything except jumlah_meja, which
 * only exists on skt_view (repeated per worker row) — so we still need
 * to fetch skt_view to fill that one field in.
 */
export async function fetchSktHeaderList(): Promise<SKTHeaderItem[]> {
  const [headerRows, viewRows] = await Promise.all([
    fetchAllOrdsRows(SKT_HEADER_ENDPOINT) as Promise<RawHeaderRow[]>,
    fetchAllOrdsRows(SKT_VIEW_ENDPOINT) as Promise<RawViewRow[]>,
  ]);

  return headerRows.map((header): SKTHeaderItem => {
    const relatedViewRows = viewRows.filter((v) => v.skt_header_id === header.id);
    const jumlahMeja = relatedViewRows[0]?.jumlah_meja ?? 0;
    const brand = relatedViewRows[0]?.nama_brand ?? `Brand #${header.skt_brand_id}`;

    return {
      id: header.id,
      brakId: header.skt_master_brak_id,
      brandId: header.skt_brand_id,
      brand,
      jenisGarapanId: header.skt_jenis_garapan_id,
      jenisLabel: deriveJenisLabel(header.skt_jenis_garapan_id, header.jumlah_garapan_lembur),
      tanggal: header.header_date,
      jumlahMeja,
    };
  });
}

/**
 * Full detail + worker list for one header. skt_view rows for a given
 * skt_header_id are the actual "List Setoran" data — 5 worker rows per
 * meja (kode_setoran "1"/"2"/"3"/"A"/"B"), not mock data anymore.
 */
export async function fetchSktDetail(
  id: string | number
): Promise<{ detail: SKTDetail; workers: SetoranWorker[] }> {
  const [headerRows, viewRows] = await Promise.all([
    fetchAllOrdsRows(SKT_HEADER_ENDPOINT) as Promise<RawHeaderRow[]>,
    fetchAllOrdsRows(SKT_VIEW_ENDPOINT) as Promise<RawViewRow[]>,
  ]);

  const header = headerRows.find((h) => String(h.id) === String(id));
  const relatedRows = viewRows.filter((v) => String(v.skt_header_id) === String(id));

  if (!header) {
    throw new Error(`No skt_header record found for id=${id}`);
  }

  const jumlahMeja = relatedRows[0]?.jumlah_meja ?? 0;
  const totalSetoran = relatedRows.reduce((sum, row) => sum + (row.total_setoran ?? 0), 0);
  const brand = relatedRows[0]?.nama_brand ?? `Brand #${header.skt_brand_id}`;

  const detail: SKTDetail = {
    id: header.id,
    brakId: header.skt_master_brak_id,
    brandId: header.skt_brand_id,
    brand,
    jenisGarapanId: header.skt_jenis_garapan_id,
    jenisLabel: deriveJenisLabel(header.skt_jenis_garapan_id, header.jumlah_garapan_lembur),
    tanggal: header.header_date,
    jumlahMeja,
    totalSetoran,
    totalSetoranUnit: 'btg', // ASSUMPTION — no unit field in the schema
  };

  const workers: SetoranWorker[] = relatedRows
    .map((row): SetoranWorker => ({
      id: row.skt_log_pekerja_id,
      kodeSetoran: row.kode_setoran,
      namaPekerja: row.nama_pekerja,
      nomorAbsen: row.nomor_absen,
      nik: row.nik,
      nomorMeja: row.nomor_meja,
      totalSetoran: row.total_setoran ?? 0,
      totalDefect: row.total_defect ?? 0,
      jamMasuk: row.jam_masuk,
      jamKeluar: row.jam_keluar,
    }))
    // Group by meja first, then by kode_setoran ("1","2","3","A","B") within it
    .sort((a, b) => a.nomorMeja - b.nomorMeja || a.kodeSetoran.localeCompare(b.kodeSetoran));

  return { detail, workers };
}

const GILING_CODES = new Set(['1', '2', '3']);

function isGilingCode(code: string): boolean {
  return GILING_CODES.has(code);
}

function toEntry(row: RawViewRow): SetoranEntry {
  return {
    id: row.skt_log_pekerja_id,
    good: row.total_setoran ?? 0,
    bad: row.total_defect ?? 0,
    createdDate: row.created_date,
  };
}

function toSlot(rows: RawViewRow[]): PekerjaSlot {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime()
  );
  return {
    namaPekerja: sorted[0].nama_pekerja,
    nomorAbsen: sorted[0].nomor_absen,
    entries: sorted.map(toEntry),
  };
}

/**
 * Builds the Setoran Summary screen's data: skt_view rows for this
 * header, grouped by nomor_meja, then paired giling (numeric kode_setoran)
 * with batil (alpha kode_setoran) positionally. Workers are grouped by
 * nomor_absen first, since the same worker can have multiple entries
 * (multiple "Tambah Setoran" submissions) once that feature is wired up
 * — right now the sample data only has one entry per worker, so each
 * pair will show 1-2 rows rather than the 4-row example in the mockup.
 */
export async function fetchSetoranSummary(id: number): Promise<SetoranSummary> {
  const viewRows = (await fetchAllOrdsRows(SKT_VIEW_ENDPOINT)) as RawViewRow[];
  const relatedRows = viewRows.filter((v) => v.skt_header_id === id);

  const mejaNumbers = Array.from(new Set(relatedRows.map((r) => r.nomor_meja))).sort(
    (a, b) => a - b
  );

  const mejaSummaries: MejaSummary[] = mejaNumbers.map((nomorMeja): MejaSummary => {
    const mejaRows = relatedRows.filter((r) => r.nomor_meja === nomorMeja);

    // Group each worker's rows together (by nomor_absen), in case they
    // have multiple setoran entries.
    const byWorker = new Map<string, RawViewRow[]>();
    mejaRows.forEach((row) => {
      const existing = byWorker.get(row.nomor_absen) ?? [];
      byWorker.set(row.nomor_absen, [...existing, row]);
    });

    const gilingSlots: PekerjaSlot[] = [];
    const batilSlots: PekerjaSlot[] = [];

    byWorker.forEach((rows) => {
      const slot = toSlot(rows);
      if (isGilingCode(rows[0].kode_setoran)) {
        gilingSlots.push(slot);
      } else {
        batilSlots.push(slot);
      }
    });

    gilingSlots.sort((a, b) => a.nomorAbsen.localeCompare(b.nomorAbsen));
    batilSlots.sort((a, b) => a.nomorAbsen.localeCompare(b.nomorAbsen));

    const pairCount = Math.max(gilingSlots.length, batilSlots.length);
    const pairs: PekerjaPair[] = Array.from({ length: pairCount }, (_, i) => {
      const giling = gilingSlots[i] ?? null;
      const batil = batilSlots[i] ?? null;
      const entries = [...(giling?.entries ?? []), ...(batil?.entries ?? [])].sort(
        (a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime()
      );
      const totalGood = entries.reduce((sum, e) => sum + e.good, 0);
      const totalBad = entries.reduce((sum, e) => sum + e.bad, 0);
      return { giling, batil, entries, totalGood, totalBad };
    });

    const totalGood = pairs.reduce((sum, p) => sum + p.totalGood, 0);
    const totalBad = pairs.reduce((sum, p) => sum + p.totalBad, 0);
    const setoranCount = pairs.reduce((sum, p) => sum + p.entries.length, 0);

    return {
      nomorMeja,
      pairs,
      pasanganCount: pairs.length,
      setoranCount,
      totalGood,
      totalBad,
    };
  });

  const totalSetoran = mejaSummaries.reduce((sum, m) => sum + m.totalGood, 0);
  const totalUpah = relatedRows.reduce((sum, row) => sum + (row.total ?? 0), 0);

  return { headerId: id, totalSetoran, totalUpah, mejaSummaries };
}

/**
 * TEMPLATE for the real "remove pekerja from meja" transaction — not
 * called anywhere yet. DetailMejaModal's delete button currently only
 * updates local state so the UI/loading-flow can be tested without a
 * backend. Once the backend team confirms the real submission endpoint
 * (a POST to a custom PL/SQL/ORDS module is more likely here than a plain
 * AutoREST DELETE, since skt_log_pekerja's writable endpoint shape hasn't
 * been confirmed):
 *
 *   1. Replace SKT_LOG_PEKERJA_DELETE_ENDPOINT below with the real URL.
 *   2. Adjust DeletePekerjaPayload's fields to match what the endpoint
 *      actually expects (field names, extra required fields, etc).
 *   3. In SKTHeaderDetailScreen.tsx's handleDeletePekerja, replace the
 *      "LOCAL-ONLY" block with a call to submitDeletePekerja (see the
 *      commented example already sitting right above it there).
 */
// TODO: replace with the real POST endpoint once confirmed with the backend team.
const SKT_LOG_PEKERJA_DELETE_ENDPOINT =
  'http://apps.nti-skt.net:8080/ords/sktntidev/skt/TODO_REPLACE_ME';

export interface DeletePekerjaPayload {
  sktHeaderId: number;
  nomorMeja: number;
  pekerjaId: number; // skt_log_pekerja_id
}

export async function submitDeletePekerja(payload: DeletePekerjaPayload): Promise<void> {
  const response = await fetch(SKT_LOG_PEKERJA_DELETE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete pekerja id=${payload.pekerjaId} (status ${response.status})`);
  }
}

/**
 * TEMPLATE for the real "add pekerja to meja" transaction — not called
 * anywhere yet. TambahPekerjaModal's Tambah button currently only adds a
 * locally-generated row (negative placeholder id) so the UI/logic can be
 * tested without a backend. Once the real endpoint is confirmed:
 *
 *   1. Replace SKT_LOG_PEKERJA_ADD_ENDPOINT below with the real URL.
 *   2. Adjust AddPekerjaPayload / the response mapping below to match
 *      whatever the endpoint actually accepts and returns.
 *   3. In SKTHeaderDetailScreen.tsx's handleSubmitTambahPekerja, replace
 *      the "LOCAL-ONLY" block with a call to submitAddPekerja (see the
 *      commented example already sitting right above it there).
 */
// TODO: replace with the real POST endpoint once confirmed with the backend team.
const SKT_LOG_PEKERJA_ADD_ENDPOINT =
  'http://apps.nti-skt.net:8080/ords/sktntidev/skt/TODO_REPLACE_ME_ADD';

export interface AddPekerjaPayload {
  sktHeaderId: number;
  nomorMeja: number;
  kode: string; // "1" | "2" | "3" | "4" | "A" | "B" | "C" | "D"
  masterPekerjaId: number; // skt_master_pekerja.id
  nik: string;
  namaPekerja: string;
  nomorAbsen: string;
}

export async function submitAddPekerja(payload: AddPekerjaPayload): Promise<SetoranWorker> {
  const response = await fetch(SKT_LOG_PEKERJA_ADD_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to add pekerja (status ${response.status})`);
  }

  const data = await response.json();

  // ASSUMPTION — unconfirmed: the endpoint is assumed to echo back the
  // created row (or at least a new skt_log_pekerja_id) so the UI can
  // reconcile the locally-generated placeholder with the real one. Adjust
  // this mapping once the actual response shape is known.
  return {
    id: data.id ?? data.skt_log_pekerja_id,
    kodeSetoran: payload.kode,
    namaPekerja: payload.namaPekerja,
    nomorAbsen: payload.nomorAbsen,
    nik: payload.nik,
    nomorMeja: payload.nomorMeja,
    totalSetoran: 0,
    totalDefect: 0,
    jamMasuk: data.jam_masuk ?? new Date().toISOString(),
    jamKeluar: data.jam_keluar ?? '',
  };
}