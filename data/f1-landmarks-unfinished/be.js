/* Spa-Francorchamps (be): the Ardennes forest, the La Source and Raidillon grandstands, the old pit building on the
   left of the start straight (behind the pit lane), the village of Francorchamps with slate roofs, and misty layered
   hills on the horizon. Built from three.js primitives in world metres (y up, +x east, -z north). */
window.F1Landmarks['be'] = function (ctx) {
  const T = ctx.THREE, L = ctx.lengthM, CLR = ctx.clear, rnd = ctx.rand;
  const at = u => ctx.at(((u % 1) + 1) % 1);
  const dummy = new T.Object3D();
  const reserved = [];                                       // circles [x, z, r] the forest keeps out of
  const reserve = (x, z, r) => reserved.push([x, z, r]);
  const nearReserved = (x, z, r) => reserved.some(q => Math.hypot(q[0] - x, q[1] - z) < q[2] + r);

  // a w (across) x d (along the road) rectangle fits when its whole footprint stays clear of the track
  function fits(x, z, yaw, w, d) {
    const s = Math.abs(Math.sin(yaw)), c = Math.abs(Math.cos(yaw));
    return ctx.clearOf(x, z, Math.hypot(w / 2 * c + d / 2 * s, w / 2 * s + d / 2 * c));
  }
  // local frame: lx across (+ left), ly up, lz along the road (+ ahead), as ctx.at's yaw
  function frame(x, y, z, yaw) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    return (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  }
  // +1 / -1: the side of the road on the outside of the bend at lap fraction u
  const outsideOf = u => { const a = at(u - 0.004), b = at(u + 0.004); return (b.tx * a.lx + b.tz * a.lz) > 0 ? -1 : 1; };
  // dq metres outward from the road on `side` (+1 left, -1 right) beside a segment
  const outward = (s, side, dq) => ({ x: s.p.x + side * s.p.lx * dq, z: s.p.z + side * s.p.lz * dq });

  // one object = one chunk = one mesh with per-vertex colours; every piece is a convex solid, faces oriented outward
  function Chunk() { this.p = []; this.c = []; }
  Chunk.prototype.poly = function (V, F, hex) {
    const col = new T.Color(hex), n = V.length, cen = [0, 0, 0];
    V.forEach(v => { cen[0] += v[0] / n; cen[1] += v[1] / n; cen[2] += v[2] / n; });
    F.forEach(f => {
      for (let i = 1; i + 1 < f.length; i++) {
        let a = V[f[0]], b = V[f[i]], d = V[f[i + 1]];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
        const fx = (a[0] + b[0] + d[0]) / 3 - cen[0], fy = (a[1] + b[1] + d[1]) / 3 - cen[1], fz = (a[2] + b[2] + d[2]) / 3 - cen[2];
        if ((uy * vz - uz * vy) * fx + (uz * vx - ux * vz) * fy + (ux * vy - uy * vx) * fz < 0) { const t = b; b = d; d = t; }
        for (const q of [a, b, d]) { this.p.push(q[0], q[1], q[2]); this.c.push(col.r, col.g, col.b); }
      }
    });
  };
  Chunk.prototype.box = function (x, y, z, w, h, d, yaw, hex) {
    const P = frame(x, y, z, yaw), a = w / 2, b = h / 2, e = d / 2;
    this.poly([P(-a, -b, -e), P(a, -b, -e), P(a, b, -e), P(-a, b, -e), P(-a, -b, e), P(a, -b, e), P(a, b, e), P(-a, b, e)],
      [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]], hex);
  };
  Chunk.prototype.gable = function (x, y, z, w, h, d, yaw, hex) {   // eaves at y, ridge h above, ridge along the road
    const P = frame(x, y, z, yaw), a = w / 2, e = d / 2;
    this.poly([P(-a, 0, -e), P(a, 0, -e), P(0, h, -e), P(-a, 0, e), P(a, 0, e), P(0, h, e)],
      [[0, 2, 1], [3, 4, 5], [0, 3, 5, 2], [1, 2, 5, 4]], hex);
  };
  Chunk.prototype.pyramid = function (x, y, z, w, h, yaw, hex) {
    const P = frame(x, y, z, yaw), a = w / 2;
    this.poly([P(-a, 0, -a), P(a, 0, -a), P(a, 0, a), P(-a, 0, a), P(0, h, 0)],
      [[0, 1, 2, 3], [0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0]], hex);
  };
  Chunk.prototype.mesh = function (name) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    const m = new T.Mesh(g, ctx.mat(0xffffff, { vertexColors: true }));
    m.name = name; ctx.add(m); return m;
  };

  // the road split into segments of about `seg` metres, each with its centre frame
  function segments(u0, u1, seg) {
    const N = Math.max(1, Math.round((u1 - u0) * L / seg)), out = [];
    for (let k = 0; k < N; k++) {
      const ua = u0 + (u1 - u0) * k / N, ub = u0 + (u1 - u0) * (k + 1) / N;
      out.push({ p: at((ua + ub) / 2), len: (ub - ua) * L });
    }
    return out;
  }
  // the first lateral offset (from q0, in 0.5 m steps) at which every segment of a row `depth` deep fits clear
  function rowOffset(segs, side, q0, depth) {
    for (let q = q0; q < q0 + 80; q += 0.5) {
      if (segs.every(s => { const c = outward(s, side, q + depth / 2); return fits(c.x, c.z, s.p.yaw, depth, s.len); })) return q;
    }
    return null;
  }

  // stepped grandstand: seats rise away from the track in `tiers` steps, a roof on posts at the back
  function stand(u0, u1, side, q0, o) {
    const segs = segments(u0, u1, o.seg), depth = o.tiers * o.td, q = rowOffset(segs, side, q0, depth);
    if (q === null) return;
    for (let g = 0; g < segs.length; g += o.per) {
      const ch = new Chunk(), first = segs[g];
      for (const s of segs.slice(g, g + o.per)) {
        const yaw = s.p.yaw, c = outward(s, side, q + depth / 2), base = ctx.ground(c.x, c.z);
        reserve(c.x, c.z, Math.hypot(depth / 2, s.len / 2) + 1);
        for (let i = 0; i < o.tiers; i++) {
          const k = outward(s, side, q + (i + 0.5) * o.td), top = base + 1.2 + o.th * (i + 1), bot = base - 2;
          ch.box(k.x, (top + bot) / 2, k.z, o.td, top - bot, s.len, yaw, o.concrete);
          ch.box(k.x, top + 0.2, k.z, o.td * 0.8, 0.4, s.len, yaw, o.seats[i % o.seats.length]);
        }
        const roofY = base + 1.2 + o.th * o.tiers + 3.4;
        ch.box(c.x, roofY, c.z, depth, 0.5, s.len, yaw, o.roof);
        const b = outward(s, side, q + depth - 0.5);
        for (const e of [-1, 1]) {
          const px = b.x + s.p.tx * e * (s.len / 2 - 0.8), pz = b.z + s.p.tz * e * (s.len / 2 - 0.8);
          ch.box(px, base + (roofY - base) / 2, pz, 0.5, roofY - base, 0.5, yaw, o.post);
        }
      }
      const m = ch.mesh('grandstand');
      if (ctx.trackDist(first.p.x, first.p.z) < 60) ctx.solid(m);
    }
  }

  // the old pit building: a long two-storey block with glazed upper floor, garage doors and a red band
  function pitBlock(u0, u1, side, q0) {
    const depth = 11, segs = segments(u0, u1, 22), q = rowOffset(segs, side, q0, depth + 0.4);
    if (q === null) return null;
    segs.forEach(s => {
      const ch = new Chunk(), yaw = s.p.yaw;
      const c = outward(s, side, q + 0.4 + depth / 2), base = ctx.ground(c.x, c.z), bot = base - 2;
      reserve(c.x, c.z, Math.hypot(depth / 2, s.len / 2) + 2);
      ch.box(c.x, (bot + base + 8) / 2, c.z, depth, base + 8 - bot, s.len, yaw, 0xcdc8bc);   // body
      ch.box(c.x, base + 8.4, c.z, depth, 0.8, s.len, yaw, 0x8e8c86);                        // roof slab
      const f = outward(s, side, q + 0.2);                                                    // the pit-lane face
      ch.box(f.x, base + 6.1, f.z, 0.4, 3.4, s.len * 0.9, yaw, 0x3d5d74);                   // glazed upper floor
      ch.box(f.x, base + 4.1, f.z, 0.4, 0.6, s.len, yaw, 0xb3352b);                          // red band
      ch.box(f.x, base + 1.7, f.z, 0.4, 2.9, s.len * 0.9, yaw, 0x4a4f55);                   // garage doors
      const m = ch.mesh('pit');
      if (ctx.trackDist(s.p.x, s.p.z) < 60) ctx.solid(m);
    });
    return { q, depth };
  }

  // control tower behind the pit building
  function tower(x, z, yaw) {
    const base = ctx.ground(x, z), ch = new Chunk();
    ch.box(x, base + 6.5, z, 5, 17, 5, yaw, 0xe4e0d6);
    ch.box(x, base + 16.5, z, 6.2, 3.4, 6.2, yaw, 0x355067);
    ch.pyramid(x, base + 18.2, z, 6.6, 3, yaw, 0x8e8c86);
    ch.mesh('tower');
  }

  // a village house: whitewashed or stone walls, slate gable roof, chimney, windows and a door
  function house(x, z, yaw, w, d) {
    const base = ctx.ground(x, z), ch = new Chunk(), P = frame(x, base, z, yaw), glass = 0x2b3a4a;
    const wall = [0xece4d0, 0xd9cbb0, 0xc9b79a][Math.floor(rnd() * 3)], slate = rnd() < 0.5 ? 0x4b5563 : 0x3c4450;
    ch.box(x, base + 2.5, z, w, 7, d, yaw, wall);                       // walls, base-1 .. base+6
    ch.gable(x, base + 6, z, w + 0.8, 3.4, d + 0.6, yaw, slate);      // roof, ridge along the road
    const pane = (lx, ly, lz, pw, ph, hex) => { const q = P(lx, ly, lz); ch.box(q[0], q[1], q[2], pw, ph, 0.14, yaw, hex); };
    for (const sx of [-0.27, 0.27]) {
      pane(w * sx, 2.7, d / 2 + 0.05, 1.3, 1.6, glass);
      pane(w * sx, 2.7, -d / 2 - 0.05, 1.3, 1.6, glass);
      pane(w * sx, 4.9, d / 2 + 0.05, 1.2, 1.1, glass);
    }
    pane(0, 1.2, d / 2 + 0.05, 1.2, 2.4, 0x6b4a33);                    // door
    const q = P(w * 0.22, 7.6, -d * 0.18);                             // chimney
    ch.box(q[0], q[1], q[2], 0.9, 3.2, 0.9, yaw, 0x8a7f75);
    const m = ch.mesh('house');
    reserve(x, z, Math.hypot(w, d) / 2 + 2);
    if (ctx.trackDist(x, z) < 60) ctx.solid(m);
  }

  // ---- placement ----
  // La Source: grandstands on the outside of the hairpin
  const GS = { seg: 12, per: 1, tiers: 6, td: 2.4, th: 1.1, concrete: 0x9ea2a6, seats: [0xc0392b, 0x1f4e8c, 0xe9e6dc], roof: 0xd9d6cc, post: 0x5f6a72 };
  stand(0.012, 0.05, outsideOf(0.03), CLR + 1, GS);
  // Raidillon: grandstand overlooking Eau Rouge, on the outside of the climb
  stand(0.085, 0.118, outsideOf(0.1), CLR + 1, Object.assign({}, GS, { tiers: 5, th: 1.3 }));
  // the old pit building: left of the start straight, beyond the pit lane (about 16 m from the road)
  const PIT = pitBlock(0.9786, 1.012, 1, CLR + 6);
  if (PIT) {
    const tp = at(0.996), d = PIT.q + PIT.depth + 6.5, tx = tp.x + tp.lx * d, tz = tp.z + tp.lz * d;
    if (fits(tx, tz, tp.yaw, 6.6, 6.6)) { tower(tx, tz, tp.yaw); reserve(tx, tz, 6); }
  }

  // the village of Francorchamps: a church with a spire and houses, about 80 m right of the road near the Bus Stop
  const vp = at(0.925), V = { x: vp.x - vp.lx * 82, z: vp.z - vp.lz * 82 };
  if (fits(V.x, V.z, vp.yaw, 10, 16)) {
    const cb = ctx.ground(V.x, V.z), ch = new Chunk(), P = frame(V.x, cb, V.z, vp.yaw);
    ch.box(V.x, cb + 2.5, V.z, 9, 7, 14, vp.yaw, 0xe8e0cc);            // nave
    ch.gable(V.x, cb + 6, V.z, 9.6, 4, 14.6, vp.yaw, 0x3c4450);         // roof
    const t = P(0, 8, 8.5);                                             // tower at the front
    ch.box(t[0], t[1], t[2], 4, 18, 4, vp.yaw, 0xe8e0cc);
    ch.pyramid(t[0], cb + 17, t[2], 4.8, 7, vp.yaw, 0x3c4450);         // spire
    ch.mesh('church');
    reserve(V.x, V.z, 13);
  }
  let houses = 0;
  for (let t = 0; t < 900 && houses < 16; t++) {
    const a = rnd() * 6.2832, R = 14 + 40 * Math.sqrt(rnd());
    const x = V.x + Math.cos(a) * R, z = V.z + Math.sin(a) * R;
    const yaw = vp.yaw + (rnd() < 0.5 ? 0 : 1.5708) + (rnd() - 0.5) * 0.3;
    const w = 7 + rnd() * 3, d = 6 + rnd() * 3;
    if (nearReserved(x, z, Math.hypot(w, d) / 2 + 2) || !fits(x, z, yaw, w + 1.6, d + 1.6)) continue;
    house(x, z, yaw, w, d); houses++;
  }

  // ---- the forest: pines and spruces on both sides, kept clear of the road, barriers, stands and village ----
  const TREE_N = 2000;
  const crownA = new T.ConeGeometry(2.8, 10, 7, 1, false).translate(0, 7.5, 0);
  const crownB = new T.ConeGeometry(1.9, 8, 7, 1, false).translate(0, 9.5, 0);
  const trunkG = new T.CylinderGeometry(0.22, 0.32, 3, 5, 1, true).translate(0, 1.5, 0);
  const crownMat = ctx.mat(0xffffff, { flatShading: true }), trunkMat = ctx.mat(0x5a4636);
  const A = new T.InstancedMesh(crownA, crownMat, TREE_N), B = new T.InstancedMesh(crownB, crownMat, TREE_N);
  const K = new T.InstancedMesh(trunkG, trunkMat, TREE_N);
  const PAL = [0x2b4a33, 0x33573c, 0x22402c, 0x3c5c3d, 0x4b6a42, 0x2f4d3f, 0x557046];
  let n = 0;
  for (let tries = 0; tries < 90000 && n < TREE_N; tries++) {
    const u = rnd(), p = at(u), side = rnd() < 0.5 ? 1 : -1, dist = CLR + 1.5 + 58 * Math.pow(rnd(), 1.5);
    const x = p.x + side * p.lx * dist, z = p.z + side * p.lz * dist, s = 0.8 + 0.6 * rnd(), rr = 5.7 * s;
    if (side === 1 && dist < 32 && (u > 0.97 || u < 0.02)) continue;   // keep the pit lane clear
    if (!ctx.clearOf(x, z, rr) || nearReserved(x, z, rr)) continue;
    dummy.position.set(x, ctx.ground(x, z) - 0.3, z);
    dummy.rotation.set(0, rnd() * 6.2832, 0);
    dummy.scale.set(s, s * (0.85 + 0.5 * rnd()), s);
    dummy.updateMatrix();
    A.setMatrixAt(n, dummy.matrix); B.setMatrixAt(n, dummy.matrix); K.setMatrixAt(n, dummy.matrix);
    const c = new T.Color(PAL[Math.floor(rnd() * PAL.length)]);
    A.setColorAt(n, c); B.setColorAt(n, c);
    n++;
  }
  for (const m of [A, B, K]) { m.count = n; m.frustumCulled = false; m.instanceMatrix.needsUpdate = true; ctx.add(m); }
  A.instanceColor.needsUpdate = true; B.instanceColor.needsUpdate = true;

  // ---- misty layered hills on the horizon, pushed out until clear of the track ----
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let k = 0; k < 400; k++) { const p = at(k / 400); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  let R0 = 0;
  for (let k = 0; k < 400; k++) { const p = at(k / 400); R0 = Math.max(R0, Math.hypot(p.x - cx, p.z - cz)); }
  [
    { n: 16, r: [1.02, 1.3], h: [150, 240], rad: [300, 420], hex: 0xb8c6cd },
    { n: 20, r: [1.0, 1.16], h: [90, 150], rad: [200, 300], hex: 0x8ea69c },
    { n: 22, r: [0.99, 1.06], h: [50, 90], rad: [140, 210], hex: 0x5c7a67 }
  ].forEach(Lr => {
    const mesh = new T.InstancedMesh(new T.SphereGeometry(1, 9, 6), ctx.mat(Lr.hex, { flatShading: true }), Lr.n);
    mesh.frustumCulled = false;
    let k = 0;
    for (let i = 0; i < Lr.n; i++) {
      const a = rnd() * 6.2832, H = Lr.h[0] + (Lr.h[1] - Lr.h[0]) * rnd(), rad = Lr.rad[0] + (Lr.rad[1] - Lr.rad[0]) * rnd();
      let R = R0 * (Lr.r[0] + (Lr.r[1] - Lr.r[0]) * rnd()), x = 0, z = 0, ok = false;
      for (let tries = 0; tries < 14 && !ok; tries++, R += 80) { x = cx + Math.cos(a) * R; z = cz + Math.sin(a) * R; ok = ctx.clearOf(x, z, rad); }
      if (!ok) continue;
      dummy.position.set(x, ctx.ground(x, z) - H * 0.18, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(rad, H, rad);
      dummy.updateMatrix();
      mesh.setMatrixAt(k++, dummy.matrix);
    }
    mesh.count = k; mesh.instanceMatrix.needsUpdate = true; ctx.add(mesh);
  });
  // mist banks lying between the ridges
  const MIST = 28;
  const mist = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 12, 1, true),
    ctx.mat(0xe2eaee, { transparent: true, opacity: 0.32, depthWrite: false, side: T.DoubleSide }), MIST);
  mist.frustumCulled = false;
  let mk = 0;
  for (let i = 0; i < MIST; i++) {
    const a = rnd() * 6.2832, rad = 380 + 300 * rnd();
    let R = R0 * (1.08 + 0.4 * rnd()), x = 0, z = 0, ok = false;
    for (let tries = 0; tries < 14 && !ok; tries++, R += 80) { x = cx + Math.cos(a) * R; z = cz + Math.sin(a) * R; ok = ctx.clearOf(x, z, rad); }
    if (!ok) continue;
    dummy.position.set(x, ctx.ground(x, z) + 40 + 40 * rnd(), z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(rad, 26, rad);
    dummy.updateMatrix();
    mist.setMatrixAt(mk++, dummy.matrix);
  }
  mist.count = mk; mist.instanceMatrix.needsUpdate = true; ctx.add(mist);
};
