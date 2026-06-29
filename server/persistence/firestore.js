const {
  setUserDisplayName,
  upsertUserFromDecoded,
  getMe,
} = require("./users");
const { recordMatch, getMatchHistory } = require("./matches");
const { getLeaderboardPage } = require("./leaderboard");
const { decodeCursor } = require("./cursors");

module.exports = {
  upsertUserFromDecoded,
  setUserDisplayName,
  recordMatch,
  getMe,
  getMatchHistory,
  getLeaderboardPage,
  decodeCursor,
};
