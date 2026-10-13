# Brief: build the scenery for ONE real F1 circuit

The game is a three.js (r128) browser racer in `/home/claude/swastikkkkk/swastikk-drive`. Real F1 circuits are
already built from GPS data at real size (`assets/f1-circuits.js`, `window.F1_CIRCUITS`): road, kerbs, barriers,
elevation, pit lane, grandstands, generic trees, and any tunnel / overhead bridge listed for the circuit. Your job is
the **recognisable landmarks** that make the circuit feel like the real place.

## What you write

Exactly one file: `assets/f1-landmarks/<id>.js`, containing only:

```js
window.F1Landmarks['<id>'] = function (ctx) {
  // build meshes with ctx.THREE and add them with ctx.add(mesh)
};
```

Plain JavaScript (ES2015 is fine). No imports, no network, no image or model files: geometry from three.js
primitives, colours from materials, and optionally text or patterns drawn on a `document.createElement('canvas')`
turned into a `THREE.CanvasTexture`. Do not edit any other file.

## The ctx you get

| field | meaning |
|---|---|
| `ctx.THREE` | three.js r128 |
| `ctx.at(u)` | point on the road centreline at lap fraction `u` (0 = start/finish line, increasing in the race direction): `{x, y, z, tx, tz, lx, lz, yaw}`. `(tx,tz)` = unit direction of travel, `(lx,lz)` = unit vector to the driver's LEFT, `y` = road height, `yaw` = heading for `object.rotation.y` so its local +z points along the road |
| `ctx.ground(x,z)` | terrain height at a point: stand things on it (`mesh.position.y = ctx.ground(x,z) + height/2`) |
| `ctx.clearOf(x,z,r)` | true if a circle of radius `r` at (x,z) stays clear of EVERY part of the track (road + barriers + 2 m). Every object must pass this with `r` = its half-size |
| `ctx.trackDist(x,z)` | distance to the nearest road centreline, metres |
| `ctx.clear` | the minimum centreline distance anything may stand at (road half-width + barrier + 2 m) |
| `ctx.mat(color, opts)` | MeshStandardMaterial (flat-shaded low-poly look). `ctx.basic(color, opts)` = MeshBasicMaterial (unlit: lit windows, neon, signs) |
| `ctx.add(obj)` | add to the scene (always use this, never ctx.root) |
| `ctx.solid(mesh)` | give a mesh a static collision box. Use it for big buildings/walls within ~60 m of the track that a car could reach; not for far-away scenery |
| `ctx.night`, `ctx.dusk` | the race runs at night / dusk: light the windows, signs and street lamps (ctx.basic colours) |
| `ctx.rand()` | seeded random 0..1 (use it instead of Math.random so every player sees the same scene) |
| `ctx.lengthM`, `ctx.roadHalf`, `ctx.theme` | lap length, half road width, scenery theme id |

World axes: metres, **y up, +x = east, -z = north** (the circuit is laid out like a north-up map). So the real
geography you know works directly: for example the sea to the south of a circuit is at larger z.

## How to place things

- Put landmarks where they really are relative to the track. Use the corner positions you are given (lap fractions)
  plus your knowledge of the real place: `const p = ctx.at(0.27); x = p.x + p.lx * 45` puts something 45 m to the
  left of the road at Casino Square; use `-p.lx` for the right. Use compass directions (above) for big features like
  a sea, lake, river or mountains.
- Real sizes (a grandstand ~100 m long, a hotel 20-40 storeys at ~3.2 m a storey, a yacht 20-60 m).
- Big flat features (sea, lake, harbour water, sand) are a large plane slightly above the ground (`y = ctx.ground(x,z) + 0.05`)
  that must also stay clear of the track: shape it (several boxes/planes) so it never reaches under the road.
- Low-poly style like the rest of the game: boxes, cylinders, cones, simple extrusions; flat colours; a few
  canvas textures for windows/signs at most.
- Repeated things (trees, yachts, windows, lamp posts, palm trees, spectators) = `THREE.InstancedMesh`.
- Budget: at most 150,000 triangles and about 150 meshes in total (count an InstancedMesh as one mesh).
- Nothing may stand on the road or in the run-off: the checker below rejects any mesh closer than `ctx.clear`.
  The only exception is a structure whose lowest point is above 7.5 m over the road (e.g. a hotel built over a tunnel
  roof that the game already builds) - only do that where the brief for your circuit says so.

## Check your work (required)

From the repo root run:

```
cd /home/claude/swastikkkkk/swastikk-drive && node scripts/f1-landmark-check.js <id>
```

It loads your file with the real three.js and the real circuit, and prints the triangle count, the scene extent and
every mesh that is too close to the track. Fix and re-run until it ends with `OK`. Also run `node --check` on your file.

## Your final answer

A short list: each landmark you built, where (lap fraction + left/right + distance, or compass position), its size,
and the final checker numbers (meshes, triangles, OK). No other text.
