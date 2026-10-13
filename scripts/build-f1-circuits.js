#!/usr/bin/env node
/*
 * Builds assets/f1-circuits.js from real circuit centrelines + researched facts.
 *
 *   node scripts/build-f1-circuits.js <path to bacinger/f1-circuits checkout> [--report]
 *
 * Layouts: https://github.com/bacinger/f1-circuits (MIT, (c) Tomislav Bacinger) - GPS centrelines as GeoJSON.
 * Facts (length, direction, elevation, corners, tunnels, setting): data/f1-research.json, researched with
 * sources listed per circuit.
 *
 * The GeoJSON line does not start at the start/finish line and may run either way round, so for each circuit:
 *   1. project lon/lat to metres, scale to the official lap length
 *   2. orient it to the official direction (signed area; a figure-of-eight is decided by step 3)
 *   3. find the start line: slide the lap start along the track and keep the offset where the researched corner
 *      positions (fractions of a lap from the line) land on real bends, on a stretch that is itself straight
 *   4. resample to ~6 m spacing (chicanes survive) and write the game data
 */
const fs = require('fs'), path = require('path');
const SRC = process.argv[2] || '/tmp/f1src/f1-circuits', REPORT = process.argv.includes('--report');
const RES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'f1-research.json'), 'utf8'));

// extra start-line anchors for circuits whose research had no corner positions (well-known layout facts)
const EXTRA = {
  be: [['La Source', 1, .03], ['Les Combes', 5, .27], ['Pouhon', 10, .50], ['Bus Stop', 18, .965]],
  nl: [['Tarzan', 1, .162]],
  au: [['Turn 1', 1, .06]],
  sa: [['Turn 1', 1, .05]],
};
// elevation for circuits whose sources gave anchors but no profile
const ELEV_EXTRA = {
  // Spa: Eau Rouge floor, Raidillon crest (~40 m climb), high at Malmedy, lowest at Paul Frere (102 m below the top)
  be: [[0, 0], [.03, -2], [.07, -12], [.10, 26], [.2, 30], [.30, 34], [.40, 12], [.48, -14], [.6, -44], [.70, -68], [.82, -46], [.92, -12], [.97, -3]],
};

function loadLine(geo) {
  const g = JSON.parse(fs.readFileSync(path.join(SRC, 'circuits', geo + '.geojson'), 'utf8'));
  const f = g.features ? g.features[0] : g, c = f.geometry.coordinates;
  let pts = c.slice();
  const a = pts[0], b = pts[pts.length - 1];
  if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) pts.pop();
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length, lon0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  // map coordinates: x east, y SOUTH (screen-like, same convention as a drawn track), metres
  return { pts: pts.map(p => ({ x: (p[0] - lon0) * kx, y: -(p[1] - lat0) * ky })), props: f.properties || {} };
}
function perim(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += Math.hypot(b.x - a.x, b.y - a.y); } return s; }
function resample(p, N) {
  const n = p.length, cum = [0];
  for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y)); }
  const L = cum[n], out = []; let j = 0;
  for (let i = 0; i < N; i++) { const d = L * i / N; while (j < n - 1 && cum[j + 1] < d) j++; const a = p[j], b = p[(j + 1) % n], t = (d - cum[j]) / ((cum[j + 1] - cum[j]) || 1); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
  return out;
}
// signed area with y pointing SOUTH: positive = clockwise on a north-up map
function cwArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; } return s / 2; }
function curv(p, k) {   // 1/radius at each sample from the circle through i-k, i, i+k
  const n = p.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = p[(i - k + n) % n], b = p[i], c = p[(i + k) % n];
    const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y);
    out[i] = ab * bc * ca < 1e-9 ? 0 : 2 * Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / (ab * bc * ca);
  }
  return out;
}

