const { createGameState, startNewRound } = require("../game/state");
const { getCardById, REGIONS } = require("../game/cards");
const { adjacentRegions } = require("../game/regions");
const {
  applyInstantAbility,
  handleCardFlippedFaceUp,
  hasValidFlipTargets,
} = require("../game/abilities");
const { advanceTurn, endRound } = require("../game/round");
const { verifyIdToken } = require("../firebaseAdmin");
const {
  upsertUserFromDecoded,
  getMe,
  recordMatch,
} = require("../persistence/firestore");

const { sanitizeDisplayName } = require("../utils/sanitize");

const ALLOWED_EMOJI_REACTIONS = new Set(["haha", "like", "sad"]);
const EMOJI_RATE_WINDOW_MS = 5000;
const EMOJI_RATE_MAX = 3;

function setRoomPlayerDisplayName(room, playerIdx, rawName) {
  if (!room || (playerIdx !== 0 && playerIdx !== 1)) return;
  const sanitized = sanitizeDisplayName(rawName);
  if (!sanitized) return;
  room.playerDisplayNames = room.playerDisplayNames || [null, null];
  room.playerDisplayNames[playerIdx] = sanitized;
}

function setRoomPlayerElo(room, playerIdx, elo) {
  if (!room || (playerIdx !== 0 && playerIdx !== 1)) return;
  const n =
    typeof elo === "number" && Number.isFinite(elo) ? Math.round(elo) : null;
  if (n === null) return;
  room.playerElos = room.playerElos || [null, null];
  room.playerElos[playerIdx] = n;
}

