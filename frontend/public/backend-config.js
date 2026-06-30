(function () {
  function trimTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function queryBackendUrl() {
    try {
      return new URLSearchParams(window.location.search).get("backend") || "";
    } catch {
      return "";
    }
  }

  function defaultBackendUrl() {
    return window.location.port === "5173" ? "http://localhost:3001" : "";
  }

  const baseUrl = trimTrailingSlash(
    window.RC_BACKEND_URL || queryBackendUrl() || defaultBackendUrl(),
  );

  function url(path) {
    const normalized = String(path || "").startsWith("/") ? path : `/${path}`;
    return baseUrl ? new URL(normalized, baseUrl).toString() : normalized;
  }

  function api(path) {
    const normalized = String(path || "").startsWith("/") ? path : `/${path}`;
    return url(`/api${normalized}`);
  }

  function socketUrl() {
    return baseUrl || undefined;
  }

  window.rcBackend = {
    baseUrl,
    url,
    api,
    health: function () {
      return url("/health");
    },
    socketUrl,
  };
})();
