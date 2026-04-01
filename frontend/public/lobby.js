const socket = io();

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

async function syncAccountProfile(user) {
  if (!isNonAnonymousAccount(user)) return;
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

    if (accountName) accountName.textContent = name || "Player";
    if (accountElo)
      accountElo.textContent = elo !== null ? String(elo) : "----";
  } catch {
    // ignore
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

// ─── Leaderboard flyout (UI-only in Phase 2) ───────────────────────────────
const btnLeaderboardToggle = document.getElementById("btnLeaderboardToggle");
const leaderboardFlyout = document.getElementById("leaderboardFlyout");

function setLeaderboardOpen(isOpen) {
  if (!btnLeaderboardToggle || !leaderboardFlyout) return;
  btnLeaderboardToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  leaderboardFlyout.classList.toggle("hidden", !isOpen);
}

if (btnLeaderboardToggle) {
  btnLeaderboardToggle.addEventListener("click", () => {
    const isOpen =
      btnLeaderboardToggle.getAttribute("aria-expanded") === "true";
    setLeaderboardOpen(!isOpen);
  });
}

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
    setRankedSearching(true);
  });
}
if (btnRankedCancel) {
  btnRankedCancel.addEventListener("click", () => {
    setRankedSearching(false);
  });
}

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
      await window.firebaseAuth.signInWithPopup(provider);
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
      await window.firebaseAuth.signInWithEmailAndPassword(email, password);
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
      await window.firebaseAuth.createUserWithEmailAndPassword(email, password);
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
      await window.firebaseAuth.signOut();
      // Return to Guest mode immediately.
      await window.firebaseAuth.signInAnonymously();
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
  const displayName = getDisplayNameForGame();
  safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, displayName);
  const user = getFirebaseUser();
  if (!isNonAnonymousAccount(user))
    safeLocalStorageSet(DISPLAY_NAME_STORAGE_KEY, displayName);
  socket.emit("hostRoom", { displayName });
  setStatus("Creating room…");
});

socket.on("roomCreated", ({ code }) => {
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
socket.on("gameStarted", ({ code }) => {
  const myIdx = sessionStorage.getItem("playerIndex") || "0";
  window.location.href = `/game.html?room=${code}&player=${myIdx}`;
});

// ─── Errors ───────────────────────────────────────────────────────────────────
socket.on("joinError", (msg) => setStatus(msg, true));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.className = "status-msg" + (isError ? " error" : "");
}
