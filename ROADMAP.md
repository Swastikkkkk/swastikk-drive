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
- `MODE` defined (`let MODE='world'` near the top of the IIFE, right after `VEHS`), fixing the crash on the `N` key / any `setWeather` call.
- Weather UI: "Weather" button in `#drow` (`#dweatherb`), popover `#dwx`/`#dwxl` with chips for Auto + every id in `WEATHERS` (13 total).
  Click toggles the popover, clicking a chip calls `setWeather(id)` and closes it; outside-click and picking a chip both close it.
  Verified headless: no console errors, all 13 chips render, clicking "Storm" sets it with no throw (`assets/game.js` ~1385-1525,
  `index.html` `#drow`/CSS near `.drow.open`).
- Garage + 6 cars: `GARAGE` array (Aster/Volt GT/Phantom EVs via `buildEV`, Kestrel/Ridgeback/Mamba via `buildCar`), `setCar(id,paint)`
  mutates the shared `V` spec object in place (`Object.assign(V,spec.V)` then `applyVehicle()`), swaps `PCAR.g`/`wv.car` meshes, sets
  `chassisB.mass`+`updateMassProperties()`, repositions the contact shadow, reapplies `cubeRT` reflection to new materials.
  Garage panel (`#dgarage`): name input, car list, blurb, paint swatches; auto-opens on first visit; persists `sl_car`/`sl_name`.
  Turntable preview (second WebGLRenderer) was skipped as a stretch goal — not implemented.
  Verified headless: button exists, 6 cars + 4 paints render, switching cars updates `.on` state correctly, `sl_car`/`sl_name` persist.

## Bigger picture
Swastik dropped a much larger production spec (10 maps, 5-car economy w/ purchases, full netcode rewrite with clock-sync/
interpolation/jitter-buffer, checkpoint-based race engine, AI racing, quality tiers, etc). That doc's own instructions say to
work it in phases — audit/fix performance FIRST, then core architecture, then content — rather than attempt it all at once.
Treat items below as the concrete next steps within that Phase-1/2 window; re-derive later phases (maps, vehicles-economy,
multiplayer rewrite) from the pasted spec when picking this back up rather than re-copying it here.

## Left (in order)
1. Performance audit (do this before any new content): measure current FPS/draw calls/physics body count/particle count in this
   headless rig or a real browser profiler, identify the actual bottleneck (don't guess), fix it, remeasure. Candidates already
   visible in the code: per-object materials/geometries that could share instances, shadow casters, particle systems using
   individual meshes instead of `THREE.Points`.
2. Circuit mode (`MODE='circuit'`):
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
3. Multiplayer rewrite (`MP` block near the end of `game.js`):
   - `MAXP = 3 -> 4`. Add car id + paint to `hi`/`s` messages; `makeGhost` must build the peer's car with its own `V` spec (currently uses global `V`).
   - `race` message carries track control points + laps; receivers build the same circuit deterministically, then countdown.
   - Generalise race progress to laps (`d` in lap units, finish at `d >= laps`), per-track length instead of `TLEN`.
   - Allow solo race (tick must run when `race.st>0` without a room).
   - Room panel: show each player's car, current track, Start race.
   - Ghosts stay non-colliding by design (no authoritative server).
   - Per the bigger-picture spec: also add ping display, synchronized countdown via shared `startAt` timestamp, client-side
     interpolation buffer for remote cars (lerp position / slerp quaternion, never snap), reconnect/DNF handling.
4. Test + tune: headless screenshots for each car, circuit drawer, race flow, 2-tab `?net=local` room test with 4 tabs.
5. Update `README.md` and `MULTIPLAYER.md` (4 players, cars, circuits, weather, controls).
6. Map/vehicle expansion toward the bigger-picture spec's 10 maps / 5-vehicle economy — only after 1-5 above are solid.

## Test rig
Recreate as a throwaway script (don't commit it): playwright-core + chromium, flags
`--use-gl=swiftshader --enable-unsafe-swiftshader`, serves the repo on :8765, routes the cdnjs three/cannon URLs to local
`three@0.128.0` and `cannon@0.6.2` from npm. Load takes about 16s in software GL.
On a sandboxed Linux agent, chromium may already sit at `/opt/pw-browsers/chromium`; otherwise
`npm i -D playwright-core three@0.128.0 cannon@0.6.2 && npx playwright install chromium` pulls the browser (~115MB) into
the default cache dir (`~/.cache/ms-playwright` or, on Windows, `%LOCALAPPDATA%\ms-playwright`). Delete `node_modules`,
`package.json`/`package-lock.json` and the rig script itself before committing — they're not part of the game.

## Notes / preferences
- Style: SF system font stack, neutral dark UI, no emojis, no red/coloured glow backgrounds. Match existing `.dbtn` / `.mono` look.
- Multiplayer transport: Supabase Realtime broadcast `drv-<CODE>`, no tables. Free plan message budget: 4 drivers x 10 Hz = 40 msg/s per room.
- Keep captions/copy short and lowercase-free of AI phrasing.
