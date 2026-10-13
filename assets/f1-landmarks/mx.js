window.F1Landmarks['mx'] = function (ctx) {
  const T = ctx.THREE;
  const rnd = ctx.rand;
  const TAU = Math.PI * 2;
  const LEN = ctx.lengthM;

  const mat = (color, o) => ctx.mat(color, Object.assign({ flatShading: true }, o || {}));
  const put = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); return o; };
  // point d metres left (+) / right (-) of the road centreline at lap fraction u
  const beside = (u, d) => { const p = ctx.at(u); return { x: p.x + p.lx * d, z: p.z + p.lz * d, yaw: p.yaw }; };
  const m4 = new T.Matrix4(), qt = new T.Quaternion(), eu = new T.Euler(), pv = new T.Vector3(), sv = new T.Vector3(), col = new T.Color();
  const setI = (im, i, x, y, z, sx, sy, sz, ry) => {
    eu.set(0, ry || 0, 0); qt.setFromEuler(eu); pv.set(x, y, z); sv.set(sx, sy, sz);
    m4.compose(pv, qt, sv); im.setMatrixAt(i, m4);
  };
  const inst = (geo, m, n) => { const im = new T.InstancedMesh(geo, m, n); im.frustumCulled = false; return im; };
  // unit box standing on y = 0 (scaled per instance)
  const boxUp = () => { const g = new T.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; };

  // circuit centre, used to place the city and the park
  let cx = 0, cz = 0;
  for (let k = 0; k < 64; k++) { const p = ctx.at(k / 64); cx += p.x; cz += p.z; }
  cx /= 64; cz /= 64;

  // 1. Foro Sol: tiered baseball-stadium stands on both sides of the stadium section (lap 0.735-0.865)
  const stadium = () => {
    const U0 = 0.735, U1 = 0.865, N = 24, TIERS = 5;
    const segLen = (U1 - U0) * LEN / N * 0.92;
    const tierCol = [0x9da4ab, 0xc8102e, 0xf2f2f2, 0x2a5fa8, 0xf2f2f2];
    const list = [];
    for (let s = -1; s <= 1; s += 2) {
      for (let k = 0; k < N; k++) {
        const u = U0 + (k + 0.5) * (U1 - U0) / N;
        for (let j = 0; j < TIERS; j++) {
          const dist = ctx.clear + 22 + j * 3 + 1.5;   // stands rise away from the track
          const c = beside(u, s * dist);
          if (!ctx.clearOf(c.x, c.z, segLen * 0.5 + 1.5)) continue;
          list.push({ x: c.x, z: c.z, yaw: c.yaw, h: 1.2 + j * 2.4, j });
        }
      }
    }
    if (!list.length) return;
    const im = inst(boxUp(), mat(0xffffff, { roughness: 0.8 }), list.length);
    list.forEach((b, i) => {
      setI(im, i, b.x, ctx.ground(b.x, b.z), b.z, 3, b.h, segLen, b.yaw);
      col.setHex(tierCol[b.j]); im.setColorAt(i, col);
    });
    ctx.add(im);
  };

  // 2. Main grandstand on the start straight (right-hand side), four tiers under a canopy
  const grandstand = () => {
    const u = 0.03, side = -1, L = 90, TIERS = 4, dStart = ctx.clear + 12;
    const p = ctx.at(u);
    const g = new T.Group();
    const conc = mat(0x9ea6ae, { roughness: 0.9 });
    const seatA = mat(0xc8102e, { roughness: 0.8 });
    const seatB = mat(0xf2f2f2, { roughness: 0.8 });
    for (let i = 0; i < TIERS; i++) {
      const h = 1.2 + i * 1.3, dist = dStart + i * 2.8 + 1.4;
      g.add(put(new T.BoxGeometry(2.8, h, L), conc, side * dist, h / 2, 0));
      g.add(put(new T.BoxGeometry(2.6, 0.25, L - 2), i % 2 ? seatA : seatB, side * dist, h + 0.12, 0));
    }
    const roofDist = dStart + 6;
    g.add(put(new T.BoxGeometry(12, 0.6, L), mat(0xdfe4e9, { roughness: 0.4, metalness: 0.2 }), side * roofDist, 10.5, 0));
    const posts = inst(new T.BoxGeometry(0.5, 10.5, 0.5), mat(0x6c747c, { roughness: 0.7 }), 2 * Math.ceil(L / 18));
    let n = 0;
    for (let z = -L / 2 + 4; z <= L / 2 - 4; z += 18) {
      setI(posts, n++, side * (dStart + 0.5), 5.25, z, 1, 1, 1, 0);
      setI(posts, n++, side * (dStart + 11.5), 5.25, z, 1, 1, 1, 0);
    }
    g.add(posts);
    g.position.set(p.x, ctx.ground(p.x, p.z), p.z);
    g.rotation.y = p.yaw;
    ctx.add(g);
  };

  // 3. Magdalena Mixhuca park: trees scattered through the sports park around the circuit
  const park = () => {
    const list = [];
    for (let t = 0; t < 2400 && list.length < 900; t++) {
      const u = rnd(), side = rnd() < 0.5 ? -1 : 1, d = ctx.clear + 8 + rnd() * 80;
      const c = beside(u, side * d);
      if (!ctx.clearOf(c.x, c.z, 7)) continue;
      list.push({ x: c.x, y: ctx.ground(c.x, c.z), z: c.z, s: 0.8 + rnd() * 0.6, ry: rnd() * TAU, k: rnd() });
    }
    if (!list.length) return;
    const trunkG = new T.CylinderGeometry(0.3, 0.4, 3.2, 5);
    trunkG.translate(0, 1.6, 0);
    const crownG = new T.IcosahedronGeometry(3.2, 0);
    crownG.translate(0, 6.2, 0);
    const trunk = inst(trunkG, mat(0x5b4129, { roughness: 1 }), list.length);
    const crown = inst(crownG, mat(0xffffff, { roughness: 0.9 }), list.length);
    const greens = [0x2f6b35, 0x3d7a3a, 0x27592d, 0x4a8440];
    list.forEach((t, i) => {
      setI(trunk, i, t.x, t.y, t.z, t.s, t.s, t.s, t.ry);
      setI(crown, i, t.x, t.y, t.z, t.s, t.s, t.s, t.ry);
      col.setHex(greens[Math.floor(t.k * greens.length)]); crown.setColorAt(i, col);
    });
    ctx.add(trunk);
    ctx.add(crown);
  };

  // 4. A few palms along the start straight and the pit area
  const palms = () => {
    const list = [];
    for (let t = 0; t < 900 && list.length < 22; t++) {
      const u = ((rnd() * 0.12 - 0.06) + 1) % 1;
      const side = rnd() < 0.5 ? -1 : 1, d = ctx.clear + 3 + rnd() * 6;
      const c = beside(u, side * d);
      if (!ctx.clearOf(c.x, c.z, 4.5)) continue;
      list.push({ x: c.x, y: ctx.ground(c.x, c.z), z: c.z, h: 6 + rnd() * 4, s: 0.8 + rnd() * 0.4, ry: rnd() * TAU });
    }
    if (!list.length) return;
    const trunk = inst(boxUp(), mat(0x8a6a48, { roughness: 1 }), list.length);
    const crown = inst(new T.IcosahedronGeometry(2.6, 0), mat(0x3f7a3a, { roughness: 0.9 }), list.length);
    list.forEach((t, i) => {
      setI(trunk, i, t.x, t.y, t.z, 0.5 * t.s, t.h, 0.5 * t.s, t.ry);
      setI(crown, i, t.x, t.y + t.h, t.z, 1.1 * t.s, 0.45 * t.s, 1.1 * t.s, t.ry);
    });
    ctx.add(trunk);
    ctx.add(crown);
  };

  // 5. Low-rise Mexico City in the distance, to the west and north of the circuit
  const city = () => {
    const list = [];
    for (let t = 0; t < 1600 && list.length < 260; t++) {
      const x = cx + (rnd() * 2 - 1) * 1500 - 100, z = cz + (rnd() * 2 - 1) * 1500 - 100;
      const dx = x - cx, dz = z - cz;
      if (dx > 150 && dz > 150) continue;
      if (Math.hypot(dx, dz) < 420 || ctx.trackDist(x, z) < 160) continue;
      list.push({ x, z, w: 14 + rnd() * 24, dp: 14 + rnd() * 24, h: 6 + rnd() * rnd() * 28, ry: Math.floor(rnd() * 4) * Math.PI / 2, c: Math.floor(rnd() * 5) });
    }
    if (!list.length) return;
    const cols = [0xd9cbb0, 0xc9a98a, 0xe8e4dc, 0xb5664b, 0x9aa5ad];
    const im = inst(boxUp(), mat(0xffffff, { roughness: 0.9 }), list.length);
    list.forEach((b, i) => {
      setI(im, i, b.x, ctx.ground(b.x, b.z), b.z, b.w, b.h, b.dp, b.ry);
      col.setHex(cols[b.c]); im.setColorAt(i, col);
    });
    ctx.add(im);
  };

  stadium();
  grandstand();
  park();
  palms();
  city();
};
