(function initUiBusy() {
  const OVERLAY_ID = "uiBusyOverlay";
  const TEXT_ID = "uiBusyText";

  let nextToken = 1;
  const tokenOrder = [];
  const tokenToMessage = new Map();

  let lastActiveElement = null;

  function ensureOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) return existing;

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "ui-busy-overlay hidden";
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.tabIndex = -1;

    const panel = document.createElement("div");
    panel.className = "ui-busy-panel";

    const spinner = document.createElement("div");
    spinner.className = "ui-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const text = document.createElement("div");
    text.className = "ui-busy-text";
    text.id = TEXT_ID;
    text.textContent = "Loading…";

    panel.appendChild(spinner);
    panel.appendChild(text);
    overlay.appendChild(panel);

    document.body.appendChild(overlay);
    return overlay;
  }

  function setPageInert(isInert) {
    const overlay = ensureOverlay();
    const children = Array.from(document.body.children);

    for (const el of children) {
      if (el === overlay) continue;

      if (isInert) {
        if (el.hasAttribute("data-ui-busy-prev-inert")) continue;
        el.setAttribute(
          "data-ui-busy-prev-inert",
          el.hasAttribute("inert") ? "1" : "0",
        );
        el.setAttribute("inert", "");
      } else {
        const prev = el.getAttribute("data-ui-busy-prev-inert");
        if (prev === "0") el.removeAttribute("inert");
        el.removeAttribute("data-ui-busy-prev-inert");
      }
    }
  }

  function setOverlayMessage(message) {
    const overlay = ensureOverlay();
    const text = overlay.querySelector(`#${TEXT_ID}`);
    if (text) text.textContent = message || "Loading…";
  }

  function showOverlay(message) {
    const overlay = ensureOverlay();
    setOverlayMessage(message);

    if (overlay.classList.contains("hidden")) {
      lastActiveElement = document.activeElement;
    }

    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");

    document.body.classList.add("ui-busy-active");
    setPageInert(true);

    // Ensure focus is not left on a clickable element behind the overlay.
    try {
      overlay.focus();
    } catch {
      // ignore
    }
  }

  function hideOverlay() {
    const overlay = ensureOverlay();

    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");

    document.body.classList.remove("ui-busy-active");
    setPageInert(false);

    // Restore prior focus if possible.
    const prev = lastActiveElement;
    lastActiveElement = null;
    try {
      if (prev && typeof prev.focus === "function") prev.focus();
    } catch {
      // ignore
    }
  }

  function refresh() {
    if (tokenToMessage.size <= 0) {
      hideOverlay();
      return;
    }

    // Show the most recently pushed message that is still active.
    const lastToken = tokenOrder[tokenOrder.length - 1];
    const msg = tokenToMessage.get(lastToken) || "Loading…";
    showOverlay(msg);
  }

  function push(message) {
    const token = nextToken++;
    tokenOrder.push(token);
    tokenToMessage.set(token, message || "Loading…");
    refresh();
    return token;
  }

  function pop(token) {
    if (!tokenToMessage.has(token)) return;

    tokenToMessage.delete(token);
    const idx = tokenOrder.indexOf(token);
    if (idx !== -1) tokenOrder.splice(idx, 1);

    refresh();
  }

  function withBusy(fnOrPromise, message) {
    const token = push(message);

    let p;
    try {
      p =
        typeof fnOrPromise === "function"
          ? Promise.resolve().then(fnOrPromise)
          : Promise.resolve(fnOrPromise);
    } catch (err) {
      pop(token);
      throw err;
    }

    return p.finally(() => pop(token));
  }

  window.uiBusy = {
    push,
    pop,
    withBusy,
    isBusy: () => tokenToMessage.size > 0,
  };
})();
