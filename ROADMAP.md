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
1. Performance audit (do this before any new content):
   - First pass done: measured via the headless rig with `R.info` exposed temporarily. Default map, settled scene:
     **213 draw calls** (spec target <150, ideally <100), **~397K triangles**, 229 geometries, 21 textures. Draw calls and
     triangle count are hardware-independent so these are real, actionable numbers. Textures/geometries counts look
     healthy already (shared, not duplicated per earlier code read: trees/rocks/reeds/lilies/grass/barriers/posts already
     use `InstancedMesh`, weather already uses batched `THREE.Points` not per-particle meshes) - the draw-call overage is
     most likely from the many one-off decorative meshes (signs, cones, tires, ramps, individual landmark parts) that
     aren't instanced, not from the systems the original spec worried about most.
   - **Could NOT get a real FPS number.** The headless rig renders via swiftshader (software GL) in a sandboxed VM, which
     is routinely 10-50x slower than real GPU hardware - it measured 4.3 FPS, which says nothing about real laptop
     performance and should not be used to judge "does it lag". Next step needs either a real browser with a real GPU
     (F12 → Performance/FPS meter) or someone running it locally, not this sandbox.
   - Done: instanced the playground/bowling props. Crates (10), cones (7), tires (5), and bowling pins (10, each with 2
     stripe rings) were each a separate `THREE.Mesh`/`Group` per prop - 69 draw calls total across the four kinds. Added
     `dynBoxI(parts,...)`: one physics body drives one or more `InstancedMesh` slots (`setMatrixAt` composed from the
     body's transform plus an optional local-offset matrix for sub-parts like a cone's base or a pin's stripes), synced
     once per frame with preallocated Vector3/Quaternion/Matrix4 temps (no per-frame allocation) instead of moving a
     whole `Object3D` per prop. Result: 69 draw calls -> 6 (`crateIM`, `coneIM`, `coneBaseIM`, `tireIM`, `pinBodyIM`,
     `pinStripeIM`), each still independently knockable since physics is per-body, only the rendering is batched.
     Deliberately dropped crates' thin black edge-outline decoration (`EdgesGeometry`/`LineSegments`) since instancing
     line geometry isn't practical in Three r128 and it was purely decorative.
     Also fixed a live bug found while touching this code: the old dyn-prop reset-if-fallen path called
     `body.velocity.setyou()` - not a real cannon.js method (should be `.set(0,0,0)`) - which would have thrown and
     likely broken the render loop the first time any crate/cone/tire/pin/the bowling ball fell off the map. Dormant
     until triggered, so it hadn't been noticed.
     Verified headless: scene graph shows exactly 6 `InstancedMesh` objects with the expected instance counts
     (10/7/7/5/10/20) and zero leftover `LineSegments`, confirming the old per-object meshes are gone; no console
     errors. Total draw-calls-at-spawn didn't move in testing because these props sit in the playground/bowling area,
     outside the camera's view frustum at the default spawn point - this helps whenever a player is actually near that
     content, not the spawn-camera baseline number, so re-measure facing that area specifically before/after to see the
     real delta. Total scene mesh count elsewhere (~640 individual meshes) is the next place to look for further wins.
   - Still open: identify and consolidate remaining one-off meshes pushing draw calls over 213 in-frustum (profile which ones exist per
     map, group static props into fewer draw calls or InstancedMesh where their transforms allow it), then remeasure.
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
   - Done: `MAXP = 3 -> 4` (index.html copy updated to match). `PAL` already had 4 colors defined, so `colorOf`/roster/room-full
     logic needed no other change. Verified: 2-tab `?net=local` create+join, both tabs see a 2-player roster, no console errors.
     Not yet verified at full 4 players — 4 concurrent software-rendered (swiftshader) tabs exceeds this dev box's headless
     capacity; re-test with 4 real tabs before shipping, or on a machine with real GPU accel.
   - Done: `hi` messages now carry `car:curCarId`; peers store `P.car`, `makeGhost(carId,col,name)` looks up the real `GARAGE`
     spec (shape/dims/wheel radius) instead of hardcoding the default EV / global `V`. Mid-session car changes call
     `mpCarNotify()` (set by `MP` to its `carChanged`, via an indirection var since `MP` isn't declared yet at the point
     `setCar` is first called during page load — a direct `MP.carChanged()` reference there would throw a TDZ error) which
     resends `hi` immediately, and `onMsg` rebuilds the peer's ghost in place, preserving position/visibility.
     Paint intentionally NOT synced — ghost body color stays the room-assigned per-slot `PAL` color for driver identification.
     Verified headless: 2-tab session, peer's ghost is built with the correct car shape, and switching car mid-race updates
     the peer's `car` field and rebuilds the ghost live with no console errors.
   - `race` message carries track control points + laps; receivers build the same circuit deterministically, then countdown.
   - Generalise race progress to laps (`d` in lap units, finish at `d >= laps`), per-track length instead of `TLEN`.
   - Allow solo race (tick must run when `race.st>0` without a room).
   - Room panel: show each player's car, current track, Start race.
   - Ghosts stay non-colliding by design (no authoritative server).
   - Done: ping display. Each client broadcasts `{k:'pg',t:now}` every 1.5s (only while `peers.size`); whoever receives it
     echoes `{k:'pk',t:m.t}` straight back (via the existing `id`-tagging in `send()`, so RTT attributes correctly per
     sender even though it's a broadcast, not a unicast); the original sender computes `now-t`, clamps to 0-9999ms, and
     stores it on `P.ping`. Shown appended to each peer's row in the on-screen roster (`#dmpr`), e.g. "42 m · 87ms" —
     no separate debug HUD, no self-ping (not meaningful). Verified headless: 2-tab session, ping appears in both
     rosters with no console errors; absolute ms values in that test were inflated by swiftshader CPU contention from
     running two full 3D scenes in one sandboxed browser, not a protocol issue — re-check on real hardware for realistic
     numbers.
   - Client-side interpolation for remote cars already existed before this pass: `tick()` extrapolates each peer's
     position from its last received velocity for up to 220ms, then `lerp`s toward it and `slerp`s the quaternion
     (`assets/game.js`, the `peers.forEach` block inside `tick`). Roadmap item satisfied; no rewrite needed here.
   - Done: synchronized countdown. `requestRace()` picks `startAt=Date.now()+CD_LEAD` (CD_LEAD=3000) and broadcasts it
     literally in the `race` message; every client (host included) computes its own countdown as `remain=race.startAt-Date.now()`
     against that same shared epoch value, so "3,2,1,GO" lands at the same real-world instant on every screen regardless
     of when the broadcast physically arrived - previously each client independently started its own 3000ms timer the
     moment ITS OWN copy of the 'race' message showed up, so the whole room's countdowns silently drifted by however much
     their connection latencies differed. A late straggler (network delay exceeding CD_LEAD) just skips straight to GO
     instead of getting stuck. Verified the remain->displayed-number formula with a standalone unit check (all edge
     cases incl. exact 1000/2000/3000ms boundaries and negative/straggler values pass); the 2-tab headless race did
     reach GO on both sides with no errors, but the measured skew there was ~9s - traced to this sandbox's swiftshader
     CPU contention starving one tab's render loop while running two full 3D scenes at once (same class of artifact
     seen in earlier multi-tab tests), not the sync logic - re-verify with a stopwatch on two real machines.
   - Done: kick from room. Whoever's been in the room longest (`sorted()[0]`, i.e. lowest join time `j` - a convention
     every client computes identically, not an enforced server role) sees a small × button next to each other player's
     row in the room panel list. Clicking it drops that peer locally right away and broadcasts `{k:'kick',target:id}`;
     the targeted client sees its own id and calls `leave()`. No server authority exists in this game (by design - see
     "Ghosts stay non-colliding" above), so a peer could technically forge a kick message; acceptable for a small
     friend-room arcade game, not worth building auth for. Verified headless: host sees exactly one kick button for
     the one peer, clicking it drops the peer from the host's `peers` map and the kicked client's `room` state clears.
   - Still open: reconnect/DNF handling.
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
