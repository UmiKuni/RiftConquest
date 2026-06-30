const DEV_BACKEND_URL = "http://localhost:3001";

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function defaultBackendUrl() {
  if (window.location.port === "5173") return DEV_BACKEND_URL;
  return "";
}

export const backendBaseUrl = trimTrailingSlash(
  import.meta.env.VITE_BACKEND_URL || defaultBackendUrl(),
);

export function backendUrl(path) {
  const normalized = String(path || "").startsWith("/") ? path : `/${path}`;
  return backendBaseUrl
    ? new URL(normalized, backendBaseUrl).toString()
    : normalized;
}

export function apiUrl(path) {
  const normalized = String(path || "").startsWith("/") ? path : `/${path}`;
  return backendUrl(`/api${normalized}`);
}

export function healthUrl() {
  return backendUrl("/health");
}

export function socketUrl() {
  return backendBaseUrl || undefined;
}

window.rcBackend = {
  baseUrl: backendBaseUrl,
  url: backendUrl,
  api: apiUrl,
  health: healthUrl,
  socketUrl,
};
