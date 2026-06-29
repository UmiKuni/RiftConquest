const { createGameState, startNewRound } = require("../game/state");

function createRankedQueue({
  io,
  roomManager,
  rooms,
  setRoomPlayerDisplayName,
  setRoomPlayerElo,
  setRoomPlayerUid,
  scheduleRoundIntroFallback,
  refreshTurnTimer,
}) {
  const rankedQueue = [];
  const rankedQueueSet = new Set();

  function isRankedEligibleSocket(sock) {
    return !!(
      sock &&
      sock.data &&
      sock.data.firebaseUser &&
      sock.data.firebaseUser.uid &&
      sock.data.firebaseUser.isAnonymous === false
    );
  }

  function removeFromRankedQueue(socketId) {
    if (!socketId || !rankedQueueSet.has(socketId)) return false;
    rankedQueueSet.delete(socketId);
    const idx = rankedQueue.indexOf(socketId);
    if (idx !== -1) rankedQueue.splice(idx, 1);
    return true;
  }

  function queueRankedSocket(sock) {
    if (!sock) return false;
    if (rankedQueueSet.has(sock.id)) return true;
    rankedQueueSet.add(sock.id);
    rankedQueue.push(sock.id);
    return true;
  }

  function startRankedMatch(sockA, sockB) {
    if (!sockA || !sockB) return;
    if (!isRankedEligibleSocket(sockA) || !isRankedEligibleSocket(sockB))
      return;

    const code = roomManager.createRoom(sockA.id, { mode: "ranked" });
    const room = rooms[code];
    if (!room) return;

    room.players[1] = sockB.id;

    setRoomPlayerUid(room, 0, sockA.data.firebaseUser.uid);
    setRoomPlayerUid(room, 1, sockB.data.firebaseUser.uid);

    const nameA =
      sockA.data.profileDisplayName ||
      (sockA.data.firebaseUser && sockA.data.firebaseUser.name) ||
      "";
    const nameB =
      sockB.data.profileDisplayName ||
      (sockB.data.firebaseUser && sockB.data.firebaseUser.name) ||
      "";

    setRoomPlayerDisplayName(room, 0, nameA);
    setRoomPlayerDisplayName(room, 1, nameB);

    if (sockA.data && sockA.data.profileStats)
      setRoomPlayerElo(room, 0, sockA.data.profileStats.elo);
    if (sockB.data && sockB.data.profileStats)
      setRoomPlayerElo(room, 1, sockB.data.profileStats.elo);

    room.matchStartedAtMs = Date.now();
    room.matchRecorded = false;
    room.matchRecordInProgress = false;
    room.matchId = null;

    sockA.join(code);
    sockB.join(code);

    const startingInitiative = Math.floor(Math.random() * 2);
    room.state = createGameState(startingInitiative);
    startNewRound(room.state, { waitForRejoin: true });

    sockA.emit("gameStarted", { code, playerIndex: 0 });
    sockB.emit("gameStarted", { code, playerIndex: 1 });

    scheduleRoundIntroFallback(code, room);
    refreshTurnTimer(code, room);
    console.log(
      `Ranked match found: Room ${code} (${sockA.id} vs ${sockB.id})`,
    );
  }

  function tryStartRankedMatches() {
    let safety = 0;
    while (rankedQueue.length >= 2 && safety < 25) {
      safety++;

      while (rankedQueue.length > 0) {
        const frontId = rankedQueue[0];
        const frontSock = io.sockets.sockets.get(frontId);
        const inRoom = !!roomManager.getRoomOfSocket(frontId);
        if (!frontSock || !isRankedEligibleSocket(frontSock) || inRoom) {
          removeFromRankedQueue(frontId);
          continue;
        }
        break;
      }

      if (rankedQueue.length < 2) return;

      const aId = rankedQueue[0];
      const sockA = io.sockets.sockets.get(aId);
      if (!sockA || !isRankedEligibleSocket(sockA)) {
        removeFromRankedQueue(aId);
        continue;
      }
      const uidA = sockA.data.firebaseUser.uid;

      let bId = null;
      for (let i = 1; i < rankedQueue.length; i++) {
        const candId = rankedQueue[i];
        const candSock = io.sockets.sockets.get(candId);
        const candInRoom = !!roomManager.getRoomOfSocket(candId);
        if (!candSock || !isRankedEligibleSocket(candSock) || candInRoom) {
          removeFromRankedQueue(candId);
          i--;
          continue;
        }
        const uidB = candSock.data.firebaseUser.uid;
        if (uidB && uidB !== uidA) {
          bId = candId;
          break;
        }
      }

      if (!bId) return;

      const sockB = io.sockets.sockets.get(bId);
      if (!sockB || !isRankedEligibleSocket(sockB)) {
        removeFromRankedQueue(bId);
        continue;
      }

      removeFromRankedQueue(bId);
      removeFromRankedQueue(aId);

      startRankedMatch(sockA, sockB);
    }
  }

  return {
    isRankedEligibleSocket,
    removeFromRankedQueue,
    queueRankedSocket,
    tryStartRankedMatches,
  };
}

module.exports = {
  createRankedQueue,
};
