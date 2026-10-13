window.F1Landmarks['br'] = function (ctx) {
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

  // 1. Descida do Lago: small lakes in the infield (inside the loop = driver's left for an anticlockwise track)
  const lakes = [];
  const lake = () => {
    const c = beside(0.25, 58);
    const discs = [[0, 0, 26], [24, -8, 15], [-18, 10, 14], [8, 24, 10]];
    discs.forEach(([dx, dz, r]) => {
      const x = c.x + dx, z = c.z + dz;
      if (ctx.clearOf(x, z, r + 1)) lakes.push({ x, z, r, y: ctx.ground(x, z) + 0.05 });
    });
    if (!lakes.length) return;
    const geo = new T.CircleGeometry(1, 24);
    geo.rotateX(-Math.PI / 2);
    const im = inst(geo, mat(0x2a7ea8, { roughness: 0.25, metalness: 0.1 }), lakes.length);
    lakes.forEach((l, i) => setI(im, i, l.x, l.y, l.z, l.r, 1, l.r, 0));
    ctx.add(im);
  };

  // 2. Sao Paulo apartment towers on the hills north and west of the circuit
  const windowTex = () => {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 128;
    const g2 = cv.getContext('2d');
    g2.fillStyle = ctx.night ? '#1e2630' : '#d3d9e0';
    g2.fillRect(0, 0, 64, 128);
    for (let col = 0; col < 6; col++) {
      for (let row = 0; row < 10; row++) {
        let lit;
        if (ctx.night) lit = rnd() < 0.45 ? '#ffd76a' : '#2b3644';
        else lit = rnd() < 0.8 ? '#3f5f7a' : '#2c4256';
        g2.fillStyle = lit;
        g2.fillRect(4 + col * 10, 6 + row * 12, 6, 8);
      }
    }
    return new T.CanvasTexture(cv);
  };
  const towers = () => {
    const list = [];
    for (let t = 0; t < 4000 && list.length < 90; t++) {
      const x = -1100 + rnd() * 1500, z = -1000 + rnd() * 1400;
      if (x > 0 && z > 0 && rnd() > 0.2) continue;       // dense to the north and west, sparse to the south-east
      const w = 14 + rnd() * 8, d = 14 + rnd() * 8, h = 40 + rnd() * 100;
      if (!ctx.clearOf(x, z, Math.max(w, d) * 0.5 + 4)) continue;
      if (list.some(o => Math.hypot(o.x - x, o.z - z) < 26)) continue;
      list.push({ x, z, w, d, h, y: ctx.ground(x, z) });
    }
    if (!list.length) return;
    const tm = ctx.night ? ctx.basic(0xffffff) : mat(0xffffff, { roughness: 0.85 });
    tm.map = windowTex();
    tm.needsUpdate = true;
    const geo = new T.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const im = inst(geo, tm, list.length);
    const tints = [0xffffff, 0xf3e9d8, 0xd6e0e8, 0xe8d9c4, 0xc9d3dc];
    list.forEach((o, i) => {
      setI(im, i, o.x, o.y, o.z, o.w, o.h, o.d, 0);
      im.setColorAt(i, new T.Color(tints[Math.floor(rnd() * tints.length)]));
    });
    ctx.add(im);
  };

  // 3. Grandstand along the start straight, and one at the Senna S (outside of the road = driver's right)
  // true if the stand footprint (inner and outer edge, sampled along its length) stays clear of the road
  const fits = (u, side, d, len) => {
    for (let s = -len / 2; s <= len / 2 + 0.1; s += 5) {
      const q = ctx.at((((u + s / ctx.lengthM) % 1) + 1) % 1);
      for (const lat of [d - 2, d + 16]) {
        if (!ctx.clearOf(q.x + q.lx * side * lat, q.z + q.lz * side * lat, 1)) return false;
      }
    }
    return true;
  };
  const stand = (u, side, d0, len0, tiers, colA, colB) => {
    let d = d0, len = len0, found = false;
    for (const L of [len0, len0 * 0.75, len0 * 0.5]) {
      for (let dd = d0; dd < d0 + 30 && !found; dd += 2) {
        if (fits(u, side, dd, L)) { d = dd; len = L; found = true; }
      }
      if (found) break;
    }
    if (!found) return;
    // built from short InstancedMesh segments (about 8 m each) so each piece's bounding box stays tight to the road
    const p = beside(u, side * d);
    const gy = ctx.ground(p.x, p.z), ry = p.yaw;
    const ls = side;   // local +x = driver's left, so side -1 puts the tiers outward (right of the road)
    const cs = Math.cos(ry), sn = Math.sin(ry);
    // local stand coordinates (lateral x, along-track z) to world x / z
    const wx = (x, z) => p.x + x * cs + z * sn;
    const wz = (x, z) => p.z - x * sn + z * cs;
    const nseg = Math.max(1, Math.ceil(len / 8)), seg = len / nseg;
    const unit = new T.BoxGeometry(1, 1, 1);
    const concIM = inst(unit, mat(0xa3a9af, { roughness: 0.9 }), tiers * nseg);
    const seatIM = inst(unit, mat(0xffffff, { roughness: 0.8 }), tiers * nseg);
    const roofIM = inst(unit, mat(0x009c3b, { roughness: 0.6 }), nseg);
    let n = 0;
    for (let i = 0; i < tiers; i++) {
      const h = 1.1 + i * 1.1, x = ls * i * 3;
      for (let k = 0; k < nseg; k++) {
        const z = -len / 2 + (k + 0.5) * seg;
        setI(concIM, n, wx(x, z), gy + h / 2, wz(x, z), 3, h, seg, ry);
        setI(seatIM, n, wx(x, z), gy + h + 0.12, wz(x, z), 2.4, 0.25, seg - 0.3, ry);
        seatIM.setColorAt(n, new T.Color(i % 2 ? colA : colB));
        n++;
      }
    }
    for (let k = 0; k < nseg; k++) {
      const z = -len / 2 + (k + 0.5) * seg;
      setI(roofIM, k, wx(ls * 11, z), gy + 9.5, wz(ls * 11, z), 9, 0.6, seg, ry);
    }
    const postG = new T.CylinderGeometry(0.4, 0.4, 9.2, 6);
    postG.translate(0, 4.6, 0);
    const npost = Math.max(4, Math.round(len / 13));
    const posts = inst(postG, mat(0x6c747c, { roughness: 0.7 }), npost * 2);
    for (let k = 0; k < npost; k++) {
      const z = -len / 2 + 6 + k * ((len - 12) / Math.max(1, npost - 1));
      setI(posts, k * 2, wx(ls * 15.5, z), gy, wz(ls * 15.5, z), 1, 1, 1, ry);
      setI(posts, k * 2 + 1, wx(ls * 4.5, z), gy, wz(ls * 4.5, z), 1, 1, 1, ry);
    }
    ctx.add(concIM);
    ctx.add(seatIM);
    ctx.add(roofIM);
    ctx.add(posts);
  };

  // 4. Tropical trees, InstancedMesh (trunk + broad canopy)
  const trees = () => {
    const list = [];
    for (let t = 0; t < 2500 && list.length < 280; t++) {
      const x = -1000 + rnd() * 1500, z = -900 + rnd() * 1300;
      if (!ctx.clearOf(x, z, 4)) continue;
      if (lakes.some(l => Math.hypot(l.x - x, l.z - z) < l.r + 6)) continue;
      list.push({ x, y: ctx.ground(x, z), z, s: 0.8 + rnd() * 0.6, ry: rnd() * TAU });
    }
    if (!list.length) return;
    const trunkG = new T.CylinderGeometry(0.3, 0.4, 5, 5);
    trunkG.translate(0, 2.5, 0);
    const canG = new T.IcosahedronGeometry(2.6, 0);
    canG.translate(0, 6.2, 0);
    const trunk = inst(trunkG, mat(0x7a5230, { roughness: 1 }), list.length);
    const can = inst(canG, mat(0xffffff, { roughness: 0.9 }), list.length);
    const greens = [0x2e7d32, 0x4caf50, 0x1b5e20, 0x7cb342];
    list.forEach((tr, i) => {
      setI(trunk, i, tr.x, tr.y, tr.z, tr.s, tr.s, tr.s, tr.ry);
      setI(can, i, tr.x, tr.y, tr.z, tr.s, tr.s, tr.s, tr.ry);
      can.setColorAt(i, new T.Color(greens[Math.floor(rnd() * greens.length)]));
    });
    ctx.add(trunk);
    ctx.add(can);
  };

  lake();
  towers();
  stand(0.0, -1, ctx.clear + 10, 100, 5, 0x009c3b, 0xffdf00);
  stand(0.03, -1, ctx.clear + 8, 60, 4, 0xffdf00, 0x009c3b);
  trees();
};
