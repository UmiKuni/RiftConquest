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
} = require("../persistence/firestore");
const { createMatchPersistence } = require("./matchPersistence");
const { registerAbilityResponseEvents } = require("./events/abilityResponses");
const { registerAuthEvents } = require("./events/auth");
const { registerGameActionEvents } = require("./events/gameActions");
const { registerRoomEvents } = require("./events/rooms");
const {
  setRoomPlayerDisplayName,
  setRoomPlayerElo,
  setRoomPlayerUid,
} = require("./playerIdentity");
const { createRankedQueue } = require("./rankedQueue");
const { createSocketTimers } = require("./timers");

const ALLOWED_EMOJI_REACTIONS = new Set(["haha", "like", "sad"]);
const EMOJI_RATE_WINDOW_MS = 5000;
const EMOJI_RATE_MAX = 3;

function registerSocketHandlers(io, roomManager) {
  const { rooms } = roomManager;

  const { maybePersistMatch } = createMatchPersistence({
    rooms,
    roomManager,
    setRoomPlayerElo,
  });
  const timers = createSocketTimers({ rooms, roomManager, maybePersistMatch });
  const {
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
  } = timers;
  const {
    isRankedEligibleSocket,
    removeFromRankedQueue,
    queueRankedSocket,
    tryStartRankedMatches,
  } = createRankedQueue({
    io,
    roomManager,
    rooms,
    setRoomPlayerDisplayName,
    setRoomPlayerElo,
    setRoomPlayerUid,
    scheduleRoundIntroFallback,
    refreshTurnTimer,
  });

  io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    const eventContext = {
      io,
      rooms,
      roomManager,
      createGameState,
      startNewRound,
      getCardById,
      REGIONS,
      adjacentRegions,
      applyInstantAbility,
      handleCardFlippedFaceUp,
      hasValidFlipTargets,
      advanceTurn,
      endRound,
      verifyIdToken,
      upsertUserFromDecoded,
      getMe,
      maybePersistMatch,
      setRoomPlayerDisplayName,
      setRoomPlayerElo,
      setRoomPlayerUid,
      isRankedEligibleSocket,
      removeFromRankedQueue,
      queueRankedSocket,
      tryStartRankedMatches,
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
      ALLOWED_EMOJI_REACTIONS,
      EMOJI_RATE_WINDOW_MS,
      EMOJI_RATE_MAX,
    };

    registerAuthEvents(socket, eventContext);
    registerRoomEvents(socket, eventContext);
    registerGameActionEvents(socket, eventContext);
    registerAbilityResponseEvents(socket, eventContext);
  });
}

module.exports = {
  registerSocketHandlers,
};
