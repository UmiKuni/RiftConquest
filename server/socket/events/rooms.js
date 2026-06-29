function registerRoomEvents(socket, context) {
  const {
    io,
    rooms,
    roomManager,
    createGameState,
    startNewRound,
    setRoomPlayerDisplayName,
    setRoomPlayerUid,
    setRoomPlayerElo,
    isRankedEligibleSocket,
    queueRankedSocket,
    tryStartRankedMatches,
    removeFromRankedQueue,
    clearAllDisconnectTimers,
    clearTurnTimer,
    clearRoundIntroTimer,
    clearDisconnectTimer,
    scheduleRoundIntroFallback,
    beginRoundPlay,
    refreshTurnTimer,
    scheduleDisconnectForfeit,
    LOBBY_DISCONNECT_GRACE_MS,
    DISCONNECT_FORFEIT_MS,
    ALLOWED_EMOJI_REACTIONS,
    EMOJI_RATE_WINDOW_MS,
    EMOJI_RATE_MAX,
  } = context;

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

    // CANCEL HOSTED ROOM (lobby-only, before a match starts)
    socket.on("cancelHostedRoom", (payload) => {
      const found = roomManager.getRoomOfSocket(socket.id);
      if (!found) return socket.emit("joinError", "No room to cancel.");

      const { code, room } = found;
      const requestedCode =
        payload && typeof payload.code === "string"
          ? payload.code.trim().toUpperCase()
          : "";

      if (requestedCode && requestedCode !== code) {
        return socket.emit("joinError", "Room mismatch.");
      }

      const pIdx = roomManager.playerIndexOf(room, socket.id);
      if (pIdx !== 0) {
        return socket.emit("joinError", "Only host can cancel the room.");
      }

      if (room.state || room.players[1]) {
        return socket.emit("joinError", "Cannot cancel after match starts.");
      }

      clearAllDisconnectTimers(room);
      clearTurnTimer(room);
      clearRoundIntroTimer(room);

      delete rooms[code];
      socket.leave(code);
      socket.emit("roomCanceled", { code });
      console.log(`Room ${code} canceled by host ${socket.id}`);
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
}

module.exports = {
  registerRoomEvents,
};
