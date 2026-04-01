const socket = io();

// Global loading overlay (provided by ui-busy.js). Safe: if missing, no-op.
const uiBusy = window.uiBusy || null;
function busyPush(message) {
  return uiBusy ? uiBusy.push(message) : null;
}
function busyPop(token) {
  if (uiBusy && token != null) uiBusy.pop(token);
}
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

const btnHost = document.getElementById("btnHost");
const btnShowJoin = document.getElementById("btnShowJoin");
const btnJoin = document.getElementById("btnJoin");
const btnCancelJoin = document.getElementById("btnCancelJoin");
const mainActions = document.getElementById("mainActions");
const joinActions = document.getElementById("joinActions");
const roomDisplay = document.getElementById("roomDisplay");
const roomCodeText = document.getElementById("roomCodeText");
const codeInput = document.getElementById("codeInput");
const statusMsg = document.getElementById("statusMsg");

let roomOpBusyToken = null;
let roomOpBusyTimeout = null;

function clearRoomOpBusy() {
  if (roomOpBusyTimeout) {
    clearTimeout(roomOpBusyTimeout);
    roomOpBusyTimeout = null;
  }
  if (roomOpBusyToken != null) {
    busyPop(roomOpBusyToken);
    roomOpBusyToken = null;
  }
}

function startRoomOpBusy(message) {
  clearRoomOpBusy();
  roomOpBusyToken = busyPush(message);
  // Never permanently block the lobby on a missing socket response.
  roomOpBusyTimeout = setTimeout(() => {
    clearRoomOpBusy();
    setStatus("Request timed out. Please try again.", true);
  }, 8000);
}

// ─── Auth UI (Phase 4) ───────────────────────────────────────────────────
const authMsg = document.getElementById("authMsg");
const guestPanel = document.getElementById("guestPanel");
const loginFlyout = document.getElementById("loginFlyout");
const btnLogin = document.getElementById("btnLogin");

const btnAccount = document.getElementById("btnAccount");
const accountName = document.getElementById("accountName");
const accountElo = document.getElementById("accountElo");
const accountMenu = document.getElementById("accountMenu");
const btnViewProfile = document.getElementById("btnViewProfile");
const btnLogout = document.getElementById("btnLogout");

const btnGoogleSignIn = document.getElementById("btnGoogleSignIn");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const btnEmailSignIn = document.getElementById("btnEmailSignIn");
const btnEmailSignUp = document.getElementById("btnEmailSignUp");

// ─── Guest identity (local-only) ─────────────────────────────────────────
// NOTE: localStorage is shared across tabs. For local 2-tab testing, keep an
// active per-tab name in sessionStorage and only use localStorage as a default.
const DISPLAY_NAME_STORAGE_KEY = "rc_displayName";
const DISPLAY_NAME_SESSION_KEY = "rc_displayName_session";
const displayNameInput = document.getElementById("displayNameInput");

let accountSummary = { displayName: "", elo: null };

function getFirebaseUser() {
  return window.firebaseAuth ? window.firebaseAuth.currentUser : null;
}

function isNonAnonymousAccount(user) {
  return !!(user && user.uid && user.isAnonymous === false);
}

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // ignore
  }
}

function safeSessionStorageGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function safeSessionStorageSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch (e) {
    // ignore
  }
}

function safeSessionStorageRemove(key) {
  try {
    sessionStorage.removeItem(key);
  } catch (e) {
    // ignore
  }
}

function sanitizeDisplayName(raw) {
  if (typeof raw !== "string") return "";
  let name = raw.trim().replace(/\s+/g, " ");
  name = name.replace(/[^a-zA-Z0-9 _-]/g, "");
  if (name.length > 16) name = name.slice(0, 16);
  return name;
}

