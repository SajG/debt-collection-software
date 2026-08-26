// Bootstrap login shortcut for the internal Synergy Bonding team.
//
// Every phone number in TEST_LOGIN_PHONES can log in by entering
// TEST_LOGIN_CODE ("123456") on the verify screen. Under the hood we
// don't verify a real SMS OTP — we call signInWithPassword using the
// phone number as its own password. Passwords were seeded once on prod
// by `npm run enable:test-login` (scripts/enable-test-login.ts).
//
// SECURITY NOTE: anyone who knows a team member's phone can log in as
// them. This is a deliberate downgrade during the bootstrap phase
// while real SMS OTP delivery is unreliable. Revisit before opening
// the app to non-team users.

import { supabase } from "@/lib/supabase";

export const TEST_LOGIN_CODE = "123456";

// E.164 numbers of every user allowed to log in with TEST_LOGIN_CODE.
// Keep in sync with scripts/enable-test-login.ts (the source of truth
// for which auth passwords are set on prod).
export const TEST_LOGIN_PHONES: readonly string[] = [
  "+919371635315", // Vaibhav Ghatpande — ADMIN
  "+917774055316", // Sajal Ghatpande — ADMIN
  "+918626010898", // Chaitanya Deshpande — FACTORY
  "+919604558658", // Mahesh Jadhav — FACTORY
  "+919921336535", // Seema Patil — FACTORY (accountant)
  "+919923139100", // Sachin Haveli — FACTORY
  "+919356060196", // Pooja Jadhav — FACTORY
  "+917020791094", // Vikas Chaudhari — STAFF
  "+919552670106", // Sanjay Thorat — STAFF
  "+917709545662", // Sunil Karle — STAFF
  "+919158464446", // Irshad Jamadar — STAFF
  "+919822569216", // Om Sharma — STAFF
  "+919901112508", // Monesh Pattar — STAFF
  "+919975370106", // Sunil Gaikwad — STAFF
  "+917028166235", // Nitin Kosandar — STAFF
];

export function isTestLoginPhone(e164: string): boolean {
  return TEST_LOGIN_PHONES.includes(e164);
}

// The Supabase project has phone-password grants disabled, so
// scripts/enable-test-login.ts attaches a synthetic email to each
// allowlisted user and we sign in via email+password. The email
// pattern must stay in sync with the script.
function syntheticEmail(e164: string): string {
  return `${e164.replace(/^\+/, "").replace(/^91/, "")}@synworks.local`;
}

export async function attemptTestLogin(e164: string) {
  return supabase.auth.signInWithPassword({
    email: syntheticEmail(e164),
    password: e164,
  });
}
