const { asNumber } = require("../persistence/value");

const DEFAULT_ELO = 1000;
const K_FACTOR_NEW_PLAYER = 60;
const K_FACTOR_MID_PLAYER = 40;
const K_FACTOR_VETERAN = 20;
const DEFAULT_STATS = Object.freeze({
  elo: DEFAULT_ELO,
  matchTotal: 0,
  wins: 0,
});

function normalizeStats(stats) {
  const elo = asNumber(stats && stats.elo, DEFAULT_ELO);
  const matchTotal = Math.max(
    0,
    Math.floor(asNumber(stats && stats.matchTotal, 0)),
  );
  const wins = Math.max(0, Math.floor(asNumber(stats && stats.wins, 0)));
  return { elo, matchTotal, wins };
}

function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

function kFactor(matchTotal) {
  // Three-tier progression by experience:
  // new: <30 matches, mid: 30-100 matches, veteran: >100 matches.
  if (matchTotal < 30) return K_FACTOR_NEW_PLAYER;
  if (matchTotal <= 100) return K_FACTOR_MID_PLAYER;
  return K_FACTOR_VETERAN;
}

function clampRating(r) {
  return Math.max(0, Math.round(r));
}

module.exports = {
  DEFAULT_ELO,
  DEFAULT_STATS,
  normalizeStats,
  expectedScore,
  kFactor,
  clampRating,
};
