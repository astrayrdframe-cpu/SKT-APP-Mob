import { SKTDetail, SKTHeaderItem, SetoranWorker } from '../skt';
import { ISktUser } from '../../interface/userInterface';
import {
  loadFromCache,
  saveToCache,
  CACHE_KEYS,
  sktDetailCacheKey,
} from '../Offline/persistence';
import {
  canAccessHeader,
  getVisibleMejaNumbers,
} from '../../utils/accessControl';
import { workerIsGiling } from '../../utils/mejaGrouping';
import { SKT_API_URL } from '../../config/api';
import { MasterPekerja } from '../pekerja';
import { fetchServerSeats } from './sktApi';

// Custom ORDS PL/SQL handler (POST /skt/skt_header, raw JSON body) that
// stores setoran per log_pekerja — NOT a skt_header row insert, despite the
// path. It validates the body itself and answers errors as
// { "status": "error", "message": ... } with a 4xx code, e.g.
// "log_pekerja wajib diisi" (400) or "SKT Header ID 0 tidak ditemukan" (404).
const SKT_SETORAN_POST_ENDPOINT = `${SKT_API_URL}/skt_header`;

// Custom ORDS handler (POST only) that adds one pekerja seat to a header.
// Post calls it for each Giling and Batil seat of a setoran that was
// created on the device (Tambah Pekerja) and isn't on the server, before
// sending that header's setoran, so the setoran can reference the new
// Giling seat's skt_log_pekerja_id and the Batil seat it names exists.
const SKT_LOG_PEKERJA_POST_ENDPOINT = `${SKT_API_URL}/skt_log_pekerja`;

export interface LogPekerjaPostBody {
  skt_header_id: number;
  created_by: string;
  skt_master_pekerja_id: number;
  is_training: 0;
  nomor_meja: number;
  skt_kode_setoran_id: number; // see KODE_SETORAN_ID
  jam_masuk: null;
  jam_keluar: null;
}

// skt_kode_setoran_id for each seat role assigned on the device. The
// handler only accepts the numeric id ("B" is rejected as
// "skt_kode_setoran_id wajib diisi").
const KODE_SETORAN_ID: Record<string, number> = {
  '1': 1,
  '2': 2,
  '3': 3,
  A: 4,
  B: 5,
};

// Request body — one per SKT header. Each log_pekerja entry is a GILING
// seat (its skt_log_pekerja_id from skt_view); each setoran under it is
// one Giling+Batil submission, with batil_posisi naming the paired Batil
// seat (A/B). The Batil seat isn't posted separately, so Good/Defect is
// sent once per setoran.
export interface SetoranPostBody {
  skt_header_id: number;
  created_by: string;
  log_pekerja: {
    skt_log_pekerja_id: number;
    setoran: {
      setoran_ke: number;
      batil_posisi: string;
      jumlah_setoran: number;
      jumlah_defect: number;
    }[];
  }[];
}

interface CachedDetail {
  detail: SKTDetail;
  workers: SetoranWorker[];
}

type Pair = { giling: SetoranWorker; batil: SetoranWorker };

// A Giling or Batil seat that wasn't in the previous Get Data (created on the device
// by Tambah Pekerja) and has to be added via skt/skt_log_pekerja before its
// setoran can be sent.
interface NewSeat {
  key: string; // seatKey(...)
  nomorMeja: number;
  kode: string;
  nik: string;
  namaPekerja: string;
  masterPekerjaId: number;
}

// One header ready to send: its validated pairs (each with its seat's
// server id, or null when the seat is in newSeats and only gets its id at
// send time), plus which cached rows to flag as posted once the server
// confirms.
interface PreparedHeader {
  headerId: number;
  brakId: number;
  pairs: (Pair & { seatId: number | null })[];
  newSeats: NewSeat[];
  rowIds: Set<number>;
  setoranCount: number;
}

