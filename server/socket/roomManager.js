function createRoomManager(io) {
  const rooms = {};

  function logEntryForPlayer(entry, playerIdx) {
    if (typeof entry === "string") return entry;
    if (!entry || typeof entry !== "object") return null;

    if (typeof entry.m0 === "string" && typeof entry.m1 === "string") {
      return playerIdx === 0 ? entry.m0 : entry.m1;
    }
    if (typeof entry.text === "string") return entry.text;
    return null;
  }

  function generateCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  function createRoom(hostSocketId, { mode = "casual" } = {}) {
    let code = generateCode();
    while (rooms[code]) code = generateCode();

    rooms[code] = {
      mode,
      players: [hostSocketId, null],
      playerUids: [null, null],
      playerDisplayNames: [null, null],
      playerElos: [null, null],
      state: null,
      disconnectTimers: {},
      matchStartedAtMs: null,
      matchRecorded: false,
      matchRecordInProgress: false,
      matchId: null,
    };

    return code;
  }

  function getRoom(code) {
    return rooms[code];
  }

  function getRoomOfSocket(socketId) {
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      if (room.players.includes(socketId)) return { code, room };
    }
    return null;
  }

  function playerIndexOf(room, socketId) {
    return room.players.indexOf(socketId);
  }

  function broadcastState(code) {
    const room = rooms[code];
    if (!room || !room.state) return;

    const playerDisplayNames = Array.isArray(room.playerDisplayNames)
      ? room.playerDisplayNames
      : [null, null];

    for (let i = 0; i < 2; i++) {
      const socketId = room.players[i];
      if (!socketId) continue;
      const oppIdx = 1 - i;

      const view = {
        ...room.state,
        myIndex: i,
        myHand: room.state.hands[i],
        opponentHandCount: room.state.hands[oppIdx].length,
        // scores is already included via ...room.state
        playerDisplayNames,
        mode: room.mode,
        ...(room.mode === "ranked" && Array.isArray(room.playerElos)
          ? { playerElos: room.playerElos }
          : {}),
      };

      // Never send hidden info
      delete view.hands;
      delete view.deck;
      delete view.abilityQueue;

      // Redact secret ability payloads for the non-owning player
      if (view.pendingAbility) {
        view.pendingAbility = { ...view.pendingAbility };
        if (
          view.pendingAbility.type === "N1_peek" &&
          view.pendingAbility.playerIdx !== i
        ) {
          delete view.pendingAbility.topCard;
        }
      }

      // Per-player log view (avoid leaking facedown card identities)
      const rawLog = Array.isArray(room.state.log) ? room.state.log : [];
      view.log = rawLog
        .map((e) => logEntryForPlayer(e, i))
        .filter((e) => typeof e === "string" && e.length > 0);

      io.to(socketId).emit("gameState", view);
    }
  }

  return {
    rooms,
    createRoom,
    getRoom,
    getRoomOfSocket,
    playerIndexOf,
    broadcastState,
  };
}

module.exports = {
  createRoomManager,
};
