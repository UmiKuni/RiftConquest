const { REGIONS, getCardById } = require("./cards");

function getRegionOrder(state) {
  const order =
    state && Array.isArray(state.regionOrder) ? state.regionOrder : null;
  if (
    order &&
    order.length === REGIONS.length &&
    REGIONS.every((r) => order.includes(r))
  ) {
    return order;
  }
  return REGIONS;
}

function adjacentRegions(state, regionName) {
  const order = getRegionOrder(state);
  const idx = order.indexOf(regionName);
  const adj = [];
  if (idx > 0) adj.push(order[idx - 1]);
  if (idx >= 0 && idx < order.length - 1) adj.push(order[idx + 1]);
  return adj;
}

function topActiveSwainIndex(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return -1;
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i];
    if (c && c.faceUp && c.id === "N4") return i;
  }
  return -1;
}

// Returns total strength for a player in a region, applying Ongoing effects
function calcStrength(state, regionName, playerIdx) {
  const myCards = state.regions[regionName][playerIdx];

  // Collect active Ongoing cards for both players across all regions
  const allOngoing = {};
  for (const r of REGIONS) {
    for (const p of [0, 1]) {
      for (const c of state.regions[r][p]) {
        if (c.faceUp && getCardById(c.id).type === "Ongoing") {
          if (!allOngoing[c.id]) {
            allOngoing[c.id] = {
              card: getCardById(c.id),
              player: p,
              region: r,
            };
          }
        }
      }
    }
  }

  const swainIdx = topActiveSwainIndex(myCards);

  let total = 0;
  for (let idx = 0; idx < myCards.length; idx++) {
    const c = myCards[idx];
    const cardDef = getCardById(c.id);
    let str = c.faceUp ? cardDef.strength : 2;

    // I2 Zed: all my facedown cards become strength 4
    const zedActive = Object.values(allOngoing).some(
      (o) => o.card.id === "I2" && o.player === playerIdx,
    );
    if (!c.faceUp && zedActive) str = 4;

    // N4 Swain: cards covered by Swain become strength 4 (Swain must be face-up)
    if (swainIdx !== -1 && idx < swainIdx) str = 4;

    total += str;
  }

  // D1 Lux: +3 in each adjacent region where Lux belongs to playerIdx
  const luxActive = Object.values(allOngoing).find(
    (o) => o.card.id === "D1" && o.player === playerIdx,
  );
  if (luxActive) {
    const luxAdj = adjacentRegions(state, luxActive.region);
    if (luxAdj.includes(regionName)) total += 3;
  }

  return total;
}

function resolveRegions(state) {
  const results = {};
  for (const r of REGIONS) {
    const s0 = calcStrength(state, r, 0);
    const s1 = calcStrength(state, r, 1);
    if (s0 > s1) results[r] = 0;
    else if (s1 > s0) results[r] = 1;
    else results[r] = null; // tie — initiative wins
  }
  return results;
}

module.exports = {
  adjacentRegions,
  calcStrength,
  resolveRegions,
};
