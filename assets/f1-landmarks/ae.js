window.F1Landmarks['ae'] = function (ctx) {
  const T = ctx.THREE;
  const rnd = ctx.rand;
  const TAU = Math.PI * 2;
  const L = ctx.lengthM;

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

  // track centre, for compass directions (+x east, -z north)
  let cx = 0, cz = 0;
  for (let i = 0; i < 200; i++) { const p = ctx.at(i / 200); cx += p.x; cz += p.z; }
  cx /= 200; cz /= 200;

  // 1. Marina basin: 40 m water tiles on the side of the track at the marina section (~0.83), kept off the road
  const MU = 0.83;
  let W0 = null, wBest = -1;
  [1, -1].forEach(side => {
    for (let d = 120; d <= 260; d += 35) {
      const c = beside(MU, side * d);
      let n = 0;
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        if (Math.hypot(i, j) * 40 <= 125 && ctx.clearOf(c.x + i * 40, c.z + j * 40, 29)) n++;
      }
      if (n > wBest) { wBest = n; W0 = c; }
    }
  });
  const water = [];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const x = W0.x + i * 40, z = W0.z + j * 40;
    if (Math.hypot(i, j) * 40 <= 125 && ctx.clearOf(x, z, 29)) water.push({ x, z });
  }

  // 2. W Yas hotel: two curved towers on land across from the marina, joined by a glowing gridshell canopy
  const HU = 0.82;
  const spot = strict => {
    const ds = [95, 110, 125, 140, 160, 180, 200, 230];
    for (let k = 0; k < ds.length; k++) for (const side of [-1, 1]) {
      const c = beside(HU, side * ds[k]);
      if (!ctx.clearOf(c.x, c.z, 72)) continue;
      if (strict && water.some(w => Math.hypot(w.x - c.x, w.z - c.z) < 80)) continue;
      return c;
    }
    return null;
  };
  const H = spot(true) || spot(false);

  // 3. Ferrari World: huge flat red roof on columns, yellow badge on top, north-east of the circuit
  let F = null;
  for (const R of [128, 112, 100]) {
    let bs = 1e18;
    for (let x = cx - 1100; x <= cx + 1100; x += 40) for (let z = cz - 1100; z <= cz + 1100; z += 40) {
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1;
      const dot = (dx * 0.7071 - dz * 0.7071) / d;     // dot with the north-east unit vector
      const s = (1 - dot) * 600 + Math.abs(d - 550);
      if (s < bs && ctx.clearOf(x, z, R)) { bs = s; F = { x, z, R }; }
    }
    if (F) break;
  }

  // 4. Desert sand: 100 m tiles, only where they stay clear of the road
  {
    const tiles = [];
    for (let x = cx - 1000; x <= cx + 1000; x += 100) for (let z = cz - 1100; z <= cz + 1100; z += 100) {
      if (ctx.clearOf(x, z, 71)) tiles.push({ x, z, y: ctx.ground(x, z) + 0.15 });
    }
    if (tiles.length) {
      const im = inst(new T.BoxGeometry(100, 0.3, 100), mat(0xd9b77f, { roughness: 1 }), tiles.length);
      tiles.forEach((t, i) => setI(im, i, t.x, t.y, t.z, 1, 1, 1, 0));
      ctx.add(im);
    }
  }

  // 5. Marina water and yachts
  if (water.length) {
    const wIM = inst(new T.BoxGeometry(40, 0.25, 40), mat(0x2b7fa6, { roughness: 0.2, metalness: 0.1 }), water.length);
    water.forEach((w, i) => setI(wIM, i, w.x, ctx.ground(w.x, w.z) + 0.5, w.z, 1, 1, 1, 0));
    ctx.add(wIM);

    const yachts = [];
    water.forEach(w => {
      if (rnd() > 0.45) return;
      const x = w.x + (rnd() - 0.5) * 14, z = w.z + (rnd() - 0.5) * 14;
      if (ctx.clearOf(x, z, 18)) yachts.push({ x, z, y: ctx.ground(x, z), ry: rnd() * TAU, c: Math.floor(rnd() * 3) });
    });
    if (yachts.length) {
      const hulls = inst(new T.BoxGeometry(6, 2.2, 26), mat(0xffffff, { roughness: 0.5 }), yachts.length);
      const cabins = inst(new T.BoxGeometry(4.2, 2.2, 14), mat(0xffffff, { roughness: 0.4 }), yachts.length);
      const hullCols = [0xf4f6f8, 0x1d3557, 0xc9ced6];
      yachts.forEach((b, i) => {
        setI(hulls, i, b.x, b.y + 1.1, b.z, 1, 1, 1, b.ry);
        // cabin sits 2 m aft of the hull centre, on the deck
        setI(cabins, i, b.x - 2 * Math.sin(b.ry), b.y + 3.2, b.z - 2 * Math.cos(b.ry), 1, 1, 1, b.ry);
        hulls.setColorAt(i, new T.Color(hullCols[b.c]));
        cabins.setColorAt(i, new T.Color(0xffffff));
      });
      ctx.add(hulls);
      ctx.add(cabins);
    }
  }

  // 6. W Yas hotel towers and gridshell canopy
  if (H) {
    const p = ctx.at(HU);
    const gy = ctx.ground(H.x, H.z);
    const facade = (() => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#1b2a3c'; g.fillRect(0, 0, 128, 64);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 8; k++) {
        if (rnd() < 0.6) { g.fillStyle = rnd() < 0.6 ? '#ffd58a' : '#8fd3ff'; g.fillRect(k * 16 + 3, r * 16 + 4, 10, 8); }
      }
      const t = new T.CanvasTexture(c);
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(1 / 6, 1 / 3.2);
      return t;
    })();
    // curved tower: crescent 14 m thick, 78 m tall (about 24 storeys)
    const towerG = (() => {
      const a0 = -Math.PI / 2 - 1.2, a1 = a0 + 2.4, R = 34, r = 20;
      const s = new T.Shape();
      s.moveTo(R * Math.cos(a0), R * Math.sin(a0));
      s.absarc(0, 0, R, a0, a1, false);
      s.lineTo(r * Math.cos(a1), r * Math.sin(a1));
      s.absarc(0, 0, r, a1, a0, true);
      s.closePath();
      const g = new T.ExtrudeGeometry(s, { depth: 78, bevelEnabled: false, curveSegments: 18 });
      g.rotateX(-Math.PI / 2);
      return g;
    })();
    const towerM = ctx.basic(0xffffff, { map: facade });
    [[-1, 0], [1, Math.PI]].forEach(([s, flip]) => {
      const t = put(towerG, towerM, H.x + s * p.tx * 36, gy, H.z + s * p.tz * 36);
      t.rotation.y = p.yaw + flip;
      ctx.add(t);
    });
    // gridshell canopy linking the two towers, glowing LED blue
    const canopy = put(new T.SphereGeometry(40, 16, 6, 0, TAU, 0, Math.PI / 2), ctx.basic(0x47dcff, { wireframe: true }), H.x, gy + 54, H.z);
    canopy.scale.set(0.4, 0.6, 1);
    canopy.rotation.y = p.yaw;
    ctx.add(canopy);
  }

  // 7. Ferrari World roof, columns and badge
  if (F) {
    const gy = ctx.ground(F.x, F.z);
    ctx.add(put(new T.BoxGeometry(180, 2.5, 180), mat(0xd3001b, { roughness: 0.45 }), F.x, gy + 21.25, F.z));
    const colG = new T.CylinderGeometry(1.2, 1.2, 20, 6);
    colG.translate(0, 10, 0);
    const offs = [-90, -54, -18, 18, 54, 90];
    const cols = [];
    offs.forEach(i => offs.forEach(j => {
      const x = F.x + i, z = F.z + j;
      if (ctx.clearOf(x, z, 1.5)) cols.push({ x, z, y: ctx.ground(x, z) });
    }));
    if (cols.length) {
      const im = inst(colG, mat(0xb9bec6, { roughness: 0.6 }), cols.length);
      cols.forEach((c, i) => setI(im, i, c.x, c.y, c.z, 1, 1, 1, 0));
      ctx.add(im);
    }
    const sh = new T.Shape();
    sh.moveTo(-18, 18); sh.lineTo(18, 18); sh.lineTo(18, 2);
    sh.quadraticCurveTo(18, -14, 0, -22); sh.quadraticCurveTo(-18, -14, -18, 2); sh.closePath();
    const badgeG = new T.ShapeGeometry(sh);
    badgeG.rotateX(-Math.PI / 2);
    ctx.add(put(badgeG, ctx.basic(0xffd200, { side: T.DoubleSide }), F.x, gy + 22.6, F.z));
  }

  // 8. Palm trees, kept off the road, the marina, the roof and the hotel grounds
  {
    const palms = [];
    for (let t = 0; t < 2000 && palms.length < 220; t++) {
      const x = cx + (rnd() - 0.5) * 1800, z = cz + (rnd() - 0.5) * 2100;
      if (!ctx.clearOf(x, z, 7)) continue;
      if (F && Math.hypot(x - F.x, z - F.z) < F.R + 10) continue;
      if (H && Math.hypot(x - H.x, z - H.z) < 75) continue;
      if (water.some(w => Math.abs(w.x - x) < 30 && Math.abs(w.z - z) < 30)) continue;
      palms.push({ x, z, y: ctx.ground(x, z), s: 0.8 + rnd() * 0.5, ry: rnd() * TAU });
    }
    if (palms.length) {
      const trunkG = new T.CylinderGeometry(0.3, 0.45, 9, 5); trunkG.translate(0, 4.5, 0);
      const crownG = new T.ConeGeometry(4.2, 1.8, 6); crownG.translate(0, 9.3, 0);
      const tIM = inst(trunkG, mat(0x7a5a3a, { roughness: 1 }), palms.length);
      const cIM = inst(crownG, mat(0x2f7a3a, { roughness: 0.9 }), palms.length);
      palms.forEach((p, i) => {
        setI(tIM, i, p.x, p.y, p.z, p.s, p.s, p.s, p.ry);
        setI(cIM, i, p.x, p.y, p.z, p.s, p.s, p.s, p.ry);
      });
      ctx.add(tIM);
      ctx.add(cIM);
    }
  }

  // 9. Grandstands on the long back straight (~0.33), both sides: terraces of 6 m segments, each checked against the road
  {
    const SU = 0.33, SL = 50 / L, NSEG = 17;
    const seatsList = [];
    [1, -1].forEach(side => {
      for (let k = 0; k < NSEG; k++) {
        const u = SU - SL + (k + 0.5) * (2 * SL / NSEG);
        const p = ctx.at(u);
        for (let t = 0; t < 5; t++) {
          const d = side * (ctx.clear + 6 + t * 3);
          const x = p.x + p.lx * d, z = p.z + p.lz * d;
          if (ctx.clearOf(x, z, 4)) seatsList.push({ x, z, yaw: p.yaw, t, gy: ctx.ground(x, z) });
        }
      }
    });
    if (seatsList.length) {
      const n = seatsList.length;
      const tiers = inst(new T.BoxGeometry(3, 1, 6), mat(0xa3a9af, { roughness: 0.9 }), n);
      const seats = inst(new T.BoxGeometry(2.4, 0.25, 6), mat(0xffffff, { roughness: 0.8 }), n);
      seatsList.forEach((s, i) => {
        const h = 1.1 + s.t * 1.1;
        setI(tiers, i, s.x, s.gy + h / 2, s.z, 1, h, 1, s.yaw);
        setI(seats, i, s.x, s.gy + h + 0.12, s.z, 1, 1, 1, s.yaw);
        seats.setColorAt(i, new T.Color(s.t % 2 ? 0xd6222e : 0xf2f2f2));
      });
      ctx.add(tiers);
      ctx.add(seats);
    }
  }
};
