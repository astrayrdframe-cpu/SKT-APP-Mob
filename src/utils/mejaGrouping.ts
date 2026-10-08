import { SetoranWorker } from '../services/skt';
import { buildDetailPekerja, MejaGroup, PekerjaRow } from '../services/pekerja';
import { isGilingCode } from './pekerjaRole';

// Whether a row is the Giling (numeric kode) side of a submission.
// Prefers the explicit `role` field (see SetoranWorker.role in skt.ts —
// set directly from the scan that created the row, so it's authoritative)
// and only falls back to deriving it from `kodeSetoran` for rows that
// predate that field, or rows fetched straight from skt_view. Exported —
// also used by SKTHeaderDetailScreen's handleDeleteSetoranPair to decide
// whether removing a setoran's row would also remove the worker's only
// seat at that meja/role.
export function workerIsGiling(w: SetoranWorker): boolean {
  return w.role ? w.role === 'giling' : isGilingCode(w.kodeSetoran);
}

// Whether a row records an actual setoran rather than just a roster seat:
// either it came from a Tambah Setoran submission (has a transactionId) or
// it carries some Good/Bad (an older skt_view row from before transaction
// ids existed). A bare seat — a Tambah Pekerja row, or a skt_view row with
// zero totals — is not a setoran, so it must never be paired into a List
// Setoran card or counted toward a pair's Setoran number; otherwise two
// empty seats become a phantom "Setoran #1" and the first real submission
// is numbered #2.
// The skt_log_pekerja_id of a pekerja's roster seat at a meja — the bare
// seat row (no transactionId) with the same meja, NIK and kode. null if no
// such seat exists or it was created on the device (no server id yet).
export function findSeatLogPekerjaId(
  workers: SetoranWorker[],
  nomorMeja: number,
  nik: string,
  kode: string
): number | null {
  const seat = workers.find(
    (w) => !w.transactionId && w.nomorMeja === nomorMeja && w.nik === nik && w.kodeSetoran === kode
  );
  return seat ? seatLogPekerjaId(seat) : null;
}

// A seat row's server id: its sktLogPekerjaId, or — for skt_view rows
// cached before that field existed — its positive `id` (which for those
// rows IS skt_log_pekerja_id; negative ids are device temp ids).
function seatLogPekerjaId(seat: SetoranWorker): number | null {
  return seat.sktLogPekerjaId ?? (seat.id > 0 ? seat.id : null);
}

// Fills in sktLogPekerjaId on rows cached before the field existed: seats
// from their own server id, setoran rows from their seat. Returns the same
// array if nothing changed.
export function backfillSktLogPekerjaId(workers: SetoranWorker[]): SetoranWorker[] {
  let changed = false;
  const result = workers.map((w) => {
    if (w.sktLogPekerjaId !== undefined) return w;
    const sktLogPekerjaId = w.transactionId
      ? findSeatLogPekerjaId(workers, w.nomorMeja, w.nik, w.kodeSetoran)
      : seatLogPekerjaId(w);
    changed = true;
    return { ...w, sktLogPekerjaId };
  });
  return changed ? result : workers;
}

export function isSetoranRow(w: SetoranWorker): boolean {
  return !!w.transactionId || (w.totalSetoran ?? 0) > 0 || (w.totalDefect ?? 0) > 0;
}

/**
 * Groups the flat SetoranWorker[] list (already fetched for the detail
 * screen) by nomor_meja, and reshapes each row into the PekerjaRow shape
 * DetailMejaModal expects. This is a pure, synchronous transform — no
 * extra network call needed since `workers` is already in memory.
 *
 * `workers` is a TRANSACTION LOG, not a roster: buildSetoranWorkers (see
 * sktApi.ts) deliberately mints a brand-new pair of rows for every single
 * Tambah Setoran submission — including a repeat submission for a giling/
 * batil who's already seated at that meja/kode — because List Setoran needs
 * one card per submission (each with its own setoranKe/transactionId/good/
 * bad, see pairSetoranByMeja below). Left ungrouped, that means the SAME
 * seat would show up once per submission here — Detail Meja would visibly
 * grow every time an already-seated pair got another Tambah Setoran logged
 * against them, and "shrink" in a confusing way when one of those
 * submissions was later deleted (see handleDeleteSetoranPair in
 * SKTHeaderDetailScreen, which already assumes exactly this dedup — its
 * "stillSeatedElsewhere" check only makes sense once one seat can genuinely
 * have more than one underlying row).
 *
 * So this collapses every row sharing the same (meja, kode, detailPekerja)
 * — the same physical seat — down to ONE roster row, keyed on the EARLIEST
 * one (by jamMasuk): the original seat, not whichever submission happened
 * most recently. Which single row wins only matters for `id` (everything
 * else — name/nik/nomorAbsen/kode — is identical across duplicates for the
 * same seat); that `id` is what Detail Meja's own "Delete" button acts on.
 */
