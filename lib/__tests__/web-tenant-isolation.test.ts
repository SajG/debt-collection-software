/**
 * SY32 — web tenant isolation.
 *
 * Two companies (A and B) live in an in-memory Prisma fake. The REAL
 * tenantDb() query extension, the REAL auth guards and the REAL server
 * actions / route handlers run on top of it; only the storage engine
 * and the Supabase session are faked. The caller is an ADMIN of
 * company B. Every probe at company A data must come back empty /
 * "not found" / 404, and A's rows must be untouched afterwards.
 *
 * The fake understands the Prisma subset these handlers use: where
 * (scalars, operators, AND/OR/NOT, to-one `is`, to-many `some`),
 * select/include of relations, take, create/update/delete(+Many),
 * upsert, count and $transaction. Relations come from Prisma's own
 * DMMF, so the fake follows the real schema.
 */

import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── In-memory Prisma fake ─────────────────────────────────────────

type Row = Record<string, unknown>;
type Args = Record<string, unknown>;

const MODELS = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const delegateToModel = new Map(
  Array.from(MODELS.keys()).map((n) => [n.charAt(0).toLowerCase() + n.slice(1), n]),
);

const store = new Map<string, Row[]>();
const table = (model: string) => {
  if (!store.has(model)) store.set(model, []);
  return store.get(model)!;
};
let seq = 0;
const newId = () => `id-${++seq}`;

function relationOf(model: string, field: string) {
  const f = MODELS.get(model)?.fields.find((x) => x.name === field && x.kind === "object");
  if (!f) return null;
  const target = MODELS.get(f.type)!;
  if (f.relationFromFields && f.relationFromFields.length > 0) {
    // this model holds the FK → to-one parent
    const from = f.relationFromFields[0]!;
    const to = f.relationToFields?.[0] ?? "id";
    return { kind: "one" as const, target: f.type, get: (r: Row) => table(f.type).find((t) => t[to] === r[from]) ?? null };
  }
  // the other side holds the FK
  const back = target.fields.find(
    (x) => x.kind === "object" && x.relationName === f.relationName && x !== f,
  )!;
  const fk = back.relationFromFields![0]!;
  const pk = back.relationToFields?.[0] ?? "id";
  if (f.isList) {
    return { kind: "many" as const, target: f.type, get: (r: Row) => table(f.type).filter((t) => t[fk] === r[pk]) };
  }
  return { kind: "one" as const, target: f.type, get: (r: Row) => table(f.type).find((t) => t[fk] === r[pk]) ?? null };
}

function cmp(a: unknown, b: unknown): number {
  const x = a instanceof Prisma.Decimal ? a.toNumber() : a instanceof Date ? a.getTime() : a;
  const y = b instanceof Prisma.Decimal ? b.toNumber() : b instanceof Date ? b.getTime() : b;
  return (x as number) < (y as number) ? -1 : (x as number) > (y as number) ? 1 : 0;
}

function matchScalar(v: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== "object" || cond instanceof Date || cond instanceof Prisma.Decimal) {
    if (v instanceof Prisma.Decimal || cond instanceof Prisma.Decimal) return cmp(v, cond) === 0;
    if (v instanceof Date && cond instanceof Date) return v.getTime() === cond.getTime();
    return v === cond;
  }
  const c = cond as Args;
  const ci = c.mode === "insensitive";
  const s = (x: unknown) => (ci ? String(x ?? "").toLowerCase() : String(x ?? ""));
  for (const [op, val] of Object.entries(c)) {
    if (op === "mode") continue;
    if (op === "equals" && !(ci ? s(v) === s(val) : matchScalar(v, val))) return false;
    if (op === "in" && !(val as unknown[]).includes(v)) return false;
    if (op === "notIn" && (val as unknown[]).includes(v)) return false;
    if (op === "not" && matchScalar(v, val)) return false;
    if (op === "contains" && (v == null || !s(v).includes(s(val)))) return false;
    if (op === "startsWith" && (v == null || !s(v).startsWith(s(val)))) return false;
    if (op === "gt" && !(v != null && cmp(v, val) > 0)) return false;
    if (op === "gte" && !(v != null && cmp(v, val) >= 0)) return false;
    if (op === "lt" && !(v != null && cmp(v, val) < 0)) return false;
    if (op === "lte" && !(v != null && cmp(v, val) <= 0)) return false;
  }
  return true;
}

