#!/usr/bin/env node
/*
 * Builds the real surroundings of the F1 circuits for the game: assets/real/<id>.json
 *
 *   node scripts/build-real-world.js <raw dir> [<bacinger checkout>] [ids...]
 *     raw dir: the output of scripts/fetch_real_world.py (<id>.osm.json, <id>.dem.json)
 *
 * Everything is converted into the game's own coordinates (metres, x east, z south, centred like F1.build), so the
 * game only has to draw it. Per circuit:
 *   - terrain: the elevation grid with rooftops and canopy spikes opened away (anything narrower than ~70 m), then
 *     bent near the track so the ground meets the road (real cuttings and embankments), sea and lakes pushed under
 *     their water; heights relative to the road at the start line
 *   - road profile: the researched profile when there is one, else the cleaned terrain along the lap
 *   - buildings (footprint + height), water surfaces, piers, nearby roads, trees scattered in woods and parks
 *   - anything that would stand on the track or in its run-off is dropped
 * Map data (c) OpenStreetMap contributors (ODbL). Elevation: Mapzen terrain tiles.
 */
const fs = require('fs'), path = require('path');
const { geo, circuits } = require('./real-georef.js');
const RAW = process.argv[2] || '/home/claude/realraw', SRC = process.argv[3] || '/tmp/f1src/f1-circuits';
const ONLY = process.argv.slice(4);
const OUT = path.join(__dirname, '..', 'assets', 'real');
fs.mkdirSync(OUT, { recursive: true });

const CELL = 10;                 // terrain grid, metres
const SM = t => (t = Math.max(0, Math.min(1, t)), t * t * (3 - 2 * t));
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pip(x, z, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function scan(rings, z0, dz, nz, cb) {   // even-odd fill of rings (outer + holes) row by row: cb(row, xa, xb)
  const E = []; for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; if (a[1] !== b[1]) E.push(a[1] < b[1] ? [a, b] : [b, a]); }
  let lo = Infinity, hi = -Infinity; E.forEach(e => { lo = Math.min(lo, e[0][1]); hi = Math.max(hi, e[1][1]); });
  for (let j = Math.max(0, Math.ceil((lo - z0) / dz)); j < nz && z0 + j * dz <= hi; j++) { const z = z0 + j * dz, X = [];
    for (const [a, b] of E) if (z >= a[1] && z < b[1]) X.push(a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]));
    X.sort((p, q) => p - q); for (let k = 0; k + 1 < X.length; k += 2) cb(j, X[k], X[k + 1]); } }
function area(ring) { let s = 0; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function simplify(pts, eps) {   // Douglas-Peucker on an open polyline
  if (pts.length < 3) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1; const A = pts[a], B = pts[b], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - A[0]) * dz - (pts[i][1] - A[1]) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]); }
function simplifyRing(ring, eps) {   // closed ring: split at the farthest point so Douglas-Peucker has a real baseline
  if (ring.length < 5) return ring; let fi = 0, fd = -1; ring.forEach((p, i) => { const d = (p[0] - ring[0][0]) ** 2 + (p[1] - ring[0][1]) ** 2; if (d > fd) { fd = d; fi = i; } });
  if (fi === 0) return ring; const a = simplify(ring.slice(0, fi + 1), eps), b = simplify(ring.slice(fi).concat([ring[0]]), eps);
  return a.concat(b.slice(1, -1)); }
function closeRing(r) { if (r.length > 2) { const a = r[0], b = r[r.length - 1]; if (a[0] === b[0] && a[1] === b[1]) r = r.slice(0, -1); } return r; }
function assemble(ways) {   // join open way segments of a multipolygon into closed rings
  const rings = [], open = ways.map(w => w.slice());
  for (let i = open.length - 1; i >= 0; i--) { const w = open[i]; if (w.length > 3 && w[0][0] === w[w.length - 1][0] && w[0][1] === w[w.length - 1][1]) { rings.push(w); open.splice(i, 1); } }
  while (open.length) { let cur = open.pop(), grown = true;
    while (grown) { grown = false; const e = cur[cur.length - 1];
      for (let i = 0; i < open.length; i++) { const w = open[i]; const same = (p, q) => p[0] === q[0] && p[1] === q[1];
        if (same(w[0], e)) { cur = cur.concat(w.slice(1)); open.splice(i, 1); grown = true; break; }
        if (same(w[w.length - 1], e)) { cur = cur.concat(w.slice().reverse().slice(1)); open.splice(i, 1); grown = true; break; } }
      if (cur.length > 3 && cur[0][0] === cur[cur.length - 1][0] && cur[0][1] === cur[cur.length - 1][1]) break; }
    if (cur.length > 3 && cur[0][0] === cur[cur.length - 1][0] && cur[0][1] === cur[cur.length - 1][1]) rings.push(cur); }
  return rings; }