function generateRandomDisplayName() {
  const adjectives = [
    "Brave",
    "Swift",
    "Arcane",
    "Shadow",
    "Crimson",
    "Golden",
    "Frost",
    "Iron",
  ];
  const nouns = [
    "Fox",
    "Raven",
    "Mage",
    "Knight",
    "Wolf",
    "Tiger",
    "Eagle",
    "Dragon",
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return sanitizeDisplayName(`${adj}${noun}${num}`) || "Guest";
}

function getOrCreateDisplayName() {
  const fromSession = sanitizeDisplayName(
    safeSessionStorageGet(DISPLAY_NAME_SESSION_KEY) || "",
  );
  if (fromSession) return fromSession;

  const fromLocal = sanitizeDisplayName(
    safeLocalStorageGet(DISPLAY_NAME_STORAGE_KEY) || "",
  );
  if (fromLocal) {
    safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, fromLocal);
    return fromLocal;
  }

  const generated = generateRandomDisplayName();
  safeLocalStorageSet(DISPLAY_NAME_STORAGE_KEY, generated);
  safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, generated);
  return generated;
}

function getCurrentDisplayName() {
  if (displayNameInput) {
    const fromInput = sanitizeDisplayName(displayNameInput.value);
    if (fromInput) {
      safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, fromInput);
      return fromInput;
    }
  }
  return getOrCreateDisplayName();
}

function getDisplayNameForGame() {
  const user = getFirebaseUser();
  if (isNonAnonymousAccount(user)) {
    const name = sanitizeDisplayName(accountSummary.displayName || "");
    return name || getOrCreateDisplayName();
  }
  return getCurrentDisplayName();
}

if (displayNameInput) {
  displayNameInput.value = getOrCreateDisplayName();

  displayNameInput.addEventListener("input", () => {
    const sanitized = sanitizeDisplayName(displayNameInput.value);
    if (sanitized) safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, sanitized);
  });

  displayNameInput.addEventListener("blur", () => {
    const sanitized = sanitizeDisplayName(displayNameInput.value);
    if (sanitized) {
      safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, sanitized);
      // Persist to localStorage only for Guest.
      const user = getFirebaseUser();
      if (!isNonAnonymousAccount(user))
        safeLocalStorageSet(DISPLAY_NAME_STORAGE_KEY, sanitized);
      displayNameInput.value = sanitized;
      return;
    }
    // Restore the previous stored name if the user clears it.
    displayNameInput.value = getOrCreateDisplayName();
  });

  displayNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") displayNameInput.blur();
  });
}

// ─── Auth helpers ───────────────────────────────────────────────────────
function setAuthMessage(msg, isError = false) {
  if (!authMsg) return;
  if (!msg) {
    authMsg.textContent = "";
    authMsg.classList.add("hidden");
    authMsg.classList.remove("error");
    return;
  }
  authMsg.textContent = msg;
  authMsg.classList.toggle("error", !!isError);
  authMsg.classList.remove("hidden");
}

function formatAuthStatus(user) {
  if (!user) return "Guest";
  if (user.isAnonymous) return "Guest";
  const email =
    typeof user.email === "string" && user.email.trim()
      ? user.email.trim()
      : null;
  return email ? `Signed in: ${email}` : "Signed in";
}

function humanizeAuthError(err) {
  const code = err && typeof err.code === "string" ? err.code : "";
  switch (code) {
    case "auth/popup-closed-by-user":
      return "Sign-in popup was closed.";
    case "auth/wrong-password":
      return "Wrong password.";
    case "auth/user-not-found":
      return "No account found for that email.";
    case "auth/email-already-in-use":
      return "That email is already in use.";
    case "auth/invalid-email":
      return "Invalid email address.";
    case "auth/weak-password":
      return "Password is too weak.";
    default:
      return "Authentication failed.";
  }
}

