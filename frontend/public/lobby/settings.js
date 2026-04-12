(function () {
  const rcLobby = window.rcLobby;
  if (!rcLobby || !rcLobby.el || !rcLobby.shared) return;

  const {
    btnSoundSettingsToggle,
    soundSettingsPanel,
    volumeSfx,
    volumeBackground,
    volumeVoiceline,
    volumeSfxValue,
    volumeBackgroundValue,
    volumeVoicelineValue,
  } = rcLobby.el;

  if (
    !btnSoundSettingsToggle ||
    !soundSettingsPanel ||
    !volumeSfx ||
    !volumeBackground ||
    !volumeVoiceline ||
    !volumeSfxValue ||
    !volumeBackgroundValue ||
    !volumeVoicelineValue
  ) {
    return;
  }

  const sfxApi = rcLobby.shared.sfx;
  const defaultVolumes = {
    sfx: 50,
    background: 50,
    voiceline: 50,
  };

  function clampVolumePercent(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  function readVolumes() {
    if (sfxApi && typeof sfxApi.getChannelVolume === "function") {
      return {
        sfx: clampVolumePercent(sfxApi.getChannelVolume("sfx")),
        background: clampVolumePercent(sfxApi.getChannelVolume("background")),
        voiceline: clampVolumePercent(sfxApi.getChannelVolume("voiceline")),
      };
    }

    if (sfxApi && typeof sfxApi.getSettings === "function") {
      const fromApi = sfxApi.getSettings();
      const fromVolumes =
        fromApi && fromApi.volumes && typeof fromApi.volumes === "object"
          ? fromApi.volumes
          : {};

      return {
        sfx: clampVolumePercent(
          Number.isFinite(fromVolumes.sfx)
            ? fromVolumes.sfx
            : fromApi && fromApi.sfx
              ? 50
              : 0,
        ),
        background: clampVolumePercent(
          Number.isFinite(fromVolumes.background)
            ? fromVolumes.background
            : fromApi && fromApi.background
              ? 50
              : 0,
        ),
        voiceline: clampVolumePercent(
          Number.isFinite(fromVolumes.voiceline)
            ? fromVolumes.voiceline
            : fromApi && fromApi.voiceline
              ? 50
              : 0,
        ),
      };
    }

    return { ...defaultVolumes };
  }

  function setVolumeInput(inputEl, valueEl, volume) {
    const v = clampVolumePercent(volume);
    inputEl.value = String(v);
    valueEl.textContent = `${v}%`;
  }

  function applyVolumesToInputs(volumes) {
    setVolumeInput(volumeSfx, volumeSfxValue, volumes.sfx);
    setVolumeInput(volumeBackground, volumeBackgroundValue, volumes.background);
    setVolumeInput(volumeVoiceline, volumeVoicelineValue, volumes.voiceline);
  }

  function refresh() {
    applyVolumesToInputs(readVolumes());
  }

  function setOpen(isOpen) {
    const open = !!isOpen;
    soundSettingsPanel.classList.toggle("hidden", !open);
    btnSoundSettingsToggle.setAttribute(
      "aria-expanded",
      open ? "true" : "false",
    );
  }

  function onVolumeInput(channel, inputEl, valueEl) {
    const next = clampVolumePercent(inputEl.value);
    if (sfxApi && typeof sfxApi.setChannelVolume === "function") {
      sfxApi.setChannelVolume(channel, next);
    } else if (sfxApi && typeof sfxApi.setEnabled === "function") {
      sfxApi.setEnabled(channel, next > 0);
    }
    setVolumeInput(inputEl, valueEl, next);
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

  volumeSfx.addEventListener("input", () => {
    onVolumeInput("sfx", volumeSfx, volumeSfxValue);
  });

  volumeBackground.addEventListener("input", () => {
    onVolumeInput("background", volumeBackground, volumeBackgroundValue);
  });

  volumeVoiceline.addEventListener("input", () => {
    onVolumeInput("voiceline", volumeVoiceline, volumeVoicelineValue);
  });

  window.addEventListener("storage", (event) => {
    if (
      event.key !== "rc_sound_settings" &&
      event.key !== "rc_sound_channel_volumes"
    ) {
      return;
    }
    refresh();
  });

  refresh();
  setOpen(false);

  rcLobby.settings = rcLobby.settings || {};
  rcLobby.settings.setOpen = setOpen;
  rcLobby.settings.refresh = refresh;
})();
