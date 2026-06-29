const path = require("path");
const dotenv = require("dotenv");

const serverEnvPath = path.join(__dirname, "..", ".env");

dotenv.config({ path: serverEnvPath, quiet: true });

module.exports = {
  serverEnvPath,
};