function registerSocketHandlers(io, roomManager) {
  const { rooms } = roomManager;

  // Phase 7 — Ranked matchmaking (FCFS, in-memory)
  const rankedQueue = [];
  const rankedQueueSet = new Set();

  function isRankedEligibleSocket(sock) {
    return !!(
      sock &&
      sock.data &&
      sock.data.firebaseUser &&
      sock.data.firebaseUser.uid &&
      sock.data.firebaseUser.isAnonymous === false
    );
  }

  function removeFromRankedQueue(socketId) {
    if (!socketId || !rankedQueueSet.has(socketId)) return false;
    rankedQueueSet.delete(socketId);
    const idx = rankedQueue.indexOf(socketId);
    if (idx !== -1) rankedQueue.splice(idx, 1);
    return true;
  }

  function queueRankedSocket(sock) {
    if (!sock) return false;
    if (rankedQueueSet.has(sock.id)) return true;
    rankedQueueSet.add(sock.id);
    rankedQueue.push(sock.id);
    return true;
  }

  function startRankedMatch(sockA, sockB) {
    if (!sockA || !sockB) return;
    if (!isRankedEligibleSocket(sockA) || !isRankedEligibleSocket(sockB))
      return;

    const code = roomManager.createRoom(sockA.id, { mode: "ranked" });
    const room = rooms[code];
    if (!room) return;

    room.players[1] = sockB.id;

    setRoomPlayerUid(room, 0, sockA.data.firebaseUser.uid);
    setRoomPlayerUid(room, 1, sockB.data.firebaseUser.uid);

    const nameA =
      sockA.data.profileDisplayName ||
      (sockA.data.firebaseUser && sockA.data.firebaseUser.name) ||
      "";
    const nameB =
      sockB.data.profileDisplayName ||
      (sockB.data.firebaseUser && sockB.data.firebaseUser.name) ||
      "";

    setRoomPlayerDisplayName(room, 0, nameA);
    setRoomPlayerDisplayName(room, 1, nameB);

    if (sockA.data && sockA.data.profileStats)
      setRoomPlayerElo(room, 0, sockA.data.profileStats.elo);
    if (sockB.data && sockB.data.profileStats)
      setRoomPlayerElo(room, 1, sockB.data.profileStats.elo);

    room.matchStartedAtMs = Date.now();
    room.matchRecorded = false;
    room.matchRecordInProgress = false;
    room.matchId = null;

    sockA.join(code);
    sockB.join(code);

    const startingInitiative = Math.floor(Math.random() * 2);
    room.state = createGameState(startingInitiative);
    startNewRound(room.state, { waitForRejoin: true });

    // Tell each player their assigned index for redirect.
    sockA.emit("gameStarted", { code, playerIndex: 0 });
    sockB.emit("gameStarted", { code, playerIndex: 1 });

    scheduleRoundIntroFallback(code, room);
    refreshTurnTimer(code, room);
    console.log(
      `Ranked match found: Room ${code} (${sockA.id} vs ${sockB.id})`,
    );
  }

  function tryStartRankedMatches() {
    let safety = 0;
    while (rankedQueue.length >= 2 && safety < 25) {
      safety++;

      // Purge invalid entries from the front.
      while (rankedQueue.length > 0) {
        const frontId = rankedQueue[0];
        const frontSock = io.sockets.sockets.get(frontId);
        const inRoom = !!roomManager.getRoomOfSocket(frontId);
        if (!frontSock || !isRankedEligibleSocket(frontSock) || inRoom) {
          removeFromRankedQueue(frontId);
          continue;
        }
        break;
      }

      if (rankedQueue.length < 2) return;

      const aId = rankedQueue[0];
      const sockA = io.sockets.sockets.get(aId);
      if (!sockA || !isRankedEligibleSocket(sockA)) {
        removeFromRankedQueue(aId);
        continue;
      }
      const uidA = sockA.data.firebaseUser.uid;

      // Find the earliest eligible opponent after A.
      let bId = null;
      for (let i = 1; i < rankedQueue.length; i++) {
        const candId = rankedQueue[i];
        const candSock = io.sockets.sockets.get(candId);
        const candInRoom = !!roomManager.getRoomOfSocket(candId);
        if (!candSock || !isRankedEligibleSocket(candSock) || candInRoom) {
          removeFromRankedQueue(candId);
          i--;
          continue;
        }
        const uidB = candSock.data.firebaseUser.uid;
        if (uidB && uidB !== uidA) {
          bId = candId;
          break;
        }
      }

      if (!bId) return;

      const sockB = io.sockets.sockets.get(bId);
      if (!sockB || !isRankedEligibleSocket(sockB)) {
        removeFromRankedQueue(bId);
        continue;
      }

      // Remove in stable order.
      removeFromRankedQueue(bId);
      removeFromRankedQueue(aId);

      startRankedMatch(sockA, sockB);
    }
  }

  function readDurationMs(envValue, fallbackMs, minMs, maxMs) {
    const n =
      typeof envValue === "string" && envValue.trim()
        ? parseInt(envValue, 10)
        : NaN;
    if (!Number.isFinite(n) || n <= 0) return fallbackMs;
    return Math.max(minMs, Math.min(maxMs, n));
  }

  // Phase 5 governance defaults (can be overridden via env vars)
  const LOBBY_DISCONNECT_GRACE_MS = 10000;
  const TURN_TIMEOUT_MS = readDurationMs(
    process.env.TURN_TIMEOUT_MS,
    40000,
    5000,
    5 * 60 * 1000,
  );
  const ROUND_INTRO_FALLBACK_MS = readDurationMs(
    process.env.ROUND_INTRO_FALLBACK_MS,
    5000,
    1000,
    30 * 1000,
  );
  const DISCONNECT_FORFEIT_MS = readDurationMs(
    process.env.DISCONNECT_FORFEIT_MS,
    60000,
    10000,
    30 * 60 * 1000,
  );

  function actingPlayerIndexForState(state) {
    if (!state) return null;
    if (state.pendingAbility) {
      if (state.pendingAbility.type === "N5_opp_flip") {
        return 1 - state.pendingAbility.playerIdx;
      }
      return state.pendingAbility.playerIdx;
    }
    return state.currentTurn;
  }

  // NOTE: This key format MUST be kept in sync with turnTimerKeyForState
  // in frontend/public/game.js — both files compute the same key independently
  // (no shared module possible without a build step).
  function turnTimerKeyForState(state) {
    if (!state) return "";
    const actor = actingPlayerIndexForState(state);
    const pendingType = state.pendingAbility ? state.pendingAbility.type : "";
    const pendingPlayerIdx = state.pendingAbility
      ? state.pendingAbility.playerIdx
      : "";
    return `${state.phase}|r${state.round}|t${state.currentTurn}|a${actor}|p${pendingType}|pp${pendingPlayerIdx}`;
  }

  function clearTurnTimer(room) {
    if (!room) return;
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }
    room.turnTimerKey = null;
  }

  function clearRoundIntroTimer(room) {
    if (!room) return;
    if (room.roundIntroTimer) {
      clearTimeout(room.roundIntroTimer);
      room.roundIntroTimer = null;
    }
    room.roundIntroKey = null;
  }

  function beginRoundPlay(code, room) {
    if (!room || !room.state) return;
    if (room.state.phase !== "roundIntro") return;

    room.state.phase = "playing";
    room.state.roundIntro = null;
    clearRoundIntroTimer(room);

    roomManager.broadcastState(code);
    refreshTurnTimer(code, room);
  }

  function scheduleRoundIntroFallback(code, room) {
    if (!room || !room.state) return;
    const state = room.state;

    if (state.phase !== "roundIntro") {
      clearRoundIntroTimer(room);
      return;
    }

    // Avoid ending intro while clients are still navigating lobby -> game.
    const intro = state.roundIntro;
    if (
      intro &&
      Array.isArray(intro.joined) &&
      (intro.joined[0] !== true || intro.joined[1] !== true)
    ) {
      clearRoundIntroTimer(room);
      return;
    }

    const key = `r${state.round}`;
    if (room.roundIntroTimer && room.roundIntroKey === key) return;

    clearRoundIntroTimer(room);
    room.roundIntroKey = key;

    room.roundIntroTimer = setTimeout(() => {
      const live = rooms[code];
      if (!live || !live.state) return;
      if (live.state.phase !== "roundIntro") return;
      if (`r${live.state.round}` !== key) return;

      beginRoundPlay(code, live);
    }, ROUND_INTRO_FALLBACK_MS);
  }

  function clearDisconnectTimer(room, playerIdx) {
    if (!room || !room.disconnectTimers) return;
    const t = room.disconnectTimers[playerIdx];
    if (t) clearTimeout(t);
    delete room.disconnectTimers[playerIdx];
  }

  function clearAllDisconnectTimers(room) {
    if (!room || !room.disconnectTimers) return;
    clearDisconnectTimer(room, 0);
    clearDisconnectTimer(room, 1);
    room.disconnectTimers = {};
  }

  function scheduleDisconnectForfeit(
    code,
    room,
    playerIdx,
    socketIdSnapshot,
    delayMs = DISCONNECT_FORFEIT_MS,
  ) {
    if (!room) return;
    const ms = Math.max(0, Math.floor(delayMs));

    room.disconnectTimers = room.disconnectTimers || {};
    clearDisconnectTimer(room, playerIdx);

    room.disconnectTimers[playerIdx] = setTimeout(() => {
      const live = rooms[code];
      if (!live || !live.state) return;
      if (live.players[playerIdx] !== socketIdSnapshot) return; // rejoined

      const otherIdx = 1 - playerIdx;
      const bothDisconnected = !!(
        live.disconnectTimers && live.disconnectTimers[otherIdx]
      );

      // This timer has fired; remove it from the map.
      delete live.disconnectTimers[playerIdx];

      if (bothDisconnected) {
        clearAllDisconnectTimers(live);
        clearTurnTimer(live);
        clearRoundIntroTimer(live);
        delete rooms[code];
        console.log(`Room ${code} ended as No Contest (both disconnected).`);
        return;
      }

      if (live.state.phase !== "gameOver") {
        live.state.phase = "gameOver";
        live.state.surrender = true;
        live.state.disconnectForfeit = true;
        live.state.winner = otherIdx;
        live.state.pendingAbility = null;
        live.state.abilityQueue = [];
        live.state.log.push(
          `Player ${playerIdx + 1} forfeits due to disconnect.`,
        );
      }

      maybePersistMatch(code, live);
      roomManager.broadcastState(code);
      refreshTurnTimer(code, live);
    }, ms);
  }

  function refreshTurnTimer(code, room) {
    if (!room || !room.state) return;
    const state = room.state;

    // Only enforce during active play.
    if (state.phase !== "playing") {
      clearTurnTimer(room);
      return;
    }

    const actor = actingPlayerIndexForState(state);
    if (actor !== 0 && actor !== 1) {
      clearTurnTimer(room);
      return;
    }

    // If the acting player is disconnected, suspend the turn timer and rely on
    // the disconnect-forfeit timer instead.
    if (room.disconnectTimers && room.disconnectTimers[actor]) {
      clearTurnTimer(room);
      return;
    }

    const key = turnTimerKeyForState(state);
    if (room.turnTimer && room.turnTimerKey === key) return;

    clearTurnTimer(room);
    room.turnTimerKey = key;

    room.turnTimer = setTimeout(() => {
      const live = rooms[code];
      if (!live || !live.state) return;

      // Ensure we are still timing the same turn / pending ability.
      if (turnTimerKeyForState(live.state) !== key) return;
      if (live.state.phase !== "playing") return;

      const timedOutIdx = actingPlayerIndexForState(live.state);
      if (timedOutIdx !== 0 && timedOutIdx !== 1) return;

      // If the player disconnected mid-timer, disconnect-forfeit handles it.
      if (live.disconnectTimers && live.disconnectTimers[timedOutIdx]) return;

      // Server-authoritative timeout handling: force retreat for this round.
      live.state.log.push(
        `Turn timer expired. Player ${timedOutIdx + 1} retreated.`,
      );
      live.state.withdrawn[timedOutIdx] = true;
      live.state.pendingAbility = null;
      live.state.abilityQueue = [];
      endRound(live.state, code, live);

      maybePersistMatch(code, live);
      roomManager.broadcastState(code);
      refreshTurnTimer(code, live);
    }, TURN_TIMEOUT_MS);
  }

  function setRoomPlayerUid(room, playerIdx, uid) {
    if (!room || playerIdx < 0 || playerIdx > 1) return;
    room.playerUids = room.playerUids || [null, null];
    room.playerUids[playerIdx] = uid || null;
  }

  function maybePersistMatch(code, room) {
    if (!room || !room.state) return;
    if (room.mode !== "ranked") return;
    if (room.state.phase !== "gameOver") return;
    if (room.matchRecorded || room.matchRecordInProgress) return;

    const winnerIndex = room.state.winner;
    if (winnerIndex !== 0 && winnerIndex !== 1) return;

    const uids = room.playerUids || [];
    if (!uids[0] || !uids[1]) return;

    const now = Date.now();
    if (
      room.matchPersistLastAttemptAt &&
      now - room.matchPersistLastAttemptAt < 10000
    ) {
      return;
    }
    room.matchPersistLastAttemptAt = now;

    room.matchRecordInProgress = true;
    void recordMatch({
      roomCode: code,
      playerUids: [uids[0], uids[1]],
      winnerIndex,
      scores: room.state.scores,
      surrendered: !!room.state.surrender,
      startedAtMs: room.matchStartedAtMs,
      endedAtMs: now,
    })
      .then((result) => {
        room.matchRecorded = true;
        room.matchId = result && result.matchId ? result.matchId : null;
      })
      .catch((err) => {
        console.warn(
          `[match] Persist failed for room ${code}:`,
          err && err.message ? err.message : err,
        );
      })
      .finally(() => {
        room.matchRecordInProgress = false;
      });
  }

  io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    // Firebase Auth (anonymous / Google / email-password)
    // Client sends an ID token; server verifies and attaches identity to this socket.
    socket.on("authToken", async (payload) => {
      const token =
        payload && typeof payload.token === "string" ? payload.token : "";
      if (!token) return;

      try {
        const decoded = await verifyIdToken(token);
        const provider = decoded.firebase && decoded.firebase.sign_in_provider;
        const isAnonymous = provider === "anonymous";
        socket.data.firebaseUser = {
          uid: decoded.uid,
          email: decoded.email || null,
          name: decoded.name || null,
          provider: provider || null,
          isAnonymous,
        };

        // Cached server-authoritative profile display name for authenticated accounts.
        socket.data.profileDisplayName = null;
        socket.data.profileStats = null;

        // Best-effort: create/update the server-backed player profile.
        // Guests (anonymous) must not trigger server persistence.
        if (!isAnonymous) {
          try {
            await upsertUserFromDecoded(decoded);
            const me = await getMe(decoded.uid);
            if (
              me &&
              typeof me.displayName === "string" &&
              me.displayName.trim()
            ) {
              socket.data.profileDisplayName = me.displayName.trim();
            }
            if (me && me.stats) socket.data.profileStats = me.stats;
          } catch {
            // ignore
          }
        }

        // If the socket is already associated with a room, attach the UID.
        const found = roomManager.getRoomOfSocket(socket.id);
        if (found) {
          const { code, room } = found;
          const pIdx = roomManager.playerIndexOf(room, socket.id);
          if (!isAnonymous) {
            setRoomPlayerUid(room, pIdx, decoded.uid);
          } else if (room.mode !== "ranked") {
            setRoomPlayerUid(room, pIdx, null);
          }
          if (!isAnonymous && socket.data.profileDisplayName) {
            setRoomPlayerDisplayName(
              room,
              pIdx,
              socket.data.profileDisplayName,
            );
          }
          if (
            room.mode === "ranked" &&
            !isAnonymous &&
            socket.data.profileStats &&
            typeof socket.data.profileStats.elo === "number"
          ) {
            setRoomPlayerElo(room, pIdx, socket.data.profileStats.elo);
          }

          // Push updated identity/stats into the game view ASAP.
          roomManager.broadcastState(code);
        }

        socket.emit("authOk", {
          uid: decoded.uid,
          provider: provider || null,
          isAnonymous,
        });
      } catch (err) {
        delete socket.data.firebaseUser;
        delete socket.data.profileDisplayName;
        delete socket.data.profileStats;
        socket.emit("authError", "Auth failed.");
      }
    });

    // Client-side sign-out can leave the socket connected; ensure the server
    // doesn't keep stale authenticated identity attached to this socket.
    socket.on("clearAuth", () => {
      delete socket.data.firebaseUser;
      delete socket.data.profileDisplayName;
      delete socket.data.profileStats;

      // If this socket was queued for ranked, remove it.
      removeFromRankedQueue(socket.id);

      const found = roomManager.getRoomOfSocket(socket.id);
      if (found) {
        const { room } = found;
        const pIdx = roomManager.playerIndexOf(room, socket.id);
        if (room.mode !== "ranked") setRoomPlayerUid(room, pIdx, null);
      }
    });

    // RANKED MATCHMAKING (FCFS)
    socket.on("rankedFind", () => {
      if (!isRankedEligibleSocket(socket)) {
        socket.emit("rankedError", "Sign in to play Ranked.");
        return;
      }

      const found = roomManager.getRoomOfSocket(socket.id);
      if (found) {
        socket.emit("rankedError", "You are already in a room.");
        return;
      }

      queueRankedSocket(socket);
      socket.emit("rankedQueued");
      tryStartRankedMatches();
    });

    socket.on("rankedCancel", () => {
      const removed = removeFromRankedQueue(socket.id);
      if (removed) socket.emit("rankedCanceled");
    });

    // HOST
    socket.on("hostRoom", (payload) => {
      const code = roomManager.createRoom(socket.id);
      const room = rooms[code];
      if (room) {
        const isAccount =
          socket.data.firebaseUser &&
          socket.data.firebaseUser.isAnonymous === false;
        const displayName =
          isAccount && socket.data.profileDisplayName
            ? socket.data.profileDisplayName
            : payload && typeof payload.displayName === "string"
              ? payload.displayName
              : "";
        setRoomPlayerDisplayName(room, 0, displayName);
      }
      if (room && socket.data.firebaseUser && socket.data.firebaseUser.uid) {
        if (socket.data.firebaseUser.isAnonymous === false)
          setRoomPlayerUid(room, 0, socket.data.firebaseUser.uid);
      }
      socket.join(code);
      socket.emit("roomCreated", { code });
      console.log(`Room ${code} created by ${socket.id}`);
    });

    // JOIN
    socket.on("joinRoom", (payload) => {
      const code =
        payload && typeof payload.code === "string"
          ? payload.code.trim().toUpperCase()
          : "";
      const room = rooms[code];
      if (!room) return socket.emit("joinError", "Room not found.");
      if (room.players[1]) return socket.emit("joinError", "Room is full.");

      const isAccount =
        socket.data.firebaseUser &&
        socket.data.firebaseUser.isAnonymous === false;

      const displayName =
        isAccount && socket.data.profileDisplayName
          ? socket.data.profileDisplayName
          : payload && typeof payload.displayName === "string"
            ? payload.displayName
            : "";
      setRoomPlayerDisplayName(room, 1, displayName);

      room.players[1] = socket.id;
      if (socket.data.firebaseUser && socket.data.firebaseUser.uid) {
        if (socket.data.firebaseUser.isAnonymous === false)
          setRoomPlayerUid(room, 1, socket.data.firebaseUser.uid);
      }

      room.matchStartedAtMs = Date.now();
      room.matchRecorded = false;
      room.matchRecordInProgress = false;
      room.matchId = null;
      socket.join(code);

      // Start game
      const startingInitiative = Math.floor(Math.random() * 2);
      room.state = createGameState(startingInitiative);
      startNewRound(room.state, { waitForRejoin: true });

      io.to(code).emit("gameStarted", { code });
      roomManager.broadcastState(code);
      scheduleRoundIntroFallback(code, room);
      refreshTurnTimer(code, room);
      console.log(`Room ${code} — game started`);
    });

    // ROUND INTRO DONE (client finished local title intro)
    socket.on("roundIntroDone", (payload) => {
      const found = roomManager.getRoomOfSocket(socket.id);
      if (!found) return;
      const { code, room } = found;
      const state = room.state;
      const pIdx = roomManager.playerIndexOf(room, socket.id);

      if (!state || state.phase !== "roundIntro") return;
      if (pIdx !== 0 && pIdx !== 1) return;
      if (!state.roundIntro) return;

      const roundRaw = payload ? payload.round : null;
      const round =
        typeof roundRaw === "number"
          ? roundRaw
          : parseInt(String(roundRaw ?? ""), 10);

      if (!Number.isFinite(round) || round !== state.roundIntro.round) return;

      if (Array.isArray(state.roundIntro.joined)) {
        state.roundIntro.joined[pIdx] = true;
      }
      if (Array.isArray(state.roundIntro.done)) {
        state.roundIntro.done[pIdx] = true;
      }

      // Keep a fallback in case one client misses the intro ack.
      scheduleRoundIntroFallback(code, room);

      if (
        Array.isArray(state.roundIntro.done) &&
        state.roundIntro.done[0] &&
        state.roundIntro.done[1]
      ) {
        beginRoundPlay(code, room);
      }
    });

    // EMOJI REACTIONS (non-gameplay)
    socket.on("emojiReaction", (payload) => {
      const found = roomManager.getRoomOfSocket(socket.id);
      if (!found) return;

      const emojiRaw =
        payload && typeof payload.emoji === "string" ? payload.emoji : "";
      const emoji = emojiRaw.trim().toLowerCase();
      if (!ALLOWED_EMOJI_REACTIONS.has(emoji)) return;

      // Rate limit per-socket: allow a small burst, prevent spamming.
      const now = Date.now();
      const windowStart = now - EMOJI_RATE_WINDOW_MS;
      socket.data.emojiReactionTimes = (socket.data.emojiReactionTimes || [])
        .filter((t) => t > windowStart)
        .slice(-EMOJI_RATE_MAX);

      if (socket.data.emojiReactionTimes.length >= EMOJI_RATE_MAX) return;
      socket.data.emojiReactionTimes.push(now);

      const { code, room } = found;
      const pIdx = roomManager.playerIndexOf(room, socket.id);
      io.to(code).emit("emojiReaction", { emoji, fromPlayer: pIdx });
    });

    // PLAY CARD
    socket.on("playCard", ({ cardId, regionName, faceDown }) => {
      const found = roomManager.getRoomOfSocket(socket.id);
      if (!found) return;
      const { code, room } = found;
      const state = room.state;
      const pIdx = roomManager.playerIndexOf(room, socket.id);

      if (state.phase !== "playing") return;
      if (state.currentTurn !== pIdx)
        return socket.emit("actionError", "Not your turn.");
      if (state.withdrawn[pIdx])
        return socket.emit("actionError", "You have already withdrawn.");
      if (state.pendingAbility)
        return socket.emit("actionError", "Resolve pending ability first.");

      const cardDef = getCardById(cardId);
      if (!cardDef) return socket.emit("actionError", "Invalid card.");

      // Check card is in hand
      const handIdx = state.hands[pIdx].findIndex((c) => c.id === cardId);
      if (handIdx === -1)
        return socket.emit("actionError", "Card not in hand.");

      // Validate region rules
      if (faceDown) {
        // Face-down allowed anywhere
      } else {
        // Face-up must go to matching region unless Quinn or Jarvan IV effect
        const jarvanActive = Object.values(state.regions).some((r) =>
          r[pIdx].some((c) => c.faceUp && c.id === "D4"),
        );
        const canPlayAnywhere =
          state.quinnEffect[pIdx] || (jarvanActive && cardDef.strength <= 3);

        if (cardDef.region !== regionName && !canPlayAnywhere) {
          return socket.emit(
            "actionError",
            `${cardDef.champion} must be played to ${cardDef.region} face-up.`,
          );
        }
      }

      // D5 Fiora: discard facedown cards
      const fioraActive = Object.values(state.regions).some(
        (r) =>
          r[1 - pIdx].some((c) => c.faceUp && c.id === "D5") ||
          r[pIdx].some((c) => c.faceUp && c.id === "D5"),
      );
      if (faceDown && fioraActive) {
        state.hands[pIdx].splice(handIdx, 1);
        state.log.push({
          m0:
            pIdx === 0
              ? `Fiora discards ${cardDef.champion} (facedown)!`
              : "Fiora discards opponent's facedown card!",
          m1:
            pIdx === 1
              ? `Fiora discards ${cardDef.champion} (facedown)!`
              : "Fiora discards opponent's facedown card!",
        });
        advanceTurn(state, code, room);
        maybePersistMatch(code, room);
        roomManager.broadcastState(code);
        refreshTurnTimer(code, room);
        return;
      }

      // I5 Irelia (Ongoing): if a card is played to a region adjacent to Irelia,
      // and that region already has 3+ cards total, discard the played card.
      const ireliaRegions = [];
      for (const r of REGIONS) {
        const hasIreliaHere =
          state.regions[r][0].some((c) => c.faceUp && c.id === "I5") ||
          state.regions[r][1].some((c) => c.faceUp && c.id === "I5");
        if (hasIreliaHere) ireliaRegions.push(r);
      }

      if (ireliaRegions.length > 0) {
        const isAdjacentToIrelia = ireliaRegions.some((r) =>
          adjacentRegions(state, r).includes(regionName),
        );

        if (isAdjacentToIrelia) {
          const totalCards =
            state.regions[regionName][0].length +
            state.regions[regionName][1].length;

          if (totalCards >= 3) {
            state.hands[pIdx].splice(handIdx, 1);

            if (faceDown) {
              state.log.push({
                m0:
                  pIdx === 0
                    ? `Irelia discards ${cardDef.champion} (facedown) played to ${regionName}!`
                    : `Irelia discards a facedown card played to ${regionName}!`,
                m1:
                  pIdx === 1
                    ? `Irelia discards ${cardDef.champion} (facedown) played to ${regionName}!`
                    : `Irelia discards a facedown card played to ${regionName}!`,
              });
            } else {
              state.log.push(
                `Irelia discards ${cardDef.champion} played to ${regionName}!`,
              );
            }

            advanceTurn(state, code, room);
            maybePersistMatch(code, room);
            roomManager.broadcastState(code);
            refreshTurnTimer(code, room);
            return;
          }
        }
      }

      // Place card
      state.hands[pIdx].splice(handIdx, 1);
      const placedCard = { id: cardId, faceUp: !faceDown };
      state.regions[regionName][pIdx].push(placedCard);

      // Reset Quinn effect after use
      if (state.quinnEffect[pIdx] && cardDef.region !== regionName) {
        state.quinnEffect[pIdx] = false;
      }

      state.log.push(
        `Player ${pIdx + 1} plays ${faceDown ? "facedown card" : cardDef.champion} to ${regionName}.`,
      );

      // Resolve instant ability
      if (!faceDown && cardDef.type === "Instant") {
        const result = applyInstantAbility(state, cardId, pIdx, regionName);
        room.state = result.state;
        if (result.pendingAbility) {
          room.state.pendingAbility = result.pendingAbility;
          roomManager.broadcastState(code);
          refreshTurnTimer(code, room);
          return; // Wait for ability response
        }
      }

      advanceTurn(state, code, room);
      maybePersistMatch(code, room);
      roomManager.broadcastState(code);
      refreshTurnTimer(code, room);
    });

    // ABILITY RESPONSE
    socket.on("abilityResponse", (data) => {
      const found = roomManager.getRoomOfSocket(socket.id);
      if (!found) return;
      const { code, room } = found;
      const state = room.state;
      const pIdx = roomManager.playerIndexOf(room, socket.id);

      if (!state.pendingAbility) return;
      const ability = state.pendingAbility;

      // Only the relevant player can respond
      if (ability.type !== "N5_opp_flip" && ability.playerIdx !== pIdx) return;
      if (ability.type === "N5_opp_flip" && pIdx !== 1 - ability.playerIdx)
        return;

      switch (ability.type) {
        case "N1_peek": {
          // data: { deploy: bool, regionName: string|null }
          const playedRegion =
            ability &&
            typeof ability.playedRegion === "string" &&
            ability.playedRegion
              ? ability.playedRegion
              : "Noxus";
          const targetRegion =
            data && typeof data.regionName === "string" ? data.regionName : "";
          const allowedRegions = adjacentRegions(state, playedRegion);
          const isValidDeployTarget =
            targetRegion &&
            REGIONS.includes(targetRegion) &&
            allowedRegions.includes(targetRegion);

          if (data.deploy && state.deck.length > 0 && isValidDeployTarget) {
            const topCard = state.deck.shift();

            // D5 Fiora check: discard if either player has an active Fiora
            const fioraActive = Object.values(state.regions).some(
              (r) =>
                r[1 - pIdx].some((c) => c.faceUp && c.id === "D5") ||
                r[pIdx].some((c) => c.faceUp && c.id === "D5"),
            );

            if (fioraActive) {
              state.log.push({
                m0:
                  pIdx === 0
                    ? `Katarina: You tried to deploy ${topCard.champion} facedown to ${targetRegion}, but Fiora discarded it!`
                    : `Katarina: Opponent tried to deploy a card facedown to ${targetRegion}, but Fiora discarded it!`,
                m1:
                  pIdx === 1
                    ? `Katarina: You tried to deploy ${topCard.champion} facedown to ${targetRegion}, but Fiora discarded it!`
                    : `Katarina: Opponent tried to deploy a card facedown to ${targetRegion}, but Fiora discarded it!`,
              });
            } else {
              state.regions[targetRegion][pIdx].push({
                id: topCard.id,
                faceUp: false,
              });
              state.log.push({
                m0:
                  pIdx === 0
                    ? `Katarina: You deployed ${topCard.champion} facedown to ${targetRegion}.`
                    : `Katarina: Opponent deployed a card facedown to ${targetRegion}.`,
                m1:
                  pIdx === 1
                    ? `Katarina: You deployed ${topCard.champion} facedown to ${targetRegion}.`
                    : `Katarina: Opponent deployed a card facedown to ${targetRegion}.`,
              });
            }
          } else {
            state.log.push({
              m0:
                pIdx === 0
                  ? "Katarina: You chose not to deploy."
                  : "Katarina: Opponent chose not to deploy.",
              m1:
                pIdx === 1
                  ? "Katarina: You chose not to deploy."
                  : "Katarina: Opponent chose not to deploy.",
            });
          }
          state.pendingAbility = null;
          break;
        }
        case "flip_any":
        case "flip_adjacent": {
          // data: { targetCardId, targetRegion, targetPlayer }
          // Only the topmost (uncovered) card in a stack may be flipped.
          if (ability.type === "flip_adjacent") {
            // Validate the chosen region is actually adjacent to the played region.
            const adj = adjacentRegions(state, ability.playedRegion);
            if (!adj.includes(data.targetRegion)) {
              state.pendingAbility = null;
              break;
            }
          }
          const targetArr = state.regions[data.targetRegion]?.[data.targetPlayer];
          const target =
            targetArr && targetArr.length > 0
              ? targetArr[targetArr.length - 1]
              : null;
          if (target && target.id === data.targetCardId) {
            target.faceUp = !target.faceUp;
            state.log.push(
              `${getCardById(ability.sourceCard || "N2")?.champion || "Card"}: Flipped ${getCardById(data.targetCardId)?.champion}.`,
            );
            if (target.faceUp)
              handleCardFlippedFaceUp(
                state,
                target,
                data.targetRegion,
                data.targetPlayer,
              );
          }
          state.pendingAbility = null;
          break;
        }
        case "N5_opp_flip": {
          // Opponent is flipping one of their cards (only the top/uncovered card).
          const oppArr = state.regions[data.targetRegion]?.[pIdx];
          const target =
            oppArr && oppArr.length > 0 ? oppArr[oppArr.length - 1] : null;
          if (target && target.id === data.targetCardId) {
            target.faceUp = !target.faceUp;
            state.log.push(
              `LeBlanc: Opponent flipped ${getCardById(data.targetCardId)?.champion}.`,
            );
            if (target.faceUp)
              handleCardFlippedFaceUp(state, target, data.targetRegion, pIdx);
          }
          // Now player (LeBlanc owner) flips one of theirs if valid
          if (hasValidFlipTargets(state, REGIONS, [ability.playerIdx])) {
            state.pendingAbility = {
              type: "N5_self_flip",
              playerIdx: ability.playerIdx,
              label: "LeBlanc: Now flip one of your own cards.",
            };
            roomManager.broadcastState(code);
            refreshTurnTimer(code, room);
            return;
          } else {
            state.log.push(`LeBlanc: You have no cards to flip.`);
            state.pendingAbility = null;
            break;
          }
        }
        case "N5_self_flip": {
          // Only the top/uncovered card in the stack may be flipped.
          const selfArr = state.regions[data.targetRegion]?.[pIdx];
          const target =
            selfArr && selfArr.length > 0 ? selfArr[selfArr.length - 1] : null;
          if (target && target.id === data.targetCardId) {
            target.faceUp = !target.faceUp;
            state.log.push(
              `LeBlanc: You flipped ${getCardById(data.targetCardId)?.champion}.`,
            );
            if (target.faceUp)
              handleCardFlippedFaceUp(state, target, data.targetRegion, pIdx);
          }
          state.pendingAbility = null;
          break;
        }
        case "I1_move": {
          // data: { cardId, fromRegion, toRegion }
          const fromArr = state.regions[data.fromRegion]?.[pIdx];
          if (fromArr) {
            const cIdx = fromArr.findIndex((c) => c.id === data.cardId);
            if (cIdx !== -1) {
              const [moved] = fromArr.splice(cIdx, 1);
              state.regions[data.toRegion][pIdx].push(moved);
              const movedChampion = getCardById(moved.id)?.champion || "card";
              if (moved.faceUp) {
                state.log.push(
                  `Ahri: Moved ${movedChampion} from ${data.fromRegion} to ${data.toRegion}.`,
                );
              } else {
                state.log.push({
                  m0:
                    pIdx === 0
                      ? `Ahri: Moved ${movedChampion} from ${data.fromRegion} to ${data.toRegion}.`
                      : `Ahri: Moved a facedown card from ${data.fromRegion} to ${data.toRegion}.`,
                  m1:
                    pIdx === 1
                      ? `Ahri: Moved ${movedChampion} from ${data.fromRegion} to ${data.toRegion}.`
                      : `Ahri: Moved a facedown card from ${data.fromRegion} to ${data.toRegion}.`,
                });
              }
            }
          }
          state.pendingAbility = null;
          break;
        }
        case "I4_return": {
          // data: { cardId, fromRegion } or { skip: true }
          if (!data.skip && data.cardId && data.fromRegion) {
            const fromArr = state.regions[data.fromRegion]?.[pIdx];
            if (fromArr) {
              const cIdx = fromArr.findIndex(
                (c) => c.id === data.cardId && !c.faceUp,
              );
              if (cIdx !== -1) {
                const [returned] = fromArr.splice(cIdx, 1);
                state.hands[pIdx].push(getCardById(returned.id));
                state.extraTurn[pIdx] = true;
                const returnedChampion =
                  getCardById(returned.id)?.champion || "card";
                state.log.push({
                  m0:
                    pIdx === 0
                      ? `Yasuo: Returned ${returnedChampion} to hand. Extra turn granted!`
                      : "Yasuo: Returned a facedown card to hand. Extra turn granted!",
                  m1:
                    pIdx === 1
                      ? `Yasuo: Returned ${returnedChampion} to hand. Extra turn granted!`
                      : "Yasuo: Returned a facedown card to hand. Extra turn granted!",
                });
              }
            }
          } else {
            state.log.push(`Yasuo: Skipped returning card.`);
          }
          state.pendingAbility = null;
          break;
        }
      }

      if (!state.pendingAbility && state.abilityQueue.length > 0) {
        state.pendingAbility = state.abilityQueue.shift();
        roomManager.broadcastState(code);
        refreshTurnTimer(code, room);
        return;
      }

      // After resolving ability sequence, advance turn
      if (!state.pendingAbility) {
        advanceTurn(state, code, room);
      }
      maybePersistMatch(code, room);
      roomManager.broadcastState(code);
      refreshTurnTimer(code, room);
    });

    // REJOIN (game.html reconnects after redirect)
    socket.on("rejoinRoom", (payload) => {
      const code =
        payload && typeof payload.code === "string"
          ? payload.code.trim().toUpperCase()
          : "";
      const playerIndexRaw = payload ? payload.playerIndex : null;
      const playerIndex =
        typeof playerIndexRaw === "number"
          ? playerIndexRaw
          : parseInt(String(playerIndexRaw ?? ""), 10);

      if (playerIndex !== 0 && playerIndex !== 1) {
        return socket.emit("joinError", "Invalid player index.");
      }

      const room = rooms[code];
      if (!room)
        return socket.emit("joinError", "Room not found (may have expired).");

      const isAccount =
        socket.data.firebaseUser &&
        socket.data.firebaseUser.isAnonymous === false;

      const displayName =
        isAccount && socket.data.profileDisplayName
          ? socket.data.profileDisplayName
          : payload && typeof payload.displayName === "string"
            ? payload.displayName
            : "";
      setRoomPlayerDisplayName(room, playerIndex, displayName);
      // Cancel any pending disconnect timer for this player
      if (room.disconnectTimers?.[playerIndex]) {
        clearTimeout(room.disconnectTimers[playerIndex]);
        delete room.disconnectTimers[playerIndex];
      }
      // Re-register this socket as the player
      room.players[playerIndex] = socket.id;
      socket.join(code);
      console.log(
        `Player ${playerIndex + 1} rejoined room ${code} with socket ${socket.id}`,
      );
      if (room.state) {
        // Round intro gate: mark this side as rejoined.
        if (
          room.state.phase === "roundIntro" &&
          room.state.roundIntro &&
          Array.isArray(room.state.roundIntro.joined)
        ) {
          room.state.roundIntro.joined[playerIndex] = true;
        }

        // Re-attach UID mapping on rejoin (helps if auth arrived late).
        if (socket.data.firebaseUser && socket.data.firebaseUser.uid) {
          if (socket.data.firebaseUser.isAnonymous === false)
            setRoomPlayerUid(room, playerIndex, socket.data.firebaseUser.uid);
        }
        if (
          room.mode === "ranked" &&
          socket.data.profileStats &&
          typeof socket.data.profileStats.elo === "number"
        ) {
          setRoomPlayerElo(room, playerIndex, socket.data.profileStats.elo);
        }
        roomManager.broadcastState(code);
        scheduleRoundIntroFallback(code, room);
        refreshTurnTimer(code, room);
      }
    });

    // WITHDRAW
    socket.on("withdraw", () => {
      const found = roomManager.getRoomOfSocket(socket.id);
      if (!found) return;
      const { code, room } = found;
      const state = room.state;
      const pIdx = roomManager.playerIndexOf(room, socket.id);

      if (state.phase !== "playing") return;
      if (state.currentTurn !== pIdx)
        return socket.emit("actionError", "Not your turn.");
      if (state.withdrawn[pIdx])
        return socket.emit("actionError", "Already withdrawn.");
      if (state.pendingAbility)
        return socket.emit("actionError", "Resolve pending ability first.");

      state.withdrawn[pIdx] = true;

      // End round normally to go to roundEnd phase
      endRound(state, code, room);
      maybePersistMatch(code, room);
      roomManager.broadcastState(code);
      refreshTurnTimer(code, room);
    });

    // READY FOR NEXT ROUND
    socket.on("readyForNextRound", () => {
      const found = roomManager.getRoomOfSocket(socket.id);
      if (!found) return;
      const { code, room } = found;
      if (room.state.phase !== "roundEnd") return;
      const pIdx = roomManager.playerIndexOf(room, socket.id);
      if (pIdx > -1) {
        room.state.readyForNextRound[pIdx] = true;
        if (
          room.state.readyForNextRound[0] &&
          room.state.readyForNextRound[1]
        ) {
          room.state.initiative = 1 - room.state.initiative;
          startNewRound(room.state, { waitForRejoin: false });
        }
        roomManager.broadcastState(code);
        scheduleRoundIntroFallback(code, room);
        refreshTurnTimer(code, room);
      }
    });

    // SURRENDER
    socket.on("surrenderMatch", () => {
      const found = roomManager.getRoomOfSocket(socket.id);
      if (!found) return;
      const { code, room } = found;
      if (room.state.phase === "gameOver") return;
      const pIdx = roomManager.playerIndexOf(room, socket.id);
      if (pIdx > -1) {
        room.state.phase = "gameOver";
        room.state.surrender = true;
        room.state.winner = 1 - pIdx;
        maybePersistMatch(code, room);
        roomManager.broadcastState(code);
        refreshTurnTimer(code, room);
      }
    });

    // DISCONNECT
    socket.on("disconnect", () => {
      console.log("Disconnected:", socket.id);

      // If this socket was queued for ranked, remove it.
      removeFromRankedQueue(socket.id);

      const found = roomManager.getRoomOfSocket(socket.id);
      if (!found) return;
      const { code, room } = found;
      const playerIdx = roomManager.playerIndexOf(room, socket.id);

      if (playerIdx !== 0 && playerIdx !== 1) return;

      room.disconnectTimers = room.disconnectTimers || {};
      clearDisconnectTimer(room, playerIdx);

      const socketIdSnapshot = socket.id;

      // Lobby room (no game state yet): preserve the 10s redirect/reconnect grace.
      if (!room.state) {
        room.disconnectTimers[playerIdx] = setTimeout(() => {
          const live = rooms[code];
          if (!live) return;
          if (live.players[playerIdx] !== socketIdSnapshot) return;

          // If a match started during this grace window, switch to normal
          // disconnect-forfeit instead of deleting an active game.
          if (live.state && live.state.phase !== "gameOver") {
            scheduleDisconnectForfeit(
              code,
              live,
              playerIdx,
              socketIdSnapshot,
              Math.max(0, DISCONNECT_FORFEIT_MS - LOBBY_DISCONNECT_GRACE_MS),
            );
            refreshTurnTimer(code, live);
            return;
          }

          clearAllDisconnectTimers(live);
          clearTurnTimer(live);
          clearRoundIntroTimer(live);
          delete rooms[code];
          console.log(
            `Room ${code} removed after grace period (player ${playerIdx + 1} gone).`,
          );
        }, LOBBY_DISCONNECT_GRACE_MS);
        return;
      }

      // If the match is already over, just clean up later.
      if (room.state.phase === "gameOver") {
        room.disconnectTimers[playerIdx] = setTimeout(() => {
          const live = rooms[code];
          if (!live) return;
          if (live.players[playerIdx] !== socketIdSnapshot) return;

          clearAllDisconnectTimers(live);
          clearTurnTimer(live);
          clearRoundIntroTimer(live);
          delete rooms[code];
          console.log(`Room ${code} cleaned up after game over.`);
        }, LOBBY_DISCONNECT_GRACE_MS);
        return;
      }

      // Active match: after a longer grace period, disconnected player forfeits.
      // If BOTH players are disconnected when a forfeit would occur, the match
      // becomes "No Contest" (no persistence).
      scheduleDisconnectForfeit(code, room, playerIdx, socketIdSnapshot);

      // If the disconnect affects the currently acting player, pause the turn timer.
      refreshTurnTimer(code, room);
    });
  });
}

module.exports = {
  registerSocketHandlers,
};
