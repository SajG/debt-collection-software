/**
 * SY37 — "Syncit Demo" company for Google Play / App Store review.
 *
 *   npm run review:seed
 *
 * Creates (or resets) one company, slug `syncit-demo`, with three
 * sign-ins and enough made-up data that every screen a reviewer opens
 * has something on it:
 *
 *   review-manager@getsyncit.app   Management
 *   review-sales@getsyncit.app     Sales
 *   review-factory@getsyncit.app   Factory
 *
 * Safe to run again at any time — before each store submission is a
 * good habit, because reviewers place orders, record payments and may
 * delete an account. A re-run deletes ONLY rows whose organizationId is
 * the demo company's, then rebuilds them. It refuses to touch a company
 * whose slug or name is not exactly the demo one, and refuses to reuse
 * a review address that is a member of any other company.
 *
 * Every name, firm, GSTIN and phone number here is invented. Phone
 * numbers use the 99999-000xx block, which is not assigned to anyone.
 *
 * The three accounts have no password and cannot receive email. They
 * sign in with REVIEW_LOGIN_CODE through /api/auth/review-login — see
 * lib/platform/review-login.ts and docs/PLAY-STORE.md.
 */
import { PrismaClient, type OrderStatus, type Role } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import {
  DEMO_ORG_NAME,
  DEMO_ORG_SLUG,
  REVIEW_ACCOUNTS,
} from "../lib/platform/review-login";

const db = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const PHONES: Record<Role, string> = {
  ADMIN: "+919999900001",
  STAFF: "+919999900002",
  FACTORY: "+919999900003",
};

// ── Catalogue (invented brands) ─────────────────────────────────────
const BRANDS = ["Sahyadri Bond", "Deccan Seal", "Private Label / Other"];
const PACKINGS = ["Bucket (20 kg)", "Drum (50 kg)", "Jar (1 kg)", "Pouch (500 g)", "Cartridge (310 ml)"];

const PRODUCTS = [
  { key: "wood", name: "Wood Adhesive Classic", brand: "Sahyadri Bond", code: "SB-WA1", floor: 105 },
  { key: "woodwp", name: "Wood Adhesive Waterproof", brand: "Sahyadri Bond", code: "SB-WP2", floor: 148 },
  { key: "lam", name: "Laminate Adhesive", brand: "Sahyadri Bond", code: "SB-LM3", floor: 132 },
  { key: "tile", name: "Tile Fixing Compound", brand: "Deccan Seal", code: "DS-TF1", floor: 38 },
  { key: "sil", name: "Silicone Sealant Clear", brand: "Deccan Seal", code: "DS-SC2", floor: 165 },
  { key: "pu", name: "PU Foam Sealant", brand: "Deccan Seal", code: "DS-PU3", floor: 290 },
] as const;
type ProductKey = (typeof PRODUCTS)[number]["key"];

// ── Customers (invented firms, Pune localities) ─────────────────────
// `overdue` = days since the oldest unpaid invoice fell due (0 = none).
const PARTIES = [
  { key: "shree", name: "Shree Ganesh Plywood & Hardware", contact: "Prakash Jagtap", address: "Shop 14, Timber Market, Bhawani Peth", pin: "411042", limit: 500000, days: 30 },
  { key: "mahalaxmi", name: "Mahalaxmi Interiors", contact: "Anita Bhosale", address: "2nd Floor, Karve Road, Kothrud", pin: "411038", limit: 300000, days: 30 },
  { key: "sai", name: "Sai Traders", contact: "Vinod Shinde", address: "Gala 7, Market Yard, Gultekdi", pin: "411037", limit: 400000, days: 45 },
  { key: "om", name: "Om Furniture Works", contact: "Ganesh Kale", address: "Plot 22, MIDC Bhosari", pin: "411026", limit: 600000, days: 45 },
  { key: "deccan", name: "Deccan Laminates", contact: "Farhan Shaikh", address: "Opp. PMT Depot, Hadapsar", pin: "411028", limit: 350000, days: 30 },
  { key: "pcmc", name: "Pimpri Build Mart", contact: "Sachin Gaikwad", address: "Mumbai-Pune Road, Pimpri", pin: "411018", limit: 450000, days: 30 },
  { key: "wakad", name: "Wakad Modular Kitchens", contact: "Neha Joshi", address: "Datta Mandir Road, Wakad", pin: "411057", limit: 250000, days: 21 },
  { key: "sinhgad", name: "Sinhgad Hardware Stores", contact: "Dattatray More", address: "Sinhgad Road, Vadgaon Budruk", pin: "411041", limit: 200000, days: 21 },
  { key: "baner", name: "Baner Decor Studio", contact: "Kavita Rane", address: "Baner-Pashan Link Road, Baner", pin: "411045", limit: 300000, days: 30 },
  { key: "chakan", name: "Chakan Door Industries", contact: "Ramesh Thorat", address: "Gat No. 318, Chakan-Talegaon Road, Chakan", pin: "410501", limit: 800000, days: 60 },
] as const;
type PartyKey = (typeof PARTIES)[number]["key"];

