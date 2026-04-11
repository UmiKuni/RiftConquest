const socket = io();
const REGIONS = ["Noxus", "Demacia", "Ionia"];

function getRegionOrder(s) {
  const order = s && Array.isArray(s.regionOrder) ? s.regionOrder : null;
  if (
    order &&
    order.length === REGIONS.length &&
    REGIONS.every((r) => order.includes(r))
  ) {
    return order;
  }
  return REGIONS;
}

const { busyPush, busyPop, identity, attachFirebaseAuthToSocket } =
  window.rcShared;
const { getOrCreateDisplayName } = identity;
const sfx = window.rcShared && window.rcShared.sfx ? window.rcShared.sfx : null;

let connectBusyToken = busyPush("Connecting…");

attachFirebaseAuthToSocket(socket);

// ─── State ─────────────────────────────────────────────────────────────────
let gameState = null;
let myIndex = null;
let selectedCard = null;
let deployFaceDown = false;
let lastRenderedRound = null;
let initialRankedElos = null;
const INGAME_BACKGROUND_TRACKS = [
  "backgroundIngame1",
  "backgroundIngame2",
  "backgroundIngame3",
];

function syncIngameBackgroundFromState(s) {
  if (!sfx || typeof sfx.playBackground !== "function") return;
  if (!s || !Number.isFinite(s.round) || s.round < 1) return;
  if (s.phase === "gameOver") return;

  const idx = (Math.floor(s.round) - 1) % INGAME_BACKGROUND_TRACKS.length;
  const trackName = INGAME_BACKGROUND_TRACKS[idx];
  sfx.playBackground(trackName);
}

// ─── Round Intro UI (Round title only) ─────────────────────────────────────
const ROUND_INTRO_TITLE_MS = 900;

const roundIntroUi = {
  round: null,
  token: 0,
  timers: [],
  doneSentRound: null,
};

function getRoundIntroEls() {
  const overlay = document.getElementById("roundIntroOverlay");
  const title = document.getElementById("roundIntroTitle");
  if (!overlay || !title) return null;
  return { overlay, title };
}

function clearRoundIntroTimers() {
  for (const t of roundIntroUi.timers) clearTimeout(t);
  roundIntroUi.timers = [];
}

function resetRoundIntroDom(els) {
  if (!els) return;
  els.title.classList.add("hidden");
  els.title.classList.remove("play");
}

function hideRoundIntroOverlay() {
  const els = getRoundIntroEls();
  if (!els) return;

  roundIntroUi.token++;
  clearRoundIntroTimers();
  resetRoundIntroDom(els);
  els.overlay.classList.add("hidden");
  els.overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("round-intro-active");
  roundIntroUi.round = null;
}

function syncRoundIntroOverlayFromState(s) {
  const els = getRoundIntroEls();
  if (!els) return;

  if (!s || s.phase !== "roundIntro") {
    if (!els.overlay.classList.contains("hidden")) hideRoundIntroOverlay();
    return;
  }

  // Always block interactions while the server says we're in the intro.
  document.body.classList.add("round-intro-active");
  els.overlay.classList.remove("hidden");
  els.overlay.setAttribute("aria-hidden", "false");

  const round = s.round;
  if (roundIntroUi.round === round) return;

  roundIntroUi.round = round;
  roundIntroUi.token++;
  clearRoundIntroTimers();
  resetRoundIntroDom(els);

  const token = roundIntroUi.token;

  els.title.textContent = `Round ${round}`;
  els.title.classList.remove("hidden");
  els.title.classList.remove("play");
  // Restart CSS animation.
  void els.title.offsetWidth;
  els.title.classList.add("play");

  const t1 = setTimeout(() => {
    if (token !== roundIntroUi.token) return;
    els.title.classList.add("hidden");
    els.title.classList.remove("play");

    if (roundIntroUi.doneSentRound !== round) {
      roundIntroUi.doneSentRound = round;
      socket.emit("roundIntroDone", { round });
    }
  }, ROUND_INTRO_TITLE_MS);

  roundIntroUi.timers.push(t1);
}

// ─── Turn Timer UI (60s circular indicator) ───────────────────────────────
// Server enforces a turn timer (default 60s). Client UI approximates the
// countdown and restarts when the same state transitions occur.
const TURN_TIMEOUT_MS = 60000;
const TURN_TIMER_TICK_MS = 100;

const turnTimerUi = {
  key: "",
  startedAtMs: 0,
  durationMs: TURN_TIMEOUT_MS,
  running: false,
  tick: null,
  circumference: null,
  countdownPlayed: false,
  actorIndex: null,
};

function stopCountdownSfx() {
  if (sfx && typeof sfx.stop === "function") {
    sfx.stop("countdown10");
  }
}

function actingPlayerIndexForTurnTimer(s) {
  if (!s) return null;
  if (s.pendingAbility) {
    if (s.pendingAbility.type === "N5_opp_flip") {
      return 1 - s.pendingAbility.playerIdx;
    }
    return s.pendingAbility.playerIdx;
  }
  return s.currentTurn;
}

// NOTE: This key format MUST be kept in sync with turnTimerKeyForState
// in server/socket/handlers.js — both files compute the same key independently
// (no shared module possible without a build step).
function turnTimerKeyForState(s) {
  if (!s) return "";
  const actor = actingPlayerIndexForTurnTimer(s);
  const pendingType = s.pendingAbility ? s.pendingAbility.type : "";
  const pendingPlayerIdx = s.pendingAbility ? s.pendingAbility.playerIdx : "";
  return `${s.phase}|r${s.round}|t${s.currentTurn}|a${actor}|p${pendingType}|pp${pendingPlayerIdx}`;
}

function ensureTurnTimerGeometry(progressEl) {
  if (!progressEl || turnTimerUi.circumference != null) return;
  const r =
    progressEl.r &&
    progressEl.r.baseVal &&
    Number.isFinite(progressEl.r.baseVal.value)
      ? progressEl.r.baseVal.value
      : 18;
  const c = 2 * Math.PI * r;
  turnTimerUi.circumference = c;
  // Non-zero CSS lengths must include units; use px for broad compatibility.
  progressEl.style.strokeDasharray = `${c}px ${c}px`;
  progressEl.style.strokeDashoffset = "0px";
}

function setTurnTimerFraction(fraction) {
  const progressEl = document.getElementById("turnTimerProgress");
  if (!progressEl) return;

  ensureTurnTimerGeometry(progressEl);

  const c = turnTimerUi.circumference;
  if (!c) return;

  const clamped = Math.max(0, Math.min(1, fraction));
  // Full ring at start, empties as time runs out.
  progressEl.style.strokeDashoffset = `${c * (1 - clamped)}px`;
}

function stopTurnTimerLoop() {
  if (turnTimerUi.tick) {
    clearInterval(turnTimerUi.tick);
    turnTimerUi.tick = null;
  }
}

function updateTurnTimerUiNow() {
  const hostEl = document.getElementById("turnTimer");
  if (!turnTimerUi.running || !hostEl) return;

  const elapsed = Date.now() - turnTimerUi.startedAtMs;
  const remainingMs = Math.max(0, turnTimerUi.durationMs - elapsed);
  const fraction = remainingMs / turnTimerUi.durationMs;

  setTurnTimerFraction(fraction);

  const remainingSec = Math.ceil(remainingMs / 1000);
  if (
    turnTimerUi.actorIndex === myIndex &&
    remainingMs > 0 &&
    remainingMs <= 10000 &&
    !turnTimerUi.countdownPlayed
  ) {
    turnTimerUi.countdownPlayed = true;
    if (sfx) sfx.play("countdown10", { interrupt: true });
  }

  hostEl.title = `${remainingSec}s`;
  hostEl.setAttribute("aria-label", `Turn timer: ${remainingSec}s remaining`);
}

