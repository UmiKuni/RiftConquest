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
- Regions are in a line: **Noxus ↔ Demacia ↔ Ionia** (only neighbors are “adjacent”).
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

```bash
npm install
npm run dev
```

Open:

- http://localhost:3001/

> There is no build step and no automated tests in this repo currently.

## Project structure

- `server/index.js` — Express server + Socket.io
- `server/socket/*` — realtime game handlers + room management
- `server/persistence/firestore.js` — Firestore persistence (ranked, leaderboard, match history)
- `frontend/public/` — static client (served by Express)
- `frontend/image/` — images served from `/image/*`

Static routes (server):

- `/` → `frontend/public/index.html`
- `/image/*` → `frontend/image/*`
- `/vendor/mdi/*` → `@mdi/font` assets
- `/vendor/firebase/*` → Firebase Web SDK assets

## Configuration

### Environment variables

- `PORT` — server port (defaults to `3001` locally)
- `HOST` — bind host (defaults to `0.0.0.0`)
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

## Deployment (Render)

This project is a **stateful** Socket.io server with **in-memory rooms**.

- Start with **1 instance** on Render (multiple instances will split players/rooms unless you add shared state like Redis + a Socket.io adapter).

### Steps

1. Push your repo to GitHub
2. Render → **New** → **Web Service** → connect the repo
3. Settings:

- **Build Command**: `npm ci`
- **Start Command**: `npm start`

4. Environment:

- Render automatically provides `PORT` — do not hardcode `3001` in production
- (Optional) `NODE_ENV=production`

5. Firebase Admin (for ranked features):

- Render → Environment → **Secret Files**:
  - Create: `/etc/secrets/firebase-service-account.json`
  - Paste your service-account JSON
- Render → Environment → **Environment Variables**:
  - `FIREBASE_SERVICE_ACCOUNT_PATH=/etc/secrets/firebase-service-account.json`

6. Firebase Console → Authentication → **Authorized domains**:

- Add `your-service-name.onrender.com` (and your custom domain if you use one)

## Notes for contributors

- The server is authoritative; the client should not decide outcomes.
- Keep hidden information hidden (never leak opponent hand).
- `card_data.json` and `game_rule.json` are reference docs; the server’s gameplay constants/cards are defined in `server/game/*`.
