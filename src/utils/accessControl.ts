// Visibility rule for SKT Header records, scoped by
// skt_template_header_mk_id (see SKTHeaderItem.templateHeaderMkId in
// services/skt.ts). A logged-in user's own MK id comes from /auth/login
// (see ISktUser.skt_template_header_mk_id in interface/userInterface.ts)
// — ASSUMPTION: the backend doesn't actually send that field yet, so
// every real session currently has it undefined.
//
// A user with NO MK id on their own account (null/undefined — e.g. no
// MK assigned, an admin/super-user role, or a session predating this
// field) is a super user and can see every header, unfiltered. A user
// WITH an MK id can only see headers whose own templateHeaderMkId
// matches theirs exactly.
export function canAccessHeader(
  userMkId: number | null | undefined,
  header: { templateHeaderMkId: number | null }
): boolean {
  if (userMkId === null || userMkId === undefined) return true;
  return header.templateHeaderMkId === userMkId;
}
