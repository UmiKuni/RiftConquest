const path = require("path");
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
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

module.exports = { app, server, io };
