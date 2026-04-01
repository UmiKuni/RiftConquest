(function () {
  const rcLobby = window.rcLobby;
  if (!rcLobby || !rcLobby.el || !rcLobby.shared) return;

  const { makeInlineSpinner } = rcLobby.shared;
  const {
    btnLeaderboardToggle,
    leaderboardFlyout,
    leaderboardList,
    btnLbPrev,
    btnLbNext,
  } = rcLobby.el;

  const leaderboardState = {
    pageSize: 10,
    pages: [{ cursor: null, startRank: 1, itemCount: 0 }],
    index: 0,
    nextCursor: null,
    loading: false,
    hasLoaded: false,
  };

  function setLeaderboardButtons() {
    if (btnLbPrev)
      btnLbPrev.disabled =
        leaderboardState.loading || leaderboardState.index <= 0;
    if (btnLbNext)
      btnLbNext.disabled =
        leaderboardState.loading || !leaderboardState.nextCursor;
  }

  function renderLeaderboardMessage(message) {
    if (!leaderboardList) return;
    leaderboardList.textContent = "";

    const empty = document.createElement("div");
    empty.className = "leaderboard-empty";

    const isLoading =
      typeof message === "string" && message.toLowerCase().includes("loading");
    if (isLoading) {
      empty.appendChild(makeInlineSpinner());
      empty.appendChild(document.createTextNode(message));
    } else {
      empty.textContent = message;
    }

    leaderboardList.appendChild(empty);
  }

  function renderLeaderboardRows(items, startRank) {
    if (!leaderboardList) return;
    leaderboardList.textContent = "";

    if (!Array.isArray(items) || items.length === 0) {
      renderLeaderboardMessage("No ranked players yet.");
      return;
    }

    items.forEach((item, idx) => {
      const rank = startRank + idx;
      const name =
        item && typeof item.displayName === "string" && item.displayName.trim()
          ? item.displayName.trim()
          : "Player";

      const eloRaw = item && typeof item.elo === "number" ? item.elo : null;
      const elo = Number.isFinite(eloRaw) ? Math.round(eloRaw) : 0;

      const matchRaw =
        item && typeof item.matchTotal === "number" ? item.matchTotal : null;
      const matchTotal =
        Number.isFinite(matchRaw) && matchRaw > 0 ? Math.floor(matchRaw) : 0;

      const row = document.createElement("div");
      row.className = "leaderboard-row";

      const rankEl = document.createElement("div");
      rankEl.className = "leaderboard-rank cinzel";
      rankEl.textContent = `#${rank}`;

      const nameEl = document.createElement("div");
      nameEl.className = "leaderboard-name";
      nameEl.textContent = name;

      const metaEl = document.createElement("div");
      metaEl.className = "leaderboard-meta";

      const eloEl = document.createElement("div");
      eloEl.className = "leaderboard-elo cinzel";
      eloEl.textContent = `ELO ${elo}`;

      const matchesEl = document.createElement("div");
      matchesEl.className = "leaderboard-matches";
      matchesEl.textContent = `${matchTotal} matches`;

      metaEl.appendChild(eloEl);
      metaEl.appendChild(matchesEl);

      row.appendChild(rankEl);
      row.appendChild(nameEl);
      row.appendChild(metaEl);

      leaderboardList.appendChild(row);
    });
  }

  async function fetchLeaderboardPage(cursor) {
    const params = new URLSearchParams();
    params.set("pageSize", String(leaderboardState.pageSize));
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`/api/leaderboard?${params.toString()}`);
    if (!res.ok) {
      let msg = "Failed to load leaderboard.";
      try {
        const data = await res.json();
        if (data && typeof data.error === "string" && data.error.trim())
          msg = data.error.trim();
      } catch {
        // ignore
      }
      throw new Error(msg);
    }

    const data = await res.json();
    return {
      items: Array.isArray(data && data.items) ? data.items : [],
      nextCursor:
        data && typeof data.nextCursor === "string" ? data.nextCursor : null,
    };
  }

  async function loadLeaderboardPageAt(index) {
    if (!leaderboardList) return;
    if (leaderboardState.loading) return;

    const page = leaderboardState.pages[index] || {
      cursor: null,
      startRank: 1,
    };

    leaderboardState.loading = true;
    setLeaderboardButtons();
    renderLeaderboardMessage("Loading…");

    try {
      const result = await fetchLeaderboardPage(page.cursor);

      const items = result.items;
      page.itemCount = Array.isArray(items) ? items.length : 0;
      leaderboardState.pages[index] = page;
      leaderboardState.nextCursor = result.nextCursor;
      leaderboardState.index = index;
      leaderboardState.hasLoaded = true;

      renderLeaderboardRows(items, page.startRank || 1);
    } catch (err) {
      const msg =
        err && typeof err.message === "string" && err.message.trim()
          ? err.message.trim()
          : "Failed to load leaderboard.";
      leaderboardState.nextCursor = null;
      renderLeaderboardMessage(msg);
    } finally {
      leaderboardState.loading = false;
      setLeaderboardButtons();
    }
  }

  function ensureLeaderboardLoaded() {
    if (leaderboardState.hasLoaded) return;
    void loadLeaderboardPageAt(leaderboardState.index);
  }

  function setLeaderboardOpen(isOpen) {
    if (!btnLeaderboardToggle || !leaderboardFlyout) return;
    btnLeaderboardToggle.setAttribute(
      "aria-expanded",
      isOpen ? "true" : "false",
    );
    leaderboardFlyout.classList.toggle("hidden", !isOpen);
    if (isOpen) ensureLeaderboardLoaded();
  }

  if (btnLeaderboardToggle) {
    btnLeaderboardToggle.addEventListener("click", () => {
      const isOpen =
        btnLeaderboardToggle.getAttribute("aria-expanded") === "true";
      setLeaderboardOpen(!isOpen);
    });
  }

  if (btnLbPrev) {
    btnLbPrev.addEventListener("click", () => {
      if (leaderboardState.loading) return;
      if (leaderboardState.index <= 0) return;
      void loadLeaderboardPageAt(leaderboardState.index - 1);
    });
  }

  if (btnLbNext) {
    btnLbNext.addEventListener("click", () => {
      if (leaderboardState.loading) return;
      if (!leaderboardState.nextCursor) return;

      const current = leaderboardState.pages[leaderboardState.index] || {
        cursor: null,
        startRank: 1,
        itemCount: 0,
      };

      const nextIndex = leaderboardState.index + 1;
      if (
        !leaderboardState.pages[nextIndex] ||
        leaderboardState.pages[nextIndex].cursor !== leaderboardState.nextCursor
      ) {
        leaderboardState.pages[nextIndex] = {
          cursor: leaderboardState.nextCursor,
          startRank: (current.startRank || 1) + (current.itemCount || 0),
          itemCount: 0,
        };
      }

      void loadLeaderboardPageAt(nextIndex);
    });
  }

  setLeaderboardButtons();

  rcLobby.leaderboard = rcLobby.leaderboard || {};
  rcLobby.leaderboard.setOpen = setLeaderboardOpen;
})();
