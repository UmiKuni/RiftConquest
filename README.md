# RiftConquest

A 2-player online card game where you deploy champions, contest regions, and race to **12 Victory Points (VP)**.

- **Lobby**: host/join casual rooms by code
- **Ranked** (optional): login + Rift Points (RP) + leaderboard + match history
- **Tech**: Node.js + Express + Socket.io + vanilla HTML/CSS/JS

## Play online

- https://riftconquest-web.onrender.com/

## How to play (rules)

### Goal

- Be the first player to reach **12 VP**.

### Setup (each round)

- The deck has **18 cards**. Shuffle, then deal **6 cards** to each player.
- The 3 regions (**Noxus**, **Demacia**, **Ionia**) form a line and **shuffle order each round** (different from the previous round). Only left/right neighbors are “adjacent”.
- One player has **initiative** (goes first). Round 1 is random; then initiative alternates each round.

### On your turn

Choose **one** action:

1. **Deploy a card**

- **Face-up**: normally must be played to its **matching region**.
- **Face-down**: can be played to **any** region, counts as **STR 2**, and has **no ability**.

2. **Retreat** (Withdraw)

- End the round immediately. Your opponent scores VP based on how many cards they still have in hand.

### Card types

- **Instant**: triggers when played **face-up** (may prompt for a choice).
- **Ongoing**: applies while the card stays **face-up** on the board.
- **None**: no ability.

### End of round + scoring

- If a player **retreats**, the other player gains VP based on the _winner’s_ remaining hand size:

| Opponent cards remaining | VP gained |
| -----------------------: | --------: |
|                        0 |         6 |
|                        1 |         5 |
|                        2 |         4 |
|                        3 |         3 |
|                      4–6 |         2 |

- Otherwise, the round ends when both players run out of cards.
- At round end, each region is controlled by the player with higher total strength in that region.
  - **Face-down cards** count as STR 2.
  - Ongoing effects may modify strength.
- The player who controls **more regions** gains **6 VP**. If tied, **initiative** breaks the tie.

## Quick start (local)

### Prerequisites

- Node.js (18+ recommended)

### Install + run

Run the backend and frontend in separate terminals:

```bash
cd server
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

Open the Vite app:

- http://localhost:5173/

The backend runs on http://localhost:3001/ by default. The frontend uses
`VITE_BACKEND_URL` for `/api`, `/health`, and Socket.io calls.

## Project structure

- `server/package.json` — backend runtime scripts and dependencies
- `server/index.js` — Express server + Socket.io
- `server/config/*` — backend path and environment configuration
- `server/socket/*` — realtime game handlers + room management
- `server/persistence/firestore.js` — Firestore persistence (ranked, leaderboard, match history)
- `frontend/package.json` — Vite scripts and browser dependencies
- `frontend/vite.config.js` — frontend dev/build configuration
- `frontend/src/` — SPA entry, router, stores, and page modules
- `frontend/public/` — browser vendor files and legacy game page assets
- `frontend/image/` — frontend-owned images copied into the production build
- `frontend/sounds/` — frontend-owned audio copied into the production build

Frontend routes:

- `/` -> `/home`
- `/home` -> landing page
- `/how-to-play` -> beginner guide
- `/play` -> lobby loading flow and lobby
- `/game?room=CODE&player=N` -> active match client
- `/profile` -> account profile

Backend routes:

- `/health` -> backend health check
- `/api/*` -> persistence/profile/leaderboard API
- `/socket.io/*` -> realtime game transport
## Configuration

### Environment variables

See `frontend/.env.example` and `server/.env.example`.
For local backend config, copy `server/.env.example` to `server/.env`.
The server loads `server/.env` automatically with `dotenv`; deployed environment
variables still take precedence.

- `PORT` — server port (defaults to `3001` locally)
- `HOST` — bind host (defaults to `0.0.0.0`)
- `FRONTEND_ORIGIN` — allowed browser origin for API and Socket.io CORS
- `VITE_BACKEND_URL` — frontend build/dev backend URL, such as `http://localhost:3001`
- `FIREBASE_SERVICE_ACCOUNT_PATH` — path to a Firebase Admin service-account JSON (server)
- `GOOGLE_APPLICATION_CREDENTIALS` — alternative to `FIREBASE_SERVICE_ACCOUNT_PATH`

## Firebase (optional, for Ranked/Profile/Leaderboard)

Casual games work without Firebase.

Ranked features require:

1. **Client Firebase config**

- Edit `frontend/public/firebase-config.js` and replace `window.FIREBASE_CONFIG` with your own Firebase project’s Web config.

2. **Server Firebase Admin credentials**

The server uses the Admin SDK to verify ID tokens and write to Firestore.

Choose one:

- Set `FIREBASE_SERVICE_ACCOUNT_PATH` (recommended)
- Or set `GOOGLE_APPLICATION_CREDENTIALS`
- Or place the service-account JSON into `.local/` (the server will auto-detect files containing `firebase-adminsdk`)

Never commit the service-account JSON key.

### Firebase Console setup checklist

- Authentication providers:
  - Enable **Google**
  - Enable **Email/Password** (if you want email login)
- Authorized domains:
  - Add your local/dev domain(s) and any deployed domain(s)
- Firestore:
  - Create a Firestore database for the project
  - Deploy rules/indexes with Firebase CLI if needed (see `firebase.json`, `firestore.rules`, `firestore.indexes.json`)

## Deployment (Vercel + Render)

The frontend is a Vite SPA that can deploy to Vercel. The backend is a
stateful Socket.io server that can deploy to Render.

- Start the backend with **1 instance** on Render (multiple instances will split players/rooms unless you add shared state like Redis + a Socket.io adapter).

### Backend: Render

1. Push your repo to GitHub
2. Render → **New** → **Web Service** → connect the repo
3. Settings:

- **Root Directory**: `server`
- **Build Command**: `npm ci`
- **Start Command**: `npm start`

4. Environment:

- Render automatically provides `PORT` — do not hardcode `3001` in production
- `HOST=0.0.0.0`
- `FRONTEND_ORIGIN=https://your-vercel-app.vercel.app`
- (Optional) `NODE_ENV=production`

5. Firebase Admin (for ranked features):

- Render → Environment → **Secret Files**:
  - Create: `/etc/secrets/firebase-service-account.json`
  - Paste your service-account JSON
- Render → Environment → **Environment Variables**:
  - `FIREBASE_SERVICE_ACCOUNT_PATH=/etc/secrets/firebase-service-account.json`

### Frontend: Vercel

1. Vercel → **New Project** → connect the repo
2. Settings:

- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

3. Environment:

- `VITE_BACKEND_URL=https://your-render-backend.onrender.com`

4. Firebase Console → Authentication → **Authorized domains**:

- Add `your-vercel-app.vercel.app` and any custom frontend domain.

### Legacy Single-Service Render

The backend is now API-only, so the old single-service deployment is no longer
the recommended production path.

- **Build Command**: `cd server && npm ci`
- **Start Command**: `cd server && npm start`

### Firebase Console

- Add the frontend domain, not only the backend domain.

## Notes for contributors

- The server is authoritative; the client should not decide outcomes.
- Keep hidden information hidden (never leak opponent hand).
- `card_data.json` and `game_rule.json` are reference docs; the server’s gameplay constants/cards are defined in `server/game/*`.