async function getIdTokenSafe(user) {
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

function setAccountSummaryLoading(isLoading) {
  const loading = !!isLoading;
  if (btnAccount) btnAccount.disabled = loading;
  if (loading) setAccountMenuOpen(false);

  if (accountElo && loading) {
    accountElo.textContent = "";
    accountElo.appendChild(makeInlineSpinner());
    accountElo.appendChild(document.createTextNode("…"));
  }
}

async function syncAccountProfile(user) {
  if (!isNonAnonymousAccount(user)) return;
  setAccountSummaryLoading(true);
  try {
    const token = await getIdTokenSafe(user);
    if (!token) return;

    try {
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const me = data && data.me ? data.me : null;
      const name =
        me && typeof me.displayName === "string"
          ? sanitizeDisplayName(me.displayName)
          : "";
      const elo =
        me &&
        me.stats &&
        typeof me.stats.elo === "number" &&
        Number.isFinite(me.stats.elo)
          ? Math.round(me.stats.elo)
          : null;

      if (name) accountSummary.displayName = name;
      if (elo !== null) accountSummary.elo = elo;
    } catch {
      // ignore
    }
  } finally {
    setAccountSummaryLoading(false);
    const name = sanitizeDisplayName(accountSummary.displayName || "");
    if (accountName) accountName.textContent = name || "Player";
    if (accountElo)
      accountElo.textContent =
        accountSummary.elo !== null ? String(accountSummary.elo) : "----";
  }
}

function setLoginFlyoutOpen(isOpen) {
  if (!btnLogin || !loginFlyout) return;
  btnLogin.setAttribute("aria-expanded", isOpen ? "true" : "false");
  loginFlyout.classList.toggle("hidden", !isOpen);
  if (!isOpen) setAuthMessage("");
}

function setAccountMenuOpen(isOpen) {
  if (!btnAccount || !accountMenu) return;
  btnAccount.setAttribute("aria-expanded", isOpen ? "true" : "false");
  accountMenu.classList.toggle("hidden", !isOpen);
}

function setAuthUiState({ isAccount }) {
  const showAccount = !!isAccount;
  if (guestPanel) guestPanel.classList.toggle("hidden", showAccount);
  if (btnLogin) btnLogin.classList.toggle("hidden", showAccount);
  if (loginFlyout) loginFlyout.classList.toggle("hidden", true);
  if (btnAccount) btnAccount.classList.toggle("hidden", !showAccount);
  if (!showAccount) setAccountMenuOpen(false);
}

// ─── Tabs ───────────────────────────────────────────────────────────────────
const tabButtons = Array.from(document.querySelectorAll(".lobby-tab"));
const tabPanels = {
  casual: document.getElementById("tabCasual"),
  ranked: document.getElementById("tabRanked"),
};

function setActiveTab(tabKey) {
  for (const btn of tabButtons) {
    const isActive = btn.getAttribute("data-tab") === tabKey;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  }

  for (const [key, panel] of Object.entries(tabPanels)) {
    if (!panel) continue;
    panel.classList.toggle("hidden", key !== tabKey);
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-tab");
    if (!key) return;
    setActiveTab(key);
  });
});

// ─── Leaderboard flyout (Phase 6) ─────────────────────────────────────────
const btnLeaderboardToggle = document.getElementById("btnLeaderboardToggle");
const leaderboardFlyout = document.getElementById("leaderboardFlyout");
const leaderboardList = document.getElementById("leaderboardList");
const btnLbPrev = document.getElementById("btnLbPrev");
const btnLbNext = document.getElementById("btnLbNext");

const leaderboardState = {
  pageSize: 10,
  pages: [{ cursor: null, startRank: 1, itemCount: 0 }],
  index: 0,
  nextCursor: null,
  loading: false,
  hasLoaded: false,
};

function setLeaderboardButtons() {
  if (btnLbPrev)
    btnLbPrev.disabled =
      leaderboardState.loading || leaderboardState.index <= 0;
  if (btnLbNext)
    btnLbNext.disabled =
      leaderboardState.loading || !leaderboardState.nextCursor;
}

function renderLeaderboardMessage(message) {
  if (!leaderboardList) return;
  leaderboardList.textContent = "";

  const empty = document.createElement("div");
  empty.className = "leaderboard-empty";

  const isLoading =
    typeof message === "string" && message.toLowerCase().includes("loading");
  if (isLoading) {
    empty.appendChild(makeInlineSpinner());
    empty.appendChild(document.createTextNode(message));
  } else {
    empty.textContent = message;
  }

  leaderboardList.appendChild(empty);
}

