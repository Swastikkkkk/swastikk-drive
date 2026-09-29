# swastikk-drive

A small driving game that runs in the browser. It opens straight into the game and the road is a closed loop, so you can keep going for as long as you like.

Off the loop there is a stunt park with a mega ramp and a ring of fire, a bowling lane you play with the car, a UFO field and a volcano. There are nine missions, a timed lap, day and night and changing weather.

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

## Racing friends

Open Menu, then Room. Create a room, or type a code someone sent you, and up to three drivers share it. You see each other as see-through ghost cars with a name tag above them, so nothing collides. Anyone in the room can hit Start race for a shared 3, 2, 1 and one lap around the loop; finish times show for everyone. An invite link looks like `?room=CODE`.

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
