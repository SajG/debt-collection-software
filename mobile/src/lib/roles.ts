import type { Role } from "./database.types";

// SY24 — mirror of web lib/roles.ts. Mobile can't import from ../..
// so we keep a copy; both files must move together. See the web
// version for the reasoning.

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Management",
  STAFF: "Sales",
  FACTORY: "Factory",
};

export const ROLE_HINT: Record<Role, string> = {
  ADMIN: "sees everything, approves orders, manages team",
  STAFF: "places orders, records payments, follows up with their customers",
  FACTORY: "sees orders to produce and dispatch",
};

export function roleLabel(role: Role | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABEL[role];
}
