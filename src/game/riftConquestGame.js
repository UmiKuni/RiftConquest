import cardData from "../../card_data.json" with { type: "json" };
import gameRule from "../../game_rule.json" with { type: "json" };

const REGION_NAMES = gameRule.regions;
const BATTLE_HAND_SIZE = gameRule.setup.handSize;
const WIN_VP = gameRule.winCondition.target;
const FACEDOWN_STRENGTH = gameRule.cardRules.faceDown.strength;
const ROUND_WIN_POINTS = gameRule.scoring.normalWin.points;
const WITHDRAW_POINTS_BY_REMAINING = gameRule.withdrawal.scoring.cardsRemaining;

const shuffle = (items) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
};

const drawBattleHands = () => {
  const deck = shuffle(cardData.cards);
  return {
    hands: {
      0: deck.slice(0, BATTLE_HAND_SIZE),
      1: deck.slice(BATTLE_HAND_SIZE, BATTLE_HAND_SIZE * 2),
    },
    deck: deck.slice(BATTLE_HAND_SIZE * 2),
  };
};

const emptyBoard = () =>
  REGION_NAMES.reduce((accumulator, region) => {
    accumulator[region] = [];
    return accumulator;
  }, {});

const shuffledRegionLine = () => shuffle(REGION_NAMES);

const randomInitiativePlayer = () => (Math.random() < 0.5 ? "0" : "1");

const getAdjacentRegions = (G, region) => {
  const index = G.regionOrder.indexOf(region);
  const adjacent = [];
  if (index > 0) adjacent.push(G.regionOrder[index - 1]);
  if (index >= 0 && index < G.regionOrder.length - 1) {
    adjacent.push(G.regionOrder[index + 1]);
  }
  return adjacent;
};

const hasFaceUpChampion = (G, playerID, champion) => {
  for (const region of REGION_NAMES) {
    const entries = G.board[region] ?? [];
    if (
      entries.some(
        (entry) =>
          entry.playerID === playerID &&
          !entry.facedown &&
          entry.card.champion === champion,
      )
    ) {
      return true;
    }
  }
  return false;
};

const anyPlayerHasChampion = (G, champion) => {
  for (const region of REGION_NAMES) {
    const entries = G.board[region] ?? [];
    if (
      entries.some(
        (entry) => !entry.facedown && entry.card.champion === champion,
      )
    ) {
      return true;
    }
  }
  return false;
};

const hasIreliaGuardingRegion = (G, targetRegion) => {
  for (const region of REGION_NAMES) {
    const entries = G.board[region] ?? [];
    const hasIreliaHere = entries.some(
      (entry) => !entry.facedown && entry.card.champion === "Irelia",
    );
    if (!hasIreliaHere) continue;
    const adjacent = getAdjacentRegions(G, region);
    if (adjacent.includes(targetRegion)) {
      return true;
    }
  }
  return false;
};

const facedownStrengthFor = (G, playerID) =>
  hasFaceUpChampion(G, playerID, "Zed") ? 4 : FACEDOWN_STRENGTH;

const registerAbilityUse = (G, region, playerID, card, timing) => {
  if (!card || !card.type || card.type === "None") return;
  if (!G.abilityLog) {
    G.abilityLog = [];
  }

  G.abilityLog.push({
    region,
    playerID,
    cardId: card.id,
    type: card.type,
    timing,
    index: G.abilityLog.length,
  });
};

const regionStrength = (G, region, playerID) => {
  const plays = G.board[region] ?? [];

  const base = plays
    .filter((entry) => entry.playerID === playerID)
    .reduce((sum, entry) => {
      if (entry.facedown) {
        return sum + facedownStrengthFor(G, playerID);
      }
      return sum + entry.card.strength;
    }, 0);

  let bonus = 0;

  // Lux: +3 strength in each adjacent region
  for (const luxRegion of REGION_NAMES) {
    const entries = G.board[luxRegion] ?? [];
    const hasLuxHere = entries.some(
      (entry) =>
        entry.playerID === playerID &&
        !entry.facedown &&
        entry.card.champion === "Lux",
    );
    if (!hasLuxHere) continue;
    const adjacent = getAdjacentRegions(G, luxRegion);
    if (adjacent.includes(region)) {
      bonus += 3;
    }
  }

  return base + bonus;
};

