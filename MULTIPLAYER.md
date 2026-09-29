# Multiplayer

Race up to three people on the same road as see-through ghost cars. No collisions, no accounts. A room is just a code.

## Play

1. Open the game and click **Room** (top right on desktop, inside **Menu** on a phone).
2. Type a name, then **Create a room**. You get a 5 character code.
3. Send friends the code, or the invite link (`https://swastikk-drive.vercel.app/?room=CODE`). Opening the link joins the room straight away.
4. Everyone drives their own car. Other drivers show up as translucent ghosts with a name tag above the car. The list at the top center shows who is in the room and how far away they are.
5. Anyone can press **Start race**. Everyone is put on the grid behind the start line, a 3, 2, 1 runs, then it is one lap around the loop. The list switches to positions with gaps, and finish times appear next to each name.

A room holds three drivers. A fourth person gets "Room is full".

## How it works

Every player runs their own physics. Only a small pose is shared, so a ghost has no body in anyone else's world and nothing can collide.

Transport is a Supabase Realtime broadcast channel named `drv-<CODE>`. The game speaks the Realtime websocket protocol directly, with no client library. There are no tables, no presence and nothing stored. A channel exists only while someone is on it.

| Message | Sent | Carries |
| --- | --- | --- |
| `hi` | on join, then every 3 s | name, join time |
| `s` | 10 times a second | position, rotation, steering, forward speed, race progress, name, join time |
| `race` | when someone starts a race | nothing |
| `fin` | when you finish | your time in ms |
| `bye` | when you leave | nothing |

Details worth knowing:

- Room order comes from each player's join time. The three earliest are in. Later joiners are ignored by everyone and leave with "Room is full".
- Ghosts are drawn from the last pose plus a short velocity extrapolation (up to 220 ms), then smoothed, so 10 updates a second looks continuous. Wheels spin from the shared forward speed and steer from the shared steering angle.
- A driver who goes quiet for 6.5 s is dropped. A hidden tab keeps sending a keepalive, so a friend who alt-tabs freezes in place instead of vanishing.
- Race progress is measured along the road centerline every 100 ms and only counts while you are on the road, which stops shortcuts across the map. You finish once you have crossed the start line and come all the way round. The race ends when everyone has finished, or 45 s after the first finisher.
- The countdown starts when each player's game receives the start message, so starts can differ by the network delay, usually well under a second.
- Everything is trust based. Finish times are reported by each player's own game.

## Configuration

At the top of the `MP` block in `assets/game.js`:

| Constant | Default | Meaning |
| --- | --- | --- |
| `CFG.ws` | project websocket URL | Supabase Realtime endpoint |
| `CFG.key` | public anon key | key sent with the connection |
| `MAXP` | 3 | drivers per room |
| `HZ` | 10 | pose updates per second |
| `STALE` | 6500 | ms of silence before a driver is dropped |

The URL and anon key currently point at the `launchpad` Supabase project. The anon key is public by design and only Realtime is used. To use another project, replace those two values. Realtime must allow public channels, which is the default, and nothing else needs setting up.

Three drivers at 10 updates a second is about 30 messages a second per room, which matters if you are on a free Supabase plan.

## Testing without a server

Add `?net=local` and rooms link tabs in the same browser through a BroadcastChannel. Open two tabs at `/?room=TEST&net=local` to see the ghosts.

## Where the code is

- `assets/game.js`: the `MP` block, just before the start-up section, plus one `MP.tick` call per frame.
- `index.html`: the Room button, room panel, list and countdown, and their styles.
