#!/usr/bin/env node
// PayTrack Tally sync agent — runs on the SAME network as Tally (usually
// the machine running Tally itself) and pushes parties + open invoices to
// your PayTrack deployment. Tally's XML-over-HTTP port is LAN-only, so
// the cloud cannot pull; this agent bridges the gap.
//
// Prerequisites (once, in Tally):
//   Gateway of Tally → F12 Configure → Advanced → "Allow ODBC/HTTP" = Yes
//   (default port 9000; keep Tally open with the company loaded)
//
// Usage:
//   TALLY_HOST=localhost TALLY_PORT=9000 \
//   PAYTRACK_URL=https://your-deployment.example \
//   TALLY_SYNC_SECRET=<same value as the deployment env> \
//   node tally-sync-agent.mjs
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

const VOUCHERS_REQUEST = `<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>PayTrackSales</ID></HEADER>
  <BODY><DESC>
    <TDL><TDLMESSAGE>
      <COLLECTION NAME="PayTrackSales" ISMODIFY="No">
        <TYPE>Voucher</TYPE>
        <FILTERS>PayTrackIsSales</FILTERS>
        <NATIVEMETHOD>DATE</NATIVEMETHOD>
        <NATIVEMETHOD>VOUCHERNUMBER</NATIVEMETHOD>
        <NATIVEMETHOD>PARTYLEDGERNAME</NATIVEMETHOD>
        <NATIVEMETHOD>AMOUNT</NATIVEMETHOD>
        <NATIVEMETHOD>GUID</NATIVEMETHOD>
      </COLLECTION>
      <SYSTEM TYPE="Formulae" NAME="PayTrackIsSales">$$IsSales:$VoucherTypeName</SYSTEM>
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

function tallyDate(v) {
  // Tally dates arrive as YYYYMMDD
  const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : v;
}

function addDaysIso(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Extract → map to the CSV-import row shape ───────────────────────

async function main() {
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

  console.log("Reading sales vouchers…");
  const voucherXml = await tallyRequest(VOUCHERS_REQUEST);
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
      return {
        partyName,
        invoiceNumber: value(b, "VOUCHERNUMBER"),
        invoiceDate,
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)
          ? addDaysIso(invoiceDate, credit)
          : "",
        totalAmount: value(b, "AMOUNT").replace(/[()-]/g, ""),
        tallyRef: guid ? `voucher:${guid}` : "",
      };
    })
    .filter((v) => v.partyName && v.invoiceNumber && v.totalAmount);
  console.log(`  ${invoices.length} sales vouchers`);

  console.log(`Pushing to ${PAYTRACK_URL}/api/sync/tally…`);
  const res = await fetch(`${PAYTRACK_URL}/api/sync/tally`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify({ parties, invoices }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error("Sync failed:", body);
    process.exit(1);
  }
  console.log("Done:", JSON.stringify(body, null, 2));
}

main().catch((e) => {
  console.error(
    `Sync failed: ${e.message}\n` +
      "Check that Tally is open with the company loaded and HTTP access " +
      "is enabled (F12 → Advanced → Allow ODBC/HTTP)."
  );
  process.exit(1);
});
