const socket = io();
const REGIONS = ["Noxus", "Demacia", "Ionia"];

// Attach Firebase identity (anonymous or logged-in) to this Socket.io connection.
// Safe: if Firebase isn't available, gameplay continues as before.
if (window.firebaseAuth) {
  window.firebaseAuth.onAuthStateChanged(async (user) => {
    if (!user) {
      socket.emit("clearAuth");
      return;
    }
    try {
      const token = await user.getIdToken();
      socket.emit("authToken", { token });
    } catch (e) {
      // ignore
    }
  });
}

// ─── State ─────────────────────────────────────────────────────────────────
let gameState = null;
let myIndex = null;
let selectedCard = null;
let deployFaceDown = false;

// ─── Guest identity (local-only) ─────────────────────────────────────────
// NOTE: localStorage is shared across tabs. For local 2-tab testing, keep an
// active per-tab name in sessionStorage and only use localStorage as a default.
const DISPLAY_NAME_STORAGE_KEY = "rc_displayName";
const DISPLAY_NAME_SESSION_KEY = "rc_displayName_session";

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
  render();
});

socket.on("joinError", (msg) => {
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

  // Player display names (server-sanitized; render via textContent)
  const names = Array.isArray(s.playerDisplayNames) ? s.playerDisplayNames : [];
  const isRanked = s.mode === "ranked";
  const elos = isRanked && Array.isArray(s.playerElos) ? s.playerElos : [];
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
  const myLabel =
    isRanked && myElo !== null ? `${myName} · ELO ${myElo}` : myName;
  const oppLabel =
    isRanked && oppElo !== null ? `${oppName} · ELO ${oppElo}` : oppName;
  const myLabelEl = document.querySelector("#myScoreBlock .player-label");
  const oppLabelEl = document.querySelector("#oppScoreBlock .player-label");
  if (myLabelEl) myLabelEl.textContent = myLabel;
  if (oppLabelEl) oppLabelEl.textContent = oppLabel;

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
    if (s.pendingAbility) {
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

  for (const region of REGIONS) {
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
      <img src="/image/${c.id}${getImgExt(c.id)}" alt="${def.champion}"
           onerror="this.style.display='none'" />
      <img src="/image/Icon_${def.region}.webp" class="card-region-corner" alt="${def.region}" onerror="this.style.display='none'">
    `;

    // Hover → show card info in sidebar
    card.addEventListener("mouseenter", () => showCardInfo(def));
    card.addEventListener("mouseleave", hideCardInfo);
  } else {
    card.className = "board-card facedown";
    card.innerHTML =
      '<span class="mdi mdi-sword-cross ui-icon facedown-icon" aria-hidden="true"></span>';
  }

  // Flip target highlight
  if (
    s.pendingAbility &&
    isFlipTarget(s.pendingAbility, region, playerIdx, myIndex, isUncovered)
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

function isFlipTarget(ab, region, cardPlayer, myIdx, isUncovered) {
  if (!ab) return false;

  // All flip abilities only target uncovered cards
  if (!isUncovered) return false;

  if (ab.type === "flip_any" && ab.playerIdx === myIdx) return true;
  if (ab.type === "flip_adjacent" && ab.playerIdx === myIdx) {
    return adjacentTo(ab.playedRegion, region);
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

  const zedActive = REGIONS.some((r) =>
    (s.regions[r][playerIdx] || []).some((c) => c.faceUp && c.id === "I2"),
  );
  const luxRegion = findCardRegion(s, "D1", playerIdx);

  for (const c of cards) {
    const def = getCardDef(c.id);
    let str = c.faceUp ? def.strength : 2;
    if (!c.faceUp && zedActive) str = 4;
    total += str;
  }
  if (luxRegion && adjacentTo(luxRegion, region)) total += 3;
  return total;
}

function findCardRegion(s, cardId, playerIdx) {
  for (const r of REGIONS) {
    if (
      (s.regions[r][playerIdx] || []).some((c) => c.id === cardId && c.faceUp)
    )
      return r;
  }
  return null;
}
function adjacentTo(r1, r2) {
  return Math.abs(REGIONS.indexOf(r1) - REGIONS.indexOf(r2)) === 1;
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
      <img src="/image/${card.id}${getImgExt(card.id)}" alt="${card.champion}"
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
    el.addEventListener("mouseenter", () => showCardInfo(card));
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

  document.getElementById("cidImage").src =
    `/image/${def.id}${getImgExt(def.id)}`;
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
      desc.textContent = `Top card: ${top.champion} (${top.region}, STR ${top.strength}). Deploy facedown to an adjacent region?`;
      for (const r of adjacentRegions("Noxus")) {
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
      for (const r of REGIONS) {
        const myCardsInR = gameState.regions[r][myIndex] || [];
        for (const c of myCardsInR) {
          const def = getCardDef(c.id);
          const el = mkModalOption(
            c.id,
            def.champion,
            r + (c.faceUp ? " · STR " + def.strength : " · facedown"),
          );
          el.addEventListener("click", () => {
            if (step !== "pick") return;
            pickedCard = c.id;
            pickedFrom = r;
            step = "dest";
            opts.innerHTML = "";
            desc.textContent = `Move ${def.champion} to which region?`;
            for (const dr of REGIONS) {
              if (dr === r) continue;
              const d = mkModalOption(
                dr,
                `<span class="mdi mdi-map-marker ui-icon" aria-hidden="true"></span>&nbsp;${dr}`,
                "Move here",
              );
              d.addEventListener("click", () => {
                socket.emit("abilityResponse", {
                  cardId: pickedCard,
                  fromRegion: pickedFrom,
                  toRegion: dr,
                });
                closeModal();
              });
              opts.appendChild(d);
            }
          });
          opts.appendChild(el);
        }
      }
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
        "Return an uncovered facedown card to hand and gain an extra turn, or skip.";
      let anyFound = false;
      for (const r of REGIONS) {
        const myCardsInR = gameState.regions[r][myIndex] || [];
        if (myCardsInR.length > 0) {
          const c = myCardsInR[myCardsInR.length - 1]; // Only the uncovered card
          if (!c.faceUp) {
            anyFound = true;
            const def = getCardDef(c.id);
            const el = mkModalOption(
              c.id,
              def.champion,
              r + " — return for extra turn",
            );
            el.addEventListener("click", () => {
              socket.emit("abilityResponse", { cardId: c.id, fromRegion: r });
              closeModal();
            });
            opts.appendChild(el);
          }
        }
      }
      if (!anyFound)
        desc.textContent = "No facedown uncovered cards to return.";
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
function showWinScreen(iWon) {
  const win = document.getElementById("winOverlay");
  const trophy = document.getElementById("winTrophy");
  trophy.textContent = "";
  trophy.classList.toggle("mdi-trophy", iWon);
  trophy.classList.toggle("mdi-skull", !iWon);
  document.getElementById("winTitle").textContent = iWon
    ? "Victory!"
    : "Defeated!";

  let desc = iWon
    ? `You conquered the Rift with ${gameState.scores[myIndex]} VP!`
    : `Opponent reached ${gameState.scores[1 - myIndex]} VP. Don't give up.`;

  if (gameState.surrender) {
    desc = iWon ? "Opponent surrendered!" : "You surrendered.";
  }

  document.getElementById("winDesc").textContent = desc;
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
        ? "Are you sure you want to surrender the entire game? You will lose ELO!"
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

const IMG_EXT = {
  N1: "jpg",
  N2: "jpg",
  N3: "png",
  N4: "png",
  N5: "png",
  N6: "jpg",
  D1: "jpg",
  D2: "png",
  D3: "jpg",
  D4: "png",
  D5: "jpg",
  D6: "png",
  I1: "png",
  I2: "jpg",
  I3: "jpg",
  I4: "jpg",
  I5: "png",
  I6: "png",
};
function getImgExt(id) {
  return "." + (IMG_EXT[id] || "png");
}

function adjacentRegions(r) {
  const i = REGIONS.indexOf(r);
  const adj = [];
  if (i > 0) adj.push(REGIONS[i - 1]);
  if (i < REGIONS.length - 1) adj.push(REGIONS[i + 1]);
  return adj;
}