const scoreBattleWinner = (G) => {
  let p0 = 0;
  let p1 = 0;

  for (const region of G.regionOrder) {
    const p0Strength = regionStrength(G, region, "0");
    const p1Strength = regionStrength(G, region, "1");
    if (p0Strength > p1Strength) {
      p0 += 1;
    }
    if (p1Strength > p0Strength) {
      p1 += 1;
    }
  }

  if (p0 === p1) {
    return G.initiativePlayer;
  }
  return p0 > p1 ? "0" : "1";
};

const withdrawPoints = (remainingCards) => {
  return WITHDRAW_POINTS_BY_REMAINING[String(remainingCards)] ?? 2;
};

const otherPlayer = (playerID) => (playerID === "0" ? "1" : "0");

const computeRegionTotals = (G) => {
  const totals = {};
  for (const region of G.regionOrder) {
    totals[region] = {
      0: regionStrength(G, region, "0"),
      1: regionStrength(G, region, "1"),
    };
  }
  return totals;
};

const startNewBattle = (G, initiativePlayer) => {
  const battle = drawBattleHands();
  G.board = emptyBoard();
  G.hands = battle.hands;
  G.deck = battle.deck;
  G.regionOrder = shuffledRegionLine();
  G.abilityLog = [];
  G.initiativePlayer = initiativePlayer;
};

const resolveRound = (G, winner, points, byWithdraw) => {
  const loser = otherPlayer(winner);
  G.inSummary = true;
  G.summaryWinner = winner;
  G.summaryLoser = loser;
  G.summaryPoints = points;
  G.summaryByWithdraw = Boolean(byWithdraw);
  G.summaryRegionTotals = computeRegionTotals(G);
  G.summaryAccepted = { 0: false, 1: false };
};

