import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(__dirname, "..");
const nodeModulesDir = path.join(frontendDir, "node_modules");
const publicVendorDir = path.join(frontendDir, "public", "vendor");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (entry.isFile()) {
      copyFile(from, to);
    }
  }
}

function syncMdi() {
  const src = path.join(nodeModulesDir, "@mdi", "font");
  const dest = path.join(publicVendorDir, "mdi");
  if (!fs.existsSync(src)) {
    throw new Error(`Missing @mdi/font package at ${src}`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  copyFile(
    path.join(src, "css", "materialdesignicons.min.css"),
    path.join(dest, "css", "materialdesignicons.min.css"),
  );
  copyDir(path.join(src, "fonts"), path.join(dest, "fonts"));
}

function syncFirebaseCompat() {
  const srcDir = path.join(nodeModulesDir, "firebase");
  const destDir = path.join(publicVendorDir, "firebase");
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Missing firebase package at ${srcDir}`);
  }

  ensureDir(destDir);
  for (const file of [
    "firebase-app-compat.js",
    "firebase-auth-compat.js",
    "firebase-firestore-compat.js",
  ]) {
    copyFile(path.join(srcDir, file), path.join(destDir, file));
  }
}

function syncSocketIoClient() {
  const src = path.join(
    nodeModulesDir,
    "socket.io-client",
    "dist",
    "socket.io.js",
  );
  const dest = path.join(publicVendorDir, "socket.io", "socket.io.js");
  if (!fs.existsSync(src)) {
    throw new Error(`Missing socket.io-client browser bundle at ${src}`);
  }
  copyFile(src, dest);
}

syncMdi();
syncFirebaseCompat();
syncSocketIoClient();
console.log("Synced frontend vendor assets.");
