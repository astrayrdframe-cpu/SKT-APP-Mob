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
  // The exact seat kode ("1"/"2"/"3"/"A"/"B") the scanned pekerja actually
  // holds at this meja — read off their roster seat at scan time (see
  // TambahSetoranModal's scannedGiling/scannedBatil effects and
  // buildSetoranWorkers in sktApi.ts), NOT a hardcoded first-seat guess.
  // A worker seated as kode '2' or 'B' gets logged under THAT kode, not
  // always '1'/'A' — this is what lets pekerjaHasSetoran (in
  // utils/mejaGrouping.ts) correctly recognize their submission when
  // deciding whether they can still be deleted from Detail Meja, and what
  // makes this field meaningful once it's sent to a real backend via POST.
  kodeSetoran: string;
  namaPekerja: string;
  nomorAbsen: string;
  nik: string;
  nomorMeja: number;
  totalSetoran: number; // "Good"
  totalDefect: number; // "Bad"
  jamMasuk: string;
  jamKeluar: string;
  // This submission's running number for its specific Giling+Batil PAIR —
  // not a meja-wide counter. "Role 1 + Role A" and "Role 1 + Role B" are
  // different pairs (different Batil person) and each counts its own
  // Setoran #1, #2, ... independently, even at the same meja/same Giling.
  // See computePairSetoranKe in utils/mejaGrouping.ts, which both sides of
  // a submission are given the same value from (see buildSetoranWorkers in
  // sktApi.ts). Undefined for rows that predate this field, or rows
  // fetched from skt_view directly — no such column has shown up in that
  // schema yet, so pairSetoranByMeja's fallback pairing (chronological,
  // not pair-aware) is used for those instead.
  setoranKe?: number;
  // Unique id shared by the Giling+Batil rows of one Tambah Setoran
  // submission (see buildSetoranWorkers in sktApi.ts) — the real, exact way
  // to pair them back up for the List Setoran card view (see
  // pairSetoranByMeja), and to key an edit/update/delete at the right two
  // rows regardless of scan order. Deliberately not shown anywhere in the
  // UI — it exists purely so a backend report/log can trace both rows of a
  // submission back to one transaction. Undefined for rows that predate
  // this field, or rows fetched from skt_view directly (no such column
  // there yet) — those fall back to the same positional pairing described
  // above.
  transactionId?: string;
  // Which role this row was scanned as — 'giling' (numeric kode) or
  // 'batil' (alpha kode). Set explicitly by buildSetoranWorkers in
  // sktApi.ts (from the same scan that resolved kodeSetoran below) rather
  // than always re-derived from kodeSetoran via isGilingCode, so it's
  // there ready-made for a backend POST body or report to read directly.
  // Undefined for rows that predate this field, or rows fetched from
  // skt_view directly — no such column there yet; code that needs a role
  // for those should fall back to isGilingCode(kodeSetoran) (see
  // workerIsGiling in utils/mejaGrouping.ts).
  role?: 'giling' | 'batil';
  // How many Barcode Tray codes were scanned for this submission — from
  // skt/test_temp for now (see resolveBarcodeTray), not a real master
  // tray/batch table. Same availability caveat as setoranKe: undefined
  // for skt_view rows, since there's no such column there either.
  trayCount?: number;
  // The actual scanned tray rows behind `trayCount`, kept around so
  // reopening this submission for edit (see SKTHeaderDetailScreen's
  // handleEditSetoran) can pre-fill the real Barcode Tray list instead of
  // just a total. Only populated for entries created locally via
  // buildSetoranWorkers — undefined for rows fetched straight from
  // skt_view, same as setoranKe/trayCount above.
  barcodeTrays?: BarcodeTrayRow[];
  // True once this row's setoran ("transaction") side has been deleted via
  // TambahSetoranModal's Hapus (see SKTHeaderDetailScreen's
  // handleDeleteSetoranPair) while the row itself had to be KEPT because
  // it's also this pekerja's only meja seat — removing the row outright
  // would have deleted them from Detail Meja too, not just the setoran.
  //
  // pairSetoranByMeja (utils/mejaGrouping.ts) skips any row marked this
  // way, so it stops producing a List Setoran card — but groupWorkersByMeja
  // there doesn't look at this flag at all, so the seat keeps showing up
  // in Detail Meja exactly as before. A row that WASN'T anyone's only seat
  // (a genuine standalone submission, separate from its own roster seat)
  // is removed from `workers` entirely instead of being flagged, so this
  // only ever appears on roster-seat rows. Undefined/false is the normal
  // case for every other row.
  setoranDeleted?: boolean;
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
