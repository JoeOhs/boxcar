const { app, BrowserWindow, net, protocol, shell, utilityProcess } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const site = path.join(__dirname, "site");
// Saved data under the build's own id, never its display name: an app called "Ganger" must not
// open Ganger's data, nor two apps with one name each other's.
app.setPath("userData", path.join(app.getPath("appData"), require("./package.json").name));

function fileFor(pathname) {
  const clean = path.normalize(decodeURIComponent(pathname)).replace(/^[\\/]+/, "");
  for (const candidate of [clean, clean + ".html", path.join(clean, "index.html")]) {
    const full = path.join(site, candidate);
    if (!full.startsWith(site + path.sep)) continue;
    try {
      if (fs.statSync(full).isFile()) return full;
    } catch {}
  }
  return path.join(site, "index.html");
}

// A build with its own server (Next's standalone output) runs it here, on this computer only.
// Beside the app in an export; a release ships it as an extra resource, outside the asar.
const server = [path.join(process.resourcesPath, "server"), path.join(__dirname, "server")].find(
  (dir) => fs.existsSync(path.join(dir, "server.js")),
);
const hasServer = Boolean(server);
let child = null;

function open(home) {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url) && !url.startsWith(home)) shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(home)) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  window.loadURL(home);
  return window;
}

// The settings the app reads (its .env.example names), asked once and kept in its own folder.
function settingsFile() {
  return path.join(app.getPath("userData"), "settings.json");
}
function wanted() {
  try {
    return fs
      .readFileSync(path.join(server, ".env.example"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, "").split("=")[0].trim())
      .filter((name) => /^[A-Z][A-Z0-9_]*$/.test(name));
  } catch {
    return [];
  }
}
function askSettings(names) {
  return new Promise((resolve) => {
    const window = new BrowserWindow({
      width: 520,
      height: 220 + names.length * 70,
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    const fields = names
      .map((n) => '<label>' + n + '<input name="' + n + '" type="password" required></label>')
      .join("");
    const page =
      '<!doctype html><meta charset="utf-8"><title>First start</title><style>body{font:15px system-ui;margin:24px}label{display:grid;gap:4px;margin:12px 0}input{font:inherit;padding:6px}</style>' +
      "<p>This program needs these settings once. They stay on this computer.</p>" +
      '<form action="settings:save">' + fields + "<button>Save and open</button></form>";
    window.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith("settings:save")) return;
      event.preventDefault();
      const values = Object.fromEntries(new URL(url.replace("settings:save", "http://x/")).searchParams);
      fs.mkdirSync(app.getPath("userData"), { recursive: true });
      fs.writeFileSync(settingsFile(), JSON.stringify(values), { mode: 0o600 });
      // Answered first, so closing this window is not taken for walking away.
      resolve(values);
      starting = true;
      window.destroy();
    });
    window.on("closed", () => resolve(null));
    window.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(page));
  });
}

async function startServer() {
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
  } catch {}
  const missing = wanted().filter((name) => !settings[name]);
  if (missing.length) {
    const asked = await askSettings(missing);
    if (!asked) return app.quit();
    settings = { ...settings, ...asked };
  }
  const port = await new Promise((resolve) => {
    const probe = require("node:net").createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
  const data = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(data, { recursive: true });
  child = utilityProcess.fork(path.join(server, "server.js"), [], {
    cwd: server,
    env: { ...process.env, ...settings, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", DATA_DIR: data },
    stdio: "ignore",
  });
  const home = "http://127.0.0.1:" + port + "/";
  for (let i = 0; i < 300; i++) {
    const up = await net.fetch(home).then(() => true, () => false);
    if (up) {
      starting = false;
      return open(home);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  require("electron").dialog.showErrorBox("It did not start", "The program's server did not answer within 30 seconds.");
  app.quit();
}

app.whenReady().then(() => {
  if (hasServer) return startServer();
  protocol.handle("app", (request) =>
    net.fetch(pathToFileURL(fileFor(new URL(request.url).pathname)).toString()),
  );
  open("app://local/");
});

// The first-start window closing while the server starts is not the person closing the program.
let starting = false;
app.on("window-all-closed", () => {
  if (!starting) app.quit();
});
app.on("quit", () => child && child.kill());
