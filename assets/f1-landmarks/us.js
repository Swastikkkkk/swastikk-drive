window.F1Landmarks['us'] = function (ctx) {
  const T = ctx.THREE;
  const rnd = ctx.rand;
  const TAU = Math.PI * 2;
  const L = ctx.lengthM;

  const mat = (color, o) => ctx.mat(color, Object.assign({ flatShading: true }, o || {}));
  const put = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); return o; };
  const inst = (geo, m, n) => { const im = new T.InstancedMesh(geo, m, n); im.frustumCulled = false; return im; };
  const m4 = new T.Matrix4(), qt = new T.Quaternion(), eu = new T.Euler(), pv = new T.Vector3(), sv = new T.Vector3();
  const setI = (im, i, x, y, z, sx, sy, sz, ry) => {
    eu.set(0, ry || 0, 0); qt.setFromEuler(eu); pv.set(x, y, z); sv.set(sx, sy, sz);
    m4.compose(pv, qt, sv); im.setMatrixAt(i, m4);
  };

  // point on the road at lap fraction u, `lat` metres to the left (+) and `along` metres forward
  const pointAt = (u, lat, along) => {
    const p = ctx.at(u);
    return { x: p.x + p.lx * lat + p.tx * (along || 0), z: p.z + p.lz * lat + p.tz * (along || 0), yaw: p.yaw };
  };
  // true if a stand of `len` metres along the road, lying from lateral distance d out to d + depth on `side`, is clear
  const fits = (u, side, d, len, depth) => {
    for (let s = -len / 2; s <= len / 2 + 0.01; s += 12) {
      const b = ctx.at(u + s / L);
      for (let k = -2; k <= depth + 2; k += 3) {
        const x = b.x + b.lx * side * (d + k), z = b.z + b.lz * side * (d + k);
        if (!ctx.clearOf(x, z, 9)) return false;   // 9 m: covers the corners of a rotated 10 m section
      }
    }
    return true;
  };
  // first clear spot for a stand, looking outward from the road (preferred side first)
  const findStand = (u, prefer, len, depth) => {
    for (let d = ctx.clear + 2; d < ctx.clear + 90; d += 2)
      for (const s of [prefer, -prefer]) if (fits(u, s, d, len, depth)) return { side: s, d };
    return null;
  };

  // centre of the circuit (average of the road), used to know which side is the infield
  let cx = 0, cz = 0; for (let i = 0; i < 40; i++) { const p = ctx.at(i / 40); cx += p.x; cz += p.z; } cx /= 40; cz /= 40;

  // 1. Grandstand: stepped terrace with a canopy on posts, seats facing the road
  const grandstand = (u, side, d, len, tiers, roof) => {
    const p = pointAt(u, side * d);
    const g = new T.Group();
    const conc = mat(0xa3a9af, { roughness: 0.9 });
    const seat = mat(0xffffff, { roughness: 0.8 });
    const steel = mat(0x8c949c, { roughness: 0.5, metalness: 0.4 });
    // short sections (InstancedMesh) so every piece stays small and sits straight on the road's curve
    const S = 10, nS = Math.max(1, Math.round(len / S)), sl = len / nS;
    const cnt = tiers * nS;
    const blockG = new T.BoxGeometry(3, 1, sl); blockG.translate(0, 0.5, 0);
    const blocks = inst(blockG, conc, cnt);
    const seatG = new T.BoxGeometry(2.4, 0.25, sl - 0.4);
    const seats = inst(seatG, seat, cnt);
    const seatCols = [0xc8102e, 0xf2f2f2];
    let n = 0;
    for (let i = 0; i < tiers; i++) {
      const h = 1.1 + i * 1.1, x = side * i * 3;
      for (let k = 0; k < nS; k++) {
        const zc = -len / 2 + (k + 0.5) * sl;
        setI(blocks, n, x, 0, zc, 1, h, 1, 0);
        setI(seats, n, x, h + 0.12, zc, 1, 1, 1, 0);
        seats.setColorAt(n, new T.Color(seatCols[i % 2]));
        n++;
      }
    }
    g.add(blocks);
    g.add(seats);
    if (roof) {
      const rn = nS;
      const roofG = new T.BoxGeometry(9, 0.6, sl);
      const rf = inst(roofG, steel, rn);
      for (let k = 0; k < rn; k++) setI(rf, k, side * 11, 9.5, -len / 2 + (k + 0.5) * sl, 1, 1, 1, 0);
      g.add(rf);
      const pn = Math.ceil(len / 20) + 1;
      const postG = new T.CylinderGeometry(0.4, 0.4, 9.2, 6); postG.translate(0, 4.6, 0);
      const posts = inst(postG, steel, pn);
      for (let i = 0; i < pn; i++) setI(posts, i, side * 15.5, 0, -len / 2 + 2 + i * (len - 4) / (pn - 1), 1, 1, 1, 0);
      g.add(posts);
    }
    g.position.set(p.x, ctx.ground(p.x, p.z), p.z);
    g.rotation.y = p.yaw;
    ctx.add(g);
  };

  // 2. Observation tower (77 m red steel veil): tapering legs, sweeping red arcs, rings and a top viewing deck
  const tower = (x, z) => {
    const g = new T.Group();
    const red = mat(0xc8102e, { roughness: 0.5, metalness: 0.2 });
    const H = 77, RB = 12, RT = 2.2;
    const up = new T.Vector3(0, 1, 0), dir = new T.Vector3();
    const legG = new T.CylinderGeometry(0.28, 0.28, 1, 5);
    const link = (a, b, geo, m) => {
      dir.subVectors(b, a); const len = dir.length(); dir.normalize();
      const mm = new T.Mesh(geo, m);
      mm.scale.set(1, len, 1);
      mm.quaternion.setFromUnitVectors(up, dir);
      mm.position.copy(a).add(b).multiplyScalar(0.5);
      g.add(mm);
    };
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      link(new T.Vector3(Math.cos(a) * RB, 0, Math.sin(a) * RB), new T.Vector3(Math.cos(a) * RT, H, Math.sin(a) * RT), legG, red);
    }
    // sweeping veil arcs: each one bows outward from base to top
    for (let k = 0; k < 4; k++) {
      const a0 = k * Math.PI / 2 + Math.PI / 4 - 0.35;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, r = RB + (RT - RB) * t + 3.2 * Math.sin(Math.PI * t), ang = a0 + t * 1.2;
        pts.push(new T.Vector3(Math.cos(ang) * r, t * H, Math.sin(ang) * r));
      }
      const curve = new T.CatmullRomCurve3(pts);
      g.add(new T.Mesh(new T.TubeGeometry(curve, 30, 0.3, 4, false), red));
    }
    // horizontal rings, instanced, radius follows the taper
    const ringG = new T.TorusGeometry(1, 0.03, 3, 12); ringG.rotateX(Math.PI / 2);
    const ringIM = inst(ringG, red, 9);
    for (let i = 0; i < 9; i++) {
      const h = 9 + i * 7, r = RB + (RT - RB) * (h / H);
      setI(ringIM, i, 0, h, 0, r, 1, r, 0);
    }
    g.add(ringIM);
    // viewing deck at the top: floor, glass-rail ring and a small roof
    g.add(put(new T.CylinderGeometry(4.2, 4.2, 0.5, 14), mat(0x6f7780, { roughness: 0.6 }), 0, H - 2.5, 0));
    const rail = new T.Mesh(new T.CylinderGeometry(4.3, 4.3, 2.2, 14, 1, true), mat(0x9fb8c4, { roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.6, side: T.DoubleSide }));
    rail.position.set(0, H - 1.4, 0); g.add(rail);
    g.add(put(new T.ConeGeometry(4.8, 2.4, 14), red, 0, H + 0.2, 0));
    g.position.set(x, ctx.ground(x, z), z);
    ctx.add(g);
  };

  // 3. Amphitheatre: stepped half-bowl of concentric terraces around a stage, near the tower
  const amphitheatre = (x, z, faceYaw) => {
    const g = new T.Group();
    const grass = mat(0x6a8a3a, { roughness: 1 });
    const stone = mat(0xb9b2a6, { roughness: 0.9 });
    const radii = [24, 20, 16, 12];
    radii.forEach((R, i) => {
      const h = 1.1 + i * 1.1;
      const geo = new T.CylinderGeometry(R, R, h, 18, 1, false, 0, Math.PI);
      geo.translate(0, h / 2, 0);
      g.add(new T.Mesh(geo, i % 2 ? stone : grass));
    });
    g.add(put(new T.BoxGeometry(14, 1.2, 6), mat(0x5b5f66), 0, 0.6, -2));   // stage slab
    g.position.set(x, ctx.ground(x, z), z);
    g.rotation.y = faceYaw;
    ctx.add(g);
  };

  // 4. Texas hill country: rounded scrub hills around the circuit, never under the road
  const hills = () => {
    const list = [];
    for (let t = 0, n = 0; t < 400 && n < 16; t++) {
      const x = (rnd() - 0.5) * 2400, z = (rnd() - 0.5) * 2000;
      const R = 60 + rnd() * 70, H = R * (0.22 + rnd() * 0.2);
      if (!ctx.clearOf(x, z, R * 1.45)) continue;
      list.push({ x, z, R, H, y: ctx.ground(x, z), c: rnd() < 0.5 ? 0 : 1 });
      n++;
    }
    if (!list.length) return;
    const geo = new T.SphereGeometry(1, 8, 5, 0, TAU, 0, Math.PI / 2);   // upper half: base at y=0
    const im = inst(geo, mat(0xffffff, { roughness: 1 }), list.length);
    const cols = [0x7d8a52, 0x8f8a5c];
    list.forEach((h, i) => { setI(im, i, h.x, h.y, h.z, h.R, h.H, h.R, 0); im.setColorAt(i, new T.Color(cols[h.c])); });
    ctx.add(im);
  };

  // 5. Live oaks and scrub trees (InstancedMesh): trunk + wide, dark crown
  const oaks = () => {
    const trees = [];
    for (let t = 0; t < 1500 && trees.length < 240; t++) {
      const u = rnd(), side = rnd() < 0.5 ? 1 : -1;
      const p = pointAt(u, side * (ctx.clear + 3 + rnd() * 110));
      if (!ctx.clearOf(p.x, p.z, 5)) continue;
      trees.push({ x: p.x, y: ctx.ground(p.x, p.z), z: p.z, s: 0.8 + rnd() * 0.7, ry: rnd() * TAU, c: rnd() < 0.5 ? 0 : 1 });
    }
    if (!trees.length) return;
    const trunkG = new T.CylinderGeometry(0.3, 0.45, 2.6, 5); trunkG.translate(0, 1.3, 0);
    const crownG = new T.IcosahedronGeometry(1, 0); crownG.scale(1.6, 0.85, 1.6); crownG.translate(0, 3.4, 0);
    const trunk = inst(trunkG, mat(0x5b4a36, { roughness: 1 }), trees.length);
    const crown = inst(crownG, mat(0xffffff, { roughness: 0.9 }), trees.length);
    const crowns = [0x4d6b2f, 0x5f7a38];
    trees.forEach((t, i) => {
      setI(trunk, i, t.x, t.y, t.z, t.s, t.s, t.s, t.ry);
      setI(crown, i, t.x, t.y, t.z, t.s, t.s, t.s, t.ry);
      crown.setColorAt(i, new T.Color(crowns[t.c]));
    });
    ctx.add(trunk);
    ctx.add(crown);
  };

  // ---- placement ----
  // Main grandstand on the start straight (right of the road, the usual side for the start-finish stands)
  const main = findStand(0.016, -1, 150, 17);
  if (main) grandstand(0.016, main.side, main.d, 150, 8, true);

  // Turn 1 hill grandstand on the uphill run to Turn 1
  const t1 = findStand(0.052, 1, 110, 17);
  if (t1) grandstand(0.052, t1.side, t1.d, 110, 6, true);

  // Observation tower in the infield between Turns 16 and 19: infield side is the side facing the circuit centre
  const tu = 0.86;
  const tp = ctx.at(tu);
  const insideSign = ((cx - tp.x) * tp.lx + (cz - tp.z) * tp.lz) >= 0 ? 1 : -1;
  let tpos = null;
  for (let d = ctx.clear + 12; d < ctx.clear + 140 && !tpos; d += 2) {
    for (const s of [insideSign, -insideSign]) {
      const p = pointAt(tu, s * d);
      if (ctx.clearOf(p.x, p.z, 17)) { tpos = p; break; }
    }
  }
  let towerCentre = null;
  if (tpos) { tower(tpos.x, tpos.z); towerCentre = tpos; }

  // Amphitheatre near the tower, away from the road
  if (towerCentre) {
    for (let a = 0; a < TAU && !towerCentre.amp; a += TAU / 24) {
      for (const r of [80, 95, 110]) {
        const x = towerCentre.x + Math.cos(a) * r, z = towerCentre.z + Math.sin(a) * r;
        if (ctx.clearOf(x, z, 34)) { towerCentre.amp = { x, z, a }; break; }
      }
    }
    if (towerCentre.amp) {
      const q = towerCentre.amp;
      // flat (stage) side faces the tower, curved back faces away from it
      amphitheatre(q.x, q.z, Math.atan2(towerCentre.x - q.x, towerCentre.z - q.z) + Math.PI);
    }
  }

  hills();
  oaks();
};
