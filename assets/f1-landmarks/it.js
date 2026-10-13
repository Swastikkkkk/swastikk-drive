window.F1Landmarks['it'] = function (ctx) {
  const T = ctx.THREE;
  const rnd = ctx.rand;
  const TAU = Math.PI * 2;

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

  // 1. Royal park woodland: pines and broadleaf trees scattered wherever the road is not
  const woodland = () => {
    const list = [];
    for (let t = 0; t < 4000 && list.length < 1100; t++) {
      const x = -1000 + rnd() * 2000, z = -1150 + rnd() * 2500;
      if (!ctx.clearOf(x, z, 9)) continue;
      list.push({ x, y: ctx.ground(x, z), z, s: 0.8 + rnd() * 0.6, ry: rnd() * TAU });
    }
    if (!list.length) return;
    const trunkG = new T.CylinderGeometry(0.35, 0.5, 3, 5);
    trunkG.translate(0, 1.5, 0);
    const folG = new T.ConeGeometry(2.8, 9.5, 6);
    folG.translate(0, 7.25, 0);
    const trunk = inst(trunkG, mat(0x5b4129, { roughness: 1 }), list.length);
    const fol = inst(folG, mat(0x2f5d34, { roughness: 0.9 }), list.length);
    list.forEach((t, i) => {
      setI(trunk, i, t.x, t.y, t.z, t.s, t.s, t.s, t.ry);
      setI(fol, i, t.x, t.y, t.z, t.s, t.s, t.s, t.ry);
    });
    ctx.add(trunk);
    ctx.add(fol);
  };

  // 2. Old high-speed banking ruins: a broken curved concrete wall standing in the trees, east of the main straight
  const bankingRuins = () => {
    const p = ctx.at(0.07);
    const R = 120, cx = p.x - p.lx * 230, cz = p.z - p.lz * 230;   // right-hand side of the straight = east
    const N = 24, span = 1.6, dA = span / N;
    const segs = [];
    for (let i = 0; i < N; i++) {
      if (rnd() < 0.2) continue;   // broken-out gaps in the wall
      const a = -0.8 + (i + 0.5) * dA;
      const x = cx + R * Math.cos(a), z = cz + R * Math.sin(a);
      if (!ctx.clearOf(x, z, 9)) continue;
      const dx = -Math.sin(a), dz = Math.cos(a);
      segs.push({ x, y: ctx.ground(x, z), z, ry: Math.atan2(-dz, dx), h: 4 + rnd() * 8 });
    }
    if (!segs.length) return;
    const wallG = new T.BoxGeometry(1, 1, 1);
    wallG.translate(0, 0.5, 0);
    const wall = inst(wallG, mat(0x9a9d9c, { roughness: 0.95 }), segs.length);
    segs.forEach((s, i) => setI(wall, i, s.x, s.y, s.z, R * dA + 0.3, s.h, 1.2, s.ry));
    ctx.add(wall);
  };

  // 3. A stepped grandstand with a canopy on posts, seats facing the road (red and white rows)
  const stand = (u, sgn, d, len, tiers) => {
    const p = beside(u, sgn * d);
    const g = new T.Group();
    const conc = mat(0xa3a9af, { roughness: 0.9 });
    const seatA = mat(0xd6222e, { roughness: 0.8 });
    const seatB = mat(0xf2f2f2, { roughness: 0.8 });
    for (let i = 0; i < tiers; i++) {
      const h = 1.1 + i * 1.1, x = sgn * i * 3;
      g.add(put(new T.BoxGeometry(3, h, len), conc, x, h / 2, 0));
      g.add(put(new T.BoxGeometry(2.4, 0.25, len - 4), i % 2 ? seatA : seatB, x, h + 0.12, 0));
    }
    const topH = 1.1 + (tiers - 1) * 1.1;
    const roofH = topH + 4.5, roofX = sgn * (tiers * 1.5);
    g.add(put(new T.BoxGeometry(9, 0.6, len), conc, roofX, roofH, 0));
    const postG = new T.CylinderGeometry(0.4, 0.4, roofH, 6);
    postG.translate(0, roofH / 2, 0);
    const posts = inst(postG, mat(0x6c747c, { roughness: 0.7 }), 4);
    [-0.42, -0.14, 0.14, 0.42].forEach((f, i) => setI(posts, i, sgn * (tiers * 1.5 - 4.5), 0, f * len, 1, 1, 1, 0));
    g.add(posts);
    g.position.set(p.x, ctx.ground(p.x, p.z), p.z);
    g.rotation.y = p.yaw;
    ctx.add(g);
    return g;
  };

  // Italian tricolour on a pole, built inside a group at local (x, z) with top at height h
  const flag = (g, x, z, h) => {
    const pole = new T.CylinderGeometry(0.12, 0.12, 4, 5);
    g.add(put(pole, mat(0xcfd5da, { roughness: 0.4, metalness: 0.5 }), x, h + 2, z));
    const cols = [0x009246, 0xffffff, 0xce2b37];
    cols.forEach((c, i) => g.add(put(new T.BoxGeometry(0.1, 1.35, 1.33), mat(c, { roughness: 0.7 }), x, h + 3.3, z + (i - 1) * 1.33)));
  };

  // 4. Start-finish main grandstand (right side of the straight) with a podium behind it
  const mainGrandstand = () => {
    const d = ctx.clear + 12, sgn = -1;
    const g = stand(0, sgn, d, 110, 6);
    const pm = beside(0, sgn * (d + 30));
    const pod = new T.Group();
    const steps = [[-3.4, 2.8, 0xf2f2f2], [0, 3.4, 0xce2b37], [3.4, 2.2, 0x009246]];
    steps.forEach(s => pod.add(put(new T.BoxGeometry(3.2, s[1], 3.2), mat(s[2], { roughness: 0.6 }), 0, s[1] / 2, s[0])));
    pod.add(put(new T.BoxGeometry(12, 0.5, 11), mat(0xc9d0d8, { roughness: 0.4, metalness: 0.4 }), 0, 9, 0));
    [-5, 5].forEach(z => pod.add(put(new T.CylinderGeometry(0.3, 0.3, 9, 6), mat(0x8c949c), 0, 4.5, z)));
    pod.position.set(pm.x, ctx.ground(pm.x, pm.z), pm.z);
    pod.rotation.y = pm.yaw;
    ctx.add(pod);
    flag(g, sgn * 9, 50, 11.4);   // on the roof at the far end of the stand
  };

  // 5. Parabolica grandstand on the outside of the final corner
  const parabolica = () => {
    const a = ctx.at(0.885), b = ctx.at(0.915), m = ctx.at(0.9);
    const turnLeft = ((b.tx - a.tx) * m.lx + (b.tz - a.tz) * m.lz) > 0;
    const sgn = turnLeft ? -1 : 1;   // the outside of the corner
    stand(0.9, sgn, ctx.clear + 12, 100, 5);
  };

  woodland();
  bankingRuins();
  mainGrandstand();
  parabolica();
};
