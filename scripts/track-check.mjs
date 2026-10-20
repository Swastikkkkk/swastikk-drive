// Builds drawn tracks headlessly and measures what players complained about:
//   buried  - places where the ground rises above the road surface (the car sinks into it)
//   flat    - crossings where the two roads meet at the same height instead of a flyover/tunnel
//   walls   - steep dirt banks right beside the road (ground climbing > 1 m per metre)
//   start   - how much the road turns within 80 m either side of the start line (degrees)
// Usage: python3 -m http.server 8000 (repo root), then: node scripts/track-check.mjs
import { chromium } from 'playwright';

const URL = process.env.GAME || 'http://localhost:8000/';
const N = 110;
const shape = (f) => Array.from({ length: N }, (_, k) => f((k / N) * Math.PI * 2));
const SHAPES = {
  // like the user's drawing: a figure eight with extra lobes, many crossings
  pretzel: shape((t) => ({ x: 520 + 430 * Math.cos(t) + 130 * Math.cos(3 * t), y: 260 + 210 * Math.sin(2 * t) + 70 * Math.sin(t) })),
  eight: shape((t) => ({ x: 500 + 400 * Math.sin(t), y: 260 + 200 * Math.sin(2 * t) })),
  // two laps of almost the same circle: long side-by-side stretch plus one crossing
  double: Array.from({ length: 2 * N }, (_, k) => { const t = (k / N) * Math.PI * 2, r = 230 + (k < N ? 0 : 40) + 20 * Math.sin(t * 0.5); return { x: 500 + r * Math.cos(t), y: 270 + r * 0.6 * Math.sin(t) }; }),
  hairpins: shape((t) => ({ x: 500 + 420 * Math.cos(t), y: 260 + 150 * Math.sin(t) + 90 * Math.sin(5 * t) })),
  oval: shape((t) => ({ x: 500 + 420 * Math.cos(t), y: 260 + 180 * Math.sin(t) })),
};
// many crossings: a rose (passes through the middle again and again) and a spirograph
SHAPES.rose = shape((t) => ({ x: 500 + 420 * Math.cos(3 * t) * Math.cos(t), y: 270 + 240 * Math.cos(3 * t) * Math.sin(t) + 30 * Math.sin(t) }));
SHAPES.spiro = shape((t) => ({ x: 500 + 300 * Math.cos(t) + 140 * Math.cos(4 * t), y: 270 + 180 * Math.sin(t) - 90 * Math.sin(4 * t) }));
// messy random loops (seeded): low-frequency wobble on top of several lobes, like a hand drawing with many crossings
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
for (let r = 1; r <= 8; r++) {
  const R = rng(r * 7919), A = [], B = [];
  for (let k = 1; k <= 5; k++) { A.push([(R() - .5) * 2 * 260 / k, (R() - .5) * 2 * 260 / k]); B.push([(R() - .5) * 2 * 160 / k, (R() - .5) * 2 * 160 / k]); }
  SHAPES['rand' + r] = shape((t) => {
    let x = 500, y = 270;
    A.forEach((c, i) => { x += c[0] * Math.cos((i + 1) * t) + c[1] * Math.sin((i + 1) * t); });
    B.forEach((c, i) => { y += c[0] * Math.cos((i + 1) * t) + c[1] * Math.sin((i + 1) * t); });
    return { x, y };
  });
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.__dbgDraw === 'function', null, { timeout: 60000 });

