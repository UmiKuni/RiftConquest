(function () {
  const rcLobby = window.rcLobby;
  if (!rcLobby || !rcLobby.el || !rcLobby.shared) return;

  const { socket } = rcLobby;
  const sfx = rcLobby.shared.sfx || null;
  const {
    btnRankedFind,
    btnRankedCancel,
    rankedQueueStatus,
    rankedQueueTimer,
  } = rcLobby.el;

  let rankedAllowed = false;
  let rankedSearching = false;

  let rankedTimerInterval = null;
  let rankedSearchStartedAt = null;

  function formatMmSs(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function updateRankedTimer() {
    if (!rankedQueueTimer || !rankedSearchStartedAt) return;
    const elapsedSeconds = Math.floor(
      (Date.now() - rankedSearchStartedAt) / 1000,
    );
    rankedQueueTimer.textContent = formatMmSs(elapsedSeconds);
  }

  function startRankedTimer() {
    rankedSearchStartedAt = Date.now();
    updateRankedTimer();
    if (rankedTimerInterval) clearInterval(rankedTimerInterval);
    rankedTimerInterval = setInterval(updateRankedTimer, 1000);
  }

  function stopRankedTimer({ reset } = { reset: true }) {
    if (rankedTimerInterval) clearInterval(rankedTimerInterval);
    rankedTimerInterval = null;
    rankedSearchStartedAt = null;
    if (reset && rankedQueueTimer) rankedQueueTimer.textContent = "00:00";
  }

  function setRankedSearching(isSearching) {
    const wasSearching = rankedSearching;
    rankedSearching = !!isSearching;

    if (btnRankedFind) btnRankedFind.disabled = isSearching;
    if (btnRankedCancel)
      btnRankedCancel.classList.toggle("hidden", !isSearching);
    if (rankedQueueStatus)
      rankedQueueStatus.classList.toggle("hidden", !isSearching);

    if (rankedSearching && !wasSearching) {
      startRankedTimer();
      if (sfx && typeof sfx.playBackground === "function") {
        sfx.playBackground("backgroundFinding");
      }
    }
    if (!rankedSearching && wasSearching) {
      stopRankedTimer({ reset: true });
      if (sfx) {
        if (typeof sfx.stop === "function") {
          sfx.stop("backgroundFinding");
        } else if (typeof sfx.stopChannel === "function") {
          sfx.stopChannel("background");
        }
      }
    }

    if (btnRankedFind)
      btnRankedFind.disabled = rankedSearching || !rankedAllowed;
  }

  function setRankedAllowed(isAllowed) {
    rankedAllowed = !!isAllowed;

    if (!rankedAllowed) {
      // Force-cancel any searching UI when not eligible.
      if (rankedSearching) setRankedSearching(false);
      if (btnRankedFind) btnRankedFind.title = "Sign in to play Ranked.";
    } else {
      if (btnRankedFind) btnRankedFind.title = "";
    }

    if (btnRankedFind)
      btnRankedFind.disabled = rankedSearching || !rankedAllowed;
  }

  if (btnRankedFind) {
    btnRankedFind.addEventListener("click", () => {
      if (!rankedAllowed) {
        rcLobby.auth.setLoginFlyoutOpen(true);
        rcLobby.auth.setAuthMessage("Sign in to play Ranked.", true);
        return;
      }
      rcLobby.setStatus("");
      setRankedSearching(true);
      socket.emit("rankedFind");
    });
  }

  if (btnRankedCancel) {
    btnRankedCancel.addEventListener("click", () => {
      socket.emit("rankedCancel");
      setRankedSearching(false);
    });
  }

  // Ranked matchmaking server responses
  socket.on("rankedQueued", () => {
    // If the server accepted our queue request, ensure the UI is in searching state.
    if (!rankedSearching) setRankedSearching(true);
  });

  socket.on("rankedCanceled", () => {
    setRankedSearching(false);
  });

  socket.on("rankedError", (msg) => {
    setRankedSearching(false);
    rcLobby.setStatus(msg || "Ranked unavailable.", true);
  });

  rcLobby.ranked = rcLobby.ranked || {};
  rcLobby.ranked.setAllowed = setRankedAllowed;
  rcLobby.ranked.setSearching = setRankedSearching;
  rcLobby.ranked.isSearching = function () {
    return rankedSearching;
  };
})();
