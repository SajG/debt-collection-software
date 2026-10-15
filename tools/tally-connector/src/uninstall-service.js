// Remove the Windows Service. Run with admin rights:
//   node uninstall-service.js
//
// node-windows skips the uninstall entirely when the daemon files are
// already missing — its `exists` check looks at the disk, not the SCM — which
// is exactly how an orphaned registration gets left behind. That orphan is
// what makes the NEXT install register a stale binPath and fail to start
// (see service-registry.js). So after giving node-windows its turn, make
// sure the registration is really gone, falling back to sc.exe.
//
// Exits non-zero if the service is still registered afterwards.

const path = require("node:path");
const { Service } = require("node-windows");

const reg = require("./service-registry");

const DISPLAY_NAME = "Syncit Tally Connector";
const script = path.join(__dirname, "service.js");
const svcName = reg.serviceName(DISPLAY_NAME);

const log = (msg) => console.log(`[uninstall-service] ${msg}`);

const svc = new Service({ name: DISPLAY_NAME, script });

function nodeWindowsUninstall() {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    svc.on("uninstall", done);
    svc.on("alreadyuninstalled", done);
    svc.on("error", (e) => {
      log(`node-windows reported: ${e && e.message ? e.message : e}`);
      done();
    });

    svc.uninstall();
    setTimeout(done, 60000);
  });
}

async function main() {
  if (process.platform !== "win32") {
    console.error("[uninstall-service] this script only runs on Windows.");
    process.exit(1);
  }

  if (reg.daemonFilesPresent(script, DISPLAY_NAME)) {
    log("removing via node-windows…");
    await nodeWindowsUninstall();
  } else {
    log("daemon files already gone - node-windows would skip this.");
  }

  if (reg.isRegistered(svcName)) {
    log(`"${svcName}" is still registered - removing it with sc.exe…`);
    try {
      reg.stopService(svcName);
      reg.deleteService(svcName);
    } catch (e) {
      console.error(`[uninstall-service] FAILED: ${e.message}`);
      process.exit(1);
    }
  }

  if (reg.isRegistered(svcName)) {
    console.error(
      `[uninstall-service] FAILED: "${svcName}" is still registered. ` +
        "If Windows has marked it for deletion, reboot and re-run this command.",
    );
    process.exit(1);
  }

  log("uninstalled.");
  process.exit(0);
}

main().catch((e) => {
  console.error(`[uninstall-service] FAILED: ${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