function renderLeaderboardRows(items, startRank) {
  if (!leaderboardList) return;
  leaderboardList.textContent = "";

  if (!Array.isArray(items) || items.length === 0) {
    renderLeaderboardMessage("No ranked players yet.");
    return;
  }

  items.forEach((item, idx) => {
    const rank = startRank + idx;
    const name =
      item && typeof item.displayName === "string" && item.displayName.trim()
        ? item.displayName.trim()
        : "Player";

    const eloRaw = item && typeof item.elo === "number" ? item.elo : null;
    const elo = Number.isFinite(eloRaw) ? Math.round(eloRaw) : 0;

    const matchRaw =
      item && typeof item.matchTotal === "number" ? item.matchTotal : null;
    const matchTotal =
      Number.isFinite(matchRaw) && matchRaw > 0 ? Math.floor(matchRaw) : 0;

    const row = document.createElement("div");
    row.className = "leaderboard-row";

    const rankEl = document.createElement("div");
    rankEl.className = "leaderboard-rank cinzel";
    rankEl.textContent = `#${rank}`;

    const nameEl = document.createElement("div");
    nameEl.className = "leaderboard-name";
    nameEl.textContent = name;

    const metaEl = document.createElement("div");
    metaEl.className = "leaderboard-meta";

    const eloEl = document.createElement("div");
    eloEl.className = "leaderboard-elo cinzel";
    eloEl.textContent = `ELO ${elo}`;

    const matchesEl = document.createElement("div");
    matchesEl.className = "leaderboard-matches";
    matchesEl.textContent = `${matchTotal} matches`;

    metaEl.appendChild(eloEl);
    metaEl.appendChild(matchesEl);

    row.appendChild(rankEl);
    row.appendChild(nameEl);
    row.appendChild(metaEl);

    leaderboardList.appendChild(row);
  });
}

