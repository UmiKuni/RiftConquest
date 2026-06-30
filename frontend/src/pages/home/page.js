import { bindShellNavigation, renderShell } from "../../app/shell.js";

const NEWS_ITEMS = [
  {
    featured: true,
    icon: "mdi-map-marker-path",
    label: "Newest update",
    title: "Production-ready frontend split",
    text: "Home, guide, lobby loading, and the active match client now live in the frontend SPA while the server stays focused on API and Socket.io.",
  },
  {
    icon: "mdi-loading",
    label: "Lobby",
    title: "Intentional Play loading",
    text: "The Play route checks backend health, preloads assets, and hands off to the lobby only when the client is ready.",
  },
  {
    icon: "mdi-account-circle-outline",
    label: "Profile",
    title: "Profile route migration",
    text: "Account stats, display name updates, match history, and leaderboard entry points moved into the Vite app.",
  },
  {
    icon: "mdi-server-network",
    label: "Backend",
    title: "API-only server mode",
    text: "The backend now exposes health, APIs, and realtime events without serving frontend pages in production.",
  },
];

const STAT_ITEMS = [
  {
    title: "Average Match Time",
    value: [
      { number: 10 },
      { text: "-" },
      { number: 15 },
      { text: "min" },
    ],
    text: "Compact rounds keep decisions sharp without turning a duel into a long session.",
  },
  {
    title: "Player Count",
    value: [{ number: 2 }],
    text: "Every match is a direct tactical duel between two players across three regions.",
  },
  {
    title: "Victory Target",
    value: [{ number: 12 }, { text: "VP" }],
    text: "Race to 12 Victory Points by controlling regions or forcing a timely retreat.",
  },
];

const FOOTER_LINKS = [
  { label: "Home", path: "/home" },
  { label: "How To Play", path: "/how-to-play" },
  { label: "Cards", path: "/cards" },
  { label: "Play", path: "/play" },
  { label: "Profile", path: "/profile" },
];

function renderStatValue(parts) {
  return parts
    .map((part) => {
      if (typeof part.number === "number") {
        return `<span class="home-stat-number" data-count="${part.number}">0</span>`;
      }
      return `<span>${part.text}</span>`;
    })
    .join("");
}

function animateStatCounters(root) {
  const counters = Array.from(root.querySelectorAll(".home-stat-number"));
  if (!counters.length) return;

  const finish = () => {
    counters.forEach((counter) => {
      counter.textContent = counter.dataset.count || "0";
    });
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finish();
    return;
  }

  const run = () => {
    const start = performance.now();
    const duration = 950;

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      counters.forEach((counter) => {
        const target = Number(counter.dataset.count || 0);
        counter.textContent = String(Math.round(target * eased));
      });

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        finish();
      }
    };

    requestAnimationFrame(tick);
  };

  if (!("IntersectionObserver" in window)) {
    run();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        run();
      }
    },
    { threshold: 0.35 },
  );

  const statsSection = root.querySelector(".home-stats");
  if (statsSection) observer.observe(statsSection);
}

export function mount(root, { navigate }) {
  document.documentElement.classList.add("home-page-active");
  document.body.classList.add("home-page-active");
  const featuredItem = NEWS_ITEMS.find((item) => item.featured);
  const latestItems = NEWS_ITEMS.filter((item) => !item.featured);

  renderShell(root, {
    activePath: "/home",
    content: `
      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-hero-media" aria-hidden="true">
          <video autoplay muted loop playsinline preload="auto">
            <source src="/image/Background_Lobby.webm" type="video/webm" />
          </video>
        </div>
        <div class="home-hero-content">
          <p class="home-kicker">Two players. Three regions. One rift.</p>
          <h1 id="home-title" class="cinzel">RiftConquest</h1>
          <p class="home-copy">
            Deploy champions, control Noxus, Demacia, and Ionia, and race to
            12 Victory Points in a compact tactical card duel.
          </p>
          <div class="home-actions">
            <button class="btn btn-primary" type="button" data-nav="/play">
              <span class="mdi mdi-sword-cross ui-icon" aria-hidden="true"></span>
              <span>Play</span>
            </button>
            <button class="btn btn-secondary" type="button" data-nav="/how-to-play">
              <span class="mdi mdi-book-open-page-variant ui-icon" aria-hidden="true"></span>
              <span>How To Play</span>
            </button>
          </div>
        </div>
      </section>
      <section class="home-section home-news" aria-labelledby="home-news-title">
        <div class="home-section-heading">
          <p class="home-kicker">Latest from the rift</p>
          <h2 id="home-news-title" class="cinzel">What's New</h2>
          <p>Recent project updates and gameplay-facing improvements.</p>
        </div>
        <div class="home-news-layout">
          <article class="home-news-featured">
            <span class="home-news-label">${featuredItem.label}</span>
            <span class="mdi ${featuredItem.icon} home-news-icon" aria-hidden="true"></span>
            <h3>${featuredItem.title}</h3>
            <p>${featuredItem.text}</p>
          </article>
          <div class="home-news-list">
            ${latestItems
              .map(
                (item) => `
                  <article class="home-news-card">
                    <span class="mdi ${item.icon} home-news-icon" aria-hidden="true"></span>
                    <div>
                      <span class="home-news-label">${item.label}</span>
                      <h3>${item.title}</h3>
                      <p>${item.text}</p>
                    </div>
                  </article>
                `,
              )
              .join("")}
          </div>
        </div>
      </section>
      <section class="home-section home-stats" aria-labelledby="home-stats-title">
        <div class="home-section-heading">
          <p class="home-kicker">Quick facts</p>
          <h2 id="home-stats-title" class="cinzel">Built For Fast Duels</h2>
        </div>
        <div class="home-stats-grid">
          ${STAT_ITEMS.map(
            (item) => `
              <article class="home-stat-card">
                <div class="home-stat-value" aria-label="${item.title}">
                  ${renderStatValue(item.value)}
                </div>
                <h3>${item.title}</h3>
                <p>${item.text}</p>
              </article>
            `,
          ).join("")}
        </div>
      </section>
      <footer class="home-footer">
        <div>
          <p class="home-kicker">Project</p>
          <h2 class="cinzel">RiftConquest</h2>
          <p>
            A compact two-player tactical card game built as a browser-first
            experiment in clean realtime gameplay.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          <h3>Links</h3>
          ${FOOTER_LINKS.map(
            (link) => `
              <button type="button" data-nav="${link.path}">${link.label}</button>
            `,
          ).join("")}
        </nav>
        <div>
          <h3>Policy</h3>
          <p>Privacy, terms, and support pages can be added here when the deployment needs them.</p>
        </div>
        <div>
          <h3>Contact</h3>
          <p>For now, use the project repository or deployment dashboard notes as the source of support contact.</p>
        </div>
      </footer>
    `,
  });
  bindShellNavigation(root, navigate);
  animateStatCounters(root);
}

export function unmount() {
  document.documentElement.classList.remove("home-page-active");
  document.body.classList.remove("home-page-active");
}