export function groupWorkersByMeja(workers: SetoranWorker[]): MejaGroup[] {
  const mejaNumbers = Array.from(new Set(workers.map((w) => w.nomorMeja))).sort(
    (a, b) => a - b
  );

  return mejaNumbers.map((nomorMeja): MejaGroup => {
    const mejaWorkers = [...workers]
      .filter((w) => w.nomorMeja === nomorMeja)
      .sort((a, b) => new Date(a.jamMasuk).getTime() - new Date(b.jamMasuk).getTime());

    const seenSeats = new Set<string>();
    const pekerja: PekerjaRow[] = [];
    mejaWorkers.forEach((w) => {
      const detailPekerja = buildDetailPekerja(w.nomorAbsen, w.namaPekerja, w.nik);
      const seatKey = `${detailPekerja}|${w.kodeSetoran}`;
      if (seenSeats.has(seatKey)) return; // another submission's row for this same seat
      seenSeats.add(seatKey);
      pekerja.push({
        id: w.id,
        nomorAbsen: w.nomorAbsen,
        namaPekerja: w.namaPekerja,
        nik: w.nik,
        kode: w.kodeSetoran,
        detailPekerja,
      });
    });
    pekerja.sort((a, b) => a.kode.localeCompare(b.kode));

    return { nomorMeja, pekerja };
  });
}

// --- Setoran pairing (List Setoran card view) ---
//
// One Tambah Setoran submission always creates exactly one Giling (numeric
// kode) row and one Batil (alpha kode) row together, sharing the same
// `transactionId` and `setoranKe` (see buildSetoranWorkers in sktApi.ts).
// This pairs those rows back up so the List Setoran section can show one
// card per submission — Giling on one side, Batil on the other — instead
// of a flat one-card-per-worker-row list.
//
// Real skt_view rows fetched from ORDS don't carry a `transactionId` (or
// `setoranKe`/tray-count) field yet — no such columns have shown up in
// that schema — so those rows fall back to chronological order within each
// role: sort each role's rows by `setoranKe` (undefined sorts last) then
// `jamMasuk`, then zip them positionally — the i-th earliest Giling row
// pairs with the i-th earliest Batil row. ASSUMPTION: confirm the real
// pairing rule with the backend team once `transactionId` (or equivalent)
// exists there too; this fallback is only as reliable as "both roles
// submit in the same relative order", which isn't guaranteed for
// older/real historical data.
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

function toPairRow(nomorMeja: number, key: string, g: SetoranWorker | null, b: SetoranWorker | null): SetoranPairRow {
  return {
    key,
    nomorMeja,
    setoranKe: g?.setoranKe ?? b?.setoranKe ?? 1,
    giling: g,
    batil: b,
    good: g?.totalSetoran ?? b?.totalSetoran ?? 0,
    bad: g?.totalDefect ?? b?.totalDefect ?? 0,
    trayCount: g?.trayCount ?? b?.trayCount ?? 0,
  };
}

