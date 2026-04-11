(function () {
  const rcLobby = window.rcLobby;
  if (!rcLobby || !rcLobby.el || !rcLobby.shared) return;

  const {
    btnSoundSettingsToggle,
    soundSettingsPanel,
    toggleSfx,
    toggleBackground,
    toggleVoiceline,
  } = rcLobby.el;

  if (
    !btnSoundSettingsToggle ||
    !soundSettingsPanel ||
    !toggleSfx ||
    !toggleBackground ||
    !toggleVoiceline
  ) {
    return;
  }

  const sfxApi = rcLobby.shared.sfx;
  const defaultSettings = {
    sfx: true,
    background: true,
    voiceline: true,
  };

  function readSettings() {
    if (sfxApi && typeof sfxApi.getSettings === "function") {
      const fromApi = sfxApi.getSettings();
      return {
        sfx: !!fromApi.sfx,
        background: !!fromApi.background,
        voiceline: !!fromApi.voiceline,
      };
    }
    return { ...defaultSettings };
  }

  function applySettingsToInputs(settings) {
    toggleSfx.checked = !!settings.sfx;
    toggleBackground.checked = !!settings.background;
    toggleVoiceline.checked = !!settings.voiceline;
  }

  function refresh() {
    applySettingsToInputs(readSettings());
  }

  function setOpen(isOpen) {
    const open = !!isOpen;
    soundSettingsPanel.classList.toggle("hidden", !open);
    btnSoundSettingsToggle.setAttribute(
      "aria-expanded",
      open ? "true" : "false",
    );
  }

  function onToggleChange(channel, inputEl) {
    if (sfxApi && typeof sfxApi.setEnabled === "function") {
      sfxApi.setEnabled(channel, !!inputEl.checked);
    }
    refresh();
  }

  btnSoundSettingsToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = soundSettingsPanel.classList.contains("hidden");
    setOpen(isOpen);
  });

  soundSettingsPanel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("click", () => {
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(false);
    }
  });

  toggleSfx.addEventListener("change", () => {
    onToggleChange("sfx", toggleSfx);
  });

  toggleBackground.addEventListener("change", () => {
    onToggleChange("background", toggleBackground);
  });

  toggleVoiceline.addEventListener("change", () => {
    onToggleChange("voiceline", toggleVoiceline);
  });

  refresh();
  setOpen(false);

  rcLobby.settings = rcLobby.settings || {};
  rcLobby.settings.setOpen = setOpen;
  rcLobby.settings.refresh = refresh;
})();
