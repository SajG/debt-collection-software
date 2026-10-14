import { startOfDay } from "date-fns";
import { supabase } from "./supabase";
import { useQuery } from "./queries";
import { newId } from "./ids";
import { t } from "./i18n";
import {
  buildFollowUps,
  type ActionLite,
  type FollowUp,
  type InvoiceLite,
  type LinkLite,
  type PartyLite,
} from "./followup-rank";

export type { FollowUp } from "./followup-rank";

// "Today" for a salesperson: which customers to talk to about payment,
// most important first. Everything is read through RLS — STAFF sees
// only customers assigned to them, ADMIN sees the company.

export function useTodayFollowUps() {
  return useQuery<FollowUp[]>("followups:today", fetchFollowUps);
}

/** Management "Needs you": customers who promised a date, let it pass
 *  and still owe money — across the whole company (an ADMIN's RLS
 *  scope). Largest balance first. */
export function useBrokenPromises() {
  return useQuery<FollowUp[]>("followups:broken", async () =>
    (await fetchFollowUps())
      .filter((f) => f.brokenPromise)
      .sort((a, b) => b.outstanding - a.outstanding),
  );
}

async function fetchFollowUps(): Promise<FollowUp[]> {
  {
    const todayIso = startOfDay(new Date()).toISOString();
    const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();

    const [parties, invoices, actions, links] = await Promise.all([
      supabase
        .from("Party")
        .select("id, name, city, phone, totalOutstanding")
        .eq("isActive", true)
        .gt("totalOutstanding", 0)
        .order("totalOutstanding", { ascending: false })
        .limit(500),
      supabase
        .from("Invoice")
        .select("partyId, dueDate")
        .in("status", ["UNPAID", "PARTIAL", "OVERDUE"])
        .lt("dueDate", todayIso)
        .order("dueDate", { ascending: true })
        .limit(2000),
      supabase
        .from("Action")
        .select("partyId, outcome, promiseDate, promiseAmount, performedAt")
        .gte("performedAt", since)
        .order("performedAt", { ascending: false })
        .limit(1000),
      supabase
        .from("PaymentLink")
        .select("partyId, shortUrl, status, createdAt")
        .in("status", ["created", "partially_paid"])
        .order("createdAt", { ascending: false })
        .limit(500),
    ]);
    if (parties.error) throw parties.error;
    if (invoices.error) throw invoices.error;
    // Promises and payment links enrich the list; without them the
    // list is still correct, so a failure here is not fatal.
    return buildFollowUps(
      (parties.data ?? []) as unknown as PartyLite[],
      (invoices.data ?? []) as unknown as InvoiceLite[],
      (actions.error ? [] : (actions.data ?? [])) as unknown as ActionLite[],
      (links.error ? [] : (links.data ?? [])) as unknown as LinkLite[],
    );
  }
}

// ── Customers tab ──────────────────────────────────────────────────

export type CustomerRow = {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  outstanding: number;
};

export function useCustomers(search: string) {
  const trimmed = search.trim();
  return useQuery<CustomerRow[]>(`customers:${trimmed.toLowerCase()}`, async () => {
    let q = supabase
      .from("Party")
      .select("id, name, city, phone, totalOutstanding")
      .eq("isActive", true)
      .order("name", { ascending: true })
      .limit(500);
    if (trimmed) q = q.ilike("name", `${trimmed}%`);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as unknown as PartyLite[]).map((p) => ({
      id: p.id,
      name: p.name,
      city: p.city,
      phone: p.phone,
      outstanding: Number(p.totalOutstanding) || 0,
    }));
  });
}

export function useCustomer(id: string | null) {
  return useQuery<CustomerRow | null>(`customer:${id ?? ""}`, async () => {
    if (!id) return null;
    const { data, error } = await supabase
      .from("Party")
      .select("id, name, city, phone, totalOutstanding")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const p = data as unknown as PartyLite;
    return {
      id: p.id,
      name: p.name,
      city: p.city,
      phone: p.phone,
      outstanding: Number(p.totalOutstanding) || 0,
    };
  });
}

// ── Promise to pay ─────────────────────────────────────────────────

/** Writes the same follow-up row the web's "Promised to pay" outcome
 *  does: Action(outcome = PROMISE_TO_PAY, promiseAmount, promiseDate).
 *  RLS (action_insert_staff / action_insert_admin) limits it to the
 *  caller's own customers. */
export async function recordPromise(input: {
  partyId: string;
  amount: number;
  /** yyyy-mm-dd */
  promiseDate: string;
}): Promise<{ ok: true } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("error.auth") };

  const now = new Date().toISOString();
  const promiseAt = new Date(`${input.promiseDate}T00:00:00`).toISOString();
  const { error } = await supabase.from("Action").insert({
    id: newId("act"),
    partyId: input.partyId,
    performedById: user.id,
    type: "CALL",
    outcome: "PROMISE_TO_PAY",
    promiseAmount: input.amount,
    promiseDate: promiseAt,
    nextFollowUpDate: promiseAt,
    performedAt: now,
    updatedAt: now,
  });
  if (error) return { error: error.message };
  return { ok: true };
}
