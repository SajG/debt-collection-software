// Reusable sync engine. Called by both the CLI (`tally-sync-agent.mjs`)
// and the Windows Service daemon. Pure I/O + Node 18+ built-ins, no deps.

const REQUEST_GAP_MS = 750;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toTallyDate(d) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}${mo}${da}`;
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
  const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : v;
}

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
        <NATIVEMETHOD>CLOSINGBALANCE</NATIVEMETHOD>
      </COLLECTION>
    </TDLMESSAGE></TDL>
  </DESC></BODY>
</ENVELOPE>`;

function buildReceiptsRequest({ from, to }) {
  const staticVars =
    from && to
      ? `<STATICVARIABLES>
      <SVFROMDATE Type="Date">${toTallyDate(from)}</SVFROMDATE>
      <SVTODATE Type="Date">${toTallyDate(to)}</SVTODATE>
      <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    </STATICVARIABLES>`
      : "";
  // Receipt vouchers. BILLALLOCATIONS.LIST lives inside the
  // <LEDGERENTRIES.LIST> for the customer ledger (the credit side of
  // the receipt). We fetch the whole voucher and parse allocations
  // client-side because Tally's collection filters can't pull the
  // nested list cleanly.
  return `<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>PayTrackReceipts</ID></HEADER>
  <BODY><DESC>
    ${staticVars}
    <TDL><TDLMESSAGE>
      <COLLECTION NAME="PayTrackReceipts" ISMODIFY="No" FETCH="AllLedgerEntries.*, LedgerEntries.*, BillAllocations.*">
        <TYPE>Voucher</TYPE>
        <FILTERS>PayTrackIsReceipt</FILTERS>
      </COLLECTION>
      <SYSTEM TYPE="Formulae" NAME="PayTrackIsReceipt">$$IsReceipt:$VoucherTypeName</SYSTEM>
    </TDLMESSAGE></TDL>
  </DESC></BODY>
</ENVELOPE>`;
}

