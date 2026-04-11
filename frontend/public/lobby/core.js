(function () {
  const rcShared = window.rcShared;
  if (!rcShared) {
    console.error("[lobby] Missing rcShared; ensure rc-shared.js is loaded.");
    return;
  }

  const rcLobby = (window.rcLobby = window.rcLobby || {});
  if (rcLobby.__initialized) return;
  rcLobby.__initialized = true;

  const socket = io();

  const el = {
    // Room
    btnHost: document.getElementById("btnHost"),
    btnShowJoin: document.getElementById("btnShowJoin"),
    btnJoin: document.getElementById("btnJoin"),
    btnCancelJoin: document.getElementById("btnCancelJoin"),
    mainActions: document.getElementById("mainActions"),
    joinActions: document.getElementById("joinActions"),
    roomDisplay: document.getElementById("roomDisplay"),
    roomCodeText: document.getElementById("roomCodeText"),
    btnCopyRoomCode: document.getElementById("btnCopyRoomCode"),
    btnCancelHostedRoom: document.getElementById("btnCancelHostedRoom"),
    codeInput: document.getElementById("codeInput"),
    statusMsg: document.getElementById("statusMsg"),

    // Auth UI
    authMsg: document.getElementById("authMsg"),
    guestPanel: document.getElementById("guestPanel"),
    loginFlyout: document.getElementById("loginFlyout"),
    btnLogin: document.getElementById("btnLogin"),

    btnAccount: document.getElementById("btnAccount"),
    accountName: document.getElementById("accountName"),
    accountElo: document.getElementById("accountElo"),
    accountMenu: document.getElementById("accountMenu"),
    btnViewProfile: document.getElementById("btnViewProfile"),
    btnLogout: document.getElementById("btnLogout"),

    btnGoogleSignIn: document.getElementById("btnGoogleSignIn"),
    emailInput: document.getElementById("emailInput"),
    passwordInput: document.getElementById("passwordInput"),
    btnEmailSignIn: document.getElementById("btnEmailSignIn"),
    btnEmailSignUp: document.getElementById("btnEmailSignUp"),

    // Guest identity
    displayNameInput: document.getElementById("displayNameInput"),

    // Tabs
    tabButtons: Array.from(document.querySelectorAll(".lobby-tab")),
    tabCasual: document.getElementById("tabCasual"),
    tabRanked: document.getElementById("tabRanked"),

    // Leaderboard
    btnLeaderboardToggle: document.getElementById("btnLeaderboardToggle"),
    leaderboardFlyout: document.getElementById("leaderboardFlyout"),
    leaderboardList: document.getElementById("leaderboardList"),
    btnLbPrev: document.getElementById("btnLbPrev"),
    btnLbNext: document.getElementById("btnLbNext"),

    // Ranked
    btnRankedFind: document.getElementById("btnRankedFind"),
    btnRankedCancel: document.getElementById("btnRankedCancel"),
    rankedQueueStatus: document.getElementById("rankedQueueStatus"),
    rankedQueueTimer: document.getElementById("rankedQueueTimer"),
    rankedAuthNote: document.getElementById("rankedAuthNote"),

    // Settings
    btnSoundSettingsToggle: document.getElementById("btnSoundSettingsToggle"),
    soundSettingsPanel: document.getElementById("soundSettingsPanel"),
    toggleSfx: document.getElementById("toggleSfx"),
    toggleBackground: document.getElementById("toggleBackground"),
    toggleVoiceline: document.getElementById("toggleVoiceline"),
  };

  const state = {
    accountSummary: { displayName: "", elo: null },
  };

  function setStatus(msg, isError = false) {
    if (!el.statusMsg) return;
    el.statusMsg.textContent = msg;
    el.statusMsg.className = "status-msg" + (isError ? " error" : "");
  }

  function getFirebaseUser() {
    return window.firebaseAuth ? window.firebaseAuth.currentUser : null;
  }

  const { sanitizeDisplayName, isNonAnonymousAccount } = rcShared;
  const { safeLocalStorageSet, safeSessionStorageSet } = rcShared.storage;
  const {
    DISPLAY_NAME_STORAGE_KEY,
    DISPLAY_NAME_SESSION_KEY,
    getOrCreateDisplayName,
  } = rcShared.identity;

  function getCurrentDisplayName() {
    if (el.displayNameInput) {
      const fromInput = sanitizeDisplayName(el.displayNameInput.value);
      if (fromInput) {
        safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, fromInput);
        return fromInput;
      }
    }
    return getOrCreateDisplayName();
  }

  function getDisplayNameForGame() {
    const user = getFirebaseUser();
    if (isNonAnonymousAccount(user)) {
      const name = sanitizeDisplayName(state.accountSummary.displayName || "");
      return name || getOrCreateDisplayName();
    }
    return getCurrentDisplayName();
  }

  if (el.displayNameInput) {
    el.displayNameInput.value = getOrCreateDisplayName();

    el.displayNameInput.addEventListener("input", () => {
      const sanitized = sanitizeDisplayName(el.displayNameInput.value);
      if (sanitized) safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, sanitized);
    });

    el.displayNameInput.addEventListener("blur", () => {
      const sanitized = sanitizeDisplayName(el.displayNameInput.value);
      if (sanitized) {
        safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, sanitized);
        // Persist to localStorage only for Guest.
        const user = getFirebaseUser();
        if (!isNonAnonymousAccount(user))
          safeLocalStorageSet(DISPLAY_NAME_STORAGE_KEY, sanitized);
        el.displayNameInput.value = sanitized;
        return;
      }
      // Restore the previous stored name if the user clears it.
      el.displayNameInput.value = getOrCreateDisplayName();
    });

    el.displayNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") el.displayNameInput.blur();
    });
  }

  rcLobby.socket = socket;
  rcLobby.shared = rcShared;
  rcLobby.el = el;
  rcLobby.state = state;

  rcLobby.setStatus = setStatus;
  rcLobby.getFirebaseUser = getFirebaseUser;
  rcLobby.getCurrentDisplayName = getCurrentDisplayName;
  rcLobby.getDisplayNameForGame = getDisplayNameForGame;

  rcLobby.auth = rcLobby.auth || {};
  rcLobby.ranked = rcLobby.ranked || {};
  rcLobby.leaderboard = rcLobby.leaderboard || {};
  rcLobby.rooms = rcLobby.rooms || {};
  rcLobby.tabs = rcLobby.tabs || {};
  rcLobby.settings = rcLobby.settings || {};

  // Order-safe no-op placeholders.
  rcLobby.auth.setLoginFlyoutOpen =
    rcLobby.auth.setLoginFlyoutOpen || function () {};
  rcLobby.auth.setAuthMessage = rcLobby.auth.setAuthMessage || function () {};
  rcLobby.auth.setAccountMenuOpen =
    rcLobby.auth.setAccountMenuOpen || function () {};
  rcLobby.ranked.setAllowed = rcLobby.ranked.setAllowed || function () {};
  rcLobby.ranked.setSearching = rcLobby.ranked.setSearching || function () {};
  rcLobby.settings.setOpen = rcLobby.settings.setOpen || function () {};
  rcLobby.settings.refresh = rcLobby.settings.refresh || function () {};
})();
