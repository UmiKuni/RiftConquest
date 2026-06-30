import { backendBaseUrl } from "../../shared/backend.js";

export function mount(root, { route, navigate }) {
  const room = route.query.get("room");
  const player = route.query.get("player");

  if (!room || player === null) {
    navigate("/play", { replace: true });
    return;
  }

  const params = new URLSearchParams(route.search || "");
  if (backendBaseUrl) params.set("backend", backendBaseUrl);

  root.innerHTML = `
    <div class="game-frame-page">
      <iframe
        class="game-frame"
        title="RiftConquest match"
        src="/game.html?${params.toString()}"
        allow="autoplay"
      ></iframe>
    </div>
  `;
}