const b64 = arr => Buffer.from(new Int16Array(arr).buffer).toString('base64');
const q = v => Math.max(-32767, Math.min(32767, Math.round(v * 10)));   // metres -> decimetres

function heightOf(t, r) {
  const num = s => { const m = /-?\d+(\.\d+)?/.exec(String(s || '')); return m ? parseFloat(m[0]) : null; };
  let h = num(t.height); const lv = num(t['building:levels']), rl = num(t['roof:levels']) || 0;
  if (h == null && lv != null) h = lv * 3.2 + rl * 1.6 + 1;
  const b = t.building;
  if (h == null) h = ({ house: 7, detached: 7, semidetached_house: 7, terrace: 8, residential: 9, apartments: 15, garage: 3, garages: 3, shed: 3, hut: 3, roof: 6, carport: 3,
    commercial: 10, retail: 7, office: 18, industrial: 9, warehouse: 10, hangar: 11, grandstand: 13, stadium: 22, church: 14, cathedral: 25, hotel: 24, school: 10, hospital: 18,
    service: 4, kiosk: 3, toilets: 3, transformer_tower: 6, construction: 6 })[b] || 6 + r() * 6;
  return Math.max(2.5, Math.min(420, h)); }
function classOf(t) {   // colour family
  const b = t.building;
  if (['grandstand', 'stadium'].includes(b)) return 3;
  if (['industrial', 'warehouse', 'hangar', 'garage', 'garages', 'shed', 'service', 'construction'].includes(b)) return 2;
  if (['commercial', 'retail', 'office', 'hotel', 'hospital', 'school'].includes(b)) return 1;
  if (b === 'roof' || b === 'carport') return 4;
  return 0; }

