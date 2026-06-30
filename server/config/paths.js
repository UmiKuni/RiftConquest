const path = require("path");

const serverDir = path.join(__dirname, "..");
const repoRoot = path.join(serverDir, "..");

module.exports = {
  serverDir,
  repoRoot,
};
