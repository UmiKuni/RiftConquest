(function () {
  const rcShared = (window.rcShared = window.rcShared || {});
  if (rcShared.sfx) return;

  const SOUND_SETTINGS_STORAGE_KEY = "rc_sound_settings";
  const DEFAULT_SOUND_SETTINGS = {
    sfx: true,
    background: true,
    voiceline: true,
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  const SFX_CONFIG = {
    buttonClick: {
      src: "/sounds/sfx/sfx_button_click.mp3",
      volume: 0.2,
      cooldownMs: 40,
      channel: "sfx",
    },
    countdown10: {
      src: "/sounds/sfx/sfx_10s_countdown.mp3",
      volume: 0.8,
      cooldownMs: 500,
      channel: "sfx",
    },
    findingSuccess: {
      src: "/sounds/sfx/sfx_finding_success.mp3",
      volume: 0.85,
      cooldownMs: 800,
      channel: "sfx",
    },
    cardHover: {
      src: "/sounds/sfx/sfx_card_hover.mp3",
      volume: 0.7,
      cooldownMs: 80,
      channel: "sfx",
    },
  };

  const IMPORTANT_CLICK_SFX_BUTTON_IDS = new Set([
    "btnHost",
    "btnJoin",
    "btnRankedFind",
    "btnRsContinue",
    "btnRsSurrender",
  ]);

  const sfxState = {};
  for (const name of Object.keys(SFX_CONFIG)) {
    sfxState[name] = {
      lastPlayedAt: 0,
      activeNodes: new Set(),
    };
  }

  function loadSoundSettings() {
    try {
      const raw = localStorage.getItem(SOUND_SETTINGS_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SOUND_SETTINGS };
      const parsed = JSON.parse(raw);
      const normalized = { ...DEFAULT_SOUND_SETTINGS };
      for (const key of Object.keys(DEFAULT_SOUND_SETTINGS)) {
        if (typeof parsed[key] === "boolean") {
          normalized[key] = parsed[key];
        }
      }
      return normalized;
    } catch {
      return { ...DEFAULT_SOUND_SETTINGS };
    }
  }

  function saveSoundSettings() {
    try {
      localStorage.setItem(
        SOUND_SETTINGS_STORAGE_KEY,
        JSON.stringify(soundSettings),
      );
    } catch {
      // Ignore storage write failures.
    }
  }

  const soundSettings = loadSoundSettings();

  function isKnownChannel(channel) {
    return Object.prototype.hasOwnProperty.call(
      DEFAULT_SOUND_SETTINGS,
      channel,
    );
  }

  function isEnabled(channel) {
    if (!isKnownChannel(channel)) return false;
    return !!soundSettings[channel];
  }

  function getSettings() {
    return { ...soundSettings };
  }

  function stopAll() {
    for (const name of Object.keys(sfxState)) {
      stop(name);
    }
  }

  function setEnabled(channel, enabled) {
    if (!isKnownChannel(channel)) return false;

    soundSettings[channel] = !!enabled;
    saveSoundSettings();

    if (channel === "sfx" && !soundSettings.sfx) {
      stopAll();
    }
    return true;
  }

  function preloadAll() {
    for (const cfg of Object.values(SFX_CONFIG)) {
      try {
        const audio = new Audio(cfg.src);
        audio.preload = "auto";
        audio.load();
      } catch {
        // Ignore preload errors; playback remains best-effort.
      }
    }
  }

  function stop(name) {
    const state = sfxState[name];
    if (!state || state.activeNodes.size === 0) {
      return false;
    }

    for (const node of state.activeNodes) {
      try {
        node.pause();
        node.currentTime = 0;
      } catch {
        // Ignore stop errors; this is best-effort cleanup.
      }
    }
    state.activeNodes.clear();
    return true;
  }

  function play(name, opts = {}) {
    const cfg = SFX_CONFIG[name];
    const state = sfxState[name];
    if (!cfg || !state) return false;

    const channel = cfg.channel || "sfx";
    if (!isEnabled(channel)) return false;

    if (opts.interrupt) stop(name);

    const now = Date.now();
    const cooldownMs = Number(cfg.cooldownMs) || 0;
    if (cooldownMs > 0 && now - state.lastPlayedAt < cooldownMs) {
      return false;
    }
    state.lastPlayedAt = now;

    try {
      const node = new Audio(cfg.src);
      node.preload = "auto";
      state.activeNodes.add(node);

      const cleanup = () => {
        state.activeNodes.delete(node);
      };
      node.addEventListener("ended", cleanup, { once: true });
      node.addEventListener("error", cleanup, { once: true });

      const requestedVolume =
        typeof opts.volume === "number" ? opts.volume : cfg.volume;
      node.volume = clamp(requestedVolume, 0, 1);
      if (typeof opts.playbackRate === "number" && opts.playbackRate > 0) {
        node.playbackRate = opts.playbackRate;
      }
      const playPromise = node.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          cleanup();
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  function onImportantButtonClick(event) {
    const target = event.target;
    if (!target || !target.closest) return;

    const button = target.closest("button");
    if (!button || button.disabled) return;
    if (!IMPORTANT_CLICK_SFX_BUTTON_IDS.has(button.id)) return;

    play("buttonClick");
  }

  function init() {
    preloadAll();
    document.addEventListener("click", onImportantButtonClick, {
      capture: true,
    });

    window.addEventListener("storage", (event) => {
      if (event.key !== SOUND_SETTINGS_STORAGE_KEY) return;
      const next = loadSoundSettings();
      for (const key of Object.keys(DEFAULT_SOUND_SETTINGS)) {
        soundSettings[key] = next[key];
      }
      if (!soundSettings.sfx) {
        stopAll();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  rcShared.sfx = {
    play,
    stop,
    isEnabled,
    setEnabled,
    getSettings,
  };
})();
