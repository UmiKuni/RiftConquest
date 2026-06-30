const NAV_ITEMS = [
  { path: "/home", label: "Home" },
  { path: "/news", label: "News" },
  { path: "/how-to-play", label: "How To Play" },
  { path: "/cards", label: "Cards" },
];

function shellHtml({ activePath, content }) {
  return `
    <div class="app-shell">
      <header class="app-topbar">
        <button class="app-brand cinzel" type="button" data-nav="/home">
          RiftConquest
        </button>
        <nav class="app-nav" aria-label="Primary">
          ${NAV_ITEMS.map(
            (item) => `
              <button
                class="app-nav-link${activePath === item.path ? " active" : ""}"
                type="button"
                data-nav="${item.path}"
              >
                ${item.label}
              </button>
            `,
          ).join("")}
        </nav>
        <button class="btn btn-primary app-play-btn" type="button" data-nav="/play">
          <span class="mdi mdi-sword-cross ui-icon" aria-hidden="true"></span>
          <span>Play</span>
        </button>
      </header>
      <main class="app-main">
        ${content}
      </main>
    </div>
  `;
}

function updateShellActivePath(root, activePath) {
  root.querySelectorAll(".app-nav-link").forEach((button) => {
    button.classList.toggle(
      "active",
      button.getAttribute("data-nav") === activePath,
    );
  });
}

export function renderShell(root, { activePath, content }) {
  const shell = root.querySelector(":scope > .app-shell");
  const main = shell ? shell.querySelector(".app-main") : null;

  if (shell && main) {
    updateShellActivePath(root, activePath);
    main.innerHTML = content;
    return;
  }

  root.innerHTML = shellHtml({ activePath, content });
}

export function bindShellNavigation(root, navigate) {
  root.querySelectorAll("[data-nav]").forEach((el) => {
    el.onclick = () => {
      const path = el.getAttribute("data-nav");
      if (path) navigate(path);
    };
  });
}
