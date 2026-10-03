# swastikk-drive

A small driving game that runs in the browser. It opens straight into the game and the main road is a closed loop, so you can keep going for as long as you like.

Off the loop there is a stunt park with a mega ramp and a ring of fire, a bowling lane you play with the car, a UFO field and a volcano. There are nine missions, a timed lap, day and night, and changing weather.

## Cars and the Garage

Open Menu, then Garage (it also opens itself the first time you play). There are six cars — Aster (free, balanced), Volt GT, Phantom, Kestrel, Ridgeback and Mamba — each with real differences in top speed, acceleration, grip and steering feel, not just paint. Aster is free; the other five are unlocked with coins earned in-game (see below). Pick a paint color and a name while you're in there; both are remembered.

### Coins

Coins come from playing, not from a store:

| Action | Coins |
| --- | --- |
| Complete a mission | 50 |
| Finish a timed lap | 10 (30 if it's a new best) |
| Complete a lap on a drawn circuit | 10 |

Cars cost 150–600 coins. The Garage shows "Buy · price" on anything you haven't unlocked yet; clicking it spends the coins and switches you to that car in one step, or tells you how many more coins you need.

## Draw your own track

Open Menu, then "Draw track". Freehand-draw a closed loop on the screen; it gets checked (does it close up, does it cross itself, is any corner too sharp) and, if it's valid, built into a real drivable track — asphalt, a bit of scenery around it, lap counting — somewhere off on its own away from the main map. The same button becomes "Go to track" once you have one, and "Back to world" while you're on it. The **Laps** option (1, 2, 3, 5 or 10) in the draw panel is the race's lap count. Pressing GO on your own starts a real race on the circuit: grid, start lights, then exactly that many laps. The lap counter only advances when you drive through every checkpoint gate in order and in the right direction and then cross the start/finish line; skipping a gate, cutting across, reversing over the line or an impossibly fast lap are not counted, and driving the wrong way shows WRONG WAY. In a room, the host's lap setting is the one that applies and it is frozen once the countdown starts. See `ROADMAP.md` for what is still missing (saved-circuit list, etc.).

## Controls

| Key | Does |
| --- | --- |
| W A S D or arrows | drive |
| Space | handbrake |
| Shift | boost |
| H | horn |
| C | change camera |
| L | time a lap |
| B | fastest laps |
| M | map |
| N | day or night |
| R | reset the car |

On a phone it shows on-screen steering, gas, brake and boost. Landscape works best.

### Phone as a controller

In a room, every player (host or guest) has **Connect phone** in the room panel. It shows that player's own QR code; the link carries the room, the player id and a random secret token made for that player, and the game only obeys phone packets that match all three, so one phone can only ever drive its own player. The panel shows WAITING FOR PHONE / CONNECTED / CONTROLLER DISCONNECTED, the keyboard keeps working, and if the phone stops sending for a second its input goes neutral so the throttle never sticks.

## Racing friends

Open Menu, then Room. Create a room, or type a code someone sent you, and up to four drivers share it. You see each other as see-through ghost cars — built with whichever car they actually picked in the Garage, not a generic default — with a name tag above them, so nothing collides. Anyone in the room can hit Start race; everyone's countdown is synchronized to the same shared clock, so 3, 2, 1 lands together instead of drifting by each person's own connection speed. One lap around the loop, then finish times show for everyone. Ping to each other player shows in the room list. Whoever's been in the room longest can remove another player with the × next to their name. An invite link looks like `?room=CODE`.

Rooms run on a Supabase Realtime broadcast channel named after the code. Each player sends their car pose ten times a second and nothing is stored. The project URL and public anon key are at the top of the `MP` block in `assets/game.js`; swap them to use your own project. Add `?net=local` to link two tabs on one machine without any server.

## Run it

It is plain HTML and JavaScript, so any static server works:

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Three.js r128 and cannon.js 0.6.2 load from cdnjs.

## Files

- `index.html` the page, HUD and styles
- `assets/game.js` the whole game
- `ROADMAP.md` what's done, what's in progress, and what's deliberately not built yet
- `MULTIPLAYER.md` how the room/ghost system works under the hood
