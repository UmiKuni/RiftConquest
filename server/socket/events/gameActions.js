function registerGameActionEvents(socket, context) {
  const {
    roomManager,
    getCardById,
    REGIONS,
    adjacentRegions,
    applyInstantAbility,
    advanceTurn,
    endRound,
    startNewRound,
    maybePersistMatch,
    scheduleRoundIntroFallback,
    refreshTurnTimer,
  } = context;

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
}

module.exports = {
  registerGameActionEvents,
};
