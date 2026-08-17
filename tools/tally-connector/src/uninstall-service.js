// Remove the Windows Service. Run with admin rights:
//   node uninstall-service.js

const path = require("node:path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "PayTrack Tally Connector",
  script: path.join(__dirname, "service.js"),
});

svc.on("uninstall", () => {
  console.log("Uninstalled.");
});
svc.on("error", (e) => {
  console.error("Uninstall error:", e);
});

svc.uninstall();
