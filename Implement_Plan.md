Implementation Plan (Phases) — Casual vs Ranked (No Guest Persistence)

## Product rules (final)

- Guest / Not logged in:
  - Can play Casual only.
  - Local-only data: display name (random by default, editable).
  - Zero server writes (no Firestore writes) for guests.
  - No ranked stats: no ELO, no match total, no match history.

- Authenticated account (Google or Email/Password):
  - Can play Casual and Ranked.
  - Ranked-only stats: ELO, match total, match history.

- Game modes:
  - Casual mode (Host / Join by room code):
    - Guests and authenticated accounts can play.
    - No ELO changes.
    - No match history and does not count toward match total.
    - No server persistence for the match.
  - Ranked mode (Matchmaking, FCFS):
    - Authenticated accounts only (non-anonymous).
    - Ranked games affect ELO + ranked match history.

- Leaderboard:
  - Shows only accounts with ≥ 1 ranked match.
  - 10 accounts per page.

## Phased implementation

Phase 1 — Lobby live background

- Add a looping `<video>` behind the existing lobby card in `index.html`.
- Load media from `/image/...` and update `style.css` for cover/overlay.
- Ensure the background never blocks clicks/inputs.

Phase 2 — Lobby UI: Casual vs Ranked vs Leaderboard

- Keep the existing Host/Join flow as **Casual**.
- Add a **Ranked** entry point ("Find Match") and a queued/waiting UI + cancel button.
- Add a **Leaderboard** tab/panel.

Phase 3 — Guest identity (local-only) + name display in-game

- Add a guest display name editor in the lobby:
  - Generate random name once, store in `localStorage`, allow user edits.
- Make guest names visible during the match without persistence:
  - Send the chosen display name to the server via Socket.io for in-memory room display only.
  - Sanitize on server, render with `textContent` on client.

Phase 4 — Auth UI flows (Google + Email/Password)

- Signed-out experience is Guest.
- Signed-in experience enables Ranked.
- Since guest has no stats to sync, keep it simple:
  - Logging in just switches identity; any guest-only local cache can be kept or replaced.
- Implement display name edits for authenticated accounts (server-authoritative).

Phase 5 — Governance (required BEFORE Ranked ELO goes live)

- Implement server-authoritative safeguards used by Ranked:
  - Turn timer (timeout handling).
  - Disconnect-forfeit rule.
  - "No Contest" outcome when both players disconnect.
- Ensure these outcomes integrate cleanly with `gameOver` and do not allow dodging losses.

Phase 6 — Leaderboard API + UI wiring (Ranked accounts only)

- Server:
  - Exclude guests/anonymous identities.
  - Only return players with `matchTotal >= 1`.
  - Keep queries/index needs simple (scan/skip is fine if it avoids composite indexes).
- Client:
  - Call `GET /api/leaderboard?pageSize=10&cursor=...`.
  - Render rank / displayName / ELO / matchTotal (optional winRate).
  - Implement “Prev” by storing a cursor stack locally (API is forward-cursor).

Phase 7 — Ranked matchmaking (FCFS)

- Server-side ranked queue:
  - Only allow queueing if authenticated and not anonymous.
  - FCFS pairing: when 2 players are queued, create a room, assign indexes, start game.
  - Support cancel + disconnect cleanup.
- Client-side ranked queue UX:
  - "Find Match" emits queue event; show waiting state; allow cancel.
  - On match found, redirect both players to `game.html` with assigned `room` + `player`.

Phase 8 — Server enforcement: mode rules + persistence

- Tag each room with a mode (`casual` vs `ranked`).
- Casual rooms:
  - Do not write anything to Firestore for the match.
  - Do not update ELO, match total, or match history.
- Ranked rooms:
  - Persist match results and update ELO + matchTotal + matchHistory.
  - Keep match recording idempotent (record once, retry-safe).
- Enforce "zero server writes for guests":
  - Do not upsert guest profiles.
  - Never record matches/stats for guests.

Phase 9 — Profile endpoints + game screen personalization + QA

- Endpoints (Ranked stats):
  - `GET /api/me` returns account profile + ranked stats.
  - `GET /api/me/matchHistory` returns ranked match history only (paged).
  - `POST /api/me/displayName` changes displayName (sanitized).
- Game screen:
  - Always show player display names.
  - Only show ELO / ranked stats in Ranked matches.
- Hardening + QA:
  - Validate `displayName` server-side (length/charset).
  - Ensure all DOM name rendering uses `textContent`.
  - Verify flows:
    - Guest → Casual works with zero persistence.
    - Logged-in → Ranked updates ELO + history.
    - Guest attempts Ranked is blocked with a clear message.

## Remaining confirmations (before execution)

- Turn timer: confirm duration (e.g., 40s) and what happens on timeout (forced withdraw vs auto-pass).
- Disconnect-forfeit: confirm duration (e.g., 60s) and whether "No Contest" produces no record and no ELO change.
- Guest names: confirm they should be visible to the opponent (sent via Socket.io, in-memory only).