function startTurnTimerLoop() {
  if (turnTimerUi.tick) return;
  turnTimerUi.tick = setInterval(() => {
    if (!turnTimerUi.running) {
      stopTurnTimerLoop();
      return;
    }
    updateTurnTimerUiNow();
  }, TURN_TIMER_TICK_MS);
}

function syncTurnTimerFromState(s) {
  if (!s || s.phase !== "playing") {
    turnTimerUi.running = false;
    turnTimerUi.countdownPlayed = false;
    turnTimerUi.actorIndex = null;
    stopCountdownSfx();
    stopTurnTimerLoop();
    setTurnTimerFraction(1);

    const hostEl = document.getElementById("turnTimer");
    if (hostEl) {
      hostEl.title = "";
      hostEl.setAttribute("aria-label", "Turn timer");
    }
    return;
  }

  const actor = actingPlayerIndexForTurnTimer(s);
  if (actor !== 0 && actor !== 1) {
    turnTimerUi.running = false;
    turnTimerUi.countdownPlayed = false;
    turnTimerUi.actorIndex = null;
    stopCountdownSfx();
    stopTurnTimerLoop();
    setTurnTimerFraction(1);

    const hostEl = document.getElementById("turnTimer");
    if (hostEl) {
      hostEl.title = "";
      hostEl.setAttribute("aria-label", "Turn timer");
    }
    return;
  }

  const prevActor = turnTimerUi.actorIndex;
  turnTimerUi.actorIndex = actor;
  if (prevActor === myIndex && actor !== myIndex) {
    turnTimerUi.countdownPlayed = false;
    stopCountdownSfx();
  }

  const key = turnTimerKeyForState(s);
  if (key !== turnTimerUi.key) {
    turnTimerUi.key = key;
    turnTimerUi.startedAtMs = Date.now();
    turnTimerUi.durationMs = TURN_TIMEOUT_MS;
    turnTimerUi.countdownPlayed = false;
    if (actor !== myIndex) {
      stopCountdownSfx();
    }
  }

  turnTimerUi.running = true;
  startTurnTimerLoop();
  updateTurnTimerUiNow();
}

function makeMdiIcon(iconClass, extraClass = "") {
  const el = document.createElement("span");
  el.className = `mdi ${iconClass} ui-icon${extraClass ? " " + extraClass : ""}`;
  el.setAttribute("aria-hidden", "true");
  return el;
}

function setElIconText(el, iconClass, text) {
  el.textContent = "";
  if (iconClass) {
    el.appendChild(makeMdiIcon(iconClass));
    el.appendChild(document.createTextNode(" "));
  }
  el.appendChild(document.createTextNode(text));
}

// ─── Emoji Reactions ──────────────────────────────────────────────────────
const EMOJI_REACTIONS = {
  haha: "😂",
  like: "👍",
  sad: "😢",
};
const EMOJI_COOLDOWN_MS = 1200;
let emojiCooldownUntil = 0;

function initEmojiBar() {
  const bar = document.getElementById("emojiBar");
  if (!bar) return;
  bar.querySelectorAll(".emoji-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-emoji");
      sendEmojiReaction(key);
    });
  });
}

function setEmojiBarDisabled(disabled) {
  const bar = document.getElementById("emojiBar");
  if (!bar) return;
  bar.querySelectorAll(".emoji-btn").forEach((btn) => {
    btn.disabled = disabled;
  });
}

function sendEmojiReaction(key) {
  if (!key || !EMOJI_REACTIONS[key]) return;

  const now = Date.now();
  if (now < emojiCooldownUntil) return;

  emojiCooldownUntil = now + EMOJI_COOLDOWN_MS;
  setEmojiBarDisabled(true);
  setTimeout(() => setEmojiBarDisabled(false), EMOJI_COOLDOWN_MS);

  socket.emit("emojiReaction", { emoji: key });
}

function showEmojiReaction(key) {
  const layer = document.getElementById("emojiFxLayer");
  if (!layer) return;
  const ch = EMOJI_REACTIONS[key];
  if (!ch) return;

  const el = document.createElement("div");
  el.className = "emoji-fx";
  el.textContent = ch;
  layer.appendChild(el);

  const remove = () => el.remove();
  el.addEventListener("animationend", remove, { once: true });
  setTimeout(remove, 1600);

  // Safety cap if many reactions are received at once.
  while (layer.childElementCount > 6) {
    layer.firstElementChild?.remove();
  }
}

// ─── Room & Player from URL ────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const roomCode = params.get("room") || sessionStorage.getItem("roomCode");
const playerIndex = parseInt(
  params.get("player") ?? sessionStorage.getItem("playerIndex") ?? "0",
  10,
);
if (!roomCode) location.href = "/";

// ─── Guide FAB ────────────────────────────────────────────────────────────
const guideOverlay = document.getElementById("guideOverlay");
document
  .getElementById("guideBtn")
  .addEventListener("click", () => guideOverlay.classList.remove("hidden"));
document
  .getElementById("guideClose")
  .addEventListener("click", () => guideOverlay.classList.add("hidden"));
guideOverlay.addEventListener("click", (e) => {
  if (e.target === guideOverlay) guideOverlay.classList.add("hidden");
});

initEmojiBar();

// ─── Socket Events ────────────────────────────────────────────────────────
socket.on("connect", () => {
  console.log("Connected:", socket.id);
  socket.emit("rejoinRoom", {
    code: roomCode,
    playerIndex,
    displayName: getOrCreateDisplayName(),
  });
});

socket.on("gameState", (state) => {
  gameState = state;
  myIndex = state.myIndex;

  if (connectBusyToken != null) {
    busyPop(connectBusyToken);
    connectBusyToken = null;
  }

  render();
});

socket.on("joinError", (msg) => {
  if (connectBusyToken != null) {
    busyPop(connectBusyToken);
    connectBusyToken = null;
  }
  showToast(msg || "Room error.", true);
  setTimeout(() => (location.href = "/"), 2500);
});

socket.on("actionError", (msg) => showToast(msg, true));

socket.on("emojiReaction", (payload) => {
  const key = payload && typeof payload.emoji === "string" ? payload.emoji : "";
  showEmojiReaction(key);
});

socket.on("opponentLeft", () => {
  showToast("Opponent disconnected.", true);
  setTimeout(() => (location.href = "/"), 3000);
});

