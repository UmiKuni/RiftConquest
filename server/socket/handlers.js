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
  recordMatch,
} = require("../persistence/firestore");

const ALLOWED_EMOJI_REACTIONS = new Set(["haha", "like", "sad"]);
const EMOJI_RATE_WINDOW_MS = 5000;
const EMOJI_RATE_MAX = 3;

function registerSocketHandlers(io, roomManager) {
  const { rooms } = roomManager;

  function setRoomPlayerUid(room, playerIdx, uid) {
    if (!room || playerIdx < 0 || playerIdx > 1) return;
    room.playerUids = room.playerUids || [null, null];
    room.playerUids[playerIdx] = uid || null;
  }

  function maybePersistMatch(code, room) {
    if (!room || !room.state) return;
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
        socket.data.firebaseUser = {
          uid: decoded.uid,
          email: decoded.email || null,
          name: decoded.name || null,
          provider: provider || null,
          isAnonymous: provider === "anonymous",
        };

        // Best-effort: create/update the server-backed player profile.
        void upsertUserFromDecoded(decoded).catch(() => {});

        // If the socket is already associated with a room, attach the UID.
        const found = roomManager.getRoomOfSocket(socket.id);
        if (found) {
          const { room } = found;
          const pIdx = roomManager.playerIndexOf(room, socket.id);
          setRoomPlayerUid(room, pIdx, decoded.uid);
        }

        socket.emit("authOk", {
          uid: decoded.uid,
          provider: provider || null,
          isAnonymous: provider === "anonymous",
        });
      } catch (err) {
        delete socket.data.firebaseUser;
        socket.emit("authError", "Auth failed.");
      }
    });

    // HOST
    socket.on("hostRoom", () => {
      const code = roomManager.createRoom(socket.id);
      const room = rooms[code];
      if (room && socket.data.firebaseUser && socket.data.firebaseUser.uid) {
        setRoomPlayerUid(room, 0, socket.data.firebaseUser.uid);
      }
      socket.join(code);
      socket.emit("roomCreated", { code });
      console.log(`Room ${code} created by ${socket.id}`);
    });

    // JOIN
    socket.on("joinRoom", ({ code }) => {
      const room = rooms[code];
      if (!room) return socket.emit("joinError", "Room not found.");
      if (room.players[1]) return socket.emit("joinError", "Room is full.");

      room.players[1] = socket.id;
      if (socket.data.firebaseUser && socket.data.firebaseUser.uid) {
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
      startNewRound(room.state);

      io.to(code).emit("gameStarted", { code });
      roomManager.broadcastState(code);
      console.log(`Room ${code} — game started`);
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
        state.log.push(`Fiora discards ${cardDef.champion} (facedown)!`);
        advanceTurn(state, code, room);
        maybePersistMatch(code, room);
        roomManager.broadcastState(code);
        return;
      }

      // I5 Irelia: discard if adjacent region has 3+ cards
      if (!faceDown) {
        const adjR = adjacentRegions(regionName);
        const irelia0Active = state.regions[regionName][0].some(
          (c) => c.faceUp && c.id === "I5",
        );
        const irelia1Active = state.regions[regionName][1].some(
          (c) => c.faceUp && c.id === "I5",
        );
        const iriActive = irelia0Active || irelia1Active;
        // Check if target region's adjacent has 3+ for the PLAYING player
        // Rule: if a card is played to adjacent region with 3+ cards already, discard it
        // "adjacent region" here means: the region receiving the card is adjacent to Irelia's region
        // and has 3+ cards total
        if (iriActive) {
          const iriRegion = REGIONS.find(
            (r) =>
              state.regions[r][0].some((c) => c.faceUp && c.id === "I5") ||
              state.regions[r][1].some((c) => c.faceUp && c.id === "I5"),
          );
          if (iriRegion) {
            const adjToIri = adjacentRegions(iriRegion);
            if (adjToIri.includes(regionName)) {
              const totalCards =
                state.regions[regionName][0].length +
                state.regions[regionName][1].length;
              if (totalCards >= 3) {
                state.hands[pIdx].splice(handIdx, 1);
                state.log.push(
                  `Irelia discards ${cardDef.champion} played to ${regionName}!`,
                );
                advanceTurn(state, code, room);
                maybePersistMatch(code, room);
                roomManager.broadcastState(code);
                return;
              }
            }
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
          return; // Wait for ability response
        }
      }

      advanceTurn(state, code, room);
      maybePersistMatch(code, room);
      roomManager.broadcastState(code);
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
          if (data.deploy && state.deck.length > 0 && data.regionName) {
            const topCard = state.deck.shift();

            // D5 Fiora check: discard if either player has an active Fiora
            const fioraActive = Object.values(state.regions).some(
              (r) =>
                r[1 - pIdx].some((c) => c.faceUp && c.id === "D5") ||
                r[pIdx].some((c) => c.faceUp && c.id === "D5"),
            );

            if (fioraActive) {
              state.log.push(
                `Katarina: ${pIdx === 0 ? "You" : "Opponent"} tried to deploy ${topCard.champion} facedown to ${data.regionName}, but Fiora discarded it!`,
              );
            } else {
              // Must be adjacent to Noxus (where Katarina was played)
              state.regions[data.regionName][pIdx].push({
                id: topCard.id,
                faceUp: false,
              });
              state.log.push(
                `Katarina: ${pIdx === 0 ? "You" : "Opponent"} deployed ${topCard.champion} facedown to ${data.regionName}.`,
              );
            }
          } else {
            state.log.push(
              `Katarina: ${pIdx === 0 ? "You" : "Opponent"} chose not to deploy.`,
            );
          }
          state.pendingAbility = null;
          break;
        }
        case "flip_any":
        case "flip_adjacent": {
          // data: { targetCardId, targetRegion, targetPlayer }
          const target = state.regions[data.targetRegion]?.[
            data.targetPlayer
          ]?.find((c) => c.id === data.targetCardId);
          if (target) {
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
          // Opponent is flipping one of their cards
          const target = state.regions[data.targetRegion]?.[pIdx]?.find(
            (c) => c.id === data.targetCardId,
          );
          if (target) {
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
            return;
          } else {
            state.log.push(`LeBlanc: You have no cards to flip.`);
            state.pendingAbility = null;
            break;
          }
        }
        case "N5_self_flip": {
          const target = state.regions[data.targetRegion]?.[pIdx]?.find(
            (c) => c.id === data.targetCardId,
          );
          if (target) {
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
              state.log.push(
                `Ahri: Moved ${getCardById(data.cardId)?.champion} from ${data.fromRegion} to ${data.toRegion}.`,
              );
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
                state.log.push(
                  `Yasuo: Returned ${getCardById(data.cardId)?.champion} to hand. Extra turn granted!`,
                );
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
        return;
      }

      // After resolving ability sequence, advance turn
      if (!state.pendingAbility) {
        advanceTurn(state, code, room);
      }
      maybePersistMatch(code, room);
      roomManager.broadcastState(code);
    });

    // REJOIN (game.html reconnects after redirect)
    socket.on("rejoinRoom", ({ code, playerIndex }) => {
      const room = rooms[code];
      if (!room)
        return socket.emit("joinError", "Room not found (may have expired).");
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
        // Re-attach UID mapping on rejoin (helps if auth arrived late).
        if (socket.data.firebaseUser && socket.data.firebaseUser.uid) {
          setRoomPlayerUid(room, playerIndex, socket.data.firebaseUser.uid);
        }
        roomManager.broadcastState(code);
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
          startNewRound(room.state);
        }
        roomManager.broadcastState(code);
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
      }
    });

    // DISCONNECT
    socket.on("disconnect", () => {
      console.log("Disconnected:", socket.id);
      const found = roomManager.getRoomOfSocket(socket.id);
      if (!found) return;
      const { code, room } = found;
      const playerIdx = roomManager.playerIndexOf(room, socket.id);

      // Grace period: page redirects (lobby → game.html) disconnect the lobby socket.
      // Wait 10 s before closing; rejoinRoom will cancel this timer if player reconnects.
      room.disconnectTimers = room.disconnectTimers || {};
      room.disconnectTimers[playerIdx] = setTimeout(() => {
        if (rooms[code] && rooms[code].players[playerIdx] === socket.id) {
          io.to(code).emit("opponentLeft");
          delete rooms[code];
          console.log(
            `Room ${code} removed after grace period (player ${playerIdx + 1} gone).`,
          );
        }
      }, 10000);
    });
  });
}

module.exports = {
  registerSocketHandlers,
};
