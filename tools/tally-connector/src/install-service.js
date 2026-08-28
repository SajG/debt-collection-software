// Register the daemon as a Windows Service. Run once, with admin rights:
//   node install-service.js
// Uses node-windows (a thin wrapper over winsw.exe) so uninstall is symmetric.
//
// RENAME (from "SynWorks Tally Connector" → "Syncit Tally Connector"):
// Windows Services are identified by name. If a machine already has the
// OLD service installed, this install refuses (name collision). Run
// `node uninstall-service.js` with the OLD src/uninstall-service.js
// checked out FIRST, then pull this branch and reinstall. There is no
// in-place rename — the service must be removed and re-created.

const path = require("node:path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "Syncit Tally Connector",
  description:
    "Bridges Tally (localhost:9000 XML/HTTP) to the Syncit cloud on a schedule.",
  script: path.join(__dirname, "service.js"),
  nodeOptions: [],
  wait: 2,
  grow: 0.25,
  maxRetries: 40,
});

svc.on("install", () => {
  console.log("Installed. Starting service…");
  svc.start();
});
svc.on("alreadyinstalled", () => {
  console.log("Service already installed — starting it.");
  svc.start();
});
svc.on("start", () => {
  console.log("Syncit Tally Connector started.");
});
svc.on("error", (e) => {
  console.error("Install error:", e);
});

svc.install();
