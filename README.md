# swastikk-drive

A small driving game that runs in the browser. It opens straight into the game and the road is a closed loop, so you can keep going for as long as you like.

Off the loop there is a stunt park with a mega ramp and a ring of fire, a bowling lane you play with the car, a UFO field, a volcano and a barbell monument. There are ten missions, a timed lap, day and night and changing weather.

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

## Run it

It is plain HTML and JavaScript, so any static server works:

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Three.js r128 and cannon.js 0.6.2 load from cdnjs.

## Files

- `index.html` the page, HUD and styles
- `assets/game.js` the whole game
