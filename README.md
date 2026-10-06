# Ring of Fire

The card drinking game, for when nobody brought a pack. Everyone joins on their own phone with a 4-letter code, the host arranges the seats to match the real circle, and the app deals, tracks mates, masters, rules and the King's Cup.

## Running locally

```sh
npm install
npm run dev
```

This starts the game server (port 8787) and the Vite dev server (port 5173). Open the **Network** URL Vite prints (e.g. `http://192.168.1.31:5173`) — on your laptop and on phones on the same Wi-Fi. `localhost` works for you, but invite links/QR codes made from it won't work on phones.

## How it fits together

```
shared/   types, the rule library and default card rules (used by both sides)
server/   game.ts — all game rules, no networking
          index.ts — WebSocket server; also serves the built client in production
src/      React client (Vite + Tailwind v4 + Motion)
```

- The server is the source of truth. Phones send intents (`draw`, `choose`, `done`…) and get the full public game state back.
- The deck order lives only on the server, so nobody can peek.
- Each phone keeps a private token in `localStorage`, so a locked screen or refresh drops you back into your seat.
- Rooms live in memory and are cleared after 6 idle hours. Restarting the server ends every game.

## Changing the rules

Every card's rule is a dropdown in the lobby. To add a new rule, add an entry to `RULE_LIBRARY` in `shared/rules.ts`. If it needs new behaviour (not just text), add an `action` kind and handle it in `Room.draw` / `Room.choose` in `server/game.ts`.

## Deploying

Vercel can host the frontend but not a long-lived WebSocket server, so the server needs to live somewhere that runs a persistent Node process (Render, Fly.io, Railway…). Two options:

1. **Single service:** `npm run build && npm run start:server` on Render/Fly — the server serves the built client too.
2. **Split:** frontend on Vercel with `VITE_WS_URL=wss://your-server/ws` set at build time, server elsewhere.
