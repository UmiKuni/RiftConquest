import lobbyHtml from "../../../public/index.html?raw";
import { pageBodyHtml } from "../../shared/dom.js";
import { runLegacyScripts } from "../../shared/legacyScripts.js";
import { lobbyStore } from "./store.js";

const LOBBY_SCRIPTS = [
  "/lobby/core.js",
  "/lobby/settings.js",
  "/lobby/tabs.js",
  "/lobby/leaderboard.js",
  "/lobby/ranked.js",
  "/lobby/auth.js",
  "/lobby/rooms.js",
];

let mountedSocket = null;

export async function mount(root) {
  lobbyStore.setState({ mountedAt: Date.now() });
  window.rcLobby = {};
  root.innerHTML = pageBodyHtml(lobbyHtml);
  await runLegacyScripts(LOBBY_SCRIPTS, { reload: true });
  mountedSocket =
    window.rcLobby && window.rcLobby.socket ? window.rcLobby.socket : null;
}

export function unmount() {
  if (mountedSocket && typeof mountedSocket.disconnect === "function") {
    mountedSocket.disconnect();
  }
  mountedSocket = null;
  window.rcLobby = {};
}