export function pairSetoranByMeja(
  workers: SetoranWorker[],
  options?: { includeDeleted?: boolean }
): SetoranPairRow[] {
  const includeDeleted = options?.includeDeleted ?? false;
  const mejaNumbers = Array.from(new Set(workers.map((w) => w.nomorMeja))).sort((a, b) => a - b);

  return mejaNumbers.flatMap((nomorMeja) => {
    // Rows flagged setoranDeleted (see SetoranWorker.setoranDeleted in
    // skt.ts) are a deliberately-deleted transaction whose seat had to be
    // kept for Detail Meja's sake — excluded here so they stop producing a
    // card, but groupWorkersByMeja (the roster) never applies this filter,
    // so the seat itself still shows up there untouched. computePairSetoranKe
    // passes includeDeleted so a deleted submission's number still counts
    // toward "highest setoranKe ever used" — the running counter must never
    // reissue a number a deleted submission already used (see that function).
    const mejaWorkers = workers.filter(
      (w) => w.nomorMeja === nomorMeja && (includeDeleted || !w.setoranDeleted)
    );

    // Rows carrying a real `transactionId` pair up exactly — no positional
    // guessing needed, since the two rows of one submission share that id
    // by construction (see buildSetoranWorkers in sktApi.ts).
    const byTxn = new Map<string, SetoranWorker[]>();
    const untagged: SetoranWorker[] = [];
    mejaWorkers.forEach((w) => {
      if (!w.transactionId) {
        untagged.push(w);
        return;
      }
      byTxn.set(w.transactionId, [...(byTxn.get(w.transactionId) ?? []), w]);
    });

    const txnPairs = Array.from(byTxn.entries()).map(([transactionId, rows]) => {
      const g = rows.find((r) => workerIsGiling(r)) ?? null;
      const b = rows.find((r) => !workerIsGiling(r)) ?? null;
      return toPairRow(nomorMeja, `txn-${transactionId}`, g, b);
    });

    // Legacy fallback for rows with no `transactionId` (older local
    // entries, or skt_view rows fetched straight from ORDS) — same
    // positional-by-role pairing as before. Zipped to the SHORTER side
    // (Math.min, not Math.max) — a Setoran is a Giling+Batil pair by
    // definition, so a leftover Giling (or Batil) with no counterpart left
    // to pair with isn't a transaction at all, just an ordinary unpaired
    // roster seat, and shouldn't produce a "— " card for it.
    const untaggedSetoran = untagged.filter(isSetoranRow);
    const giling = sortForPairing(untaggedSetoran.filter((w) => workerIsGiling(w)));
    const batil = sortForPairing(untaggedSetoran.filter((w) => !workerIsGiling(w)));
    const pairCount = Math.min(giling.length, batil.length);
    const legacyPairs = Array.from({ length: pairCount }, (_, i) => {
      const g = giling[i];
      const b = batil[i];
      return toPairRow(nomorMeja, `${nomorMeja}-${g.id}-${b.id}`, g, b);
    });

    // Belt-and-suspenders: txnPairs should always come out complete (both
    // rows of one submission are created together — see buildSetoranWorkers
    // in sktApi.ts), but this guarantees NO incomplete "—" pair ever
    // reaches List Setoran regardless of source.
    return [...txnPairs, ...legacyPairs]
      .filter((p) => p.giling && p.batil)
      .sort((a, b) => {
        const aTime = a.giling?.jamMasuk ?? a.batil?.jamMasuk ?? '';
        const bTime = b.giling?.jamMasuk ?? b.batil?.jamMasuk ?? '';
        return new Date(aTime).getTime() - new Date(bTime).getTime();
      });
  });
}

// --- Delete-pekerja guard (Detail Meja) ---
//
// Blocks deleting a pekerja seat from Detail Meja once that exact person,
// in that same role, is showing up as a COMPLETE pair (both a Giling and a
// Batil side, i.e. not "—") in the List Setoran section for this meja —
// matching what the admin actually sees on screen there, card for card.
//
// Deliberately NOT gated on Good/Bad/tray quantities. List Setoran shows a
// card the moment a meja has both a Giling and Batil seated, via
// pairSetoranByMeja's positional pairing — real production
// (totalSetoran/totalDefect) is very often still 0/0 on that card at that
// point (see the "0 Selongsong Good: 0 Bad: 0" cards this guards against),
// since Tambah Pekerja alone (no Tambah Setoran run yet) already produces
// a complete pair. A worker seated alone with no counterpart yet (their
// card shows "—" on the other side) has nothing paired to orphan, so
// they stay deletable.
//
// Matched by NIK + role category (Giling vs Batil, via workerIsGiling),
// NOT by the exact kode string — see workerIsGiling's own comment above
// for why kode alone isn't reliable here (older rows, or real skt_view
// data, may not line up kode-for-kode with the roster).
export function pekerjaHasSetoran(
  workers: SetoranWorker[],
  nomorMeja: number,
  pekerja: SetoranWorker
): boolean {
  const isGiling = workerIsGiling(pekerja);
  const mejaPairs = pairSetoranByMeja(workers.filter((w) => w.nomorMeja === nomorMeja));

  return mejaPairs.some((p) => {
    if (!p.giling || !p.batil) return false; // incomplete pair — nothing to orphan
    const sameSide = isGiling ? p.giling : p.batil;
    return sameSide.nik === pekerja.nik;
  });
}

