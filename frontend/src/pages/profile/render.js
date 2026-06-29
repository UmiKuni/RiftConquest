import { qs } from "../../shared/dom.js";

function shared() {
  return window.rcShared || {};
}

export function setProfileMessage(root, msg, isError = false) {
  const el = qs(root, "#profileMsg");
  if (!el) return;
  if (!msg) {
    el.textContent = "";
    el.classList.add("hidden");
    el.classList.remove("error");
    return;
  }
  el.textContent = msg;
  el.classList.toggle("error", !!isError);
  el.classList.remove("hidden");
}

export function setDisabled(root, isDisabled) {
  const nameInput = qs(root, "#profileNameInput");
  const btnSave = qs(root, "#btnSaveName");
  if (nameInput) nameInput.disabled = !!isDisabled;
  if (btnSave) btnSave.disabled = !!isDisabled;
}

function formatEndedAt(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "--";
  const d = new Date(ms);
  const date = d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${time}`;
}

export function renderMatchHistory(
  root,
  items,
  { emptyMessage = "No matches yet." } = {},
) {
  const list = qs(root, "#matchHistoryList");
  if (!list) return;

  list.textContent = "";

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "match-empty";

    const isLoading =
      typeof emptyMessage === "string" &&
      emptyMessage.toLowerCase().includes("loading");
    if (isLoading && typeof shared().makeInlineSpinner === "function") {
      empty.appendChild(shared().makeInlineSpinner());
      empty.appendChild(document.createTextNode(emptyMessage));
    } else {
      empty.textContent = emptyMessage;
    }

    list.appendChild(empty);
    return;
  }

  for (const m of items) {
    const row = document.createElement("div");
    row.className = "match-row";

    const resultRaw = m && typeof m.result === "string" ? m.result : "";
    const result =
      resultRaw === "win" ? "win" : resultRaw === "loss" ? "loss" : "";

    const badge = document.createElement("div");
    badge.className = "match-result";
    if (result) badge.classList.add(result);
    badge.textContent =
      result === "win" ? "WIN" : result === "loss" ? "LOSS" : "--";

    const meta = document.createElement("div");
    meta.className = "match-meta";

    const opp = document.createElement("div");
    opp.className = "match-opponent";
    opp.textContent =
      m && typeof m.opponentName === "string"
        ? m.opponentName
        : "Unknown opponent";

    const date = document.createElement("div");
    date.className = "match-date";
    date.textContent = formatEndedAt(m && m.endedAtMs);

    meta.appendChild(opp);
    meta.appendChild(date);

    const right = document.createElement("div");
    right.className = "match-right";

    const deltaEl = document.createElement("div");
    deltaEl.className = "match-delta";
    const delta =
      m && typeof m.delta === "number" && Number.isFinite(m.delta)
        ? Math.round(m.delta)
        : 0;
    if (delta > 0) deltaEl.classList.add("positive");
    if (delta < 0) deltaEl.classList.add("negative");
    deltaEl.textContent =
      delta === 0 ? "+/-0" : delta > 0 ? `+${delta}` : String(delta);

    right.appendChild(deltaEl);
    row.appendChild(badge);
    row.appendChild(meta);
    row.appendChild(right);
    list.appendChild(row);
  }
}

export function renderAnalytics(root, me, historyItems) {
  const winRateEl = qs(root, "#profileWinRate");
  const recentEl = qs(root, "#profileRecent");
  const eloDeltaEl = qs(root, "#profileEloDelta");

  if (winRateEl) winRateEl.textContent = "--";
  if (recentEl) recentEl.textContent = "--";
  if (eloDeltaEl) {
    eloDeltaEl.textContent = "--";
    eloDeltaEl.classList.remove("positive", "negative");
  }

  const stats = me && me.stats ? me.stats : null;
  const matches =
    stats && typeof stats.matchTotal === "number"
      ? Math.max(0, Math.floor(stats.matchTotal))
      : 0;
  const wins =
    stats && typeof stats.wins === "number"
      ? Math.max(0, Math.floor(stats.wins))
      : 0;

  if (winRateEl && matches > 0) {
    winRateEl.textContent = `${Math.round((wins / matches) * 100)}%`;
  }

  const recent = Array.isArray(historyItems) ? historyItems.slice(0, 10) : [];
  if (recentEl && recent.length) {
    let w = 0;
    let l = 0;
    for (const m of recent) {
      if (m && m.result === "win") w++;
      else if (m && m.result === "loss") l++;
    }
    recentEl.textContent = `W${w}-L${l}`;
  }

  if (eloDeltaEl && recent.length) {
    const rounded = Math.round(
      recent.reduce(
        (sum, m) =>
          sum +
          (m && typeof m.delta === "number" && Number.isFinite(m.delta)
            ? m.delta
            : 0),
        0,
      ),
    );
    eloDeltaEl.textContent =
      rounded === 0 ? "+/-0" : rounded > 0 ? `+${rounded}` : String(rounded);
    if (rounded > 0) eloDeltaEl.classList.add("positive");
    if (rounded < 0) eloDeltaEl.classList.add("negative");
  }
}

export function renderMe(root, me) {
  const sanitizeDisplayName = shared().sanitizeDisplayName || ((value) => value);
  const nameInput = qs(root, "#profileNameInput");
  const matchesEl = qs(root, "#profileMatches");
  const winsEl = qs(root, "#profileWins");
  const eloEl = qs(root, "#profileElo");

  const displayName =
    me && typeof me.displayName === "string"
      ? sanitizeDisplayName(me.displayName)
      : "";
  const stats = me && me.stats ? me.stats : {};

  const matches =
    typeof stats.matchTotal === "number"
      ? Math.max(0, Math.floor(stats.matchTotal))
      : 0;
  const wins =
    typeof stats.wins === "number" ? Math.max(0, Math.floor(stats.wins)) : 0;
  const elo =
    typeof stats.elo === "number" && Number.isFinite(stats.elo)
      ? Math.round(stats.elo)
      : 0;

  if (nameInput) nameInput.value = displayName;
  if (matchesEl) matchesEl.textContent = String(matches);
  if (winsEl) winsEl.textContent = String(wins);
  if (eloEl) eloEl.textContent = String(elo);
}
