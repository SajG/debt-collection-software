import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";

// SY28 — workspace-wide billing banner. LOCKED → read-only notice with
// "Choose a plan"; PAST_DUE (SY34) → pay before the grace period ends;
// trial in its last 3 days → gentle reminder.

const LOCK_REASON: Record<string, string> = {
  TRIAL_ENDED: "Your trial has ended",
  PAYMENT_FAILED: "Your last payment didn't go through",
  CANCELLED: "Your subscription has ended",
  PAUSED: "Your subscription is paused",
};

/** Same sentence on web and mobile (mobile/src/components/BillingBanner.tsx). */
export function lockedMessage(lockReason: string | null): string {
  const lead = LOCK_REASON[lockReason ?? ""] ?? "This workspace is read-only";
  return `${lead} — choose a plan to keep adding orders. Your data is safe.`;
}

const GRACE_DAYS = 7;

export function BillingBanner({
  status,
  plan,
  trialEndsAt,
  lockReason,
  pastDueSince,
  deletionScheduledFor,
  isOwner,
}: {
  status: "ACTIVE" | "PAST_DUE" | "LOCKED" | "DELETING" | "DELETED";
  deletionScheduledFor?: Date | null;
  plan: "TRIAL" | "STARTER" | "GROWTH" | "BUSINESS";
  trialEndsAt: Date | null;
  lockReason: string | null;
  pastDueSince: Date | null;
  isOwner: boolean;
}) {
  if (status === "DELETING" || status === "DELETED") {
    const on = deletionScheduledFor
      ? deletionScheduledFor.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm sm:px-8">
        <p className="text-foreground">
          <strong>Read-only.</strong> This company is scheduled for deletion
          {on ? ` on ${on}` : ""}. Download your data before then.
        </p>
        {isOwner && (
          <Link
            href="/settings#company"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Manage
          </Link>
        )}
      </div>
    );
  }

  if (status === "LOCKED") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm sm:px-8">
        <p className="text-foreground">
          <strong>Read-only.</strong> {lockedMessage(lockReason)} You can still view and export
          everything.
        </p>
        {isOwner ? (
          <Link
            href="/settings/billing"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Choose a plan
          </Link>
        ) : (
          <span className="text-muted-foreground">Ask your account owner to choose a plan.</span>
        )}
      </div>
    );
  }

  if (status === "PAST_DUE") {
    const lockOn = pastDueSince
      ? new Date(pastDueSince.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000)
      : null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm sm:px-8">
        <p className="text-foreground">
          Your last payment didn&apos;t go through. Pay
          {lockOn ? ` by ${lockOn.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : " soon"} to
          keep adding orders — after that the workspace becomes read-only. Your data is safe.
        </p>
        {isOwner ? (
          <Link
            href="/settings/billing"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Pay now
          </Link>
        ) : (
          <span className="text-muted-foreground">Ask your account owner to update the payment.</span>
        )}
      </div>
    );
  }

  if (plan === "TRIAL" && trialEndsAt) {
    const daysLeft = differenceInCalendarDays(trialEndsAt, new Date());
    if (daysLeft > 3) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/60 px-4 py-2 text-sm sm:px-8">
        <p className="text-foreground">
          Your free trial ends {daysLeft <= 0 ? "today" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}.
        </p>
        {isOwner && (
          <Link href="/settings/billing" className="font-medium text-primary hover:underline">
            Choose a plan
          </Link>
        )}
      </div>
    );
  }

  return null;
}