function findStart(p, corners, T1dist) {
  const n = p.length, L = perim(p), step = L / n, K = curv(p, Math.max(2, Math.round(12 / step)));
  // smoothed "bendiness" around each point, and "straightness" of the stretch either side of it
  const win = Math.max(2, Math.round(L * .008 / step)), bend = new Float64Array(n), straight = new Float64Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (let k = -win; k <= win; k++) m = Math.max(m, K[(i + k + n) % n]); bend[i] = m; }
  const sw = Math.round(60 / step);
  for (let i = 0; i < n; i++) { let m = 0; for (let k = -sw; k <= sw; k++) m = Math.max(m, K[(i + k + n) % n]); straight[i] = m; }
  let best = -1e9, bi = 0;
  for (let s = 0; s < n; s++) {
    if (straight[s] > 1 / 260) continue;              // the start line is on a straight
    let sc = 0;
    for (const c of corners) { const j = (s + Math.round(c[2] * n)) % n; sc += Math.min(bend[j], 1 / 15) * (c[1] === 1 ? 2 : 1); }
    if (T1dist) {   // the first real corner after the line should be about T1dist away
      let d = 0; for (let k = 1; k < n; k++) { if (K[(s + k) % n] > 1 / 90) { d = k * step; break; } }
      sc -= Math.abs(d - T1dist) / 4000;
    }
    if (sc > best) { best = sc; bi = s; }
  }
  return { start: bi, score: best };
}

const out = [], report = [];
for (const r of RES) {
  const { pts: raw, props } = loadLine(r.geo);
  const official = (props.length || r.lengthKm * 1000);
  let p = resample(raw, Math.round(perim(raw) / 2));
  const k = official / perim(p); p = p.map(q => ({ x: q.x * k, y: q.y * k }));
  const corners = (r.corners && r.corners.length ? r.corners : []).concat(EXTRA[r.id] || []).filter(c => c[2] != null);
  const T1 = r.straightToT1 || null;
  let cands = [];
  const area = cwArea(p);
  if (r.dir === 'cw' || r.dir === 'acw') { const want = r.dir === 'cw' ? 1 : -1; if (Math.sign(area) !== want) p = p.slice().reverse(); cands = [p]; }
  else cands = [p, p.slice().reverse()];   // figure-of-eight: let the corners decide which way round
  let best = null;
  for (const c of cands) { const f = findStart(c, corners, T1); if (!best || f.score > best.f.score) best = { p: c, f }; }
  p = best.p.slice(best.f.start).concat(best.p.slice(0, best.f.start));
  // ~6 m spacing for the game (chicanes keep their shape), coordinates to 0.1 m
  const N = Math.round(official / 6), fin = resample(p, N).map(q => [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10]);
  const Kf = curv(fin.map(a => ({ x: a[0], y: a[1] })), 2); let kmax = 0, at = 0; Kf.forEach((v, i) => { if (v > kmax) { kmax = v; at = i; } });
  const elev = r.elev || ELEV_EXTRA[r.id] || null;
  out.push({
    id: r.id, name: r.name, country: r.country, lengthM: Math.round(official), turns: r.turns, dir: r.dir, width: r.width, raceTime: r.raceTime,
    type: r.type, theme: r.theme, elev, elevQ: ELEV_EXTRA[r.id] ? 'anchors' : r.elevQ, elevRange: r.elevRange != null ? r.elevRange : null,
    tunnels: r.tunnels || [], overheads: r.overheads || [], bridgeU: r.bridgeU || null, banking: r.banking || [],
    corners: corners.map(c => ({ name: c[0], turn: c[1], u: c[2] })), landmarks: r.landmarks || [], sources: r.sources || [], pts: fin
  });
  report.push(r.id.padEnd(3) + ' ' + r.name.padEnd(36).slice(0, 36) + ' ' + String(Math.round(official)).padStart(5) + ' m  pts ' + String(N).padStart(4) +
    '  dir ' + (r.dir || '').padEnd(4) + ' corners ' + corners.length + '  fit ' + best.f.score.toFixed(3) + '  tightest R ' + (1 / kmax).toFixed(1) + ' m @' + (at / N).toFixed(3));
}
const banner = '/* F1 circuits: real centrelines from bacinger/f1-circuits (MIT, (c) 2019-2025 Tomislav Bacinger),\n   scaled to official lap length and started at the start/finish line; facts researched per circuit (see sources).\n   Generated by scripts/build-f1-circuits.js - do not edit by hand. */\n';
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'f1-circuits.js'), banner + 'window.F1_CIRCUITS=' + JSON.stringify(out) + ';\n');
console.log(report.join('\n'));
console.log('wrote assets/f1-circuits.js', (fs.statSync(path.join(__dirname, '..', 'assets', 'f1-circuits.js')).size / 1024).toFixed(0) + ' KB');
