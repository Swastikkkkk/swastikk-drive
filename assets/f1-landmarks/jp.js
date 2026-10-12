/* Suzuka Circuit (jp): landmarks.
   Frame: a = metres to the LEFT of the road centreline (negative = right); d = metres along the road from the
   start line (negative = before it, i.e. on the main straight). Motopia sits to the left of the road beside the
   First Curve; the main grandstand stands on the right of the start straight, the pit building on the left (the
   pit-lane side the game builds); wooded hills and tree groups ring the circuit, rice paddies lie farther out. */
window.F1Landmarks['jp'] = function (ctx) {
  const T = ctx.THREE, L = ctx.lengthM, rnd = ctx.rand;
  const lap = d => ((d / L) % 1 + 1) % 1;
  const RED = 0xd8322f, WHITE = 0xf1efe8, STEEL = 0x5d616b, GREY = 0x9b988f;
  const HM = new T.Matrix4(), HQ = new T.Quaternion(), HE = new T.Euler(), HP = new T.Vector3(), HS = new T.Vector3();
  const HC = new T.Color(), HUP = new T.Vector3(0, 1, 0);
  const mat = (hex, o) => ctx.mat(hex, o);
  const add = o => { ctx.add(o); return o; };
  const mesh = (geo, m) => add(new T.Mesh(geo, m));
  const inst = (geo, m, n) => add(new T.InstancedMesh(geo, m, n));
  const tint = (im, i, hex) => im.setColorAt(i, HC.setHex(hex));
  const done = im => { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; return im; };
  // one instance: world position, yaw (about Y) and an optional roll about the local Z axis, then a scale
  function put(im, i, x, y, z, sx, sy, sz, ry, rz) {
    HE.set(0, ry || 0, rz || 0, 'YXZ'); HQ.setFromEuler(HE); HP.set(x, y, z); HS.set(sx, sy, sz);
    HM.compose(HP, HQ, HS); im.setMatrixAt(i, HM);
  }
  // an instance stretched between two world points (unit-height cylinder or box, thickness th)
  function seg(im, i, p0, p1, th) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    HP.set((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    HQ.setFromUnitVectors(HUP, new T.Vector3(dx / len, dy / len, dz / len)); HS.set(th, len, th);
    HM.compose(HP, HQ, HS); im.setMatrixAt(i, HM);
  }
  // a point beside the road: d along from the line, a metres to the left; y = terrain there; yaw = heading
  // (local +z = along the road, local +x = left, so the yaw turns boxes to match the road)
  function road(d, a) {
    const b = ctx.at(lap(d)), x = b.x + b.lx * a, z = b.z + b.lz * a;
    return { x: x, z: z, y: ctx.ground(x, z), yaw: b.yaw };
  }

  /* ---------- Motopia amusement park: left of the road, beside the First Curve ---------- */
  const fc = ctx.at(0.01), FY = fc.yaw;
  const PA = 68, PF = 96;                       // park centre: metres left of, and ahead of, the First Curve point
  const pcx = fc.x + fc.lx * PA + fc.tx * PF, pcz = fc.z + fc.lz * PA + fc.tz * PF, pcy = ctx.ground(pcx, pcz);
  // park-local point: a = left, y = up, f = forward (along the road heading at the First Curve)
  const pl = (a, y, f) => ({ x: pcx + fc.lx * a + fc.tx * f, y: pcy + y, z: pcz + fc.lz * a + fc.tz * f });
  const place = (o, p, rz) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, FY, rz || 0, 'YXZ'); return o; };

  // plaza
  place(mesh(new T.BoxGeometry(84, 0.3, 120), mat(0x8e8b82)), pl(0, 0.15, 0));

  // Ferris wheel: hub 42 m up, rim radius 30, wheel plane facing the road (spanned by left and up)
  const HA = -14, HY = 42, HF = -6, WR = 30, SPK = 16, GDN = 16;
  const hubP = pl(HA, HY, HF);
  place(mesh(new T.TorusGeometry(WR, 0.8, 6, 56), mat(WHITE)), hubP);
  place(mesh(new T.CylinderGeometry(2.6, 2.6, 3.2, 8).rotateX(Math.PI / 2), mat(RED)), hubP);
  const spokes = inst(new T.BoxGeometry(0.25, WR, 0.25), mat(0xd9d6cc), SPK);
  for (let k = 0; k < SPK; k++) {
    const th = k * 2 * Math.PI / SPK, c = pl(HA + Math.cos(th) * WR / 2, HY + Math.sin(th) * WR / 2, HF);
    put(spokes, k, c.x, c.y, c.z, 1, 1, 1, FY, th - Math.PI / 2);
  }
  done(spokes);
  const gon = inst(new T.BoxGeometry(2.6, 2.4, 2.4), mat(0xffffff), GDN);
  const GPAL = [RED, 0xf2efe6, 0xffd23f, 0x2f6f9e];
  for (let k = 0; k < GDN; k++) {
    const th = k * 2 * Math.PI / GDN, c = pl(HA + Math.cos(th) * WR, HY + Math.sin(th) * WR - 1.9, HF);
    put(gon, k, c.x, c.y, c.z, 1, 1, 1, FY, 0); tint(gon, k, GPAL[k % GPAL.length]);
  }
  done(gon);
  // A-frame legs from the ground up to the hub, and a grey plinth
  const legs = inst(new T.CylinderGeometry(0.6, 0.6, 1, 5), mat(RED), 2);
  seg(legs, 0, pl(HA - 17, 0, HF), pl(HA, HY - 2, HF), 1.2);
  seg(legs, 1, pl(HA + 17, 0, HF), pl(HA, HY - 2, HF), 1.2);
  done(legs);
  place(mesh(new T.BoxGeometry(34, 0.8, 4), mat(GREY)), pl(HA, 0.4, HF));

  // roller coaster: one closed steel loop around the park, on posts
  const CP = [[26, 10, -52], [46, 15, -40], [54, 26, -14], [44, 32, 12], [26, 18, 30], [4, 28, 44], [-22, 13, 48], [-40, 11, 24]];
  const curve = new T.CatmullRomCurve3(CP.map(p => new T.Vector3(p[0], p[1], p[2])), true);
  const rail = new T.TubeGeometry(curve, 240, 0.45, 6, true);
  // the tube is built in park-local space: map its vertices to the world (rotation + translation)
  const rp = rail.attributes.position, tmpV = new T.Vector3();
  for (let i = 0; i < rp.count; i++) {
    tmpV.set(rp.getX(i), rp.getY(i), rp.getZ(i));
    const q = pl(tmpV.x, tmpV.y, tmpV.z); rp.setXYZ(i, q.x, q.y, q.z);
  }
  rail.computeBoundingBox(); rail.computeBoundingSphere(); rail.computeVertexNormals();
  mesh(rail, mat(STEEL, { metalness: 0.3 }));
  const NP = 30, posts = inst(new T.CylinderGeometry(0.4, 0.4, 1, 5), mat(STEEL), NP);
  for (let i = 0; i < NP; i++) {
    const p = curve.getPointAt(i / NP);
    const w = pl(p.x, 0, p.z), top = pcy + p.y - 0.45, h = Math.max(0.5, p.y - 0.45);
    put(posts, i, w.x, top - h / 2, w.z, 1, h, 1, 0, 0);
  }
  done(posts);

  // station: white block with a red canopy, and a MOTOPIA board on the road-side front
  place(mesh(new T.BoxGeometry(14, 7, 9), mat(WHITE)), pl(26, 3.5, -52));
  place(mesh(new T.BoxGeometry(16, 0.8, 11), mat(RED)), pl(26, 7.4, -52));
  const bc = document.createElement('canvas'); bc.width = 512; bc.height = 128;
  const bg = bc.getContext('2d'); bg.fillStyle = '#d8322f'; bg.fillRect(0, 0, 512, 128);
  bg.fillStyle = '#ffffff'; bg.font = 'bold 80px sans-serif'; bg.textAlign = 'center'; bg.textBaseline = 'middle'; bg.fillText('MOTOPIA', 256, 66);
  const board = mesh(new T.PlaneGeometry(10, 2.5), ctx.basic(0xffffff, { map: new T.CanvasTexture(bc) }));
  board.position.set(pl(26, 5, -56.7).x, pl(26, 5, -56.7).y, pl(26, 5, -56.7).z); board.rotation.set(0, FY + Math.PI, 0, 'YXZ');

  // kiosks along both plaza edges
  const KZ = []; for (let f = -40; f <= 40; f += 16) { KZ.push([-36, f]); KZ.push([36, f]); }
  const kiosks = inst(new T.BoxGeometry(4, 3.4, 3), mat(0xffffff), KZ.length);
  KZ.forEach((k, i) => { const c = pl(k[0], 1.7, k[1]); put(kiosks, i, c.x, c.y, c.z, 1, 1, 1, FY, 0); tint(kiosks, i, [0xffffff, RED, 0xffd23f][i % 3]); });
  done(kiosks);

  /* ---------- main grandstand: right of the start straight, facing the road (100 m, ten 10 m bays) ---------- */
  const GS0 = -190, GN = 10, TIERS = 4, ROWS = 2, COLS = 12;
  const tiers = inst(new T.BoxGeometry(4, 2, 10), mat(WHITE), GN * TIERS);
  const seats = inst(new T.BoxGeometry(0.55, 0.9, 0.5), mat(0xffffff), GN * TIERS * ROWS * COLS);
  const roofs = inst(new T.BoxGeometry(18, 0.6, 10.2), mat(0xf4f2ec), GN);
  const fascia = inst(new T.BoxGeometry(0.5, 1.6, 10.2), mat(RED), GN);
  const stripe = inst(new T.BoxGeometry(17.6, 0.3, 10.25), mat(RED), GN);
  const pillars = inst(new T.BoxGeometry(0.7, 10.6, 0.7), mat(RED), (GN + 1) * 2);
  const SPAL = [RED, WHITE, RED, 0x2f6f9e, WHITE, 0xf3a712, 0x3f8a56, RED, 0x5c4b8a, WHITE];
  let ti = 0, si = 0;
  for (let b = 0; b < GN; b++) {
    const dc = GS0 + 5 + 10 * b;
    for (let t = 0; t < TIERS; t++) {
      const tp = road(dc, -28 - 4 * t);
      put(tiers, ti++, tp.x, tp.y + 1 + 2 * t, tp.z, 1, 1, 1, tp.yaw, 0);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const q = road(dc - 4.5 + c * 0.85, -26.7 - 4 * t - 1.3 * r);
        put(seats, si, q.x, q.y + 2 * (t + 1) + 0.45, q.z, 1, 1, 1, q.yaw, 0);
        tint(seats, si, SPAL[(rnd() * SPAL.length) | 0]); si++;
      }
    }
    const rf = road(dc, -33), fa = road(dc, -23.8), st = road(dc, -33);
    put(roofs, b, rf.x, rf.y + 10.8, rf.z, 1, 1, 1, rf.yaw, 0);
    put(fascia, b, fa.x, fa.y + 10.5, fa.z, 1, 1, 1, fa.yaw, 0);
    put(stripe, b, st.x, st.y + 10.1, st.z, 1, 1, 1, st.yaw, 0);
  }
  for (let k = 0; k <= GN; k++) {
    const dk = GS0 + 10 * k;
    const fr = road(dk, -24.6), bk = road(dk, -41.4);
    put(pillars, 2 * k, fr.x, fr.y + 5.3, fr.z, 1, 1, 1, fr.yaw, 0);
    put(pillars, 2 * k + 1, bk.x, bk.y + 5.3, bk.z, 1, 1, 1, bk.yaw, 0);
  }
  done(tiers); done(seats); done(roofs); done(fascia); done(stripe); done(pillars);

  /* ---------- pit building: left of the start straight, behind the pit-lane wall (110 m, 21 bays) ---------- */
  const PB0 = -150, PBN = 21;
  const pw = inst(new T.BoxGeometry(12.5, 6, 10), mat(WHITE), PBN);
  const pband = inst(new T.BoxGeometry(12.7, 0.8, 10.1), mat(RED), PBN);
  const proof = inst(new T.BoxGeometry(15, 0.6, 10.2), mat(0x4a4e58), PBN);
  const pdoor = inst(new T.BoxGeometry(0.25, 3.2, 6.5), mat(0x2b2e36), PBN);
  const ppil = inst(new T.BoxGeometry(0.7, 6, 0.7), mat(RED), PBN + 1);
  for (let b = 0; b < PBN; b++) {
    const dc = PB0 + 5 + 10 * b;
    const w = road(dc, 31.5), bd = road(dc, 31.5), ro = road(dc, 32.5), dr = road(dc, 25.1);
    put(pw, b, w.x, w.y + 3, w.z, 1, 1, 1, w.yaw, 0);
    put(pband, b, bd.x, bd.y + 4.4, bd.z, 1, 1, 1, bd.yaw, 0);
    put(proof, b, ro.x, ro.y + 6.3, ro.z, 1, 1, 1, ro.yaw, 0);
    put(pdoor, b, dr.x, dr.y + 1.6, dr.z, 1, 1, 1, dr.yaw, 0);
  }
  for (let k = 0; k <= PBN; k++) {
    const q = road(PB0 + 10 * k, 25.0);
    put(ppil, k, q.x, q.y + 3, q.z, 1, 1, 1, q.yaw, 0);
  }
  done(pw); done(pband); done(proof); done(pdoor); done(ppil);

  /* ---------- wooded hills, tree groups, and rice paddies beyond ---------- */
  const hills = [];
  for (let tries = 0; tries < 12000 && hills.length < 40; tries++) {
    const x = -1300 + rnd() * 2600, z = -950 + rnd() * 1900;
    const td = ctx.trackDist(x, z);
    if (td < 60 || td > 260) continue;
    const R = 50 + rnd() * 50;
    if (Math.hypot(x - pcx, z - pcz) < R + 190) continue;
    if (!ctx.clearOf(x, z, R * 1.42)) continue;
    hills.push({ x: x, z: z, R: R, H: 14 + rnd() * 20, y: ctx.ground(x, z) });
  }
  const hillIM = inst(new T.SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff), hills.length);
  const HILLPAL = [0x3f7a3c, 0x4b8443, 0x35683a, 0x58904b, 0x2f5e36];
  hills.forEach((h, i) => { put(hillIM, i, h.x, h.y, h.z, h.R, h.H, h.R, 0, 0); tint(hillIM, i, HILLPAL[(rnd() * HILLPAL.length) | 0]); });
  done(hillIM);

  const trees = [];
  hills.forEach(h => {
    for (let k = 0; k < 14; k++) {
      const f = Math.sqrt(rnd()) * 0.9, th = rnd() * Math.PI * 2, s = 3.4 + rnd() * 1.4;
      const x = h.x + Math.cos(th) * h.R * f, z = h.z + Math.sin(th) * h.R * f;
      if (!ctx.clearOf(x, z, s * 1.1)) continue;
      trees.push({ x: x, y: h.y + h.H * Math.sqrt(Math.max(0, 1 - f * f)) - 0.5, z: z, s: s });
    }
  });
  for (let k = 0; k < 900 && trees.length < 700; k++) {
    const x = -1200 + rnd() * 2400, z = -900 + rnd() * 1800;
    const td = ctx.trackDist(x, z);
    if (td < 45 || td > 260 || Math.hypot(x - pcx, z - pcz) < 180) continue;
    const s = 3.4 + rnd() * 1.4;
    if (!ctx.clearOf(x, z, s * 1.1)) continue;
    trees.push({ x: x, y: ctx.ground(x, z), z: z, s: s });
  }
  const trunkIM = inst(new T.CylinderGeometry(0.35, 0.45, 1, 5), mat(0x5a4632), trees.length);
  const crownIM = inst(new T.IcosahedronGeometry(1, 0), mat(0xffffff), trees.length);
  const GREEN = [0x2f6b3a, 0x3d7f45, 0x2a5d35, 0x4f8c3f, 0x3a7447];
  trees.forEach((t, i) => {
    put(trunkIM, i, t.x, t.y + 1.8, t.z, 1, 3.6, 1, 0, 0);
    put(crownIM, i, t.x, t.y + 3.6 + t.s * 0.5, t.z, t.s, t.s * 1.1, t.s, 0, 0);
    tint(crownIM, i, GREEN[(rnd() * GREEN.length) | 0]);
  });
  done(trunkIM); done(crownIM);

  // rice paddies: a loose grid of flat fields in the east and south, well beyond the hills
  const PADS = [0x8fb84e, 0xb7c25a, 0x6e9a3c, 0xc9b65a, 0x7a8f45, 0xa3a85a, 0x8a6e4b];
  const pads = [];
  for (let gx = -1300; gx <= 1300; gx += 58) for (let gz = -900; gz <= 1000; gz += 44) {
    if (rnd() < 0.5) continue;
    const x = gx + (rnd() - 0.5) * 14, z = gz + (rnd() - 0.5) * 10;
    if (!(x > 150 || z > 250)) continue;
    const w = 40 + rnd() * 14, d = 26 + rnd() * 12, hd = Math.sqrt(w * w + d * d) / 2;
    if (ctx.trackDist(x, z) < 280 || !ctx.clearOf(x, z, hd)) continue;
    pads.push({ x: x, z: z, w: w, d: d, y: ctx.ground(x, z) });
  }
  const padIM = inst(new T.BoxGeometry(1, 1, 1), mat(0xffffff), pads.length);
  pads.forEach((p, i) => { put(padIM, i, p.x, p.y + 0.06, p.z, p.w, 0.12, p.d, 0, 0); tint(padIM, i, PADS[(rnd() * PADS.length) | 0]); });
  done(padIM);
};