// ── Invoices: [customer, amount, days since due date (negative = not yet due), paid so far]
const INVOICES: [PartyKey, number, number, number][] = [
  ["shree", 184500, 47, 0],
  ["shree", 96200, 12, 0],
  ["mahalaxmi", 72800, 33, 20000],
  ["sai", 141000, 21, 0],
  ["om", 256400, 9, 100000],
  ["deccan", 58900, 64, 0],
  ["pcmc", 119300, 5, 0],
  ["wakad", 44700, 18, 0],
  ["sinhgad", 31250, -6, 0],
  ["baner", 87600, -12, 0],
  ["chakan", 312000, 2, 0],
  ["chakan", 148500, -20, 0],
];

// ── Orders: [customer, status, placed N days ago, lines]
type Line = [ProductKey, number, string, string, number]; // product, qty(kg), packing, sizeKg, rate
const ORDERS: [PartyKey, OrderStatus, number, Line[]][] = [
  ["om", "PENDING_APPROVAL", 0, [["woodwp", 400, "Drum (50 kg)", "50", 152], ["lam", 200, "Bucket (20 kg)", "20", 136]]],
  ["wakad", "PENDING_APPROVAL", 0, [["sil", 60, "Cartridge (310 ml)", "0.31", 172]]],
  ["shree", "ORDER_PLACED", 1, [["wood", 600, "Bucket (20 kg)", "20", 110]]],
  ["pcmc", "ORDER_PLACED", 1, [["tile", 1000, "Bucket (20 kg)", "20", 41], ["pu", 40, "Cartridge (310 ml)", "0.31", 298]]],
  ["chakan", "IN_PRODUCTION", 2, [["woodwp", 1500, "Drum (50 kg)", "50", 150]]],
  ["deccan", "IN_PRODUCTION", 3, [["lam", 500, "Bucket (20 kg)", "20", 135]]],
  ["sai", "READY_TO_DISPATCH", 4, [["wood", 800, "Bucket (20 kg)", "20", 108]]],
  ["baner", "LR_GENERATED", 5, [["sil", 120, "Cartridge (310 ml)", "0.31", 170]]],
  ["mahalaxmi", "DISPATCHED", 0, [["lam", 300, "Bucket (20 kg)", "20", 138]]],
  ["sinhgad", "DISPATCHED", 6, [["tile", 500, "Bucket (20 kg)", "20", 40]]],
  ["shree", "DELIVERED", 14, [["wood", 400, "Bucket (20 kg)", "20", 109]]],
  ["om", "ON_HOLD", 3, [["pu", 80, "Cartridge (310 ml)", "0.31", 295]]],
];

const PIPELINE: OrderStatus[] = [
  "ORDER_PLACED",
  "IN_PRODUCTION",
  "READY_TO_DISPATCH",
  "LR_GENERATED",
  "DISPATCHED",
  "DELIVERED",
];

function fyPrefix(): string {
  const now = new Date();
  const fy = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return `SB/${two(fy)}-${two(fy + 1)}/`;
}

