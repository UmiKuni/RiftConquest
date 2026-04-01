(function () {
  const rcLobby = window.rcLobby;
  if (!rcLobby || !rcLobby.el || !rcLobby.shared) return;

  const { socket, el } = rcLobby;
  const { busyPush, busyPop, isNonAnonymousAccount } = rcLobby.shared;
  const { safeLocalStorageSet, safeSessionStorageSet } = rcLobby.shared.storage;
  const { DISPLAY_NAME_STORAGE_KEY, DISPLAY_NAME_SESSION_KEY } =
    rcLobby.shared.identity;

  let roomOpBusyToken = null;
  let roomOpBusyTimeout = null;

  function clearRoomOpBusy() {
    if (roomOpBusyTimeout) {
      clearTimeout(roomOpBusyTimeout);
      roomOpBusyTimeout = null;
    }
    if (roomOpBusyToken != null) {
      busyPop(roomOpBusyToken);
      roomOpBusyToken = null;
    }
  }

  function startRoomOpBusy(message) {
    clearRoomOpBusy();
    roomOpBusyToken = busyPush(message);
    // Never permanently block the lobby on a missing socket response.
    roomOpBusyTimeout = setTimeout(() => {
      clearRoomOpBusy();
      rcLobby.setStatus("Request timed out. Please try again.", true);
    }, 8000);
  }

  rcLobby.rooms = rcLobby.rooms || {};
  rcLobby.rooms.startBusy = startRoomOpBusy;
  rcLobby.rooms.clearBusy = clearRoomOpBusy;

  // ─── Host ───────────────────────────────────────────────────────────────
  if (el.btnHost) {
    el.btnHost.addEventListener("click", () => {
      startRoomOpBusy("Creating room…");

      const displayName = rcLobby.getDisplayNameForGame();
      safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, displayName);
      const user = rcLobby.getFirebaseUser();
      if (!isNonAnonymousAccount(user))
        safeLocalStorageSet(DISPLAY_NAME_STORAGE_KEY, displayName);
      socket.emit("hostRoom", { displayName });
      rcLobby.setStatus("Creating room…");
    });
  }

  socket.on("roomCreated", ({ code }) => {
    clearRoomOpBusy();
    if (el.mainActions) el.mainActions.classList.add("hidden");
    if (el.joinActions) el.joinActions.classList.add("hidden");
    if (el.roomDisplay) el.roomDisplay.classList.remove("hidden");
    if (el.roomCodeText) el.roomCodeText.textContent = code;
    rcLobby.setStatus("");

    // Store for redirect
    sessionStorage.setItem("roomCode", code);
    sessionStorage.setItem("playerIndex", "0");
    sessionStorage.setItem("myPlayerIndex", "0");
  });

  // ─── Join ───────────────────────────────────────────────────────────────
  if (el.btnShowJoin) {
    el.btnShowJoin.addEventListener("click", () => {
      if (el.mainActions) el.mainActions.classList.add("hidden");
      if (el.joinActions) el.joinActions.classList.remove("hidden");
      if (el.codeInput) el.codeInput.focus();
    });
  }

  if (el.btnCancelJoin) {
    el.btnCancelJoin.addEventListener("click", () => {
      clearRoomOpBusy();
      if (el.joinActions) el.joinActions.classList.add("hidden");
      if (el.mainActions) el.mainActions.classList.remove("hidden");
      rcLobby.setStatus("");
    });
  }

  if (el.codeInput) {
    el.codeInput.addEventListener("input", () => {
      el.codeInput.value = el.codeInput.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
    });
  }

  if (el.btnJoin) {
    el.btnJoin.addEventListener("click", () => {
      const code = el.codeInput ? el.codeInput.value.trim().toUpperCase() : "";
      if (code.length !== 4)
        return rcLobby.setStatus("Please enter a 4-character code.", true);

      startRoomOpBusy("Joining room…");

      const displayName = rcLobby.getDisplayNameForGame();
      safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, displayName);
      const user = rcLobby.getFirebaseUser();
      if (!isNonAnonymousAccount(user))
        safeLocalStorageSet(DISPLAY_NAME_STORAGE_KEY, displayName);

      // Store index=1 BEFORE emitting so gameStarted callback can read it
      sessionStorage.setItem("roomCode", code);
      sessionStorage.setItem("playerIndex", "1");
      socket.emit("joinRoom", { code, displayName });
      rcLobby.setStatus("Joining room…");
    });
  }

  // ─── Game Start ─────────────────────────────────────────────────────────
  socket.on("gameStarted", ({ code, playerIndex }) => {
    clearRoomOpBusy();
    const idxFromPayload =
      typeof playerIndex === "number"
        ? String(playerIndex)
        : typeof playerIndex === "string" && playerIndex.trim()
          ? playerIndex.trim()
          : null;

    const myIdx =
      idxFromPayload || sessionStorage.getItem("playerIndex") || "0";
    sessionStorage.setItem("roomCode", code);
    sessionStorage.setItem("playerIndex", myIdx);
    window.location.href = `/game.html?room=${code}&player=${myIdx}`;
  });

  // ─── Errors ─────────────────────────────────────────────────────────────
  socket.on("joinError", (msg) => {
    clearRoomOpBusy();
    rcLobby.setStatus(msg, true);
  });
})();
