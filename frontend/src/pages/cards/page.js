import { bindShellNavigation, renderShell } from "../../app/shell.js";
import {
  CARD_CATALOG,
  CARD_REGIONS,
  CARD_TYPES,
} from "../../shared/cardCatalog.js";

const PAGE_SIZE = 12;

const state = {
  query: "",
  region: "All",
  type: "All",
  selectedId: CARD_CATALOG[0]?.id || "",
  page: 1,
};

let smoothScrollFrame = null;
let smoothScrollTarget = 0;

function stopGalleryScrollAnimation() {
  if (smoothScrollFrame) {
    cancelAnimationFrame(smoothScrollFrame);
    smoothScrollFrame = null;
  }
}

function resetGalleryScroll(root) {
  stopGalleryScrollAnimation();
  const galleryPanel = root.querySelector("#cardsGalleryPanel");
  smoothScrollTarget = 0;
  if (galleryPanel) galleryPanel.scrollTop = 0;
}

function animateGalleryScroll(galleryPanel) {
  if (smoothScrollFrame) return;

  function tick() {
    const diff = smoothScrollTarget - galleryPanel.scrollTop;

    if (Math.abs(diff) < 0.5) {
      galleryPanel.scrollTop = smoothScrollTarget;
      smoothScrollFrame = null;
      return;
    }

    galleryPanel.scrollTop += diff * 0.22;
    smoothScrollFrame = requestAnimationFrame(tick);
  }

  smoothScrollFrame = requestAnimationFrame(tick);
}

