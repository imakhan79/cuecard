// Lets the Cuecard web app know it is running inside Cuecard Desktop
// (so it can skip the "share tab audio" instructions).
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("cuecardDesktop", { version: "1.0.0", capturesMeetingAutomatically: true });