function matches(model: string, row: Row, where: unknown): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where as Args)) {
    if (cond === undefined) continue;
    if (k === "AND") {
      const list = Array.isArray(cond) ? cond : [cond];
      if (!list.every((w) => matches(model, row, w))) return false;
      continue;
    }
    if (k === "OR") {
      if (!(cond as unknown[]).some((w) => matches(model, row, w))) return false;
      continue;
    }
    if (k === "NOT") {
      const list = Array.isArray(cond) ? cond : [cond];
      if (list.some((w) => matches(model, row, w))) return false;
      continue;
    }
    const rel = relationOf(model, k);
    if (rel) {
      const c = cond as Args;
      if (rel.kind === "many") {
        const kids = rel.get(row) as Row[];
        if (c.some && !kids.some((r) => matches(rel.target, r, c.some))) return false;
        if (c.every && !kids.every((r) => matches(rel.target, r, c.every))) return false;
        if (c.none && kids.some((r) => matches(rel.target, r, c.none))) return false;
      } else {
        const parent = rel.get(row) as Row | null;
        const inner = c && "is" in c ? c.is : c && "isNot" in c ? undefined : c;
        if (c && "isNot" in c) {
          if (parent && matches(rel.target, parent, c.isNot)) return false;
        } else if (inner === null) {
          if (parent) return false;
        } else if (!parent || !matches(rel.target, parent, inner)) return false;
      }
      continue;
    }
    // compound unique selector, e.g. organizationId_provider: {...}
    if (k.includes("_") && cond && typeof cond === "object" && !(k in row)) {
      if (!matches(model, row, cond)) return false;
      continue;
    }
    if (!matchScalar(row[k], cond)) return false;
  }
  return true;
}

function shape(model: string, row: Row, args: Args): Row {
  const out: Row = { ...row };
  const nested = (args.include ?? args.select) as Args | undefined;
  if (!nested) return out;
  for (const [k, v] of Object.entries(nested)) {
    if (!v) continue;
    if (k === "_count") {
      out._count = Object.fromEntries(
        Object.keys(((v as Args).select ?? {}) as Args).map((rk) => {
          const rel = relationOf(model, rk)!;
          return [rk, (rel.get(row) as Row[]).length];
        }),
      );
      continue;
    }
    const rel = relationOf(model, k);
    if (!rel) continue;
    const sub = v === true ? {} : (v as Args);
    if (rel.kind === "many") {
      let kids = (rel.get(row) as Row[]).filter((r) => matches(rel.target, r, sub.where));
      if (typeof sub.take === "number") kids = kids.slice(0, sub.take);
      out[k] = kids.map((r) => shape(rel.target, r, sub));
    } else {
      const p = rel.get(row) as Row | null;
      out[k] = p ? shape(rel.target, p, sub) : null;
    }
  }
  return out;
}

const DEFAULTS: Record<string, Row> = {
  Party: { totalOutstanding: new Prisma.Decimal(0), isActive: true, priority: "MEDIUM", riskLevel: "LOW", consentStatus: "UNKNOWN", outreachPaused: false },
  SyncLog: { startedAt: new Date() },
};

function stripRelations(model: string, data: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(data)) {
    if (relationOf(model, k)) continue; // nested relation writes not modelled
    out[k] = v;
  }
  return out;
}

function engine(model: string, op: string, args: Args = {}): unknown {
  const rows = table(model);
  const found = () => rows.filter((r) => matches(model, r, args.where));
  switch (op) {
    case "findMany": {
      let r = found();
      if (typeof args.skip === "number") r = r.slice(args.skip);
      if (typeof args.take === "number") r = r.slice(0, args.take);
      return r.map((x) => shape(model, x, args));
    }
    case "findFirst":
    case "findUnique": {
      const r = found()[0];
      return r ? shape(model, r, args) : null;
    }
    case "findFirstOrThrow":
    case "findUniqueOrThrow": {
      const r = found()[0];
      if (!r) throw new Error(`${model} not found`);
      return shape(model, r, args);
    }
    case "count":
      return found().length;
    case "create": {
      const row: Row = { id: newId(), createdAt: new Date(), ...DEFAULTS[model], ...stripRelations(model, args.data as Row) };
      rows.push(row);
      return shape(model, row, args);
    }
    case "createMany": {
      const list = Array.isArray(args.data) ? args.data : [args.data];
      for (const d of list as Row[]) rows.push({ id: newId(), createdAt: new Date(), ...DEFAULTS[model], ...d });
      return { count: list.length };
    }
    case "update": {
      const r = found()[0];
      if (!r) throw new Prisma.PrismaClientKnownRequestError("Record to update not found.", { code: "P2025", clientVersion: "test" });
      Object.assign(r, stripRelations(model, args.data as Row));
      return shape(model, r, args);
    }
    case "updateMany": {
      const r = found();
      r.forEach((x) => Object.assign(x, stripRelations(model, args.data as Row)));
      return { count: r.length };
    }
    case "upsert": {
      const r = found()[0];
      if (r) {
        Object.assign(r, stripRelations(model, args.update as Row));
        return shape(model, r, args);
      }
      return engine(model, "create", { data: args.create, select: args.select, include: args.include });
    }
    case "delete": {
      const r = found()[0];
      if (!r) throw new Prisma.PrismaClientKnownRequestError("Record to delete does not exist.", { code: "P2025", clientVersion: "test" });
      rows.splice(rows.indexOf(r), 1);
      return r;
    }
    case "deleteMany": {
      const r = found();
      r.forEach((x) => rows.splice(rows.indexOf(x), 1));
      return { count: r.length };
    }
    default:
      throw new Error(`fake prisma: ${model}.${op} not modelled`);
  }
}

