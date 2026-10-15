// Helpers for inspecting and repairing the connector's Windows Service
// registration, independent of node-windows.
//
// WHY THIS EXISTS — the binPath bug:
//
// node-windows decides whether the service "exists" by checking for
// daemon/<id>.exe + <id>.xml ON DISK (node_modules/node-windows/lib/daemon.js,
// `exists` getter). It never asks the Service Control Manager. Three
// consequences, all of which we hit on a real install:
//
//   1. uninstall-service.js is a no-op when the daemon files are already
//      gone, so an orphaned SCM registration survives — still pointing at
//      the previous install directory.
//   2. On the next install the files are written fresh, `exists` is false,
//      so node-windows asks winsw to register the name. The SCM rejects it
//      (name already taken), but daemon.js:536 passes a callback that takes
//      no error argument, so the failure is swallowed and 'install' is
//      emitted as if it had worked.
//   3. The service is therefore left registered with the OLD binPath, which
//      no longer exists, so it can never start. The installer reports
//      success and the service sits Stopped forever.
//
// (daemon.js:510 has a dead guard for this — `if (missing.length > 0)` where
// `missing` is a boolean — so node-windows' own 'invalidinstallation' event
// never fires either.)
//
// Everything below is driven by sc.exe EXIT CODES and the registry, never by
// parsing sc.exe's printed output: those field labels and messages are
// localised, so parsing them breaks on non-English Windows.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

// Win32 service error codes we care about.
const ERROR_SERVICE_DOES_NOT_EXIST = 1060;
const ERROR_SERVICE_ALREADY_RUNNING = 1056;
const ERROR_SERVICE_NOT_ACTIVE = 1062;

// Mirrors node-windows' id derivation (daemon.js `id` getter), so we compute
// the same name it registers.
function serviceId(displayName) {
  return displayName.replace(/[^\w]/gi, "").toLowerCase();
}

// node-windows sets winsw's <id> to `<id>.exe` (daemon.js:119), and that is
// what ends up as the SCM service name — e.g. "syncittallyconnector.exe".
function serviceName(displayName) {
  return `${serviceId(displayName)}.exe`;
}

// Where node-windows puts the winsw executable: <dir of script>/daemon/<id>.exe.
function daemonExePath(scriptPath, displayName) {
  return path.join(
    path.dirname(scriptPath),
    "daemon",
    `${serviceId(displayName)}.exe`,
  );
}

// Run a console tool and capture its exit code without throwing.
function run(exe, args) {
  try {
    const stdout = execFileSync(exe, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return { code: 0, stdout: stdout || "" };
  } catch (err) {
    return {
      code: typeof err.status === "number" ? err.status : -1,
      stdout: (err.stdout || "") + (err.stderr || ""),
    };
  }
}

const sc = (...args) => run("sc.exe", args);

function isRegistered(name) {
  return sc("query", name).code !== ERROR_SERVICE_DOES_NOT_EXIST;
}

// Read the registered image path straight from the registry. This is the
// authoritative value behind sc.exe's BINARY_PATH_NAME, and reg.exe's type
// tokens (REG_SZ / REG_EXPAND_SZ) are not localised.
function registeredImagePath(name) {
  const key = `HKLM\\SYSTEM\\CurrentControlSet\\Services\\${name}`;
  const { code, stdout } = run("reg.exe", ["query", key, "/v", "ImagePath"]);
  if (code !== 0) return null;
  const m = stdout.match(/ImagePath\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
  return m ? m[1].trim() : null;
}

// Compare two image paths tolerantly: the registry value is usually quoted,
// and Windows paths are case-insensitive.
function samePath(a, b) {
  const norm = (p) =>
    path
      .normalize(String(p || "").trim().replace(/^"(.*)"$/, "$1"))
      .replace(/[\\/]+$/, "")
      .toLowerCase();
  return norm(a) === norm(b);
}

function setImagePath(name, exePath) {
  // sc.exe's quirky syntax: the option and its value are separate argv
  // entries ("binPath=" then the path).
  const { code, stdout } = sc("config", name, "binPath=", `"${exePath}"`);
  if (code !== 0) {
    throw new Error(
      `sc config ${name} binPath= failed (exit ${code}): ${stdout.trim()}`,
    );
  }
}

// Start/stop are tolerant of the service already being in the target state.
function startService(name) {
  const { code, stdout } = sc("start", name);
  if (code !== 0 && code !== ERROR_SERVICE_ALREADY_RUNNING) {
    throw new Error(`sc start ${name} failed (exit ${code}): ${stdout.trim()}`);
  }
}

function stopService(name) {
  const { code, stdout } = sc("stop", name);
  if (
    code !== 0 &&
    code !== ERROR_SERVICE_NOT_ACTIVE &&
    code !== ERROR_SERVICE_DOES_NOT_EXIST
  ) {
    throw new Error(`sc stop ${name} failed (exit ${code}): ${stdout.trim()}`);
  }
}

function deleteService(name) {
  const { code, stdout } = sc("delete", name);
  if (code !== 0 && code !== ERROR_SERVICE_DOES_NOT_EXIST) {
    throw new Error(`sc delete ${name} failed (exit ${code}): ${stdout.trim()}`);
  }
}

function daemonFilesPresent(scriptPath, displayName) {
  const exe = daemonExePath(scriptPath, displayName);
  const xml = exe.replace(/\.exe$/i, ".xml");
  return fs.existsSync(exe) && fs.existsSync(xml);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function probeHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/health", timeout: 2000 },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(res.statusCode === 200 && JSON.parse(body).ok === true);
          } catch {
            resolve(false);
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

// The real readiness signal: the daemon answering on its loopback port.
// "Running" in the SCM only means winsw started, not that node came up.
async function waitForHealth(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await probeHealth(port)) return true;
    if (Date.now() >= deadline) return false;
    await sleep(1000);
  }
}

module.exports = {
  serviceId,
  serviceName,
  daemonExePath,
  daemonFilesPresent,
  isRegistered,
  registeredImagePath,
  samePath,
  setImagePath,
  startService,
  stopService,
  deleteService,
  probeHealth,
  waitForHealth,
};
