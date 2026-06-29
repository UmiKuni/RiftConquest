require("./loadEnv");

function readPort() {
  const raw = process.env.PORT;
  const parsed = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3001;
}

function getServerEnv() {
  return {
    port: readPort(),
    host: process.env.HOST || "0.0.0.0",
  };
}

module.exports = {
  getServerEnv,
};
