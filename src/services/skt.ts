// Dashboard-list row. brandId comes from skt_header; brand (the name)
// comes from skt_view's nama_brand for the same skt_header_id. brakId
// still has no name lookup yet (no equivalent "nama_brak" field seen).
export interface SKTHeaderItem {
  id: number;
  brakId: number;
  brandId: number;
  brand: string; // from skt_view's nama_brand
  jenisGarapanId: string; // "1" | "2" (raw code from the API)
  jenisLabel: 'Biasa' | 'Lembur' | string; // derived label for display
  tanggal: string; // from header_date
  jumlahMeja: number; // sourced from skt_view, not present on skt_header
}

// Full detail for one header, plus the aggregated total across all its
// workers/meja.
export interface SKTDetail extends SKTHeaderItem {
  totalSetoran: number;
  totalSetoranUnit: string; // assumed "btg" — no unit field in the schema
}

// One row from skt_view = one worker's setoran entry at a specific meja.
// kode_setoran is "1" | "2" | "3" | "A" | "B" per meja (5 positions).
export interface SetoranWorker {
  id: number; // skt_log_pekerja_id
  kodeSetoran: string;
  namaPekerja: string;
  nomorAbsen: string;
  nik: string;
  nomorMeja: number;
  totalSetoran: number; // "Good"
  totalDefect: number; // "Bad"
  jamMasuk: string;
  jamKeluar: string;
  // Which Tambah Setoran submission (per meja) this row belongs to — the
  // Giling and Batil rows created by the same submission always share the
  // same value (see buildSetoranWorkers in sktApi.ts). Used to pair a
  // Giling row back up with its Batil row for the List Setoran card view
  // (see pairSetoranByMeja in utils/mejaGrouping.ts). Undefined for rows
  // that predate this field, or rows fetched from skt_view directly — no
  // such column has shown up in that schema yet, so the pairing falls
  // back to chronological order for those.
  setoranKe?: number;
  // How many Barcode Tray codes were scanned for this submission — from
  // skt/test_temp for now (see resolveBarcodeTray), not a real master
  // tray/batch table. Same availability caveat as setoranKe: undefined
  // for skt_view rows, since there's no such column there either.
  trayCount?: number;
}

// --- Setoran Summary screen types ---
// Built from the same skt_view rows, regrouped by meja then by
// giling/batil pairing. kode_setoran "1"/"2"/"3" = Pekerja Giling seats;
// "A"/"B" = Pekerja Batil seats. Pairing is positional (1st giling with
// 1st batil, etc.) — there's no explicit pairing field in the schema,
// so an unmatched giling (e.g. a 3rd giling with only 2 batil) shows
// alone. Confirm this pairing assumption once more data is available.

export interface SetoranEntry {
  id: number; // skt_log_pekerja_id
  good: number; // total_setoran
  bad: number; // total_defect
  createdDate: string;
}

export interface PekerjaSlot {
  namaPekerja: string;
  nomorAbsen: string;
  entries: SetoranEntry[];
}

export interface PekerjaPair {
  giling: PekerjaSlot | null;
  batil: PekerjaSlot | null;
  entries: SetoranEntry[]; // giling + batil entries combined, in submission order
  totalGood: number;
  totalBad: number;
}

export interface MejaSummary {
  nomorMeja: number;
  pairs: PekerjaPair[];
  pasanganCount: number; // number of pairs, i.e. "X Pasang Pekerja"
  setoranCount: number; // total individual entries, i.e. "Y Setoran"
  totalGood: number;
  totalBad: number;
}

export interface SetoranSummary {
  headerId: number;
  totalSetoran: number; // grand total Good, across all meja
  totalUpah: number; // sum of the `total` wage field across all entries
  mejaSummaries: MejaSummary[];
}

// --- Tambah Setoran form ---
// One scanned tray barcode, resolved to its batang (stem) quantity.
// `batang` comes back from the scan-resolve step, not typed by the admin.
export interface BarcodeTrayRow {
  code: string;
  batang: number;
}

// One row from the skt/test_temp ORDS endpoint. A standalone test/demo
// table — not tied to any SKT header/meja/pekerja — pulled in during the
// Dashboard's "Get Data" resync and cached for later use.
export interface TestTempRow {
  id: number;
  nameTest: string;
  createdDate: string;
  createdBy: string;
  updatedDate: string | null;
  updatedBy: string | null;
}
