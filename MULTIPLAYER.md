# Multiplayer

Race up to four people on the same road as see-through ghost cars. No collisions, no accounts. A room is just a code.

## Play

1. Open the game and click **Room** (top right on desktop, inside **Menu** on a phone).
2. Type a name, then **Create a room**. You get a 5 character code.
3. Send friends the code, or the invite link (`https://swastikk-drive.vercel.app/?room=CODE`). Opening the link joins the room straight away.
4. Everyone drives their own car, built as whichever car they actually chose in the Garage — a ghost's shape isn't a generic placeholder, and it rebuilds live if that player switches cars mid-session. Other drivers show up as translucent ghosts with a name tag above the car. The list at the top center shows who is in the room, how far away they are, and their ping.
5. Anyone can press **Start race**. Everyone is put on the grid behind the start line, a synchronized 3, 2, 1 runs, then it is one lap around the loop. The list switches to positions with gaps, and finish times appear next to each name.
6. Whoever has been in the room the longest can remove another player with the **×** next to their name in the room panel's list.

A room holds four drivers. A fifth person gets "Room is full".

## How it works

Every player runs their own physics. Only a small pose is shared, so a ghost has no body in anyone else's world and nothing can collide.

Transport is a Supabase Realtime broadcast channel named `drv-<CODE>`. The game speaks the Realtime websocket protocol directly, with no client library. There are no tables, no presence and nothing stored. A channel exists only while someone is on it.

| Message | Sent | Carries |
| --- | --- | --- |
| `hi` | on join, then every 3 s, and immediately after a car change | name, join time, car id |
| `s` | 10 times a second | position, rotation, steering, forward speed, race progress, name, join time |
| `race` | when someone starts a race | a shared start timestamp (see Countdown below) |
| `fin` | when you finish | your time in ms |
| `pg` / `pk` | `pg` every 1.5 s while others are in the room; `pk` replies immediately | a timestamp, echoed straight back for round-trip time |
| `kick` | when the longest-present player removes someone | the target's id |
| `bye` | when you leave | nothing |

Details worth knowing:

- Room order comes from each player's join time. The four earliest are in. Later joiners are ignored by everyone and leave with "Room is full". Whoever has the earliest join time is treated as the room's host for the purpose of kicking — a convention every client computes the same way, not a role enforced by a server.
- Ghosts are drawn from the last pose plus a short velocity extrapolation (up to 220 ms), then smoothed with position lerp and quaternion slerp, so 10 updates a second looks continuous. Wheels spin from the shared forward speed and steer from the shared steering angle.
- A driver who goes quiet for 6.5 s is dropped. A hidden tab keeps sending a keepalive, so a friend who alt-tabs freezes in place instead of vanishing.
- Race progress is measured along the road centerline every 100 ms and only counts while you are on the road, which stops shortcuts across the map. You finish once you have crossed the start line and come all the way round. The race ends when everyone has finished, or 45 s after the first finisher.
- **Countdown**: whoever starts the race picks `startAt = Date.now() + 3000` and broadcasts it in the `race` message. Every client — including the one who started it — counts down against that same shared timestamp, so 3, 2, 1, GO lands at (close to) the same real-world instant everywhere, regardless of when the broadcast physically arrived on each connection. This replaced an earlier version where each client started its own independent 3-second timer the moment its own copy of the message showed up, which meant the whole room's countdowns silently drifted apart by however much everyone's connection latency differed.
- **Ping**: each client with peers in the room broadcasts a small `pg` (ping) with its own timestamp every 1.5 s. Whoever receives it echoes it straight back as `pk`; because every message is tagged with the sender's id, the original sender can attribute the round-trip time to the right peer even though it went out as a broadcast, not a direct message. Shown per-player in the room list, not as a single "your ping" number, since ping is a property of a connection between two peers, not of yourself alone.
- Everything is trust based. Finish times are reported by each player's own game, and a `kick` is just a message any peer could technically forge — fine for a small friend-room arcade game, not worth building server-side auth for.
- **Drawn circuits are not networked yet.** Racing together currently only works on the main map's fixed loop. If you draw your own track (see `README.md`), that's solo only for now — see `ROADMAP.md` for what a networked version of that would need (the room would have to share the control points, not the generated mesh, so everyone builds an identical track locally).

## Configuration

At the top of the `MP` block in `assets/game.js`:

| Constant | Default | Meaning |
| --- | --- | --- |
| `CFG.ws` | project websocket URL | Supabase Realtime endpoint |
| `CFG.key` | public anon key | key sent with the connection |
| `MAXP` | 4 | drivers per room |
| `HZ` | 10 | pose updates per second |
| `STALE` | 6500 | ms of silence before a driver is dropped |
| `CD_LEAD` | 3000 | ms of countdown lead time before GO (also the slack for the `race` broadcast to reach everyone) |

The URL and anon key currently point at the `launchpad` Supabase project. The anon key is public by design and only Realtime is used. To use another project, replace those two values. Realtime must allow public channels, which is the default, and nothing else needs setting up.

Four drivers at 10 pose updates a second, plus one ping every 1.5s each, is well under 50 messages a second per room even at full capacity — small if you're on a free Supabase plan.

## Testing without a server

Add `?net=local` and rooms link tabs in the same browser through a BroadcastChannel. Open up to four tabs at `/?room=TEST&net=local` to see the ghosts.

## Where the code is

- `assets/game.js`: the `MP` block, just before the start-up section, plus one `MP.tick` call per frame.
- `index.html`: the Room button, room panel, list and countdown, and their styles.
