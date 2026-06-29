const loaded = new Set();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

export async function runLegacyScripts(scripts, { reload = false } = {}) {
  const stamp = Date.now();
  for (const src of scripts) {
    if (!reload && loaded.has(src)) continue;
    await loadScript(reload ? `${src}?spa=${stamp}` : src);
    loaded.add(src);
  }
}
