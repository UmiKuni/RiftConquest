(function () {
  const rcGame = (window.rcGame = window.rcGame || {});

  const CARD_DEFS = {
    N1: {
      id: "N1",
      region: "Noxus",
      strength: 1,
      champion: "Katarina",
      type: "Instant",
      ability:
        "Look at the top card of the deck. You may play it facedown to an adjacent region.",
    },
    N2: {
      id: "N2",
      region: "Noxus",
      strength: 2,
      champion: "Talon",
      type: "Instant",
      ability: "Flip a card in any region.",
    },
    N3: {
      id: "N3",
      region: "Noxus",
      strength: 3,
      champion: "Darius",
      type: "Instant",
      ability: "Flip a card in an adjacent region.",
    },
    N4: {
      id: "N4",
      region: "Noxus",
      strength: 4,
      champion: "Swain",
      type: "Ongoing",
      ability: "All cards covered by this card are now strength 4.",
    },
    N5: {
      id: "N5",
      region: "Noxus",
      strength: 5,
      champion: "LeBlanc",
      type: "Instant",
      ability:
        "Your opponent chooses and flips 1 of their cards. Then you flip 1 of yours.",
    },
    N6: {
      id: "N6",
      region: "Noxus",
      strength: 6,
      champion: "Draven",
      type: "None",
      ability: null,
    },
    D1: {
      id: "D1",
      region: "Demacia",
      strength: 1,
      champion: "Lux",
      type: "Ongoing",
      ability: "You gain +3 strength in each adjacent region.",
    },
    D2: {
      id: "D2",
      region: "Demacia",
      strength: 2,
      champion: "Quinn",
      type: "Instant",
      ability: "On your next turn, you may play a card to a non-matching region.",
    },
    D3: {
      id: "D3",
      region: "Demacia",
      strength: 3,
      champion: "Garen",
      type: "Instant",
      ability: "Flip a card in an adjacent region.",
    },
    D4: {
      id: "D4",
      region: "Demacia",
      strength: 4,
      champion: "Jarvan IV",
      type: "Ongoing",
      ability:
        "You may play cards of strength 3 or less to non-matching regions.",
    },
    D5: {
      id: "D5",
      region: "Demacia",
      strength: 5,
      champion: "Fiora",
      type: "Ongoing",
      ability:
        "If either player plays a facedown card, discard that card with no effect.",
    },
    D6: {
      id: "D6",
      region: "Demacia",
      strength: 6,
      champion: "Galio",
      type: "None",
      ability: null,
    },
    I1: {
      id: "I1",
      region: "Ionia",
      strength: 1,
      champion: "Ahri",
      type: "Instant",
      ability: "You may move 1 of your cards to a different region.",
    },
    I2: {
      id: "I2",
      region: "Ionia",
      strength: 2,
      champion: "Zed",
      type: "Ongoing",
      ability: "All of your facedown cards are now strength 4.",
    },
    I3: {
      id: "I3",
      region: "Ionia",
      strength: 3,
      champion: "Shen",
      type: "Instant",
      ability: "Flip a card in an adjacent region.",
    },
    I4: {
      id: "I4",
      region: "Ionia",
      strength: 4,
      champion: "Yasuo",
      type: "Instant",
      ability:
        "Return 1 of your facedown cards to your hand. If you do, gain an extra turn.",
    },
    I5: {
      id: "I5",
      region: "Ionia",
      strength: 5,
      champion: "Irelia",
      type: "Ongoing",
      ability:
        "If a card is played to an adjacent region with 3+ cards already, discard it.",
    },
    I6: {
      id: "I6",
      region: "Ionia",
      strength: 6,
      champion: "Master Yi",
      type: "None",
      ability: null,
    },
  };
  
  function getCardDef(id) {
    return (
      CARD_DEFS[id] || {
        id,
        champion: id,
        region: "",
        strength: 0,
        type: "None",
        ability: null,
      }
    );
  }
  
  function getCardIdByChampionName(championName) {
    const needle =
      typeof championName === "string" ? championName.trim().toLowerCase() : "";
    if (!needle) return "";
  
    for (const [id, def] of Object.entries(CARD_DEFS)) {
      if (
        typeof def?.champion === "string" &&
        def.champion.toLowerCase() === needle
      ) {
        return id;
      }
    }
    return "";
  }
  
  function getCardImagePath(cardId) {
    return `/image/${cardId}.jpg`;
  }

  rcGame.cards = {
    CARD_DEFS,
    getCardDef,
    getCardIdByChampionName,
    getCardImagePath,
  };
})();
