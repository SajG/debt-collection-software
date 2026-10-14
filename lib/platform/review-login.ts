import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkLoginRateLimit, recordLoginAttempt } from "@/lib/platform/rate-limit";

// SY37 — sign-in for store reviewers (Google Play / App Store).
//
// Reviewers cannot receive our emailed code, so three fixed accounts in
// the "Syncit Demo" company can sign in with a fixed 6-digit code. This
// is the only place that code is checked. Every gate below must pass;
// each is independent, so a mistake in one (a typo in the env var, a
// stray membership) cannot open a real account:
//
//   1. The feature is on: REVIEW_LOGIN_EMAILS and REVIEW_LOGIN_CODE are
//      both set, and the code is exactly 6 digits.
//   2. The email is one of the three addresses hard-coded in
//      REVIEW_ACCOUNTS. The env list can only narrow that set — putting
//      any other address in REVIEW_LOGIN_EMAILS does nothing.
//   3. Fewer than 5 wrong codes for that email in 15 minutes.
//   4. The code matches (constant-time).
//   5. The account's Profile has that email and is a member of exactly
//      one company, and that company is the demo company (slug
//      DEMO_ORG_SLUG). An account that has been added to any real
//      company is refused.
//
// On success the session's active company is pinned to the demo
// company and a normal Supabase session is minted for the phone.
// Every success is written to PlatformAuditLog; every attempt for a
// review address is written to LoginAttempt.

export const DEMO_ORG_SLUG = "syncit-demo";
export const DEMO_ORG_NAME = "Syncit Demo";

/** The only accounts that can ever use the fixed code. */
export const REVIEW_ACCOUNTS = [
  { email: "review-manager@getsyncit.app", role: "ADMIN", name: "Meera Kulkarni" },
  { email: "review-sales@getsyncit.app", role: "STAFF", name: "Rohan Deshpande" },
  { email: "review-factory@getsyncit.app", role: "FACTORY", name: "Sunil Pawar" },
] as const;

const HARD_ALLOWLIST: ReadonlySet<string> = new Set(REVIEW_ACCOUNTS.map((a) => a.email));

function normalise(email: string): string {
  return email.trim().toLowerCase();
}

/** Emails enabled by env ∩ the hard-coded three. Empty = feature off. */
export function enabledReviewEmails(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const code = env.REVIEW_LOGIN_CODE ?? "";
  if (!/^\d{6}$/.test(code)) return new Set();
  const listed = (env.REVIEW_LOGIN_EMAILS ?? "")
    .split(",")
    .map(normalise)
    .filter(Boolean);
  return new Set(listed.filter((e) => HARD_ALLOWLIST.has(e)));
}

export function isReviewEmail(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return enabledReviewEmails(env).has(normalise(email));
}