type Hook = (p: { model: string; operation: string; args: Args; query: (a: Args) => Promise<unknown> }) => Promise<unknown>;

function makeClient(hook: Hook | null): Record<string, unknown> {
  const client: Record<string, unknown> = {};
  for (const [key, model] of Array.from(delegateToModel.entries())) {
    client[key] = new Proxy(
      {},
      {
        get: (_t, op: string) => (args: Args) => {
          const query = async (a: Args) => engine(model, op, a);
          return hook ? hook({ model, operation: op, args, query }) : query(args);
        },
      },
    );
  }
  client.$transaction = async (arg: unknown) =>
    typeof arg === "function" ? (arg as (c: unknown) => unknown)(client) : Promise.all(arg as unknown[]);
  client.$queryRaw = async () => [{ ready: false, limited: false, retry_after_minutes: 0 }];
  client.$executeRaw = async () => 0;
  client.$extends = (ext: { query: { $allModels: { $allOperations: Hook } } }) =>
    makeClient(ext.query.$allModels.$allOperations);
  return client;
}

vi.mock("@/lib/db", () => ({ db: makeClient(null) }));

// ── Session / framework fakes ─────────────────────────────────────

const session = { userId: "", activeOrgId: "" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: session.userId, app_metadata: { active_org_id: session.activeOrgId } } },
      }),
      signOut: async () => ({}),
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));
vi.mock("@/lib/auth/mfa", () => ({
  readMfaStatus: async () => ({ factor: { kind: "verified" }, aal: "aal2" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (p: string) => {
    throw new Error(`REDIRECT:${p}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/lib/monitoring", () => ({ captureError: async () => undefined }));
// The PDF renderer is JSX (react-pdf); the isolation paths under test
// never reach it.
vi.mock("@/lib/pdf/company-doc", () => ({ renderCompanyDoc: async () => Buffer.from("") }));

// ── Fixtures ──────────────────────────────────────────────────────

const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";
const MANAGER_A = "00000000-0000-0000-0000-0000000000a1";
const MANAGER_B = "00000000-0000-0000-0000-0000000000b1";
const D = (n: number) => new Prisma.Decimal(n);

function seed() {
  store.clear();
  seq = 0;
  table("Organization").push(
    { id: ORG_A, name: "Alpha Traders", slug: "alpha", status: "ACTIVE", plan: "GROWTH" },
    { id: ORG_B, name: "Bravo Distributors", slug: "bravo", status: "ACTIVE", plan: "GROWTH" },
  );
  table("Profile").push(
    { id: MANAGER_A, ownerName: "Asha", businessName: "Alpha Traders", role: "ADMIN", isActive: true, email: "a@alpha.in", createdAt: new Date() },
    { id: MANAGER_B, ownerName: "Bhavesh", businessName: "Bravo Distributors", role: "ADMIN", isActive: true, email: "b@bravo.in", createdAt: new Date() },
  );
  table("Membership").push(
    { id: "m-a", organizationId: ORG_A, profileId: MANAGER_A, role: "ADMIN", isOwner: true, isActive: true, createdAt: new Date() },
    { id: "m-b", organizationId: ORG_B, profileId: MANAGER_B, role: "ADMIN", isOwner: true, isActive: true, createdAt: new Date() },
  );
  table("BusinessSettings").push(
    { id: "bs-a", organizationId: ORG_A, requireManagement2fa: false },
    { id: "bs-b", organizationId: ORG_B, requireManagement2fa: false },
  );
  for (const [org, tag, owner] of [[ORG_A, "A", MANAGER_A], [ORG_B, "B", MANAGER_B]] as const) {
    const now = new Date("2026-09-01T00:00:00Z");
    table("Party").push({
      id: `party-${tag}`, organizationId: org, name: `Acme ${tag === "A" ? "Alpha" : "Bravo"}`,
      phone: tag === "A" ? "9800000001" : "9800000002", assignedToId: owner, tallyRef: `TALLY-${tag}`,
      totalOutstanding: D(1000), creditLimit: null, creditDays: 30, isActive: true, priority: "MEDIUM",
      riskLevel: "LOW", consentStatus: "OPTED_IN", outreachPaused: false, createdAt: now,
    });
    table("Invoice").push({
      id: `inv-${tag}`, organizationId: org, partyId: `party-${tag}`, invoiceNumber: `ACME-INV-${tag}`,
      invoiceDate: now, dueDate: now, totalAmount: D(1000), paidAmount: D(0), creditedAmount: D(0),
      status: "UNPAID", source: "MANUAL", createdAt: now,
    });
    table("Payment").push({
      id: `pay-${tag}`, organizationId: org, partyId: `party-${tag}`, invoiceId: `inv-${tag}`,
      amount: D(100), paymentDate: now, method: "UPI", recordedById: owner, notes: null, createdAt: now,
    });
    table("SalesOrder").push({
      id: `ord-${tag}`, organizationId: org, partyId: `party-${tag}`, orderNumber: `ACME/26-27/000${tag === "A" ? 1 : 2}`,
      salespersonId: owner, currentStatus: "ORDER_PLACED", createdAt: now,
    });
  }
}

const A_IDS = ["party-A", "inv-A", "pay-A", "ord-A"];

function snapshotA(): string {
  return JSON.stringify(
    ["Party", "Invoice", "Payment", "SalesOrder"].flatMap((m) =>
      table(m).filter((r) => r.organizationId === ORG_A),
    ),
  );
}

let before = "";
beforeEach(() => {
  vi.resetModules();
  seed();
  session.userId = MANAGER_B;
  session.activeOrgId = ORG_B;
  before = snapshotA();
});

function expectAUntouched() {
  expect(snapshotA()).toBe(before);
}

const json = async (res: Response) => JSON.parse(await res.text());

// ── tenantDb unit checks ──────────────────────────────────────────

describe("tenantDb", () => {
  it("findUnique by id cannot reach another company's row", async () => {
    const { tenantDb } = await import("../tenant");
    const db = tenantDb(ORG_B);
    expect(await db.party.findUnique({ where: { id: "party-A" } })).toBeNull();
    expect(await db.party.findUnique({ where: { id: "party-B" } })).not.toBeNull();
  });

  it("update / delete by id of another company's row fail and change nothing", async () => {
    const { tenantDb } = await import("../tenant");
    const db = tenantDb(ORG_B);
    await expect(db.party.update({ where: { id: "party-A" }, data: { name: "pwned" } })).rejects.toThrow();
    await expect(db.invoice.delete({ where: { id: "inv-A" } })).rejects.toThrow();
    expect((await db.party.updateMany({ data: { name: "x" }, where: { id: "party-A" } })).count).toBe(0);
    expectAUntouched();
  });

  it("creates are stamped with the scope and refuse a different organizationId", async () => {
    const { tenantDb } = await import("../tenant");
    const db = tenantDb(ORG_B);
    const p = await db.party.create({ data: { name: "New Co" } });
    expect((p as Row).organizationId).toBe(ORG_B);
    await expect(
      db.party.create({ data: { name: "Smuggled", organizationId: ORG_A } }),
    ).rejects.toThrow(/across organizations/);
    await expect(
      db.party.update({ where: { id: "party-B" }, data: { organizationId: ORG_A } }),
    ).rejects.toThrow(/across organizations/);
  });

  it("stamps nested creates (escalation → events) with the scope", async () => {
    const { tenantDb } = await import("../tenant");
    let seen: Args | null = null;
    const { db: raw } = (await import("@/lib/db")) as unknown as { db: { $extends: (e: unknown) => unknown } };
    const realExtends = raw.$extends;
    raw.$extends = (ext: unknown) => {
      const client = realExtends(ext) as Record<string, unknown>;
      const hook = (ext as { query: { $allModels: { $allOperations: Hook } } }).query.$allModels.$allOperations;
      client.escalation = {
        create: (args: Args) =>
          hook({ model: "Escalation", operation: "create", args, query: async (a) => { seen = a; return {}; } }),
      };
      return client;
    };
    await (tenantDb(ORG_B) as unknown as { escalation: { create: (a: Args) => Promise<unknown> } }).escalation.create({
      data: { partyId: "party-B", reason: "x", events: { create: { toStage: "FLAGGED", note: "n" } } },
    });
    raw.$extends = realExtends;
    const data = (seen as unknown as { data: Row }).data;
    expect(data.organizationId).toBe(ORG_B);
    expect(((data.events as Row).create as Row).organizationId).toBe(ORG_B);
  });

  it("Profile reads only see members of the company", async () => {
    const { tenantDb } = await import("../tenant");
    const people = await tenantDb(ORG_B).profile.findMany();
    expect(people.map((p) => p.id)).toEqual([MANAGER_B]);
  });
});

// ── Route handlers ────────────────────────────────────────────────

describe("route handlers as company B's manager", () => {
  it("search returns zero company A hits", async () => {
    const { GET } = await import("../../app/api/search/route");
    const body = await json(await GET(new Request("http://x/api/search?q=acme")));
    const ids = (body.hits as { id: string }[]).map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining(["party-B", "inv-B", "ord-B"]));
    for (const id of A_IDS) expect(ids).not.toContain(id);
  });

  it("data export contains only company B rows", async () => {
    const { GET } = await import("../../app/api/data/export/route");
    const { NextRequest } = await import("next/server");
    for (const entity of ["parties", "invoices", "payments"]) {
      const res = await GET(new NextRequest(`http://x/api/data/export?entity=${entity}&format=json`));
      const rows = (await json(res)) as { id: string }[];
      expect(rows.length).toBe(1);
      expect(rows[0]!.id.endsWith("-B")).toBe(true);
    }
  });

  it("invoice PDF for a company A invoice is 404", async () => {
    const { GET } = await import("../../app/api/invoices/[id]/pdf/route");
    const res = await GET(new Request("http://x"), { params: { id: "inv-A" } });
    expect(res.status).toBe(404);
  });
});

// ── Server actions ────────────────────────────────────────────────

describe("server actions as company B's manager", () => {
  it("parties: cannot edit company A's party", async () => {
    const { updatePartyAction } = await import("../../app/(dashboard)/parties/actions");
    const res = await updatePartyAction("party-A", { name: "Hijacked" } as never);
    expect(res).toEqual({ error: "Party not found." });
    expectAUntouched();
  });

  it("invoices: cannot cancel company A's invoice", async () => {
    const { cancelInvoiceAction } = await import("../../app/(dashboard)/invoices/actions");
    expect(await cancelInvoiceAction("inv-A")).toEqual({ error: "Invoice not found." });
    expectAUntouched();
  });

  it("payments: cannot edit company A's payment", async () => {
    const { updatePaymentMetaAction } = await import("../../app/(dashboard)/payments/actions");
    expect(await updatePaymentMetaAction("pay-A", { notes: "x" } as never)).toEqual({
      error: "Payment not found.",
    });
    expectAUntouched();
  });

  it("orders: cannot cancel company A's order", async () => {
    const { cancelSalesOrderAction } = await import("../../app/(dashboard)/orders/actions");
    expect(await cancelSalesOrderAction("ord-A", "test")).toEqual({ error: "Order not found." });
    expectAUntouched();
  });

  it("import: rows land in company B and never match company A's records", async () => {
    const { importPartiesAction } = await import("../../app/(dashboard)/import/actions");
    // Same name AND same tallyRef as company A's party: B's dedupe must
    // not see A's row, so it is created fresh inside B.
    const res = await importPartiesAction([{ name: "Acme Alpha", tallyRef: "TALLY-A" }]);
    expect(res).toMatchObject({ imported: 1, skipped: 0, failed: 0 });
    const created = table("Party").find((p) => p.name === "Acme Alpha" && p.id !== "party-A")!;
    expect(created.organizationId).toBe(ORG_B);
    expect(table("SyncLog").every((l) => l.organizationId === ORG_B)).toBe(true);
    expectAUntouched();
  });

  it("a user with no company gets nothing", async () => {
    table("Membership").splice(0, table("Membership").length, table("Membership")[0]!);
    const { updatePartyAction } = await import("../../app/(dashboard)/parties/actions");
    await expect(updatePartyAction("party-B", { name: "x" } as never)).rejects.toThrow(
      "REDIRECT:/onboarding",
    );
  });
});
