/* Where a circuit's real-world coordinates land in the game: the same projection scripts/build-f1-circuits.js used
   (equirectangular around the GPS line's mean, scaled to the official lap length) plus the centring F1.build does.
   geo(id) -> {toLocal(lat,lon) -> [x,z] in metres (x east, z south), the track points P, the road width} */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function circuits() { const w = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'assets/f1-circuits.js'), 'utf8'))(w); return w.F1_CIRCUITS; }
function geo(id, srcDir) {
  const RES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/f1-research.json'), 'utf8')), r = RES.find(x => x.id === id);
  const C = circuits().find(c => c.id === id);
  const g = JSON.parse(fs.readFileSync(path.join(srcDir, 'circuits', r.geo + '.geojson'), 'utf8')), f = g.features ? g.features[0] : g;
  let pts = f.geometry.coordinates.slice(); const a = pts[0], b = pts[pts.length - 1];
  if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) pts.pop();
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length, lon0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  const raw = pts.map(p => ({ x: (p[0] - lon0) * kx, y: -(p[1] - lat0) * ky }));
  const perim = q => { let s = 0; for (let i = 0; i < q.length; i++) { const u = q[i], v = q[(i + 1) % q.length]; s += Math.hypot(v.x - u.x, v.y - u.y); } return s; };
  const resample = (q, N) => { const n = q.length, cum = [0]; for (let i = 0; i < n; i++) { const u = q[i], v = q[(i + 1) % n]; cum.push(cum[i] + Math.hypot(v.x - u.x, v.y - u.y)); }
    const L = cum[n], out = []; let j = 0; for (let i = 0; i < N; i++) { const d = L * i / N; while (j < n - 1 && cum[j + 1] < d) j++; const u = q[j], v = q[(j + 1) % n], t = (d - cum[j]) / ((cum[j + 1] - cum[j]) || 1); out.push({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t }); } return out; };
  const official = (f.properties && f.properties.length) || r.lengthKm * 1000;
  const k = official / perim(resample(raw, Math.round(perim(raw) / 2)));
  let cx = 0, cz = 0; C.pts.forEach(p => { cx += p[0]; cz += p[1]; }); cx /= C.pts.length; cz /= C.pts.length;
  const P = C.pts.map(p => [p[0] - cx, p[1] - cz]);
  const toLocal = (lat, lon) => [(lon - lon0) * kx * k - cx, -(lat - lat0) * ky * k - cz];
  return { id, C, P, k, width: C.width || 14, toLocal, rawLocal: pts.map(p => toLocal(p[1], p[0])) };
}
module.exports = { geo, circuits };
if (require.main === module) {   // self-check: the original GPS line must sit on the game's track
  const src = process.argv[2] || '/tmp/f1src/f1-circuits';
  for (const c of circuits()) {
    const G = geo(c.id, src), P = G.P, N = P.length;
    const dist = (x, z) => { let b = 1e18; for (let i = 0; i < N; i++) { const a = P[i], e = P[(i + 1) % N], dx = e[0] - a[0], dz = e[1] - a[1], l2 = dx * dx + dz * dz || 1; let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = Math.max(0, Math.min(1, t)); const px = a[0] + dx * t - x, pz = a[1] + dz * t - z; b = Math.min(b, px * px + pz * pz); } return Math.sqrt(b); };
    let mx = 0, s = 0; G.rawLocal.forEach(q => { const d = dist(q[0], q[1]); mx = Math.max(mx, d); s += d; });
    console.log(c.id.padEnd(3), 'scale', G.k.toFixed(4), 'mean off', (s / G.rawLocal.length).toFixed(2), 'm  max', mx.toFixed(2), 'm');
  }
}
