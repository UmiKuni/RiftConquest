const { CARDS, REGIONS } = require("./cards");

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sameOrder(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
    return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function nextRegionOrder(prevOrder) {
  const base = [...REGIONS];
  let next = shuffle(base);

  if (!Array.isArray(prevOrder) || prevOrder.length !== base.length) {
    return next;
  }

  let safety = 0;
  while (sameOrder(next, prevOrder) && safety < 10) {
    next = shuffle(base);
    safety++;
  }

  if (sameOrder(next, prevOrder)) {
    // Deterministic fallback: rotate the previous order by one.
    next = [...prevOrder.slice(1), prevOrder[0]];
  }

  return next;
}

function createGameState(initiative = 0) {
  return {
    phase: "playing", // 'playing' | 'roundEnd' | 'gameOver'
    round: 0,
    currentTurn: initiative, // 0 or 1 (index of player whose turn it is)
    initiative: initiative, // who goes first next round
    scores: [0, 0],
    regionOrder: [...REGIONS],
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
  state.regionOrder = nextRegionOrder(state.regionOrder);

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
