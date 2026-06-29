const { sanitizeDisplayName } = require("../utils/sanitize");

function setRoomPlayerDisplayName(room, playerIdx, rawName) {
  if (!room || (playerIdx !== 0 && playerIdx !== 1)) return;
  const sanitized = sanitizeDisplayName(rawName);
  if (!sanitized) return;
  room.playerDisplayNames = room.playerDisplayNames || [null, null];
  room.playerDisplayNames[playerIdx] = sanitized;
}

function setRoomPlayerElo(room, playerIdx, elo) {
  if (!room || (playerIdx !== 0 && playerIdx !== 1)) return;
  const n =
    typeof elo === "number" && Number.isFinite(elo) ? Math.round(elo) : null;
  if (n === null) return;
  room.playerElos = room.playerElos || [null, null];
  room.playerElos[playerIdx] = n;
}

function setRoomPlayerUid(room, playerIdx, uid) {
  if (!room || playerIdx < 0 || playerIdx > 1) return;
  room.playerUids = room.playerUids || [null, null];
  room.playerUids[playerIdx] = uid || null;
}

module.exports = {
  setRoomPlayerDisplayName,
  setRoomPlayerElo,
  setRoomPlayerUid,
};