const only = process.argv[2];
const elevs = (process.env.ELEV || 'rolling,hilly').split(',');
let bad = 0;
for (const [name, pts] of Object.entries(SHAPES)) {
  if (only && name !== only) continue;
  for (const elev of elevs) {
    const r = await page.evaluate(({ pts, elev }) => {
      const ok = window.__dbgDraw(pts, { elev, size: 'huge' });
      if (ok !== true) return { err: String(ok) };
      const C = window.__circ(), curve = C.curve, TL = C.TL, W = C.width || 16;
      const ground = (x, z) => (C.groundAt ? C.groundAt(x, z) : 0);
      const M = Math.round(TL / 2), P = [];
      for (let k = 0; k < M; k++) {
        const u = k / M, p = curve.getPointAt(u), tg = curve.getTangentAt(u), l = Math.hypot(tg.x, tg.z) || 1;
        const nx = -tg.z / l, nz = tg.x / l, lift = C.liftAt ? C.liftAt(u) : 0;
        P.push({ u, x: p.x, z: p.z, y: C.roadY(u, p.x, p.z), nx, nz, lift });
      }
      // buried: ground above the road surface anywhere across the asphalt (only where this road is on the ground)
      let buried = 0, worst = 0;
      for (const q of P) {
        if (q.lift > 0.3) continue;
        for (let w = -W / 2 + 0.5; w <= W / 2 - 0.5; w += 1.5) {
          const g = ground(q.x + q.nx * w, q.z + q.nz * w), d = g - q.y;
          if (d > 0.25) { buried++; worst = Math.max(worst, d); break; }
        }
      }
      // flat crossings: two parts of the lap far apart along the road but on top of each other with < 6 m between them
      const flatAt = [];
      const cell = 12, G = new Map(), key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
      P.forEach((q, i) => { const k = key(q.x, q.z); (G.get(k) || G.set(k, []).get(k)).push(i); });
      for (let i = 0; i < M; i++) {
        const q = P[i], gx = Math.floor(q.x / cell), gz = Math.floor(q.z / cell);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of G.get(gx + a + ',' + (gz + b)) || []) {
          if (j <= i) continue;
          const arc = Math.min(j - i, M - (j - i)) * (TL / M);
          if (arc < 80) continue;
          const o = P[j];
          if (Math.hypot(o.x - q.x, o.z - q.z) < W * 0.9 && Math.abs(o.y - q.y) < 6 && !flatAt.some((f) => Math.hypot(f.x - q.x, f.z - q.z) < 40)) flatAt.push({ x: q.x, z: q.z });
        }
      }
      // vburied: the VISIBLE terrain mesh above the road (what the player sees as dirt over the asphalt)
      let tm = null; C.root.traverse((o) => { if (o.name === 'terrain') tm = o; });
      let vburied = 0, vworst = 0;
      if (tm) {
        const pa = tm.geometry.attributes.position, n2 = Math.round(Math.sqrt(pa.count)), x0 = pa.getX(0), z0 = pa.getZ(0), ES = pa.getZ(1) - z0;
        const H = (i, j) => pa.getY(i * n2 + j);
        const vis = (x, z) => { const fx = (x - x0) / ES, fz = (z - z0) / ES, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
          if (i < 0 || j < 0 || i >= n2 - 1 || j >= n2 - 1) return -1e9;
          return tx + tz <= 1 ? H(i, j) + (H(i + 1, j) - H(i, j)) * tx + (H(i, j + 1) - H(i, j)) * tz
                              : H(i + 1, j + 1) + (H(i, j + 1) - H(i + 1, j + 1)) * (1 - tx) + (H(i + 1, j) - H(i + 1, j + 1)) * (1 - tz); };
        for (const q of P) {
          for (let w = -W / 2 + 0.5; w <= W / 2 - 0.5; w += 1.5) {
            const x = q.x + q.nx * w, z = q.z + q.nz * w, d = vis(x, z) - C.roadY(q.u, x, z);
            if (d > 0.1) { vburied++; vworst = Math.max(vworst, d); break; }
          }
        }
      }
      // walls: ground climbing more than 1 m per metre just outside the barrier
      let walls = 0;
      for (const q of P) {
        if (q.lift > 0.3) continue;
        for (const s of [-1, 1]) {
          const d0 = W / 2 + 3, d1 = d0 + 8;
          const g0 = ground(q.x + q.nx * s * d0, q.z + q.nz * s * d0), g1 = ground(q.x + q.nx * s * d1, q.z + q.nz * s * d1);
          if (Math.abs(g1 - g0) / 8 > 1) { walls++; break; }
        }
      }
      // start: total turning within 80 m either side of the line
      const hd = (u) => { const t = curve.getTangentAt(((u % 1) + 1) % 1); return Math.atan2(t.z, t.x); };
      let turn = 0, prev = hd(-80 / TL);
      for (let m = -78; m <= 80; m += 2) { const h = hd(m / TL); let d = h - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += Math.abs(d); prev = h; }
      return { TL: Math.round(TL), bridges: C.bridges, vburied, vworst: +vworst.toFixed(2), buried, worst: +worst.toFixed(2), flat: flatAt.length, walls, start: Math.round((turn * 180) / Math.PI) };
    }, { pts, elev });
    const fail = r.err || r.vburied > 0 || r.buried > 0 || r.flat > 0 || r.walls > 0 || r.start > 25;
    if (fail) bad++;
    console.log(`${fail ? 'FAIL' : 'ok  '} ${name.padEnd(9)} ${elev.padEnd(8)} ${JSON.stringify(r)}`);
  }
}
if (errors.length) console.log('page errors:', errors.slice(0, 5));
await browser.close();
process.exit(bad ? 1 : 0);
