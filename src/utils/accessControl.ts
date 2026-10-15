import type { ISktUser } from '../interface/userInterface';

// Two-level visibility, applied in order:
//
//   1. Dashboard — SKT Headers are scoped by Brak and MK: an MK account
//      only sees headers whose skt_master_brak_id (SKTHeaderItem.brakId)
//      matches its own login brak_id AND whose nama_mk_assigned lists its
//      MK (SKTHeaderItem.mkAssigned / mkAssignedIds). See canAccessHeader.
//   2. Header detail — inside a header, meja are scoped by MK: an MK
//      account only sees the meja assigned to its own login mk_id, read
//      off skt_view's per-row mk_id (SetoranWorker.mkId). See
//      getVisibleMejaNumbers.
//
// ADMIN accounts (skt_akses_admin — no mk_id/brak_id at all) are super
// users and skip both checks. Every other account fails closed: a missing
// brak_id/mk_id on the user, or a missing mk_id on the data, means nothing
// is visible rather than everything.

type AccessUser = Pick<ISktUser, 'role' | 'mk_id' | 'brak_id' | 'username'> | null | undefined;

export function isSuperUser(user: AccessUser): boolean {
  return user?.role === 'ADMIN';
}

export function canAccessHeader(
  user: AccessUser,
  header: { brakId: number | null; mkAssigned?: string[]; mkAssignedIds?: number[] }
): boolean {
  if (isSuperUser(user)) return true;
  if (user?.brak_id === null || user?.brak_id === undefined) return false;
  if (header.brakId !== user.brak_id) return false;
  // Cached before nama_mk_assigned was stored — Brak check only until the
  // next "Get Data" fills it in.
  if (!header.mkAssigned) return true;
  // The MK is matched by id (nama_mk_assigned resolved via skt_view), or
  // by name when the login's username is the MK name itself.
  if (user.mk_id != null && header.mkAssignedIds?.includes(user.mk_id)) return true;
  return !!user.username && header.mkAssigned.includes(user.username.trim().toUpperCase());
}

// Which Braks' skt_view rows to download for this user (skt_view is
// queried per BRAK_ID, see fetchSktViewRows in services/API/sktApi.ts).
// null means every Brak (super user); an MK login gets only its own, or
// none if it has no brak_id.
export function getBrakScope(user: AccessUser): number[] | null {
  if (isSuperUser(user)) return null;
  return user?.brak_id === null || user?.brak_id === undefined ? [] : [user.brak_id];
}

// getVisibleMejaNumbers plus the meja this login has seen on the header
// before (knownMejaCacheKey in services/Offline/persistence.ts). A meja
// whose server rows were all deleted and then refilled on the device has
// only local rows, which carry no mk_id — without this it would drop out
// of the user's meja (Detail, Summary, and Post would skip its setoran).
export function withKnownMeja(
  visible: Set<number> | null,
  knownMeja: number[] | null | undefined
): Set<number> | null {
  return visible ? new Set([...visible, ...(knownMeja ?? [])]) : null;
}

// Which meja numbers this user may see within one header's workers. null
// means "all of them" (super user). A meja counts as the user's if ANY of
// its rows lists the user's mk_id (mkIds — a meja can be assigned to
// several MKs — or the older single mkId), and then every row at that meja
// is visible — so rows added locally (Tambah Pekerja / Tambah Setoran,
// which don't carry an MK yet) stay visible at a meja the user already owns.
export function getVisibleMejaNumbers(
  user: AccessUser,
  workers: { nomorMeja: number; mkId?: number | null; mkIds?: number[] }[]
): Set<number> | null {
  if (isSuperUser(user)) return null;
  const visible = new Set<number>();
  if (user?.mk_id === null || user?.mk_id === undefined) return visible;
  const mkId = user.mk_id;
  for (const w of workers) {
    if (w.mkId === mkId || w.mkIds?.includes(mkId)) visible.add(w.nomorMeja);
  }
  return visible;
}