// ─── Main Render ──────────────────────────────────────────────────────────
function render() {
  if (!gameState) return;
  const s = gameState;

  // In-match background rotates by round (1 -> 2 -> 3 -> loop).
  syncIngameBackgroundFromState(s);

  // Round intro overlay (blocks input while phase === 'roundIntro').
  syncRoundIntroOverlayFromState(s);

  // Reset per-round UI-only state (prevents stale selection across rounds).
  if (typeof s.round === "number" && s.round !== lastRenderedRound) {
    lastRenderedRound = s.round;
    selectedCard = null;
    deployFaceDown = false;
    const btnFaceDown = document.getElementById("btnFaceDown");
    if (btnFaceDown) btnFaceDown.classList.add("hidden");
    setFaceDownButtonState(false);
  }

  // Player display names (server-sanitized; render via textContent)
  const names = Array.isArray(s.playerDisplayNames) ? s.playerDisplayNames : [];
  const isRanked = s.mode === "ranked";
  const elos = isRanked && Array.isArray(s.playerElos) ? s.playerElos : [];

  if (
    isRanked &&
    !initialRankedElos &&
    typeof elos[0] === "number" &&
    Number.isFinite(elos[0]) &&
    typeof elos[1] === "number" &&
    Number.isFinite(elos[1])
  ) {
    initialRankedElos = [Math.round(elos[0]), Math.round(elos[1])];
  }

  const myElo =
    typeof elos[myIndex] === "number" && Number.isFinite(elos[myIndex])
      ? Math.round(elos[myIndex])
      : null;
  const oppElo =
    typeof elos[1 - myIndex] === "number" && Number.isFinite(elos[1 - myIndex])
      ? Math.round(elos[1 - myIndex])
      : null;
  const myName =
    typeof names[myIndex] === "string" && names[myIndex].trim()
      ? names[myIndex]
      : "You";
  const oppName =
    typeof names[1 - myIndex] === "string" && names[1 - myIndex].trim()
      ? names[1 - myIndex]
      : "Opponent";
  const myLabelEl = document.querySelector("#myScoreBlock .player-label");
  const oppLabelEl = document.querySelector("#oppScoreBlock .player-label");

  function renderPlayerLabel(labelEl, name, elo) {
    if (!labelEl) return;

    if (!isRanked || elo === null) {
      labelEl.textContent = name;
      return;
    }

    labelEl.textContent = "";
    labelEl.appendChild(document.createTextNode(name));
    labelEl.appendChild(document.createTextNode(" · "));

    const trophyEl = document.createElement("span");
    trophyEl.className = "mdi mdi-trophy ui-icon";
    trophyEl.setAttribute("aria-hidden", "true");
    trophyEl.setAttribute("title", "Rift Points (RP)");

    labelEl.appendChild(trophyEl);
    labelEl.appendChild(document.createTextNode(` ${elo}`));
  }

  renderPlayerLabel(myLabelEl, myName, myElo);
  renderPlayerLabel(oppLabelEl, oppName, oppElo);

  // Scores & Round
  document.getElementById("myVP").textContent = s.scores[myIndex];
  document.getElementById("oppVP").textContent = s.scores[1 - myIndex];
  document.getElementById("roundNum").textContent = s.round;

  // Initiative & Score block glowing
  const isMyInitiative = s.initiative === myIndex;
  document.getElementById("myInitiativeBadge").textContent = isMyInitiative
    ? "1st"
    : "2nd";
  document.getElementById("oppInitiativeBadge").textContent = isMyInitiative
    ? "2nd"
    : "1st";
  document
    .getElementById("myScoreBlock")
    .classList.toggle(
      "active-turn",
      s.currentTurn === myIndex && s.phase !== "roundEnd",
    );
  document
    .getElementById("oppScoreBlock")
    .classList.toggle(
      "active-turn",
      s.currentTurn !== myIndex && s.phase !== "roundEnd",
    );
  document.getElementById("oppHandCountBadge").textContent =
    s.opponentHandCount;

  const hintEl = document.getElementById("retreatVPHint");
  if (hintEl) {
    const retreatVPMap = { 0: 6, 1: 5, 2: 4, 3: 3, 4: 2, 5: 2, 6: 2 };
    const vpOppScores = retreatVPMap[Math.min(s.opponentHandCount, 6)] || 2;
    hintEl.textContent = `(Opponent scores +${vpOppScores} VP)`;
  }

  // Turn timer ring (60s) in the header.
  syncTurnTimerFromState(s);

  // Status bar
  const sb = document.getElementById("statusBar");
  if (s.phase === "gameOver") {
    sb.textContent = "";
    showWinScreen(s.winner === myIndex);
    return;
  }
  if (s.phase === "roundEnd") {
    const isMyWin = s.roundSummary && s.roundSummary.winner === myIndex;
    const color = isMyWin ? "#e0d8c0" : "#ff3838";
    const text = isMyWin ? "You won the round! " : "Opponent won the round! ";

    sb.className = "status-bar";

    sb.innerHTML = `<span style="color:${color}; font-weight:bold">${text}</span><span style="color:#f1c40f">(${s.roundSummary.reason})</span> <strong style="color:${color}">+${s.roundSummary.points} VP</strong>`;

    document.getElementById("btnFaceDown").classList.add("hidden");
    document.getElementById("btnWithdraw").classList.add("hidden");
    const hEl = document.getElementById("retreatVPHint");
    if (hEl) hEl.classList.add("hidden");

    const btnContinue = document.getElementById("btnRsContinue");
    const btnSurrender = document.getElementById("btnRsSurrender");

    // Always show round-end actions; when we've already confirmed, switch to a
    // disabled waiting state instead of hiding the buttons.
    btnContinue.classList.remove("hidden");
    btnSurrender.classList.remove("hidden");

    const iAmReady = !!s.readyForNextRound[myIndex];
    btnContinue.disabled = iAmReady;
    btnSurrender.disabled = iAmReady;

    const continueIcon = btnContinue.querySelector("span.mdi");
    const continueLabel = btnContinue.querySelector("span:last-child");
    if (continueLabel) {
      continueLabel.textContent = iAmReady
        ? "Waiting for opponent…"
        : "Continue Next Round";
    }
    if (continueIcon) {
      continueIcon.classList.toggle("mdi-skip-next", !iAmReady);
      continueIcon.classList.toggle("mdi-timer-sand", iAmReady);
    }
  } else {
    const btnContinue = document.getElementById("btnRsContinue");
    const btnSurrender = document.getElementById("btnRsSurrender");
    btnContinue.classList.add("hidden");
    btnSurrender.classList.add("hidden");
    btnContinue.disabled = false;
    btnSurrender.disabled = false;

    const continueIcon = btnContinue.querySelector("span.mdi");
    const continueLabel = btnContinue.querySelector("span:last-child");
    if (continueLabel) continueLabel.textContent = "Continue Next Round";
    if (continueIcon) {
      continueIcon.classList.add("mdi-skip-next");
      continueIcon.classList.remove("mdi-timer-sand");
    }

    document.getElementById("btnWithdraw").classList.remove("hidden");
    const hEl = document.getElementById("retreatVPHint");
    if (hEl) hEl.classList.remove("hidden");
  }

  if (s.phase !== "roundEnd") {
    if (s.phase === "roundIntro") {
      sb.className = "status-bar pending";
      setElIconText(sb, "mdi-cards", `Round ${s.round} - get ready...`);
    } else if (s.pendingAbility) {
      const ab = s.pendingAbility;
      const responderIdx =
        ab.type === "N5_opp_flip" ? 1 - ab.playerIdx : ab.playerIdx;
      const iShouldRespond = responderIdx === myIndex;

      // Label to display in the status bar (avoid showing "undefined")
      let displayLabel = ab.label;
      if (ab.type === "N5_opp_flip" && iShouldRespond) {
        displayLabel = "LeBlanc: You must flip one of your cards.";
      }
      if (!displayLabel) {
        displayLabel = iShouldRespond
          ? abilityTitle(ab.type)
          : "Opponent resolving ability…";
      }

      sb.className = "status-bar pending";
      setElIconText(
        sb,
        iShouldRespond ? "mdi-lightning-bolt" : "mdi-timer-sand",
        displayLabel,
      );

      if (iShouldRespond) {
        openAbilityModal(ab, displayLabel);
      }
    } else if (s.currentTurn === myIndex) {
      sb.className = "status-bar your-turn";
      setElIconText(
        sb,
        "mdi-sword-cross",
        "Your turn — select a champion, then click a region.",
      );
    } else {
      sb.className = "status-bar opp-turn";
      setElIconText(sb, "mdi-timer-sand", "Waiting for opponent…");
    }
  }

  renderBoard(s);
  renderHand(s.myHand);
  renderLog(s.log);

  const canAct =
    s.currentTurn === myIndex && s.phase === "playing" && !s.pendingAbility;
  document.getElementById("btnWithdraw").disabled = !canAct;
  document
    .getElementById("btnFaceDown")
    .classList.toggle("hidden", !selectedCard || !canAct);
}

