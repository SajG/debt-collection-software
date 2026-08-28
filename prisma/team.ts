import type { Role } from "@prisma/client";

export type TeamRow = {
  ownerName: string;
  role: Role;
  /** 10-digit local number or "PENDING" for rows we intentionally skip. */
  phone: string;
  /**
   * Real deliverable email address. Nullable during backfill — Sajal
   * has to collect these one by one. Do NOT invent addresses (no
   * @synworks.local, no @paytrack.test, nothing ending in .local /
   * .test / .invalid / .internal). Any fake domain is rejected by
   * the CHECK constraint on Profile.email + the createUserAction /
   * scripts/backfill-team-emails.ts validators, so a synthetic value
   * would fail at DB insert anyway.
   *
   * Fill by running:
   *   npm run backfill:team-emails -- --csv <phone,email csv path>
   * See scripts/backfill-team-emails.ts.
   */
  email?: string | null;
  note?: string;
};

export const TEAM: TeamRow[] = [
  // TODO(email): collect real email addresses from every team member
  // before removing the enrollment-code path (SY12 depends on it).
  { ownerName: "Vaibhav Ghatpande", role: "ADMIN",   phone: "9371635315", email: null },
  { ownerName: "Sajal Ghatpande",   role: "ADMIN",   phone: "7774055316", email: null },

  { ownerName: "Chaitanya Deshpande", role: "FACTORY", phone: "8626010898", email: null },
  { ownerName: "Mahesh Jadhav",       role: "FACTORY", phone: "9604558658", email: null },
  {
    ownerName: "Seema Patil",
    role: "FACTORY",
    phone: "9921336535",
    email: null,
    note: "accountant; needs order rates for invoicing",
  },
  { ownerName: "Sachin Haveli",       role: "FACTORY", phone: "9923139100", email: null },
  { ownerName: "Pooja Jadhav",        role: "FACTORY", phone: "9356060196", email: null },

  { ownerName: "Sanjay Thorat",   role: "STAFF", phone: "9552670106", email: null },
  { ownerName: "Vikas Chaudhari", role: "STAFF", phone: "7020791094", email: null },
  { ownerName: "Sunil Karle",     role: "STAFF", phone: "7709545662", email: null },
  { ownerName: "Irshad Jamadar",  role: "STAFF", phone: "9158464446", email: null },
  { ownerName: "Om Sharma",       role: "STAFF", phone: "9822569216", email: null },
  { ownerName: "Monesh Pattar",   role: "STAFF", phone: "9901112508", email: null },
  { ownerName: "Sunil Gaikwad",   role: "STAFF", phone: "9975370106", email: null },
  { ownerName: "Nitin Kosandar",  role: "STAFF", phone: "7028166235", email: null },
];

export const PHONE_10 = /^[6-9]\d{9}$/;

export function toE164(local: string): string {
  return `+91${local}`;
}
