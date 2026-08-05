import { SKTHeaderItem, SKTDetail, SetoranWorker, SetoranSummary, MejaSummary, PekerjaPair, PekerjaSlot, SetoranEntry, BarcodeTrayRow } from '../skt';

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

// ---------------------------------------------------------------------------
// TEMPORARY TEST DATA — dual-role (Giling + Batil) demo row
// ---------------------------------------------------------------------------
// The backend hasn't produced a real skt_view row where one pekerja holds
// BOTH a Giling (numeric) and a Batil (alpha) kode at the same meja, so
// there's no way to manually verify Tambah Setoran's dual-role scan
// validation against real data yet. This clones an existing Giling worker
// into a second row at the same meja under a free Batil kode — same NIK,
// so scanning that same real pekerja's badge for BOTH Pekerja Giling and
// Pekerja Batil in Tambah Setoran should succeed once this is in place.
//
// Purely a client-side splice of the already-fetched `workers` list — no
// POST, nothing persisted server-side. Flip INJECT_DUAL_ROLE_TEST_ROW to
// false (or delete this block and its call site below) once real
// dual-role data exists upstream or this has served its testing purpose.
const INJECT_DUAL_ROLE_TEST_ROW = true;

function injectDualRoleTestRow(workers: SetoranWorker[]): SetoranWorker[] {
  if (!INJECT_DUAL_ROLE_TEST_ROW) return workers;

  const gilingSample = workers.find((w) => isGilingCode(w.kodeSetoran));
  if (!gilingSample) return workers; // no Giling worker to clone from

  const sameMeja = workers.filter((w) => w.nomorMeja === gilingSample.nomorMeja);
  const usedCodes = new Set(sameMeja.map((w) => w.kodeSetoran));
  const freeBatilCode = ['A', 'B'].find((c) => !usedCodes.has(c));
  if (!freeBatilCode) return workers; // meja's Batil seats are already full

  const testRow: SetoranWorker = {
    ...gilingSample,
    id: -1, // negative id — never collides with a real skt_log_pekerja_id
    kodeSetoran: freeBatilCode,
    namaPekerja: `${gilingSample.namaPekerja} (TEST DUAL-ROLE)`,
  };

  return [...workers, testRow].sort(
    (a, b) => a.nomorMeja - b.nomorMeja || a.kodeSetoran.localeCompare(b.kodeSetoran)
  );
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

  const workers: SetoranWorker[] = injectDualRoleTestRow(
    relatedRows
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
      .sort((a, b) => a.nomorMeja - b.nomorMeja || a.kodeSetoran.localeCompare(b.kodeSetoran))
  );

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

// ---------------------------------------------------------------------------
// Pekerja add/delete — local-cache-for-testing, ORDS-ready for real use
// ---------------------------------------------------------------------------
//
// Flip this one flag once the real ORDS endpoints below are filled in and
// confirmed working. Every screen calls the addPekerjaToMeja /
// deletePekerjaFromMeja wrappers further down — neither the UI nor
// SKTHeaderDetailScreen needs to change when you flip it.
export const USE_LOCAL_PEKERJA_CACHE = true;

// TODO: replace with the real POST endpoint once confirmed with the backend team.
const SKT_LOG_PEKERJA_DELETE_ENDPOINT =
  'http://apps.nti-skt.net:8080/ords/sktntidev/skt/TODO_REPLACE_ME_DELETE';

// TODO: replace with the real POST endpoint once confirmed with the backend team.
const SKT_LOG_PEKERJA_ADD_ENDPOINT =
  'http://apps.nti-skt.net:8080/ords/sktntidev/skt/TODO_REPLACE_ME_ADD';

export interface DeletePekerjaPayload {
  sktHeaderId: number;
  nomorMeja: number;
  pekerjaId: number; // skt_log_pekerja_id
}

export interface AddPekerjaPayload {
  sktHeaderId: number;
  nomorMeja: number;
  kode: string; // "1" | "2" | "3" | "4" | "A" | "B" | "C" | "D"
  masterPekerjaId: number; // skt_master_pekerja.id
  nik: string; // the field the ORDS module keys the lookup/insert on
  namaPekerja: string;
  nomorAbsen: string;
}

/**
 * TEMPLATE — real POST to remove a pekerja from a meja. Body uses
 * snake_case matching typical ORDS/DB column naming, not the camelCase
 * used on the TS side. NIK is sent explicitly since it's the natural key
 * an ORDS PL/SQL module would use to identify the worker.
 */
async function submitDeletePekerja(payload: DeletePekerjaPayload): Promise<void> {
  const response = await fetch(SKT_LOG_PEKERJA_DELETE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skt_header_id: payload.sktHeaderId,
      nomor_meja: payload.nomorMeja,
      skt_log_pekerja_id: payload.pekerjaId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete pekerja id=${payload.pekerjaId} (status ${response.status})`);
  }
}

/** Local-only removal — no network call, just resolves immediately. */
async function deletePekerjaLocalCache(_payload: DeletePekerjaPayload): Promise<void> {
  return;
}

/**
 * Entry point DetailMejaModal's delete flow should call. Routes to the
 * local cache or the real ORDS POST based on USE_LOCAL_PEKERJA_CACHE — the
 * caller never needs to know which one actually ran.
 */
export async function deletePekerjaFromMeja(payload: DeletePekerjaPayload): Promise<void> {
  if (USE_LOCAL_PEKERJA_CACHE) {
    return deletePekerjaLocalCache(payload);
  }
  return submitDeletePekerja(payload);
}

/**
 * TEMPLATE — real POST to add a pekerja to a meja. Body is deliberately
 * snake_case (nik, nomor_meja, kode, ...) to match a typical ORDS
 * AutoREST/PL/SQL module's expected column names — adjust field names
 * here once the real module's contract is known. NIK is the field most
 * ORDS "add worker" modules would key off; masterPekerjaId is included
 * too in case the endpoint prefers an ID-based lookup instead.
 */
async function submitAddPekerja(payload: AddPekerjaPayload): Promise<SetoranWorker> {
  const response = await fetch(SKT_LOG_PEKERJA_ADD_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skt_header_id: payload.sktHeaderId,
      nomor_meja: payload.nomorMeja,
      kode: payload.kode,
      master_pekerja_id: payload.masterPekerjaId,
      nik: payload.nik,
      nama_pekerja: payload.namaPekerja,
      nomor_absen: payload.nomorAbsen,
    }),
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

/**
 * Local-only add — generates a placeholder row with a negative id (so it
 * can never collide with a real skt_log_pekerja_id) and a short simulated
 * delay, so the full confirm → loading → appears-in-list flow can still be
 * tested without a backend.
 */
async function addPekerjaLocalCache(payload: AddPekerjaPayload): Promise<SetoranWorker> {
  await new Promise<void>((resolve) => setTimeout(resolve, 400));

  return {
    id: -Date.now(),
    kodeSetoran: payload.kode,
    namaPekerja: payload.namaPekerja,
    nomorAbsen: payload.nomorAbsen,
    nik: payload.nik,
    nomorMeja: payload.nomorMeja,
    totalSetoran: 0,
    totalDefect: 0,
    jamMasuk: new Date().toISOString(),
    jamKeluar: '',
  };
}

/**
 * Entry point TambahPekerjaModal's Tambah button should call. Routes to
 * the local cache or the real ORDS POST based on USE_LOCAL_PEKERJA_CACHE.
 * To go live: fill in SKT_LOG_PEKERJA_ADD_ENDPOINT above, confirm the
 * request/response shape with the backend team, then flip
 * USE_LOCAL_PEKERJA_CACHE to false — nothing else needs to change.
 */
export async function addPekerjaToMeja(payload: AddPekerjaPayload): Promise<SetoranWorker> {
  if (USE_LOCAL_PEKERJA_CACHE) {
    return addPekerjaLocalCache(payload);
  }
  return submitAddPekerja(payload);
}

// ---------------------------------------------------------------------------
// Tambah Setoran — barcode tray resolve + submit
// ---------------------------------------------------------------------------
//
// Same local-cache-for-testing / ORDS-ready split as the pekerja add/delete
// helpers above. Flip USE_LOCAL_SETORAN_CACHE once the real endpoints below
// are filled in and confirmed with the backend team.
export const USE_LOCAL_SETORAN_CACHE = true;

// TODO: replace with the real GET endpoint once confirmed with the backend team.
// ASSUMPTION: a scanned tray barcode resolves against some master
// tray/batch table keyed by its printed code — no such table has shown up
// in the schema yet, so this is a placeholder contract (code in, batang
// count out).
const SKT_BARCODE_TRAY_RESOLVE_ENDPOINT =
  'http://apps.nti-skt.net:8080/ords/sktntidev/skt/TODO_REPLACE_ME_BARCODE_TRAY';

// TODO: replace with the real POST endpoint once confirmed with the backend team.
const SKT_LOG_SETORAN_ADD_ENDPOINT =
  'http://apps.nti-skt.net:8080/ords/sktntidev/skt/TODO_REPLACE_ME_SETORAN_ADD';

// TODO: replace with the real POST endpoint once confirmed with the backend team.
const SKT_LOG_SETORAN_DELETE_ENDPOINT =
  'http://apps.nti-skt.net:8080/ords/sktntidev/skt/TODO_REPLACE_ME_SETORAN_DELETE';

/**
 * TEMPLATE — real lookup for one scanned tray barcode. Returns the batang
 * (stem) count that barcode represents so the admin never types a
 * quantity by hand.
 */
async function resolveBarcodeTrayRemote(code: string): Promise<BarcodeTrayRow> {
  const response = await fetch(
    `${SKT_BARCODE_TRAY_RESOLVE_ENDPOINT}?code=${encodeURIComponent(code)}`
  );

  if (!response.ok) {
    throw new Error(`Barcode ${code} tidak dikenali (status ${response.status})`);
  }

  const data = await response.json();
  return { code, batang: data.batang ?? data.jumlah_batang ?? 0 };
}

/**
 * Local-only resolve — no master tray table to check against yet, so this
 * just hands back a plausible batang count (a fixed 50, matching the
 * reference mockup) after a short simulated delay.
 */
async function resolveBarcodeTrayLocalCache(code: string): Promise<BarcodeTrayRow> {
  await new Promise<void>((resolve) => setTimeout(resolve, 300));
  return { code, batang: 50 };
}

/** Entry point Tambah Setoran's "+ Scan to Add" should call. */
export async function resolveBarcodeTray(code: string): Promise<BarcodeTrayRow> {
  if (USE_LOCAL_SETORAN_CACHE) {
    return resolveBarcodeTrayLocalCache(code);
  }
  return resolveBarcodeTrayRemote(code);
}

interface SetoranPekerjaInput {
  masterPekerjaId: number;
  nik: string;
  namaPekerja: string;
  nomorAbsen: string;
}

export interface SubmitSetoranPayload {
  sktHeaderId: number;
  nomorMeja: number;
  setoranKe: number;
  giling: SetoranPekerjaInput;
  batil: SetoranPekerjaInput;
  barcodeTrays: BarcodeTrayRow[]; // sum of `batang` across these = "Good"
  badWaste: number; // "Bad"
}

// ASSUMPTION: first free giling/batil seat codes — confirm the real
// seat-assignment rule with the backend team once available (see the
// same assumption already called out on TambahPekerjaModal's ALL_CODES).
const GILING_KODE_SETORAN = '1';
const BATIL_KODE_SETORAN = 'A';

function buildSetoranWorkers(payload: SubmitSetoranPayload, idBase: number): SetoranWorker[] {
  const totalGood = payload.barcodeTrays.reduce((sum, t) => sum + t.batang, 0);
  const now = new Date().toISOString();

  return [
    {
      id: idBase,
      kodeSetoran: GILING_KODE_SETORAN,
      namaPekerja: payload.giling.namaPekerja,
      nomorAbsen: payload.giling.nomorAbsen,
      nik: payload.giling.nik,
      nomorMeja: payload.nomorMeja,
      totalSetoran: totalGood,
      totalDefect: payload.badWaste,
      jamMasuk: now,
      jamKeluar: '',
    },
    {
      id: idBase - 1,
      kodeSetoran: BATIL_KODE_SETORAN,
      namaPekerja: payload.batil.namaPekerja,
      nomorAbsen: payload.batil.nomorAbsen,
      nik: payload.batil.nik,
      nomorMeja: payload.nomorMeja,
      totalSetoran: totalGood,
      totalDefect: payload.badWaste,
      jamMasuk: now,
      jamKeluar: '',
    },
  ];
}

/**
 * TEMPLATE — real POST for a new setoran submission (one giling + one
 * batil pekerja, the tray barcodes scanned for them, and any bad/waste
 * count). Body is snake_case to match a typical ORDS/PL/SQL module.
 */
async function submitSetoranRemote(payload: SubmitSetoranPayload): Promise<SetoranWorker[]> {
  const response = await fetch(SKT_LOG_SETORAN_ADD_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skt_header_id: payload.sktHeaderId,
      nomor_meja: payload.nomorMeja,
      setoran_ke: payload.setoranKe,
      giling: payload.giling,
      batil: payload.batil,
      barcode_trays: payload.barcodeTrays,
      bad_waste: payload.badWaste,
    }),
  });

  if (!response.ok) {
    throw new Error(`Gagal mengirim setoran (status ${response.status})`);
  }

  const data = await response.json();

  // ASSUMPTION — unconfirmed: the endpoint is assumed to echo back the two
  // created skt_log_pekerja rows (giling + batil). Adjust this mapping
  // once the real response shape is known.
  if (Array.isArray(data?.items) && data.items.length === 2) {
    return data.items.map(
      (row: any, i: number): SetoranWorker => ({
        id: row.id ?? row.skt_log_pekerja_id,
        kodeSetoran: row.kode_setoran ?? (i === 0 ? GILING_KODE_SETORAN : BATIL_KODE_SETORAN),
        namaPekerja: row.nama_pekerja,
        nomorAbsen: row.nomor_absen,
        nik: row.nik,
        nomorMeja: payload.nomorMeja,
        totalSetoran: row.total_setoran ?? 0,
        totalDefect: row.total_defect ?? 0,
        jamMasuk: row.jam_masuk ?? new Date().toISOString(),
        jamKeluar: row.jam_keluar ?? '',
      })
    );
  }

  return buildSetoranWorkers(payload, -Date.now());
}

/**
 * Local-only submit — generates two placeholder rows (negative ids, like
 * addPekerjaLocalCache) so the full scan → resolve → submit → appears-in-
 * list flow can be tested end to end without a backend.
 */
async function submitSetoranLocalCache(payload: SubmitSetoranPayload): Promise<SetoranWorker[]> {
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
  return buildSetoranWorkers(payload, -Date.now());
}

/**
 * Entry point Tambah Setoran's Submit button should call. Routes to the
 * local cache or the real ORDS POST based on USE_LOCAL_SETORAN_CACHE. To
 * go live: fill in the SKT_LOG_SETORAN_* endpoints above, confirm the
 * request/response shape with the backend team, then flip
 * USE_LOCAL_SETORAN_CACHE to false — nothing else needs to change.
 */
export async function submitSetoran(payload: SubmitSetoranPayload): Promise<SetoranWorker[]> {
  if (USE_LOCAL_SETORAN_CACHE) {
    return submitSetoranLocalCache(payload);
  }
  return submitSetoranRemote(payload);
}

export interface DeleteSetoranPayload {
  sktHeaderId: number;
  nomorMeja: number;
  gilingId: number; // skt_log_pekerja_id
  batilId: number; // skt_log_pekerja_id
}

/** TEMPLATE — real POST to remove both rows of one setoran submission. */
async function deleteSetoranRemote(payload: DeleteSetoranPayload): Promise<void> {
  const response = await fetch(SKT_LOG_SETORAN_DELETE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skt_header_id: payload.sktHeaderId,
      nomor_meja: payload.nomorMeja,
      skt_log_pekerja_ids: [payload.gilingId, payload.batilId],
    }),
  });

  if (!response.ok) {
    throw new Error(`Gagal menghapus setoran (status ${response.status})`);
  }
}

/** Local-only removal — no network call, just resolves immediately. */
async function deleteSetoranLocalCache(_payload: DeleteSetoranPayload): Promise<void> {
  return;
}

/**
 * Entry point Tambah Setoran's Hapus button should call (edit-mode only —
 * see TambahSetoranModal's `existingSetoranId` prop).
 */
export async function deleteSetoran(payload: DeleteSetoranPayload): Promise<void> {
  if (USE_LOCAL_SETORAN_CACHE) {
    return deleteSetoranLocalCache(payload);
  }
  return deleteSetoranRemote(payload);
}