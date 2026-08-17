const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (patch) => ipcRenderer.invoke("config:save", patch),
  sync: (opts) => ipcRenderer.invoke("service:sync", opts),
  status: () => ipcRenderer.invoke("service:status"),
});
