import type { Role } from "@prisma/client";

// SY24 — one label map for the three roles. DB values stay
// ADMIN/STAFF/FACTORY; users see "Management" / "Sales" / "Factory".
// Import ROLE_LABEL wherever you're rendering a user-visible role
// string. When you catch an "Admin" or "Staff" literal in the UI,
// replace it with ROLE_LABEL[role].

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Management",
  STAFF: "Sales",
  FACTORY: "Factory",
};

// Short one-line descriptions used in the onboarding wizard, admin
// user table, and role pickers. Kept next to the label map so
// copy doesn't drift.
export const ROLE_HINT: Record<Role, string> = {
  ADMIN: "sees everything, approves orders, manages team",
  STAFF: "places orders, records payments, follows up with their customers",
  FACTORY: "sees orders to produce and dispatch",
};

/** Cast-safe display for values that MIGHT be null (e.g. Profile.role
 *  during onboarding). Returns "—" instead of crashing on null. */
export function roleLabel(role: Role | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABEL[role];
}
