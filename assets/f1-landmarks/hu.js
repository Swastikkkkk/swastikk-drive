window.F1Landmarks = window.F1Landmarks || {};
window.F1Landmarks['hu'] = function (ctx) {
  const T = ctx.THREE, LEN = ctx.lengthM, RAND = ctx.rand;
  const E = new T.Euler(), Q = new T.Quaternion(), P = new T.Vector3(), S = new T.Vector3(), MX = new T.Matrix4(), COL = new T.Color();
  const TAU = Math.PI * 2;
  const circles = [];                       // keep-out discs for trees: {x, z, r}
  const flat = { flatShading: true, roughness: 0.9, metalness: 0 };

  // point at lap fraction u, d metres to the driver's left (negative = right), zl metres further along the race direction
  function pt(u, d, zl) {
    const p = ctx.at(u), k = zl || 0;
    const x = p.x + p.lx * d + p.tx * k, z = p.z + p.lz * d + p.tz * k;
    return { x: x, z: z, y: ctx.ground(x, z), yaw: p.yaw };
  }
  // one instance: world position, yaw about y, scale
  function put(inst, i, x, y, z, yaw, sx, sy, sz) {
    E.set(0, yaw || 0, 0); Q.setFromEuler(E);
    P.set(x, y, z); S.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
    inst.setMatrixAt(i, MX.compose(P, Q, S));
  }
  function tint(inst, i, list) { inst.setColorAt(i, COL.setHex(list[Math.floor(RAND() * list.length) % list.length])); }
  function done(inst) {
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    ctx.add(inst);
    return inst;
  }
  function keepOut(x, z) {
    for (let i = 0; i < circles.length; i++) { const c = circles[i]; if (Math.hypot(x - c.x, z - c.z) < c.r) return true; }
    return false;
  }
  function stripes(a, b, n) {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = a; g.fillRect(0, 0, 64, 64);
    g.fillStyle = b; for (let i = 0; i < n; i++) g.fillRect(0, i * 64 / n, 64, 64 / n * 0.5);
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(10, 10);
    return t;
  }

  // ---- materials (flat-shaded low-poly look)
  const grass = ctx.mat(0x5e8c3a, flat);
  const ridge = ctx.mat(0x6f8a45, flat);
  const trunk = ctx.mat(0x6b4a2b, flat);
  const crown = ctx.mat(0xffffff, flat);
  const concrete = ctx.mat(0xb1aea4, flat);
  const seats = ctx.mat(0xffffff, flat);
  const roofW = ctx.mat(0xe8e8e2, flat);
  const steel = ctx.mat(0x5a6168, flat);
  const pitBody = ctx.mat(0xd9d5cb, flat);
  const glass = ctx.basic(0x7fb9cc);
  const white = ctx.mat(0xf5f3ee, flat);
  const wall = ctx.mat(0xffffff, flat);
  const tiles = ctx.mat(0xffffff, flat);
  const churchW = ctx.mat(0xf1eee6, flat);
  const spire = ctx.mat(0x56665a, flat);

  // ---- spectator banks: grassy wedges hugging the road, 12 m segments (instanced, one mesh per side)
  const BANK = { W: 16, H: 10, D: 20, SEG: 12 };
  function bankGeom(sg) {
    const s = new T.Shape(), W = BANK.W, H = BANK.H;
    s.moveTo(0, 0); s.lineTo(sg * 0.45 * W, H); s.lineTo(sg * W, 0); s.closePath();
    const g = new T.ExtrudeGeometry(s, { depth: BANK.SEG, bevelEnabled: false, steps: 1 });
    g.translate(0, 0, -BANK.SEG / 2);
    return g;
  }
  const bankLists = { 1: [], '-1': [] };
  // [from u, to u, side: 1 = left, -1 = right]
  const SECTIONS = [[0.035, 0.09, 1], [0.12, 0.165, -1], [0.19, 0.235, 1], [0.58, 0.63, -1], [0.70, 0.75, 1], [0.905, 0.95, 1]];
  SECTIONS.forEach(function (sec) {
    const u0 = sec[0], u1 = sec[1], sg = sec[2], n = Math.floor((u1 - u0) * LEN / BANK.SEG);
    for (let k = 0; k < n; k++) {
      const u = u0 + (k + 0.5) * BANK.SEG / LEN;
      const c = pt(u, sg * (BANK.D + BANK.W / 2), 0);
      if (!ctx.clearOf(c.x, c.z, BANK.W / 2 + BANK.SEG / 2)) continue;
      const toe = pt(u, sg * BANK.D, 0);
      bankLists[sg > 0 ? 1 : -1].push({ x: toe.x, y: toe.y - 1, z: toe.z, yaw: toe.yaw });
    }
  });
  [1, -1].forEach(function (sg) {
    const list = bankLists[sg > 0 ? 1 : -1];
    if (!list.length) return;
    const m = new T.InstancedMesh(bankGeom(sg), grass, list.length);
    list.forEach(function (b, i) { put(m, i, b.x, b.y, b.z, b.yaw); });
    done(m);
  });

  // ---- main grandstand on the start straight, right-hand side (lap 0): four stepped tiers, crowd, cantilever roof
  const SEGZ = []; for (let k = 0; k < 11; k++) SEGZ.push(-50 + 10 * k);
  const TIERS = [0, 1, 2, 3].map(function (i) { return { h: 1.5 + 2.2 * i, d: -(26 + 4 * i) }; });
  TIERS.forEach(function (t) {
    const m = new T.InstancedMesh(new T.BoxGeometry(4, 1, 10), concrete, SEGZ.length);
    SEGZ.forEach(function (zc, i) { const q = pt(0, t.d, zc); put(m, i, q.x, q.y + t.h / 2, q.z, q.yaw, 1, t.h, 1); });
    done(m);
  });
  const seatPal = [0xc0392b, 0xf2f2ee, 0x2e7d4f, 0xf2c12a, 0x2f6f9e, 0xe0e0dc];
  const seatN = TIERS.length * SEGZ.length * 12;
  const crowd = new T.InstancedMesh(new T.BoxGeometry(0.7, 0.9, 0.5), seats, seatN);
  let si = 0;
  TIERS.forEach(function (t) {
    SEGZ.forEach(function (zc) {
      for (let r = 0; r < 2; r++) for (let j = 0; j < 6; j++) {
        const q = pt(0, t.d + (r ? 1.1 : -1.1), zc + (j - 2.5) * 1.6);
        put(crowd, si, q.x, q.y + t.h + 0.45, q.z, q.yaw);
        tint(crowd, si, seatPal); si++;
      }
    });
  });
  done(crowd);
  const roof = new T.InstancedMesh(new T.BoxGeometry(18, 0.6, 10), roofW, SEGZ.length);
  const cols = new T.InstancedMesh(new T.BoxGeometry(0.6, 13, 0.6), steel, SEGZ.length);
  SEGZ.forEach(function (zc, i) {
    const r = pt(0, -33, zc); put(roof, i, r.x, r.y + 13.3, r.z, r.yaw);
    const c = pt(0, -41, zc); put(cols, i, c.x, c.y + 6.5, c.z, c.yaw);
  });
  done(roof); done(cols);
  circles.push({ x: pt(0, -34, 0).x, z: pt(0, -34, 0).z, r: 64 });

  // ---- pit building on the left of the straight, behind the pit lane (lap ~0.995, just before the line)
  const UP = 0.9954;
  const PITZ = []; for (let k = 0; k < 13; k++) PITZ.push(-60 + 10 * k);
  const pitBox = new T.InstancedMesh(new T.BoxGeometry(14, 9, 10), pitBody, PITZ.length);
  const pitRoof = new T.InstancedMesh(new T.BoxGeometry(15, 0.6, 10), roofW, PITZ.length);
  const pitGlass = new T.InstancedMesh(new T.BoxGeometry(0.4, 4.2, 9.4), glass, PITZ.length);
  PITZ.forEach(function (zc, i) {
    const b = pt(UP, 37, zc); put(pitBox, i, b.x, b.y + 4.5, b.z, b.yaw);
    const r = pt(UP, 37, zc); put(pitRoof, i, r.x, r.y + 9.3, r.z, r.yaw);
    const g = pt(UP, 30.2, zc); put(pitGlass, i, g.x, g.y + 5.2, g.z, g.yaw);
  });
  done(pitBox); done(pitRoof); done(pitGlass);

  // ---- paddock on a raised grassy ridge behind the pit building: terraces with motorhomes on top
  const PADD_D = [62, 74, 86], PADZ = []; for (let k = 0; k < 10; k++) PADZ.push(-54 + 12 * k);
  const padN = PADD_D.length * PADZ.length;
  const blocks = new T.InstancedMesh(new T.BoxGeometry(11, 8, 11), ridge, padN);
  const vans = new T.InstancedMesh(new T.BoxGeometry(3, 3, 7), white, padN);
  let pi = 0;
  PADD_D.forEach(function (d) {
    PADZ.forEach(function (zc) {
      const q = pt(UP, d, zc);
      put(blocks, pi, q.x, q.y + 2, q.z, q.yaw);
      put(vans, pi, q.x, q.y + 7.5, q.z, q.yaw);
      tint(vans, pi, [0xf5f3ee, 0xd9dde2, 0xe9e2d0]);
      pi++;
    });
  });
  done(blocks); done(vans);
  circles.push({ x: pt(UP, 55, 0).x, z: pt(UP, 55, 0).z, r: 88 });

  // ---- sunflower and wheat fields farther out (flat patches on the ground)
  const FIELDS = [
    { x: -800, z: 60, w: 160, h: 220, sun: true },
    { x: -690, z: 420, w: 140, h: 140, sun: true },
    { x: -880, z: -120, w: 140, h: 140, sun: true },
    { x: 420, z: 700, w: 200, h: 140, sun: false },
    { x: -120, z: 800, w: 180, h: 120, sun: false }
  ];
  const sunF = FIELDS.filter(function (f) { return f.sun; }), wheatF = FIELDS.filter(function (f) { return !f.sun; });
  const sunMat = ctx.mat(0xffffff, { map: stripes(0x6f8f2f, 0xf2c12a, 4), roughness: 1, metalness: 0 });
  const wheatMat = ctx.mat(0xffffff, { map: stripes(0xd9b45a, 0xb8903a, 5), roughness: 1, metalness: 0 });
  [[sunF, sunMat], [wheatF, wheatMat]].forEach(function (pair) {
    const list = pair[0];
    if (!list.length) return;
    const m = new T.InstancedMesh(new T.BoxGeometry(1, 0.8, 1), pair[1], list.length);
    list.forEach(function (f, i) { put(m, i, f.x, ctx.ground(f.x, f.z) + 0.1, f.z, 0, f.w, 1, f.h); });
    done(m);
  });
  FIELDS.forEach(function (f) { circles.push({ x: f.x, z: f.z, r: Math.hypot(f.w, f.h) / 2 + 8 }); });

  // ---- valley rim: grassy hills around the amphitheatre (cones, instanced)
  const HILLS = [[-430, -330, 1], [40, -800, 1.1], [300, -780, 0.9], [700, -260, 1], [700, 150, 1.1],
                 [520, 480, 1], [-560, 640, 1], [-1000, 330, 1], [-900, -330, 1]];
  const hills = new T.InstancedMesh(new T.ConeGeometry(60, 34, 10, 1), grass, HILLS.length);
  HILLS.forEach(function (h, i) { const y = ctx.ground(h[0], h[1]); put(hills, i, h[0], y + 17 * h[2] - 2, h[1], 0, h[2], h[2], h[2]); });
  done(hills);

  // ---- Mogyorod village: white houses with red roofs in a loose grid, a church with a spire at the centre
  const VC = { x: 480, z: -600 };
  const houses = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) {
    const x = VC.x + (i - 3.5) * 24 + (RAND() - 0.5) * 6;
    const z = VC.z + (j - 2.5) * 22 + (RAND() - 0.5) * 5;
    const yaw = (RAND() < 0.5 ? 0 : Math.PI / 2) + (RAND() - 0.5) * 0.2;
    if (Math.hypot(x - VC.x, z - VC.z) < 18) continue;
    if (!ctx.clearOf(x, z, 9)) continue;
    houses.push({ x: x, y: ctx.ground(x, z), z: z, yaw: yaw });
  }
  const hw = new T.InstancedMesh(new T.BoxGeometry(8, 4.5, 12), wall, houses.length);
  const roofShape = new T.Shape();
  roofShape.moveTo(-4.6, 0); roofShape.lineTo(4.6, 0); roofShape.lineTo(0, 3.8); roofShape.closePath();
  const roofGeom = new T.ExtrudeGeometry(roofShape, { depth: 13, bevelEnabled: false, steps: 1 });
  roofGeom.translate(0, 0, -6.5);
  const hr = new T.InstancedMesh(roofGeom, tiles, houses.length);
  houses.forEach(function (h, i) {
    put(hw, i, h.x, h.y + 2.25 - 0.3, h.z, h.yaw); tint(hw, i, [0xf1ead9, 0xe6dcc3, 0xf5f1e6, 0xe9d7b8]);
    put(hr, i, h.x, h.y + 4.2, h.z, h.yaw); tint(hr, i, [0xa84a2e, 0xb35a36, 0x96402a]);
  });
  done(hw); done(hr);
  circles.push({ x: VC.x, z: VC.z, r: 170 });
  const cg = ctx.ground(VC.x, VC.z);
  const nave = new T.Mesh(new T.BoxGeometry(9, 6, 18), churchW);
  nave.position.set(VC.x, cg + 3, VC.z); ctx.add(nave);
  const tower = new T.Mesh(new T.BoxGeometry(6, 16, 6), churchW);
  tower.position.set(VC.x, cg + 8, VC.z - 12); ctx.add(tower);
  const spireM = new T.Mesh(new T.ConeGeometry(4.2, 12, 4), spire);
  spireM.position.set(VC.x, cg + 22, VC.z - 12); spireM.rotation.y = Math.PI / 4; ctx.add(spireM);

  // ---- deciduous trees (instanced): along the valley rim, the village and the fields' edges
  const TREES = [];
  let tries = 0;
  while (TREES.length < 420 && tries < 8000) {
    tries++;
    const x = -1000 + RAND() * 1800, z = -900 + RAND() * 1800;
    const td = ctx.trackDist(x, z);
    if (td < 45 || td > 230) continue;
    if (!ctx.clearOf(x, z, 4.5)) continue;
    if (keepOut(x, z)) continue;
    TREES.push({ x: x, y: ctx.ground(x, z), z: z, yaw: RAND() * TAU, s: 0.8 + RAND() * 0.5 });
  }
  if (TREES.length) {
    const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.45, 0.7, 4.5, 6), trunk, TREES.length);
    const crowns = new T.InstancedMesh(new T.IcosahedronGeometry(3.2, 0), crown, TREES.length);
    TREES.forEach(function (t, i) {
      put(trunks, i, t.x, t.y + 2.25, t.z, 0);
      put(crowns, i, t.x, t.y + 6.6, t.z, t.yaw, t.s, t.s * 1.1, t.s);
      tint(crowns, i, [0x3f7a2f, 0x4f8a36, 0x5d9440, 0x2f6b2a]);
    });
    done(trunks); done(crowns);
  }
};
