const { verifyIdToken } = require("../firebaseAdmin");

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

async function requireAccountDecoded(req, res, { guestMessage } = {}) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing auth token." });
    return null;
  }

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch {
    res.status(401).json({ error: "Invalid auth token." });
    return null;
  }

  const provider =
    (decoded.firebase && decoded.firebase.sign_in_provider) || null;
  if (provider === "anonymous") {
    res
      .status(403)
      .json({ error: guestMessage || "Guest accounts have no profile." });
    return null;
  }

  return decoded;
}

module.exports = { getBearerToken, requireAccountDecoded };
