import type { ISktUser } from '../interface/userInterface';

// Two-level visibility, applied in order:
//
//   1. Dashboard — SKT Headers are scoped by Brak: an MK account only sees
//      headers whose skt_master_brak_id (SKTHeaderItem.brakId) matches its
//      own login brak_id. See canAccessHeader.
//   2. Header detail — inside a header, meja are scoped by MK: an MK
//      account only sees the meja assigned to its own login mk_id, read
//      off skt_view's per-row mk_id (SetoranWorker.mkId). See
//      getVisibleMejaNumbers.
//
// ADMIN accounts (skt_akses_admin — no mk_id/brak_id at all) are super
// users and skip both checks. Every other account fails closed: a missing
// brak_id/mk_id on the user, or a missing mk_id on the data, means nothing
// is visible rather than everything.

type AccessUser = Pick<ISktUser, 'role' | 'mk_id' | 'brak_id'> | null | undefined;

export function isSuperUser(user: AccessUser): boolean {
  return user?.role === 'ADMIN';
}

export function canAccessHeader(user: AccessUser, header: { brakId: number | null }): boolean {
  if (isSuperUser(user)) return true;
  if (user?.brak_id === null || user?.brak_id === undefined) return false;
  return header.brakId === user.brak_id;
}

// Which Braks' skt_view rows to download for this user (skt_view is
// queried per BRAK_ID, see fetchSktViewRows in services/API/sktApi.ts).
// null means every Brak (super user); an MK login gets only its own, or
// none if it has no brak_id.
export function getBrakScope(user: AccessUser): number[] | null {
  if (isSuperUser(user)) return null;
  return user?.brak_id === null || user?.brak_id === undefined ? [] : [user.brak_id];
}

// Which meja numbers this user may see within one header's workers. null
// means "all of them" (super user). A meja counts as the user's if ANY of
// its rows carries the user's mk_id, and then every row at that meja is
// visible — so rows added locally (Tambah Pekerja / Tambah Setoran, which
// don't carry mkId yet) stay visible at a meja the user already owns.
export function getVisibleMejaNumbers(
  user: AccessUser,
  workers: { nomorMeja: number; mkId?: number | null }[]
): Set<number> | null {
  if (isSuperUser(user)) return null;
  const visible = new Set<number>();
  if (user?.mk_id === null || user?.mk_id === undefined) return visible;
  for (const w of workers) {
    if (w.mkId === user.mk_id) visible.add(w.nomorMeja);
  }
  return visible;
}