function scrollGalleryPanel(galleryPanel, rawDelta) {
  const maxScroll = galleryPanel.scrollHeight - galleryPanel.clientHeight;
  if (maxScroll <= 0 || rawDelta === 0) return false;

  const basis = smoothScrollFrame ? smoothScrollTarget : galleryPanel.scrollTop;
  const nextTarget = Math.max(0, Math.min(maxScroll, basis + rawDelta));
  if (Math.abs(nextTarget - basis) < 0.5) return false;

  smoothScrollTarget = nextTarget;
  animateGalleryScroll(galleryPanel);
  return true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function includesText(card, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [
    card.id,
    card.region,
    card.champion,
    card.type,
    card.ability || "No ability",
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function getFilteredCards() {
  return CARD_CATALOG.filter((card) => {
    const regionMatches = state.region === "All" || card.region === state.region;
    const typeMatches = state.type === "All" || card.type === state.type;
    return regionMatches && typeMatches && includesText(card, state.query);
  });
}

function getPageCount(cards) {
  return Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
}

function ensureSelection(cards) {
  const pageCount = getPageCount(cards);
  state.page = Math.max(1, Math.min(state.page, pageCount));
  const pageStart = (state.page - 1) * PAGE_SIZE;
  const pageCards = cards.slice(pageStart, pageStart + PAGE_SIZE);

  if (!cards.length) {
    state.selectedId = "";
    return;
  }

  if (!pageCards.some((card) => card.id === state.selectedId)) {
    state.selectedId = pageCards[0]?.id || cards[0].id;
  }
}

function getSelectedCard(cards = getFilteredCards()) {
  return (
    cards.find((card) => card.id === state.selectedId) ||
    cards[0] ||
    null
  );
}

function renderOptions(values, activeValue) {
  return ["All", ...values]
    .map(
      (value) => `
        <option value="${escapeHtml(value)}"${activeValue === value ? " selected" : ""}>
          ${escapeHtml(value)}
        </option>
      `,
    )
    .join("");
}

function renderCardThumb(card) {
  const selected = state.selectedId === card.id;
  return `
    <button
      class="cards-gallery-card${selected ? " selected" : ""}"
      type="button"
      data-card-id="${card.id}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <span class="cards-card-frame">
        <img src="${card.imagePath}" alt="${escapeHtml(card.champion)} card" loading="lazy" />
      </span>
      <span class="cards-card-badges">
        <span class="cards-card-strength" aria-label="Strength ${card.strength}">
          ${card.strength}
        </span>
        <span class="cards-card-region">${escapeHtml(card.region)}</span>
      </span>
      <span class="cards-card-name">${escapeHtml(card.champion)}</span>
    </button>
  `;
}

function renderSelectedCard(root, card) {
  const panel = root.querySelector("#cardsSelectedPanel");
  if (!panel) return;

  if (!card) {
    panel.innerHTML = `
      <div class="cards-selected-empty">
        <span class="mdi mdi-cards-outline ui-icon" aria-hidden="true"></span>
        <h2>No card selected</h2>
        <p>Try a different search or filter to find a card.</p>
      </div>
    `;
    return;
  }

  panel.innerHTML = `
    <div class="cards-selected-preview region-${escapeHtml(card.region)}">
      <div class="cards-selected-info">
        <span class="cards-selected-strength">${card.strength}</span>
        <strong>${escapeHtml(card.champion)}</strong>
        <span>${escapeHtml(card.region)} - ${escapeHtml(card.type)}</span>
      </div>
      <div class="cards-selected-art">
        <img src="${card.imagePath}" alt="${escapeHtml(card.champion)} card" />
      </div>
    </div>
    <div class="cards-selected-copy">
      <p class="home-kicker">${escapeHtml(card.region)} - ${escapeHtml(card.type)}</p>
      <h2 class="cinzel">${escapeHtml(card.champion)}</h2>
      <div class="cards-selected-stats">
        <div>
          <span>Strength</span>
          <strong>${card.strength}</strong>
        </div>
        <div>
          <span>Card ID</span>
          <strong>${escapeHtml(card.id)}</strong>
        </div>
      </div>
      <section>
        <h3>Ability</h3>
        <p>${escapeHtml(card.ability || "No ability.")}</p>
      </section>
    </div>
  `;
}

function renderPager(root, pageCount) {
  const pager = root.querySelector("#cardsPager");
  if (!pager) return;

  pager.innerHTML = `
    <button class="cards-page-btn" type="button" data-page-action="prev" ${state.page <= 1 ? "disabled" : ""} aria-label="Previous cards page">
      <span class="mdi mdi-chevron-left ui-icon" aria-hidden="true"></span>
    </button>
    <span>${state.page} / ${pageCount}</span>
    <button class="cards-page-btn" type="button" data-page-action="next" ${state.page >= pageCount ? "disabled" : ""} aria-label="Next cards page">
      <span class="mdi mdi-chevron-right ui-icon" aria-hidden="true"></span>
    </button>
  `;

  pager.querySelectorAll("[data-page-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-page-action");
      state.page += action === "next" ? 1 : -1;
      state.selectedId =
        getFilteredCards()[(state.page - 1) * PAGE_SIZE]?.id || "";
      renderGallery(root);
      resetGalleryScroll(root);
    });
  });
}

function renderGallery(root) {
  const cards = getFilteredCards();
  ensureSelection(cards);

  const selected = getSelectedCard(cards);
  const pageCount = getPageCount(cards);
  const start = (state.page - 1) * PAGE_SIZE;
  const visibleCards = cards.slice(start, start + PAGE_SIZE);
  const grid = root.querySelector("#cardsGalleryGrid");
  const count = root.querySelector("#cardsResultCount");

  if (count) {
    count.textContent = `${cards.length} ${cards.length === 1 ? "card" : "cards"}`;
  }

  renderSelectedCard(root, selected);
  renderPager(root, pageCount);

  if (!grid) return;

  grid.innerHTML = visibleCards.length
    ? visibleCards.map((card) => renderCardThumb(card)).join("")
    : `
      <div class="cards-empty">
        <span class="mdi mdi-cards-outline ui-icon" aria-hidden="true"></span>
        <h2>No cards found</h2>
        <p>Try a different champion, region, or ability search.</p>
      </div>
    `;

  grid.querySelectorAll("[data-card-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.getAttribute("data-card-id") || "";
      renderGallery(root);
    });
  });
}