// ─── Board ────────────────────────────────────────────────────────────────
function renderBoard(s) {
  const board = document.getElementById("board");
  board.innerHTML = "";

  for (const region of getRegionOrder(s)) {
    const col = document.createElement("div");
    col.className = "region-col";
    col.setAttribute("data-region", region);

    const myStr = calcStrengthClient(s, region, myIndex);
    const oppStr = calcStrengthClient(s, region, 1 - myIndex);
    const myCards = s.regions[region][myIndex] || [];
    const oppCards = s.regions[region][1 - myIndex] || [];

    let crown = "";
    if (
      s.phase === "roundEnd" &&
      (!s.roundSummary || !s.roundSummary.reason.includes("Retreated"))
    ) {
      let rWinner = null;
      if (myStr > oppStr) rWinner = myIndex;
      else if (oppStr > myStr) rWinner = 1 - myIndex;
      else rWinner = s.initiative;

      if (rWinner === myIndex) {
        crown = '<span class="region-result-badge win">WON</span>';
      } else {
        crown = '<span class="region-result-badge lose">LOST</span>';
      }
    } else {
      if (myStr > oppStr)
        crown =
          '<span class="control-crown mdi mdi-crown ui-icon" title="You control this region" aria-hidden="true"></span>';
      if (oppStr > myStr)
        crown =
          '<span class="control-crown mdi mdi-crown ui-icon" style="filter:grayscale(1)" title="Opponent controls this region" aria-hidden="true"></span>';
    }

    col.innerHTML = `
      <div class="region-body">
        <div class="side-section opp-side" data-region="${region}" data-player="${1 - myIndex}">
          <div class="side-label">Opponent</div>
        </div>

        <div class="region-header region-status-bar">
          <div class="region-title-wrap">
            <img src="/image/Icon_${region}.webp" class="region-icon" alt="" onerror="this.style.display='none'">
            <span class="region-name">${region}</span>
          </div>
          ${crown.includes("region-result-badge") ? crown : ""}
          <div class="region-strength-bar">
            <span class="str-value str-my">${myStr}</span>
            <span class="str-sep">:</span>
            <span class="str-value str-opp">${oppStr}</span>
            ${!crown.includes("region-result-badge") ? crown : ""}
          </div>
        </div>

        <div class="side-section my-side" data-region="${region}" data-player="${myIndex}">
          <div class="side-label">You</div>
        </div>
      </div>
    `;
    board.appendChild(col);

    // Populate cards — wrap in stack container
    const oppSection = col.querySelector(".opp-side");
    const oppStack = buildCardStack(oppCards, 1 - myIndex, region, s, true);
    oppSection.appendChild(oppStack);

    const mySection = col.querySelector(".my-side");
    const myStack = buildCardStack(myCards, myIndex, region, s, false);
    mySection.appendChild(myStack);

    // Click = face-up deploy, right-click = face-down deploy
    col.addEventListener("click", () => {
      if (!selectedCard || !canActNow(s)) return;
      deployCard(selectedCard.id, region, deployFaceDown);
    });
    col.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!selectedCard || !canActNow(s)) return;
      deployCard(selectedCard.id, region, true);
    });

    if (selectedCard) col.classList.add("droppable-target");
  }

  document
    .getElementById("deployInstructions")
    .classList.toggle("hidden", !selectedCard);
}

function canActNow(s) {
  return (
    s && s.currentTurn === myIndex && s.phase === "playing" && !s.pendingAbility
  );
}

// ─── Build stacked card pile for one player in one region ─────────────────
function buildCardStack(cards, playerIdx, region, s, isOpponent = false) {
  const stack = document.createElement("div");
  stack.className = "card-stack" + (isOpponent ? " stack-up" : "");
  // cards[0] = oldest (bottom of pile), cards[last] = newest (uncovered/on top)
  cards.forEach((c, idx) => {
    const isUncovered = idx === cards.length - 1;
    const el = buildBoardCard(c, playerIdx, region, s, isUncovered);
    el.style.setProperty("--stack-idx", idx);
    el.style.zIndex = idx + 1;
    stack.appendChild(el);
  });
  return stack;
}

// ─── Build a single board card element ────────────────────────────────────
function buildBoardCard(c, playerIdx, region, s, isUncovered) {
  const card = document.createElement("div");
  card.setAttribute("data-card-id", c.id);

  if (c.faceUp) {
    const def = getCardDef(c.id);
    card.className =
      "board-card face-up-hoverable" +
      (playerIdx !== myIndex ? " opponent-card" : "");
    card.innerHTML = `
      <div class="card-face-top">
        <div class="card-name-row">
          <span class="card-name">${def.champion}</span>
          ${
            def.type === "Instant"
              ? '<span class="card-type-icon mdi mdi-lightning-bolt ui-icon" title="Instant" aria-hidden="true"></span>'
              : def.type === "Ongoing"
                ? '<span class="card-type-icon mdi mdi-timer-sand ui-icon" title="Ongoing" aria-hidden="true"></span>'
                : ""
          }
        </div>
        <span class="card-str"><span class="mdi mdi-sword-cross ui-icon" aria-hidden="true"></span> ${def.strength}</span>
      </div>
      <img src="${getCardImagePath(c.id)}" alt="${def.champion}"
           onerror="this.style.display='none'" />
      <img src="/image/Icon_${def.region}.webp" class="card-region-corner" alt="${def.region}" onerror="this.style.display='none'">
    `;

    // Hover → show card info in sidebar
    card.addEventListener("mouseenter", () => {
      if (sfx) sfx.play("cardHover");
      showCardInfo(def);
    });
    card.addEventListener("mouseleave", hideCardInfo);
  } else {
    card.className = "board-card facedown";
    card.innerHTML =
      '<span class="mdi mdi-sword-cross ui-icon facedown-icon" aria-hidden="true"></span>';
  }

  // Flip target highlight
  if (
    s.pendingAbility &&
    isFlipTarget(s.pendingAbility, region, playerIdx, myIndex, isUncovered, s)
  ) {
    card.classList.add("flip-target");
    card.style.cursor = "crosshair";
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      socket.emit("abilityResponse", {
        targetCardId: c.id,
        targetRegion: region,
        targetPlayer: playerIdx,
      });
    });
  }

  return card;
}

function isFlipTarget(ab, region, cardPlayer, myIdx, isUncovered, s) {
  if (!ab) return false;

  // All flip abilities only target uncovered cards
  if (!isUncovered) return false;

  if (ab.type === "flip_any" && ab.playerIdx === myIdx) return true;
  if (ab.type === "flip_adjacent" && ab.playerIdx === myIdx) {
    return adjacentTo(ab.playedRegion, region, s);
  }
  if (ab.type === "N5_opp_flip" && ab.playerIdx !== myIdx)
    return cardPlayer === myIdx;
  if (ab.type === "N5_self_flip" && ab.playerIdx === myIdx)
    return cardPlayer === myIdx;
  return false;
}

// ─── Strength calculation (client-side for display) ────────────────────────
function calcStrengthClient(s, region, playerIdx) {
  const cards = s.regions[region][playerIdx] || [];
  let total = 0;

  const order = getRegionOrder(s);

  const zedActive = order.some((r) =>
    (s.regions[r][playerIdx] || []).some((c) => c.faceUp && c.id === "I2"),
  );
  const luxRegion = findCardRegion(s, "D1", playerIdx);

  // N4 Swain (Ongoing): cards covered by a face-up Swain in this pile become STR 4.
  let swainIdx = -1;
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i];
    if (c && c.faceUp && c.id === "N4") {
      swainIdx = i;
      break;
    }
  }

  for (let idx = 0; idx < cards.length; idx++) {
    const c = cards[idx];
    const def = getCardDef(c.id);
    let str = c.faceUp ? def.strength : 2;
    if (!c.faceUp && zedActive) str = 4;
    if (swainIdx !== -1 && idx < swainIdx) str = 4;
    total += str;
  }
  if (luxRegion && adjacentTo(luxRegion, region, s)) total += 3;
  return total;
}

