window.F1Landmarks['at'] = function (ctx) {
  const T = ctx.THREE;
  const rnd = ctx.rand;
  const TAU = Math.PI * 2;
  const VX = -830, VZ = 470;   // Spielberg village, south-west of the circuit (approximate)

  const mat = (color, o) => ctx.mat(color, Object.assign({ flatShading: true }, o || {}));
  const put = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); return o; };
  // point d metres left (+) / right (-) of the road centreline at lap fraction u
  const beside = (u, d) => { const p = ctx.at(u); return { x: p.x + p.lx * d, z: p.z + p.lz * d, yaw: p.yaw }; };
  const m4 = new T.Matrix4(), qt = new T.Quaternion(), eu = new T.Euler(), pv = new T.Vector3(), sv = new T.Vector3();
  const setI = (im, i, x, y, z, sx, sy, sz, ry) => {
    eu.set(0, ry || 0, 0); qt.setFromEuler(eu); pv.set(x, y, z); sv.set(sx, sy, sz);
    m4.compose(pv, qt, sv); im.setMatrixAt(i, m4);
  };
  const inst = (geo, m, n) => { const im = new T.InstancedMesh(geo, m, n); im.frustumCulled = false; return im; };

  // 1. Red Bull bull: steel sculpture on a plinth, on the hillside beside Turn 3, facing the road
  const bull = (x, z, toX, toZ) => {
    const g = new T.Group();
    const steel = mat(0xaeb6bf, { roughness: 0.35, metalness: 0.75 });
    const dark = mat(0x4a4f57, { roughness: 0.8, metalness: 0.1 });
    const red = mat(0xc8102e, { roughness: 0.5 });
    const add = o => g.add(o);
    add(put(new T.BoxGeometry(16, 2, 10), dark, 0, 1, 0));
    add(put(new T.BoxGeometry(16.4, 0.3, 10.4), red, 0, 2.15, 0));
    const legG = new T.CylinderGeometry(0.6, 0.7, 5.5, 6);
    [[-1.8, -4], [1.8, -4], [-1.8, 4], [1.8, 4]].forEach(p => add(put(legG, steel, p[0], 4.75, p[1])));
    add(put(new T.BoxGeometry(5, 4.6, 11), steel, 0, 9.8, 0));
    add(put(new T.BoxGeometry(5.6, 5, 3.6), steel, 0, 10.5, 6.4));
    add(put(new T.BoxGeometry(3.6, 3.4, 3), steel, 0, 12.4, 8.4));
    add(put(new T.BoxGeometry(3.4, 3.2, 4.4), steel, 0, 11.2, 10.6));
    const hornG = new T.ConeGeometry(0.45, 3.2, 6);
    [-1, 1].forEach(s => { const h = put(hornG, dark, s * 1.5, 14.2, 10.4); h.rotation.z = -s * 0.5; add(h); });
    const eyeG = new T.BoxGeometry(0.6, 0.4, 0.2);
    [-1, 1].forEach(s => add(put(eyeG, red, s * 0.9, 11.6, 12.85)));
    const tail = put(new T.CylinderGeometry(0.25, 0.15, 4.5, 5), dark, 0, 8.6, -7.2);
    tail.rotation.x = -0.6; add(tail);
    g.position.set(x, ctx.ground(x, z), z);
    g.rotation.y = Math.atan2(toX - x, toZ - z);
    ctx.add(g);
  };

  // 2. Start-finish pit building: long glass hall with a swept, wing-shaped canopy roof
  const pitBuilding = (u, side, d, len) => {
    const p = beside(u, side * d);
    const g = new T.Group();
    const wall = mat(0xeef1f4, { roughness: 0.6 });
    const glass = mat(0x2d4a5e, { roughness: 0.2, metalness: 0.3 });
    const roofM = mat(0xc9d0d8, { roughness: 0.35, metalness: 0.5, side: T.DoubleSide });
    const colM = mat(0x8c949c, { roughness: 0.7 });
    const L2 = len / 2, W = 14, D = 26, segs = 4, sl = len / segs;
    const sh = new T.Shape();
    sh.moveTo(-L2, 8);
    sh.quadraticCurveTo(0, 9, L2, 22);
    sh.lineTo(L2, 25);
    sh.quadraticCurveTo(0, 13, -L2, 11);
    sh.lineTo(-L2, 8);
    const roofG = new T.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 16 });
    roofG.rotateY(-Math.PI / 2);
    roofG.translate(D / 2, 0, 0);
    g.add(put(roofG, roofM, 0, 0, 0));
    const walls = [];
    for (let k = 0; k < segs; k++) {
      const zc = -L2 + (k + 0.5) * sl;
      const w = put(new T.BoxGeometry(W, 8, sl - 0.6), wall, 0, 4, zc);
      walls.push(w); g.add(w);
      g.add(put(new T.BoxGeometry(0.3, 4.4, sl - 3), glass, -side * (W / 2 + 0.05), 4.6, zc));
    }
    const cols = [];
    for (let k = 0; k <= 10; k++) {
      const zc = -L2 + 4 + k * ((len - 8) / 10);
      cols.push([-11, zc], [11, zc]);
    }
    const colG = new T.CylinderGeometry(0.5, 0.5, 1, 6);
    const colIM = inst(colG, colM, cols.length);
    cols.forEach((c, i) => {
      const top = 8 + (c[1] + L2) / len * 14 - 0.6;   // underside of the canopy above this column
      setI(colIM, i, c[0], top / 2, c[1], 1, top, 1, 0);
    });
    g.add(colIM);
    g.position.set(p.x, ctx.ground(p.x, p.z), p.z);
    g.rotation.y = p.yaw;
    ctx.add(g);
    g.updateMatrixWorld(true);
    walls.forEach(w => ctx.solid(w));
  };

  // 3. Turn 3 hillside grandstand: stepped terrace with a canopy on posts, seats facing the road
  const grandstand = (u, side, d) => {
    const p = beside(u, side * d);
    const g = new T.Group();
    const conc = mat(0xa3a9af, { roughness: 0.9 });
    const seatA = mat(0xd6222e, { roughness: 0.8 });
    const seatB = mat(0xf2f2f2, { roughness: 0.8 });
    const len = 90, tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const h = 1.1 + i * 1.1, x = side * i * 3;
      g.add(put(new T.BoxGeometry(3, h, len), conc, x, h / 2, 0));
      g.add(put(new T.BoxGeometry(2.4, 0.25, len - 4), i % 2 ? seatA : seatB, x, h + 0.12, 0));
    }
    g.add(put(new T.BoxGeometry(9, 0.6, len), conc, side * 11, 9.5, 0));
    const postG = new T.CylinderGeometry(0.4, 0.4, 9.2, 6);
    postG.translate(0, 4.6, 0);
    const posts = inst(postG, mat(0x6c747c, { roughness: 0.7 }), 4);
    [-40, -13, 13, 40].forEach((z, i) => setI(posts, i, side * 15.5, 0, z, 1, 1, 1, 0));
    g.add(posts);
    g.position.set(p.x, ctx.ground(p.x, p.z), p.z);
    g.rotation.y = p.yaw;
    ctx.add(g);
  };

  // 4. Styrian mountains: a ring of tall peaks with snow caps, pine forest on their slopes
  const mountains = () => {
    const peaks = [];
    const NP = 26;
    for (let i = 0; i < NP; i++) {
      const a = (i + 0.3 + rnd() * 0.4) / NP * TAU;
      const x = Math.cos(a) * (1520 + rnd() * 240), z = Math.sin(a) * (1120 + rnd() * 200);
      const R0 = 300 + rnd() * 220, H = 360 + rnd() * 460;
      if (ctx.clearOf(x, z, R0 * 1.42)) peaks.push({ x, z, R0, H, y: ctx.ground(x, z), yaw: rnd() * TAU });
    }
    const coneG = new T.ConeGeometry(1, 1, 8);
    coneG.translate(0, 0.5, 0);
    const peakIM = inst(coneG, mat(0x56685a, { roughness: 0.95 }), peaks.length);
    peaks.forEach((p, i) => setI(peakIM, i, p.x, p.y, p.z, p.R0, p.H, p.R0, p.yaw));
    ctx.add(peakIM);

    const snow = peaks.filter(p => p.H > 540);
    if (snow.length) {
      const snowIM = inst(coneG, mat(0xf1f5f9, { roughness: 0.6 }), snow.length);
      snow.forEach((p, i) => setI(snowIM, i, p.x, p.y + 0.64 * p.H, p.z, 0.36 * p.R0, 0.36 * p.H, 0.36 * p.R0, p.yaw));
      ctx.add(snowIM);
    }

    const trees = [];
    peaks.forEach(p => {
      let n = 0;
      for (let t = 0; t < 160 && n < 34; t++) {
        const f = 0.45 + rnd() * 0.45, a = rnd() * TAU;
        const x = p.x + Math.cos(a) * f * p.R0, z = p.z + Math.sin(a) * f * p.R0;
        if (!ctx.clearOf(x, z, 6)) continue;
        trees.push({ x, y: p.y + p.H * (1 - f) - 0.5, z, s: 0.7 + rnd() * 0.6, ry: rnd() * TAU });
        n++;
      }
    });
    // valley floor pines, kept out of the village
    for (let t = 0, n = 0; t < 1400 && n < 240; t++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd());
      const x = Math.cos(a) * r * 1050, z = Math.sin(a) * r * 800;
      if (Math.hypot(x - VX, z - VZ) < 170 || !ctx.clearOf(x, z, 6)) continue;
      trees.push({ x, y: ctx.ground(x, z), z, s: 0.8 + rnd() * 0.6, ry: rnd() * TAU });
      n++;
    }
    if (trees.length) {
      const trunkG = new T.CylinderGeometry(0.4, 0.5, 3, 5);
      trunkG.translate(0, 1.5, 0);
      const folG = new T.ConeGeometry(2.8, 9.5, 6);
      folG.translate(0, 7.25, 0);
      const trunk = inst(trunkG, mat(0x5b4129, { roughness: 1 }), trees.length);
      const fol = inst(folG, mat(0x1f4d2e, { roughness: 0.9 }), trees.length);
      trees.forEach((t, i) => {
        setI(trunk, i, t.x, t.y, t.z, t.s, t.s, t.s, t.ry);
        setI(fol, i, t.x, t.y, t.z, t.s, t.s, t.s, t.ry);
      });
      ctx.add(trunk);
      ctx.add(fol);
    }
  };

  // 5. Meadows: flat green patches on the valley floor and the infield, never under the road
  const meadows = () => {
    const list = [];
    for (let t = 0, n = 0; t < 400 && n < 36; t++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()), rad = 60 + rnd() * 90;
      const x = Math.cos(a) * r * 950, z = Math.sin(a) * r * 720;
      if (!ctx.clearOf(x, z, rad * 1.45)) continue;
      list.push({ x, z, rad, y: ctx.ground(x, z) + 0.05 });
      n++;
    }
    if (!list.length) return;
    const geo = new T.CircleGeometry(1, 18);
    geo.rotateX(-Math.PI / 2);
    const im = inst(geo, mat(0x6a9f3e, { roughness: 1 }), list.length);
    list.forEach((m, i) => setI(im, i, m.x, m.y, m.z, m.rad, 1, m.rad, 0));
    ctx.add(im);
  };

  // 6. Spielberg village: steep-roofed houses and a church tower
  const village = () => {
    const houses = [];
    for (let t = 0; t < 500 && houses.length < 18; t++) {
      const x = VX + (rnd() - 0.5) * 280, z = VZ + (rnd() - 0.5) * 220;
      if (!ctx.clearOf(x, z, 9) || houses.some(h => Math.hypot(h.x - x, h.z - z) < 13)) continue;
      houses.push({ x, z, ry: Math.floor(rnd() * 2) * Math.PI / 2 + (rnd() - 0.5) * 0.2, c: Math.floor(rnd() * 4) });
    }
    if (houses.length) {
      const bodyG = new T.BoxGeometry(8.8, 6, 10);
      bodyG.translate(0, 3, 0);
      const tri = new T.Shape();
      tri.moveTo(-5.2, 0); tri.lineTo(5.2, 0); tri.lineTo(0, 7.4); tri.closePath();
      const roofG = new T.ExtrudeGeometry(tri, { depth: 11, bevelEnabled: false });
      roofG.translate(0, 6, -5.5);
      const body = inst(bodyG, mat(0xffffff), houses.length);
      const roof = inst(roofG, mat(0xffffff, { roughness: 0.9 }), houses.length);
      const wallCols = [0xefe3c8, 0xe6c58a, 0xcfe0e6, 0xf2f0ea];
      const roofCols = [0x7a3b2b, 0x6a3428, 0x4e4a48, 0x8a4a2e];
      houses.forEach((h, i) => {
        const gy = ctx.ground(h.x, h.z);
        setI(body, i, h.x, gy, h.z, 1, 1, 1, h.ry);
        setI(roof, i, h.x, gy, h.z, 1, 1, 1, h.ry);
        body.setColorAt(i, new T.Color(wallCols[h.c]));
        roof.setColorAt(i, new T.Color(roofCols[h.c]));
      });
      ctx.add(body);
      ctx.add(roof);
    }
    const cx = VX + 60, cz = VZ - 50;
    if (ctx.clearOf(cx, cz, 12)) {
      const cy = ctx.ground(cx, cz);
      ctx.add(put(new T.BoxGeometry(7, 14, 7), mat(0xf4efe4), cx, cy + 7, cz));
      ctx.add(put(new T.ConeGeometry(4.8, 16, 6), mat(0x3f7a5a), cx, cy + 22, cz));
    }
  };

  village();
  meadows();
  mountains();
  const t3 = ctx.at(0.25);
  const bp = beside(0.25, -48);
  bull(bp.x, bp.z, t3.x, t3.z);
  pitBuilding(0, -1, 36, 130);
  grandstand(0.25, 1, 33);
};
