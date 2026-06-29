const path = require("path");

const serverDir = path.join(__dirname, "..");
const repoRoot = path.join(serverDir, "..");
const frontendDir = path.join(repoRoot, "frontend");
const frontendPublicDir = path.join(frontendDir, "public");
const frontendDistDir = path.join(frontendDir, "dist");
const frontendImageDir = path.join(frontendDir, "image");
const frontendSoundsDir = path.join(frontendDir, "sounds");
const frontendVendorDir = path.join(frontendPublicDir, "vendor");
const spaIndexPath = path.join(frontendDistDir, "index.html");

module.exports = {
  serverDir,
  repoRoot,
  frontendDir,
  frontendPublicDir,
  frontendDistDir,
  frontendImageDir,
  frontendSoundsDir,
  frontendVendorDir,
  spaIndexPath,
};
