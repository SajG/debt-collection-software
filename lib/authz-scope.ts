import type { Prisma, Profile } from "@prisma/client";

// Pure predicates split out of lib/authz.ts so tests can import them
// without pulling in next/headers via the Supabase server client.
// Callers should keep importing from "@/lib/authz" — this file is
// wired up as a re-export from there.

/**
 * Row-visibility rule used by every Party query (and, via `party: {...}`,
 * every invoice/payment/action query). MUST match the RLS predicate on
 * public."Party" exactly — otherwise the same user sees different data
 * on web vs mobile.
 *
 * RLS (see prisma/migrations/20260811170000_rls_mobile_access):
 *   party_select_staff    → "assignedToId" = auth.uid()
 *   party_select_admin    → true (via current_user_role() = 'ADMIN')
 *   party_select_factory  → true (via current_user_role() = 'FACTORY')
 *
 * Do NOT re-add `assignedToId: null` here to make unassigned parties
 * visible on the web. The correct fix for an unassigned pool is
 * /admin/unassigned, which is admin-only, not by loosening scope for
 * every salesperson.
 */
export function partyScopeWhere(profile: Profile): Prisma.PartyWhereInput {
  if (profile.role === "ADMIN" || profile.role === "FACTORY") return {};
  return { assignedToId: profile.id };
}

/** True when this profile may act on the given party. Kept in
 *  lockstep with the RLS SELECT predicate above. */
export function canAccessParty(
  profile: Profile,
  party: { assignedToId: string | null },
): boolean {
  if (profile.role === "ADMIN" || profile.role === "FACTORY") return true;
  return party.assignedToId === profile.id;
}

/** True when this profile may view a sales order. Matches the RLS
 *  SELECT predicates on public."SalesOrder". */
export function canAccessOrder(
  profile: Profile,
  order: { salespersonId: string },
): boolean {
  if (profile.role === "ADMIN" || profile.role === "FACTORY") return true;
  return order.salespersonId === profile.id;
}