function findCardRegion(s, cardId, playerIdx) {
  for (const r of getRegionOrder(s)) {
    if (
      (s.regions[r][playerIdx] || []).some((c) => c.id === cardId && c.faceUp)
    )
      return r;
  }
  return null;
}
function adjacentTo(r1, r2, s = gameState) {
  const order = getRegionOrder(s);
  const i1 = order.indexOf(r1);
  const i2 = order.indexOf(r2);
  if (i1 < 0 || i2 < 0) return false;
  return Math.abs(i1 - i2) === 1;
}

// ─── Hand ─────────────────────────────────────────────────────────────────
function renderHand(hand) {
  const container = document.getElementById("handCards");
  container.innerHTML = "";
  const canAct = canActNow(gameState);

  for (const card of hand || []) {
    const el = document.createElement("div");
    el.className =
      `hand-card region-${card.region}` +
      (selectedCard?.id === card.id ? " selected" : "");
    el.setAttribute("data-id", card.id);

    el.innerHTML = `
      <img src="${getCardImagePath(card.id)}" alt="${card.champion}"
           onerror="this.onerror=null;this.style.minHeight='52px';this.style.display='block';this.style.background='#1a2035'" />
      <div class="card-info">
        <span class="c-str">${card.strength}</span>
        <div class="c-name">${card.champion}</div>
        <div class="c-region">
          <img src="/image/Icon_${card.region}.webp" class="c-region-icon" alt="${card.region}" onerror="this.style.display='none'">
          <span>${card.region}</span>
        </div>
      </div>
    `;

    if (canAct) {
      el.addEventListener("click", () => selectCard(card));
    }
    // Hover on hand card → show card info in sidebar
    el.addEventListener("mouseenter", () => {
      if (sfx) sfx.play("cardHover");
      showCardInfo(card);
    });
    el.addEventListener("mouseleave", hideCardInfo);

    container.appendChild(el);
  }
}

function selectCard(card) {
  if (selectedCard?.id === card.id) {
    selectedCard = null;
    deployFaceDown = false;
    document.getElementById("btnFaceDown").classList.add("hidden");
    setFaceDownButtonState(false);
  } else {
    selectedCard = { id: card.id, cardDef: card };
    deployFaceDown = false;
    document.getElementById("btnFaceDown").classList.remove("hidden");
    setFaceDownButtonState(false);
  }
  renderHand(gameState.myHand);
  renderBoard(gameState);
}

// ─── Deploy ────────────────────────────────────────────────────────────────
function deployCard(cardId, region, faceDown) {
  socket.emit("playCard", { cardId, regionName: region, faceDown });
  selectedCard = null;
  deployFaceDown = false;
  document.getElementById("btnFaceDown").classList.add("hidden");
  setFaceDownButtonState(false);
  renderHand(gameState?.myHand);
  renderBoard(gameState);
}

document.getElementById("btnFaceDown").addEventListener("click", () => {
  if (!selectedCard) return;
  deployFaceDown = !deployFaceDown;
  setFaceDownButtonState(deployFaceDown);
});

function setFaceDownButtonState(isActive) {
  const btn = document.getElementById("btnFaceDown");
  if (!btn) return;
  const spans = btn.querySelectorAll("span");
  if (spans.length < 2) return;
  const icon = spans[0];
  const label = spans[1];

  label.textContent = isActive ? "Hidden ON — Click Region" : "Hidden Deploy";
  icon.classList.toggle("mdi-eye-off", !isActive);
  icon.classList.toggle("mdi-eye-check", isActive);
}

document.getElementById("btnWithdraw").addEventListener("click", () => {
  if (
    !confirm(
      "Retreat from this round? Your opponent will score Victory Points.",
    )
  )
    return;
  socket.emit("withdraw");
});

// ─── Card Info Sidebar ─────────────────────────────────────────────────────
const CHAMPION_LORE = {
  Katarina:
    "A Noxian assassin who moves without mercy, striking between heartbeats.",
  Talon: "The Blade's Shadow — silence before the kill.",
  Darius: "The Hand of Noxus. He who hesitates is dead.",
  Swain: "Grand General of Noxus, master of ravens and dark power.",
  LeBlanc: "The Deceiver — every truth is a veil over a deeper lie.",
  Draven: "The Glorious Executioner. He turns every battle into a spectacle.",
  Lux: "The Lady of Luminosity, wielding light with precision and grace.",
  Quinn: "Demacian ranger, soaring with her eagle Valor beyond enemy lines.",
  Garen: "The Might of Demacia, spinning steel and unshakeable conviction.",
  "Jarvan IV":
    "Crown Prince of Demacia, fighting in the vanguard of every battle.",
  Fiora: "The Grand Duelist, for whom every fight is an elegant art form.",
  Galio: "The Colossus, a stone sentinel forged to stand against magic.",
  Ahri: "The Nine-Tailed Fox, dancing between worlds with a song of stolen spirits.",
  Zed: "Master of Shadows — he and his shadow are never separated.",
  Shen: "The Eye of Twilight, balancing the scales between body, mind, and spirit.",
  Yasuo: "The Unforgiven, an exile whose blade brings both freedom and ruin.",
  Irelia: "The Blade Dancer of Ionia, a storm of floating steel.",
  "Master Yi": "The Wuju Bladesman — one hundred enemies, one perfect strike.",
};

let cardHideTimer = null;

function showCardInfo(def) {
  clearTimeout(cardHideTimer);
  document.getElementById("cardInfoIdle").classList.add("hidden");
  document.getElementById("cardInfoDetail").classList.remove("hidden");

  document.getElementById("cidImage").src = getCardImagePath(def.id);
  document.getElementById("cidImage").alt = def.champion;
  setElIconText(
    document.getElementById("cidStrength"),
    "mdi-sword-cross",
    String(def.strength),
  );
  document.getElementById("cidName").textContent = def.champion;

  const regionIcon = document.getElementById("cidRegionIcon");
  if (regionIcon) {
    if (def.region) {
      regionIcon.src = `/image/Icon_${def.region}.webp`;
      regionIcon.alt = def.region;
      regionIcon.style.display = "";
    } else {
      regionIcon.style.display = "none";
    }
  }

  const regionBadge = document.getElementById("cidRegionBadge");
  regionBadge.textContent = def.region;
  regionBadge.className = `cid-region-badge region-badge-${def.region}`;

  const typeBadge = document.getElementById("cidTypeBadge");
  typeBadge.textContent = def.type;
  typeBadge.className = `cid-type-badge type-${def.type}`;

  const abilityBox = document.getElementById("cidAbilityBox");
  if (def.ability) {
    abilityBox.style.display = "";
    document.getElementById("cidAbility").textContent = def.ability;
  } else {
    abilityBox.style.display = "none";
  }
  document.getElementById("cidLore").textContent =
    CHAMPION_LORE[def.champion] || "";
}

function hideCardInfo() {
  cardHideTimer = setTimeout(() => {
    document.getElementById("cardInfoIdle").classList.remove("hidden");
    document.getElementById("cardInfoDetail").classList.add("hidden");
  }, 350);
}

// ─── Log ───────────────────────────────────────────────────────────────────
let lastLogLength = 0;

function renderLog(log) {
  const container = document.getElementById("logScroll");
  if (!log || log.length === lastLogLength) return;

  const newEntries = log.slice(lastLogLength);
  lastLogLength = log.length;

  for (const entry of newEntries) {
    const div = document.createElement("div");
    div.className = "log-entry new";
    div.textContent = entry;
    container.appendChild(div);
    setTimeout(() => div.classList.remove("new"), 1500);
  }
  container.scrollTop = container.scrollHeight;
}

