const CARDS = [
  {
    id: "N1",
    region: "Noxus",
    strength: 1,
    champion: "Katarina",
    type: "Instant",
    ability:
      "Look at the top card of the deck. You may play it facedown to an adjacent region.",
  },
  {
    id: "N2",
    region: "Noxus",
    strength: 2,
    champion: "Talon",
    type: "Instant",
    ability: "Flip a card in any region.",
  },
  {
    id: "N3",
    region: "Noxus",
    strength: 3,
    champion: "Darius",
    type: "Instant",
    ability: "Flip a card in an adjacent region.",
  },
  {
    id: "N4",
    region: "Noxus",
    strength: 4,
    champion: "Swain",
    type: "Ongoing",
    ability: "All cards covered by this card are now strength 4.",
  },
  {
    id: "N5",
    region: "Noxus",
    strength: 5,
    champion: "LeBlanc",
    type: "Instant",
    ability:
      "Your opponent chooses and flips 1 of their cards. Then you flip 1 of yours.",
  },
  {
    id: "N6",
    region: "Noxus",
    strength: 6,
    champion: "Draven",
    type: "None",
    ability: null,
  },
  {
    id: "D1",
    region: "Demacia",
    strength: 1,
    champion: "Lux",
    type: "Ongoing",
    ability: "You gain +3 strength in each adjacent region.",
  },
  {
    id: "D2",
    region: "Demacia",
    strength: 2,
    champion: "Quinn",
    type: "Instant",
    ability: "On your next turn, you may play a card to a non-matching region.",
  },
  {
    id: "D3",
    region: "Demacia",
    strength: 3,
    champion: "Garen",
    type: "Instant",
    ability: "Flip a card in an adjacent region.",
  },
  {
    id: "D4",
    region: "Demacia",
    strength: 4,
    champion: "Jarvan IV",
    type: "Ongoing",
    ability:
      "You may play cards of strength 3 or less to non-matching regions.",
  },
  {
    id: "D5",
    region: "Demacia",
    strength: 5,
    champion: "Fiora",
    type: "Ongoing",
    ability:
      "If either player plays a facedown card, discard that card with no effect.",
  },
  {
    id: "D6",
    region: "Demacia",
    strength: 6,
    champion: "Galio",
    type: "None",
    ability: null,
  },
  {
    id: "I1",
    region: "Ionia",
    strength: 1,
    champion: "Ahri",
    type: "Instant",
    ability: "You may move 1 of your cards to a different region.",
  },
  {
    id: "I2",
    region: "Ionia",
    strength: 2,
    champion: "Zed",
    type: "Ongoing",
    ability: "All of your facedown cards are now strength 4.",
  },
  {
    id: "I3",
    region: "Ionia",
    strength: 3,
    champion: "Shen",
    type: "Instant",
    ability: "Flip a card in an adjacent region.",
  },
  {
    id: "I4",
    region: "Ionia",
    strength: 4,
    champion: "Yasuo",
    type: "Instant",
    ability:
      "Return 1 of your facedown cards to your hand. If you do, gain an extra turn.",
  },
  {
    id: "I5",
    region: "Ionia",
    strength: 5,
    champion: "Irelia",
    type: "Ongoing",
    ability:
      "If a card is played to an adjacent region with 3+ cards already, discard it.",
  },
  {
    id: "I6",
    region: "Ionia",
    strength: 6,
    champion: "Master Yi",
    type: "None",
    ability: null,
  },
];

const REGIONS = ["Noxus", "Demacia", "Ionia"];

const WITHDRAWAL_SCORE = { 0: 6, 1: 5, 2: 4, 3: 3, 4: 2, 5: 2, 6: 2 };

function getCardById(id) {
  return CARDS.find((c) => c.id === id);
}

module.exports = {
  CARDS,
  REGIONS,
  WITHDRAWAL_SCORE,
  getCardById,
};
