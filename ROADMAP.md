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
2. Circuit mode (`MODE='circuit'`) - **first slice done**, deliberately scoped small and verified before adding more:
   - Draw: `#dcircb` ("Draw track"/"Go to track"/"Back to world", state-dependent) opens a fullscreen pointer-drag canvas
     (`#dcirc`). On release: resample to a fixed ~110-point density (picking `step` from the path's own length up front,
     NOT resampling-then-truncating - truncating after the fact silently chopped off the closing stretch of the loop in
     testing, which both broke closure and hid a genuine self-crossing that fell past the old 140-point cutoff, so this
     is a real bug found and fixed, not a hypothetical), reject if too small, reject if it doesn't close back near the
     start, reject on any non-adjacent segment self-intersection (`segInt`, standard segment-crossing formula), reject
     on any single-vertex turn sharper than 95°. Each rejection shows a specific reason in `#dcircerr`.
   - Build: valid loop -> closed `CatmullRomCurve3` scaled so its perimeter is a fixed 420m (no Short/Medium/Long choice
     yet), placed at a fixed spot far outside the main map (`CIRC_X,CIRC_Z` well past `WS`) rather than the original
     y=900-elevated-platform idea - confirmed sky/stars/moon already re-anchor to the camera every frame regardless of
     position (`sky.position.copy(C.position)` etc in `loop()`), so an XZ offset alone needed zero other setup and is
     simpler than elevating. Asphalt ribbon reuses `roadM`/`edgeM` via a generic `circStrip()` (same recipe as the
     world's own `strip()`). Collision is deliberately just one big flat static box under the whole loop + margin - off-
     road is a logical distance-to-centerline thing, same as the main map already does, not a physical curb wall.
   - Race: `chassisB` teleports to the start point on entry (world position saved and restored on "Back to world"); lap
     progress is a nearest-point search on a sampled array of the circuit curve (same pattern as the world's own `progU`),
     wrapping from u>.82 back to u<.18 counts a lap, announced via `toastMsg` with `fmtT`, best lap tracked in memory.
     `resetCar()` (R key, and the fall-through/flip safety checks) branches to the circuit's own curve when `MODE==='circuit'`
     instead of the world's `at(progU)`, so those don't warp the player back to the main map.
   - Guarded world-only per-frame systems with `MODE==='world'`: the `progU`/lamp/summit/mood scan, the missions block,
     `updTraffic`, `WORLDFX`/`WORLD2`, and the world's own "Time a lap" (`raceMode`) block - none of these make sense
     against a circuit's coordinates. `ZN` (drag zone) is forced to a neutral `{drag:0}` in circuit mode instead of
     calling `zoneAt(progU)` with a stale/irrelevant `progU`.
   - Verified headless end-to-end: draw a valid ellipse -> accepted -> enter -> car teleports and `MODE` flips -> drive
     15s -> lap-progress metric genuinely advances (0 -> 0.14, confirming the nearest-point search tracks the real drawn
     track, not just "didn't crash") -> leave -> position and `MODE` restored exactly. Separately verified both
     rejection paths fire for the right reason (tiny scribble -> "bigger loop"; a deliberately self-intersecting bowtie
     -> "crosses itself", which is what caught the truncation bug above). No console errors in any of it.
   - Done: environment dressing, so the track isn't a strip of asphalt floating in a void. `buildCircuit` now also adds
     a wide grass-colored field plane under/around the paved plate and a scattered ring of instanced trees (trunk +
     cone canopy, 2 `InstancedMesh`) placed at a radius derived from the plate's own diagonal (`Math.hypot(hx,hz)`, not
     `max(hx,hz)`) so trees can never land inside the rectangle regardless of how lopsided the drawn loop is. Dedicated
     materials, not the world's shared `groundM`/`leafM`/`trunkM`, so weather picked on the main map can't bleed into
     circuit colors. `clearCircuit()` now disposes exactly the materials this circuit created (`ownedMats`, an explicit
     list built in `buildCircuit`) - NOT a blanket "dispose whatever the traverse finds", which would have disposed the
     world's shared `roadM`/`edgeM` too (caught this in review before it shipped, not after).
     Verified headless: no console errors; scene graph shows the field plane plus two new `InstancedMesh` objects at
     the expected tree count; full draw -> enter -> drive -> leave cycle still clean afterward.
   - Confirmed, not a new feature: "shouldn't collide/meet, one path" was already guaranteed by the existing
     self-intersection validation - any accepted loop is a single non-crossing path by construction.
   - Found and reverted during this pass: tried a double-click-to-redraw shortcut on the same button, since right now
     once a circuit exists there is no way back into the drawer to replace it. Reverted because browsers fire
     click→click→dblclick on one element, so it would briefly enter-then-leave the circuit (full save/restore/toast
     noise) before the drawer opened - a half-working shortcut is worse than an honest gap. Redrawing needs a page
     reload for now; a real fix needs its own UI entry point (e.g. a small "New track" control), not a click hack.
   - Done: a stadium around every circuit, and 7-8 preset circuits (**not** 7-8 hand-built open worlds like Green
     Loop - see the honesty note below). `buildCircuit(pts2D, theme)` now takes an optional theme object (ground/field/
     tree/trunk/leaf/stand/standTrim/fog/sky colors + a `tree` style of `'pine'|'palm'|'rock'|'none'`); freehand-drawn
     tracks still default to the original green `THEME_DEFAULT` unchanged. Added per circuit: a continuous perimeter
     barrier wall (reusing `circStrip` on a curve offset inward from the tree radius), 6-14 grandstand blocks
     (2 `InstancedMesh` - seating block + trim) spaced around the ring and all facing the track center via
     `atan2`, and 4+ floodlight pylons (2 more `InstancedMesh`) interspersed between them. Fog and sky background tint
     to the theme on `enterCircuit()` and restore to the exact prior value on `leaveCircuit()` (`worldFogSave`, captured
     once so day/night/weather changes elsewhere never get clobbered by a stale restore value).
     `TRACK_PRESETS`: 8 entries, each a `{name, theme, shape}` pairing one of 8 distinct `THEMES` (Meadow, Desert, Snow,
     Forest, Volcanic, Coastal, Night, Canyon) with one of 8 distinct track outlines generated via `polarShape(rx,ry,mod)`
     - a polar radius function `r(angle)` is a simple (non-self-intersecting) closed curve *by construction*, since
     there's exactly one radius per angle, which sidesteps needing to hand-author and manually verify 8 point lists
     against the same crossing checks the freehand drawer uses. A "Circuits" menu button opens a picker listing all 8;
     picking one calls `buildCircuit` + `enterCircuit` directly, skipping the freehand validator entirely since these
     are developer-authored, not user-drawn. Extracted the freehand path's scale-to-`CIRC_LEN`-and-center-on-centroid
     logic into a shared `normalizeLoop()` so presets and freehand drawings size identically.
     Verified headless: all 8 presets listed with correct name/theme text; each one entered, tinted the sky to its
     exact theme hex, was driven on for over a second, and exited cleanly with correct button-state transitions -
     zero real console errors across all 8, not just a sampled few. Separately spot-checked that forest (pine) produces
     `ConeGeometry` instances and volcanic (rock) produces `DodecahedronGeometry` instances, confirming the tree-vs-rock
     branch actually fires correctly per theme rather than both silently rendering the same thing. Re-ran the freehand
     draw -> enter -> drive -> leave cycle afterward as a regression check on the `buildCircuit` signature change - still
     clean.
     **Honesty note**: this is 8 different track shapes/themes on ONE shared circuit engine (asphalt loop + flat
     collision plate + stadium ring), not 8 independently hand-built worlds with unique terrain algorithms, physics
     zones, and landmarks the way the original "Green Loop" map is (~2400 lines on its own). That would be many more
     sessions of work. This delivers real, verified variety now without pretending it's something bigger than it is.
   - Explicitly NOT in this pass: checkpoints/anti-cheat beyond the simple wrap-detection above, AI bots, Short/Medium/
     Long length choice, saved circuits (localStorage), minimap integration, a proper redraw entry point for the
     freehand drawer, and multiplayer circuits (`race` message carrying control points). Each is a legitimate next
     slice, not forgotten. Also not done: 7-8 fully independent open-world maps in the Green Loop sense - see the
     honesty note above and the "Map/vehicle expansion" item further down.
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
6. Map/vehicle expansion toward the bigger-picture spec's 10 maps — only after 1-5 above are solid.
7. Vehicle economy — **done**. `sl_coins`/`sl_unlocked` in localStorage; Aster stays free, the other five cost
   150/220/300/400/600 (`price` field added to each `GARAGE` entry). Earn 50 on any mission complete, 10 on a world
   "Time a lap" completion (30 if it's a new best), 10 per circuit lap - each folded into the toast that action already
   shows (e.g. "Lap · 0:41.20 · +10 coins") rather than firing a second competing toast, since the game's toast is a
   single overwriting element and two firing at once would just race. Garage list shows "Buy · price" on locked cars;
   clicking one with enough coins deducts, unlocks, and equips it in one step, with insufficient funds showing exactly
   how many more coins are needed instead of silently failing.
   Migration handled explicitly: players who already had a paid car selected via `sl_car` before this system existed
   get that car grandfathered into `sl_unlocked` the first time it initializes, so shipping this doesn't retroactively
   lock anyone out of a car they'd already picked.
   Verified headless: fresh state shows correct lock/price text on all 5 paid cars; buying with insufficient coins
   correctly rejects (coins/selection unchanged); buying with enough coins deducts the right amount, unlocks, selects,
   and updates the list item's text/state; a full page reload confirms coins/unlocked/selected-car all persisted. No
   console errors.

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
