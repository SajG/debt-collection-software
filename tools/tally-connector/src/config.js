// Shared config store. Lives at %ProgramData%\SynWorks\config.json on Windows
// so both the Windows Service (LocalSystem) and the tray (user session) can
// read it. Falls back to a per-user path elsewhere for dev on macOS/Linux.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function dataDir() {
  if (process.platform === "win32") {
    const base = process.env.ProgramData || "C:\\ProgramData";
    return path.join(base, "SynWorks");
  }
  return path.join(os.homedir(), ".synworks-connector");
}

const CONFIG_PATH = path.join(dataDir(), "config.json");
const LOG_PATH = path.join(dataDir(), "connector.log");
const STATE_PATH = path.join(dataDir(), "state.json");

function ensureDir() {
  fs.mkdirSync(dataDir(), { recursive: true });
}

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

function writeConfig(cfg) {
  ensureDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...defaults(), ...cfg }, null, 2));
}

function defaults() {
  return {
    tallyHost: "localhost",
    tallyPort: 9000,
    synworksUrl: "",
    secret: "",
    // How often the service auto-syncs, in minutes. 0 = disabled (manual only).
    intervalMinutes: 15,
    lookbackDays: 3,
  };
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { lastRunAt: null, lastResult: null, lastError: null };
  }
}

function writeState(state) {
  ensureDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function appendLog(line) {
  ensureDir();
  const stamp = new Date().toISOString();
  fs.appendFileSync(LOG_PATH, `[${stamp}] ${line}\n`);
}

module.exports = {
  CONFIG_PATH,
  LOG_PATH,
  STATE_PATH,
  dataDir,
  readConfig,
  writeConfig,
  readState,
  writeState,
  appendLog,
};
