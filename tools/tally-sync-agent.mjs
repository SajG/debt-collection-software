#!/usr/bin/env node
// SynWorks Tally sync agent (CLI). Thin wrapper around sync-core.mjs.
//
// Prerequisites (once, in Tally):
//   Gateway of Tally → F12 Configure → Advanced → "Allow ODBC/HTTP" = Yes
//   (default port 9000; keep Tally open with the company loaded)
//
// Usage:
//   TALLY_HOST=localhost TALLY_PORT=9000 \
//   SYNWORKS_URL=https://your-deployment.example \
//   TALLY_SYNC_SECRET=<same value as the deployment env> \
//   node tally-sync-agent.mjs [--full] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--lookback=N]
//
// Requires Node 18+ (built-in fetch). No npm dependencies.

import { runSync } from "./tally-connector/src/sync-core.mjs";

const flags = new Map();
for (const arg of process.argv.slice(2)) {
  if (arg === "--full") flags.set("full", true);
  else if (arg.startsWith("--")) {
    const [k, v] = arg.slice(2).split("=");
    flags.set(k, v ?? true);
  }
}

const config = {
  tallyHost: process.env.TALLY_HOST || "localhost",
  tallyPort: Number(process.env.TALLY_PORT || 9000),
  synworksUrl: process.env.SYNWORKS_URL,
  secret: process.env.TALLY_SYNC_SECRET,
  full: Boolean(flags.get("full")),
  from: flags.get("from") ?? null,
  to: flags.get("to") ?? null,
  lookback: Number(flags.get("lookback") ?? 3),
};

if (!config.synworksUrl || !config.secret) {
  console.error("Set SYNWORKS_URL and TALLY_SYNC_SECRET environment variables.");
  process.exit(1);
}

runSync(config, { log: (m) => console.log(m) }).catch((e) => {
  console.error(
    `Sync failed: ${e.message}\n` +
      "Check that Tally is open with the company loaded and HTTP access " +
      "is enabled (F12 → Advanced → Allow ODBC/HTTP).",
  );
  process.exit(1);
});