export interface SetoranPostResult {
  // Validation problems found before anything was sent. Non-empty means
  // NOTHING was posted (see postPendingSetoran).
  validationErrors: string[];
  // Setoran held back because one of its seats was created on the device
  // and can't be added to the server: its pekerja isn't in the cached
  // master pekerja list (no skt_master_pekerja_id to send). Not an error:
  // they stay unposted and go out on a later Post.
  waiting: string[];
  // Giling/Batil seats added to the server via skt/skt_log_pekerja during this
  // Post, e.g. "Header 5982, Meja 1, kode 3: CINDY OLIVIA".
  addedSeats: string[];
  posted: { headerId: number; setoranCount: number }[];
  failed: { headerId: number; setoranCount: number; error: string }[];
}

// Identifies a seat: same meja, same kode, same person.
const seatKey = (nomorMeja: number, kode: string, nik: string) =>
  `${nomorMeja}|${kode}|${nik}`;

// The server id of one side's seat, from the cache (= the previous Get
// Data): its own sktLogPekerjaId, else a skt_view seat row at the same
// meja/kode/NIK. Null means the seat isn't on the server as far as the last
// Get Data knows.
function cachedSeatId(
  side: SetoranWorker,
  workers: SetoranWorker[],
): number | null {
  if (side.sktLogPekerjaId) return side.sktLogPekerjaId;
  const key = seatKey(side.nomorMeja, side.kodeSetoran, side.nik);
  const serverSeat = workers.find(
    w =>
      !w.transactionId &&
      !!w.sktLogPekerjaId &&
      seatKey(w.nomorMeja, w.kodeSetoran, w.nik) === key,
  );
  return serverSeat?.sktLogPekerjaId ?? null;
}

// "MOBILE_APP <mk_id>", e.g. "MOBILE_APP 241".
export function setoranCreatedBy(
  user: Pick<ISktUser, 'mk_id' | 'username'>,
): string {
  return `MOBILE_APP ${user.mk_id ?? user.username}`;
}

// Whether a header's cached rows include any posted setoran — such a
// header is locked against "Get Data" replacing or deleting it.
export function hasPostedSetoran(
  workers: SetoranWorker[] | undefined,
): boolean {
  return !!workers?.some(w => !!w.postedAt);
}

// Groups one header's rows into Giling+Batil submissions (by
// transactionId) that this user may post: not yet posted, not deleted,
// both sides present, and at a meja the user can see.
function eligiblePairs(
  workers: SetoranWorker[],
  visibleMeja: Set<number> | null,
): Pair[] {
  const byTxn = new Map<string, SetoranWorker[]>();
  for (const w of workers) {
    if (!w.transactionId || w.postedAt || w.setoranDeleted) continue;
    if (visibleMeja && !visibleMeja.has(w.nomorMeja)) continue;
    byTxn.set(w.transactionId, [...(byTxn.get(w.transactionId) ?? []), w]);
  }
  const pairs: Pair[] = [];
  byTxn.forEach(rows => {
    const giling = rows.find(r => workerIsGiling(r));
    const batil = rows.find(r => !workerIsGiling(r));
    if (giling && batil) pairs.push({ giling, batil });
  });
  return pairs;
}

