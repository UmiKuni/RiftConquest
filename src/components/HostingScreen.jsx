import { useState } from "react";
import { createMatch, joinMatch, resolveJoinSlot } from "../lib/matchApi";

export default function HostingScreen({ onConnected }) {
  const [playerName, setPlayerName] = useState("Player");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const hostRoom = async () => {
    setLoading(true);
    setError("");

    try {
      const created = await createMatch(playerName);
      const hostJoin = await joinMatch({
        matchID: created.matchID,
        playerID: "0",
        playerName,
      });

      onConnected({
        matchID: created.matchID,
        roomCode: created.matchID,
        playerID: "0",
        playerName,
        credentials: hostJoin.playerCredentials,
      });
    } catch (hostError) {
      setError(hostError.message);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    setLoading(true);
    setError("");

    try {
      const slot = await resolveJoinSlot(roomCode, playerName);
      onConnected({
        matchID: roomCode,
        roomCode,
        playerID: slot.playerID,
        playerName,
        credentials: slot.playerCredentials,
      });
    } catch (joinError) {
      setError("Unable to join room. Check code or available player slot.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg shadow-slate-950">
        <h1 className="text-2xl font-bold text-sky-300">RiftConquest</h1>
        <p className="mt-1 text-sm text-slate-300">Host or join a 1v1 room.</p>

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-300">
            Player Name
            <input
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-sky-500 focus:ring"
              maxLength={20}
            />
          </label>

          <label className="block text-sm font-medium text-slate-300">
            Room Code
            <input
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-sky-500 focus:ring"
              maxLength={12}
              placeholder="Enter host match code"
            />
          </label>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <div className="flex gap-3">
            <button
              onClick={hostRoom}
              disabled={loading || !playerName.trim()}
              className="w-full rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Host
            </button>
            <button
              onClick={joinRoom}
              disabled={loading || !playerName.trim() || !roomCode.trim()}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
