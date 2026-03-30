const { CARDS } = require("./cards");

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createGameState(initiative = 0) {
  return {
    phase: "playing", // 'playing' | 'roundEnd' | 'gameOver'
    round: 0,
    currentTurn: initiative, // 0 or 1 (index of player whose turn it is)
    initiative: initiative, // who goes first next round
    scores: [0, 0],
    deck: [],
    hands: [[], []],
    withdrawn: [false, false],
    extraTurn: [false, false], // Yasuo effect
    quinnEffect: [false, false], // Quinn effect
    regions: {
      Noxus: { 0: [], 1: [] },
      Demacia: { 0: [], 1: [] },
      Ionia: { 0: [], 1: [] },
    },
    log: [],
    // Pending ability state (for multi-step abilities)
    pendingAbility: null,
    abilityQueue: [],
  };
}

function startNewRound(state) {
  const deck = shuffle([...CARDS]);
  state.hands[0] = deck.splice(0, 6);
  state.hands[1] = deck.splice(0, 6);
  state.deck = deck;

  state.regions = {
    Noxus: { 0: [], 1: [] },
    Demacia: { 0: [], 1: [] },
    Ionia: { 0: [], 1: [] },
  };

  state.withdrawn = [false, false];
  state.extraTurn = [false, false];
  state.quinnEffect = [false, false];
  state.pendingAbility = null;
  state.abilityQueue = [];

  state.currentTurn = state.initiative;
  state.round++;
  state.phase = "playing";
  state.log.push(
    `--- Round ${state.round} begins. Player ${state.initiative + 1} has initiative ---`,
  );
  return state;
}

module.exports = {
  createGameState,
  startNewRound,
};