async function fetchLeaderboardPage(cursor) {
  const params = new URLSearchParams();
  params.set("pageSize", String(leaderboardState.pageSize));
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(`/api/leaderboard?${params.toString()}`);
  if (!res.ok) {
    let msg = "Failed to load leaderboard.";
    try {
      const data = await res.json();
      if (data && typeof data.error === "string" && data.error.trim())
        msg = data.error.trim();
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const data = await res.json();
  return {
    items: Array.isArray(data && data.items) ? data.items : [],
    nextCursor:
      data && typeof data.nextCursor === "string" ? data.nextCursor : null,
  };
}

async function loadLeaderboardPageAt(index) {
  if (!leaderboardList) return;
  if (leaderboardState.loading) return;

  const page = leaderboardState.pages[index] || { cursor: null, startRank: 1 };

  leaderboardState.loading = true;
  setLeaderboardButtons();
  renderLeaderboardMessage("Loading…");

  try {
    const result = await fetchLeaderboardPage(page.cursor);

    const items = result.items;
    page.itemCount = Array.isArray(items) ? items.length : 0;
    leaderboardState.pages[index] = page;
    leaderboardState.nextCursor = result.nextCursor;
    leaderboardState.index = index;
    leaderboardState.hasLoaded = true;

    renderLeaderboardRows(items, page.startRank || 1);
  } catch (err) {
    const msg =
      err && typeof err.message === "string" && err.message.trim()
        ? err.message.trim()
        : "Failed to load leaderboard.";
    leaderboardState.nextCursor = null;
    renderLeaderboardMessage(msg);
  } finally {
    leaderboardState.loading = false;
    setLeaderboardButtons();
  }
}

function ensureLeaderboardLoaded() {
  if (leaderboardState.hasLoaded) return;
  void loadLeaderboardPageAt(leaderboardState.index);
}

function setLeaderboardOpen(isOpen) {
  if (!btnLeaderboardToggle || !leaderboardFlyout) return;
  btnLeaderboardToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  leaderboardFlyout.classList.toggle("hidden", !isOpen);
  if (isOpen) ensureLeaderboardLoaded();
}

if (btnLeaderboardToggle) {
  btnLeaderboardToggle.addEventListener("click", () => {
    const isOpen =
      btnLeaderboardToggle.getAttribute("aria-expanded") === "true";
    setLeaderboardOpen(!isOpen);
  });
}

if (btnLbPrev) {
  btnLbPrev.addEventListener("click", () => {
    if (leaderboardState.loading) return;
    if (leaderboardState.index <= 0) return;
    void loadLeaderboardPageAt(leaderboardState.index - 1);
  });
}

if (btnLbNext) {
  btnLbNext.addEventListener("click", () => {
    if (leaderboardState.loading) return;
    if (!leaderboardState.nextCursor) return;

    const current = leaderboardState.pages[leaderboardState.index] || {
      cursor: null,
      startRank: 1,
      itemCount: 0,
    };

    const nextIndex = leaderboardState.index + 1;
    if (
      !leaderboardState.pages[nextIndex] ||
      leaderboardState.pages[nextIndex].cursor !== leaderboardState.nextCursor
    ) {
      leaderboardState.pages[nextIndex] = {
        cursor: leaderboardState.nextCursor,
        startRank: (current.startRank || 1) + (current.itemCount || 0),
        itemCount: 0,
      };
    }

    void loadLeaderboardPageAt(nextIndex);
  });
}

setLeaderboardButtons();

// ─── Ranked (UI-only in Phase 2) ────────────────────────────────────────────
const btnRankedFind = document.getElementById("btnRankedFind");
const btnRankedCancel = document.getElementById("btnRankedCancel");
const rankedQueueStatus = document.getElementById("rankedQueueStatus");
const rankedQueueTimer = document.getElementById("rankedQueueTimer");

let rankedAllowed = false;
let rankedSearching = false;

let rankedTimerInterval = null;
let rankedSearchStartedAt = null;

function formatMmSs(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateRankedTimer() {
  if (!rankedQueueTimer || !rankedSearchStartedAt) return;
  const elapsedSeconds = Math.floor(
    (Date.now() - rankedSearchStartedAt) / 1000,
  );
  rankedQueueTimer.textContent = formatMmSs(elapsedSeconds);
}

function startRankedTimer() {
  rankedSearchStartedAt = Date.now();
  updateRankedTimer();
  if (rankedTimerInterval) clearInterval(rankedTimerInterval);
  rankedTimerInterval = setInterval(updateRankedTimer, 1000);
}

function stopRankedTimer({ reset } = { reset: true }) {
  if (rankedTimerInterval) clearInterval(rankedTimerInterval);
  rankedTimerInterval = null;
  rankedSearchStartedAt = null;
  if (reset && rankedQueueTimer) rankedQueueTimer.textContent = "00:00";
}

function setRankedSearching(isSearching) {
  rankedSearching = !!isSearching;
  if (btnRankedFind) btnRankedFind.disabled = isSearching;
  if (btnRankedCancel) btnRankedCancel.classList.toggle("hidden", !isSearching);
  if (rankedQueueStatus)
    rankedQueueStatus.classList.toggle("hidden", !isSearching);

  if (isSearching) startRankedTimer();
  else stopRankedTimer({ reset: true });

  if (btnRankedFind) btnRankedFind.disabled = rankedSearching || !rankedAllowed;
}

function setRankedAllowed(isAllowed) {
  rankedAllowed = !!isAllowed;

  if (!rankedAllowed) {
    // Force-cancel any searching UI when not eligible.
    if (rankedSearching) setRankedSearching(false);
    if (btnRankedFind) btnRankedFind.title = "Sign in to play Ranked.";
  } else {
    if (btnRankedFind) btnRankedFind.title = "";
  }

  if (btnRankedFind) btnRankedFind.disabled = rankedSearching || !rankedAllowed;
}

if (btnRankedFind) {
  btnRankedFind.addEventListener("click", () => {
    if (!rankedAllowed) {
      setLoginFlyoutOpen(true);
      setAuthMessage("Sign in to play Ranked.", true);
      return;
    }
    setStatus("");
    setRankedSearching(true);
    socket.emit("rankedFind");
  });
}
if (btnRankedCancel) {
  btnRankedCancel.addEventListener("click", () => {
    socket.emit("rankedCancel");
    setRankedSearching(false);
  });
}

// Ranked matchmaking server responses
socket.on("rankedQueued", () => {
  // If the server accepted our queue request, ensure the UI is in searching state.
  if (!rankedSearching) setRankedSearching(true);
});

socket.on("rankedCanceled", () => {
  setRankedSearching(false);
});

socket.on("rankedError", (msg) => {
  setRankedSearching(false);
  setStatus(msg || "Ranked unavailable.", true);
});

// Default tab
setActiveTab("casual");

// ─── Auth init (Phase 4) ────────────────────────────────────────────────
if (btnLogin) {
  btnLogin.addEventListener("click", () => {
    const isOpen = btnLogin.getAttribute("aria-expanded") === "true";
    setLoginFlyoutOpen(!isOpen);
  });
}

if (btnGoogleSignIn) {
  btnGoogleSignIn.addEventListener("click", async () => {
    setAuthMessage("");
    if (!window.firebaseAuth || !window.firebase) {
      setAuthMessage("Auth unavailable.", true);
      return;
    }

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await busyWith(
        window.firebaseAuth.signInWithPopup(provider),
        "Signing in…",
      );
    } catch (err) {
      setAuthMessage(humanizeAuthError(err), true);
    }
  });
}

if (btnEmailSignIn) {
  btnEmailSignIn.addEventListener("click", async () => {
    setAuthMessage("");
    if (!window.firebaseAuth) {
      setAuthMessage("Auth unavailable.", true);
      return;
    }

    const email = emailInput ? String(emailInput.value || "").trim() : "";
    const password = passwordInput ? String(passwordInput.value || "") : "";
    if (!email || !password) {
      setAuthMessage("Enter email + password.", true);
      return;
    }

    try {
      await busyWith(
        window.firebaseAuth.signInWithEmailAndPassword(email, password),
        "Signing in…",
      );
    } catch (err) {
      setAuthMessage(humanizeAuthError(err), true);
    }
  });
}

if (btnEmailSignUp) {
  btnEmailSignUp.addEventListener("click", async () => {
    setAuthMessage("");
    if (!window.firebaseAuth) {
      setAuthMessage("Auth unavailable.", true);
      return;
    }

    const email = emailInput ? String(emailInput.value || "").trim() : "";
    const password = passwordInput ? String(passwordInput.value || "") : "";
    if (!email || !password) {
      setAuthMessage("Enter email + password.", true);
      return;
    }

    try {
      await busyWith(
        window.firebaseAuth.createUserWithEmailAndPassword(email, password),
        "Creating account…",
      );
    } catch (err) {
      setAuthMessage(humanizeAuthError(err), true);
    }
  });
}

if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    setAuthMessage("");
    if (!window.firebaseAuth) return;

    try {
      await busyWith(
        (async () => {
          await window.firebaseAuth.signOut();
          // Return to Guest mode immediately.
          await window.firebaseAuth.signInAnonymously();
        })(),
        "Signing out…",
      );
    } catch (err) {
      setAuthMessage("Sign out failed.", true);
    }
  });
}

