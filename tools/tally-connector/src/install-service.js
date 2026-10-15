// Register the daemon as a Windows Service. Run once, with admin rights:
//   node install-service.js
//
// Uses node-windows (a thin wrapper over winsw.exe) to write the daemon
// files, but does NOT trust it for the registration itself — see
// service-registry.js for why. After node-windows has had its turn we check
// the SCM directly, repair the registered binPath if it points somewhere
// else, start the service, and confirm it answers /health.
//
// Exits non-zero with a diagnostic if the service is not left running, so
// installer.nsh can surface the failure instead of reporting a clean install.
//
// RENAME (from "SynWorks Tally Connector" → "Syncit Tally Connector"):
// Windows Services are identified by name, and the old name derives a
// different service id, so an old SynWorks service is left untouched by
// this script. Remove it with the OLD uninstall-service.js if it is still
// present; it is inert either way.

const path = require("node:path");
const { Service } = require("node-windows");

const { SERVICE_PORT } = require("./config");
const reg = require("./service-registry");

const DISPLAY_NAME = "Syncit Tally Connector";
const script = path.join(__dirname, "service.js");

const svcName = reg.serviceName(DISPLAY_NAME);
const expectedExe = reg.daemonExePath(script, DISPLAY_NAME);

const log = (msg) => console.log(`[install-service] ${msg}`);

function fail(msg) {
  console.error(`[install-service] FAILED: ${msg}`);
  process.exit(1);
}

const svc = new Service({
  name: DISPLAY_NAME,
  description:
    "Bridges Tally (localhost:9000 XML/HTTP) to the Syncit cloud on a schedule.",
  script,
  nodeOptions: [],
  wait: 2,
  grow: 0.25,
  maxRetries: 40,
});

// Ask node-windows to lay down daemon/<id>.exe + <id>.xml. It may also
// register the service — which is what we want on a clean machine — but if
// the name is already taken in the SCM that step fails silently. Either way
// we verify and repair afterwards, so we only need the files on disk here.
function writeDaemonFiles() {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    svc.on("install", done);
    svc.on("alreadyinstalled", done);
    svc.on("invalidinstallation", done);
    svc.on("error", (e) => {
      log(`node-windows reported: ${e && e.message ? e.message : e}`);
      done();
    });

    svc.install();

    // node-windows' install() can finish without emitting anything useful
    // (its callbacks swallow errors), so never hang on it.
    setTimeout(done, 60000);
  });
}

async function main() {
  if (process.platform !== "win32") {
    fail("this script only runs on Windows.");
  }

  log(`service name : ${svcName}`);
  log(`expected exe : ${expectedExe}`);

  if (!reg.daemonFilesPresent(script, DISPLAY_NAME)) {
    log("daemon files missing - asking node-windows to write them…");
    await writeDaemonFiles();
  } else {
    log("daemon files already present.");
  }

  if (!reg.daemonFilesPresent(script, DISPLAY_NAME)) {
    fail(
      `node-windows did not produce ${expectedExe}. ` +
        "Check that this command is running elevated and that node-windows is installed.",
    );
  }

  if (!reg.isRegistered(svcName)) {
    fail(
      `service "${svcName}" is not registered with the SCM. ` +
        "Re-run this command from an elevated prompt; registration needs admin rights.",
    );
  }

  // The actual bug: a registration left over from an earlier install can
  // point at a directory that no longer exists, and nothing upstream fixes it.
  const current = reg.registeredImagePath(svcName);
  if (!current) {
    fail(`could not read the registered image path for "${svcName}".`);
  }

  if (reg.samePath(current, expectedExe)) {
    log("registered image path is correct.");
  } else {
    log(`registered image path is stale:\n    was: ${current}\n    now: ${expectedExe}`);
    // It cannot be running from a path that does not exist, but it might be
    // running from a different valid one, so stop before repointing.
    reg.stopService(svcName);
    reg.setImagePath(svcName, expectedExe);

    const after = reg.registeredImagePath(svcName);
    if (!reg.samePath(after, expectedExe)) {
      fail(`repointing the service failed; it still reads ${after}`);
    }
    log("repointed the service at the current install directory.");
  }

  log("starting service…");
  reg.startService(svcName);

  if (!(await reg.waitForHealth(SERVICE_PORT))) {
    fail(
      `service did not answer http://127.0.0.1:${SERVICE_PORT}/health within 30s. ` +
        "Check %ProgramData%\\Syncit\\connector.log and the daemon's *.wrapper.log.",
    );
  }

  log(`running, and healthy on 127.0.0.1:${SERVICE_PORT}.`);
  process.exit(0);
}

main().catch((e) => fail(e && e.stack ? e.stack : String(e)));
