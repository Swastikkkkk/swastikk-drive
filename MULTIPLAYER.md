# Multiplayer

Race up to eight people on the same road as see-through ghost cars. No collisions, no accounts. A room is just a code.

## Play

1. Open the game and click **Room** (top right on desktop, inside **Menu** on a phone).
2. Type a name, then **Create a room**. You get a 5 character code.
3. Send friends the code, or the invite link (`https://swastikk-drive.vercel.app/?room=CODE`). Opening the link joins the room straight away.
4. Everyone drives their own car, built as whichever car they actually chose in the Garage — a ghost's shape isn't a generic placeholder, and it rebuilds live if that player switches cars mid-session. Other drivers show up as translucent ghosts with a name tag above the car. The list at the top center shows who is in the room, how far away they are, and their ping.
5. Anyone can press **Start race**. Everyone is put on the grid behind the start line, a synchronized 3, 2, 1 runs, then it is one lap around the loop. The list switches to positions with gaps, and finish times appear next to each name.
6. Whoever has been in the room the longest can remove another player with the **×** next to their name in the room panel's list.

A room holds eight drivers. A ninth person gets "Room is full · 8 drivers max" and is put back on the join form; the eight already in the room never notice.

## How it works

Every player runs their own physics. Only a small pose is shared, so a ghost has no body in anyone else's world and nothing can collide.

Transport is a Cloudflare Worker with one Durable Object per room, addressed by the room code. Players and phone controllers connect over a WebSocket to `/rooms/<CODE>/ws`. The Durable Object relays messages between members, enforces the 8-driver cap (phone controllers do not count), rejects a second socket with the same player id unless it carries the same secret token, validates message types, sizes, poses and finish times, and rate-limits each sender. There are still no tables and nothing stored.

| Message | Sent | Carries |
| --- | --- | --- |
| `hi` | on join, then every 3 s, and immediately after a car change | name, join time, car id |
| `s` | adaptive: 20/s for 2 drivers down to 6/s for 8 (see Network budget); 2/s while parked | position, rotation, steering, forward speed, race progress, name, join time |
| `race` | when someone starts a race | a shared start timestamp (see Countdown below) |
| `fin` | when you finish | your time in ms |
| `pg` / `pk` | one `pg` every 2.5 s (0.8 s until everyone has been measured once), aimed at one peer at a time, round robin; `pk` replies immediately | a timestamp, echoed straight back for round-trip time |
| `kick` | when the longest-present player removes someone | the target's id |
| `bye` | when you leave | nothing |

Details worth knowing:

- Room order comes from each player's join time. The eight earliest are in. Later joiners are ignored by everyone and leave with "Room is full". Whoever has the earliest join time is the room's host (kicking, starting races, track and lap settings) — a convention every client computes the same way, not a role enforced by a server. When the host leaves or goes quiet, the next-earliest joiner becomes host automatically on every client, sees "You are now the host", and re-broadcasts the track and lap settings.
- Ghosts are drawn slightly in the past, blended between two real poses with a cubic Hermite curve (it uses the sent positions and velocities) and a quaternion slerp. The delay follows how fast each driver's poses actually arrive: ~110 ms at 20 poses/s, up to ~260 ms at 6/s, so there are always two poses to blend between and a ghost does not step. If packets are late it carries on with the last velocity for up to 0.3 s. Wheels spin from the shared forward speed and steer from the shared steering angle.
- A driver who goes quiet for 6.5 s is dropped. A hidden tab keeps sending a keepalive, so a friend who alt-tabs freezes in place instead of vanishing.
- **Grid**: two staggered columns, 7.5 m between consecutive cars (the same spots the painted boxes mark on a circuit), the host on pole, all behind the line. Eight cars fill four rows over about 58 m. A driver who leaves mid-race simply drops out of the live standings; if they had already finished, their time stays on the results card. Driver colours are assigned on arrival from an 8-colour palette and stay fixed for the session.
- Race progress is measured along the road centerline every 100 ms and only counts while you are on the road, which stops shortcuts across the map. You finish once you have crossed the start line and come all the way round. The race ends when everyone has finished, or 45 s after the first finisher.
- **Countdown**: whoever starts the race picks `startAt = Date.now() + 3000` and broadcasts it in the `race` message. Every client — including the one who started it — counts down against that same shared timestamp, so 3, 2, 1, GO lands at (close to) the same real-world instant everywhere, regardless of when the broadcast physically arrived on each connection. This replaced an earlier version where each client started its own independent 3-second timer the moment its own copy of the message showed up, which meant the whole room's countdowns silently drifted apart by however much everyone's connection latency differed.
- **Ping**: each client sends a small `pg` (ping) with its own timestamp, to one named peer at a time, round robin. That peer echoes it straight back as `pk`; the round-trip time is kept per peer and shown in the room list (and feeds the countdown clock sync). With 8 drivers every peer is re-measured about every 20 s, which is plenty for a display number; pinging everyone every 1.5 s would cost 37 messages a second plus replies and was dropped.
- Everything is trust based. Finish times are reported by each player's own game, and a `kick` is just a message any peer could technically forge — fine for a small friend-room arcade game, not worth building server-side auth for.
- **Drawn circuits are not networked yet.** Racing together currently only works on the main map's fixed loop. If you draw your own track (see `README.md`), that's solo only for now — see `ROADMAP.md` for what a networked version of that would need (the room would have to share the control points, not the generated mesh, so everyone builds an identical track locally).

