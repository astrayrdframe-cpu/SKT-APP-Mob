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
  nama_brak: string;
}