function getAbilityRegionScore(state, region) {
  return {
    my: calcStrengthClient(state, region, myIndex),
    opp: calcStrengthClient(state, region, 1 - myIndex),
  };
}

function buildAbilityMovePreview(
  state,
  fromRegion,
  fromIndex,
  toRegion,
  cardId,
) {
  const preview = JSON.parse(JSON.stringify(state));
  const fromArr = preview.regions[fromRegion]?.[myIndex];
  const toArr = preview.regions[toRegion]?.[myIndex];
  if (!Array.isArray(fromArr) || !Array.isArray(toArr)) return preview;

  let idx = -1;
  if (
    Number.isInteger(fromIndex) &&
    fromIndex >= 0 &&
    fromIndex < fromArr.length
  ) {
    idx = fromIndex;
  } else {
    idx = fromArr.findIndex((c) => c.id === cardId);
  }
  if (idx === -1) return preview;

  const [moved] = fromArr.splice(idx, 1);
  toArr.push(moved);
  return preview;
}

function makeAbilityRegionCardPicker(state, cfg = {}) {
  const root = document.createElement("div");
  root.className = "ability-region-picker-grid";

  const filterFn =
    typeof cfg.filterFn === "function" ? cfg.filterFn : () => true;
  const onPick = typeof cfg.onPick === "function" ? cfg.onPick : null;
  const emptyText = cfg.emptyText || "No valid cards";
  const selected = cfg.selected || null;

  for (const region of getRegionOrder(state)) {
    const tile = document.createElement("div");
    tile.className =
      "ability-region-column" +
      (selected && selected.region === region ? " focus" : "");

    const header = document.createElement("div");
    header.className = "ability-region-header";

    const title = document.createElement("div");
    title.className = "ability-region-title";
    title.textContent = region;

    const score = getAbilityRegionScore(state, region);
    const points = document.createElement("div");
    points.className = "ability-region-points";
    points.textContent = `You ${score.my} : Opp ${score.opp}`;

    header.appendChild(title);
    header.appendChild(points);

    const list = document.createElement("div");
    list.className = "ability-region-card-list";

    const myCards = state.regions[region][myIndex] || [];
    let shown = 0;

    for (let idx = myCards.length - 1; idx >= 0; idx--) {
      const c = myCards[idx];
      if (!filterFn(c, idx, myCards, region)) continue;

      shown++;
      const def = getCardDef(c.id);
      const coverCount = myCards.length - 1 - idx;
      const coverLabel = coverCount === 0 ? "top" : `covered x${coverCount}`;

      const row = document.createElement("button");
      row.type = "button";
      row.className = "ability-region-card-row";

      const name = document.createElement("span");
      name.className = "ability-row-name";
      name.textContent = def.champion;

      const meta = document.createElement("span");
      meta.className = "ability-row-meta";
      meta.textContent = c.faceUp
        ? `face-up STR ${def.strength} · ${coverLabel}`
        : `facedown · ${coverLabel}`;

      row.appendChild(name);
      row.appendChild(meta);

      if (onPick) {
        row.addEventListener("click", () => {
          onPick({
            card: c,
            cardDef: def,
            region,
            index: idx,
          });
        });
      }

      list.appendChild(row);
    }

    if (shown === 0) {
      const empty = document.createElement("div");
      empty.className = "ability-region-card-empty";
      empty.textContent = emptyText;
      list.appendChild(empty);
    }

    tile.appendChild(header);
    tile.appendChild(list);
    root.appendChild(tile);
  }

  return root;
}

function makeAbilityMoveDestinationPicker(state, cfg = {}) {
  const root = document.createElement("div");
  root.className = "ability-region-picker-grid";

  const fromRegion = cfg.fromRegion;
  const fromIndex = cfg.fromIndex;
  const cardId = cfg.cardId;
  const onPick = typeof cfg.onPick === "function" ? cfg.onPick : null;

  for (const region of getRegionOrder(state)) {
    const tile = document.createElement("div");
    tile.className =
      "ability-region-column" + (region === fromRegion ? " focus" : "");

    const header = document.createElement("div");
    header.className = "ability-region-header";

    const title = document.createElement("div");
    title.className = "ability-region-title";
    title.textContent = region;

    const before = getAbilityRegionScore(state, region);
    const points = document.createElement("div");
    points.className = "ability-region-points";
    points.textContent = `Now ${before.my} : Opp ${before.opp}`;

    header.appendChild(title);
    header.appendChild(points);

    const list = document.createElement("div");
    list.className = "ability-region-card-list";

    if (region === fromRegion) {
      const note = document.createElement("div");
      note.className = "ability-region-card-empty";
      note.textContent = "Current region";
      list.appendChild(note);
    } else {
      const preview = buildAbilityMovePreview(
        state,
        fromRegion,
        fromIndex,
        region,
        cardId,
      );
      const after = getAbilityRegionScore(preview, region);
      const delta = after.my - before.my;
      const deltaLabel = delta >= 0 ? `+${delta}` : String(delta);

      const row = document.createElement("button");
      row.type = "button";
      row.className = "ability-region-card-row destination";

      const name = document.createElement("span");
      name.className = "ability-row-name";
      name.textContent = "Move here";

      const meta = document.createElement("span");
      meta.className = "ability-row-meta";
      meta.textContent = `After ${after.my} : Opp ${after.opp} (You ${deltaLabel})`;

      row.appendChild(name);
      row.appendChild(meta);

      if (onPick) {
        row.addEventListener("click", () => onPick(region));
      }

      list.appendChild(row);
    }

    tile.appendChild(header);
    tile.appendChild(list);
    root.appendChild(tile);
  }

  return root;
}

// ─── Ability Modal ─────────────────────────────────────────────────────────
function openAbilityModal(ability, customLabel) {
  const modal = document.getElementById("abilityModal");
  const title = document.getElementById("modalTitle");
  const desc = document.getElementById("modalDesc");
  const opts = document.getElementById("modalOptions");
  const footer = document.getElementById("modalFooter");

  title.textContent = abilityTitle(ability.type);
  if (ability.type === "N5_opp_flip" && customLabel)
    title.textContent = "LeBlanc — Flip Required";

  const baseLabel = customLabel || ability.label || "";
  desc.textContent = baseLabel;
  opts.innerHTML = "";
  footer.innerHTML = "";

  switch (ability.type) {
    case "N1_peek": {
      const top = ability.topCard;
      if (!top) {
        desc.textContent = "Katarina: No card to display.";
        footer.appendChild(
          mkBtn("Skip", "btn btn-secondary btn-sm", () => {
            socket.emit("abilityResponse", { deploy: false });
            closeModal();
          }),
        );
        break;
      }
      desc.textContent = `Top card: ${top.champion} (${top.region}, STR ${top.strength}). Deploy facedown to an adjacent region?`;
      const base = ability.playedRegion || "Noxus";
      for (const r of adjacentRegions(base)) {
        const btn = mkModalOption(
          r,
          `<span class="mdi mdi-map-marker ui-icon" aria-hidden="true"></span>&nbsp;${r}`,
          "Deploy facedown here",
        );
        btn.addEventListener("click", () => {
          socket.emit("abilityResponse", { deploy: true, regionName: r });
          closeModal();
        });
        opts.appendChild(btn);
      }
      footer.appendChild(
        mkBtn("Skip", "btn btn-secondary btn-sm", () => {
          socket.emit("abilityResponse", { deploy: false });
          closeModal();
        }),
      );
      break;
    }
    case "flip_any":
    case "flip_adjacent":
    case "N5_opp_flip":
    case "N5_self_flip": {
      desc.textContent =
        baseLabel + " Click the highlighted card on the board.";
      footer.appendChild(
        mkBtn("Cancel", "btn btn-secondary btn-sm", closeModal),
      );
      break;
    }
    case "I1_move": {
      desc.textContent =
        "Choose one of your cards to move to a different region.";
      let step = "pick";
      let pickedCard = null;
      let pickedFrom = null;
      let pickedFromIndex = null;

      opts.appendChild(
        makeAbilityRegionCardPicker(gameState, {
          emptyText: "No cards",
          onPick: ({ card, cardDef, region, index }) => {
            if (step !== "pick") return;
            pickedCard = card.id;
            pickedFrom = region;
            pickedFromIndex = index;
            step = "dest";

            opts.innerHTML = "";
            desc.textContent = `Move ${cardDef.champion} to which region?`;
            opts.appendChild(
              makeAbilityMoveDestinationPicker(gameState, {
                fromRegion: pickedFrom,
                fromIndex: pickedFromIndex,
                cardId: pickedCard,
                onPick: (toRegion) => {
                  socket.emit("abilityResponse", {
                    cardId: pickedCard,
                    fromRegion: pickedFrom,
                    toRegion,
                  });
                  closeModal();
                },
              }),
            );
          },
        }),
      );

      footer.appendChild(
        mkBtn("Skip", "btn btn-secondary btn-sm", () => {
          socket.emit("abilityResponse", { skip: true });
          closeModal();
        }),
      );
      break;
    }
    case "I4_return": {
      desc.textContent =
        "Choose a facedown card (covered or uncovered) to return and gain an extra turn.";

      const hasAny = getRegionOrder(gameState).some((r) =>
        (gameState.regions[r][myIndex] || []).some((c) => !c.faceUp),
      );
      if (!hasAny) desc.textContent = "No facedown cards to return.";

      opts.appendChild(
        makeAbilityRegionCardPicker(gameState, {
          filterFn: (c) => !c.faceUp,
          emptyText: "No facedown cards",
          onPick: ({ card, region, index }) => {
            socket.emit("abilityResponse", {
              cardId: card.id,
              fromRegion: region,
              fromIndex: index,
            });
            closeModal();
          },
        }),
      );

      footer.appendChild(
        mkBtn("Skip", "btn btn-secondary btn-sm", () => {
          socket.emit("abilityResponse", { skip: true });
          closeModal();
        }),
      );
      break;
    }
  }

  modal.classList.remove("hidden");
}

