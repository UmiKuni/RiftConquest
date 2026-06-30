import lobbyHtml from "./template.html?raw";
import { checkBackendHealth } from "../../shared/api.js";
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
let mountedRoot = null;
let loadingController = null;

const MIN_LOADING_MS = 1800;
const READY_PAUSE_MS = 350;

const PRELOAD_ASSETS = [
  "/image/RiftConquest_Logo.png",
  "/image/Background_Lobby.webm",
  "/image/Icon_Noxus.webp",
  "/image/Icon_Demacia.webp",
  "/image/Icon_Ionia.webp",
  "/image/N1.jpg",
  "/image/D1.jpg",
  "/image/I1.jpg",
  "/sounds/sfx/sfx_button_click.mp3",
  "/sounds/background/background_finding.mp3",
];

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function createLoadingController(root) {
  let current = 0;
  let canceled = false;
  let frameId = null;
  let animationResolve = null;
  const timers = new Map();
  const startedAt = performance.now();

  function render(progress, label) {
    const pct = clampPercent(progress);
    const rounded = Math.round(pct);
    const bar = root.querySelector("#playLoadBar");
    const progressEl = root.querySelector("#playProgress");
    const value = root.querySelector("#playLoadValue");
    const text = root.querySelector("#playLoadText");

    current = pct;
    if (bar) bar.style.width = `${pct}%`;
    if (progressEl) progressEl.setAttribute("aria-valuenow", String(rounded));
    if (value) value.textContent = `${rounded}%`;
    if (text && label) text.textContent = label;

  }

  function wait(ms) {
    return new Promise((resolve) => {
      if (canceled || ms <= 0) {
        resolve();
        return;
      }
      const timerId = setTimeout(() => {
        timers.delete(timerId);
        resolve();
      }, ms);
      timers.set(timerId, resolve);
    });
  }

  function animateTo(targetPercent, label, durationMs = 360) {
    return new Promise((resolve) => {
      if (canceled) {
        resolve();
        return;
      }

      if (frameId) cancelAnimationFrame(frameId);
      if (animationResolve) animationResolve();

      const from = current;
      const to = clampPercent(targetPercent);
      const started = performance.now();
      animationResolve = resolve;

      function tick(now) {
        if (canceled) {
          animationResolve = null;
          resolve();
          return;
        }

        const t = Math.min(1, (now - started) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        render(from + (to - from) * eased, label);

        if (t < 1) {
          frameId = requestAnimationFrame(tick);
          return;
        }

        frameId = null;
        animationResolve = null;
        resolve();
      }

      frameId = requestAnimationFrame(tick);
    });
  }

  const controller = {
    startLoading() {
      render(0, "Starting...");
    },

    advanceTo(targetPercent, label) {
      const distance = Math.abs(clampPercent(targetPercent) - current);
      const duration = Math.max(260, Math.min(620, distance * 18));
      return animateTo(targetPercent, label, duration);
    },

    async complete(label = "Ready.") {
      const elapsed = performance.now() - startedAt;
      if (elapsed < MIN_LOADING_MS) await wait(MIN_LOADING_MS - elapsed);
      await animateTo(100, label, 420);
      const panel = root.querySelector(".play-loading-panel");
      if (panel) panel.classList.add("ready");
      await wait(READY_PAUSE_MS);
    },

    fail(message) {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = null;
      if (animationResolve) {
        animationResolve();
        animationResolve = null;
      }
      render(0, message || "Backend is unavailable.");
      const panel = root.querySelector(".play-loading-panel");
      if (panel) panel.classList.add("failed");
    },

    cancel() {
      canceled = true;
      if (frameId) cancelAnimationFrame(frameId);
      frameId = null;
      if (animationResolve) {
        animationResolve();
        animationResolve = null;
      }
      for (const [timerId, resolve] of timers) {
        clearTimeout(timerId);
        resolve();
      }
      timers.clear();
    },

    isCanceled() {
      return canceled;
    },
  };

  return controller;
}

function renderLoading(root, navigate) {
  root.innerHTML = `
    <section class="play-loading">
      <div class="play-loading-panel">
        <p class="home-kicker">Preparing the rift</p>
        <h1 class="cinzel">Loading Lobby</h1>
        <div
          class="play-progress"
          id="playProgress"
          role="progressbar"
          aria-label="Loading progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="0"
        >
          <div class="play-progress-fill" id="playLoadBar"></div>
        </div>
        <div class="play-progress-meta">
          <span id="playLoadText">Starting...</span>
          <span id="playLoadValue">0%</span>
        </div>
        <button class="btn btn-secondary hidden" id="btnRetryPlay" type="button">
          <span class="mdi mdi-refresh ui-icon" aria-hidden="true"></span>
          <span>Retry</span>
        </button>
      </div>
    </section>
  `;
}

function showRetry(root, navigate, message, controller) {
  if (controller) controller.fail(message);
  const retry = root.querySelector("#btnRetryPlay");
  if (retry) {
    retry.classList.remove("hidden");
    retry.addEventListener("click", () => {
      void mount(root, { navigate });
    });
  }
}

async function preloadAsset(src) {
  const res = await fetch(src, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load ${src}`);
}

async function preloadAssets() {
  await Promise.all(PRELOAD_ASSETS.map((src) => preloadAsset(src)));
}

function ensureBrowserRuntimeReady() {
  if (!window.firebase || !window.firebaseAuth || !window.rcShared) {
    throw new Error("Browser runtime is not ready.");
  }
}

function isCurrentLoading(controller) {
  return (
    controller &&
    !controller.isCanceled() &&
    loadingController === controller
  );
}

export async function mount(root, { navigate }) {
  mountedRoot = root;
  lobbyStore.setState({ mountedAt: Date.now() });
  window.rcLobby = {};
  renderLoading(root, navigate);
  const loading = createLoadingController(root);
  loadingController = loading;
  loading.startLoading();

  try {
    await loading.advanceTo(8, "Initializing route...");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (!isCurrentLoading(loading)) return;

    await loading.advanceTo(25, "Checking backend...");
    const backendOk = await checkBackendHealth();
    if (!backendOk) throw new Error("Backend is unavailable.");
    if (!isCurrentLoading(loading)) return;

    await loading.advanceTo(60, "Loading lobby and game assets...");
    await preloadAssets();
    if (!isCurrentLoading(loading)) return;

    await loading.advanceTo(82, "Initializing browser services...");
    ensureBrowserRuntimeReady();
    if (!isCurrentLoading(loading)) return;

    await loading.advanceTo(96, "Preparing lobby...");
    const lobbyBodyHtml = pageBodyHtml(lobbyHtml);
    await loading.complete("Ready.");
    if (!isCurrentLoading(loading)) return;

    root.innerHTML = lobbyBodyHtml;
    await runLegacyScripts(LOBBY_SCRIPTS, { reload: true });
    mountedSocket =
      window.rcLobby && window.rcLobby.socket ? window.rcLobby.socket : null;
  } catch (err) {
    if (!isCurrentLoading(loading)) return;
    window.rcLobby = {};
    const message =
      err && err.message ? String(err.message) : "Backend is unavailable.";
    showRetry(root, navigate, message, loading);
  }
}

export function unmount() {
  if (loadingController) {
    loadingController.cancel();
    loadingController = null;
  }
  if (mountedSocket && typeof mountedSocket.disconnect === "function") {
    mountedSocket.disconnect();
  }
  mountedSocket = null;
  mountedRoot = null;
  window.rcLobby = {};
}
