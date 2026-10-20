// Written by Ganger: puts the app's built page where the release's window opens it.
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const site = path.join(__dirname, "site");
const server = path.join(__dirname, "server");
fs.rmSync(site, { recursive: true, force: true });
fs.rmSync(server, { recursive: true, force: true });
fs.mkdirSync(site, { recursive: true });
fs.mkdirSync(server, { recursive: true });
// A build with its own server: Next's standalone output, with its static files and public/.
const standalone = path.join(root, ".next", "standalone");
if (fs.existsSync(path.join(standalone, "server.js"))) {
  fs.cpSync(standalone, server, { recursive: true });
  fs.cpSync(path.join(root, ".next", "static"), path.join(server, ".next", "static"), { recursive: true });
  if (fs.existsSync(path.join(root, "public")))
    fs.cpSync(path.join(root, "public"), path.join(server, "public"), { recursive: true });
  if (fs.existsSync(path.join(root, ".env.example")))
    fs.copyFileSync(path.join(root, ".env.example"), path.join(server, ".env.example"));
} else {
  const from = ["out", "dist", "build"]
    .map((dir) => path.join(root, dir))
    .find((dir) => fs.existsSync(path.join(dir, "index.html")));
  if (!from) throw new Error("The build wrote no index.html in out/, dist/ or build/, and no server in .next/standalone/.");
  fs.cpSync(from, site, { recursive: true });
}
