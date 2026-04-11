(function () {
  const rcShared = (window.rcShared = window.rcShared || {});
  if (rcShared.sfx) return;

  const SOUND_SETTINGS_STORAGE_KEY = "rc_sound_settings";
  const DEFAULT_SOUND_SETTINGS = {
    sfx: true,
    background: true,
    voiceline: true,
  };
  const BACKGROUND_FADE_OUT_MS = 180;
  const BACKGROUND_FADE_IN_MS = 220;
  const BACKGROUND_MAX_VOLUME = 0.24;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function capChannelVolume(channel, volume) {
    const normalized = clamp(Number(volume) || 0, 0, 1);
    if (channel === "background") {
      return Math.min(normalized, BACKGROUND_MAX_VOLUME);
    }
    return normalized;
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
    playingCard: {
      src: "/sounds/sfx/sfx_playing_card.mp3",
      volume: 0.78,
      cooldownMs: 120,
      channel: "sfx",
    },
    voicelineD1: {
      src: "/sounds/voiceline/D1/Lux_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineD2: {
      src: "/sounds/voiceline/D2/Quinn_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineD3: {
      src: "/sounds/voiceline/D3/Garen_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineD4: {
      src: "/sounds/voiceline/D4/Jarvan_IV_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineD5: {
      src: "/sounds/voiceline/D5/Fiora_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineD6: {
      src: "/sounds/voiceline/D6/Galio_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineI1: {
      src: "/sounds/voiceline/I1/Ahri_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineI2: {
      src: "/sounds/voiceline/I2/Zed_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineI3: {
      src: "/sounds/voiceline/I3/Shen_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineI4: {
      src: "/sounds/voiceline/I4/Yasuo_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineI5: {
      src: "/sounds/voiceline/I5/Irelia_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineI6: {
      src: "/sounds/voiceline/I6/Master_Yi_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineN1: {
      src: "/sounds/voiceline/N1/Katarina_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineN2: {
      src: "/sounds/voiceline/N2/Talon_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineN3: {
      src: "/sounds/voiceline/N3/Darius_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineN4: {
      src: "/sounds/voiceline/N4/Swain_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineN5: {
      src: "/sounds/voiceline/N5/LeBlanc_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    voicelineN6: {
      src: "/sounds/voiceline/N6/Draven_Select.ogg",
      volume: 0.7,
      cooldownMs: 120,
      channel: "voiceline",
    },
    backgroundFinding: {
      src: "/sounds/background/background_finding.mp3",
      volume: 0.34,
      cooldownMs: 0,
      channel: "background",
      loop: true,
    },
    backgroundIngame1H: {
      src: "/sounds/background/background_ingame1_H.mp3",
      volume: 0.34,
      cooldownMs: 0,
      channel: "background",
      loop: true,
    },
    backgroundIngame2H: {
      src: "/sounds/background/background_ingame2_H.mp3",
      volume: 0.34,
      cooldownMs: 0,
      channel: "background",
      loop: true,
    },
    backgroundIngame3L: {
      src: "/sounds/background/background_ingame3_L.mp3",
      volume: 0.34,
      cooldownMs: 0,
      channel: "background",
      loop: true,
    },
    backgroundIngame4L: {
      src: "/sounds/background/background_ingame4_L.mp3",
      volume: 0.34,
      cooldownMs: 0,
      channel: "background",
      loop: true,
    },
    backgroundIngame5L: {
      src: "/sounds/background/background_ingame5_L.mp3",
      volume: 0.34,
      cooldownMs: 0,
      channel: "background",
      loop: true,
    },
    backgroundIngame6L: {
      src: "/sounds/background/background_ingame6_L.mp3",
      volume: 0.34,
      cooldownMs: 0,
      channel: "background",
      loop: true,
    },
    backgroundIngame7H: {
      src: "/sounds/background/background_ingame7_H.mp3",
      volume: 0.34,
      cooldownMs: 0,
      channel: "background",
      loop: true,
    },
    backgroundIngame8H: {
      src: "/sounds/background/background_ingame8_H.mp3",
      volume: 0.34,
      cooldownMs: 0,
      channel: "background",
      loop: true,
    },
    backgroundIngame9L: {
      src: "/sounds/background/background_ingame9_L.mp3",
      volume: 0.34,
      cooldownMs: 0,
      channel: "background",
      loop: true,
    },
    backgroundIngame10H: {
      src: "/sounds/background/background_ingame10_H.mp3",
      volume: 0.34,
      cooldownMs: 0,
      channel: "background",
      loop: true,
    },
    backgroundIngame11L: {
      src: "/sounds/background/background_ingame11_L.mp3",
      volume: 0.34,
      cooldownMs: 0,
      channel: "background",
      loop: true,
    },
    backgroundIngame12H: {
      src: "/sounds/background/background_ingame12_H.mp3",
      volume: 0.34,
      cooldownMs: 0,
      channel: "background",
      loop: true,
    },
  };

  const IMPORTANT_CLICK_SFX_BUTTON_IDS = new Set([
    "btnHost",
    "btnJoin",
    "btnRankedFind",
    "btnRsContinue",
    "btnRsSurrender",
    "btnShowJoin",
    "btnCancelHostedRoom",
    "btnRankedCancel",
    "tabBtnRanked",
    "tabBtnCasual",
  ]);

  const VOICELINE_CUE_BY_CARD_ID = {
    D1: "voicelineD1",
    D2: "voicelineD2",
    D3: "voicelineD3",
    D4: "voicelineD4",
    D5: "voicelineD5",
    D6: "voicelineD6",
    I1: "voicelineI1",
    I2: "voicelineI2",
    I3: "voicelineI3",
    I4: "voicelineI4",
    I5: "voicelineI5",
    I6: "voicelineI6",
    N1: "voicelineN1",
    N2: "voicelineN2",
    N3: "voicelineN3",
    N4: "voicelineN4",
    N5: "voicelineN5",
    N6: "voicelineN6",
  };

  const sfxState = {};
  for (const name of Object.keys(SFX_CONFIG)) {
    sfxState[name] = {
      lastPlayedAt: 0,
      lastNode: null,
      activeNodes: new Set(),
    };
  }
  let activeBackgroundName = "";
  const nodeFadeTimers = new WeakMap();

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

  function soundNamesForChannel(channel) {
    return Object.entries(SFX_CONFIG)
      .filter(([, cfg]) => cfg.channel === channel)
      .map(([name]) => name);
  }

  function stopChannel(channel) {
    if (!isKnownChannel(channel)) return false;

    let stoppedAny = false;
    for (const name of soundNamesForChannel(channel)) {
      if (stop(name)) stoppedAny = true;
    }
    if (channel === "background") {
      activeBackgroundName = "";
    }
    return stoppedAny;
  }

  function setEnabled(channel, enabled) {
    if (!isKnownChannel(channel)) return false;

    soundSettings[channel] = !!enabled;
    saveSoundSettings();

    if (channel === "sfx" && !soundSettings.sfx) {
      stopChannel("sfx");
    }
    if (channel === "background" && !soundSettings.background) {
      stopChannel("background");
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

  function clearNodeFade(node) {
    const timerId = nodeFadeTimers.get(node);
    if (timerId) {
      clearInterval(timerId);
      nodeFadeTimers.delete(node);
    }
  }

  function fadeNodeVolume(node, toVolume, durationMs, onDone) {
    if (!node) {
      if (typeof onDone === "function") onDone();
      return;
    }

    clearNodeFade(node);

    const target = clamp(toVolume, 0, 1);
    const ms = Math.max(0, Number(durationMs) || 0);
    if (ms === 0) {
      node.volume = target;
      if (typeof onDone === "function") onDone();
      return;
    }

    const start = Date.now();
    const from = clamp(Number(node.volume) || 0, 0, 1);
    const timerId = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / ms);
      node.volume = clamp(from + (target - from) * t, 0, 1);
      if (t >= 1) {
        clearNodeFade(node);
        if (typeof onDone === "function") onDone();
      }
    }, 24);
    nodeFadeTimers.set(node, timerId);
  }

  function stop(name) {
    const state = sfxState[name];
    if (!state) {
      return false;
    }

    const hadActive = state.activeNodes.size > 0;

    for (const node of state.activeNodes) {
      try {
        clearNodeFade(node);
        node.pause();
        node.currentTime = 0;
      } catch {
        // Ignore stop errors; this is best-effort cleanup.
      }
    }
    state.activeNodes.clear();
    state.lastNode = null;
    if (activeBackgroundName === name) {
      activeBackgroundName = "";
    }
    return hadActive;
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
    if (
      !opts.ignoreCooldown &&
      cooldownMs > 0 &&
      now - state.lastPlayedAt < cooldownMs
    ) {
      return false;
    }
    state.lastPlayedAt = now;

    try {
      const node = new Audio(cfg.src);
      node.preload = "auto";
      node.loop = typeof opts.loop === "boolean" ? opts.loop : !!cfg.loop;
      state.activeNodes.add(node);
      state.lastNode = node;

      const cleanup = () => {
        clearNodeFade(node);
        state.activeNodes.delete(node);
        if (state.lastNode === node) {
          state.lastNode = null;
        }
        if (
          channel === "background" &&
          activeBackgroundName === name &&
          state.activeNodes.size === 0
        ) {
          activeBackgroundName = "";
        }
      };
      node.addEventListener("ended", cleanup, { once: true });
      node.addEventListener("error", cleanup, { once: true });

      const requestedVolume =
        typeof opts.volume === "number" ? opts.volume : cfg.volume;
      node.volume = capChannelVolume(channel, requestedVolume);
      if (typeof opts.playbackRate === "number" && opts.playbackRate > 0) {
        node.playbackRate = opts.playbackRate;
      }
      const playPromise = node.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            if (channel === "background") {
              activeBackgroundName = name;
            }
          })
          .catch(() => {
            cleanup();
          });
      } else if (channel === "background") {
        activeBackgroundName = name;
      }
      return true;
    } catch {
      return false;
    }
  }

  function playBackground(name, opts = {}) {
    const cfg = SFX_CONFIG[name];
    const state = sfxState[name];
    if (!cfg || !state || cfg.channel !== "background") return false;
    if (!isEnabled("background")) return false;

    if (activeBackgroundName === name && state.activeNodes.size > 0) {
      return true;
    }

    const previousName = activeBackgroundName;
    const previousState = previousName ? sfxState[previousName] : null;
    const previousNodes =
      previousState && previousName !== name
        ? Array.from(previousState.activeNodes)
        : [];

    const targetVolume = capChannelVolume(
      "background",
      typeof opts.volume === "number" ? opts.volume : cfg.volume,
    );

    const started = play(name, {
      ...opts,
      ignoreCooldown: true,
      loop: true,
      volume: previousNodes.length > 0 ? 0 : targetVolume,
    });
    if (!started) return false;

    activeBackgroundName = name;

    const newNode = state.lastNode;
    if (newNode && previousNodes.length > 0) {
      fadeNodeVolume(newNode, targetVolume, BACKGROUND_FADE_IN_MS);
    }

    if (previousNodes.length > 0 && previousState) {
      for (const prevNode of previousNodes) {
        fadeNodeVolume(prevNode, 0, BACKGROUND_FADE_OUT_MS, () => {
          try {
            prevNode.pause();
            prevNode.currentTime = 0;
          } catch {
            // Ignore best-effort stop failures.
          }
          previousState.activeNodes.delete(prevNode);
          if (previousState.lastNode === prevNode) {
            previousState.lastNode = null;
          }
        });
      }
    }

    return true;
  }

  function playCardVoiceline(cardId, opts = {}) {
    const key = typeof cardId === "string" ? cardId.trim().toUpperCase() : "";
    const cueName = VOICELINE_CUE_BY_CARD_ID[key];
    if (!cueName) return false;
    return play(cueName, {
      interrupt: true,
      ...opts,
    });
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
        stopChannel("sfx");
      }
      if (!soundSettings.background) {
        stopChannel("background");
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
    playCardVoiceline,
    stop,
    stopChannel,
    playBackground,
    isEnabled,
    setEnabled,
    getSettings,
  };
})();