function closeModal() {
  document.getElementById("abilityModal").classList.add("hidden");
}

function abilityTitle(type) {
  return (
    {
      N1_peek: "Katarina — Peek",
      flip_any: "Talon — Flip Card",
      flip_adjacent: "Flip Adjacent Card",
      N5_opp_flip: "LeBlanc — Opponent Flips",
      N5_self_flip: "LeBlanc — You Flip",
      I1_move: "Ahri — Move Card",
      I4_return: "Yasuo — Return Card",
    }[type] || "Champion Ability"
  );
}

function mkModalOption(id, name, info) {
  const el = document.createElement("div");
  el.className = "modal-option";
  el.innerHTML = `<div><div class="opt-name">${name}</div><div class="opt-info">${info}</div></div>`;
  return el;
}
function mkBtn(label, cls, onClick) {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = label;
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

// ─── Win Screen ────────────────────────────────────────────────────────────
function formatSigned(n) {
  const x = Math.round(Number(n) || 0);
  return x > 0 ? `+${x}` : `${x}`;
}

function gameOverReasonText(s, iWon) {
  if (!s) return "";
  if (s.disconnectForfeit) {
    return iWon
      ? "Opp disconnected and forfeited the match."
      : "You disconnected and forfeited the match.";
  }
  if (s.surrender) {
    return iWon ? "Opp surrendered the match." : "You surrendered the match.";
  }
  return iWon ? "You reached 12 VP first." : "Opp reached 12 VP first.";
}

function regionWinnerLabelForViewer(myStr, oppStr, initiative) {
  if (myStr > oppStr) return "You";
  if (oppStr > myStr) return "Opp";
  return initiative === myIndex ? "You (Initiative)" : "Opp (Initiative)";
}

let winRpAnimFrame = null;
let winRpAnimKey = "";

function resolveRankedRpResult(s) {
  if (!s || s.mode !== "ranked") return null;

  if (
    Array.isArray(s.rankedResult) &&
    s.rankedResult[myIndex] &&
    Number.isFinite(s.rankedResult[myIndex].eloBefore) &&
    Number.isFinite(s.rankedResult[myIndex].eloAfter)
  ) {
    const before = Math.round(s.rankedResult[myIndex].eloBefore);
    const after = Math.round(s.rankedResult[myIndex].eloAfter);
    const delta = Number.isFinite(s.rankedResult[myIndex].delta)
      ? Math.round(s.rankedResult[myIndex].delta)
      : after - before;
    return { before, after, delta, ready: true };
  }

  if (
    Array.isArray(initialRankedElos) &&
    Number.isFinite(initialRankedElos[myIndex]) &&
    Array.isArray(s.playerElos) &&
    Number.isFinite(s.playerElos[myIndex]) &&
    Math.round(s.playerElos[myIndex]) !== initialRankedElos[myIndex]
  ) {
    const before = initialRankedElos[myIndex];
    const after = Math.round(s.playerElos[myIndex]);
    return { before, after, delta: after - before, ready: true };
  }

  if (Array.isArray(s.playerElos) && Number.isFinite(s.playerElos[myIndex])) {
    const now = Math.round(s.playerElos[myIndex]);
    return { before: now, after: now, delta: 0, ready: false };
  }

  return { before: null, after: null, delta: null, ready: false };
}

function animateWinRpValue(el, from, to, key) {
  if (!el) return;

  if (winRpAnimFrame) {
    cancelAnimationFrame(winRpAnimFrame);
    winRpAnimFrame = null;
  }

  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
    el.textContent = Number.isFinite(to) ? `${Math.round(to)}` : "--";
    winRpAnimKey = key;
    return;
  }

  if (winRpAnimKey === key) {
    el.textContent = `${Math.round(to)}`;
    return;
  }

  winRpAnimKey = key;
  const start = performance.now();
  const durationMs = 900;

  const tick = (now) => {
    const t = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = Math.round(from + (to - from) * eased);
    el.textContent = `${value}`;
    if (t < 1) {
      winRpAnimFrame = requestAnimationFrame(tick);
    } else {
      winRpAnimFrame = null;
      el.textContent = `${Math.round(to)}`;
    }
  };

  winRpAnimFrame = requestAnimationFrame(tick);
}

function renderWinPointPill() {
  const pill = document.getElementById("winPointPill");
  if (!pill || !gameState || myIndex === null || myIndex === undefined) return;

  const s = gameState;
  const myVp = Number.isFinite(s.scores[myIndex]) ? s.scores[myIndex] : 0;
  const oppVp = Number.isFinite(s.scores[1 - myIndex])
    ? s.scores[1 - myIndex]
    : 0;

  pill.innerHTML = `
    <span class="win-point-score"><span class="win-vp-my">${myVp}</span> : <span class="win-vp-opp">${oppVp}</span></span>
  `;
}

