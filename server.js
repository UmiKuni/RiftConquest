import cors from "@koa/cors";
import { Server } from "boardgame.io/dist/cjs/server.js";
import { RiftConquestGame } from "./src/game/riftConquestGame.js";

const server = Server({
  games: [RiftConquestGame],
  origins: ["*"],
});

server.app.use(cors());

const port = Number(process.env.PORT ?? 8000);
server.run(port, () => {
  console.log(`RiftConquest server running on http://localhost:${port}`);
});
