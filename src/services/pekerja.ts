// Combines a pekerja's nomor absen, name, and NIK into the single identity
// string the backend itself computes as `detail_pekerja` on skt_view (e.g.
// "GT002 - TURASMI - 0002FE2"). This — not NIK alone — is what
// cross-meja/dual-role validation compares on, since NIK by itself isn't
// treated as the reliable natural key anymore.
export function buildDetailPekerja(nomorAbsen: string, namaPekerja: string, nik: string): string {
  return `${nomorAbsen} - ${namaPekerja} - ${nik}`;
}

// Reverses buildDetailPekerja for a scanned badge. Employee badges now
// encode the full "nomor_absen - nama_pekerja - nik" string, but the
// pekerja lookup (findMasterPekerjaByNik) still keys on NIK alone — so the
// scanner needs just the last segment, not the raw scanned value. Splits
// on the LAST " - " rather than the first, since nama_pekerja could in
// principle contain a hyphen of its own. Falls back to the raw scanned
// value unchanged for older badges that still encode a bare NIK (no
// separator found).
export function extractNikFromScan(scannedValue: string): string {
  const trimmed = scannedValue.trim();
  const lastSeparatorIndex = trimmed.lastIndexOf(' - ');
  return lastSeparatorIndex === -1 ? trimmed : trimmed.slice(lastSeparatorIndex + 3).trim();
}

// What a scanned worker badge identifies. Current badges encode the ID
// "<brak_id>-<nomor_absen>-<nik>" with no spaces, e.g. "0003-IT006-999999994"
// (Brak 3, absen IT006, NIK 999999994) — all three must match the same
// skt_master_pekerja row (see findMasterPekerjaByBadge in pekerjaApi.ts).
// Older badges ("nomor_absen - nama_pekerja - nik", or a bare NIK) carry no
// Brak id, so brakId is null for them and only what they do carry is checked.
export interface ScannedBadge {
  raw: string;
  brakId: number | null;
  nomorAbsen: string | null;
  nik: string;
}

export function parseBadgeScan(scannedValue: string): ScannedBadge {
  const raw = scannedValue.trim();
  // NIK is everything after the second "-", so a NIK containing a hyphen
  // would still parse (none do today).
  const id = /^(\d+)-([^-\s]+)-(\S+)$/.exec(raw);
  if (id) {
    return { raw, brakId: Number(id[1]), nomorAbsen: id[2], nik: id[3] };
  }
  const firstSeparatorIndex = raw.indexOf(' - ');
  return {
    raw,
    brakId: null,
    nomorAbsen: firstSeparatorIndex === -1 ? null : raw.slice(0, firstSeparatorIndex).trim(),
    nik: extractNikFromScan(raw),
  };
}

// One row in a meja's pekerja table.
// kode is "1" | "2" | "3" (giling seats, blue badge) or "A" | "B" (batil seats, purple badge).
export interface PekerjaRow {
  id: number;
  nomorAbsen: string;
  namaPekerja: string;
  nik: string;
  kode: string;
  // "nomor_absen - nama_pekerja - nik" — see buildDetailPekerja above.
  detailPekerja: string;
}

// One meja section inside the Detail Meja sheet.
export interface MejaGroup {
  nomorMeja: number;
  pekerja: PekerjaRow[];
}

// A single row from skt_master_pekerja — the full worker directory used to
// populate the "Pilih Pekerja" search combobox inside TambahPekerjaModal.
// `nik` doubles as the (non-editable) "Kode Pekerja" value once a worker
// is selected.
export interface MasterPekerja {
  id: number;
  nomorAbsen: string;
  nik: string;
  namaPekerja: string;
  // "nomor_absen - nama_pekerja - nik" — see buildDetailPekerja above.
  detailPekerja: string;
  active: boolean;
  isTraining: boolean;
  brakId: number; // skt_master_brak_id — used to scope suggestions to the current Brak
}

// The pekerja currently selected inside the Tambah Pekerja dialog.
export type SelectedPekerja = Pick<MasterPekerja, 'id' | 'namaPekerja' | 'nik'>;
