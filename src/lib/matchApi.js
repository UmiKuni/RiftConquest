const SERVER_URL =
  import.meta.env.VITE_BGIO_SERVER_URL ?? "http://localhost:8000";

const asJson = async (response) => {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      (typeof payload === "object" ? payload?.error : payload) ||
      `Request failed (${response.status})`;
    throw new Error(message);
  }

  if (!isJson) {
    throw new Error("Unexpected non-JSON response from server.");
  }

  return payload;
};

export const createMatch = async (playerName) => {
  const response = await fetch(`${SERVER_URL}/games/riftconquest/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      numPlayers: 2,
      setupData: { playerName },
    }),
  });

  return asJson(response);
};

export const joinMatch = async ({ matchID, playerID, playerName }) => {
  const response = await fetch(
    `${SERVER_URL}/games/riftconquest/${matchID}/join`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerID, playerName }),
    },
  );

  return asJson(response);
};

export const getMatch = async (matchID) => {
  const response = await fetch(`${SERVER_URL}/games/riftconquest/${matchID}`);
  return asJson(response);
};

export const resolveJoinSlot = async (matchID, playerName) => {
  try {
    const joinedAsP0 = await joinMatch({ matchID, playerID: "0", playerName });
    return { playerID: "0", playerCredentials: joinedAsP0.playerCredentials };
  } catch {
    const joinedAsP1 = await joinMatch({ matchID, playerID: "1", playerName });
    return { playerID: "1", playerCredentials: joinedAsP1.playerCredentials };
  }
};

export { SERVER_URL };
