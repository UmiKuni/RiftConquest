(function () {
  const rcLobby = window.rcLobby;
  if (!rcLobby || !rcLobby.el || !rcLobby.shared) return;

  const { socket, el } = rcLobby;
  const accountSummary = rcLobby.state.accountSummary;

  const {
    busyWith,
    makeInlineSpinner,
    sanitizeDisplayName,
    isNonAnonymousAccount,
    getIdTokenSafe,
  } = rcLobby.shared;

  const { safeSessionStorageRemove } = rcLobby.shared.storage;
  const { DISPLAY_NAME_SESSION_KEY, getOrCreateDisplayName } =
    rcLobby.shared.identity;

  function setAuthMessage(msg, isError = false) {
    if (!el.authMsg) return;
    if (!msg) {
      el.authMsg.textContent = "";
      el.authMsg.classList.add("hidden");
      el.authMsg.classList.remove("error");
      return;
    }
    el.authMsg.textContent = msg;
    el.authMsg.classList.toggle("error", !!isError);
    el.authMsg.classList.remove("hidden");
  }

  function humanizeAuthError(err) {
    const code = err && typeof err.code === "string" ? err.code : "";
    switch (code) {
      case "auth/popup-closed-by-user":
        return "Sign-in popup was closed.";
      case "auth/wrong-password":
        return "Wrong password.";
      case "auth/user-not-found":
        return "No account found for that email.";
      case "auth/email-already-in-use":
        return "That email is already in use.";
      case "auth/invalid-email":
        return "Invalid email address.";
      case "auth/weak-password":
        return "Password is too weak.";
      default:
        return "Authentication failed.";
    }
  }

  function setLoginFlyoutOpen(isOpen) {
    if (!el.btnLogin || !el.loginFlyout) return;
    el.btnLogin.setAttribute("aria-expanded", isOpen ? "true" : "false");
    el.loginFlyout.classList.toggle("hidden", !isOpen);
    if (!isOpen) setAuthMessage("");
  }

  function setAccountMenuOpen(isOpen) {
    if (!el.btnAccount || !el.accountMenu) return;
    el.btnAccount.setAttribute("aria-expanded", isOpen ? "true" : "false");
    el.accountMenu.classList.toggle("hidden", !isOpen);
  }

  function setAuthUiState({ isAccount }) {
    const showAccount = !!isAccount;
    if (el.guestPanel) el.guestPanel.classList.toggle("hidden", showAccount);
    if (el.btnLogin) el.btnLogin.classList.toggle("hidden", showAccount);
    if (el.loginFlyout) el.loginFlyout.classList.toggle("hidden", true);
    if (el.btnAccount) el.btnAccount.classList.toggle("hidden", !showAccount);
    if (!showAccount) setAccountMenuOpen(false);
  }

  function setAccountSummaryLoading(isLoading) {
    const loading = !!isLoading;
    if (el.btnAccount) el.btnAccount.disabled = loading;
    if (loading) setAccountMenuOpen(false);

    if (el.accountElo && loading) {
      el.accountElo.textContent = "";
      el.accountElo.appendChild(makeInlineSpinner());
      el.accountElo.appendChild(document.createTextNode("…"));
    }
  }

  async function syncAccountProfile(user) {
    if (!isNonAnonymousAccount(user)) return;
    setAccountSummaryLoading(true);
    try {
      const token = await getIdTokenSafe(user);
      if (!token) return;

      try {
        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const me = data && data.me ? data.me : null;
        const name =
          me && typeof me.displayName === "string"
            ? sanitizeDisplayName(me.displayName)
            : "";
        const elo =
          me &&
          me.stats &&
          typeof me.stats.elo === "number" &&
          Number.isFinite(me.stats.elo)
            ? Math.round(me.stats.elo)
            : null;

        if (name) accountSummary.displayName = name;
        if (elo !== null) accountSummary.elo = elo;
      } catch {
        // ignore
      }
    } finally {
      setAccountSummaryLoading(false);
      const name = sanitizeDisplayName(accountSummary.displayName || "");
      if (el.accountName) el.accountName.textContent = name || "Player";
      if (el.accountElo)
        el.accountElo.textContent =
          accountSummary.elo !== null ? String(accountSummary.elo) : "----";
    }
  }

  rcLobby.auth = rcLobby.auth || {};
  rcLobby.auth.setAuthMessage = setAuthMessage;
  rcLobby.auth.setLoginFlyoutOpen = setLoginFlyoutOpen;
  rcLobby.auth.setAccountMenuOpen = setAccountMenuOpen;
  rcLobby.auth.setAuthUiState = setAuthUiState;
  rcLobby.auth.syncAccountProfile = syncAccountProfile;

  // ─── Auth init ─────────────────────────────────────────────────────────────
  if (el.btnLogin) {
    el.btnLogin.addEventListener("click", () => {
      const isOpen = el.btnLogin.getAttribute("aria-expanded") === "true";
      setLoginFlyoutOpen(!isOpen);
    });
  }

  if (el.btnGoogleSignIn) {
    el.btnGoogleSignIn.addEventListener("click", async () => {
      setAuthMessage("");
      if (!window.firebaseAuth || !window.firebase) {
        setAuthMessage("Auth unavailable.", true);
        return;
      }

      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await busyWith(
          window.firebaseAuth.signInWithPopup(provider),
          "Signing in…",
        );
      } catch (err) {
        setAuthMessage(humanizeAuthError(err), true);
      }
    });
  }

  if (el.btnEmailSignIn) {
    el.btnEmailSignIn.addEventListener("click", async () => {
      setAuthMessage("");
      if (!window.firebaseAuth) {
        setAuthMessage("Auth unavailable.", true);
        return;
      }

      const email = el.emailInput
        ? String(el.emailInput.value || "").trim()
        : "";
      const password = el.passwordInput
        ? String(el.passwordInput.value || "")
        : "";
      if (!email || !password) {
        setAuthMessage("Enter email + password.", true);
        return;
      }

      try {
        await busyWith(
          window.firebaseAuth.signInWithEmailAndPassword(email, password),
          "Signing in…",
        );
      } catch (err) {
        setAuthMessage(humanizeAuthError(err), true);
      }
    });
  }

  if (el.btnEmailSignUp) {
    el.btnEmailSignUp.addEventListener("click", async () => {
      setAuthMessage("");
      if (!window.firebaseAuth) {
        setAuthMessage("Auth unavailable.", true);
        return;
      }

      const email = el.emailInput
        ? String(el.emailInput.value || "").trim()
        : "";
      const password = el.passwordInput
        ? String(el.passwordInput.value || "")
        : "";
      if (!email || !password) {
        setAuthMessage("Enter email + password.", true);
        return;
      }

      try {
        await busyWith(
          window.firebaseAuth.createUserWithEmailAndPassword(email, password),
          "Creating account…",
        );
      } catch (err) {
        setAuthMessage(humanizeAuthError(err), true);
      }
    });
  }

  if (el.btnLogout) {
    el.btnLogout.addEventListener("click", async () => {
      setAuthMessage("");
      if (!window.firebaseAuth) return;

      try {
        await busyWith(
          (async () => {
            await window.firebaseAuth.signOut();
            // Return to Guest mode immediately.
            await window.firebaseAuth.signInAnonymously();
          })(),
          "Signing out…",
        );
      } catch {
        setAuthMessage("Sign out failed.", true);
      }
    });
  }

  if (el.btnAccount) {
    el.btnAccount.addEventListener("click", () => {
      const isOpen = el.btnAccount.getAttribute("aria-expanded") === "true";
      setAccountMenuOpen(!isOpen);
    });
    el.btnAccount.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const isOpen = el.btnAccount.getAttribute("aria-expanded") === "true";
        setAccountMenuOpen(!isOpen);
      }
    });
  }

  if (el.btnViewProfile) {
    el.btnViewProfile.addEventListener("click", () => {
      setAccountMenuOpen(false);
      window.location.href = "/profile.html";
    });
  }

  document.addEventListener("click", (e) => {
    const target = e.target;
    const withinLogin =
      (el.btnLogin && el.btnLogin.contains(target)) ||
      (el.loginFlyout && el.loginFlyout.contains(target));
    if (!withinLogin) setLoginFlyoutOpen(false);

    const withinAccount =
      (el.btnAccount && el.btnAccount.contains(target)) ||
      (el.accountMenu && el.accountMenu.contains(target));
    if (!withinAccount) setAccountMenuOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      setLoginFlyoutOpen(false);
      setAccountMenuOpen(false);
    }
  });

  // Keep UI + Socket identity in sync with Firebase Auth.
  if (window.firebaseAuth) {
    window.firebaseAuth.onAuthStateChanged(async (user) => {
      setAuthMessage("");

      const isAccount = isNonAnonymousAccount(user);

      setAuthUiState({ isAccount });

      rcLobby.ranked.setAllowed(isAccount);

      if (isAccount) {
        void syncAccountProfile(user);
        setLoginFlyoutOpen(false);
      }

      // If we return to Guest mode, restore the per-tab name from localStorage.
      if (!isAccount) {
        safeSessionStorageRemove(DISPLAY_NAME_SESSION_KEY);
        if (el.displayNameInput)
          el.displayNameInput.value = getOrCreateDisplayName();
        accountSummary.displayName = "";
        accountSummary.elo = null;
        if (el.accountName) el.accountName.textContent = "Player";
        if (el.accountElo) el.accountElo.textContent = "----";
      }

      // Keep server-side socket identity in sync with Firebase Auth.
      // This prevents stale server identity when a user signs out.
      if (!user) {
        socket.emit("clearAuth");
        return;
      }

      const token = await getIdTokenSafe(user);
      if (token) socket.emit("authToken", { token });
    });
  } else {
    setAuthUiState({ isAccount: false });
    rcLobby.ranked.setAllowed(false);
  }
})();
