const path = require("path");
const os = require("os");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { verifyIdToken } = require("./firebaseAdmin");
const {
  upsertUserFromDecoded,
  setUserDisplayName,
  getMe,
  getMatchHistory,
  getLeaderboardPage,
} = require("./persistence/firestore");

const { createRoomManager } = require("./socket/roomManager");
const { registerSocketHandlers } = require("./socket/handlers");

const app = express();

app.use(express.json());

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1] : null;
}

// --- API: server-authoritative persistence ---
app.get("/api/leaderboard", async (req, res) => {
  try {
    const pageSize = req.query.pageSize;
    const cursor = req.query.cursor;
    const result = await getLeaderboardPage({
      pageSize: typeof pageSize === "string" ? Number(pageSize) : undefined,
      cursor: typeof cursor === "string" ? cursor : null,
    });
    res.json(result);
  } catch (err) {
    console.warn("[api] /api/leaderboard failed:", err && err.message);
    res.status(500).json({ error: "Failed to load leaderboard." });
  }
});

app.get("/api/me", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing auth token." });

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid auth token." });
  }

  const provider =
    (decoded.firebase && decoded.firebase.sign_in_provider) || null;
  if (provider === "anonymous") {
    return res.status(403).json({ error: "Guest accounts have no profile." });
  }

  try {
    await upsertUserFromDecoded(decoded);
    const me = await getMe(decoded.uid);
    res.json({ me });
  } catch (err) {
    console.warn("[api] /api/me failed:", err && err.message);
    res.status(500).json({ error: "Failed to load profile." });
  }
});

app.post("/api/me/displayName", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing auth token." });

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid auth token." });
  }

  const provider =
    (decoded.firebase && decoded.firebase.sign_in_provider) || null;
  if (provider === "anonymous") {
    return res
      .status(403)
      .json({ error: "Guest accounts cannot set a profile." });
  }

  const displayName =
    req.body && typeof req.body.displayName === "string"
      ? req.body.displayName
      : "";

  try {
    await upsertUserFromDecoded(decoded);
    const saved = await setUserDisplayName(decoded.uid, displayName);
    res.json({ displayName: saved });
  } catch (err) {
    const msg =
      err && err.message
        ? String(err.message)
        : "Failed to update display name.";
    const isValidation = msg.toLowerCase().includes("invalid");
    res.status(isValidation ? 400 : 500).json({ error: msg });
  }
});

app.get("/api/me/matchHistory", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing auth token." });

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid auth token." });
  }

  const provider =
    (decoded.firebase && decoded.firebase.sign_in_provider) || null;
  if (provider === "anonymous") {
    return res.status(403).json({ error: "Guest accounts have no profile." });
  }

  const limitRaw = req.query.limit;
  const limit = typeof limitRaw === "string" ? Number(limitRaw) : undefined;

  const cursorRaw = req.query.cursor;
  const cursor = typeof cursorRaw === "string" ? cursorRaw : null;

  try {
    await upsertUserFromDecoded(decoded);
    const result = await getMatchHistory(decoded.uid, { limit, cursor });
    res.json(result);
  } catch (err) {
    console.warn("[api] /api/me/matchHistory failed:", err && err.message);
    res.status(500).json({ error: "Failed to load match history." });
  }
});

const frontendPublicDir = path.join(__dirname, "..", "frontend", "public");
const frontendImageDir = path.join(__dirname, "..", "frontend", "image");
const mdiDir = path.join(__dirname, "..", "node_modules", "@mdi", "font");
const firebaseDir = path.join(__dirname, "..", "node_modules", "firebase");

app.use(express.static(frontendPublicDir));
app.use("/image", express.static(frontendImageDir));
app.use("/vendor/mdi", express.static(mdiDir));
app.use("/vendor/firebase", express.static(firebaseDir));

const server = http.createServer(app);
const io = new Server(server);

const roomManager = createRoomManager(io);
registerSocketHandlers(io, roomManager);

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";

function getLanIpv4Addresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const isIpv4 = net.family === "IPv4" || net.family === 4;
      if (isIpv4 && !net.internal) out.push(net.address);
    }
  }
  return Array.from(new Set(out));
}

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" || HOST === "::" ? "localhost" : HOST;
  console.log(`Server listening on http://${displayHost}:${PORT}`);

  const ips = getLanIpv4Addresses();
  if (ips.length) {
    console.log("LAN URLs (same network):");
    for (const ip of ips) console.log(`  http://${ip}:${PORT}`);
  }
});

module.exports = { app, server, io };