async function ensureUser(
  admin: ReturnType<typeof supabaseAdmin>,
  account: (typeof REVIEW_ACCOUNTS)[number],
  organizationId: string,
): Promise<string> {
  const existing = await db.profile.findUnique({
    where: { email: account.email },
    select: { id: true, memberships: { select: { organizationId: true } } },
  });
  if (existing?.memberships.some((m) => m.organizationId !== organizationId)) {
    throw new Error(
      `${account.email} is a member of another company. Remove that membership first — a review account must belong to the demo company only.`,
    );
  }

  let userId = existing?.id ?? null;
  if (!userId) {
    const created = await admin.auth.admin.createUser({
      email: account.email,
      email_confirm: true,
      app_metadata: { active_org_id: organizationId },
    });
    if (created.error || !created.data.user) {
      // The auth user may be left over from an account a reviewer
      // deleted (the Profile is anonymised, the address is free again)
      // or from a half-finished run.
      const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list.data?.users.find((u) => u.email?.toLowerCase() === account.email);
      if (!found) throw new Error(`Could not create ${account.email}: ${created.error?.message}`);
      userId = found.id;
    } else {
      userId = created.data.user.id;
    }
  }
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { active_org_id: organizationId },
  });

  const profile = {
    businessName: DEMO_ORG_NAME,
    ownerName: account.name,
    phone: PHONES[account.role],
    email: account.email,
    isActive: true,
    deletedAt: null,
    deactivatedAt: null,
  };
  await db.profile.upsert({
    where: { id: userId },
    // Profile.role is the deprecated mirror; a trigger recomputes it
    // from Membership, which is what every permission check reads.
    create: { id: userId, role: "STAFF", ...profile },
    update: profile,
  });
  await db.membership.upsert({
    where: { organizationId_profileId: { organizationId, profileId: userId } },
    create: {
      organizationId,
      profileId: userId,
      role: account.role,
      isOwner: account.role === "ADMIN",
      isActive: true,
    },
    update: { role: account.role, isOwner: account.role === "ADMIN", isActive: true },
  });
  return userId;
}

