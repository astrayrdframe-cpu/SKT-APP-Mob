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

// A single row from skt_master_pekerja — the full worker directory used to
// populate the "Pilih Pekerja" search combobox inside TambahPekerjaModal.
// `nik` doubles as the (non-editable) "Kode Pekerja" value once a worker
// is selected.
export interface MasterPekerja {
  id: number;
  nomorAbsen: string;
  nik: string;
  namaPekerja: string;
  active: boolean;
  isTraining: boolean;
  brakId: number; // skt_master_brak_id — used to scope suggestions to the current Brak
}

// The pekerja currently selected inside the Tambah Pekerja dialog.
export type SelectedPekerja = Pick<MasterPekerja, 'id' | 'namaPekerja' | 'nik'>;