export const RiftConquestGame = {
  name: "riftconquest",
  minPlayers: 2,
  maxPlayers: 2,

  setup: () => ({
    ...(() => {
      const battle = drawBattleHands();
      return {
        board: emptyBoard(),
        hands: battle.hands,
        deck: battle.deck,
        regionOrder: shuffledRegionLine(),
      };
    })(),
    scores: { 0: 0, 1: 0 },
    initiativePlayer: randomInitiativePlayer(),
    lastRoundWinner: null,
    lastRoundLoser: null,
    inSummary: false,
    summaryWinner: null,
    summaryLoser: null,
    summaryPoints: 0,
    summaryByWithdraw: false,
    summaryRegionTotals: null,
    summaryAccepted: { 0: false, 1: false },
    abilityLog: [],
    forceWinner: null,
  }),

  turn: {
    moveLimit: 1,
    order: {
      first: ({ G }) => Number(G?.initiativePlayer ?? "0"),
      next: ({ G, ctx }) => {
        const roundJustReset =
          G?.hands?.["0"]?.length === BATTLE_HAND_SIZE &&
          G?.hands?.["1"]?.length === BATTLE_HAND_SIZE;

        if (roundJustReset) {
          return Number(G.initiativePlayer ?? "0");
        }

        return (ctx.playOrderPos + 1) % 2;
      },
    },
  },

  endIf: ({ G }) => {
    if (!G?.scores) {
      return undefined;
    }

    if (G.forceWinner !== null && G.forceWinner !== undefined) {
      return { winner: G.forceWinner };
    }

    if (G.scores["0"] >= WIN_VP) {
      return { winner: "0" };
    }
    if (G.scores["1"] >= WIN_VP) {
      return { winner: "1" };
    }
    return undefined;
  },

  moves: {
    playCard: ({ G, ctx }, region, cardId, facedown = false) => {
      if (G.inSummary) return;
      if (!REGION_NAMES.includes(region)) {
        return;
      }

      const hand = G.hands[ctx.currentPlayer];
      const cardIndex = hand.findIndex((card) => card.id === cardId);
      if (cardIndex < 0) {
        return;
      }

      const card = hand[cardIndex];
      if (!facedown && card.region !== region) {
        const canOffRegion =
          card.strength <= 3 &&
          hasFaceUpChampion(G, ctx.currentPlayer, "Jarvan IV");
        if (!canOffRegion) {
          return;
        }
      }

      const targetRegionCards = G.board[region];
      const blockedByIrelia =
        hasIreliaGuardingRegion(G, region) && targetRegionCards.length >= 3;
      const fioraPunish = facedown && anyPlayerHasChampion(G, "Fiora");

      const [playedCard] = hand.splice(cardIndex, 1);

      if (blockedByIrelia || fioraPunish) {
        // Card is discarded with no effect (not placed on board)
        return;
      }

      G.board[region].push({
        playerID: ctx.currentPlayer,
        card: playedCard,
        facedown,
      });

      if (!facedown && playedCard.type && playedCard.type !== "None") {
        const timing = playedCard.type === "Instant" ? "instant" : "ongoing";
        registerAbilityUse(G, region, ctx.currentPlayer, playedCard, timing);

        if (playedCard.champion === "Katarina" && G.deck && G.deck.length > 0) {
          const adjacentRegions = getAdjacentRegions(G, region);
          if (adjacentRegions.length > 0) {
            const targetRegion = adjacentRegions[0];
            const targetRegionCards = G.board[targetRegion] ?? [];
            const blockedByIrelia =
              hasIreliaGuardingRegion(G, targetRegion) &&
              targetRegionCards.length >= 3;
            const fioraPunish = anyPlayerHasChampion(G, "Fiora");

            if (!blockedByIrelia && !fioraPunish) {
              const topCard = G.deck[0];
              if (topCard) {
                G.deck.shift();
                G.board[targetRegion].push({
                  playerID: ctx.currentPlayer,
                  card: topCard,
                  facedown: true,
                });
              }
            }
          }
        }
      }

      const battleOver = G.hands["0"].length === 0 && G.hands["1"].length === 0;
      if (!battleOver) {
        return;
      }

      const winner = scoreBattleWinner(G);
      resolveRound(G, winner, ROUND_WIN_POINTS, false);
    },

    withdraw: ({ G, ctx }) => {
      if (G.inSummary) return;
      const playerID = ctx.currentPlayer;
      const opponent = otherPlayer(playerID);
      const points = withdrawPoints(G.hands[playerID].length);
      resolveRound(G, opponent, points, true);
    },

    acceptSummary: ({ G, ctx }) => {
      if (!G.inSummary || G.summaryWinner === null) return;

      if (!G.summaryAccepted) {
        G.summaryAccepted = { 0: false, 1: false };
      }

      const playerID = ctx.currentPlayer;
      G.summaryAccepted[playerID] = true;

      if (!G.summaryAccepted["0"] || !G.summaryAccepted["1"]) {
        return;
      }

      const winner = G.summaryWinner;
      const loser = G.summaryLoser;
      const points = G.summaryPoints;

      G.scores[winner] += points;
      G.lastRoundWinner = winner;
      G.lastRoundLoser = loser;

      G.inSummary = false;
      G.summaryWinner = null;
      G.summaryLoser = null;
      G.summaryPoints = 0;
      G.summaryByWithdraw = false;
      G.summaryRegionTotals = null;
      G.summaryAccepted = { 0: false, 1: false };

      if (G.scores[winner] < WIN_VP) {
        startNewBattle(G, loser);
      }
    },

    surrenderGame: ({ G, ctx }) => {
      const playerID = ctx.currentPlayer;
      const opponent = otherPlayer(playerID);
      G.forceWinner = opponent;
    },
  },
};

export { REGION_NAMES, WIN_VP };
