(function () {
  const rcLobby = window.rcLobby;
  if (!rcLobby || !rcLobby.el) return;

  const { tabButtons, tabCasual, tabRanked } = rcLobby.el;
  const tabPanels = {
    casual: tabCasual,
    ranked: tabRanked,
  };

  function setActiveTab(tabKey) {
    for (const btn of tabButtons) {
      const isActive = btn.getAttribute("data-tab") === tabKey;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    }

    for (const [key, panel] of Object.entries(tabPanels)) {
      if (!panel) continue;
      panel.classList.toggle("hidden", key !== tabKey);
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-tab");
      if (!key) return;
      setActiveTab(key);
    });
  });

  rcLobby.tabs = rcLobby.tabs || {};
  rcLobby.tabs.setActiveTab = setActiveTab;

  // Default tab
  setActiveTab("casual");
})();
