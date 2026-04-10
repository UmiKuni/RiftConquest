const { WITHDRAWAL_SCORE, REGIONS } = require("./cards");
const { resolveRegions } = require("./regions");

function retreatVP(oppHandCount) {
  return WITHDRAWAL_SCORE[Math.min(oppHandCount, 6)] || 2;
}

function advanceTurn(state, code, room) {
  const pIdx = state.currentTurn;
  const oppIdx = 1 - pIdx;

  // Check for empty hands (both players)
  const bothEmpty = state.hands[0].length === 0 && state.hands[1].length === 0;

  if (bothEmpty || (state.withdrawn[0] && state.withdrawn[1])) {
    endRound(state, code, room);
    return;
  }

  // Yasuo extra turn
  if (state.extraTurn[0]) {
    state.extraTurn[0] = false;
    state.currentTurn = 0;
    state.log.push(`Player 1 gets an extra turn (Yasuo)!`);
    return;
  }
  if (state.extraTurn[1]) {
    state.extraTurn[1] = false;
    state.currentTurn = 1;
    state.log.push(`Player 2 gets an extra turn (Yasuo)!`);
    return;
  }

  // If opponent already withdrawn, stay on current player if they have cards
  if (state.withdrawn[oppIdx]) {
    if (state.hands[pIdx].length > 0) {
      state.currentTurn = pIdx;
    } else {
      endRound(state, code, room);
    }
    return;
  }

  // Normal alternating turns
  state.currentTurn = oppIdx;
}

function endRound(state, code, room) {
  state.log.push("─── ROUND END ───");

  let roundWinner = null;
  let vpScored = 0;
  let reason = "";

  if (state.withdrawn[0]) {
    roundWinner = 1;
    const p2HandCount = state.hands[1].length;
    vpScored = retreatVP(p2HandCount);
    reason = "Player 1 Retreated";
    state.log.push(
      `Player 1 retreated. Player 2 gains ${vpScored} VP (Opp. hand: ${p2HandCount}).`,
    );
  } else if (state.withdrawn[1]) {
    roundWinner = 0;
    const p1HandCount = state.hands[0].length;
    vpScored = retreatVP(p1HandCount);
    reason = "Player 2 Retreated";
    state.log.push(
      `Player 2 retreated. Player 1 gains ${vpScored} VP (Opp. hand: ${p1HandCount}).`,
    );
  } else {
    const regionResults = resolveRegions(state);
    let p1Reg = 0;
    let p2Reg = 0;

    for (const r of REGIONS) {
      if (regionResults[r] === 0) p1Reg++;
      else if (regionResults[r] === 1) p2Reg++;
    }

    if (p1Reg > p2Reg) {
      roundWinner = 0;
      vpScored = 6;
      reason = "Controlled more Regions";
      state.log.push(`Player 1 controls more regions and gains 6 VP!`);
    } else if (p2Reg > p1Reg) {
      roundWinner = 1;
      vpScored = 6;
      reason = "Controlled more Regions";
      state.log.push(`Player 2 controls more regions and gains 6 VP!`);
    } else {
      roundWinner = state.initiative;
      vpScored = 6;
      reason = "Tie breaker (Initiative)";
      state.log.push(
        `Region control tied (${p1Reg}-${p2Reg}). Player ${roundWinner + 1} wins by initiative and gains 6 VP!`,
      );
    }
  }

  state.scores[roundWinner] += vpScored;

  if (state.scores[0] >= 12 || state.scores[1] >= 12) {
    state.phase = "gameOver";
    state.winner = state.scores[0] >= 12 ? 0 : 1;
    state.log.push(`🏆 Player ${state.winner + 1} wins the game!`);
  } else {
    state.phase = "roundEnd";
    state.roundSummary = { winner: roundWinner, points: vpScored, reason };
    state.readyForNextRound = [false, false];
  }
}

module.exports = {
  retreatVP,
  advanceTurn,
  endRound,
};
