"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate, formatINR } from "@/lib/format";
import { Badge, btnPrimaryCls, btnSecondaryCls, inputCls } from "../_components/ui";
import { linkOrderToPartyAction } from "./actions";
import type { PendingOrderMatch } from "@/lib/orders/reconcile";

export function PendingOrdersResolver({
  pending,
}: {
  pending: PendingOrderMatch[];
}) {
  if (pending.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No pending customer matches — every sales order is linked to a ledger
        row.
      </p>
    );
  }

  const ambiguous = pending.filter((p) => p.candidates.length > 1);
  const unmatched = pending.filter((p) => p.candidates.length === 0);
  const exact = pending.filter((p) => p.candidates.length === 1);

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        {pending.length} sales order{pending.length === 1 ? "" : "s"} placed for
        &quot;new customer&quot; free-text names — waiting for the ledger link.
        The nightly job auto-links exact single matches; anything below needs a
        decision.
      </p>

      {ambiguous.length > 0 && (
        <Section
          title="Ambiguous — multiple ledger matches"
          tone="amber"
          count={ambiguous.length}
        >
          {ambiguous.map((p) => (
            <AmbiguousRow key={p.orderId} pending={p} />
          ))}
        </Section>
      )}

      {unmatched.length > 0 && (
        <Section
          title="Unmatched — no ledger row yet"
          tone="neutral"
          count={unmatched.length}
        >
          {unmatched.map((p) => (
            <UnmatchedRow key={p.orderId} pending={p} />
          ))}
        </Section>
      )}

      {exact.length > 0 && (
        <Section
          title="Waiting for next nightly run"
          tone="neutral"
          count={exact.length}
        >
          <p className="mb-3 text-xs text-muted-foreground">
            These have exactly one ledger candidate and will auto-link at
            03:30 IST — resolve now if you want it immediate.
          </p>
          {exact.map((p) => (
            <AmbiguousRow key={p.orderId} pending={p} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  tone,
  count,
  children,
}: {
  title: string;
  tone: "amber" | "neutral";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Badge tone={tone}>{count}</Badge>
      </div>
      <ul className="space-y-3">{children}</ul>
    </div>
  );
}

function AmbiguousRow({ pending }: { pending: PendingOrderMatch }) {
  const router = useRouter();
  const [choice, setChoice] = useState<string>(pending.candidates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function link() {
    if (!choice) return;
    setError(null);
    startTransition(async () => {
      const res = await linkOrderToPartyAction(pending.orderId, choice);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link
            href={`/orders/${pending.orderId}`}
            className="font-mono text-sm font-medium text-primary hover:underline"
          >
            {pending.orderNumber}
          </Link>{" "}
          <span className="text-sm text-foreground">
            — &ldquo;{pending.newCustomerName}&rdquo;
          </span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(pending.createdAt)} · {pending.salespersonName} ·{" "}
            {formatINR(pending.orderValue)}
          </p>
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
          Link to ledger customer
        </span>
        <select
          className={inputCls}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          {pending.candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.city ? ` — ${c.city}` : ""}
              {c.phone ? ` · ${c.phone}` : ""}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className={btnPrimaryCls}
          onClick={link}
          disabled={isPending || !choice}
        >
          {isPending ? "Linking…" : "Link customer"}
        </button>
      </div>
    </li>
  );
}

function UnmatchedRow({ pending }: { pending: PendingOrderMatch }) {
  return (
    <li className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link
            href={`/orders/${pending.orderId}`}
            className="font-mono text-sm font-medium text-primary hover:underline"
          >
            {pending.orderNumber}
          </Link>{" "}
          <span className="text-sm text-foreground">
            — &ldquo;{pending.newCustomerName}&rdquo;
          </span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(pending.createdAt)} · {pending.salespersonName} ·{" "}
            {formatINR(pending.orderValue)}
          </p>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        No ledger row matches this name yet. Either create the customer in Tally
        and re-run the sync, or add the party manually and reload this page.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/parties?q=${encodeURIComponent(pending.newCustomerName)}`}
          className={btnSecondaryCls}
        >
          Search parties
        </Link>
      </div>
    </li>
  );
}