function bindCardsPage(root) {
  const search = root.querySelector("#cardsSearch");
  const region = root.querySelector("#cardsRegionFilter");
  const type = root.querySelector("#cardsTypeFilter");
  const browser = root.querySelector(".cards-browser");
  const galleryPanel = root.querySelector("#cardsGalleryPanel");

  if (search) {
    search.addEventListener("input", () => {
      state.query = search.value;
      state.page = 1;
      renderGallery(root);
      resetGalleryScroll(root);
    });
  }

  if (region) {
    region.addEventListener("change", () => {
      state.region = region.value;
      state.page = 1;
      renderGallery(root);
      resetGalleryScroll(root);
    });
  }

  if (type) {
    type.addEventListener("change", () => {
      state.type = type.value;
      state.page = 1;
      renderGallery(root);
      resetGalleryScroll(root);
    });
  }

  if (browser && galleryPanel) {
    browser.addEventListener(
      "wheel",
      (event) => {
        if (window.matchMedia("(max-width: 900px)").matches) return;

        const multiplier =
          event.deltaMode === 1
            ? 36
            : event.deltaMode === 2
              ? galleryPanel.clientHeight
              : 1;
        const consumed = scrollGalleryPanel(galleryPanel, event.deltaY * multiplier);

        if (consumed) {
          event.preventDefault();
        }
      },
      { passive: false },
    );
  }
}

export function mount(root, { navigate }) {
  document.documentElement.classList.add("cards-page-active");
  document.body.classList.add("cards-page-active");
  stopGalleryScrollAnimation();
  smoothScrollTarget = 0;
  state.query = "";
  state.region = "All";
  state.type = "All";
  state.selectedId = CARD_CATALOG[0]?.id || "";
  state.page = 1;

  renderShell(root, {
    activePath: "/cards",
    content: `
      <section class="cards-page" aria-labelledby="cards-title">
        <header class="cards-hero">
          <p class="home-kicker">Card archive</p>
          <h1 id="cards-title" class="cinzel">Card Gallery</h1>
          <p>
            Browse the RiftConquest roster, select one card at a time, and study
            its region, strength, and ability before entering the rift.
          </p>
        </header>
        <section class="cards-browser" aria-label="Card gallery">
          <aside class="cards-selected-panel" id="cardsSelectedPanel" aria-live="polite"></aside>
          <div class="cards-gallery-panel" id="cardsGalleryPanel">
            <div class="cards-toolbar">
              <label class="cards-search">
                <span>Search cards</span>
                <input
                  id="cardsSearch"
                  type="search"
                  autocomplete="off"
                  placeholder="Champion, region, ability..."
                />
              </label>
              <label class="cards-select">
                <span>Region</span>
                <select id="cardsRegionFilter">
                  ${renderOptions(CARD_REGIONS, state.region)}
                </select>
              </label>
              <label class="cards-select">
                <span>Type</span>
                <select id="cardsTypeFilter">
                  ${renderOptions(CARD_TYPES, state.type)}
                </select>
              </label>
            </div>
            <div class="cards-gallery-heading">
              <p class="home-kicker">Gallery</p>
              <span id="cardsResultCount">${CARD_CATALOG.length} cards</span>
            </div>
            <div class="cards-gallery-grid" id="cardsGalleryGrid"></div>
            <nav class="cards-pager" id="cardsPager" aria-label="Card gallery pages"></nav>
          </div>
        </section>
      </section>
    `,
  });
  bindShellNavigation(root, navigate);
  bindCardsPage(root);
  renderGallery(root);
}

export function unmount() {
  stopGalleryScrollAnimation();
  smoothScrollTarget = 0;
  document.documentElement.classList.remove("cards-page-active");
  document.body.classList.remove("cards-page-active");
}
