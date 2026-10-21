# Sketch Racer room server

A Cloudflare Worker with one Durable Object (`RaceRoom`) per room code. Each room owns its WebSocket connections and relays the game's JSON messages between the players in that room. Physics still runs on each player's machine. The room only checks what it can see: message shape and size, rate, sender identity, pose sanity and finish times. It does not simulate the race.

Files:

- `wrangler.toml`: Worker name, bindings, vars and the migration for `RaceRoom`
- `src/index.ts`: HTTP routes, room code generation, origin check
- `src/room.ts`: the `RaceRoom` Durable Object (sockets, relay, validation)
- `test/relay.mjs`: relay test, run against a live dev server

## Endpoints

| Method | Path | Result |
| --- | --- | --- |
| GET | `/health` | `ok` |
| POST | `/api/rooms` | `201` with `{ "code", "ws" }`. Picks a code with no members. Returns `503` if 5 tries all hit used codes. |
| GET | `/api/rooms/:code` | `{ "code", "members", "max" }`. `members` counts drivers only. |
| GET | `/api/boards/race\|daily\|typing` | Global board (best time per player), the caller's own times (`name=`) and their rank. |
| POST | `/api/boards/race\|daily\|typing` | Adds one finished result, validated here and by table CHECKs. 20 posts/min per IP. |
| POST | `/api/tracks` | `{ "code" }` → `{ "id" }`: an 8-character short link for a drawn track (same track, same id). 6 posts/min per IP. |
| GET | `/api/tracks/:id` | `{ "code", "name" }` for a shared track. |
| GET | `/rooms/:code/ws` | WebSocket upgrade for joining a room. Returns `403` if the Origin is not allowed. |

Room codes are 4 to 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I, O, 0 or 1). Lowercase input is uppercased.

## Local development

Requires Node.js and npm.

```sh
cd worker
npm install
npm run dev          # wrangler dev on http://localhost:8787
```

With the dev server running, in a second terminal:

```sh
npm test             # node test/relay.mjs (needs npm run dev running)
npm run typecheck    # tsc --noEmit
```

To run the game locally, start a static server from the repo root:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. The local origin is already in `ALLOWED_ORIGINS`.

## Deploying to your own Cloudflare account

```sh
npx wrangler login
npm run deploy
```

`wrangler deploy` prints the Worker URL (`https://skr-rooms.<your-subdomain>.workers.dev`). Then:

1. Paste that URL into `assets/net-config.js` as `window.SKR_ROOMS_WS`, using the `wss://` form (the same host with `wss://` in place of `https://`).
2. Add your site's origin to `ALLOWED_ORIGINS` in `wrangler.toml`, then deploy again.

No secrets are needed.

## Configuration

Both settings are in `[vars]` in `wrangler.toml`.

- `MAX_PLAYERS` (default `"8"`): drivers allowed in one room. The value is clamped to 2 through 16. Phone controllers do not count toward it.
- `ALLOWED_ORIGINS`: comma-separated list of origins allowed to open a room socket. The default lists the Vercel site and `localhost:8000` / `127.0.0.1:8000`. If the list is empty, any origin is allowed. Requests with no Origin header (scripts, tests) are not blocked by this check.

The Durable Object binding is `RACE_ROOM` (class `RaceRoom`), with SQLite-backed storage declared in migration `v1`.

## Protocol

Connect to `/rooms/:code/ws` with these query parameters:

- `pid`: player id, 4 to 32 characters from `A-Z a-z 0-9 _ -`
- `tok`: session token, 8 to 40 characters from the same set. Required for drivers (`role=p`).
- `role`: `p` for a driver (default), `c` for a phone controller

Messages are JSON objects with a string `k` field. Drivers can send `hi`, `s`, `race`, `fin`, `pg`, `pk`, `kick`, `bye`, `em`, `trk`, `cc`, `hn`, `cfg`, `rdy`, `spec` and `chat`. Controllers can only send `ctrl`. Other kinds are dropped. The server rewrites `id` to the socket's `pid`, so a sender cannot speak as someone else. Messages from drivers are relayed to other drivers. Controllers receive nothing.

Close codes the server sends:

- `4000` (replaced): the same `pid` reconnected with the same token, and the old socket is closed.
- `4001` (room full): the room already has `MAX_PLAYERS` drivers.
- `4003` (id in use): the `pid` is already connected with a different token.

Limits:

- Messages over 600000 characters are dropped.
- Each sender is limited to 60 messages per second sustained, with a burst of 120. Messages over the limit are dropped.
- Every dropped message is counted. After 2000 drops the socket is closed with code `1008`.
- A car pose (`s`) that jumps more than 150 metres from the last accepted pose is dropped. Three far-away poses in a row are accepted as a respawn.
- Finish times (`fin`) must be between 1000 and 3600000 ms.

## Known limitations

- No D1, R2 or leaderboards yet. Room state lives only in the Durable Object's sockets and memory.
- Race results are client-reported. The server checks their shape and times but does not verify them.
- Driver and phone ids are not authenticated beyond the session token. Anyone who knows a room code can join it, and the token only guards a given `pid` from being taken over.
