function registerAbilityResponseEvents(socket, context) {
  const {
    roomManager,
    getCardById,
    REGIONS,
    adjacentRegions,
    handleCardFlippedFaceUp,
    hasValidFlipTargets,
    advanceTurn,
    maybePersistMatch,
    refreshTurnTimer,
  } = context;

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
          const targetArr =
            state.regions[data.targetRegion]?.[data.targetPlayer];
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
          // data: { cardId, fromRegion, fromIndex? } or { skip: true }
          if (!data.skip && data.cardId && data.fromRegion) {
            const fromArr = state.regions[data.fromRegion]?.[pIdx];
            if (fromArr) {
              let cIdx = -1;

              const fromIndexRaw = data.fromIndex;
              const fromIndex =
                typeof fromIndexRaw === "number"
                  ? fromIndexRaw
                  : parseInt(String(fromIndexRaw ?? ""), 10);

              // Prefer exact stack index when supplied (needed for covered cards).
              if (
                Number.isInteger(fromIndex) &&
                fromIndex >= 0 &&
                fromIndex < fromArr.length
              ) {
                const atIndex = fromArr[fromIndex];
                if (atIndex && !atIndex.faceUp && atIndex.id === data.cardId) {
                  cIdx = fromIndex;
                }
              }

              // Backward-compatible fallback for older clients.
              if (cIdx === -1) {
                cIdx = fromArr.findIndex(
                  (c) => c.id === data.cardId && !c.faceUp,
                );
              }

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
}

module.exports = {
  registerAbilityResponseEvents,
};
