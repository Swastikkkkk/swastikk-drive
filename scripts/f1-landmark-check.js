#!/usr/bin/env node
/*
 * Checks one circuit's landmark module without a browser:
 *   node scripts/f1-landmark-check.js <id>        e.g. node scripts/f1-landmark-check.js mc
 * Loads three.js (assets/vendor/three.min.js), the circuit data (assets/f1-circuits.js) and
 * assets/f1-landmarks/<id>.js, runs window.F1Landmarks[id](ctx) with a ctx that behaves like the game's
 * (flat ground at y=0 here), then reports: objects/meshes/triangles, the scene's extent, and every mesh whose
 * footprint comes closer to ANY part of the track than ctx.clear (the barrier line + 2 m) - those would sit on the
 * road or in the barriers in the game and must be moved. Exit code 1 on errors or clearance violations.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const id = process.argv[2]; if (!id) { console.error('usage: node scripts/f1-landmark-check.js <id>'); process.exit(2); }
const ROOT = path.join(__dirname, '..');
// a tiny browser-ish global so three.min.js and canvas-based textures load
const canvasStub = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? (() => ({ width: 10 })) : k === 'createLinearGradient' || k === 'createRadialGradient' ? (() => ({ addColorStop() {} })) : k === 'getImageData' ? (() => ({ data: new Uint8ClampedArray(4) })) : (() => {}), set: () => true }) });
const sandbox = { console, Math, JSON, Date, Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, Uint8ClampedArray, ArrayBuffer, DataView, Map, Set, WeakMap, Symbol, Promise, Proxy, Reflect, Number, String, Array, Object, Error, TypeError, RangeError, parseFloat, parseInt, isFinite, isNaN, setTimeout, clearTimeout,
  document: { createElement: t => t === 'canvas' ? canvasStub() : {}, createElementNS: () => canvasStub() }, navigator: { userAgent: 'node' }, self: null };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const load = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
load('assets/vendor/three.min.js'); load('assets/f1-circuits.js');
const file = 'assets/f1-landmarks/' + id + '.js';
if (!fs.existsSync(path.join(ROOT, file))) { console.error('missing ' + file); process.exit(1); }
sandbox.F1Landmarks = {};
try { load(file); } catch (e) { console.error('LOAD ERROR', e.stack || e); process.exit(1); }
const THREE = sandbox.THREE, C = sandbox.F1_CIRCUITS.find(c => c.id === id);
if (!C) { console.error('unknown circuit ' + id); process.exit(1); }
const fn = sandbox.F1Landmarks[id];
if (typeof fn !== 'function') { console.error('F1Landmarks.' + id + ' is not a function after loading ' + file); process.exit(1); }

// the track as the game builds it: centred points, flat at y=0 for this check
let cx = 0, cz = 0; C.pts.forEach(a => { cx += a[0]; cz += a[1]; }); cx /= C.pts.length; cz /= C.pts.length;
const P = C.pts.map(a => ({ x: a[0] - cx, z: a[1] - cz })), N = P.length;
const W = C.width || 14, BAR = 4.6, clear = W / 2 + BAR + 2;
const cum = [0]; for (let i = 0; i < N; i++) { const a = P[i], b = P[(i + 1) % N]; cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z)); }
const L = cum[N];
function trackDist(x, z) { let best = 1e18; for (let i = 0; i < N; i++) { const a = P[i], b = P[(i + 1) % N], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1; let t = ((x - a.x) * dx + (z - a.z) * dz) / l2; t = Math.max(0, Math.min(1, t)); const px = a.x + dx * t - x, pz = a.z + dz * t - z, d = px * px + pz * pz; if (d < best) best = d; } return Math.sqrt(best); }
function at(u) { u = ((u % 1) + 1) % 1; const d = u * L; let i = 0; while (i < N - 1 && cum[i + 1] < d) i++; const a = P[i], b = P[(i + 1) % N], t = (d - cum[i]) / ((cum[i + 1] - cum[i]) || 1), tx = b.x - a.x, tz = b.z - a.z, hl = Math.hypot(tx, tz) || 1;
  return { x: a.x + tx * t, y: 0, z: a.z + tz * t, tx: tx / hl, tz: tz / hl, lx: tz / hl, lz: -tx / hl, yaw: Math.atan2(tx / hl, tz / hl) }; }
let seed = 12345; const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const root = new THREE.Group(), solids = [];
const ctx = { THREE, root, lengthM: L, roadHalf: W / 2, clear, night: C.raceTime === 'night', dusk: C.raceTime === 'dusk', theme: C.theme, rand,
  at, ground: () => 0, trackDist, clearOf: (x, z, r) => trackDist(x, z) > (r || 0) + clear,
  mat: (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .8, metalness: 0 }, o || {})),
  basic: (color, o) => new THREE.MeshBasicMaterial(Object.assign({ color }, o || {})),
  add: o => { root.add(o); return o; }, solid: m => { solids.push(m); } };
try { fn(ctx); } catch (e) { console.error('RUN ERROR', e.stack || e); process.exit(1); }
root.updateMatrixWorld(true);
let meshes = 0, tris = 0, objects = 0; const bad = [], box = new THREE.Box3(), all = new THREE.Box3(), v = new THREE.Vector3(), m4 = new THREE.Matrix4();
const footprintBad = (b, name) => {   // sample the box's footprint every ~2 m against the whole track
  const nx = Math.max(2, Math.ceil((b.max.x - b.min.x) / 2) + 1), nz = Math.max(2, Math.ceil((b.max.z - b.min.z) / 2) + 1);
  if (b.min.y > 7.5) return null;   // high enough to pass over the road (bridges/roofs are checked by their supports)
  let worst = 1e9; for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const x = b.min.x + (b.max.x - b.min.x) * i / (nx - 1), z = b.min.z + (b.max.z - b.min.z) * j / (nz - 1); worst = Math.min(worst, trackDist(x, z)); }
  return worst < clear ? { name, dist: +worst.toFixed(1), need: +clear.toFixed(1), at: [+((b.min.x + b.max.x) / 2).toFixed(0), +((b.min.z + b.max.z) / 2).toFixed(0)] } : null; };
root.traverse(o => { objects++; if (!o.isMesh) return; meshes++; const g = o.geometry; const triCount = g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
  if (o.isInstancedMesh) { tris += triCount * o.count; if (!g.boundingBox) g.computeBoundingBox(); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); m4.premultiply(o.matrixWorld); box.copy(g.boundingBox).applyMatrix4(m4); all.union(box); const r = footprintBad(box, (o.name || 'instanced') + '#' + i); if (r) bad.push(r); } }
  else { tris += triCount; box.setFromObject(o); all.union(box); const r = footprintBad(box, o.name || g.type); if (r) bad.push(r); } });
console.log(JSON.stringify({ circuit: C.name, objects, meshes, triangles: Math.round(tris), solids: solids.length, extent: all.isEmpty() ? null : { min: [Math.round(all.min.x), Math.round(all.min.y), Math.round(all.min.z)], max: [Math.round(all.max.x), Math.round(all.max.y), Math.round(all.max.z)] }, tooCloseToTrack: bad.length, examples: bad.slice(0, 8) }, null, 1));
if (tris > 150000) { console.error('too many triangles (budget 150000)'); process.exit(1); }
if (bad.length) { console.error(bad.length + ' meshes are closer to the track than ctx.clear - move them (use ctx.clearOf(x,z,radius))'); process.exit(1); }
console.log('OK');
