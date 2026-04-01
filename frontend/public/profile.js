function sanitizeDisplayName(raw) {
  if (typeof raw !== "string") return "";
  let name = raw.trim().replace(/\s+/g, " ");
  name = name.replace(/[^a-zA-Z0-9 _-]/g, "");
  if (name.length > 16) name = name.slice(0, 16);
  return name;
}

// Global loading overlay (provided by ui-busy.js). Safe: if missing, no-op.
const uiBusy = window.uiBusy || null;
function busyWith(fnOrPromise, message) {
  if (uiBusy) return uiBusy.withBusy(fnOrPromise, message);
  return typeof fnOrPromise === "function"
    ? Promise.resolve().then(fnOrPromise)
    : Promise.resolve(fnOrPromise);
}
function makeInlineSpinner() {
  const el = document.createElement("span");
  el.className = "ui-spinner inline";
  el.setAttribute("aria-hidden", "true");
  return el;
}

function isNonAnonymousAccount(user) {
  return !!(user && user.uid && user.isAnonymous === false);
}

function setProfileMessage(msg, isError = false) {
  const el = document.getElementById("profileMsg");
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

async function getIdTokenSafe(user) {
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

async function fetchMe(user) {
  const token = await getIdTokenSafe(user);
  if (!token) throw new Error("Missing auth token.");

  const res = await fetch("/api/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      body && body.error ? String(body.error) : "Failed to load profile.";
    throw new Error(msg);
  }
  return body && body.me ? body.me : null;
}

async function fetchMatchHistory(user, limit = 20) {
  const token = await getIdTokenSafe(user);
  if (!token) throw new Error("Missing auth token.");

  const url = `/api/me/matchHistory?limit=${encodeURIComponent(String(limit))}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      body && body.error ? String(body.error) : "Failed to load match history.";
    throw new Error(msg);
  }

  return body && Array.isArray(body.items) ? body.items : [];
}

async function saveDisplayName(user, displayName) {
  const token = await getIdTokenSafe(user);
  if (!token) throw new Error("Missing auth token.");

  const res = await fetch("/api/me/displayName", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ displayName }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      body && body.error
        ? String(body.error)
        : "Failed to update display name.";
    throw new Error(msg);
  }

  const saved =
    body && typeof body.displayName === "string"
      ? sanitizeDisplayName(body.displayName)
      : "";
  return saved || sanitizeDisplayName(displayName);
}

function setDisabled(isDisabled) {
  const nameInput = document.getElementById("profileNameInput");
  const btnSave = document.getElementById("btnSaveName");
  if (nameInput) nameInput.disabled = !!isDisabled;
  if (btnSave) btnSave.disabled = !!isDisabled;
}

function formatEndedAt(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "—";
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

function renderMatchHistory(items, { emptyMessage = "No matches yet." } = {}) {
  const list = document.getElementById("matchHistoryList");
  if (!list) return;

  list.textContent = "";

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "match-empty";

    const isLoading =
      typeof emptyMessage === "string" &&
      emptyMessage.toLowerCase().includes("loading");
    if (isLoading) {
      empty.appendChild(makeInlineSpinner());
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
      result === "win" ? "WIN" : result === "loss" ? "LOSS" : "—";

    const meta = document.createElement("div");
    meta.className = "match-meta";

    const opp = document.createElement("div");
    opp.className = "match-opponent";
    const oppName =
      m && typeof m.opponentName === "string"
        ? m.opponentName
        : "Unknown opponent";
    opp.textContent = oppName;

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
      delta === 0 ? "±0" : delta > 0 ? `+${delta}` : String(delta);

    right.appendChild(deltaEl);

    row.appendChild(badge);
    row.appendChild(meta);
    row.appendChild(right);

    list.appendChild(row);
  }
}

function renderAnalytics(me, historyItems) {
  const winRateEl = document.getElementById("profileWinRate");
  const recentEl = document.getElementById("profileRecent");
  const eloDeltaEl = document.getElementById("profileEloDelta");

  if (winRateEl) winRateEl.textContent = "—";
  if (recentEl) recentEl.textContent = "—";
  if (eloDeltaEl) {
    eloDeltaEl.textContent = "—";
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
    const pct = Math.round((wins / matches) * 100);
    winRateEl.textContent = `${pct}%`;
  }

  const recent = Array.isArray(historyItems) ? historyItems.slice(0, 10) : [];
  if (recentEl && recent.length) {
    let w = 0;
    let l = 0;
    for (const m of recent) {
      if (m && m.result === "win") w++;
      else if (m && m.result === "loss") l++;
    }
    recentEl.textContent = `W${w}–L${l}`;
  }

  if (eloDeltaEl && recent.length) {
    let sum = 0;
    for (const m of recent) {
      const d =
        m && typeof m.delta === "number" && Number.isFinite(m.delta)
          ? m.delta
          : 0;
      sum += d;
    }
    const rounded = Math.round(sum);
    eloDeltaEl.textContent =
      rounded === 0 ? "±0" : rounded > 0 ? `+${rounded}` : String(rounded);
    if (rounded > 0) eloDeltaEl.classList.add("positive");
    if (rounded < 0) eloDeltaEl.classList.add("negative");
  }
}

function renderMe(me) {
  const nameInput = document.getElementById("profileNameInput");
  const matchesEl = document.getElementById("profileMatches");
  const winsEl = document.getElementById("profileWins");
  const eloEl = document.getElementById("profileElo");

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

let currentUser = null;

async function initForUser(user) {
  return busyWith(async () => {
    setProfileMessage("");
    renderAnalytics(null, []);

    // Block interaction while we validate auth + fetch profile data.
    setDisabled(true);

    if (!isNonAnonymousAccount(user)) {
      renderMatchHistory([], {
        emptyMessage: "Please login to view your match history.",
      });
      setProfileMessage("Please login to view your profile.", true);
      return;
    }

    renderMatchHistory([], { emptyMessage: "Loading match history…" });

    try {
      const me = await fetchMe(user);
      renderMe(me);

      let history = [];
      let historyFailed = false;
      try {
        history = await fetchMatchHistory(user, 20);
      } catch {
        history = [];
        historyFailed = true;
      }

      renderMatchHistory(history, {
        emptyMessage: historyFailed
          ? "Failed to load match history."
          : "No matches yet.",
      });
      renderAnalytics(me, history);
    } catch (err) {
      const msg =
        err && err.message ? String(err.message) : "Failed to load profile.";
      setProfileMessage(msg, true);
      renderMatchHistory([], {
        emptyMessage: "Failed to load match history.",
      });
    } finally {
      // Only re-enable controls for authenticated accounts.
      setDisabled(false);
    }
  }, "Loading profile…");
}

const btnSave = document.getElementById("btnSaveName");
if (btnSave) {
  btnSave.addEventListener("click", async () => {
    setProfileMessage("");
    const user = currentUser;
    if (!isNonAnonymousAccount(user)) {
      setProfileMessage("Please login to update your name.", true);
      return;
    }

    const nameInput = document.getElementById("profileNameInput");
    const raw = nameInput ? String(nameInput.value || "") : "";
    const sanitized = sanitizeDisplayName(raw);
    if (!sanitized) {
      setProfileMessage("Invalid display name.", true);
      return;
    }

    setDisabled(true);
    try {
      const saved = await busyWith(
        saveDisplayName(user, sanitized),
        "Saving display name…",
      );
      if (nameInput) nameInput.value = saved;
      setProfileMessage("Display name updated.");
    } catch (err) {
      const msg =
        err && err.message
          ? String(err.message)
          : "Failed to update display name.";
      setProfileMessage(msg, true);
    } finally {
      setDisabled(false);
    }
  });
}

const btnBackLobby = document.getElementById("btnBackLobby");
if (btnBackLobby) {
  btnBackLobby.addEventListener("click", () => {
    window.location.href = "/";
  });
}

// Firebase bootstrap (via firebase-client.js)
if (window.firebaseAuth) {
  window.firebaseAuth.onAuthStateChanged((user) => {
    currentUser = user || null;
    void initForUser(currentUser);
  });
} else {
  setDisabled(true);
  renderAnalytics(null, []);
  renderMatchHistory([], { emptyMessage: "Auth unavailable." });
  setProfileMessage("Auth unavailable.", true);
}
