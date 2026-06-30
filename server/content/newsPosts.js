const NEWS_POSTS = [
  {
    slug: "riftconquest-spa-launch",
    title: "RiftConquest frontend routes are live",
    excerpt:
      "Home, How To Play, Cards, Play, Profile, and Game now run through the frontend SPA.",
    body:
      "The browser client now owns the player-facing routes while the server stays focused on APIs, health checks, and realtime Socket.io play. This makes deployment cleaner and keeps the production frontend independent from the backend runtime.",
    category: "Version Updates",
    publishedAt: "2026-06-30T09:00:00.000Z",
    version: "1.0.0",
    tags: ["frontend", "spa", "deployment"],
  },
  {
    slug: "summer-rift-tournament-prep",
    title: "Tournament support planning begins",
    excerpt:
      "Ranked improvements and bracket-friendly match reporting are being mapped for future events.",
    body:
      "Tournament play is not enabled yet, but the next planning pass will focus on event pages, bracket visibility, and clearer post-match reporting so community duels are easier to organize.",
    category: "Tournament",
    publishedAt: "2026-06-28T12:00:00.000Z",
    version: "Planning",
    tags: ["tournament", "ranked", "community"],
  },
  {
    slug: "card-gallery-browser",
    title: "Card Gallery receives focused browsing",
    excerpt:
      "The card archive now supports a selected-card detail panel, filters, and a compact gallery browser.",
    body:
      "Players can study champions before entering the rift by filtering cards by region and ability type, then selecting one card to inspect its strength, region, and ability details.",
    category: "Version Updates",
    publishedAt: "2026-06-25T15:30:00.000Z",
    version: "0.9.8",
    tags: ["cards", "gallery", "ux"],
  },
  {
    slug: "play-loading-health-check",
    title: "Play loading now checks backend health",
    excerpt:
      "The lobby loading flow confirms the server is reachable before enabling room and matchmaking actions.",
    body:
      "The Play route now performs a deterministic loading sequence, checks backend health, preloads important assets, and only mounts the lobby once the client is ready.",
    category: "Dev Log",
    publishedAt: "2026-06-22T10:15:00.000Z",
    version: "0.9.6",
    tags: ["lobby", "health", "loading"],
  },
  {
    slug: "api-only-backend-mode",
    title: "Backend moves to API-only mode",
    excerpt:
      "The server exposes health, API routes, and Socket.io while the frontend handles pages and assets.",
    body:
      "Separating the client and server makes Vercel plus Render style deployment easier to reason about. The backend now focuses on persistence, realtime events, and account APIs.",
    category: "Announcement",
    publishedAt: "2026-06-18T08:45:00.000Z",
    version: "0.9.4",
    tags: ["backend", "api", "deployment"],
  },
];

function getNewsPosts({ limit } = {}) {
  const sorted = [...NEWS_POSTS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  const normalizedLimit = Number(limit);
  if (Number.isFinite(normalizedLimit) && normalizedLimit > 0) {
    return sorted.slice(0, Math.min(Math.floor(normalizedLimit), 50));
  }

  return sorted;
}

module.exports = { getNewsPosts };