function renderRankedRpRow() {
  const row = document.getElementById("winRankedRpRow");
  if (!row || !gameState || myIndex === null || myIndex === undefined) return;

  const s = gameState;
  if (s.mode !== "ranked") {
    row.textContent = "";
    row.classList.add("hidden");
    return;
  }

  const rankedRp = resolveRankedRpResult(s);
  row.classList.remove("hidden");
  row.innerHTML = `
    <span class="win-rp-badge">
      <span class="win-rp-meta">
        <span class="win-rp-final">--</span>
      </span>
      <span class="win-rp-meta">
        <span class="win-rp-delta">Calculating...</span>
      </span>
      <span class="mdi mdi-trophy ui-icon win-rp-icon" aria-hidden="true"></span>
    </span>
  `;

  const finalEl = row.querySelector(".win-rp-final");
  const deltaEl = row.querySelector(".win-rp-delta");

  if (
    finalEl &&
    rankedRp &&
    Number.isFinite(rankedRp.after) &&
    Number.isFinite(rankedRp.before)
  ) {
    const animKey = `${s.round}|${myIndex}|${rankedRp.before}|${rankedRp.after}`;
    animateWinRpValue(finalEl, rankedRp.before, rankedRp.after, animKey);
  } else if (finalEl) {
    finalEl.textContent = "--";
  }

  if (deltaEl) {
    if (rankedRp && Number.isFinite(rankedRp.delta) && rankedRp.ready) {
      deltaEl.textContent = `${formatSigned(rankedRp.delta)} RP`;
      deltaEl.classList.toggle("rp-change-gain", rankedRp.delta > 0);
      deltaEl.classList.toggle("rp-change-loss", rankedRp.delta < 0);
    } else {
      deltaEl.textContent = "Calculating...";
      deltaEl.classList.remove("rp-change-gain", "rp-change-loss");
    }
  }
}

function renderWinSummary() {
  const box = document.getElementById("winSummary");
  if (!box || !gameState || myIndex === null || myIndex === undefined) return;

  const s = gameState;

  box.textContent = "";

  const regionHead = document.createElement("div");
  regionHead.className = "win-summary-head";
  regionHead.textContent = "Region Results";
  box.appendChild(regionHead);

  const regionWrap = document.createElement("div");
  regionWrap.className = "win-summary-regions";
  for (const region of getRegionOrder(s)) {
    const myStr = calcStrengthClient(s, region, myIndex);
    const oppStr = calcStrengthClient(s, region, 1 - myIndex);
    const row = document.createElement("div");
    row.className = "win-summary-region";
    row.innerHTML = `
      <span class="name">${region}</span>
      <span class="score">You ${myStr} : ${oppStr} Opp</span>
      <span class="owner">${regionWinnerLabelForViewer(myStr, oppStr, s.initiative)}</span>
    `;
    regionWrap.appendChild(row);
  }
  box.appendChild(regionWrap);
}

function showWinScreen(iWon) {
  const win = document.getElementById("winOverlay");
  const trophy = document.getElementById("winTrophy");
  trophy.textContent = "";
  trophy.classList.toggle("mdi-trophy", iWon);
  trophy.classList.toggle("mdi-skull", !iWon);
  document.getElementById("winTitle").textContent = "Match Result";

  document.getElementById("winDesc").textContent = iWon
    ? "Victory!"
    : "Defeated!";
  document.getElementById("winReason").textContent = gameOverReasonText(
    gameState,
    iWon,
  );
  renderWinPointPill();
  renderRankedRpRow();
  renderWinSummary();
  win.classList.remove("hidden");
}

document.getElementById("btnRsContinue").addEventListener("click", () => {
  if (gameState && gameState.phase === "roundEnd")
    socket.emit("readyForNextRound");
});
document.getElementById("btnRsSurrender").addEventListener("click", () => {
  const isRanked = !!(gameState && gameState.mode === "ranked");
  if (
    confirm(
      isRanked
        ? "Are you sure you want to surrender the entire game? You will lose RP!"
        : "Are you sure you want to surrender the entire game?",
    )
  ) {
    socket.emit("surrenderMatch");
  }
});

// ─── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg, isError = false) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const t = document.createElement("div");
  t.className = "toast";
  if (isError) {
    t.appendChild(makeMdiIcon("mdi-alert-circle-outline"));
    t.appendChild(document.createTextNode(" "));
  }
  t.appendChild(document.createTextNode(msg));
  if (isError) t.style.borderColor = "rgba(231,76,60,0.6)";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

// ─── Helpers ───────────────────────────────────────────────────────────────
const CARD_DEFS = {
  N1: {
    id: "N1",
    region: "Noxus",
    strength: 1,
    champion: "Katarina",
    type: "Instant",
    ability:
      "Look at the top card of the deck. You may play it facedown to an adjacent region.",
  },
  N2: {
    id: "N2",
    region: "Noxus",
    strength: 2,
    champion: "Talon",
    type: "Instant",
    ability: "Flip a card in any region.",
  },
  N3: {
    id: "N3",
    region: "Noxus",
    strength: 3,
    champion: "Darius",
    type: "Instant",
    ability: "Flip a card in an adjacent region.",
  },
  N4: {
    id: "N4",
    region: "Noxus",
    strength: 4,
    champion: "Swain",
    type: "Ongoing",
    ability: "All cards covered by this card are now strength 4.",
  },
  N5: {
    id: "N5",
    region: "Noxus",
    strength: 5,
    champion: "LeBlanc",
    type: "Instant",
    ability:
      "Your opponent chooses and flips 1 of their cards. Then you flip 1 of yours.",
  },
  N6: {
    id: "N6",
    region: "Noxus",
    strength: 6,
    champion: "Draven",
    type: "None",
    ability: null,
  },
  D1: {
    id: "D1",
    region: "Demacia",
    strength: 1,
    champion: "Lux",
    type: "Ongoing",
    ability: "You gain +3 strength in each adjacent region.",
  },
  D2: {
    id: "D2",
    region: "Demacia",
    strength: 2,
    champion: "Quinn",
    type: "Instant",
    ability: "On your next turn, you may play a card to a non-matching region.",
  },
  D3: {
    id: "D3",
    region: "Demacia",
    strength: 3,
    champion: "Garen",
    type: "Instant",
    ability: "Flip a card in an adjacent region.",
  },
  D4: {
    id: "D4",
    region: "Demacia",
    strength: 4,
    champion: "Jarvan IV",
    type: "Ongoing",
    ability:
      "You may play cards of strength 3 or less to non-matching regions.",
  },
  D5: {
    id: "D5",
    region: "Demacia",
    strength: 5,
    champion: "Fiora",
    type: "Ongoing",
    ability:
      "If either player plays a facedown card, discard that card with no effect.",
  },
  D6: {
    id: "D6",
    region: "Demacia",
    strength: 6,
    champion: "Galio",
    type: "None",
    ability: null,
  },
  I1: {
    id: "I1",
    region: "Ionia",
    strength: 1,
    champion: "Ahri",
    type: "Instant",
    ability: "You may move 1 of your cards to a different region.",
  },
  I2: {
    id: "I2",
    region: "Ionia",
    strength: 2,
    champion: "Zed",
    type: "Ongoing",
    ability: "All of your facedown cards are now strength 4.",
  },
  I3: {
    id: "I3",
    region: "Ionia",
    strength: 3,
    champion: "Shen",
    type: "Instant",
    ability: "Flip a card in an adjacent region.",
  },
  I4: {
    id: "I4",
    region: "Ionia",
    strength: 4,
    champion: "Yasuo",
    type: "Instant",
    ability:
      "Return 1 of your facedown cards to your hand. If you do, gain an extra turn.",
  },
  I5: {
    id: "I5",
    region: "Ionia",
    strength: 5,
    champion: "Irelia",
    type: "Ongoing",
    ability:
      "If a card is played to an adjacent region with 3+ cards already, discard it.",
  },
  I6: {
    id: "I6",
    region: "Ionia",
    strength: 6,
    champion: "Master Yi",
    type: "None",
    ability: null,
  },
};

function getCardDef(id) {
  return (
    CARD_DEFS[id] || {
      id,
      champion: id,
      region: "",
      strength: 0,
      type: "None",
      ability: null,
    }
  );
}

function getCardImagePath(cardId) {
  return `/image/${cardId}.jpg`;
}

function adjacentRegions(r) {
  const order = getRegionOrder(gameState);
  const i = order.indexOf(r);
  const adj = [];
  if (i > 0) adj.push(order[i - 1]);
  if (i >= 0 && i < order.length - 1) adj.push(order[i + 1]);
  return adj;
}