## Configuration

At the top of the `MP` block in `assets/game.js`:

| Constant | Default | Meaning |
| --- | --- | --- |
| `window.SKR_ROOMS_WS` in `assets/net-config.js` | empty | wss:// address of the deployed room server (empty means multiplayer is offline locally; on localhost the game uses ws://localhost:8787) |
| `MAXP` | 8 | drivers per room |
| `POSE_BUDGET` | 52 | pose messages per second for the whole room, split between drivers |
| `HZ_MAX` / `HZ_MIN` | 20 / 6 | per-driver pose rate limits (rate = budget / drivers) |
| `STALE` | 6500 | ms of silence before a driver is dropped |
| `CD_LEAD` | 3000 | ms of countdown lead time before GO (also the slack for the `race` broadcast to reach everyone) |

The URL and anon key currently point at the `launchpad` Supabase project. The anon key is public by design and only Realtime is used. To use another project, replace those two values. Realtime must allow public channels, which is the default, and nothing else needs setting up.

## Network budget

The room server runs on Cloudflare Workers and Durable Objects, so the limit is now the Cloudflare plan's request and duration allowance (check your plan's current numbers). Each sender is rate limited to 60 messages a second, with bursts of 120 (see `worker/src/room.ts`). The game stays well under that at 8 drivers, counting messages *sent* by clients:

| Source | Rate at 8 drivers |
| --- | --- |
| Poses (`s`), 6 each per second | 48 |
| `hi` keepalive, every 3 s each | ~2.7 |
| Pings: 1 `pg` per 2.5 s each plus the reply | ~6.4 |
| Chat (1 per 0.9 s max), emotes (0.7 s min), horn on/off, ready votes | bursts only |
| Phone controller (`ctrl`) | ~3 per phone while idle, up to 20 per phone while steering (it used to be a constant 30 per phone) |
| **Typical total** | **~60 a second** |

The pose rate is `floor(52 / drivers)` clamped to 6..20, so a 2-driver room still gets 20 a second and an 8-driver room 6. A parked car sends 2 a second. Note that the Durable Object sends each message to the other drivers (7 deliveries per message with 8 drivers); if your plan counts deliveries against the limit, lower `POSE_BUDGET`. It has not been measured against a live 8-person room from this repository, so run one and watch the Realtime dashboard before relying on it.

## Testing without a server

Add `?net=local` and rooms link tabs in the same browser through a BroadcastChannel. Open up to eight tabs at `/?room=TEST&net=local` to see the ghosts.

Run the room server locally with `cd worker && npm run dev`, then open the game on http://localhost:8000.

## Where the code is

- `assets/game.js`: the `MP` block, just before the start-up section, plus one `MP.tick` call per frame.
- `index.html`: the Room button, room panel, list and countdown, and their styles.
