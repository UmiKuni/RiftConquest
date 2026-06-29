const { endRound } = require("../game/round");

function readDurationMs(envValue, fallbackMs, minMs, maxMs) {
  const n =
    typeof envValue === "string" && envValue.trim()
      ? parseInt(envValue, 10)
      : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  return Math.max(minMs, Math.min(maxMs, n));
}

function createSocketTimers({ rooms, roomManager, maybePersistMatch }) {
  const LOBBY_DISCONNECT_GRACE_MS = 10000;
  const TURN_TIMEOUT_MS = readDurationMs(
    process.env.TURN_TIMEOUT_MS,
    60000,
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
      if (live.players[playerIdx] !== socketIdSnapshot) return;

      const otherIdx = 1 - playerIdx;
      const bothDisconnected = !!(
        live.disconnectTimers && live.disconnectTimers[otherIdx]
      );

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

    if (state.phase !== "playing") {
      clearTurnTimer(room);
      return;
    }

    const actor = actingPlayerIndexForState(state);
    if (actor !== 0 && actor !== 1) {
      clearTurnTimer(room);
      return;
    }

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

      if (turnTimerKeyForState(live.state) !== key) return;
      if (live.state.phase !== "playing") return;

      const timedOutIdx = actingPlayerIndexForState(live.state);
      if (timedOutIdx !== 0 && timedOutIdx !== 1) return;

      if (live.disconnectTimers && live.disconnectTimers[timedOutIdx]) return;

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

  return {
    LOBBY_DISCONNECT_GRACE_MS,
    DISCONNECT_FORFEIT_MS,
    clearTurnTimer,
    clearRoundIntroTimer,
    clearDisconnectTimer,
    clearAllDisconnectTimers,
    scheduleDisconnectForfeit,
    beginRoundPlay,
    scheduleRoundIntroFallback,
    refreshTurnTimer,
  };
}

module.exports = {
  createSocketTimers,
};