function codeMatches(candidate: string, env: NodeJS.ProcessEnv): boolean {
  const expected = env.REVIEW_LOGIN_CODE ?? "";
  if (!/^\d{6}$/.test(expected) || !/^\d{6}$/.test(candidate)) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export type ReviewLoginResult =
  | { ok: true; accessToken: string; refreshToken: string }
  /** Uniform refusal — the route answers the same for every reason. */
  | { ok: false; reason: ReviewLoginRefusal };

export type ReviewLoginRefusal =
  | "disabled"
  | "not_review_email"
  | "rate_limited"
  | "wrong_code"
  | "account_missing"
  | "not_demo_only"
  | "mint_failed";

/** Injectable so the gates can be unit-tested without a database. */
export type ReviewLoginDeps = {
  env: NodeJS.ProcessEnv;
  isRateLimited: (email: string) => Promise<boolean>;
  recordAttempt: (email: string, ok: boolean) => Promise<void>;
  /** Profile + all ACTIVE memberships for that email. */
  findAccount: (email: string) => Promise<{
    profileId: string;
    isActive: boolean;
    memberships: { organizationId: string; slug: string; deletedAt: Date | null }[];
  } | null>;
  mintSession: (args: {
    profileId: string;
    email: string;
    organizationId: string;
  }) => Promise<{ accessToken: string; refreshToken: string } | null>;
  audit: (args: {
    profileId: string;
    email: string;
    organizationId: string;
    ip: string | null;
    userAgent: string | null;
  }) => Promise<void>;
};

export async function reviewLogin(
  input: { email: string; code: string; ip: string | null; userAgent: string | null },
  deps: ReviewLoginDeps = defaultDeps(),
): Promise<ReviewLoginResult> {
  const email = normalise(input.email);
  const enabled = enabledReviewEmails(deps.env);
  if (enabled.size === 0) return { ok: false, reason: "disabled" };
  // Gate 2. Nothing is recorded for other addresses: this route must
  // not become a way to burn a real user's attempt budget.
  if (!enabled.has(email) || !HARD_ALLOWLIST.has(email)) {
    return { ok: false, reason: "not_review_email" };
  }

  if (await deps.isRateLimited(email)) return { ok: false, reason: "rate_limited" };

  if (!codeMatches(input.code, deps.env)) {
    await deps.recordAttempt(email, false);
    return { ok: false, reason: "wrong_code" };
  }

  const account = await deps.findAccount(email);
  if (!account || !account.isActive) {
    await deps.recordAttempt(email, false);
    return { ok: false, reason: "account_missing" };
  }
  const only = account.memberships.length === 1 ? account.memberships[0]! : null;
  if (!only || only.slug !== DEMO_ORG_SLUG || only.deletedAt !== null) {
    await deps.recordAttempt(email, false);
    return { ok: false, reason: "not_demo_only" };
  }

  const session = await deps.mintSession({
    profileId: account.profileId,
    email,
    organizationId: only.organizationId,
  });
  if (!session) {
    await deps.recordAttempt(email, false);
    return { ok: false, reason: "mint_failed" };
  }

  await deps.recordAttempt(email, true);
  await deps.audit({
    profileId: account.profileId,
    email,
    organizationId: only.organizationId,
    ip: input.ip,
    userAgent: input.userAgent,
  });
  return { ok: true, ...session };
}

function defaultDeps(): ReviewLoginDeps {
  return {
    env: process.env,
    isRateLimited: async (email) => (await checkLoginRateLimit(email, "REVIEW_CODE")).limited,
    recordAttempt: (email, ok) => recordLoginAttempt(email, ok, "REVIEW_CODE"),
    findAccount: async (email) => {
      const profile = await db.profile.findUnique({
        where: { email },
        select: {
          id: true,
          isActive: true,
          deletedAt: true,
          memberships: {
            where: { isActive: true },
            select: {
              organizationId: true,
              organization: { select: { slug: true, deletedAt: true } },
            },
          },
        },
      });
      if (!profile || profile.deletedAt) return null;
      return {
        profileId: profile.id,
        isActive: profile.isActive,
        memberships: profile.memberships.map((m) => ({
          organizationId: m.organizationId,
          slug: m.organization.slug,
          deletedAt: m.organization.deletedAt,
        })),
      };
    },
    mintSession: async ({ profileId, email, organizationId }) => {
      const admin = createAdminClient();
      // The auth user must be the one the Profile mirrors, with the
      // same email — never mint for an address that merely looks right.
      const { data: found, error: getErr } = await admin.auth.admin.getUserById(profileId);
      if (getErr || !found.user || normalise(found.user.email ?? "") !== email) return null;

      const { error: pinErr } = await admin.auth.admin.updateUserById(profileId, {
        app_metadata: { ...(found.user.app_metadata ?? {}), active_org_id: organizationId },
      });
      if (pinErr) return null;

      // A one-time magic-link token, redeemed here on the server. It is
      // never emailed and never leaves this function.
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      const tokenHash = link?.properties?.hashed_token;
      if (linkErr || !tokenHash) return null;

      const anon = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
      );
      const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
        token_hash: tokenHash,
        type: "magiclink",
      });
      const session = verified?.session;
      if (verifyErr || !session || session.user.id !== profileId) return null;
      return { accessToken: session.access_token, refreshToken: session.refresh_token };
    },
    audit: async ({ profileId, email, organizationId, ip, userAgent }) => {
      await db.platformAuditLog.create({
        data: {
          actorId: profileId,
          actorEmail: email,
          action: "review_login",
          organizationId,
          detail: { ip, userAgent },
        },
      });
    },
  };
}
