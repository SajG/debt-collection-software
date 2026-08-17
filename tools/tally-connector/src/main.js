// Electron main process — tray icon + settings window.
// The tray never runs sync directly. It talks HTTP to the Windows Service
// on 127.0.0.1:9876 (see service.js).

const { app, Tray, Menu, BrowserWindow, ipcMain, shell, Notification } =
  require("electron");
const path = require("node:path");
const http = require("node:http");
const { LOG_PATH } = require("./config");

const SERVICE_URL = "http://127.0.0.1:9876";

let tray = null;
let settingsWin = null;
let statusPollTimer = null;

// ── HTTP helper (no extra deps) ────────────────────────────────────────

function svc(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 9876,
        path: pathname,
        method,
        headers: data
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : {} });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Tray menu ──────────────────────────────────────────────────────────

async function buildMenu() {
  let statusLabel = "Service: unreachable";
  let lastLabel = "Last sync: —";
  let cfgConfigured = false;
  try {
    const { body } = await svc("GET", "/status");
    cfgConfigured = Boolean(body.config?.paytrackUrl && body.config?.secret);
    statusLabel = body.running
      ? "Syncing now…"
      : cfgConfigured
        ? "Service: idle"
        : "Service: not configured";
    if (body.state?.lastRunAt) {
      const when = new Date(body.state.lastRunAt);
      const mins = Math.round((Date.now() - when.getTime()) / 60000);
      const err = body.state.lastError;
      lastLabel = err ? `Last sync failed: ${err.slice(0, 40)}` : `Last sync: ${mins}m ago`;
    }
  } catch {
    // service down
  }

  return Menu.buildFromTemplate([
    { label: "PayTrack Tally Connector", enabled: false },
    { type: "separator" },
    { label: statusLabel, enabled: false },
    { label: lastLabel, enabled: false },
    { type: "separator" },
    {
      label: "Sync Now",
      enabled: cfgConfigured,
      click: async () => {
        try {
          await svc("POST", "/sync", { full: false });
          notify("Sync started");
        } catch (e) {
          notify(`Could not start sync: ${e.message}`);
        }
      },
    },
    {
      label: "Full Sync (pull everything)",
      enabled: cfgConfigured,
      click: async () => {
        try {
          await svc("POST", "/sync", { full: true });
          notify("Full sync started");
        } catch (e) {
          notify(`Could not start sync: ${e.message}`);
        }
      },
    },
    { type: "separator" },
    { label: "Settings…", click: () => openSettings() },
    { label: "Open Log", click: () => shell.openPath(LOG_PATH) },
    { type: "separator" },
    { label: "Quit tray", click: () => app.quit() },
  ]);
}

async function refreshTray() {
  if (!tray) return;
  const menu = await buildMenu();
  tray.setContextMenu(menu);
  try {
    const { body } = await svc("GET", "/status");
    const tip = body.state?.lastError
      ? `PayTrack — last sync failed`
      : body.running
        ? `PayTrack — syncing`
        : `PayTrack — idle`;
    tray.setToolTip(tip);
  } catch {
    tray.setToolTip("PayTrack — service unreachable");
  }
}

function notify(message) {
  if (Notification.isSupported()) {
    new Notification({ title: "PayTrack Connector", body: message }).show();
  }
}

// ── Settings window ────────────────────────────────────────────────────

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 500,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "PayTrack Connector — Settings",
    icon: path.join(__dirname, "..", "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWin.on("closed", () => {
    settingsWin = null;
  });
}

// ── IPC bridge for the settings renderer ───────────────────────────────

ipcMain.handle("config:get", async () => {
  const { body } = await svc("GET", "/config");
  return body;
});
ipcMain.handle("config:save", async (_e, patch) => {
  const { body } = await svc("POST", "/config", patch);
  refreshTray();
  return body;
});
ipcMain.handle("service:sync", async (_e, opts) => {
  const { body } = await svc("POST", "/sync", opts || {});
  refreshTray();
  return body;
});
ipcMain.handle("service:status", async () => {
  const { body } = await svc("GET", "/status");
  return body;
});

// ── App lifecycle ──────────────────────────────────────────────────────

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, "..", "assets", "iconTemplate.png");
  tray = new Tray(iconPath);
  refreshTray();
  statusPollTimer = setInterval(refreshTray, 15000);
});

app.on("window-all-closed", (e) => {
  // Keep running in the tray after the settings window closes.
  e.preventDefault?.();
});

app.on("before-quit", () => {
  if (statusPollTimer) clearInterval(statusPollTimer);
});
