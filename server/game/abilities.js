const { REGIONS, getCardById } = require("./cards");
const { adjacentRegions } = require("./regions");

function hasValidFlipTargets(state, regionNames, playerIndices) {
  for (const r of regionNames) {
    for (const p of playerIndices) {
      if (state.regions[r][p].length > 0) return true;
    }
  }
  return false;
}

function applyInstantAbility(state, cardId, playerIdx, playedRegion) {
  const card = getCardById(cardId);
  if (!card || card.type !== "Instant") return { state, pendingAbility: null };

  switch (cardId) {
    case "N1": {
      // Katarina — show top card, optionally deploy facedown to adjacent
      if (state.deck.length > 0) {
        return {
          state,
          pendingAbility: {
            type: "N1_peek",
            playerIdx,
            topCard: state.deck[0],
            playedRegion,
          },
        };
      }
      break;
    }

    case "N2": {
      // Talon — flip any card on the board
      if (hasValidFlipTargets(state, REGIONS, [0, 1])) {
        return {
          state,
          pendingAbility: {
            type: "flip_any",
            playerIdx,
            label: "Talon: Flip any card on the board.",
          },
        };
      }
      state.log.push(`Talon: No valid cards to flip.`);
      break;
    }

    case "N3":
    case "D3":
    case "I3": {
      // Darius / Garen / Shen — flip a card in an adjacent region
      const adj = adjacentRegions(state, playedRegion);
      if (hasValidFlipTargets(state, adj, [0, 1])) {
        return {
          state,
          pendingAbility: {
            type: "flip_adjacent",
            playerIdx,
            sourceCard: cardId,
            playedRegion,
            label: `${card.champion}: Flip a card in an adjacent region.`,
          },
        };
      }
      state.log.push(
        `${card.champion}: No valid cards in adjacent regions to flip.`,
      );
      break;
    }

    case "N5": {
      // LeBlanc — opponent flips one of theirs, then you flip one of yours
      const oppId = 1 - playerIdx;
      if (hasValidFlipTargets(state, REGIONS, [oppId])) {
        return {
          state,
          pendingAbility: {
            type: "N5_opp_flip",
            playerIdx,
            label: "LeBlanc: Opponent must flip one of their cards.",
          },
        };
      }
      if (hasValidFlipTargets(state, REGIONS, [playerIdx])) {
        state.log.push(`LeBlanc: Opponent has no cards to flip.`);
        return {
          state,
          pendingAbility: {
            type: "N5_self_flip",
            playerIdx,
            label: "LeBlanc: Now flip one of your own cards.",
          },
        };
      }
      state.log.push(`LeBlanc: No valid cards to flip for either player.`);
      break;
    }

    case "D2": {
      // Quinn — next turn deploy to non-matching
      state.quinnEffect[playerIdx] = true;
      state.log.push(
        `Quinn: ${playerIdx === 0 ? "You" : "Opponent"} may play a card to a non-matching region next turn.`,
      );
      break;
    }

    case "I1": {
      // Ahri — move one of your cards to a different region
      if (hasValidFlipTargets(state, REGIONS, [playerIdx])) {
        return {
          state,
          pendingAbility: {
            type: "I1_move",
            playerIdx,
            label: "Ahri: Move one of your cards to a different region.",
          },
        };
      }
      state.log.push(`Ahri: No cards to move.`);
      break;
    }

    case "I4": {
      // Yasuo — return a facedown card to hand, gain extra turn
      const hasFacedown = REGIONS.some((r) => {
        const pCards = state.regions[r][playerIdx];
        return pCards.some((c) => !c.faceUp);
      });
      if (hasFacedown) {
        return {
          state,
          pendingAbility: {
            type: "I4_return",
            playerIdx,
            label:
              "Yasuo: Return a facedown card to your hand for an extra turn (or skip).",
          },
        };
      }
      state.log.push(`Yasuo: No facedown cards to return.`);
      break;
    }
  }

  return { state, pendingAbility: null };
}

function handleCardFlippedFaceUp(
  state,
  targetCard,
  targetRegion,
  targetPlayer,
) {
  const cardDef = getCardById(targetCard.id);
  if (cardDef.type !== "Instant") return;

  state.log.push(`⚡ ${cardDef.champion}'s Instant ability triggered!`);
  const result = applyInstantAbility(
    state,
    targetCard.id,
    targetPlayer,
    targetRegion,
  );
  if (result.pendingAbility) {
    state.abilityQueue.push(result.pendingAbility);
  }
}

module.exports = {
  applyInstantAbility,
  handleCardFlippedFaceUp,
  hasValidFlipTargets,
};
