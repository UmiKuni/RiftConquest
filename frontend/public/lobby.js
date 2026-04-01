const socket = io();

// Attach Firebase identity (anonymous or logged-in) to this Socket.io connection.
// Safe: if Firebase isn't available, gameplay continues as before.
if (window.firebaseAuth) {
  window.firebaseAuth.onAuthStateChanged(async (user) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      socket.emit("authToken", { token });
    } catch (e) {
      // ignore
    }
  });
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
  if (btnRankedFind) btnRankedFind.disabled = isSearching;
  if (btnRankedCancel) btnRankedCancel.classList.toggle("hidden", !isSearching);
  if (rankedQueueStatus)
    rankedQueueStatus.classList.toggle("hidden", !isSearching);

  if (isSearching) startRankedTimer();
  else stopRankedTimer({ reset: true });
}

if (btnRankedFind) {
  btnRankedFind.addEventListener("click", () => {
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

// ─── Host ────────────────────────────────────────────────────────────────────
btnHost.addEventListener("click", () => {
  socket.emit("hostRoom");
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
  // Store index=1 BEFORE emitting so gameStarted callback can read it
  sessionStorage.setItem("roomCode", code);
  sessionStorage.setItem("playerIndex", "1");
  socket.emit("joinRoom", { code });
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
