const { recordMatch } = require("../persistence/firestore");

function createMatchPersistence({ rooms, roomManager, setRoomPlayerElo }) {
  function maybePersistMatch(code, room) {
    if (!room || !room.state) return;
    if (room.mode !== "ranked") return;
    if (room.state.phase !== "gameOver") return;
    if (room.matchRecorded || room.matchRecordInProgress) return;

    const winnerIndex = room.state.winner;
    if (winnerIndex !== 0 && winnerIndex !== 1) return;

    const uids = room.playerUids || [];
    if (!uids[0] || !uids[1]) return;

    const now = Date.now();
    if (
      room.matchPersistLastAttemptAt &&
      now - room.matchPersistLastAttemptAt < 10000
    ) {
      return;
    }
    room.matchPersistLastAttemptAt = now;

    room.matchRecordInProgress = true;
    void recordMatch({
      roomCode: code,
      playerUids: [uids[0], uids[1]],
      winnerIndex,
      scores: room.state.scores,
      surrendered: !!room.state.surrender,
      startedAtMs: room.matchStartedAtMs,
      endedAtMs: now,
    })
      .then((result) => {
        room.matchRecorded = true;
        room.matchId = result && result.matchId ? result.matchId : null;

        const live = rooms[code];
        if (!live || live !== room || !live.state) return;

        if (
          result &&
          Array.isArray(result.players) &&
          result.players.length === 2
        ) {
          const p0 = result.players[0] || {};
          const p1 = result.players[1] || {};

          if (Number.isFinite(p0.eloAfter)) {
            setRoomPlayerElo(live, 0, p0.eloAfter);
          }
          if (Number.isFinite(p1.eloAfter)) {
            setRoomPlayerElo(live, 1, p1.eloAfter);
          }

          live.state.rankedResult = [
            {
              eloBefore: Number.isFinite(p0.eloBefore)
                ? Math.round(p0.eloBefore)
                : null,
              eloAfter: Number.isFinite(p0.eloAfter)
                ? Math.round(p0.eloAfter)
                : null,
              delta:
                Number.isFinite(p0.eloAfter) && Number.isFinite(p0.eloBefore)
                  ? Math.round(p0.eloAfter - p0.eloBefore)
                  : null,
            },
            {
              eloBefore: Number.isFinite(p1.eloBefore)
                ? Math.round(p1.eloBefore)
                : null,
              eloAfter: Number.isFinite(p1.eloAfter)
                ? Math.round(p1.eloAfter)
                : null,
              delta:
                Number.isFinite(p1.eloAfter) && Number.isFinite(p1.eloBefore)
                  ? Math.round(p1.eloAfter - p1.eloBefore)
                  : null,
            },
          ];

          roomManager.broadcastState(code);
        }
      })
      .catch((err) => {
        console.warn(
          `[match] Persist failed for room ${code}:`,
          err && err.message ? err.message : err,
        );
      })
      .finally(() => {
        room.matchRecordInProgress = false;
      });
  }

  return { maybePersistMatch };
}

module.exports = {
  createMatchPersistence,
};