async function main() {
  const admin = supabaseAdmin();

  // ── Company ───────────────────────────────────────────────────────
  let org = await db.organization.findUnique({ where: { slug: DEMO_ORG_SLUG } });
  if (org && org.name !== DEMO_ORG_NAME) {
    throw new Error(`A company with slug ${DEMO_ORG_SLUG} exists but is named "${org.name}". Not touching it.`);
  }
  const orgData = {
    name: DEMO_ORG_NAME,
    city: "Pune",
    state: "Maharashtra",
    industry: "Adhesives & sealants (demo)",
    // Never trial-expires, never locked by the billing cron.
    plan: "BUSINESS" as const,
    status: "ACTIVE" as const,
    billingExempt: true,
    trialEndsAt: null,
    lockedAt: null,
    lockReason: null,
    pastDueSince: null,
    deletionRequestedAt: null,
    deletionScheduledFor: null,
    deletedAt: null,
  };
  org = org
    ? await db.organization.update({ where: { id: org.id }, data: orgData })
    : await db.organization.create({ data: { slug: DEMO_ORG_SLUG, ...orgData } });
  const organizationId = org.id;

  const settings = {
    onboardingDone: true,
    companyAddress: "Unit 5, Sahyadri Industrial Estate, Bhosari",
    companyState: "Maharashtra",
    companyCityPin: "Pune 411026",
    defaultCreditDays: 30,
    brandList: BRANDS,
    packingList: PACKINGS,
    // The demo never sends anything to anyone.
    autoRemindersEnabled: false,
    tallyEnabled: false,
    requireAppLock: false,
    sampleDataSeeded: true,
  };
  await db.businessSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...settings },
    update: settings,
  });

  // ── People ────────────────────────────────────────────────────────
  const ids = {} as Record<Role, string>;
  for (const account of REVIEW_ACCOUNTS) {
    ids[account.role] = await ensureUser(admin, account, organizationId);
  }
  const { ADMIN: managerId, STAFF: salesId, FACTORY: factoryId } = ids;

  // ── Reset the demo company's business rows (this company ONLY) ────
  const scope = { organizationId };
  await db.action.deleteMany({ where: scope });
  await db.paymentDocument.deleteMany({ where: scope });
  await db.payment.deleteMany({ where: scope });
  await db.paymentLink.deleteMany({ where: scope });
  await db.message.deleteMany({ where: scope });
  await db.orderComment.deleteMany({ where: scope });
  await db.orderDocument.deleteMany({ where: scope });
  await db.dispatchLot.deleteMany({ where: scope });
  await db.orderStatusEvent.deleteMany({ where: scope });
  await db.salesOrderItem.deleteMany({ where: scope });
  await db.salesOrder.deleteMany({ where: scope });
  await db.invoice.deleteMany({ where: scope });
  await db.party.deleteMany({ where: scope });
  await db.product.deleteMany({ where: scope });
  await db.stockItem.deleteMany({ where: scope });
  await db.orgNumberSequence.deleteMany({ where: scope });
  // One phone per account: clear old review devices so the next
  // reviewer's phone registers cleanly.
  await db.device.deleteMany({ where: { profileId: { in: [managerId, salesId, factoryId] } } });

  // ── Catalogue + stock ─────────────────────────────────────────────
  const productId = {} as Record<ProductKey, string>;
  for (const [i, p] of Array.from(PRODUCTS.entries())) {
    const row = await db.product.create({
      data: { organizationId, name: p.name, brand: p.brand, code: p.code, floorRate: p.floor, sortOrder: i },
    });
    productId[p.key] = row.id;
  }
  const stock = [2400, 1150, 0, 5200, 8, 310];
  for (const [i, p] of Array.from(PRODUCTS.entries())) {
    await db.stockItem.create({
      data: {
        organizationId,
        name: `${p.brand} ${p.name}`,
        category: p.brand,
        unit: "kg",
        closingQty: stock[i]!,
        lastSyncedAt: daysAgo(0),
      },
    });
  }

  // ── Customers ─────────────────────────────────────────────────────
  const partyId = {} as Record<PartyKey, string>;
  for (const [i, p] of Array.from(PARTIES.entries())) {
    const row = await db.party.create({
      data: {
        organizationId,
        name: p.name,
        contactPerson: p.contact,
        phone: `99999000${String(10 + i)}`,
        address: p.address,
        city: "Pune",
        state: "Maharashtra",
        creditLimit: p.limit,
        creditDays: p.days,
        assignedToId: salesId,
        // Nobody in the demo is ever messaged.
        consentStatus: "UNKNOWN",
      },
    });
    partyId[p.key] = row.id;
  }

  // ── Invoices + what is still owed ─────────────────────────────────
  const owed = new Map<PartyKey, number>();
  const firstInvoice = new Map<PartyKey, string>();
  for (const [i, [party, amount, overdue, paid]] of Array.from(INVOICES.entries())) {
    const dueDate = daysAgo(overdue);
    const creditDays = PARTIES.find((p) => p.key === party)!.days;
    const inv = await db.invoice.create({
      data: {
        organizationId,
        invoiceNumber: `SD/${String(1001 + i)}`,
        partyId: partyId[party],
        invoiceDate: new Date(dueDate.getTime() - creditDays * DAY),
        dueDate,
        totalAmount: amount,
        paidAmount: paid,
        status: paid > 0 ? "PARTIAL" : overdue > 0 ? "OVERDUE" : "UNPAID",
      },
    });
    if (!firstInvoice.has(party)) firstInvoice.set(party, inv.id);
    owed.set(party, (owed.get(party) ?? 0) + amount - paid);
  }

  // ── Payments already received (the two part-paid invoices + recent)
  const payments: [PartyKey, number, number, "UPI" | "NEFT" | "CHEQUE", string, boolean][] = [
    ["mahalaxmi", 20000, 6, "UPI", "UPI 428817365120", true],
    ["om", 100000, 3, "NEFT", "UTR HDFCN52026100312", true],
    ["sinhgad", 15000, 1, "CHEQUE", "Chq 004417", false],
  ];
  for (const [party, amount, ago, method, reference, againstInvoice] of payments) {
    await db.payment.create({
      data: {
        organizationId,
        partyId: partyId[party],
        invoiceId: againstInvoice ? (firstInvoice.get(party) ?? null) : null,
        amount,
        paymentDate: daysAgo(ago),
        method,
        reference,
        recordedById: salesId,
      },
    });
    if (!againstInvoice) owed.set(party, Math.max(0, (owed.get(party) ?? 0) - amount));
  }
  // A DB trigger may already have recomputed these from the rows above;
  // set them explicitly so the demo does not depend on it.
  for (const p of PARTIES) {
    await db.party.update({
      where: { id: partyId[p.key] },
      data: { totalOutstanding: owed.get(p.key) ?? 0 },
    });
  }

  // ── Follow-ups: one broken promise, one due today, one for later ──
  const followUps: [PartyKey, number, number, number, string][] = [
    // customer, promised amount, promise date (days from now), recorded N days ago, note
    ["deccan", 58900, -4, 9, "Said the cheque will be ready by the weekend."],
    ["sai", 70000, 0, 3, "Will transfer half today, balance next week."],
    ["mahalaxmi", 52800, 5, 1, "Waiting for their site payment; confirmed the date."],
  ];
  for (const [party, amount, promiseIn, ago, notes] of followUps) {
    await db.action.create({
      data: {
        organizationId,
        partyId: partyId[party],
        performedById: salesId,
        type: "CALL",
        outcome: "PROMISE_TO_PAY",
        promiseAmount: amount,
        promiseDate: daysAhead(promiseIn),
        nextFollowUpDate: daysAhead(promiseIn),
        notes,
        contactedPerson: PARTIES.find((p) => p.key === party)!.contact,
        performedAt: daysAgo(ago),
      },
    });
  }

  // ── Orders ────────────────────────────────────────────────────────
  const prefix = fyPrefix();
  for (const [i, [party, status, ago, lines]] of Array.from(ORDERS.entries())) {
    const placedAt = daysAgo(ago);
    const subtotal = lines.reduce((s, [, qty, , , rate]) => s + qty * rate, 0);
    const gst = Math.round(subtotal * 0.18 * 100) / 100;
    const first = lines[0]!;
    const reached = PIPELINE.indexOf(status === "ON_HOLD" ? "IN_PRODUCTION" : status);
    const lineStage =
      reached >= PIPELINE.indexOf("READY_TO_DISPATCH")
        ? "READY"
        : reached === PIPELINE.indexOf("IN_PRODUCTION")
          ? "IN_PRODUCTION"
          : "PENDING";
    const approved = status !== "PENDING_APPROVAL";

    const order = await db.salesOrder.create({
      data: {
        organizationId,
        orderNumber: `${prefix}${String(i + 1).padStart(4, "0")}`,
        partyId: partyId[party],
        salespersonId: salesId,
        productId: productId[first[0]],
        brand: PRODUCTS.find((p) => p.key === first[0])!.brand,
        quantity: first[1],
        quantityUnit: "KG",
        packingType: first[2],
        sizeKg: first[3],
        productRate: String(first[4]),
        orderValue: subtotal,
        taxableAmount: subtotal,
        gstAmount: gst,
        grandTotal: subtotal + gst,
        paymentTerm: "CREDIT",
        transportType: "PAID",
        expectedDeliveryDate: daysAhead(4 - ago),
        dispatchLocation: PARTIES.find((p) => p.key === party)!.address + ", Pune",
        tokenType: "Without Token",
        currentStatus: "ORDER_PLACED",
        approvedById: approved ? managerId : null,
        approvedAt: approved ? placedAt : null,
        createdAt: placedAt,
      },
    });
    for (const [n, [product, qty, packing, size, rate]] of Array.from(lines.entries())) {
      await db.salesOrderItem.create({
        data: {
          organizationId,
          salesOrderId: order.id,
          productId: productId[product],
          brand: PRODUCTS.find((p) => p.key === product)!.brand,
          quantity: qty,
          quantityUnit: "KG",
          packingType: packing,
          sizeKg: size,
          productRate: String(rate),
          lineValue: qty * rate,
          lineNumber: n + 1,
          productionStatus: lineStage,
        },
      });
    }

    // Timeline: every step up to the current one, a few hours apart.
    const steps: OrderStatus[] =
      status === "PENDING_APPROVAL"
        ? ["PENDING_APPROVAL"]
        : status === "ON_HOLD"
          ? ["ORDER_PLACED", "IN_PRODUCTION", "ON_HOLD"]
          : PIPELINE.slice(0, reached + 1);
    for (const [n, step] of Array.from(steps.entries())) {
      await db.orderStatusEvent.create({
        data: {
          organizationId,
          salesOrderId: order.id,
          status: step,
          updatedById: step === "ORDER_PLACED" || step === "PENDING_APPROVAL" ? salesId : factoryId,
          createdAt: new Date(Math.min(Date.now(), placedAt.getTime() + n * 5 * 60 * 60 * 1000)),
        },
      });
    }
    // Written last: triggers on the line rows may have adjusted the
    // header while the lines went in.
    await db.salesOrder.update({
      where: { id: order.id },
      data: {
        currentStatus: status,
        deliveredAt: status === "DELIVERED" ? daysAgo(Math.max(0, ago - 3)) : null,
        ...(status === "ON_HOLD"
          ? {
              statusBeforeHold: "IN_PRODUCTION" as const,
              holdReasonCategory: "RAW_MATERIAL_SHORTAGE" as const,
              holdReason: "Nozzle caps expected on Thursday.",
            }
          : {}),
      },
    });
  }

  console.log(`Syncit Demo ready (${organizationId}).`);
  console.log(`  ${PARTIES.length} customers, ${INVOICES.length} invoices, ${ORDERS.length} orders, ${PRODUCTS.length} products.`);
  for (const a of REVIEW_ACCOUNTS) console.log(`  ${a.email}  →  ${a.role}`);
  console.log("Sign in with REVIEW_LOGIN_CODE (set it, and REVIEW_LOGIN_EMAILS, on the web deployment).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
