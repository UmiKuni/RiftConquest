import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(__dirname, "..");
const distDir = path.join(frontendDir, "dist");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

copyDir(path.join(frontendDir, "image"), path.join(distDir, "image"));
copyDir(path.join(frontendDir, "sounds"), path.join(distDir, "sounds"));

console.log("Copied frontend static assets.");
