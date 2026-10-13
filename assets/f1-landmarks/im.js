/* Imola (Autodromo Enzo e Dino Ferrari): the Santerno river outside the Tamburello corner, the Ayrton Senna memorial
   in the park by Tamburello, a pit block behind the pit lane, two grandstands at Rivazza, wooded hills and vine rows
   outside Acque Minerali and Rivazza, and the town of Imola to the north with its church tower. */
window.F1Landmarks['im'] = function (ctx) {
  const T = ctx.THREE, L = ctx.lengthM, rnd = ctx.rand;
  const mat = (c, o) => ctx.mat(c, o);
  const ground = (x, z) => ctx.ground(x, z);
  const U = d => d / L;                          // metres along the lap from the start line -> lap fraction

  // road frame at lap fraction u; s metres to the left (+) or right (-) of the centreline
  const frame = (u, s) => {
    const a = ctx.at(u), k = s || 0;
    return { x: a.x + a.lx * k, z: a.z + a.lz * k, yaw: a.yaw, lx: a.lx, lz: a.lz };
  };

  // an item's axis-aligned footprint (its sx by sz box turned by yaw) must stay clear of the road
  const footOK = it => {
    const c = Math.abs(Math.cos(it.yaw || 0)), s = Math.abs(Math.sin(it.yaw || 0));
    const hx = (it.sx * c + it.sz * s) / 2, hz = (it.sx * s + it.sz * c) / 2;
    for (let x = it.x - hx; x <= it.x + hx + .01; x += 2)
      for (let z = it.z - hz; z <= it.z + hz + .01; z += 2) if (!ctx.clearOf(x, z, 0)) return false;
    return true;
  };

  // one InstancedMesh from items {x,y,z,yaw,sx,sy,sz,c}; items that would stand on the road are left out
  const instanced = (geo, m, items, name, parent, guard) => {
    const keep = guard === false ? items : items.filter(footOK);
    if (!keep.length) return null;
    const im = new T.InstancedMesh(geo, m, keep.length);
    const mx = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), sc = new T.Vector3(), col = new T.Color();
    keep.forEach((it, i) => {
      q.setFromEuler(e.set(0, it.yaw || 0, 0));
      mx.compose(p.set(it.x, it.y, it.z), q, sc.set(it.sx, it.sy, it.sz));
      im.setMatrixAt(i, mx);
      im.setColorAt(i, col.setHex(it.c === undefined ? 0xffffff : it.c));
    });
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    im.name = name;
    if (parent) parent.add(im); else ctx.add(im);
    return im;
  };

  const cube = new T.BoxGeometry(1, 1, 1);
  // gable roof, unit size: ridge along z, eaves at y=-0.5, apex at y=+0.5
  const gableGeo = (() => {
    const v = [
      -.5, -.5, -.5,   .5, -.5, -.5,   0, .5, -.5,
      -.5, -.5,  .5,   0, .5,  .5,     .5, -.5, .5,
      -.5, -.5, -.5,   0, .5, -.5,     0, .5,  .5,
      -.5, -.5, -.5,   0, .5,  .5,    -.5, -.5, .5,
       .5, -.5, -.5,   .5, -.5, .5,    0, .5,  .5,
       .5, -.5, -.5,   0, .5,  .5,     0, .5, -.5
    ];
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  })();

  // a strip (river water or bank) along a polyline of {x,z}, half a metre-width `half` either side, lifted `lift` above ground
  const strip = (pts, half, lift, m, name) => {
    if (pts.length < 2) return;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    pts.forEach(p => { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; });
    let ok = true;
    for (let x = x0 - half; ok && x <= x1 + half; x += 2.5)
      for (let z = z0 - half; z <= z1 + half; z += 2.5) if (!ctx.clearOf(x, z, 0)) { ok = false; break; }
    if (!ok) {                                   // the strip's box reaches the road: cut it and test each half
      if (pts.length > 3) { const h = pts.length >> 1; strip(pts.slice(0, h + 1), half, lift, m, name); strip(pts.slice(h), half, lift, m, name); }
      return;
    }
    const pos = [], idx = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const y = ground(p.x, p.z) + lift;
      pos.push(p.x - dz * half, y, p.z + dx * half, p.x + dz * half, y, p.z - dx * half);
    });
    for (let i = 0; i < pts.length - 1; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new T.Mesh(g, m);
    mesh.name = name;
    ctx.add(mesh);
  };

  /* ---- 1. the Santerno: a channel about 60 m outside the road, from the approach to the start straight round the
          outside of the Tamburello corner ---- */
  {
    const water = mat(0x3b7d96, { roughness: .22, metalness: .12, side: T.DoubleSide });
    const bank = mat(0x6e6a57, { roughness: .95, side: T.DoubleSide });
    const runs = [];
    let run = [];
    for (let u = -0.04; u <= 0.105; u += 0.0025) {
      const f = frame(u, -(60 + 7 * Math.sin(u * 12 * Math.PI)));
      if (ctx.clearOf(f.x, f.z, 17)) run.push({ x: f.x, z: f.z });
      else { if (run.length > 1) runs.push(run); run = []; }
    }
    if (run.length > 1) runs.push(run);
    runs.forEach((r, k) => {
      strip(r, 17, .08, bank, 'Santerno bank ' + k);
      strip(r, 10, .2, water, 'Santerno water ' + k);
    });
  }

  /* ---- 2. Ayrton Senna memorial: a statue on a plinth in the park by Tamburello, facing the road ---- */
  {
    const f = frame(0.05, -34), gy = ground(f.x, f.z);
    const g = new T.Group();
    g.position.set(f.x, gy, f.z);
    g.rotation.y = Math.atan2(f.lx, f.lz);       // local +z points at the road
    const stone = mat(0xbdb6a6, { roughness: .9 }), bronze = mat(0x8a6a2e, { roughness: .4, metalness: .45 });
    const part = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    part(new T.BoxGeometry(3.4, .3, 3.4), stone, 0, .15, 0);          // base step
    part(new T.BoxGeometry(2.4, 1.2, 2.4), stone, 0, .9, 0);          // plinth
    part(new T.BoxGeometry(2.7, .2, 2.7), stone, 0, 1.6, 0);          // cap
    part(new T.BoxGeometry(.8, .9, .42), bronze, 0, 2.15, 0);         // legs
    part(new T.BoxGeometry(.95, 1.15, .5), bronze, 0, 3.175, 0);      // torso
    part(new T.BoxGeometry(.22, .95, .25), bronze, -.6, 3.1, 0);      // arms
    part(new T.BoxGeometry(.22, .95, .25), bronze, .6, 3.1, 0);
    part(new T.SphereGeometry(.27, 10, 8), bronze, 0, 4.02, 0);       // head
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 160;
    const c2 = cv.getContext('2d');
    c2.fillStyle = '#2b2d31'; c2.fillRect(0, 0, 512, 160);
    c2.strokeStyle = '#d4b35a'; c2.lineWidth = 8; c2.strokeRect(10, 10, 492, 140);
    c2.fillStyle = '#ecd98e'; c2.font = 'bold 60px Arial, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.fillText('AYRTON SENNA', 256, 82);
    part(new T.PlaneGeometry(1.3, .42), mat(0xffffff, { map: new T.CanvasTexture(cv), roughness: .5, metalness: .2 }), 0, .95, 1.21);
    const flowers = [0xd7263d, 0xf4d03f, 0xffffff, 0xe67e22, 0x8e44ad], fi = [];
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * Math.PI * 2, r = 2.7 + rnd() * .8;
      fi.push({ x: Math.cos(a) * r, y: .25, z: Math.sin(a) * r, yaw: 0, sx: .5, sy: .5, sz: .5, c: flowers[i % flowers.length] });
    }
    instanced(new T.IcosahedronGeometry(.5, 0), mat(0xffffff, { roughness: .8 }), fi, 'Senna flower bed', g, false);
    ctx.add(g);
  }

  /* ---- 3. pit block: a long two-storey building 36 m left of the road on the pit side of the start straight,
          behind the pit lane, with a red band and garage doors facing the lane ---- */
  {
    const bodyMat = mat(0xd9d5c9, { roughness: .8 });
    const roofs = [], bands = [], doors = [];
    [[-132, -87], [-87, -42], [-42, 3], [3, 48]].forEach(([d0, d1]) => {
      const f = frame(U((d0 + d1) / 2), 36), len = d1 - d0, gy = ground(f.x, f.z);
      const g = new T.Group();
      g.position.set(f.x, gy, f.z);
      g.rotation.y = f.yaw;
      const body = new T.Mesh(new T.BoxGeometry(14, 7.5, len), bodyMat);
      body.position.set(0, 3.75, 0);
      g.add(body);
      ctx.add(g);
      ctx.solid(body);
      roofs.push({ x: f.x, y: gy + 7.75, z: f.z, yaw: f.yaw, sx: 16, sy: .5, sz: len, c: 0x3a3f47 });
      const b = frame(U((d0 + d1) / 2), 28.97);
      bands.push({ x: b.x, y: gy + 5.4, z: b.z, yaw: f.yaw, sx: .25, sy: .45, sz: len, c: 0xc8102e });
    });
    for (let d = -128; d <= 44; d += 6) {
      const f = frame(U(d), 29.05), gy = ground(f.x, f.z);
      doors.push({ x: f.x, y: gy + 1.5, z: f.z, yaw: f.yaw, sx: .3, sy: 3, sz: 3.2, c: 0x2c3e4c });
    }
    instanced(cube, mat(0xffffff, { roughness: .6 }), roofs, 'pit block roof');
    instanced(cube, mat(0xffffff, { roughness: .5 }), bands, 'pit block red band');
    instanced(cube, mat(0xffffff, { roughness: .4 }), doors, 'pit garage doors');
  }

  /* ---- 4. Rivazza grandstands: two stepped stands on the outside of the corner, 26 m off the road, facing it ---- */
  {
    const tiers = [], canopies = [], posts = [], crowd = [];
    const crowdCols = [0xc62828, 0x1e4a8c, 0xf2f2f2, 0xf4b400, 0x2e7d32, 0x6d4c41, 0x8e24aa, 0x222222];
    [0.785, 0.838].forEach(u0 => {
      for (let c = 0; c < 3; c++) {                 // three 25 m blocks per stand
        const d0 = u0 * L + c * 25, dc = d0 + 12.5;
        for (let i = 0; i < 6; i++) {               // six tiers, each further from the road and higher
          const h = 1.2 + .85 * i, t = frame(U(dc), -(27.2 + 2.4 * i));
          tiers.push({ x: t.x, y: ground(t.x, t.z) + h / 2, z: t.z, yaw: t.yaw, sx: 2.4, sy: h, sz: 25, c: 0x9aa0a8 });
          for (let d = d0 + 1; d < d0 + 25; d += 1.9) {
            if (rnd() > .75) continue;
            const sp = frame(U(d), -(26 + 2.4 * i + .6 + 1.2 * rnd()));
            crowd.push({ x: sp.x, y: ground(sp.x, sp.z) + h + .45, z: sp.z, yaw: sp.yaw, sx: .45, sy: .9, sz: .45, c: crowdCols[(rnd() * crowdCols.length) | 0] });
          }
        }
        const r = frame(U(dc), -34);
        canopies.push({ x: r.x, y: ground(r.x, r.z) + 7.65, z: r.z, yaw: r.yaw, sx: 16, sy: .5, sz: 25, c: 0xc62828 });
        [-9, 9].forEach(o => {
          const p = frame(U(dc + o), -41.5);
          posts.push({ x: p.x, y: ground(p.x, p.z) + 3.7, z: p.z, yaw: p.yaw, sx: .5, sy: 7.4, sz: .5, c: 0x4a4f57 });
        });
      }
    });
    instanced(cube, mat(0xffffff, { roughness: .9 }), tiers, 'Rivazza tiers');
    instanced(cube, mat(0xffffff, { roughness: .6 }), canopies, 'Rivazza canopies');
    instanced(cube, mat(0xffffff, { roughness: .6 }), posts, 'Rivazza posts');
    instanced(cube, mat(0xffffff, { roughness: .9 }), crowd, 'Rivazza crowd');
  }

  /* ---- 5. wooded hills and vine rows: outside Acque Minerali and outside Rivazza ---- */
  const hills = [
    { u: .385, s: -150, R: 58, H: 16, c: 0x3f5b2c },
    { u: .45, s: -186, R: 52, H: 13, c: 0x6b5a2a },
    { u: .85, s: -168, R: 60, H: 18, c: 0x3f5b2c }
  ].map(k => { const f = frame(k.u, k.s); return { x: f.x, z: f.z, R: k.R, H: k.H, c: k.c, gy: ground(f.x, f.z) }; });
  hills.forEach(k => {
    if (!ctx.clearOf(k.x, k.z, k.R * 1.42)) return;
    const m = new T.Mesh(new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(k.c, { roughness: .95, flatShading: true }));
    m.scale.set(k.R, k.H, k.R);
    m.position.set(k.x, k.gy - .15 * k.H, k.z);
    m.name = 'wooded hill';
    ctx.add(m);
  });
  // ground under a tree: the hill's surface where a dome covers the point, else the terrain
  const surf = (x, z) => {
    let y = ground(x, z);
    hills.forEach(k => {
      const q = Math.hypot(x - k.x, z - k.z) / k.R;
      if (q < 1) { const s = k.gy - .15 * k.H + k.H * Math.sqrt(1 - q * q); if (s > y) y = s; }
    });
    return y;
  };
  const trunks = [], cones = [], balls = [];
  const tree = (x, z) => {
    const y = surf(x, z), t = rnd();
    trunks.push({ x, y: y + 1.2, z, yaw: 0, sx: .32, sy: 2.4, sz: .32, c: 0x5a4330 });
    if (t < .45) {
      const r = 1.9 + rnd() * .9, h = 6.5 + rnd() * 4;
      cones.push({ x, y: y + 1.8 + h / 2, z, yaw: rnd() * 3, sx: r * 2, sy: h, sz: r * 2, c: [0x23402a, 0x2d4d2f, 0x1e3a26][(rnd() * 3) | 0] });
    } else {
      const R = 2.6 + rnd() * .9;
      balls.push({ x, y: y + 2.2 + R * .7, z, yaw: rnd() * 3, sx: R * 2, sy: R * 1.7, sz: R * 2, c: [0xc2561f, 0xd98a2b, 0x9c3b1c, 0x7a7a2a, 0xe0b23c][(rnd() * 5) | 0] });
    }
  };
  let placed = 0;
  for (let t = 0; t < 1400 && placed < 470; t++) {
    let u, s;
    if (t % 2) { u = .335 + .165 * rnd(); s = -(92 + 100 * rnd()); }   // Acque Minerali side
    else { u = .745 + .165 * rnd(); s = -(70 + 120 * rnd()); }         // Rivazza side
    const f = frame(u, s);
    if (!ctx.clearOf(f.x, f.z, 5)) continue;
    tree(f.x, f.z);
    placed++;
  }
  instanced(new T.CylinderGeometry(.5, .6, 1, 6), mat(0xffffff, { roughness: .9 }), trunks, 'wood trunks');
  instanced(new T.ConeGeometry(.5, 1, 7), mat(0xffffff, { roughness: .9, flatShading: true }), cones, 'conifers');
  instanced(new T.IcosahedronGeometry(.5, 0), mat(0xffffff, { roughness: .9, flatShading: true }), balls, 'autumn trees');

  // vine rows: thin trellis rows running along the road, 42-88 m out
  const rowsAt = (u0, s0) => {
    const out = [];
    for (let k = 0; k < 11; k++) {
      const f = frame(u0, s0 - k * 4.2);
      out.push({ x: f.x, y: ground(f.x, f.z) + .7, z: f.z, yaw: f.yaw, sx: .9, sy: 1.4, sz: 50, c: k % 3 === 2 ? 0x7d4a2a : 0x4f7d2b });
    }
    return out;
  };
  instanced(cube, mat(0xffffff, { roughness: .9 }), rowsAt(.425, -42).concat(rowsAt(.812, -46)), 'vine rows');

  /* ---- 6. the town of Imola, north of the circuit: red-roofed houses on streets, and the church tower ---- */
  const CX = -150, CZ = -775;
  const wallCols = [0xefe4cc, 0xe2c79a, 0xf1ead8, 0xd9a77a, 0xe9dcb4];
  const roofCols = [0xa9472b, 0x8f3a25, 0xb85a33, 0x9a4530];
  const hw = [], hr = [], placedH = [];
  for (let t = 0; t < 2600 && hw.length < 330; t++) {
    const x = -560 + 800 * rnd(), z = -990 + 400 * rnd();
    if (Math.hypot(x - CX, z - CZ) < 70 || !ctx.clearOf(x, z, 14)) continue;
    const w = 7 + 4 * rnd(), d = 6 + 3 * rnd(), rr = Math.max(w, d) * .75;
    if (placedH.some(o => Math.hypot(o.x - x, o.z - z) < o.r + rr + 2)) continue;
    placedH.push({ x, z, r: rr });
    const gy = ground(x, z), h = 6.5 + 4 * rnd(), rh = .4 * w, yaw = (rnd() < .5 ? 0 : Math.PI / 2) + (rnd() - .5) * .08;
    hw.push({ x, y: gy + h / 2, z, yaw, sx: w, sy: h, sz: d, c: wallCols[(rnd() * wallCols.length) | 0] });
    hr.push({ x, y: gy + h + rh / 2, z, yaw, sx: w + .8, sy: rh, sz: d + .8, c: roofCols[(rnd() * roofCols.length) | 0] });
  }
  instanced(cube, mat(0xffffff, { roughness: .85 }), hw, 'town houses');
  instanced(gableGeo, mat(0xffffff, { roughness: .8, side: T.DoubleSide }), hr, 'town red roofs');
  {
    const g = new T.Group(), gy = ground(CX, CZ);
    g.position.set(CX, gy, CZ);
    const cream = mat(0xefe6d0, { roughness: .9 }), ochre = mat(0xd9c08f, { roughness: .9 }), tile = mat(0x9a4530, { roughness: .8, side: T.DoubleSide });
    const part = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    part(new T.BoxGeometry(20, 13, 34), cream, 0, 6.5, 0);                        // nave
    const nr = part(gableGeo, tile, 0, 16, 0);                                    // nave roof
    nr.scale.set(20.8, 6, 34.8);
    part(new T.BoxGeometry(7, 40, 7), ochre, 0, 20, 20.5);                        // bell tower
    part(new T.BoxGeometry(6.4, 7, 6.4), cream, 0, 43.5, 20.5);                   // belfry
    const sp = part(new T.ConeGeometry(4.5, 15, 4), tile, 0, 54.5, 20.5);         // spire
    sp.rotation.y = Math.PI / 4;
    ctx.add(g);
  }
};