const STATS = {};
function build(id) {
  const G = geo(id, SRC), C = G.C, P = G.P, N = P.length;
  const D = JSON.parse(fs.readFileSync(path.join(RAW, id + '.dem.json'), 'utf8'));
  const O = JSON.parse(fs.readFileSync(path.join(RAW, id + '.osm.json'), 'utf8'));
  const W = G.width, CLEAR = W / 2 + 4.6 + 2;
  // track lookups: a spatial hash of the centreline every ~3 m
  const TP = []; for (let i = 0; i < N; i++) { const a = P[i], b = P[(i + 1) % N], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 3)); for (let k = 0; k < n; k++) TP.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, (i + k / n) / N]); }
  const HC = 40, HK = (a, b) => (a + 4096) * 8192 + (b + 4096), HASH = new Map(); TP.forEach((p, i) => { const k = HK(Math.floor(p[0] / HC), Math.floor(p[1] / HC)); (HASH.get(k) || HASH.set(k, []).get(k)).push(i); });
  function nearest(x, z, R) { const r = Math.ceil(R / HC), gx = Math.floor(x / HC), gz = Math.floor(z / HC); let bd = 1e18, bi = -1;
    for (let a = gx - r; a <= gx + r; a++) for (let b = gz - r; b <= gz + r; b++) { const L = HASH.get(HK(a, b)); if (L) for (const i of L) { const d = (TP[i][0] - x) ** 2 + (TP[i][1] - z) ** 2; if (d < bd) { bd = d; bi = i; } } }
    return bi < 0 ? { d: 1e9, i: -1 } : { d: Math.sqrt(bd), i: bi }; }
  const tdist = (x, z, R) => nearest(x, z, R || 60).d;

  // ---------- terrain grid in local coordinates ----------
  const [x0, zS] = G.toLocal(D.south, D.west), [x1, zN] = G.toLocal(D.south + D.dlat * (D.ny - 1), D.west + D.dlon * (D.nx - 1));
  const mx = (x1 - x0) / (D.dlon * (D.nx - 1)), mz = (zN - zS) / (D.dlat * (D.ny - 1));   // metres per degree (z: negative, north is -z)
  const rawAt = (x, z) => { const fi = (x - x0) / mx / D.dlon, fj = (z - zS) / mz / D.dlat; const i = Math.max(0, Math.min(D.nx - 2, Math.floor(fi))), j = Math.max(0, Math.min(D.ny - 2, Math.floor(fj)));
    const tx = Math.max(0, Math.min(1, fi - i)), ty = Math.max(0, Math.min(1, fj - j)), H = (a, b) => D.h[b * D.nx + a];
    return (H(i, j) * (1 - tx) + H(i + 1, j) * tx) * (1 - ty) + (H(i, j + 1) * (1 - tx) + H(i + 1, j + 1) * tx) * ty; };
  const gx0 = Math.ceil(x0 / CELL) * CELL, gz0 = Math.ceil(zN / CELL) * CELL, gnx = Math.floor((x1 - gx0) / CELL) + 1, gnz = Math.floor((zS - gz0) / CELL) + 1;
  let H = new Float32Array(gnx * gnz); for (let j = 0; j < gnz; j++) for (let i = 0; i < gnx; i++) H[j * gnx + i] = rawAt(gx0 + i * CELL, gz0 + j * CELL);
  const IDX = (i, j) => Math.max(0, Math.min(gnz - 1, j)) * gnx + Math.max(0, Math.min(gnx - 1, i));
  const morph = (A, r, fn) => { const T = new Float32Array(A.length), B = new Float32Array(A.length);   // separable min/max
    for (let j = 0; j < gnz; j++) for (let i = 0; i < gnx; i++) { let v = A[IDX(i, j)]; for (let k = -r; k <= r; k++) v = fn(v, A[IDX(i + k, j)]); T[j * gnx + i] = v; }
    for (let j = 0; j < gnz; j++) for (let i = 0; i < gnx; i++) { let v = T[IDX(i, j)]; for (let k = -r; k <= r; k++) v = fn(v, T[IDX(i, j + k)]); B[j * gnx + i] = v; } return B; };
  const blur = A => { const B = new Float32Array(A.length); for (let j = 0; j < gnz; j++) for (let i = 0; i < gnx; i++) { let s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += A[IDX(i + a, j + b)]; B[j * gnx + i] = s / 9; } return B; };
  /* the elevation data is a surface model: in cities it is the rooftops. Cut every mapped building (plus a margin)
     out of it and refill those cells from the surrounding street level, then open away whatever is left (unmapped
     structures, tree canopy) narrower than ~70 m */
  { const Lm = g => g.map(p => G.toLocal(p[0], p[1])), mask = new Uint8Array(gnx * gnz);
    const mark = ring => scan([ring], gz0 - CELL, CELL, gnz + 2, (j0, xa, xb) => { const j = j0 - 1; if (j < 0 || j >= gnz) return;
      for (let i = Math.max(0, Math.floor((xa - gx0) / CELL)); i < gnx && gx0 + i * CELL <= xb + CELL; i++) mask[j * gnx + i] = 1; });
    for (const el of O.elements) { const t = el.t || {}; if (!t.building || t.building === 'no') continue;
      const rings = el.g ? [Lm(el.g)] : (el.r || []).filter(m => m.role !== 'inner').map(m => Lm(m.g)); rings.forEach(r => { if (r.length > 2) mark(r); }); }
    const M2 = new Uint8Array(mask); for (let j = 0; j < gnz; j++) for (let i = 0; i < gnx; i++) if (mask[j * gnx + i]) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < gnx && jj < gnz) M2[jj * gnx + ii] = 1; }
    let left = 0; for (let c = 0; c < M2.length; c++) left += M2[c];
    STATS.built = (left / M2.length * 100).toFixed(0) + '%';
    for (let it = 0; it < 400 && left; it++) { const fill = [];   // grow inward from the street cells: each hole cell takes the lower half of its known neighbours
      for (let c = 0; c < M2.length; c++) { if (!M2[c]) continue; const i = c % gnx, j = (c - i) / gnx, v = [];
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = i + a, jj = j + b; if ((a || b) && ii >= 0 && jj >= 0 && ii < gnx && jj < gnz && !M2[jj * gnx + ii]) v.push(H[jj * gnx + ii]); }
        if (v.length) { v.sort((x, y) => x - y); const k = Math.max(1, Math.ceil(v.length / 2)); let s0 = 0; for (let q = 0; q < k; q++) s0 += v[q]; fill.push(c, s0 / k); } }
      for (let q = 0; q < fill.length; q += 2) { H[fill[q]] = fill[q + 1]; M2[fill[q]] = 0; left--; } if (!fill.length) break; } }
  H = blur(morph(morph(H, 3, Math.min), 3, Math.max));
  // distance to the track for every grid cell (exact near the road, propagated with the nearest index further out)
  const DI = new Int32Array(gnx * gnz).fill(-1), DF = new Float32Array(gnx * gnz).fill(1e9);
  for (let j = 0; j < gnz; j++) for (let i = 0; i < gnx; i++) { const nr = nearest(gx0 + i * CELL, gz0 + j * CELL, 40); if (nr.i >= 0) { DI[j * gnx + i] = nr.i; DF[j * gnx + i] = nr.d; } }
  const relax = (c, n) => { const k = DI[n]; if (k < 0) return; const x = gx0 + (c % gnx) * CELL, z = gz0 + Math.floor(c / gnx) * CELL, d = Math.hypot(TP[k][0] - x, TP[k][1] - z); if (d < DF[c]) { DF[c] = d; DI[c] = k; } };
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < gnz; j++) for (let i = 0; i < gnx; i++) { const c = j * gnx + i; if (i > 0) relax(c, c - 1); if (j > 0) { relax(c, c - gnx); if (i > 0) relax(c, c - gnx - 1); if (i < gnx - 1) relax(c, c - gnx + 1); } }
    for (let j = gnz - 1; j >= 0; j--) for (let i = gnx - 1; i >= 0; i--) { const c = j * gnx + i; if (i < gnx - 1) relax(c, c + 1); if (j < gnz - 1) { relax(c, c + gnx); if (i < gnx - 1) relax(c, c + gnx + 1); if (i > 0) relax(c, c + gnx - 1); } } }
  const farDist = (x, z) => { const i = Math.round((x - gx0) / CELL), j = Math.round((z - gz0) / CELL); if (i < 0 || j < 0 || i >= gnx || j >= gnz) return 1e4; return DF[j * gnx + i]; };
  const tdistAny = (x, z) => { const f = farDist(x, z); return f < 60 ? tdist(x, z, 60) : f; };
   // opening: rooftops and tree canopies narrower than ~70 m go
  const gAt = (x, z) => { const fi = (x - gx0) / CELL, fj = (z - gz0) / CELL, i = Math.floor(fi), j = Math.floor(fj), tx = Math.max(0, Math.min(1, fi - i)), ty = Math.max(0, Math.min(1, fj - j));
    return (H[IDX(i, j)] * (1 - tx) + H[IDX(i + 1, j)] * tx) * (1 - ty) + (H[IDX(i, j + 1)] * (1 - tx) + H[IDX(i + 1, j + 1)] * tx) * ty; };

  // ---------- sea level ----------
  const sorted = Array.from(H).sort((a, b) => a - b), pct = f => sorted[Math.floor(f * (sorted.length - 1))];
  let sea = null;
  if (pct(.1) < -20) sea = Math.round(pct(.1) * 2) / 2;                       // Baku: the Caspian, ~27 m below sea level
  else if (sorted.filter(v => v <= .4).length / sorted.length > .02) sea = 0;
  // sea cells: connected low areas big enough to be the sea (not a dip on land)
  const seaMask = new Uint8Array(gnx * gnz);
  if (sea != null) { const low = i => H[i] <= sea + .4, seen = new Uint8Array(gnx * gnz);
    for (let s0 = 0; s0 < gnx * gnz; s0++) { if (seen[s0] || !low(s0)) continue; const comp = [s0]; seen[s0] = 1;
      for (let k = 0; k < comp.length; k++) { const c = comp[k], i = c % gnx, j = (c - i) / gnx; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= gnx || jj >= gnz) continue; const n = jj * gnx + ii; if (!seen[n] && low(n)) { seen[n] = 1; comp.push(n); } } }
      if (comp.length > 600) comp.forEach(c => seaMask[c] = 1); } }

  // ---------- road profile ----------
  const along = new Float64Array(N); for (let i = 0; i < N; i++) along[i] = gAt(P[i][0], P[i][1]);
  const smoothAlong = (A, m) => { const w = Math.max(1, Math.round(m / (C.lengthM / N))), B = new Float64Array(N); for (let i = 0; i < N; i++) { let s = 0; for (let k = -w; k <= w; k++) s += A[(i + k + N) % N]; B[i] = s / (2 * w + 1); } return B; };
  const demRoad = smoothAlong(along, 100);
  let prof;   // [u, metres from the start line]
  const research = Array.isArray(C.elev) && C.elev.length >= 3;
  if (research) {   // the circuit's own Catmull-Rom profile, sampled like the game samples it
    const PR = C.elev.map(a => [((+a[0] % 1) + 1) % 1, +a[1] || 0]).sort((a, b) => a[0] - b[0]);
    const profAt = u => { const n = PR.length; u = ((u % 1) + 1) % 1; let i = n - 1; for (let k = 0; k < n; k++) if (PR[k][0] <= u) i = k;
      const at = k => { const m = ((k % n) + n) % n, w = Math.floor(k / n); return [PR[m][0] + w, PR[m][1]]; }; const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
      const span = (c[0] - b[0]) || 1, t = Math.max(0, Math.min(1, (u - b[0] + (u < b[0] ? 1 : 0)) / span)), t2 = t * t, t3 = t2 * t;
      return .5 * (2 * b[1] + (-a[1] + c[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * t3); };
    prof = Array.from({ length: N }, (_, i) => profAt(i / N));
  } else { const s = smoothAlong(along, 200); prof = Array.from(s, v => v - s[0]); }
  // absolute road height: anchored on the cleaned terrain around the start, kept above the water
  let Href = 0; { let s = 0, n = 0; for (let i = 0; i < N; i++) { const u = i / N; if (u < .02 || u > .98) { s += demRoad[i] - prof[i]; n++; } } Href = s / n; }
  if (sea != null) { let lo = 1e9; for (let i = 0; i < N; i++) lo = Math.min(lo, Href + prof[i]); if (lo < sea + 1.5) Href += sea + 1.5 - lo; }
  const roadAbs = i => Href + prof[i];

  // ---------- ground meets the road: bend the terrain near the track towards the road's height ----------
  const resid = smoothAlong(Float64Array.from({ length: N }, (_, i) => roadAbs(i) - demRoad[i]), 60);
  for (let c = 0; c < gnx * gnz; c++) { if (DI[c] < 0) continue; const w = 1 - SM((DF[c] - 150) / 300); if (w <= 0) continue; H[c] += resid[Math.floor(TP[DI[c]][2] * N) % N] * w; }

  // ---------- OSM features ----------
  const L = g => g.map(p => G.toLocal(p[0], p[1]));
  const polys = el => el.g ? [closeRing(L(el.g))] : assemble((el.r || []).filter(m => m.role !== 'inner').map(m => m.g)).map(r => closeRing(L(r)));
  const holes = el => el.r ? assemble(el.r.filter(m => m.role === 'inner').map(m => m.g)).map(r => closeRing(L(r))) : [];
  const R = rng(id.charCodeAt(0) * 977 + id.charCodeAt(1));
  const bld = [], water = [], wood = [], roads = [], piers = [];
  let dropped = 0;
  for (const el of O.elements) { const t = el.t || {};
    if (t.building && t.building !== 'no') {
      for (let ring of polys(el)) { if (ring.length < 3) continue; if (area(ring) < 0) ring = ring.reverse();
        ring = simplifyRing(ring, .6); if (ring.length < 3 || Math.abs(area(ring)) < 12) continue;
        // drop anything on the track or its run-off (edges sampled every 3 m), or that the track passes through
        let bad = false; for (let k = 0; k < ring.length && !bad; k++) { const a = ring[k], b = ring[(k + 1) % ring.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
          for (let s = 0; s <= n && !bad; s++) if (tdist(a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n) < CLEAR) bad = true; }
        if (!bad) { let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9; ring.forEach(p => { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); bz0 = Math.min(bz0, p[1]); bz1 = Math.max(bz1, p[1]); });
          for (const tp of TP) if (tp[0] > bx0 && tp[0] < bx1 && tp[1] > bz0 && tp[1] < bz1 && pip(tp[0], tp[1], ring)) { bad = true; break; } }
        if (bad) { dropped++; continue; }
        const h = heightOf(t, R), mh = Math.min(h - 1, parseFloat(t.min_height) || (t.building === 'roof' || t.building === 'carport' ? Math.max(2.6, h - 1.2) : 0));
        let g = 1e9; ring.forEach(p => g = Math.min(g, gAt(p[0], p[1])));
        bld.push({ ring, h, mh: mh > 0 ? mh : 0, cls: classOf(t), d: tdistAny(ring[0][0], ring[0][1]) }); } }
    else if (t.natural === 'water' || t.waterway === 'riverbank' || t.waterway === 'dock' || t.landuse === 'reservoir' || t.landuse === 'basin' || t.water) {
      for (let ring of polys(el)) if (ring.length >= 3 && Math.abs(area(ring)) > 30) water.push({ ring: simplifyRing(ring, 1), holes: holes(el).map(h => simplifyRing(h, 1)) }); }
    else if (t.natural === 'wood' || t.landuse === 'forest' || t.leisure === 'park' || t.leisure === 'garden' || t.natural === 'scrub' || t.leisure === 'golf_course') {
      const dens = t.natural === 'wood' || t.landuse === 'forest' ? 1 : t.natural === 'scrub' ? .35 : .22;
      for (const ring of polys(el)) if (ring.length >= 3) wood.push({ ring, holes: holes(el), dens }); }
    else if (t.man_made === 'pier' || t.man_made === 'breakwater' || t.man_made === 'groyne') { if (el.g) piers.push(L(el.g)); }
    else if (t.highway && t.tunnel !== 'yes' && t.bridge !== 'yes' && el.g) {
      const w = ({ motorway: 15, trunk: 12, primary: 10, secondary: 8.5, tertiary: 7, residential: 6, unclassified: 6, service: 4 })[t.highway] || 5;
      let cur = []; const pts = L(el.g);   // split where the road meets the circuit (the circuit draws its own)
      const dense = []; for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8)); for (let s = 0; s < n; s++) dense.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]); }
      if (pts.length) dense.push(pts[pts.length - 1]);
      for (const p of dense) { if (tdist(p[0], p[1]) < CLEAR + w / 2 + 2) { if (cur.length > 1) roads.push({ w, pts: simplify(cur, .8) }); cur = []; } else cur.push(p); }
      if (cur.length > 1) roads.push({ w, pts: simplify(cur, .8) }); } }

  // ---------- water: level per surface, push the ground under it ----------
  const inPoly = (x, z, w) => pip(x, z, w.ring) && !w.holes.some(h => pip(x, z, h));
  const waterOut = [];
  for (const w of water) { let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9; w.ring.forEach(p => { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); bz0 = Math.min(bz0, p[1]); bz1 = Math.max(bz1, p[1]); });
    const cells = []; scan([w.ring].concat(w.holes), gz0, CELL, gnz, (j, xa, xb) => { for (let i = Math.max(0, Math.ceil((xa - gx0) / CELL)); i < gnx && gx0 + i * CELL <= xb; i++) cells.push(j * gnx + i); });
    const hs = (cells.length ? cells.map(c => H[c]) : w.ring.map(p => gAt(p[0], p[1]))).sort((a, b) => a - b);
    let lvl = hs[Math.floor(hs.length * .15)]; if (sea != null) lvl = Math.max(lvl, sea);
    // a lake right beside the track must not sit above the road there
    let nearRoad = 1e9; w.ring.forEach(p => { const nr = nearest(p[0], p[1], 120); if (nr.i >= 0 && nr.d < 120) nearRoad = Math.min(nearRoad, roadAbs(Math.floor(TP[nr.i][2] * N) % N)); });
    lvl = Math.min(lvl, nearRoad - 1.2);
    cells.forEach(c => { const x = gx0 + (c % gnx) * CELL, z = gz0 + Math.floor(c / gnx) * CELL; if (tdist(x, z, 40) > CLEAR + 4) H[c] = Math.min(H[c], lvl - 1.8); });
    waterOut.push({ lvl, ring: w.ring, holes: w.holes }); }
  for (let c = 0; c < gnx * gnz; c++) if (seaMask[c]) { const x = gx0 + (c % gnx) * CELL, z = gz0 + Math.floor(c / gnx) * CELL; if (tdist(x, z, 40) > CLEAR + 4) H[c] = Math.min(H[c], sea - 2); }

  // ---------- trees in woods and parks (denser close to the track, capped) ----------
  const trees = []; const TMAX = 9000;
  wood.sort((a, b) => b.dens - a.dens);
  for (const w of wood) { let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9; w.ring.forEach(p => { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); bz0 = Math.min(bz0, p[1]); bz1 = Math.max(bz1, p[1]); });
    const A = Math.abs(area(w.ring)), n = Math.min(4000, Math.round(A / 110 * w.dens));
    const per = A / Math.max(1, n);   // ground per tree; walk 6 m rows and drop trees along the inside spans
    scan([w.ring].concat(w.holes), bz0, 6, Math.ceil((bz1 - bz0) / 6) + 1, (j, xa, xb) => { if (trees.length > TMAX * 3) return;
      let x = xa + R() * per / 6; while (x < xb) { const z = bz0 + j * 6 + (R() - .5) * 5, d = tdistAny(x, z);
        if (d >= CLEAR + 3 && R() < (d < 250 ? 1 : d < 700 ? .45 : .18)) trees.push([x, z, 6 + R() * 9, d]); x += per / 6 * (.5 + R()); } }); }
  trees.sort((a, b) => a[3] - b[3]); trees.length = Math.min(trees.length, TMAX);

  // ---------- output ----------
  bld.sort((a, b) => a.d - b.d); const BMAX = 14000; if (bld.length > BMAX) bld.length = BMAX;
  const ref = roadAbs(0), rel = v => v - ref;
  const B = []; for (const b of bld) { B.push(b.ring.length, q(b.h), q(b.mh), b.cls); b.ring.forEach(p => B.push(q(p[0]), q(p[1]))); }
  const Wt = []; for (const w of waterOut) { Wt.push(q(rel(w.lvl)), 1 + w.holes.length, w.ring.length); w.ring.forEach(p => Wt.push(q(p[0]), q(p[1]))); w.holes.forEach(h => { Wt.push(h.length); h.forEach(p => Wt.push(q(p[0]), q(p[1]))); }); }
  const Rd = []; for (const r of roads) { Rd.push(r.pts.length, q(r.w)); r.pts.forEach(p => Rd.push(q(p[0]), q(p[1]))); }
  const Pi = []; for (const p of piers) { Pi.push(p.length); p.forEach(v => Pi.push(q(v[0]), q(v[1]))); }
  const T = []; trees.forEach(t => T.push(q(t[0]), q(t[1]), q(t[2])));
  const profOut = []; const PN = 200; for (let k = 0; k < PN; k++) { const i = Math.floor(k / PN * N); profOut.push([+(i / N).toFixed(4), +prof[i].toFixed(2) - +prof[0].toFixed(2)]); }
  const out = { id, v: 1, ref: +ref.toFixed(1), sea: sea == null ? null : +rel(sea).toFixed(2), prof: profOut, profSrc: research ? 'research' : 'terrain',
    dem: { x0: gx0, z0: gz0, cell: CELL, nx: gnx, nz: gnz, h: b64(Array.from(H, v => q(rel(v)))) },
    b: b64(B), w: b64(Wt), r: b64(Rd), p: b64(Pi), t: b64(T),
    credit: 'Map data (c) OpenStreetMap contributors (ODbL); elevation: Mapzen terrain tiles' };
  const file = path.join(OUT, id + '.json'); fs.writeFileSync(file, JSON.stringify(out));
  let tr = 0; bld.forEach(b => tr += b.ring.length * 2 + b.ring.length - 2);
  console.log(id.padEnd(3), 'buildings', String(bld.length).padStart(5), '(dropped on track', dropped + ')', 'tris~' + Math.round(tr / 1000) + 'k', 'water', waterOut.length, 'sea', sea, 'roads', roads.length,
    'trees', trees.length, 'piers', piers.length, 'grid', gnx + 'x' + gnz, 'built', STATS.built, 'prof', out.profSrc, 'range', (Math.max(...prof) - Math.min(...prof)).toFixed(0) + 'm', (fs.statSync(file).size / 1024).toFixed(0) + 'KB');
}
for (const c of circuits()) if (!ONLY.length || ONLY.includes(c.id)) build(c.id);
