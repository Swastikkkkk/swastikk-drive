# Racing upgrade: context, done, left

Branch: `racing-wip`. Game is one file: `assets/game.js` (one IIFE, ~2400 lines, dense). Page/HUD/styles: `index.html`.
Stack: Three.js r128 + cannon.js 0.6.2 (cdnjs), plain JS, Supabase Realtime broadcast for rooms.

## Goal (from Swastik)
Wider roads, bigger map, more weather options, a mode where you draw a circuit and race on it,
pick a name and one of 5-6 cars, proper end-to-end racing feel, multiplayer up to 4 per room.

## Done (committed)
- Map scale: `MK 1.45 -> 2.1`, `LAND 1.5 -> 1.75`, terrain grid `ES 3 -> 5` (`7` on LOW) to keep vertex count flat.
  Outer zones (stunt park, UFO, volcano in `VZ`) scaled by `VK = MK/1.45`. Tree/rock/tuft/scrub counts roughly doubled.
- Road width: `RWX = 3.4` extra half-width. Asphalt 5.8 -> 12.6, shoulder 7.6 -> 14.4, branch road widened.
  Everything road-relative moved out by `RWX`: kerbs, lamps, gantry, speed trap, `placeAt/faceAt` (dist >= 3),
  traffic lanes, boost pads, terrain flatten corridor, lap/race on-road thresholds, offroad smoke thresholds, prop clearances.
- Weather: 6 new entries in `WEATHERS` (overcast, sunset, storm, fog, sand, blizzard), `PSTYLE` table for particle size/fall/wind,
  lightning flash + thunder for storm, sideways wind wrap for particles.
- `setWeather(id|'auto')` API added; `toggleNight()` now uses it. `wxLock` holds the manual choice (`nightOn` doubles as the "locked" flag).
- Headless test rig works (see below). Game loads with no console errors.

## Known gap in what is committed
- `setWeather` references `MODE` (`'world'|'circuit'`) which is NOT defined yet. Define `let MODE='world'` near the top of the IIFE
  before calling `setWeather` from anywhere. Currently only reachable through the N key path, which calls it, so **define MODE first**.
- No UI yet for picking weather (needs a button in `#drow` + a popover listing chips with `data-w` ids and container `#dwxl`).

## Left (in order)
1. Weather UI: "Weather" button in `#drow`, popover with chips: Auto + every id in `WEATHERS`.
2. Garage + 6 cars:
   - `PCAR` is a `const` at ~line 1430, make it `let`. `V = VEHS.car` is mutable, `Object.assign(V, spec.V)` then `applyVehicle()`.
   - `GARAGE` specs: Aster (EV, balanced), Volt GT (EV, wide/low, fast), Phantom (EV, longest, top speed, twitchy),
     Kestrel (`buildCar` sedan, agile), Ridgeback (`buildCar` wagon, heavy/grippy), Mamba (`buildCar` sedan, quick/loose).
   - `setCar(id, paint)`: swap `PCAR.g` in `vis.bodyIn`, rebuild `wv.car` wheels with `makeWheel(V.r,...)`, set `chassisB.mass`, `updateMassProperties()`.
   - Garage panel: name input (localStorage `sl_name`), car list, stat bars, paint swatches, turntable preview on a second small WebGLRenderer.
   - Auto-open on first visit. Save car in localStorage.
3. Circuit mode (`MODE='circuit'`):
   - Arena = flat platform high above the world at y=900 (sky/shadow/moon already follow the camera, so no other changes needed).
     Physics: big static box. Hide `HF.mesh` while active. Reuse `farRidge.clone()` at y=900 for horizon.
   - Drawer overlay: freehand canvas, resample, smooth, close loop, reject self-intersection, enforce min corner radius,
     scale to Short/Medium/Long lap length, closed `CatmullRomCurve3`, sample ~1 point per 3m.
   - Build: asphalt strip (reuse `roadTex`), kerbs, instanced barriers + physics segments, start gantry, grandstand, tyre walls.
   - Guard world-only code with `MODE==='world'`: `progU` scan, missions, lap timer, traffic, wrong-way, `resetCar` (reset to last checkpoint in circuit).
   - Offroad drag via `ZN.drag` override, circuit minimap in `drawMap`.
   - Race engine: cumulative forward progress along centerline (only counts on road), laps, lap times, best lap, positions, results screen.
   - AI bots for solo: kinematic followers like `traffic`, speed profile from curvature (forward/backward pass), 3 skill levels.
   - 3 preset circuits + saved user circuits (localStorage, max 8).
4. Multiplayer rewrite (`MP` block near the end of `game.js`):
   - `MAXP = 3 -> 4`. Add car id + paint to `hi`/`s` messages; `makeGhost` must build the peer's car with its own `V` spec (currently uses global `V`).
   - `race` message carries track control points + laps; receivers build the same circuit deterministically, then countdown.
   - Generalise race progress to laps (`d` in lap units, finish at `d >= laps`), per-track length instead of `TLEN`.
   - Allow solo race (tick must run when `race.st>0` without a room).
   - Room panel: show each player's car, current track, Start race.
   - Ghosts stay non-colliding by design (no authoritative server).
5. Test + tune: headless screenshots for each car, circuit drawer, race flow, 2-tab `?net=local` room test with 4 tabs.
6. Update `README.md` and `MULTIPLAYER.md` (4 players, cars, circuits, weather, controls).

## Test rig
`/tmp/rig/run.js` (recreate if gone): playwright-core + chromium at `/opt/pw-browsers/chromium`, flags
`--use-gl=swiftshader --enable-unsafe-swiftshader`, serves the repo on :8765, routes the cdnjs three/cannon URLs to local
`three@0.128.0` and `cannon@0.6.2` from npm. Load takes about 16s in software GL. `WAIT=ms OUT=file node run.js`.

## Notes / preferences
- Style: SF system font stack, neutral dark UI, no emojis, no red/coloured glow backgrounds. Match existing `.dbtn` / `.mono` look.
- Multiplayer transport: Supabase Realtime broadcast `drv-<CODE>`, no tables. Free plan message budget: 4 drivers x 10 Hz = 40 msg/s per room.
- Keep captions/copy short and lowercase-free of AI phrasing.