// Tally amounts arrive as "1,234.50" for debits and "-1,234.50" (or
// "(1,234.50)") for credits. Strip everything but digits, minus and
// decimal so the sign survives.
function tallyAmount(raw) {
  if (!raw) return 0;
  const s = String(raw).replace(/[₹,\s]/g, "").replace(/[()]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

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

async function tallyRequest(host, port, xml) {
  const res = await fetch(`http://${host}:${port}`, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xml,
  });
  if (!res.ok) throw new Error(`Tally HTTP ${res.status}`);
  return res.text();
}

async function resolveWindow({ paytrackUrl, secret, full, from, to, lookback, log }) {
  const overrideTo = to ? new Date(to) : null;
  const overrideFrom = from ? new Date(from) : null;
  const endTo = overrideTo ?? new Date();

  if (full) {
    log("Full sync mode — pulling entire voucher history.");
    return { from: null, to: endTo };
  }
  if (overrideFrom) return { from: overrideFrom, to: endTo };

  try {
    const res = await fetch(`${paytrackUrl}/api/sync/tally/state`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) {
      log(`State endpoint ${res.status}; falling back to full sync.`);
      return { from: null, to: endTo };
    }
    const body = await res.json();
    if (!body.lastInvoiceSyncAt) {
      log("No previous sync — first full sync.");
      return { from: null, to: endTo };
    }
    return { from: addDays(new Date(body.lastInvoiceSyncAt), -lookback), to: endTo };
  } catch (e) {
    log(`State call failed (${e.message}); falling back to full sync.`);
    return { from: null, to: endTo };
  }
}

/**
 * Run one sync pass. Returns a summary object; throws on hard failure.
 * config = { tallyHost, tallyPort, paytrackUrl, secret, full?, from?, to?, lookback? }
 * opts   = { log? }  — log defaults to console.log
 */
export async function runSync(config, opts = {}) {
  const {
    tallyHost = "localhost",
    tallyPort = 9000,
    paytrackUrl,
    secret,
    full = false,
    from = null,
    to = null,
    lookback = 3,
  } = config;
  const log = opts.log ?? ((m) => console.log(m));
  if (!paytrackUrl || !secret) {
    throw new Error("paytrackUrl and secret are required");
  }

  const started = Date.now();
  const window = await resolveWindow({ paytrackUrl, secret, full, from, to, lookback, log });
  if (window.from) {
    log(
      `Window: ${window.from.toISOString().slice(0, 10)} → ${window.to.toISOString().slice(0, 10)}`,
    );
  }

  log(`Reading ledgers from Tally at ${tallyHost}:${tallyPort}…`);
  const ledgerXml = await tallyRequest(tallyHost, tallyPort, LEDGERS_REQUEST);
  const parties = blocks(ledgerXml, "LEDGER")
    .map((b) => {
      const name = value(b, "NAME");
      const creditDays = (value(b, "BILLCREDITPERIOD").match(/\d+/) || [""])[0];
      // Tally's ClosingBalance for a Sundry Debtors ledger is positive
      // when the customer owes us. Preserve the sign so the recon
      // report can highlight advances (negative outstanding) too.
      const closing = tallyAmount(value(b, "CLOSINGBALANCE"));
      return {
        name,
        gstNumber: value(b, "PARTYGSTIN"),
        phone: value(b, "LEDGERPHONE"),
        email: value(b, "EMAIL"),
        contactPerson: value(b, "LEDGERCONTACT"),
        address: value(b, "ADDRESS"),
        state: value(b, "LEDSTATENAME"),
        creditDays,
        tallyOutstanding: String(closing),
        tallyRef: `ledger:${name}`,
      };
    })
    .filter((p) => p.name);
  log(`  ${parties.length} parties`);

  await sleep(REQUEST_GAP_MS);

  log("Reading sales vouchers…");
  const voucherXml = await tallyRequest(tallyHost, tallyPort, buildVouchersRequest(window));
  const partyCredit = new Map(
    parties.map((p) => [p.name.toLowerCase(), Number(p.creditDays) || 30]),
  );
  const invoices = blocks(voucherXml, "VOUCHER")
    .map((b) => {
      const partyName = value(b, "PARTYLEDGERNAME");
      const invoiceDate = tallyDate(value(b, "DATE"));
      const credit = partyCredit.get(partyName.toLowerCase()) ?? 30;
      const guid = value(b, "GUID");
      const costCentre = value(b, "COSTCENTRENAME") || value(b, "CATEGORY") || "";
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
  log(`  ${invoices.length} vouchers`);

  const partyCostCentre = new Map();
  for (const inv of invoices) {
    if (inv.costCentre) partyCostCentre.set(inv.partyName.toLowerCase(), inv.costCentre);
  }
  for (const p of parties) {
    const cc = partyCostCentre.get(p.name.toLowerCase());
    if (cc) p.costCentre = cc;
  }

  await sleep(REQUEST_GAP_MS);

  log("Reading receipt vouchers…");
  const receiptXml = await tallyRequest(
    tallyHost,
    tallyPort,
    buildReceiptsRequest(window),
  );
  const receipts = blocks(receiptXml, "VOUCHER")
    .map((v) => {
      const guid = value(v, "GUID");
      const voucherNumber = value(v, "VOUCHERNUMBER");
      const date = tallyDate(value(v, "DATE"));
      // Every LedgerEntries.LIST inside a receipt is one leg of the
      // journal. The party ledger is the one that has BILLALLOCATIONS
      // (allocations are only meaningful against bills-outstanding
      // ledgers). Non-party legs are Bank / Cash / TDS accounts.
      const legs = blocks(v, "ALLLEDGERENTRIES.LIST").concat(
        blocks(v, "LEDGERENTRIES.LIST"),
      );
      let partyName = "";
      let totalAmount = 0;
      const allocations = [];
      for (const leg of legs) {
        const ledgerName = value(leg, "LEDGERNAME");
        const amount = tallyAmount(value(leg, "AMOUNT"));
        const bill = blocks(leg, "BILLALLOCATIONS.LIST");
        if (bill.length > 0) {
          partyName = ledgerName;
          // Amounts in a receipt on the party leg are credits (negative
          // in Tally XML). Flip to positive for our purposes.
          totalAmount = Math.abs(amount);
          for (const a of bill) {
            const invoiceNumber = value(a, "NAME");
            const allocatedAmount = Math.abs(tallyAmount(value(a, "AMOUNT")));
            const billType = value(a, "BILLTYPE"); // 'Agst Ref' | 'New Ref' | 'On Account' | 'Advance'
            allocations.push({
              invoiceNumber,
              amount: String(allocatedAmount),
              billType,
            });
          }
        }
      }
      return {
        voucherNumber,
        date,
        partyName,
        totalAmount: String(totalAmount),
        tallyRef: guid ? `receipt:${guid}` : "",
        allocations,
      };
    })
    .filter(
      (r) =>
        r.partyName &&
        r.tallyRef &&
        r.voucherNumber &&
        Number(r.totalAmount) > 0,
    );
  log(`  ${receipts.length} receipts`);

  await sleep(REQUEST_GAP_MS);

  log("Reading stock items…");
  const stockXml = await tallyRequest(tallyHost, tallyPort, STOCKITEMS_REQUEST);
  const stockItems = blocks(stockXml, "STOCKITEM")
    .map((b) => {
      const name = value(b, "NAME");
      const guid = value(b, "GUID");
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
  log(`  ${stockItems.length} stock items`);

  log(`Pushing to ${paytrackUrl}/api/sync/tally…`);
  const res = await fetch(`${paytrackUrl}/api/sync/tally`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ parties, invoices, receipts, stockItems }),
  });
  const ingest = await res.json();
  if (!res.ok) throw new Error(`Ingest failed: ${JSON.stringify(ingest)}`);

  await sleep(REQUEST_GAP_MS);
  log("Reconciling new-customer orders…");
  let reconcile = null;
  try {
    const rec = await fetch(`${paytrackUrl}/api/cron/reconcile-orders`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    reconcile = await rec.json();
    if (!rec.ok) log(`  Reconcile warned: ${JSON.stringify(reconcile)}`);
    else
      log(
        `  scanned=${reconcile.scanned} matched=${reconcile.matched} ambiguous=${reconcile.ambiguous} unmatched=${reconcile.unmatched}`,
      );
  } catch (e) {
    log(`  Reconcile call failed: ${e.message}`);
  }

  const durationMs = Date.now() - started;
  log(`Done in ${(durationMs / 1000).toFixed(1)}s.`);
  return {
    ok: true,
    durationMs,
    counts: {
      parties: parties.length,
      invoices: invoices.length,
      receipts: receipts.length,
      stockItems: stockItems.length,
    },
    ingest,
    reconcile,
  };
}
