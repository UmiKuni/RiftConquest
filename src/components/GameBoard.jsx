import { REGION_NAMES, WIN_VP } from "../game/riftConquestGame";
import gameRule from "../../game_rule.json" with { type: "json" };

const regionColor = {
  Noxus: "text-red-400",
  Demacia: "text-yellow-200",
  Ionia: "text-pink-200",
};

const colorForRegion = (region) => regionColor[region] ?? "text-slate-200";

const WITHDRAW_POINTS_BY_REMAINING = gameRule.withdrawal.scoring.cardsRemaining;

const withdrawPointsFor = (remainingCards) =>
  WITHDRAW_POINTS_BY_REMAINING[String(remainingCards)] ?? 0;

const battleCardLabel = (entry) => {
  if (entry.facedown) {
    return "Facedown (2)";
  }

  return `${entry.card.champion} (${entry.card.strength})`;
};

const abilityTooltipForEntry = (entry) => {
  if (entry.facedown) {
    return "Facedown card: no ability (hidden)";
  }
  return entry.card.ability || "No ability";
};

export default function GameBoard(props) {
  const { G, ctx, playerID, moves, isActive } = props;
  const myHand = G.hands[playerID] ?? [];
  const selectedTurn = ctx.currentPlayer;
  const orderedRegions = G.regionOrder ?? REGION_NAMES;
  const withdrawPoints = withdrawPointsFor(myHand.length);
  const myId = playerID ?? "0";
  const oppId = myId === "0" ? "1" : "0";
  const gameover = ctx.gameover;
  const myAccepted = G.summaryAccepted?.[myId] ?? false;
  const abilityLog = G.abilityLog ?? [];

  return (
    <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col gap-3 px-3 pt-3 pb-40">
      <div className="shrink-0 rounded-xl border border-slate-800 bg-slate-900 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-300">First to {WIN_VP} VP wins</p>
          <p className="text-sm text-slate-300">
            Current turn: Player {Number(selectedTurn) + 1}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>Initiative: Player {Number(G.initiativePlayer) + 1}</span>
          <span>Region line: {orderedRegions.join(" → ")}</span>
        </div>
        <div className="mt-3 flex gap-4 text-sm">
          <span className="rounded bg-slate-800 px-3 py-1">
            Player 1 VP: {G.scores["0"]}
          </span>
          <span className="rounded bg-slate-800 px-3 py-1">
            Player 2 VP: {G.scores["1"]}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Left: guidelines + withdraw note */}
        <div className="flex-[1_1_0] min-h-0 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-200">
          <h3 className="text-sm font-semibold text-sky-300">Guide</h3>
          <ul className="mt-2 space-y-1">
            <li>- Me = bottom, Opponent = top.</li>
            <li>- Withdraw: lose this battle, opponent gains VP shown.</li>
            <li>- Surrender: lose the entire game.</li>
          </ul>
          <p className="mt-3 text-xs text-amber-200">
            Withdraw now: opponent gains {withdrawPoints} VP
          </p>
        </div>

        {/* Middle: regions board (3 columns) */}
        <div className="flex-[3_3_0] min-h-0 rounded-xl border border-slate-800 bg-slate-900 p-3">
          <div className="grid h-full min-h-0 gap-3 md:grid-cols-3">
            {orderedRegions.map((region) => {
              const regionCards = G.board[region] ?? [];
              const myRegionCards = regionCards.filter(
                (entry) => entry.playerID === playerID,
              );
              const opponentRegionCards = [...regionCards]
                .filter((entry) => entry.playerID !== playerID)
                .reverse();

              return (
                <div
                  key={region}
                  className="min-h-0 rounded-xl border border-slate-800 bg-slate-900 p-3"
                >
                  <h2
                    className={`text-lg font-semibold ${colorForRegion(region)}`}
                  >
                    {region}
                  </h2>

                  <div className="mt-2 flex h-[calc(100%-2rem)] min-h-0 flex-col rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">
                        Opponent (Top)
                      </p>
                      {opponentRegionCards.length === 0 ? (
                        <p className="mt-2 text-xs text-slate-600">No cards</p>
                      ) : (
                        <ul className="mt-2 overflow-hidden text-xs text-slate-200">
                          {opponentRegionCards.map((entry, index) => (
                            <li
                              key={`${region}-op-${index}`}
                              className={`relative rounded border border-slate-700 bg-slate-800 px-2 py-1 ${index === 0 ? "" : "-mt-3"}`}
                              title={abilityTooltipForEntry(entry)}
                              style={{ zIndex: 40 - index }}
                            >
                              <span className="text-slate-400">
                                P{Number(entry.playerID) + 1}:{" "}
                              </span>
                              <span
                                className={
                                  entry.facedown
                                    ? "text-slate-200"
                                    : colorForRegion(entry.card.region)
                                }
                              >
                                {battleCardLabel(entry)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="my-2 border-t border-slate-800" />

                    <div className="min-h-0 flex-1 overflow-hidden">
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">
                        You (Bottom)
                      </p>
                      {myRegionCards.length === 0 ? (
                        <p className="mt-2 text-xs text-slate-600">No cards</p>
                      ) : (
                        <ul className="mt-2 space-y-1 overflow-hidden text-xs text-slate-200">
                          {myRegionCards.map((entry, index) => (
                            <li
                              key={`${region}-me-${index}`}
                              className="rounded border border-slate-700 bg-slate-800 px-2 py-1"
                              title={abilityTooltipForEntry(entry)}
                            >
                              <span className="text-slate-400">
                                P{Number(entry.playerID) + 1}:{" "}
                              </span>
                              <span
                                className={
                                  entry.facedown
                                    ? "text-slate-200"
                                    : colorForRegion(entry.card.region)
                                }
                              >
                                {battleCardLabel(entry)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: ability log */}
        <div className="flex-[1_1_0] min-h-0 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-200">
          <h3 className="text-sm font-semibold text-sky-300">Ability Log</h3>
          {abilityLog.length === 0 ? (
            <p className="mt-2 text-[11px] text-slate-500">
              No abilities played yet this battle.
            </p>
          ) : (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {[...abilityLog]
                .slice()
                .reverse()
                .map((entry, index) => {
                  const isMe = entry.playerID === myId;
                  return (
                    <li
                      key={`${entry.index}-${index}`}
                      className="text-[11px] leading-snug"
                    >
                      <span
                        className={isMe ? "text-emerald-300" : "text-rose-300"}
                      >
                        {isMe ? "Me" : "Opponent"}
                      </span>{" "}
                      <span className="text-slate-300">
                        played {entry.cardId} ({entry.type}) in {entry.region}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 py-1">
        <div className="relative mt-1 flex h-44 items-end justify-center">
          {myHand.map((card, index) => (
            <div
              key={card.id}
              className="group relative -ml-12 first:ml-0"
              style={{ zIndex: index + 1 }}
              title={card.ability || "No ability"}
            >
              <div className="flex aspect-[2/3] w-32 items-stretch rounded-xl border border-slate-700 bg-slate-950/95 p-2 text-xs text-slate-100 shadow-lg transition-transform duration-300 ease-out transform-gpu translate-y-2/3 group-hover:translate-y-1/3 sm:w-36 md:w-40">
                <div className="flex w-full flex-col">
                  <div className="flex items-baseline justify-between gap-1">
                    <p className="text-[10px] text-slate-400">{card.id}</p>
                    <p
                      className={`text-xs font-semibold ${colorForRegion(card.region)}`}
                    >
                      {card.region}
                    </p>
                  </div>
                  <p
                    className={`mt-0.5 text-sm font-semibold ${colorForRegion(card.region)}`}
                  >
                    {card.champion}
                  </p>
                  <p className={`text-[11px] ${colorForRegion(card.region)}`}>
                    STR {card.strength}
                  </p>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-slate-300">
                    {card.ability || "No ability"}
                  </p>
                  <div className="mt-2 flex flex-col gap-1 text-[10px]">
                    <button
                      disabled={!isActive}
                      onClick={() =>
                        moves.playCard(card.region, card.id, false)
                      }
                      className="w-full rounded bg-sky-500 px-2 py-1 font-medium text-slate-950 disabled:opacity-50"
                    >
                      Play face-up ({card.region})
                    </button>
                    <div className="grid grid-cols-3 gap-1">
                      {orderedRegions.map((region) => (
                        <button
                          key={`${card.id}-${region}-down`}
                          disabled={!isActive}
                          onClick={() => moves.playCard(region, card.id, true)}
                          className="rounded border border-slate-700 bg-slate-900 px-1 py-1 text-[9px] text-slate-200 disabled:opacity-50"
                        >
                          {region}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-end">
          <button
            disabled={!isActive}
            onClick={() => moves.withdraw()}
            className="rounded border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-sm text-amber-200 disabled:opacity-50"
          >
            Withdraw (lose this battle)
          </button>
        </div>
      </div>

      {gameover && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-emerald-300">
              Final Result
            </h2>
            <p className="mt-1 text-sm text-slate-200">
              Winner: {gameover.winner === myId ? "Me" : "Opponent"}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Game over. First to {WIN_VP} VP wins.
            </p>

            <div className="mt-4 flex gap-3 text-sm text-slate-200">
              <span className="rounded bg-slate-800 px-3 py-1">
                Me: {G.scores[myId]}
              </span>
              <span className="rounded bg-slate-800 px-3 py-1">
                Opponent: {G.scores[oppId]}
              </span>
            </div>
          </div>
        </div>
      )}

      {!gameover && G.inSummary && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-sky-300">
              Battle Summary
            </h2>
            <p className="mt-1 text-sm text-slate-200">
              Winner: {G.summaryWinner === myId ? "Me" : "Opponent"} (+
              {G.summaryPoints} VP)
            </p>
            <p className="text-xs text-slate-400">
              {G.summaryByWithdraw
                ? "Result from withdraw."
                : "Result from both players finishing their cards."}
            </p>

            <table className="mt-4 w-full text-xs text-slate-200">
              <thead>
                <tr className="text-slate-400">
                  <th className="py-1 text-left">Region</th>
                  <th className="py-1 text-right">Me</th>
                  <th className="py-1 text-right">Opponent</th>
                </tr>
              </thead>
              <tbody>
                {orderedRegions.map((region) => {
                  const row = G.summaryRegionTotals?.[region] ?? { 0: 0, 1: 0 };
                  return (
                    <tr key={region}>
                      <td
                        className={`py-1 text-left text-xs ${colorForRegion(region)}`}
                      >
                        {region}
                      </td>
                      <td className="py-1 text-right">{row[myId]}</td>
                      <td className="py-1 text-right">{row[oppId]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {myAccepted && (
              <p className="mt-3 text-xs text-sky-300">
                You have continued. Waiting for opponent...
              </p>
            )}

            <div className="mt-4 flex justify-end gap-3">
              <button
                disabled={myAccepted}
                onClick={() => moves.surrenderGame()}
                className="rounded-lg border border-rose-400/60 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30 disabled:opacity-60 disabled:hover:bg-rose-500/20"
              >
                Surrender (lose game)
              </button>
              <button
                disabled={myAccepted}
                onClick={() => moves.acceptSummary()}
                className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60 disabled:hover:bg-sky-500"
              >
                {myAccepted ? "Waiting opponent" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
