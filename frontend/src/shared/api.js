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
