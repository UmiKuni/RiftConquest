import { bindShellNavigation, renderShell } from "../../app/shell.js";
import { fetchNewsPosts } from "../../shared/api.js";

const CATEGORIES = [
  "All",
  "Version Updates",
  "Tournament",
  "Announcement",
  "Dev Log",
];

let activeCategory = "All";
let disposed = false;

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

function getFilteredPosts(posts) {
  if (activeCategory === "All") return posts;
  return posts.filter((post) => post.category === activeCategory);
}

function getSelectedPost(posts, slug) {
  return posts.find((post) => post.slug === slug) || posts[0] || null;
}

function renderCategoryTabs(root, posts, selectedSlug, navigate) {
  const tabs = root.querySelector("#newsCategoryTabs");
  if (!tabs) return;

  tabs.innerHTML = CATEGORIES.map(
    (category) => `
      <button
        class="news-category-tab${activeCategory === category ? " active" : ""}"
        type="button"
        data-news-category="${escapeHtml(category)}"
      >
        ${escapeHtml(category)}
      </button>
    `,
  ).join("");

  tabs.querySelectorAll("[data-news-category]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.getAttribute("data-news-category") || "All";
      renderNewsContent(root, posts, selectedSlug, navigate);
    });
  });
}

function renderSelectedPost(root, post) {
  const detail = root.querySelector("#newsSelectedPost");
  if (!detail) return;

  if (!post) {
    detail.innerHTML = `
      <div class="news-empty">
        <span class="mdi mdi-newspaper-variant-outline ui-icon" aria-hidden="true"></span>
        <h2>No news found</h2>
        <p>Try another category once more updates are published.</p>
      </div>
    `;
    return;
  }

  detail.innerHTML = `
    <article class="news-detail-card">
      <p class="home-kicker">${escapeHtml(post.category)} - ${escapeHtml(post.version || "Update")}</p>
      <h1 class="cinzel">${escapeHtml(post.title)}</h1>
      <p class="news-detail-date">${escapeHtml(formatDate(post.publishedAt))}</p>
      <p class="news-detail-excerpt">${escapeHtml(post.excerpt)}</p>
      <p>${escapeHtml(post.body)}</p>
      <div class="news-tags" aria-label="News tags">
        ${(post.tags || [])
          .map((tag) => `<span>${escapeHtml(tag)}</span>`)
          .join("")}
      </div>
    </article>
  `;
}

function renderPostList(root, posts, selectedSlug, navigate) {
  const list = root.querySelector("#newsPostList");
  if (!list) return;

  const filteredPosts = getFilteredPosts(posts);
  const selected = getSelectedPost(filteredPosts, selectedSlug);
  renderSelectedPost(root, selected);

  list.innerHTML = filteredPosts.length
    ? filteredPosts
        .map(
          (post) => `
            <button
              class="news-list-card${selected && selected.slug === post.slug ? " active" : ""}"
              type="button"
              data-news-slug="${escapeHtml(post.slug)}"
            >
              <span class="news-list-meta">
                ${escapeHtml(post.category)} - ${escapeHtml(formatDate(post.publishedAt))}
              </span>
              <strong>${escapeHtml(post.title)}</strong>
              <span>${escapeHtml(post.excerpt)}</span>
            </button>
          `,
        )
        .join("")
    : `
      <div class="news-empty">
        <span class="mdi mdi-newspaper-variant-outline ui-icon" aria-hidden="true"></span>
        <h2>No posts in this category</h2>
        <p>More RiftConquest updates will appear here later.</p>
      </div>
    `;

  list.querySelectorAll("[data-news-slug]").forEach((button) => {
    button.addEventListener("click", () => {
      const slug = button.getAttribute("data-news-slug");
      if (slug) navigate(`/news?post=${encodeURIComponent(slug)}`);
    });
  });
}

function renderNewsContent(root, posts, selectedSlug, navigate) {
  renderCategoryTabs(root, posts, selectedSlug, navigate);
  renderPostList(root, posts, selectedSlug, navigate);
}

function renderNewsState(root, html) {
  const state = root.querySelector("#newsRouteState");
  if (state) state.innerHTML = html;
}

export function mount(root, { navigate, route }) {
  disposed = false;
  activeCategory = "All";
  document.documentElement.classList.add("news-page-active");
  document.body.classList.add("news-page-active");

  renderShell(root, {
    activePath: "/news",
    content: `
      <section class="news-page" aria-labelledby="news-title">
        <header class="news-hero">
          <p class="home-kicker">Patch notes and events</p>
          <h1 id="news-title" class="cinzel">News</h1>
          <p>
            Track version updates, tournament planning, announcements, and
            behind-the-scenes development notes from RiftConquest.
          </p>
        </header>
        <div id="newsRouteState" class="news-route-state">
          <div class="news-loading">
            <span class="mdi mdi-loading mdi-spin ui-icon" aria-hidden="true"></span>
            <p>Loading latest news...</p>
          </div>
        </div>
      </section>
    `,
  });
  bindShellNavigation(root, navigate);

  fetchNewsPosts()
    .then((posts) => {
      if (disposed) return;
      renderNewsState(
        root,
        `
          <div class="news-layout">
            <aside class="news-detail" id="newsSelectedPost" aria-live="polite"></aside>
            <section class="news-index" aria-label="News posts">
              <div class="news-category-tabs" id="newsCategoryTabs" aria-label="News categories"></div>
              <div class="news-list" id="newsPostList"></div>
            </section>
          </div>
        `,
      );
      renderNewsContent(root, posts, route.query.get("post"), navigate);
    })
    .catch((err) => {
      if (disposed) return;
      renderNewsState(
        root,
        `
          <div class="news-empty news-error">
            <span class="mdi mdi-alert-circle-outline ui-icon" aria-hidden="true"></span>
            <h2>News is unavailable</h2>
            <p>${escapeHtml(err && err.message ? err.message : "Failed to load news.")}</p>
          </div>
        `,
      );
    });
}

export function unmount() {
  disposed = true;
  document.documentElement.classList.remove("news-page-active");
  document.body.classList.remove("news-page-active");
}
