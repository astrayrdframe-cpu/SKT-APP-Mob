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
