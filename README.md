# RiftConquest Web

React + Vite + TailwindCSS + boardgame.io implementation for a 1v1 RiftConquest game flow.

## Screens

- **HostingScreen**: host a room or join by room code.
- **GameScreen**: play once connected, first to 12 VP wins, or gain VP from opponent surrender.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Run game server + web app:

```bash
npm run dev:all
```

3. Open app at `http://localhost:5173`.

## Scripts

- `npm run dev` - Vite frontend
- `npm run server` - boardgame.io server
- `npm run dev:all` - runs both
- `npm run build` - production build
