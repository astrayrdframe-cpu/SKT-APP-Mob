// Dashboard-list row. brandId comes from skt_header; brand (the name)
// comes from skt_view's nama_brand for the same skt_header_id.
export interface SKTHeaderItem {
  id: number;
  brakId: number; // skt_master_brak_id — raw id, kept for cases that still need it (e.g. scoping a master pekerja search, see TambahPekerjaModal's brakId prop)
  // The Brak's actual name — from skt_header's own nama_brak column (e.g.
  // "Djinggo"), NOT the logged-in user's nama_brak from /auth/login (see
  // ISktUser in interface/userInterface.ts). That login field is a
  // per-account access marker — it can be "ALL" for an account with
  // blanket access across every Brak — and isn't this header's own Brak,
  // which is why the UI must read it per-record here, not off the user.
  brakName: string;
  brandId: number;
  brand: string; // from skt_view's nama_brand
  jenisGarapanId: string; // "1" | "2" (raw code from the API)
  jenisLabel: 'Biasa' | 'Lembur' | string; // derived label for display
  tanggal: string; // from header_date
  jumlahMeja: number; // sourced from skt_view, not present on skt_header
  // skt_template_header_mk_id from skt_header — the MK template this
  // header was built from (one template can be assigned to several MKs,
  // see skt_header's nama_mk_assigned). Not used for visibility: headers
  // are scoped by brakId, and meja by skt_view's per-row mk_id (see
  // utils/accessControl.ts). Kept because the push to skt_header sends it.
  templateHeaderMkId: number | null;
  // Wage rate per batang (Good) for this header — skt_header's
  // upah_giling_biasa (numeric seats "1"/"2"/"3") and upah_batil_biasa
  // (alpha seats "A"/"B"). A pekerja's upah = their Good × their role's
  // rate (see buildSetoranSummary). Optional: headers cached before these
  // were stored lack them until the next "Get Data".
  upahGilingBiasa?: number | null;
  upahBatilBiasa?: number | null;
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
  id: number; // skt_log_pekerja_id for skt_view rows; a negative temp id for rows created on the device
  // The real skt_log_pekerja_id this row belongs to, kept separate from
  // `id` so it's never confused with a device-generated temp id:
  //  - skt_view rows (from "Get Data"): that row's own skt_log_pekerja_id.
  //  - Tambah Setoran rows: the skt_log_pekerja_id of the roster seat the
  //    pekerja was scanned from (same meja + NIK + kode), so a setoran POST
  //    can reference the seat it belongs to.
  //  - Tambah Pekerja rows (seat created on the device): null until the
  //    server assigns one.
  sktLogPekerjaId?: number | null;
  // skt_master_pekerja.id of a seat created on the device by Tambah
  // Pekerja — what Post sends to skt/skt_log_pekerja to add the seat on
  // the server (see ensureServerSeats in services/API/setoranPost.ts).
  // Undefined on skt_view rows and on seats cached before this field
  // existed; Post falls back to a MASTER_PEKERJA lookup by NIK for those.
  masterPekerjaId?: number;
  // ISO time this setoran row was successfully POSTed to the server (see
  // postPendingSetoran in services/API/setoranPost.ts) — set on both rows
  // of the pair only after the server confirms. Undefined = not posted yet.
  // A posted row can't be edited or deleted, and a header holding any
  // posted row is left untouched by "Get Data".
  postedAt?: string;
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
  // skt_view's `total` (wage for this entry) and `created_date` — carried
  // through so SetoranSummaryScreen can build Total Upah and each entry's
  // submission order from the cached rows alone (see buildSetoranSummary
  // in sktApi.ts). Undefined for rows created locally / cached before
  // these fields existed: upah counts as 0, createdDate falls back to
  // jamMasuk.
  upah?: number;
  createdDate?: string;
  // skt_view's mk_id — the MK assigned to this row's meja. Drives the
  // per-meja visibility filter for MK logins (see getVisibleMejaNumbers in
  // utils/accessControl.ts). Null/undefined for rows the backend hasn't
  // tagged yet and for rows created locally.
  mkId?: number | null;
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
  id: number; // the setoran's Giling row id
  setoranKe?: number; // the setoran's own number for its Giling+Batil pair
  good: number; // total_setoran
  bad: number; // total_defect
  createdDate: string;
  posted?: boolean; // already sent to the server (see SetoranWorker.postedAt)
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
  gilingUpah: number; // totalGood × the header's upah_giling_biasa
  batilUpah: number; // totalGood × the header's upah_batil_biasa
}

export interface MejaSummary {
  nomorMeja: number;
  pairs: PekerjaPair[];
  pasanganCount: number; // number of pairs, i.e. "X Pasang Pekerja"
  setoranCount: number; // total individual entries, i.e. "Y Setoran"
  totalGood: number;
  totalBad: number;
  totalUpah: number; // sum of `total` wage across this meja's rows
  // Distinct skt_view mk_id values at this meja — lets SetoranSummaryScreen
  // apply the same per-meja MK filter as the detail screen (see
  // getVisibleMejaNumbers in utils/accessControl.ts). Optional so older
  // cached summaries still load; a missing list just means "no MK".
  mkIds?: number[];
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
