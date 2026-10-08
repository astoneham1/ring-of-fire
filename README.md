# Ring of Fire

The card drinking game, for when nobody brought a pack. Everyone joins on their own phone with a 4-letter code, the host arranges the seats to match the real circle, and the app deals, tracks mates, rules and the King's Cup.

## Running locally

```sh
npm install
npm run dev
```

This runs the React app and the game server (in Cloudflare's local runtime) together on port 5173. Open the **Network** URL Vite prints (e.g. `http://192.168.1.31:5173`) on your laptop and on phones on the same Wi-Fi. `localhost` works for you, but invite links and QR codes made from it won't work on phones.

## How it fits together

```
shared/   types, the rule library and default card rules (used by both sides)
server/   game.ts   — all game rules, no networking
          worker.ts — Cloudflare Worker + one Durable Object per room
src/      React client (Vite + Tailwind v4 + Motion)
```

- Everything is one Cloudflare Worker. It serves the built React app, and `/ws/:code` is a room's WebSocket. Hosting picks a random code on the phone and sends `create`; if that code is already a game, the room replies `codeTaken` and the phone tries another.
- Each room is a Durable Object: the source of truth for that game. Phones send intents (`draw`, `choose`, `done`…) and get the full public game state back.
- Rooms are saved to Durable Object storage after every change, so a game survives the room going to sleep or Cloudflare restarting it. Rooms nobody is connected to are deleted after 6 hours.
- The deck order lives only on the server, so nobody can peek.
- Each phone keeps a private token in `localStorage`, so a locked screen or refresh drops you back into your seat.

## Changing the rules

Every card's rule is a dropdown in the lobby. To add a new rule, add an entry to `RULE_LIBRARY` in `shared/rules.ts`. If it needs new behaviour (not just text), add an `action` kind and handle it in `Room.draw` / `Room.choose` in `server/game.ts`.

## Deploying

Hosted on Cloudflare Workers (free plan).

```sh
npx wrangler login   # once
npm run deploy       # typecheck, build, and deploy
```

If you change `wrangler.jsonc`, run `npm run cf-typegen` to regenerate `worker-configuration.d.ts`.
