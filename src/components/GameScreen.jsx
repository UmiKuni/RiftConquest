import { useEffect, useMemo, useState } from "react";
import { Client } from "boardgame.io/react";
import { SocketIO } from "boardgame.io/multiplayer";
import GameBoard from "./GameBoard";
import { RiftConquestGame } from "../game/riftConquestGame";
import { getMatch, SERVER_URL } from "../lib/matchApi";

export default function GameScreen({ session, onLeave }) {
  const [isReady, setIsReady] = useState(false);

  const RiftConquestClient = useMemo(
    () =>
      Client({
        game: RiftConquestGame,
        board: GameBoard,
        multiplayer: SocketIO({ server: SERVER_URL }),
        debug: false,
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const checkPlayers = async () => {
      try {
        const metadata = await getMatch(session.matchID);
        const playerEntries = Object.values(metadata.players ?? {});
        const connectedPlayers = playerEntries.filter((player) =>
          Boolean(player?.name),
        );
        if (!cancelled) {
          setIsReady(connectedPlayers.length === 2);
        }
      } catch {
        if (!cancelled) {
          setIsReady(false);
        }
      }
    };

    checkPlayers();
    const interval = setInterval(checkPlayers, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session.matchID]);

  return (
    <div className="h-screen overflow-hidden">
      <header className="shrink-0 border-b border-slate-800 bg-slate-900/90 px-4 py-3">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-sky-300">RiftConquest</h1>
            <p className="text-xs text-slate-400">Room: {session.roomCode}</p>
          </div>
          <button
            onClick={onLeave}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-100"
          >
            Leave
          </button>
        </div>
      </header>

      {!isReady ? (
        <div className="mx-auto mt-10 w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
          <p className="text-slate-200">
            Waiting for the second player to connect...
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Share room code: {session.roomCode}
          </p>
        </div>
      ) : (
        <div className="h-[calc(100vh-65px)] overflow-hidden">
          <RiftConquestClient
            matchID={session.matchID}
            playerID={session.playerID}
            credentials={session.credentials}
          />
        </div>
      )}
    </div>
  );
}
