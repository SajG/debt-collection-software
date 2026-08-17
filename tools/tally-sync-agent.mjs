#!/usr/bin/env node
// PayTrack Tally sync agent — runs on the SAME network as Tally (usually
// the machine running Tally itself) and pushes parties, open invoices, and
// stock items to your PayTrack deployment. Tally's XML-over-HTTP port is
// LAN-only, so the cloud cannot pull; this agent bridges the gap.
//
// Prerequisites (once, in Tally):
//   Gateway of Tally → F12 Configure → Advanced → "Allow ODBC/HTTP" = Yes
//   (default port 9000; keep Tally open with the company loaded)
//
// Usage:
//   TALLY_HOST=localhost TALLY_PORT=9000 \
//   PAYTRACK_URL=https://your-deployment.example \
//   TALLY_SYNC_SECRET=<same value as the deployment env> \
//   node tally-sync-agent.mjs [--full] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]
//
// By default the voucher pull is INCREMENTAL: the agent asks PayTrack for
// the date of the last successful invoice sync and requests only vouchers
// on/after that date (with a small overlap buffer to catch back-dated
// entries). This avoids Tally hangs on large ledgers.
//
//   --full         Ignore last-sync state; pull everything (use sparingly).
//   --from=DATE    Override the start date (YYYY-MM-DD).
//   --to=DATE      Override the end date (YYYY-MM-DD, default: today).
//   --lookback=N   Overlap in days when computing FROM (default: 3).
//
// Schedule it with Windows Task Scheduler / cron for a nightly sync.
// Requires Node 18+ (built-in fetch). No npm dependencies.

const TALLY_HOST = process.env.TALLY_HOST || "localhost";
const TALLY_PORT = Number(process.env.TALLY_PORT || 9000);
const PAYTRACK_URL = process.env.PAYTRACK_URL;
const SECRET = process.env.TALLY_SYNC_SECRET;

if (!PAYTRACK_URL || !SECRET) {
  console.error("Set PAYTRACK_URL and TALLY_SYNC_SECRET environment variables.");
  process.exit(1);
}

// ── CLI flags ───────────────────────────────────────────────────────

const flags = new Map();
for (const arg of process.argv.slice(2)) {
  if (arg === "--full") {
    flags.set("full", true);
  } else if (arg.startsWith("--")) {
    const [k, v] = arg.slice(2).split("=");
    flags.set(k, v ?? true);
  }
}

const LOOKBACK_DAYS = Number(flags.get("lookback") ?? 3);

// ── Throttle helper — keeps Tally responsive between big requests ───

const REQUEST_GAP_MS = 750;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Date helpers ────────────────────────────────────────────────────

function toTallyDate(d) {
  // Tally expects YYYYMMDD
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}${mo}${da}`;
}

function parseYmd(s) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function addDaysIso(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function tallyDate(v) {
  // Tally emits dates as YYYYMMDD when reading them out
  const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : v;
}

// ── Determine voucher date window ───────────────────────────────────

async function resolveVoucherWindow() {
  const overrideTo = flags.get("to") ? parseYmd(flags.get("to")) : null;
  const overrideFrom = flags.get("from") ? parseYmd(flags.get("from")) : null;
  const to = overrideTo ?? new Date();

  if (flags.get("full")) {
    console.log("Full sync mode — pulling entire voucher history.");
    return { from: null, to };
  }

  if (overrideFrom) {
    return { from: overrideFrom, to };
  }

  try {
    const res = await fetch(`${PAYTRACK_URL}/api/sync/tally/state`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    if (!res.ok) {
      console.warn(
        `  State endpoint returned ${res.status}; falling back to full sync.`
      );
      return { from: null, to };
    }
    const body = await res.json();
    if (!body.lastInvoiceSyncAt) {
      console.log(
        "  No previous invoice sync recorded — running first full sync."
      );
      return { from: null, to };
    }
    const last = new Date(body.lastInvoiceSyncAt);
    // Roll FROM back a few days to catch back-dated entries + slow book-keepers.
    const from = addDays(last, -LOOKBACK_DAYS);
    return { from, to };
  } catch (e) {
    console.warn(
      `  Could not reach PayTrack state endpoint (${e.message}); falling back to full sync.`
    );
    return { from: null, to };
  }
}

// ── Tally XML request envelopes ─────────────────────────────────────

const LEDGERS_REQUEST = `<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>PayTrackLedgers</ID></HEADER>
  <BODY><DESC>
    <TDL><TDLMESSAGE>
      <COLLECTION NAME="PayTrackLedgers" ISMODIFY="No">
        <TYPE>Ledger</TYPE>
        <CHILDOF>Sundry Debtors</CHILDOF>
        <BELOWCHILDOF>Yes</BELOWCHILDOF>
        <NATIVEMETHOD>NAME</NATIVEMETHOD>
        <NATIVEMETHOD>PARTYGSTIN</NATIVEMETHOD>
        <NATIVEMETHOD>LEDGERPHONE</NATIVEMETHOD>
        <NATIVEMETHOD>EMAIL</NATIVEMETHOD>
        <NATIVEMETHOD>LEDGERCONTACT</NATIVEMETHOD>
        <NATIVEMETHOD>ADDRESS</NATIVEMETHOD>
        <NATIVEMETHOD>LEDSTATENAME</NATIVEMETHOD>
        <NATIVEMETHOD>BILLCREDITPERIOD</NATIVEMETHOD>
      </COLLECTION>
    </TDLMESSAGE></TDL>
  </DESC></BODY>
