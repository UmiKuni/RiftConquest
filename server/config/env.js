require("./loadEnv");

function readPort() {
  const raw = process.env.PORT;
  const parsed = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3001;
}

function getServerEnv() {
  const frontendOrigin =
    process.env.FRONTEND_ORIGIN ||
    "http://localhost:5173,http://127.0.0.1:5173";
  return {
    port: readPort(),
    host: process.env.HOST || "0.0.0.0",
    frontendOrigins: frontendOrigin
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

module.exports = {
  getServerEnv,
};
