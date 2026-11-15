const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cuecard", {
  join: (url) => ipcRenderer.invoke("join", url),
  layout: (l) => ipcRenderer.invoke("layout", l),
  split: (r) => ipcRenderer.invoke("split", r),
  reload: (which) => ipcRenderer.invoke("reload", which),
  leave: () => ipcRenderer.invoke("leave"),
  onMeetingUrl: (cb) => ipcRenderer.on("meeting-url", (_e, url) => cb(url)),
});
