// One row in a meja's pekerja table.
// kode is "1" | "2" | "3" (giling seats, blue badge) or "A" | "B" (batil seats, purple badge).
export interface PekerjaRow {
  id: number;
  namaPekerja: string;
  nik: string;
  kode: string;
}

// One meja section inside the Detail Meja sheet.
export interface MejaGroup {
  nomorMeja: number;
  pekerja: PekerjaRow[];
}

// The pekerja currently selected/scanned inside the Tambah Pekerja dialog.
export interface SelectedPekerja {
  namaPekerja: string;
  nik: string;
}