</ENVELOPE>`;

// Date window is injected via STATICVARIABLES so Tally's own aggregation
// engine can prune the voucher set at source — this is the difference
// between a snappy 500-voucher pull and a Tally-freezing 50k-voucher pull.
function buildVouchersRequest({ from, to }) {
  const staticVars =
    from && to
      ? `<STATICVARIABLES>
      <SVFROMDATE Type="Date">${toTallyDate(from)}</SVFROMDATE>
      <SVTODATE Type="Date">${toTallyDate(to)}</SVTODATE>
      <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    </STATICVARIABLES>`
      : "";

  return `<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>PayTrackSales</ID></HEADER>
  <BODY><DESC>
    ${staticVars}
    <TDL><TDLMESSAGE>
      <COLLECTION NAME="PayTrackSales" ISMODIFY="No">
        <TYPE>Voucher</TYPE>
        <FILTERS>PayTrackIsSales</FILTERS>
        <NATIVEMETHOD>DATE</NATIVEMETHOD>
        <NATIVEMETHOD>VOUCHERNUMBER</NATIVEMETHOD>
        <NATIVEMETHOD>PARTYLEDGERNAME</NATIVEMETHOD>
        <NATIVEMETHOD>AMOUNT</NATIVEMETHOD>
        <NATIVEMETHOD>GUID</NATIVEMETHOD>
        <NATIVEMETHOD>CATEGORY</NATIVEMETHOD>
        <NATIVEMETHOD>COSTCENTREALLOCATIONS</NATIVEMETHOD>
      </COLLECTION>
      <SYSTEM TYPE="Formulae" NAME="PayTrackIsSales">$$IsSales:$VoucherTypeName</SYSTEM>
    </TDLMESSAGE></TDL>
  </DESC></BODY>
</ENVELOPE>`;
}

const STOCKITEMS_REQUEST = `<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>PayTrackStockItems</ID></HEADER>
  <BODY><DESC>
    <TDL><TDLMESSAGE>
      <COLLECTION NAME="PayTrackStockItems" ISMODIFY="No">
        <TYPE>StockItem</TYPE>
        <NATIVEMETHOD>NAME</NATIVEMETHOD>
        <NATIVEMETHOD>PARENT</NATIVEMETHOD>
        <NATIVEMETHOD>BASEUNITS</NATIVEMETHOD>
        <NATIVEMETHOD>CLOSINGBALANCE</NATIVEMETHOD>
        <NATIVEMETHOD>GUID</NATIVEMETHOD>
      </COLLECTION>
    </TDLMESSAGE></TDL>
  </DESC></BODY>
</ENVELOPE>`;

async function tallyRequest(xml) {
  const res = await fetch(`http://${TALLY_HOST}:${TALLY_PORT}`, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xml,
  });
  if (!res.ok) throw new Error(`Tally HTTP ${res.status}`);
  return res.text();
}

