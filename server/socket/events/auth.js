function registerAuthEvents(socket, context) {
  const {
    verifyIdToken,
    upsertUserFromDecoded,
    getMe,
    roomManager,
    setRoomPlayerUid,
    setRoomPlayerDisplayName,
    setRoomPlayerElo,
    removeFromRankedQueue,
  } = context;

    // Firebase Auth (anonymous / Google / email-password)
    // Client sends an ID token; server verifies and attaches identity to this socket.
    socket.on("authToken", async (payload) => {
      const token =
        payload && typeof payload.token === "string" ? payload.token : "";
      if (!token) return;

      try {
        const decoded = await verifyIdToken(token);
        const provider = decoded.firebase && decoded.firebase.sign_in_provider;
        const isAnonymous = provider === "anonymous";
        socket.data.firebaseUser = {
          uid: decoded.uid,
          email: decoded.email || null,
          name: decoded.name || null,
          provider: provider || null,
          isAnonymous,
        };

        // Cached server-authoritative profile display name for authenticated accounts.
        socket.data.profileDisplayName = null;
        socket.data.profileStats = null;

        // Best-effort: create/update the server-backed player profile.
        // Guests (anonymous) must not trigger server persistence.
        if (!isAnonymous) {
          try {
            await upsertUserFromDecoded(decoded);
            const me = await getMe(decoded.uid);
            if (
              me &&
              typeof me.displayName === "string" &&
              me.displayName.trim()
            ) {
              socket.data.profileDisplayName = me.displayName.trim();
            }
            if (me && me.stats) socket.data.profileStats = me.stats;
          } catch {
            // ignore
          }
        }

        // If the socket is already associated with a room, attach the UID.
        const found = roomManager.getRoomOfSocket(socket.id);
        if (found) {
          const { code, room } = found;
          const pIdx = roomManager.playerIndexOf(room, socket.id);
          if (!isAnonymous) {
            setRoomPlayerUid(room, pIdx, decoded.uid);
          } else if (room.mode !== "ranked") {
            setRoomPlayerUid(room, pIdx, null);
          }
          if (!isAnonymous && socket.data.profileDisplayName) {
            setRoomPlayerDisplayName(
              room,
              pIdx,
              socket.data.profileDisplayName,
            );
          }
          if (
            room.mode === "ranked" &&
            !isAnonymous &&
            socket.data.profileStats &&
            typeof socket.data.profileStats.elo === "number"
          ) {
            setRoomPlayerElo(room, pIdx, socket.data.profileStats.elo);
          }

          // Push updated identity/stats into the game view ASAP.
          roomManager.broadcastState(code);
        }

        socket.emit("authOk", {
          uid: decoded.uid,
          provider: provider || null,
          isAnonymous,
        });
      } catch (err) {
        delete socket.data.firebaseUser;
        delete socket.data.profileDisplayName;
        delete socket.data.profileStats;
        socket.emit("authError", "Auth failed.");
      }
    });

    // Client-side sign-out can leave the socket connected; ensure the server
    // doesn't keep stale authenticated identity attached to this socket.
    socket.on("clearAuth", () => {
      delete socket.data.firebaseUser;
      delete socket.data.profileDisplayName;
      delete socket.data.profileStats;

      // If this socket was queued for ranked, remove it.
      removeFromRankedQueue(socket.id);

      const found = roomManager.getRoomOfSocket(socket.id);
      if (found) {
        const { room } = found;
        const pIdx = roomManager.playerIndexOf(room, socket.id);
        if (room.mode !== "ranked") setRoomPlayerUid(room, pIdx, null);
      }
    });
}

module.exports = {
  registerAuthEvents,
};
