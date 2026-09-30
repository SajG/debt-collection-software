import type { OrderStatus, Prisma, Profile } from "@prisma/client";
import { isFactoryReadOnlyOrder } from "./orders/status";

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

/** True when this profile may view a sales order. Matches the current
 *  RLS SELECT predicates on public."SalesOrder": ADMIN sees all,
 *  FACTORY sees all (visibility opened in migration
 *  20260826120000_require_admin_approval_all_orders — the audit-flagged
 *  cosmetic-hide bug), STAFF sees only their own. Use canActOnOrder
 *  for write / action gating. */
export function canViewOrder(
  profile: Profile,
  order: {
    salespersonId: string;
    currentStatus?: OrderStatus;
    needsRateApproval?: boolean | null;
  },
): boolean {
  if (profile.role === "ADMIN") return true;
  if (profile.role === "FACTORY") return true;
  return order.salespersonId === profile.id;
}

/** True when this profile may ADVANCE / EDIT an order. FACTORY is
 *  read-only on PENDING_APPROVAL / REJECTED / needsRateApproval — the
 *  DB trigger enforce_factory_sales_order_update refuses those writes
 *  too, but this predicate keeps the UI from offering the action. */
export function canActOnOrder(
  profile: Profile,
  order: {
    salespersonId: string;
    currentStatus?: OrderStatus;
    needsRateApproval?: boolean | null;
  },
): boolean {
  if (profile.role === "ADMIN") return true;
  if (profile.role === "FACTORY") {
    if (order.currentStatus == null) return true;
    return !isFactoryReadOnlyOrder({
      currentStatus: order.currentStatus,
      needsRateApproval: order.needsRateApproval,
    });
  }
  return order.salespersonId === profile.id;
}

/** @deprecated Use canViewOrder (view gate) or canActOnOrder (write
 *  gate) explicitly. Kept as an alias for canViewOrder so existing
 *  callers stop hiding pending / needsRateApproval rows from FACTORY;
 *  action buttons should switch to canActOnOrder. */
export function canAccessOrder(
  profile: Profile,
  order: {
    salespersonId: string;
    currentStatus?: OrderStatus;
    needsRateApproval?: boolean | null;
  },
): boolean {
  return canViewOrder(profile, order);
}