function prepareHeader(
  header: SKTHeaderItem,
  pairs: Pair[],
  workers: SetoranWorker[],
  masterByNik: Map<string, MasterPekerja>,
  errors: string[],
  waiting: string[],
): PreparedHeader | null {
  const prepared: PreparedHeader['pairs'] = [];
  const newSeats = new Map<string, NewSeat>();
  const rowIds = new Set<number>();
  const errorCountBefore = errors.length;

  for (const { giling, batil } of pairs) {
    const label = `Header ${header.id}, Meja ${giling.nomorMeja}, Setoran #${
      giling.setoranKe ?? '?'
    } (${giling.namaPekerja} + ${batil.namaPekerja})`;
    if (batil.kodeSetoran !== 'A' && batil.kodeSetoran !== 'B') {
      errors.push(`${label}: posisi Batil "${batil.kodeSetoran}" bukan A/B.`);
      continue;
    }
    if (!giling.setoranKe) {
      errors.push(`${label}: nomor setoran tidak ada.`);
      continue;
    }

    // Seats not in the previous Get Data must be added first — both sides,
    // each under the role it was assigned locally. If either side's
    // pekerja can't be resolved, the whole setoran waits.
    const seatId = cachedSeatId(giling, workers);
    const pending: NewSeat[] = [];
    let missing: SetoranWorker | null = null;
    let invalid = false;
    for (const side of [giling, batil]) {
      if (cachedSeatId(side, workers) !== null) continue;
      const key = seatKey(side.nomorMeja, side.kodeSetoran, side.nik);
      if (newSeats.has(key)) continue;
      if (!(side.kodeSetoran in KODE_SETORAN_ID)) {
        errors.push(
          `${label}: kode "${side.kodeSetoran}" (${side.namaPekerja}) tidak punya skt_kode_setoran_id.`,
        );
        invalid = true;
        break;
      }
      // The device-created seat row carries masterPekerjaId; seats cached
      // before that field existed fall back to the master list by NIK.
      const seatRow = workers.find(
        w =>
          !w.transactionId &&
          seatKey(w.nomorMeja, w.kodeSetoran, w.nik) === key,
      );
      const masterPekerjaId =
        seatRow?.masterPekerjaId ??
        side.masterPekerjaId ??
        masterByNik.get(side.nik)?.id;
      if (!masterPekerjaId) {
        missing = side;
        break;
      }
      pending.push({
        key,
        nomorMeja: side.nomorMeja,
        kode: side.kodeSetoran,
        nik: side.nik,
        namaPekerja: side.namaPekerja,
        masterPekerjaId,
      });
    }
    if (invalid) continue;
    if (missing) {
      console.warn('[skt_log_pekerja] not assigned: no master pekerja', {
        headerId: header.id,
        nomorMeja: missing.nomorMeja,
        kode: missing.kodeSetoran,
        nik: missing.nik,
        namaPekerja: missing.namaPekerja,
      });
      waiting.push(
        `${label}: ${missing.namaPekerja} (${missing.nik}) tidak ada di master pekerja.`,
      );
      continue;
    }
    pending.forEach(seat => newSeats.set(seat.key, seat));

    prepared.push({ giling, batil, seatId });
    rowIds.add(giling.id);
    rowIds.add(batil.id);
  }

  if (errors.length > errorCountBefore || prepared.length === 0) return null;

  return {
    headerId: header.id,
    brakId: header.brakId,
    pairs: prepared,
    newSeats: Array.from(newSeats.values()),
    rowIds,
    setoranCount: prepared.length,
  };
}

// Builds the setoran body once every seat has its server id. `newSeatIds`
// holds the ids of the seats ensureServerSeats just added or found.
function buildBody(
  item: PreparedHeader,
  createdBy: string,
  newSeatIds: Map<string, number>,
): SetoranPostBody {
  const bySeat = new Map<
    number,
    SetoranPostBody['log_pekerja'][number]['setoran']
  >();
  for (const { giling, batil, seatId } of item.pairs) {
    const id =
      seatId ??
      newSeatIds.get(
        seatKey(giling.nomorMeja, giling.kodeSetoran, giling.nik),
      )!;
    bySeat.set(id, [
      ...(bySeat.get(id) ?? []),
      {
        setoran_ke: giling.setoranKe!,
        batil_posisi: batil.kodeSetoran,
        jumlah_setoran: giling.totalSetoran ?? 0,
        jumlah_defect: giling.totalDefect ?? 0,
      },
    ]);
  }
  return {
    skt_header_id: item.headerId,
    created_by: createdBy,
    log_pekerja: Array.from(bySeat.entries()).map(
      ([skt_log_pekerja_id, setoran]) => ({
        skt_log_pekerja_id,
        setoran: setoran.sort(
          (a, b) =>
            a.setoran_ke - b.setoran_ke ||
            a.batil_posisi.localeCompare(b.batil_posisi),
        ),
      }),
    ),
  };
}

// A failed POST, with what's needed to trace it: the HTTP status (0 = no
// response at all, e.g. offline) and the raw response text.
class PostError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseText: string,
  ) {
    super(message);
  }
}

// POSTs a JSON body to a custom ORDS handler, which answers errors as
// { "status": "error", "message": ... } with a 4xx code.
async function postJson(url: string, body: unknown): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error: any) {
    throw new PostError(error?.message || 'Network request failed', 0, '');
  }
  const text = await response.text().catch(() => '');
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON (e.g. an ORDS HTML error page) — kept in responseText.
  }
  if (!response.ok || data?.status === 'error') {
    throw new PostError(
      data?.message || `HTTP ${response.status}`,
      response.status,
      text,
    );
  }
  return data;
}

