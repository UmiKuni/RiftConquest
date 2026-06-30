import { bindShellNavigation, renderShell } from "../../app/shell.js";
import { fetchNewsPosts } from "../../shared/api.js";

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
  { label: "News", path: "/news" },
  { label: "How To Play", path: "/how-to-play" },
  { label: "Cards", path: "/cards" },
  { label: "Play", path: "/play" },
  { label: "Profile", path: "/profile" },
];

let disposed = false;
let coffeeKeydownHandler = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

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

function renderHomeNews(root, posts, navigate) {
  const container = root.querySelector("#homeNewsContent");
  if (!container) return;

  container.classList.remove("home-news-loading");
  const [featuredItem, ...latestItems] = posts.slice(0, 4);

  if (!featuredItem) {
    container.classList.add("home-news-loading");
    container.innerHTML = `
      <div class="home-news-empty">
        <span class="mdi mdi-newspaper-variant-outline home-news-icon" aria-hidden="true"></span>
        <h3>News is warming up</h3>
        <p>Version updates, tournaments, and development notes will appear here soon.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <button class="home-news-featured" type="button" data-news-slug="${escapeHtml(featuredItem.slug)}">
      <span class="home-news-label">Newest post</span>
      <span class="mdi mdi-newspaper-variant-outline home-news-icon" aria-hidden="true"></span>
      <h3>${escapeHtml(featuredItem.title)}</h3>
      <p>${escapeHtml(featuredItem.excerpt)}</p>
      <span class="home-news-date">${escapeHtml(formatDate(featuredItem.publishedAt))}</span>
    </button>
    <div class="home-news-list">
      ${latestItems
        .map(
          (item) => `
            <button class="home-news-card" type="button" data-news-slug="${escapeHtml(item.slug)}">
              <span class="mdi mdi-bulletin-board home-news-icon" aria-hidden="true"></span>
              <div>
                <span class="home-news-label">${escapeHtml(item.category)}</span>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.excerpt)}</p>
                <span class="home-news-date">${escapeHtml(formatDate(item.publishedAt))}</span>
              </div>
            </button>
          `,
        )
        .join("")}
    </div>
  `;

  container.querySelectorAll("[data-news-slug]").forEach((button) => {
    button.addEventListener("click", () => {
      const slug = button.getAttribute("data-news-slug");
      if (slug) navigate(`/news?post=${encodeURIComponent(slug)}`);
    });
  });
}

function renderHomeNewsError(root, message) {
  const container = root.querySelector("#homeNewsContent");
  if (!container) return;
  container.classList.add("home-news-loading");
  container.innerHTML = `
    <div class="home-news-empty">
      <span class="mdi mdi-alert-circle-outline home-news-icon" aria-hidden="true"></span>
      <h3>News is unavailable</h3>
      <p>${escapeHtml(message || "Failed to load news.")}</p>
    </div>
  `;
}

function closeCoffeeModal(root) {
  const modal = root.querySelector("#coffeeModal");
  if (modal) modal.hidden = true;
}

function openCoffeeModal(root) {
  const modal = root.querySelector("#coffeeModal");
  if (!modal) return;
  modal.hidden = false;
  const closeButton = modal.querySelector("[data-coffee-close]");
  if (closeButton) closeButton.focus();
}

function bindCoffeeModal(root) {
  const openButton = root.querySelector("[data-coffee-open]");
  const modal = root.querySelector("#coffeeModal");
  if (!openButton || !modal) return;

  openButton.addEventListener("click", () => openCoffeeModal(root));
  modal.querySelectorAll("[data-coffee-close]").forEach((button) => {
    button.addEventListener("click", () => closeCoffeeModal(root));
  });

  coffeeKeydownHandler = (event) => {
    if (event.key === "Escape") closeCoffeeModal(root);
  };
  document.addEventListener("keydown", coffeeKeydownHandler);
}

export function mount(root, { navigate }) {
  disposed = false;
  document.documentElement.classList.add("home-page-active");
  document.body.classList.add("home-page-active");

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
        <div class="home-news-layout home-news-loading" id="homeNewsContent" aria-live="polite">
          <span class="mdi mdi-loading mdi-spin home-news-icon" aria-hidden="true"></span>
          <p>Loading latest news...</p>
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
          <p class="home-footer-contact">Contact: <a href="mailto:riftconquest@gmail.com">riftconquest@gmail.com</a></p>
          <p class="home-footer-contact">Developer: RiftConquest Team</p>
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
          <h3>Support</h3>
          <p>Fuel future updates, tournaments, and card polish.</p>
          <button class="home-coffee-button" type="button" data-coffee-open>
            <span class="mdi mdi-coffee-outline ui-icon" aria-hidden="true"></span>
            <span>Buy me Coffee</span>
          </button>
        </div>
      </footer>
      <div class="home-coffee-modal" id="coffeeModal" role="dialog" aria-modal="true" aria-labelledby="coffeeModalTitle" hidden>
        <button class="home-coffee-backdrop" type="button" data-coffee-close aria-label="Close support popup"></button>
        <div class="home-coffee-dialog">
          <button class="home-coffee-close" type="button" data-coffee-close aria-label="Close support popup">
            <span class="mdi mdi-close ui-icon" aria-hidden="true"></span>
          </button>
          <p class="home-kicker">Support RiftConquest</p>
          <h2 id="coffeeModalTitle" class="cinzel">Buy me Coffee</h2>
          <div class="home-coffee-qr" aria-label="QR code placeholder">
            <span class="mdi mdi-qrcode ui-icon" aria-hidden="true"></span>
            <span>QR code coming soon</span>
          </div>
          <p>Thanks for helping the rift stay alive. The real QR code can be dropped in here later.</p>
        </div>
      </div>
    `,
  });
  bindShellNavigation(root, navigate);
  bindCoffeeModal(root);
  animateStatCounters(root);

  fetchNewsPosts({ limit: 4 })
    .then((posts) => {
      if (!disposed) renderHomeNews(root, posts, navigate);
    })
    .catch((err) => {
      if (!disposed) {
        renderHomeNewsError(
          root,
          err && err.message ? err.message : "Failed to load news.",
        );
      }
    });
}

export function unmount() {
  disposed = true;
  if (coffeeKeydownHandler) {
    document.removeEventListener("keydown", coffeeKeydownHandler);
    coffeeKeydownHandler = null;
  }
  document.documentElement.classList.remove("home-page-active");
  document.body.classList.remove("home-page-active");
}