if (btnAccount) {
  btnAccount.addEventListener("click", () => {
    const isOpen = btnAccount.getAttribute("aria-expanded") === "true";
    setAccountMenuOpen(!isOpen);
  });
  btnAccount.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const isOpen = btnAccount.getAttribute("aria-expanded") === "true";
      setAccountMenuOpen(!isOpen);
    }
  });
}

if (btnViewProfile) {
  btnViewProfile.addEventListener("click", () => {
    setAccountMenuOpen(false);
    window.location.href = "/profile.html";
  });
}

document.addEventListener("click", (e) => {
  const target = e.target;
  const withinLogin =
    (btnLogin && btnLogin.contains(target)) ||
    (loginFlyout && loginFlyout.contains(target));
  if (!withinLogin) setLoginFlyoutOpen(false);

  const withinAccount =
    (btnAccount && btnAccount.contains(target)) ||
    (accountMenu && accountMenu.contains(target));
  if (!withinAccount) setAccountMenuOpen(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    setLoginFlyoutOpen(false);
    setAccountMenuOpen(false);
  }
});

// Keep UI + Socket identity in sync with Firebase Auth.
if (window.firebaseAuth) {
  window.firebaseAuth.onAuthStateChanged(async (user) => {
    setAuthMessage("");

    const isAccount = isNonAnonymousAccount(user);

    setAuthUiState({ isAccount });

    setRankedAllowed(isAccount);

    if (isAccount) {
      void syncAccountProfile(user);
      setLoginFlyoutOpen(false);
    }

    // If we return to Guest mode, restore the per-tab name from localStorage.
    if (!isAccount) {
      safeSessionStorageRemove(DISPLAY_NAME_SESSION_KEY);
      if (displayNameInput) displayNameInput.value = getOrCreateDisplayName();
      accountSummary = { displayName: "", elo: null };
      if (accountName) accountName.textContent = "Player";
      if (accountElo) accountElo.textContent = "----";
    }

    // Keep server-side socket identity in sync with Firebase Auth.
    // This prevents stale server identity when a user signs out.
    if (!user) {
      socket.emit("clearAuth");
      return;
    }

    try {
      const token = await user.getIdToken();
      socket.emit("authToken", { token });
    } catch {
      // ignore
    }
  });
} else {
  setAuthUiState({ isAccount: false });
  setRankedAllowed(false);
}

