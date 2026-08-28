import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProfileApi, partyScopeWhere } from "@/lib/authz";

// Command-palette backend. Fuzzy search across the four surfaces a
// director / salesperson jumps between: orders, parties, invoices,
// and a small hand-curated list of admin pages.
//
// Every result stays inside RLS. This route uses `db` (Prisma), so
// scope is enforced by the same helpers the list pages use — never
// by a service-role short-circuit. Adding a new hit type here means
// adding a where-clause matching the corresponding RLS predicate.

const MAX_PER_TYPE = 6;
const MAX_TOTAL = 20;

export type SearchHit =
  | {
      kind: "order";
      id: string;
      title: string;
      subtitle: string;
      href: string;
    }
  | {
      kind: "party";
      id: string;
      title: string;
      subtitle: string;
      href: string;
    }
  | {
      kind: "invoice";
      id: string;
      title: string;
      subtitle: string;
      href: string;
    }
  | { kind: "page"; id: string; title: string; subtitle: string; href: string };

const ADMIN_PAGES: SearchHit[] = [
  { kind: "page", id: "p-users", title: "Users", subtitle: "admin/users", href: "/admin/users" },
  { kind: "page", id: "p-devices", title: "Devices", subtitle: "admin/devices", href: "/admin/devices" },
  { kind: "page", id: "p-approvals", title: "Approvals", subtitle: "admin/approvals", href: "/admin/approvals" },
  { kind: "page", id: "p-rate-approvals", title: "Rate approvals", subtitle: "admin/rate-approvals", href: "/admin/rate-approvals" },
  { kind: "page", id: "p-slipping", title: "Slipping orders", subtitle: "admin/slipping", href: "/admin/slipping" },
  { kind: "page", id: "p-recon", title: "Reconciliation", subtitle: "admin/reconciliation", href: "/admin/reconciliation" },
  { kind: "page", id: "p-analytics", title: "Analytics", subtitle: "admin/analytics", href: "/admin/analytics" },
  { kind: "page", id: "p-unassigned", title: "Unassigned parties", subtitle: "admin/unassigned", href: "/admin/unassigned" },
  { kind: "page", id: "p-products", title: "Products", subtitle: "admin/products", href: "/admin/products" },
  { kind: "page", id: "p-settings", title: "Settings", subtitle: "settings", href: "/settings" },
  { kind: "page", id: "p-security", title: "Security", subtitle: "settings/security", href: "/settings/security" },
];

export async function GET(req: Request) {
  const { profile, failure } = await requireProfileApi();
  if (failure) return failure;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ hits: [] });
  if (q.length > 120) return NextResponse.json({ hits: [] });

  const needle = q.toLowerCase();

  const [orders, parties, invoices] = await Promise.all([
    // Orders — STAFF sees own, FACTORY/ADMIN see all. Match on
    // order number OR customer name (party.name / newCustomerName).
    db.salesOrder.findMany({
      where: {
        ...(profile.role === "STAFF"
          ? { salespersonId: profile.id }
          : {}),
        OR: [
          { orderNumber: { contains: q, mode: "insensitive" } },
          { newCustomerName: { contains: q, mode: "insensitive" } },
          {
            party: {
              is: { name: { contains: q, mode: "insensitive" } },
            },
          },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        currentStatus: true,
        newCustomerName: true,
        party: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PER_TYPE,
    }),
    // Parties — STAFF gates via partyScopeWhere, ADMIN/FACTORY open.
    db.party.findMany({
      where: {
        ...partyScopeWhere(profile),
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { gstNumber: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      select: { id: true, name: true, gstNumber: true, phone: true },
      orderBy: { name: "asc" },
      take: MAX_PER_TYPE,
    }),
    // Invoices — reach via party.assignedToId gate to inherit STAFF scope.
    db.invoice.findMany({
      where: {
        party:
          profile.role === "STAFF"
            ? { assignedToId: profile.id }
            : undefined,
        OR: [
          { invoiceNumber: { contains: q, mode: "insensitive" } },
          {
            party: {
              is: { name: { contains: q, mode: "insensitive" } },
            },
          },
        ],
      },
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        paidAmount: true,
        party: { select: { name: true } },
      },
      orderBy: { invoiceDate: "desc" },
      take: MAX_PER_TYPE,
    }),
  ]);

  const hits: SearchHit[] = [];

  for (const o of orders) {
    hits.push({
      kind: "order",
      id: o.id,
      title: o.orderNumber,
      subtitle: `${o.party?.name ?? o.newCustomerName ?? "—"} · ${o.currentStatus.replace(/_/g, " ")}`,
      href: `/orders/${o.id}`,
    });
  }
  for (const p of parties) {
    hits.push({
      kind: "party",
      id: p.id,
      title: p.name,
      subtitle: [p.gstNumber, p.phone].filter(Boolean).join(" · ") || "party",
      href: `/parties/${p.id}`,
    });
  }
  for (const inv of invoices) {
    hits.push({
      kind: "invoice",
      id: inv.id,
      title: inv.invoiceNumber,
      subtitle: `${inv.party?.name ?? "—"} · ₹${Number(inv.totalAmount).toLocaleString("en-IN")}`,
      href: `/invoices/${inv.id}`,
    });
  }

  // Admin-only pages are surfaced to ADMIN only; the rest see none.
  if (profile.role === "ADMIN") {
    for (const p of ADMIN_PAGES) {
      if (
        p.title.toLowerCase().includes(needle) ||
        p.subtitle.toLowerCase().includes(needle)
      ) {
        hits.push(p);
      }
    }
  }

  return NextResponse.json({ hits: hits.slice(0, MAX_TOTAL) });
}
