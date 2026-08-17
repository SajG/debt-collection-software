// PayTrack Tally Connector — Windows Service daemon.
//
// - Runs the sync engine on a fixed interval (configurable).
// - Exposes a tiny HTTP API on 127.0.0.1:9876 so the tray app can query
//   status, trigger manual sync, and update config. Bound to loopback so
//   nothing outside the machine can hit it.
//
// Started by node-windows (install-service.js). Also runnable directly
// with `node service.js` for debugging.

const http = require("node:http");
const {
  readConfig,
  writeConfig,
  readState,
  writeState,
  appendLog,
  LOG_PATH,
} = require("./config");

const PORT = 9876;

let running = false;
let currentAbort = null;
let timer = null;

function log(msg) {
  appendLog(msg);
}

async function doSync({ full = false } = {}) {
  if (running) return { ok: false, error: "sync already running" };
  running = true;
  const started = new Date().toISOString();
  writeState({ ...readState(), runningSince: started });
  try {
    const cfg = readConfig();
    if (!cfg.paytrackUrl || !cfg.secret) {
      throw new Error("Not configured — set PayTrack URL and secret in tray Settings.");
    }
    log(`Sync start (full=${full})`);
    // Dynamic import — sync-core is ESM.
    const { runSync } = await import("./sync-core.mjs");
    const result = await runSync(
      {
        tallyHost: cfg.tallyHost,
        tallyPort: cfg.tallyPort,
        paytrackUrl: cfg.paytrackUrl,
        secret: cfg.secret,
        full,
        lookback: cfg.lookbackDays,
      },
      { log },
    );
    writeState({
      lastRunAt: new Date().toISOString(),
      lastResult: result,
      lastError: null,
      runningSince: null,
    });
    return { ok: true, result };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    log(`Sync failed: ${msg}`);
    writeState({
      ...readState(),
      lastRunAt: new Date().toISOString(),
      lastError: msg,
      runningSince: null,
    });
    return { ok: false, error: msg };
  } finally {
    running = false;
    currentAbort = null;
  }
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  const cfg = readConfig();
  const mins = Number(cfg.intervalMinutes || 0);
  if (mins <= 0) return; // manual-only
  timer = setTimeout(async () => {
    await doSync();
    scheduleNext();
  }, mins * 60 * 1000);
}

// ── Local HTTP API ────────────────────────────────────────────────────

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/status") {
      return json(res, 200, {
        running,
        state: readState(),
        config: safeConfig(readConfig()),
        logPath: LOG_PATH,
      });
    }
    if (req.method === "GET" && req.url === "/config") {
      return json(res, 200, safeConfig(readConfig()));
    }
    if (req.method === "POST" && req.url === "/config") {
      const body = await readBody(req);
      const merged = { ...readConfig(), ...body };
      writeConfig(merged);
      log("Config updated via tray");
      scheduleNext();
      return json(res, 200, safeConfig(readConfig()));
    }
    if (req.method === "POST" && req.url === "/sync") {
      const body = await readBody(req).catch(() => ({}));
      // Run async — tray doesn't wait for completion, it polls /status.
      doSync({ full: !!body.full });
      return json(res, 202, { started: true });
    }
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: "not found" });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
});

// Return config with the secret masked so the tray never displays it in cleartext
// unless the user explicitly re-enters.
function safeConfig(cfg) {
  return { ...cfg, secret: cfg.secret ? "••••••••" : "" };
}

server.listen(PORT, "127.0.0.1", () => {
  log(`Service listening on 127.0.0.1:${PORT}`);
  scheduleNext();
});

process.on("SIGTERM", () => {
  log("SIGTERM — shutting down");
  server.close(() => process.exit(0));
});
process.on("uncaughtException", (e) => {
  log(`Uncaught: ${e && e.stack ? e.stack : e}`);
});
