(function () {
  const rcShared = (window.rcShared = window.rcShared || {});

  function sanitizeDisplayName(raw) {
    if (typeof raw !== "string") return "";
    let name = raw.trim().replace(/\s+/g, " ");
    name = name.replace(/[^a-zA-Z0-9 _-]/g, "");
    if (name.length > 16) name = name.slice(0, 16);
    return name;
  }

  function makeInlineSpinner() {
    const el = document.createElement("span");
    el.className = "ui-spinner inline";
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function getUiBusy() {
    return window.uiBusy || null;
  }

  function busyPush(message) {
    const uiBusy = getUiBusy();
    return uiBusy ? uiBusy.push(message) : null;
  }

  function busyPop(token) {
    const uiBusy = getUiBusy();
    if (uiBusy && token != null) uiBusy.pop(token);
  }

  function busyWith(fnOrPromise, message) {
    const uiBusy = getUiBusy();
    if (uiBusy) return uiBusy.withBusy(fnOrPromise, message);
    return typeof fnOrPromise === "function"
      ? Promise.resolve().then(fnOrPromise)
      : Promise.resolve(fnOrPromise);
  }

  function isNonAnonymousAccount(user) {
    return !!(user && user.uid && user.isAnonymous === false);
  }

  async function getIdTokenSafe(user) {
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }

  function safeLocalStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeLocalStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }

  function safeSessionStorageGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeSessionStorageSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }

  function safeSessionStorageRemove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  const DISPLAY_NAME_STORAGE_KEY = "rc_displayName";
  const DISPLAY_NAME_SESSION_KEY = "rc_displayName_session";

  function generateRandomDisplayName() {
    const adjectives = [
      "Brave",
      "Swift",
      "Arcane",
      "Shadow",
      "Crimson",
      "Golden",
      "Frost",
      "Iron",
    ];
    const nouns = [
      "Fox",
      "Raven",
      "Mage",
      "Knight",
      "Wolf",
      "Tiger",
      "Eagle",
      "Dragon",
    ];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 90) + 10;
    return sanitizeDisplayName(`${adj}${noun}${num}`) || "Guest";
  }

  function getOrCreateDisplayName() {
    const fromSession = sanitizeDisplayName(
      safeSessionStorageGet(DISPLAY_NAME_SESSION_KEY) || "",
    );
    if (fromSession) return fromSession;

    const fromLocal = sanitizeDisplayName(
      safeLocalStorageGet(DISPLAY_NAME_STORAGE_KEY) || "",
    );
    if (fromLocal) {
      safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, fromLocal);
      return fromLocal;
    }

    const generated = generateRandomDisplayName();
    safeLocalStorageSet(DISPLAY_NAME_STORAGE_KEY, generated);
    safeSessionStorageSet(DISPLAY_NAME_SESSION_KEY, generated);
    return generated;
  }

  function attachFirebaseAuthToSocket(socket) {
    if (!socket || !window.firebaseAuth) return () => {};
    return window.firebaseAuth.onAuthStateChanged(async (user) => {
      if (!user) {
        socket.emit("clearAuth");
        return;
      }
      try {
        const token = await user.getIdToken();
        socket.emit("authToken", { token });
      } catch {
        // ignore
      }
    });
  }

  rcShared.sanitizeDisplayName = sanitizeDisplayName;
  rcShared.makeInlineSpinner = makeInlineSpinner;
  rcShared.busyPush = busyPush;
  rcShared.busyPop = busyPop;
  rcShared.busyWith = busyWith;
  rcShared.isNonAnonymousAccount = isNonAnonymousAccount;
  rcShared.getIdTokenSafe = getIdTokenSafe;

  rcShared.storage = rcShared.storage || {};
  rcShared.storage.safeLocalStorageGet = safeLocalStorageGet;
  rcShared.storage.safeLocalStorageSet = safeLocalStorageSet;
  rcShared.storage.safeSessionStorageGet = safeSessionStorageGet;
  rcShared.storage.safeSessionStorageSet = safeSessionStorageSet;
  rcShared.storage.safeSessionStorageRemove = safeSessionStorageRemove;

  rcShared.identity = rcShared.identity || {};
  rcShared.identity.DISPLAY_NAME_STORAGE_KEY = DISPLAY_NAME_STORAGE_KEY;
  rcShared.identity.DISPLAY_NAME_SESSION_KEY = DISPLAY_NAME_SESSION_KEY;
  rcShared.identity.generateRandomDisplayName = generateRandomDisplayName;
  rcShared.identity.getOrCreateDisplayName = getOrCreateDisplayName;

  rcShared.attachFirebaseAuthToSocket = attachFirebaseAuthToSocket;
})();