// Minimal XML value extraction — Tally emits flat, well-formed tags per
// record; a full XML parser dependency is not worth it for this script.
function blocks(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function value(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m
    ? m[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#\d+;/g, "")
        .trim()
    : "";
}

// ── Extract → map to the CSV-import row shape ───────────────────────

async function main() {
  const window = await resolveVoucherWindow();
  if (window.from) {
    console.log(
      `Incremental voucher window: ${window.from.toISOString().slice(0, 10)} → ${window.to.toISOString().slice(0, 10)} (lookback ${LOOKBACK_DAYS}d).`
    );
  }

  console.log(`Reading ledgers from Tally at ${TALLY_HOST}:${TALLY_PORT}…`);
  const ledgerXml = await tallyRequest(LEDGERS_REQUEST);
  const ledgers = blocks(ledgerXml, "LEDGER");

  const parties = ledgers
    .map((b) => {
      const name = value(b, "NAME");
      const creditDays = (value(b, "BILLCREDITPERIOD").match(/\d+/) || [""])[0];
      return {
        name,
        gstNumber: value(b, "PARTYGSTIN"),
        phone: value(b, "LEDGERPHONE"),
        email: value(b, "EMAIL"),
        contactPerson: value(b, "LEDGERCONTACT"),
        address: value(b, "ADDRESS"),
        state: value(b, "LEDSTATENAME"),
        creditDays,
        tallyRef: `ledger:${name}`,
      };
    })
    .filter((p) => p.name);
  console.log(`  ${parties.length} parties under Sundry Debtors`);

  await sleep(REQUEST_GAP_MS);

  console.log("Reading sales vouchers…");
  const voucherXml = await tallyRequest(buildVouchersRequest(window));
  const vouchers = blocks(voucherXml, "VOUCHER");

  const partyCredit = new Map(
    parties.map((p) => [p.name.toLowerCase(), Number(p.creditDays) || 30])
  );

  const invoices = vouchers
    .map((b) => {
      const partyName = value(b, "PARTYLEDGERNAME");
      const invoiceDate = tallyDate(value(b, "DATE"));
      const credit = partyCredit.get(partyName.toLowerCase()) ?? 30;
      const guid = value(b, "GUID");
      const costCentre =
        value(b, "COSTCENTRENAME") || value(b, "CATEGORY") || "";
      return {
        partyName,
        invoiceNumber: value(b, "VOUCHERNUMBER"),
        invoiceDate,
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)
          ? addDaysIso(invoiceDate, credit)
          : "",
        totalAmount: value(b, "AMOUNT").replace(/[()-]/g, ""),
        tallyRef: guid ? `voucher:${guid}` : "",
        costCentre,
      };
    })
    .filter((v) => v.partyName && v.invoiceNumber && v.totalAmount);
  console.log(
    `  ${invoices.length} sales vouchers${window.from ? " in window" : ""}`
  );

  // Propagate voucher cost centres onto the matching party rows so the API
  // can auto-assign salespeople from Profile.costCentreName.
  const partyCostCentre = new Map();
  for (const inv of invoices) {
    if (!inv.costCentre) continue;
    partyCostCentre.set(inv.partyName.toLowerCase(), inv.costCentre);
  }
  for (const p of parties) {
    const cc = partyCostCentre.get(p.name.toLowerCase());
    if (cc) p.costCentre = cc;
  }

  await sleep(REQUEST_GAP_MS);

  console.log("Reading stock items…");
  const stockXml = await tallyRequest(STOCKITEMS_REQUEST);
  const stockBlocks = blocks(stockXml, "STOCKITEM");
  const stockItems = stockBlocks
    .map((b) => {
      const name = value(b, "NAME");
      const guid = value(b, "GUID");
      // CLOSINGBALANCE often looks like "123.000 nos" — keep the numeric part
      const closingRaw = value(b, "CLOSINGBALANCE").replace(/[()-]/g, "");
      const closingQty = (closingRaw.match(/-?[\d.]+/) || [""])[0];
      return {
        name,
        category: value(b, "PARENT"),
        unit: value(b, "BASEUNITS"),
        closingQty,
        tallyRef: guid ? `stock:${guid}` : name ? `stock:${name}` : "",
      };
    })
    .filter((s) => s.name && s.closingQty !== "" && s.tallyRef);
  console.log(`  ${stockItems.length} stock items`);

  console.log(`Pushing to ${PAYTRACK_URL}/api/sync/tally…`);
  const res = await fetch(`${PAYTRACK_URL}/api/sync/tally`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify({ parties, invoices, stockItems }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error("Sync failed:", body);
    process.exit(1);
  }
  console.log("Ingest:", JSON.stringify(body, null, 2));

  // Trigger the reconcile pass right away — this promotes any pending
  // "new customer" sales orders to real ledger Parties now that Tally has
  // handed them over. Same bearer secret is accepted server-side.
  await sleep(REQUEST_GAP_MS);
  console.log("Reconciling new-customer orders…");
  try {
    const rec = await fetch(`${PAYTRACK_URL}/api/cron/reconcile-orders`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const recBody = await rec.json();
    if (!rec.ok) {
      console.warn("  Reconcile failed:", recBody);
    } else {
      console.log(
        `  scanned=${recBody.scanned} matched=${recBody.matched} ambiguous=${recBody.ambiguous} unmatched=${recBody.unmatched}`
      );
      if (recBody.ambiguousNames?.length) {
        console.warn(
          `  Ambiguous names (multiple ledger matches — resolve manually): ${recBody.ambiguousNames.join(", ")}`
        );
      }
    }
  } catch (e) {
    console.warn(`  Reconcile call failed: ${e.message}`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(
    `Sync failed: ${e.message}\n` +
      "Check that Tally is open with the company loaded and HTTP access " +
      "is enabled (F12 → Advanced → Allow ODBC/HTTP)."
  );
  process.exit(1);
});
