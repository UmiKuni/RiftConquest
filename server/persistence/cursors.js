const { asNonEmptyString } = require("./value");

function encodeCursor(cursorObj) {
  const json = JSON.stringify(cursorObj);
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeCursor(cursorStr) {
  if (!cursorStr || typeof cursorStr !== "string") return null;

  const normalized = cursorStr.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);

  try {
    const json = Buffer.from(padded, "base64").toString("utf8");
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;

    const uid = asNonEmptyString(obj.uid);
    if (!uid) return null;

    // Support legacy cursors that included { uid, elo }.
    return { uid };
  } catch {
    return null;
  }
}

function decodeMatchHistoryCursor(cursorStr) {
  if (!cursorStr || typeof cursorStr !== "string") return null;

  const normalized = cursorStr.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);

  try {
    const json = Buffer.from(padded, "base64").toString("utf8");
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;

    const matchId = asNonEmptyString(obj.matchId);
    if (!matchId) return null;

    return { matchId };
  } catch {
    return null;
  }
}

module.exports = {
  encodeCursor,
  decodeCursor,
  decodeMatchHistoryCursor,
};
