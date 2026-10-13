window.F1Landmarks['md'] = function (ctx) {
  const T = ctx.THREE;
  const rnd = ctx.rand;

  // Local frame on the road: lat > 0 is the driver's left, along > 0 is the direction of travel.
  // Returns the world x/z of that point and the road heading.
  function pt(u, lat, along) {
    const q = ctx.at(u);
    return { x: q.x + q.lx * lat + q.tx * along, z: q.z + q.lz * lat + q.tz * along, yaw: q.yaw };
  }

  // A box standing on the ground, footprint w (across the road) x d (along it), top at y0 + h.
  function box(u, lat, along, w, h, d, mat, y0) {
    const p = pt(u, lat, along);
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(p.x, ctx.ground(p.x, p.z) + (y0 || 0) + h / 2, p.z);
    m.rotation.y = p.yaw;
    return ctx.add(m);
  }

  // Axis-aligned box at an absolute world position (for scenery away from the road).
  function place(x, z, w, h, d, mat) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, ctx.ground(x, z) + h / 2, z);
    return ctx.add(m);
  }

  /* ---------- IFEMA exhibition halls: long low halls with white curved roofs, inside the loop by the start straight ---------- */
  const hallMat = ctx.mat(0xf1efe8, { roughness: .55 });
  const plinthMat = ctx.mat(0x8f8b82, { roughness: .9 });
  function hall(u, lat, along, len) {
    const W = 20, WALL = 6;
    box(u, lat, along, W, WALL, len, hallMat);
    box(u, lat, along, W + .4, .8, len, plinthMat);
    // half of a cylinder whose axis runs along the hall: the upper half is the curved roof, the lower half is hidden in the walls
    const p = pt(u, lat, along);
    const roof = new T.Mesh(new T.CylinderGeometry(W / 2, W / 2, len, 18, 1, false), hallMat);
    roof.rotation.order = 'YXZ';
    roof.rotation.y = p.yaw;
    roof.rotation.x = Math.PI / 2;
    roof.position.set(p.x, ctx.ground(p.x, p.z) + WALL, p.z);
    ctx.add(roof);
  }
  hall(.03, -72, -210, 150);
  hall(.03, -72, -40, 150);
  hall(.03, -72, 130, 150);
  hall(.03, -130, -120, 150);

  /* ---------- Spanish flag on a 54 m mast, inside the loop near the start ---------- */
  {
    const f = pt(.058, -36, 0);
    const base = ctx.ground(f.x, f.z);
    const mast = new T.Mesh(new T.CylinderGeometry(.35, .5, 54, 8), ctx.mat(0xd9dde2, { metalness: .3, roughness: .4 }));
    mast.position.set(f.x, base + 27, f.z);
    ctx.add(mast);
    const c = document.createElement('canvas');
    c.width = 128; c.height = 86;
    const g = c.getContext('2d');
    g.fillStyle = '#AA151B'; g.fillRect(0, 0, 128, 22);
    g.fillStyle = '#F1BF00'; g.fillRect(0, 22, 128, 42);
    g.fillStyle = '#AA151B'; g.fillRect(0, 64, 128, 22);
    const tex = new T.CanvasTexture(c);
    // the cloth hangs from the top of the mast, 14 m wide (centred 7 m out from the mast), facing along the road
    const c7 = pt(.058, -36 - 7, 0);
    const cloth = new T.Mesh(new T.PlaneGeometry(14, 9.3), new T.MeshStandardMaterial({ map: tex, side: T.DoubleSide, roughness: .9 }));
    cloth.position.set(c7.x, base + 54 - 4.65, c7.z);
    cloth.rotation.y = f.yaw;
    ctx.add(cloth);
  }

  /* ---------- grandstand around La Monumental (the banked right-hander at lap fraction .373), outside the corner ---------- */
  {
    const tiers = [ctx.mat(0x24457a, { roughness: .9 }), ctx.mat(0xb3262e, { roughness: .9 })];
    const roofMat = ctx.mat(0xe8e6e0, { roughness: .6 });
    const SEG = 6, u0 = .3635, u1 = .3825;
    for (let k = 0; k < SEG; k++) {
      const uc = u0 + (k + .5) * (u1 - u0) / SEG, len = 16.5;
      for (let t = 0; t < 5; t++) {
        box(uc, 16 + t * 3.4 + 1.7, 0, 3.4, 2.6 * (t + 1), len, tiers[t % 2]);
      }
      box(uc, 16, 0, 17.2, .6, len, roofMat, 13.5);
    }
  }

  /* ---------- Valdebebas modern apartment blocks, north-east of the circuit ---------- */
  {
    const blocks = [
      [230, -330, 30, 16, 34, 0xdfd9cc],
      [280, -395, 20, 28, 42, 0xc9d3da],
      [200, -440, 34, 14, 28, 0xe2d5b8],
      [330, -300, 24, 18, 30, 0xcfd6d2],
      [380, -460, 26, 22, 46, 0xd6dde3],
      [150, -520, 30, 18, 38, 0xe6e0d2]
    ];
    for (const b of blocks) {
      const [x, z, w, d, h, col] = b;
      place(x, z, w, h, d, ctx.mat(col, { roughness: .7 }));
      // a darker band two-thirds of the way up each block, slightly proud of the walls
      const band = new T.Mesh(new T.BoxGeometry(w + .4, 1.6, d + .4), ctx.mat(0x6e7782, { roughness: .8 }));
      band.position.set(x, ctx.ground(x, z) + h * .66, z);
      ctx.add(band);
    }
  }

  /* ---------- Parque Juan Carlos I: tree grove along the outside of El Parque (lap fraction .887, the left side there) ---------- */
  {
    const N = 240;
    const trunks = new T.InstancedMesh(new T.CylinderGeometry(.35, .45, 3.2, 5), ctx.mat(0x5b4530), N);
    const crowns = new T.InstancedMesh(new T.IcosahedronGeometry(3, 0), ctx.mat(0x3f7a33, { flatShading: true }), N);
    const m = new T.Matrix4(), pos = new T.Vector3(), quat = new T.Quaternion(), scl = new T.Vector3();
    let k = 0;
    for (let tries = 0; tries < N * 4 && k < N; tries++) {
      const p = pt(.852 + rnd() * .07, 26 + rnd() * 120, (rnd() - .5) * 12);
      if (!ctx.clearOf(p.x, p.z, 4)) continue;
      const gy = ctx.ground(p.x, p.z), s = .8 + rnd() * .5;
      scl.set(s, s, s);
      pos.set(p.x, gy + 1.6 * s, p.z); m.compose(pos, quat, scl); trunks.setMatrixAt(k, m);
      pos.set(p.x, gy + 4.6 * s, p.z); m.compose(pos, quat, scl); crowns.setMatrixAt(k, m);
      k++;
    }
    trunks.count = k; crowns.count = k;
    ctx.add(trunks); ctx.add(crowns);
  }

  /* ---------- Cuatro Torres: four skyscrapers to the south-west, beyond the western side of the loop ---------- */
  {
    const towers = [
      [-470, 580, 250, 30],
      [-410, 590, 248, 28],
      [-455, 650, 236, 26],
      [-400, 660, 250, 28]
    ];
    for (const t of towers) {
      const m = new T.Mesh(new T.CylinderGeometry(t[3] * .36, t[3] * .5, t[2], 6), ctx.mat(0x7d98aa, { metalness: .35, roughness: .25 }));
      m.position.set(t[0], ctx.ground(t[0], t[1]) + t[2] / 2, t[1]);
      ctx.add(m);
    }
  }
};