// --- Per-pair "Setoran ke" numbering ---
//
// The running "Setoran #N" number is scoped to one specific Giling+Batil
// PAIR, not the whole meja — "Role 1 + Role A" and "Role 1 + Role B" are
// different pairs (different Batil person) and each starts its own count
// at 1, even though they share the same Giling and the same meja. Identity
// is compared via buildDetailPekerja (nomor_absen - nama - nik), the same
// "who is this, really" key used elsewhere for dual-role/cross-meja checks
// — not nik alone.
//
// Called from TambahSetoranModal once both Giling and Batil are picked, to
// both preview and (on submit) stamp the real `setoranKe` for a brand-new
// submission. Not used in edit mode — re-scanning is disabled there (see
// TambahSetoranModal's isEditing), so the pair can't change and the
// original setoranKe is reused as-is.
//
// A running counter, NOT a count of surviving submissions: takes the
// highest `setoranKe` this pair has ever used (including deleted
// submissions — pairSetoranByMeja's includeDeleted) and adds 1. Counting
// survivors instead would reissue a deleted submission's number the moment
// enough other submissions got deleted to bring the count back down to it
// — e.g. #1-#4 with #2 deleted leaves 3 survivors, and count+1 = #4 again,
// colliding with the #4 that already exists.
export function computePairSetoranKe(
  workers: SetoranWorker[],
  nomorMeja: number,
  giling: { nomorAbsen: string; namaPekerja: string; nik: string },
  batil: { nomorAbsen: string; namaPekerja: string; nik: string }
): number {
  const gilingIdentity = buildDetailPekerja(giling.nomorAbsen, giling.namaPekerja, giling.nik);
  const batilIdentity = buildDetailPekerja(batil.nomorAbsen, batil.namaPekerja, batil.nik);

  const maxSetoranKe = pairSetoranByMeja(
    workers.filter((w) => w.nomorMeja === nomorMeja),
    { includeDeleted: true }
  )
    .filter(
      (p) =>
        p.giling &&
        p.batil &&
        buildDetailPekerja(p.giling.nomorAbsen, p.giling.namaPekerja, p.giling.nik) === gilingIdentity &&
        buildDetailPekerja(p.batil.nomorAbsen, p.batil.namaPekerja, p.batil.nik) === batilIdentity
    )
    .reduce((max, p) => Math.max(max, p.setoranKe), 0);

  return maxSetoranKe + 1;
}

// List Setoran sort options: by setoran sequence, Giling name or Batil name.
export type SetoranSortKey = 'setoran' | 'giling' | 'batil';

// Sorts List Setoran cards. 'setoran' orders by Setoran # then meja; the
// name sorts are alphabetical (a missing side goes last) with Setoran # as
// the tie-breaker, so one pekerja's cards stay in sequence. `descending`
// reverses the whole order.
export function sortSetoranPairs(
  pairs: SetoranPairRow[],
  key: SetoranSortKey,
  descending: boolean
): SetoranPairRow[] {
  const bySequence = (a: SetoranPairRow, b: SetoranPairRow) =>
    a.setoranKe - b.setoranKe || a.nomorMeja - b.nomorMeja;
  const byName = (side: 'giling' | 'batil') => (a: SetoranPairRow, b: SetoranPairRow) => {
    const nameA = a[side]?.namaPekerja;
    const nameB = b[side]?.namaPekerja;
    if (nameA !== nameB) {
      if (!nameA) return 1;
      if (!nameB) return -1;
      const cmp = nameA.localeCompare(nameB, 'id');
      if (cmp !== 0) return cmp;
    }
    return bySequence(a, b);
  };
  const compare = key === 'setoran' ? bySequence : byName(key);
  const sorted = [...pairs].sort(compare);
  return descending ? sorted.reverse() : sorted;
}
