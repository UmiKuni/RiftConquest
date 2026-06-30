import { getShared } from "./auth.js";
import { apiUrl, healthUrl } from "./backend.js";

async function authHeaders(user) {
  const shared = getShared();
  const token =
    shared && typeof shared.getIdTokenSafe === "function"
      ? await shared.getIdTokenSafe(user)
      : null;
  if (!token) throw new Error("Missing auth token.");
  return { Authorization: `Bearer ${token}` };
}

async function readJsonResponse(res, fallbackMessage) {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      body && body.error ? String(body.error) : fallbackMessage,
    );
  }
  return body;
}

const newsCache = new Map();
const newsRequests = new Map();

function newsCacheKey({ limit } = {}) {
  return limit ? `limit:${Number(limit)}` : "all";
}

export async function fetchMe(user) {
  const res = await fetch(apiUrl("/me"), {
    headers: await authHeaders(user),
  });
  const body = await readJsonResponse(res, "Failed to load profile.");
  return body && body.me ? body.me : null;
}

export async function fetchMatchHistory(user, limit = 20) {
  const url = `${apiUrl("/me/matchHistory")}?limit=${encodeURIComponent(
    String(limit),
  )}`;
  const res = await fetch(url, {
    headers: await authHeaders(user),
  });
  const body = await readJsonResponse(res, "Failed to load match history.");
  return body && Array.isArray(body.items) ? body.items : [];
}

export async function saveDisplayName(user, displayName) {
  const res = await fetch(apiUrl("/me/displayName"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders(user)),
    },
    body: JSON.stringify({ displayName }),
  });
  const body = await readJsonResponse(res, "Failed to update display name.");
  return body && typeof body.displayName === "string"
    ? body.displayName
    : displayName;
}

export async function checkBackendHealth() {
  const res = await fetch(healthUrl(), {
    headers: { Accept: "application/json" },
  });
  const body = await readJsonResponse(res, "Backend is unavailable.");
  return body && body.ok === true;
}

export function getCachedNewsPosts(options = {}) {
  const cached = newsCache.get(newsCacheKey(options));
  if (cached) return cached;

  if (options.limit && newsCache.has("all")) {
    return newsCache.get("all").slice(0, Number(options.limit));
  }

  return null;
}

export async function fetchNewsPosts({ limit, force = false } = {}) {
  const key = newsCacheKey({ limit });
  if (!force && newsCache.has(key)) return newsCache.get(key);
  if (!force && limit && newsCache.has("all")) {
    const posts = newsCache.get("all").slice(0, Number(limit));
    newsCache.set(key, posts);
    return posts;
  }
  if (!force && newsRequests.has(key)) return newsRequests.get(key);

  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const request = fetch(`${apiUrl("/news")}${suffix}`, {
    headers: { Accept: "application/json" },
  })
    .then((res) => readJsonResponse(res, "Failed to load news."))
    .then((body) => {
      const posts = body && Array.isArray(body.posts) ? body.posts : [];
      newsCache.set(key, posts);
      return posts;
    })
    .finally(() => {
      newsRequests.delete(key);
    });

  newsRequests.set(key, request);
  return request;
}
