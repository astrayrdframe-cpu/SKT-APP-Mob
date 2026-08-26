import { SetoranWorker } from '../services/skt';
import { buildDetailPekerja, MejaGroup, PekerjaRow } from '../services/pekerja';
import { isGilingCode } from './pekerjaRole';

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
        nomorAbsen: w.nomorAbsen,
        namaPekerja: w.namaPekerja,
        nik: w.nik,
        kode: w.kodeSetoran,
        detailPekerja: buildDetailPekerja(w.nomorAbsen, w.namaPekerja, w.nik),
      }))
      .sort((a, b) => a.kode.localeCompare(b.kode));

    return { nomorMeja, pekerja };
  });
}

// --- Setoran pairing (List Setoran card view) ---
//
// One Tambah Setoran submission always creates exactly one Giling (numeric
// kode) row and one Batil (alpha kode) row together, sharing the same
// `setoranKe` sequence number (see buildSetoranWorkers in sktApi.ts). This
// pairs those rows back up so the List Setoran section can show one card
// per submission — Giling on one side, Batil on the other — instead of a
// flat one-card-per-worker-row list.
//
// Real skt_view rows fetched from ORDS don't carry a `setoranKe` (or
// tray-count) field yet — no such column has shown up in that schema — so
// pairing falls back to chronological order within each role: sort each
// role's rows by `setoranKe` (undefined sorts last) then `jamMasuk`, then
// zip them positionally — the i-th earliest Giling row pairs with the
// i-th earliest Batil row. ASSUMPTION: confirm the real pairing rule (an
// actual transaction/setoran id from the backend) once it exists; this is
// only as reliable as "both roles submit in the same relative order",
// which every local Tambah Setoran submission satisfies by construction,
// but isn't guaranteed for older/real historical data.
export interface SetoranPairRow {
  key: string;
  nomorMeja: number;
  setoranKe: number;
  giling: SetoranWorker | null;
  batil: SetoranWorker | null;
  good: number;
  bad: number;
  trayCount: number;
}

function sortForPairing(rows: SetoranWorker[]): SetoranWorker[] {
  return [...rows].sort((a, b) => {
    const keA = a.setoranKe ?? Number.POSITIVE_INFINITY;
    const keB = b.setoranKe ?? Number.POSITIVE_INFINITY;
    if (keA !== keB) return keA - keB;
    return new Date(a.jamMasuk).getTime() - new Date(b.jamMasuk).getTime();
  });
}

export function pairSetoranByMeja(workers: SetoranWorker[]): SetoranPairRow[] {
  const mejaNumbers = Array.from(new Set(workers.map((w) => w.nomorMeja))).sort((a, b) => a - b);

  return mejaNumbers.flatMap((nomorMeja) => {
    const mejaWorkers = workers.filter((w) => w.nomorMeja === nomorMeja);
    const giling = sortForPairing(mejaWorkers.filter((w) => isGilingCode(w.kodeSetoran)));
    const batil = sortForPairing(mejaWorkers.filter((w) => !isGilingCode(w.kodeSetoran)));
    const pairCount = Math.max(giling.length, batil.length);

    return Array.from({ length: pairCount }, (_, i): SetoranPairRow => {
      const g = giling[i] ?? null;
      const b = batil[i] ?? null;
      return {
        key: `${nomorMeja}-${g?.id ?? 'x'}-${b?.id ?? 'x'}`,
        nomorMeja,
        setoranKe: g?.setoranKe ?? b?.setoranKe ?? i + 1,
        giling: g,
        batil: b,
        good: g?.totalSetoran ?? b?.totalSetoran ?? 0,
        bad: g?.totalDefect ?? b?.totalDefect ?? 0,
        trayCount: g?.trayCount ?? b?.trayCount ?? 0,
      };
    });
  });
}