// Builds a traceable error for a seat that couldn't be assigned on the
// server: which header/meja/kode/pekerja, the request body sent, and the
// server's status and response. Also logged to the console (Metro /
// logcat) in full, since the alert shortens the response.
function seatAssignError(
  seat: NewSeat,
  headerId: number,
  reason: string,
  body: LogPekerjaPostBody | null,
  error?: unknown,
): Error {
  const status = error instanceof PostError ? error.status : undefined;
  const responseText = error instanceof PostError ? error.responseText : '';
  const lines = [
    `Gagal assign pekerja ${seat.namaPekerja} (NIK ${seat.nik}, master id ${seat.masterPekerjaId}) ke Header ${headerId}, Meja ${seat.nomorMeja}, kode ${seat.kode}.`,
    `Alasan: ${reason}`,
    status !== undefined
      ? `HTTP: ${status === 0 ? 'tidak ada respons (jaringan)' : status}`
      : '',
    responseText ? `Respons: ${responseText.slice(0, 300)}` : '',
    body ? `Body: ${JSON.stringify(body)}` : '',
  ].filter(Boolean);
  console.error('[skt_log_pekerja] assign failed', {
    headerId,
    seat,
    reason,
    status,
    responseText,
    body,
  });
  return new Error(lines.join('\n'));
}

// Writes a seat's new server id onto its cached rows — the seat row and
// every setoran row at that seat — so a later Post, or a retry after
// a failure, never adds the same seat again.
async function stampSeatId(headerId: number, key: string, id: number) {
  const cacheKey = sktDetailCacheKey(headerId);
  const cached = await loadFromCache<CachedDetail>(cacheKey);
  if (!cached) return;
  await saveToCache(cacheKey, {
    ...cached,
    workers: cached.workers.map(w =>
      !w.sktLogPekerjaId && seatKey(w.nomorMeja, w.kodeSetoran, w.nik) === key
        ? { ...w, sktLogPekerjaId: id }
        : w,
    ),
  });
}

// Makes sure every new seat of a header exists on the server and returns
// their ids. The live skt_view is checked first (the seat may have been
// added since the last Get Data, e.g. by an earlier Post whose setoran
// then failed); only seats missing there are added via skt_log_pekerja.
// The new id is read from the response, or looked up in skt_view again if
// the response doesn't carry it. Throws on the first seat that fails.
async function ensureServerSeats(
  item: PreparedHeader,
  createdBy: string,
  added: string[],
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  if (item.newSeats.length === 0) return ids;

  const fetchLive = async () =>
    new Map(
      (await fetchServerSeats(item.brakId, item.headerId)).map(s => [
        seatKey(s.nomorMeja, s.kodeSetoran, s.nik),
        s.sktLogPekerjaId,
      ]),
    );
  let live: Map<string, number>;
  try {
    live = await fetchLive();
  } catch (error: any) {
    throw seatAssignError(
      item.newSeats[0],
      item.headerId,
      `cek skt_view sebelum assign gagal: ${error?.message}`,
      null,
      error,
    );
  }

  for (const seat of item.newSeats) {
    let id = live.get(seat.key);
    if (!id) {
      const body: LogPekerjaPostBody = {
        skt_header_id: item.headerId,
        created_by: createdBy,
        skt_master_pekerja_id: seat.masterPekerjaId,
        is_training: 0,
        nomor_meja: seat.nomorMeja,
        skt_kode_setoran_id: KODE_SETORAN_ID[seat.kode],
        jam_masuk: null,
        jam_keluar: null,
      };
      let data: any;
      try {
        data = await postJson(SKT_LOG_PEKERJA_POST_ENDPOINT, body);
      } catch (error: any) {
        throw seatAssignError(
          seat,
          item.headerId,
          `POST skt_log_pekerja ditolak: ${error?.message}`,
          body,
          error,
        );
      }
      const returned = Number(data?.skt_log_pekerja_id ?? data?.id);
      if (returned > 0) {
        id = returned;
      } else {
        try {
          live = await fetchLive();
        } catch (error: any) {
          throw seatAssignError(
            seat,
            item.headerId,
            `POST berhasil, tetapi cek skt_view untuk id kursi gagal: ${error?.message}. Respons POST: ${JSON.stringify(data)}`,
            body,
            error,
          );
        }
        id = live.get(seat.key);
      }
      if (!id) {
        throw seatAssignError(
          seat,
          item.headerId,
          `POST berhasil, tetapi id kursi tidak ada di respons maupun di skt_view. Respons POST: ${JSON.stringify(data)}`,
          body,
        );
      }
      added.push(
        `Header ${item.headerId}, Meja ${seat.nomorMeja}, kode ${seat.kode}: ${seat.namaPekerja}`,
      );
    }
    ids.set(seat.key, id);
    await stampSeatId(item.headerId, seat.key, id);
  }
  return ids;
}

