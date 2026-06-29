export function mount(root, { route }) {
  root.innerHTML = `
    <div class="lobby-bg">
      <div class="lobby-card">
        <div class="lobby-logo">
          <h1 class="cinzel">Loading Match</h1>
          <p class="subtitle">Opening the battle view...</p>
        </div>
      </div>
    </div>
  `;

  const devBackendUrl =
    window.location.port === "5173" ? "http://localhost:3001" : "";
  const backendUrl = import.meta.env.VITE_BACKEND_URL || devBackendUrl;
  const gamePath = `/game${route.search || ""}`;
  const targetUrl = backendUrl ? new URL(gamePath, backendUrl).toString() : gamePath;

  window.location.replace(targetUrl);
}
