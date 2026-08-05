import { SetoranWorker } from '../services/skt';
import { MejaGroup, PekerjaRow } from '../services/pekerja';

/**
 * Groups the flat SetoranWorker[] list (already fetched for the detail
 * screen) by nomor_meja, and reshapes each row into the PekerjaRow shape
 * DetailMejaModal expects. This is a pure, synchronous transform — no
 * extra network call needed since `workers` is already in memory.
 */
export function groupWorkersByMeja(workers: SetoranWorker[]): MejaGroup[] {
  const mejaNumbers = Array.from(new Set(workers.map((w) => w.nomorMeja))).sort(
    (a, b) => a - b
  );

  return mejaNumbers.map((nomorMeja): MejaGroup => {
    const pekerja: PekerjaRow[] = workers
      .filter((w) => w.nomorMeja === nomorMeja)
      .map((w) => ({
        id: w.id,
        namaPekerja: w.namaPekerja,
        nik: w.nik,
        kode: w.kodeSetoran,
      }))
      .sort((a, b) => a.kode.localeCompare(b.kode));

    return { nomorMeja, pekerja };
  });
}