// ─── Host ────────────────────────────────────────────────────────────────────
btnHost.addEventListener("click", () => {
  startRoomOpBusy("Creating room…");

  const displayName = getDisplayNameForGame();
  safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, displayName);
  const user = getFirebaseUser();
  if (!isNonAnonymousAccount(user))
    safeLocalStorageSet(DISPLAY_NAME_STORAGE_KEY, displayName);
  socket.emit("hostRoom", { displayName });
  setStatus("Creating room…");
});

socket.on("roomCreated", ({ code }) => {
  clearRoomOpBusy();
  mainActions.classList.add("hidden");
  joinActions.classList.add("hidden");
  roomDisplay.classList.remove("hidden");
  roomCodeText.textContent = code;
  setStatus("");
  // Store for redirect
  sessionStorage.setItem("roomCode", code);
  sessionStorage.setItem("playerIndex", "0");
  sessionStorage.setItem("myPlayerIndex", "0");
});

// ─── Join ────────────────────────────────────────────────────────────────────
btnShowJoin.addEventListener("click", () => {
  mainActions.classList.add("hidden");
  joinActions.classList.remove("hidden");
  codeInput.focus();
});

btnCancelJoin.addEventListener("click", () => {
  clearRoomOpBusy();
  joinActions.classList.add("hidden");
  mainActions.classList.remove("hidden");
  setStatus("");
});

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

btnJoin.addEventListener("click", () => {
  const code = codeInput.value.trim().toUpperCase();
  if (code.length !== 4)
    return setStatus("Please enter a 4-character code.", true);

  startRoomOpBusy("Joining room…");

  const displayName = getDisplayNameForGame();
  safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, displayName);
  const user = getFirebaseUser();
  if (!isNonAnonymousAccount(user))
    safeLocalStorageSet(DISPLAY_NAME_STORAGE_KEY, displayName);
  // Store index=1 BEFORE emitting so gameStarted callback can read it
  sessionStorage.setItem("roomCode", code);
  sessionStorage.setItem("playerIndex", "1");
  socket.emit("joinRoom", { code, displayName });
  setStatus("Joining room…");
});

// ─── Game Start ───────────────────────────────────────────────────────────────
socket.on("gameStarted", ({ code, playerIndex }) => {
  clearRoomOpBusy();
  const idxFromPayload =
    typeof playerIndex === "number"
      ? String(playerIndex)
      : typeof playerIndex === "string" && playerIndex.trim()
        ? playerIndex.trim()
        : null;

  const myIdx = idxFromPayload || sessionStorage.getItem("playerIndex") || "0";
  sessionStorage.setItem("roomCode", code);
  sessionStorage.setItem("playerIndex", myIdx);
  window.location.href = `/game.html?room=${code}&player=${myIdx}`;
});

// ─── Errors ───────────────────────────────────────────────────────────────────
socket.on("joinError", (msg) => {
  clearRoomOpBusy();
  setStatus(msg, true);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.className = "status-msg" + (isError ? " error" : "");
}
