// Register the daemon as a Windows Service. Run once, with admin rights:
//   node install-service.js
// Uses node-windows (a thin wrapper over winsw.exe) so uninstall is symmetric.

const path = require("node:path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "SynWorks Tally Connector",
  description:
    "Bridges Tally (localhost:9000 XML/HTTP) to the SynWorks cloud on a schedule.",
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
  console.log("SynWorks Tally Connector started.");
});
svc.on("error", (e) => {
  console.error("Install error:", e);
});

svc.install();
