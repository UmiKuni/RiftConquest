(function () {
  // Compatibility shim: the lobby code was split into multiple scripts.
  // New pages should load `lobby/*.js` directly (see index.html).
  // If an old cached HTML page still references `lobby.js`, this loader keeps it working.

  const scripts = [
    "lobby/core.js",
    "lobby/tabs.js",
    "lobby/leaderboard.js",
    "lobby/ranked.js",
    "lobby/auth.js",
    "lobby/rooms.js",
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  (async () => {
    for (const src of scripts) {
      await loadScript(src);
    }
  })().catch((err) => {
    console.error("[lobby] Failed to load split scripts:", err);
  });
})();
