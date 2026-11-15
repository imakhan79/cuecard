// Cuecard Desktop — the meeting (Google Meet / Zoom / Teams) and the Cuecard copilot side by side.
// The copilot's "Start copilot" and "Screen Help" capture the meeting pane directly:
// no screen-share dialog and no "share tab audio" step.
const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, desktopCapturer, webContents } = require("electron");
const path = require("node:path");

const APP_URL = process.env.CUECARD_URL || "https://cuecard-six.vercel.app";
const TOOLBAR = 56;
// Chrome-like user agent: meeting sites only support real browsers.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const MEETING_HOSTS = [/(^|\.)meet\.google\.com$/, /(^|\.)zoom\.us$/, /(^|\.)zoomgov\.com$/, /(^|\.)teams\.microsoft\.com$/, /(^|\.)teams\.live\.com$/];
const isMeetingUrl = (u) => {
  try {
    const { protocol, hostname } = new URL(u);
    return protocol === "https:" && MEETING_HOSTS.some((r) => r.test(hostname));
  } catch {
    return false;
  }
};

let win;
let meetingView;
let appView;
let layout = "split"; // split | copilot | meeting
let split = 0.6; // share of width for the meeting

function relayout() {
  if (!win) return;
  const { width, height } = win.getContentBounds();
  const h = Math.max(0, height - TOOLBAR);
  const meetingW = layout === "split" ? Math.round(width * split) : layout === "meeting" ? width : 0;
  meetingView.setBounds({ x: 0, y: TOOLBAR, width: meetingW, height: h });
  appView.setBounds({ x: meetingW, y: TOOLBAR, width: width - meetingW, height: h });
}

function openMeeting(url) {
  if (!isMeetingUrl(url)) return false;
  meetingView.webContents.loadURL(url, { userAgent: UA });
  if (layout === "copilot") layout = "split";
  relayout();
  win.webContents.send("meeting-url", url);
  return true;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Cuecard",
    backgroundColor: "#0d0d12",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload-shell.js"), contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "shell.html"));

  // Meeting pane: an isolated, sandboxed browser view.
  meetingView = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true } });
  meetingView.webContents.setUserAgent(UA);
  meetingView.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <body style="margin:0;height:100vh;display:grid;place-items:center;font-family:system-ui;background:#111118;color:#9c9cab;text-align:center">
      <div><div style="font-size:42px">🎥</div><p style="font-size:16px;color:#ececf1">Your meeting appears here</p>
      <p style="font-size:13px">Paste a Google Meet, Zoom or Teams link above and press Join,<br>or click “Join” on the Cuecard live page.</p></div></body>`)}`);
  meetingView.webContents.setWindowOpenHandler(({ url }) => {
    if (isMeetingUrl(url)) meetingView.webContents.loadURL(url, { userAgent: UA });
    else shell.openExternal(url);
    return { action: "deny" };
  });

  // Cuecard pane: the Cuecard web app.
  appView = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, "preload-app.js"), contextIsolation: true, sandbox: true },
  });
  appView.webContents.loadURL(`${APP_URL}/live`);
  appView.webContents.setWindowOpenHandler(({ url }) => {
    if (!openMeeting(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.contentView.addChildView(meetingView);
  win.contentView.addChildView(appView);
  relayout();
  win.on("resize", relayout);
}

app.whenReady().then(() => {
  const ses = session.defaultSession;

  // Camera / microphone / notifications for the meeting sites; mic for Cuecard's dictation.
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    const ok = ["media", "notifications", "clipboard-sanitized-write", "display-capture", "fullscreen"].includes(permission);
    cb(ok);
  });

  // Screen sharing requests. When Cuecard asks (Start copilot / Screen Help), hand it the meeting
  // pane's picture and sound directly: no picker. If the meeting itself wants to present, share the screen.
  ses.setDisplayMediaRequestHandler(
    async (request, callback) => {
      const requester = request.frame ? webContents.fromFrame(request.frame) : null;
      const fromCuecard = Boolean(appView && requester && requester.id === appView.webContents.id);
      const meetingLoaded = meetingView && isMeetingUrl(meetingView.webContents.getURL());
      if (fromCuecard && meetingLoaded) {
        callback({ video: meetingView.webContents.mainFrame, audio: meetingView.webContents.mainFrame });
        return;
      }
      // Otherwise (e.g. presenting in the meeting): share the primary screen with system audio (Windows).
      const sources = await desktopCapturer.getSources({ types: ["screen"] });
      callback(sources[0] ? { video: sources[0], audio: "loopback" } : {});
    },
    { useSystemPicker: false },
  );

  createWindow();

  // Optional: open a meeting at start-up, e.g. Cuecard.exe --join=https://meet.google.com/abc-defg-hij
  const joinArg = process.argv.find((a) => a.startsWith("--join="));
  if (joinArg) meetingView.webContents.once("did-finish-load", () => openMeeting(joinArg.slice(7)));
});

ipcMain.handle("join", (_e, url) => openMeeting(String(url || "").trim()));
ipcMain.handle("layout", (_e, next) => {
  if (["split", "copilot", "meeting"].includes(next)) layout = next;
  relayout();
  return layout;
});
ipcMain.handle("split", (_e, ratio) => {
  split = Math.min(0.8, Math.max(0.3, Number(ratio) || 0.6));
  layout = "split";
  relayout();
});
ipcMain.handle("reload", (_e, which) => {
  (which === "meeting" ? meetingView : appView).webContents.reload();
});
ipcMain.handle("leave", () => {
  meetingView.webContents.loadURL("about:blank");
  layout = "copilot";
  relayout();
});

app.on("window-all-closed", () => app.quit());
