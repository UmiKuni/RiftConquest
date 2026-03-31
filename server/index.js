const path = require("path");
const os = require("os");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { createRoomManager } = require("./socket/roomManager");
const { registerSocketHandlers } = require("./socket/handlers");

const app = express();

const frontendPublicDir = path.join(__dirname, "..", "frontend", "public");
const frontendImageDir = path.join(__dirname, "..", "frontend", "image");
const mdiDir = path.join(__dirname, "..", "node_modules", "@mdi", "font");

app.use(express.static(frontendPublicDir));
app.use("/image", express.static(frontendImageDir));
app.use("/vendor/mdi", express.static(mdiDir));

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
