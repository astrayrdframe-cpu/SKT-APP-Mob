export interface IUserRole {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IOrganization {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  organization_code: string;
  organization_id: string;
  organization_name: string;
  org_name: string;
  org_id: string;
  organization_type: string;
  region_code: string;
  address: string;
  location_id: string;
  start_date_active: string;
  end_date_active: string | null;
}

export interface IUserDetail {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  userId: string;
  departementId: string | null;
  employee_id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  organization: IOrganization;
  organizationId: string;
  warehouse_sub_id: string | null;
}

export interface IUser {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  username: string;
  password: string;
  isActive: boolean;
  role: IUserRole;
  roleId: number;
  userDetail: IUserDetail;
}

// Shape actually returned by the ORDS `/auth/login` endpoint's `data`
// object — much flatter than IUser above (which models a different,
// unused backend shape). Kept separate rather than merged into IUser so
// callers reading real login responses get accurate field names/types.
export interface ISktUser {
  username: string;
  // 'ADMIN' (from skt_akses_admin — no mk_id/brak_id, always super user)
  // or 'MK' (from skt_mobile_user — scoped to their own mk_id/brak_id).
  // role === 'ADMIN' is what isSuperUser in utils/accessControl.ts keys
  // off to skip both the Brak and MK filters.
  role: 'ADMIN' | 'MK' | string;
  nama_brak: string;
  // Numeric id behind nama_brak (skt_master_brak.id via skt_mobile_user.
  // brak_id) — null for ADMIN logins, which don't join skt_master_brak.
  // Scopes which SKT Headers the Dashboard lists (see canAccessHeader).
  brak_id: number | null;
  // Which MK ("Mandor Kepala") this account is — matched against each
  // skt_view row's mk_id (SetoranWorker.mkId in services/skt.ts) to decide
  // which meja inside a header the account can see (see
  // getVisibleMejaNumbers in utils/accessControl.ts). Headers themselves
  // are scoped by brak_id above, not by this. null for ADMIN accounts
  // (super users); an MK account with no mk_id assigned sees no meja.
  mk_id: number | null;
  // 1 if this account must change its password before continuing, 0
  // otherwise. Not currently enforced anywhere in the app — captured so a
  // forced-change screen can be added later without another login change.
  must_change_password: number;
}