/**
 * "Post" — sends every eligible, not-yet-posted setoran of the logged-in
 * user to the server, from the local cache only:
 *
 * 1. Collect: headers the user can access (Brak), and within each, only
 *    setoran at meja assigned to the user's mk_id (see accessControl.ts).
 * 2. Validate ALL headers first. If any setoran is invalid (Batil
 *    position not A/B, no setoran number), nothing at all is sent. A
 *    Giling or Batil seat that wasn't in the previous Get Data is not an
 *    error — it's queued to be added first (step 3); only if its pekerja
 *    has no skt_master_pekerja_id is that setoran held back in `waiting`.
 * 3. Per header: add its new seats via skt/skt_log_pekerja, then
 *    send one setoran POST (the server commits each header atomically).
 *    Only after a header's POST succeeds are its rows flagged `postedAt`
 *    in the cache; a failed header stays unflagged and is retried on the
 *    next Post, so nothing is ever sent twice. Seats added before a
 *    failure keep their new id in the cache and aren't added again.
 */
export async function postPendingSetoran(
  user: ISktUser,
): Promise<SetoranPostResult> {
  const result: SetoranPostResult = {
    validationErrors: [],
    waiting: [],
    addedSeats: [],
    posted: [],
    failed: [],
  };
  const createdBy = setoranCreatedBy(user);
  const headers = (
    (await loadFromCache<SKTHeaderItem[]>(CACHE_KEYS.SKT_LIST)) ?? []
  ).filter(h => canAccessHeader(user, h));
  const masterByNik = new Map(
    (
      (await loadFromCache<MasterPekerja[]>(CACHE_KEYS.MASTER_PEKERJA)) ?? []
    ).map(p => [p.nik, p]),
  );

  const prepared: PreparedHeader[] = [];
  for (const header of headers) {
    const cached = await loadFromCache<CachedDetail>(
      sktDetailCacheKey(header.id),
    );
    if (!cached) continue;
    const pairs = eligiblePairs(
      cached.workers,
      getVisibleMejaNumbers(user, cached.workers),
    );
    if (pairs.length === 0) continue;
    const ready = prepareHeader(
      header,
      pairs,
      cached.workers,
      masterByNik,
      result.validationErrors,
      result.waiting,
    );
    if (ready) prepared.push(ready);
  }

  // Roll back before anything is committed: one invalid setoran anywhere
  // means no header is sent.
  if (result.validationErrors.length > 0) return result;

  for (const item of prepared) {
    try {
      const newSeatIds = await ensureServerSeats(
        item,
        createdBy,
        result.addedSeats,
      );
      await postJson(
        SKT_SETORAN_POST_ENDPOINT,
        buildBody(item, createdBy, newSeatIds),
      );
    } catch (error: any) {
      result.failed.push({
        headerId: item.headerId,
        setoranCount: item.setoranCount,
        error: error?.message || 'Gagal mengirim',
      });
      continue;
    }
    // Commit locally only now that the server has confirmed this header.
    const key = sktDetailCacheKey(item.headerId);
    const cached = await loadFromCache<CachedDetail>(key);
    if (cached) {
      const postedAt = new Date().toISOString();
      await saveToCache(key, {
        ...cached,
        workers: cached.workers.map(w =>
          item.rowIds.has(w.id) ? { ...w, postedAt } : w,
        ),
      });
    }
    result.posted.push({
      headerId: item.headerId,
      setoranCount: item.setoranCount,
    });
  }

  return result;
}
