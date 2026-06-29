(function () {
  const rcGame = (window.rcGame = window.rcGame || {});

  function actingPlayerIndexForTurnTimer(s) {
    if (!s) return null;
    if (s.pendingAbility) {
      if (s.pendingAbility.type === "N5_opp_flip") {
        return 1 - s.pendingAbility.playerIdx;
      }
      return s.pendingAbility.playerIdx;
    }
    return s.currentTurn;
  }

  // NOTE: This key format MUST be kept in sync with turnTimerKeyForState
  // in server/socket/timers.js - both files compute the same key independently
  // because this project intentionally has no browser build step.
  function turnTimerKeyForState(s) {
    if (!s) return "";
    const actor = actingPlayerIndexForTurnTimer(s);
    const pendingType = s.pendingAbility ? s.pendingAbility.type : "";
    const pendingPlayerIdx = s.pendingAbility ? s.pendingAbility.playerIdx : "";
    return `${s.phase}|r${s.round}|t${s.currentTurn}|a${actor}|p${pendingType}|pp${pendingPlayerIdx}`;
  }

  rcGame.timers = {
    actingPlayerIndexForTurnTimer,
    turnTimerKeyForState,
  };
})();
