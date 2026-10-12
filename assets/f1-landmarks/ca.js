window.F1Landmarks['ca'] = function (ctx) {
  // Circuit Gilles Villeneuve, Montreal. World: +x east, -z north. The island holds the track; the Saint Lawrence
  // surrounds it except a land block to the north (Ile Sainte-Helene, with the Biosphere) and the west channel,
  // beyond which the downtown skyline stands.
  const T = ctx.THREE;
  const gnd = (x, z) => ctx.ground(x, z);

  /* ---------- water: flat planes at ground + 0.05, each kept far from the track ---------- */
  const WATER = ctx.mat(0x2b6f8f, { roughness: 0.25, metalness: 0.1 });
  function water(x0, x1, z0, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const m = new T.Mesh(new T.PlaneGeometry(x1 - x0, z1 - z0), WATER);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, gnd(cx, cz) + 0.05, cz);
    ctx.add(m);
  }
  water(-760, -420, -1120, 1040);   // west channel
  water(400, 900, -1120, 1040);     // east
  water(-760, 900, 1040, 1500);     // south
  water(-760, -520, -1600, -1120);  // north-west
  water(-40, 900, -1600, -1120);    // north-east
  water(-520, -40, -1600, -1480);   // north, beyond the Ste-Helene land block

  /* ---------- Olympic rowing basin: a long channel on the inside (left) of the back straight ---------- */
  const BASIN_OFF = 54, BASIN_HALF = 20;
  const bp = [];
  for (let k = 0; k <= 18; k++) { const p = ctx.at(0.700 + k * 0.00625); bp.push({ x: p.x + p.lx * BASIN_OFF, z: p.z + p.lz * BASIN_OFF }); }
  for (let i = 0; i < bp.length - 1; i++) {
    const a = bp[i], b = bp[i + 1], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const m = new T.Mesh(new T.BoxGeometry(BASIN_HALF * 2, 0.1, len + 1.5), WATER);
    m.rotation.y = Math.atan2(dx, dz);
    m.position.set(mx, gnd(mx, mz), mz);
    ctx.add(m);
  }
  function basinDist(x, z) {
    let best = 1e9;
    for (let i = 0; i < bp.length - 1; i++) {
      const a = bp[i], b = bp[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / l2; t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
    }
    return best;
  }

  /* ---------- Biosphere: geodesic dome, 76 m, on the neighbouring island to the north ---------- */
  const BIO = { x: -280, z: -1300 };
  const bioY = gnd(BIO.x, BIO.z);
  const plaza = new T.Mesh(new T.CylinderGeometry(44, 46, 1.2, 24), ctx.mat(0x8c9196, { roughness: 0.9 }));
  plaza.position.set(BIO.x, bioY + 0.6, BIO.z);
  ctx.add(plaza);
  const dome = new T.Mesh(new T.IcosahedronGeometry(38, 2), ctx.mat(0xc3ccd3, { flatShading: true, metalness: 0.35, roughness: 0.3 }));
  dome.position.set(BIO.x, bioY + 38, BIO.z);
  ctx.add(dome);

  /* ---------- Wall of Champions: concrete wall on the outside (right) of the final chicane exit ---------- */
  const signCv = document.createElement('canvas');
  signCv.width = 1024; signCv.height = 64;
  const sg = signCv.getContext('2d');
  sg.fillStyle = '#d8d4cc'; sg.fillRect(0, 0, 1024, 64);
  sg.fillStyle = '#1d3f8a'; sg.font = 'bold 44px Arial'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
  sg.fillText('BIENVENUE AU QUEBEC', 512, 34);
  const signTex = new T.CanvasTexture(signCv);
  const concrete = ctx.mat(0xb9b6ae, { roughness: 0.9 });
  const signMat = ctx.mat(0xffffff, { map: signTex, roughness: 0.8 });
  const wallMats = [signMat, concrete, concrete, concrete, concrete, concrete];   // +x face = track side
  const WALL_U0 = 0.900, WALL_U1 = 0.935, WALL_N = 25, WALL_OFF = ctx.clear + 1.5;
  for (let i = 0; i < WALL_N; i++) {
    const ua = WALL_U0 + (WALL_U1 - WALL_U0) * i / WALL_N, ub = WALL_U0 + (WALL_U1 - WALL_U0) * (i + 1) / WALL_N;
    const p = ctx.at((ua + ub) / 2), len = (ub - ua) * ctx.lengthM;
    const cx = p.x - p.lx * WALL_OFF, cz = p.z - p.lz * WALL_OFF;   // right of the driver = -left
    const m = new T.Mesh(new T.BoxGeometry(0.8, 1.6, len), wallMats);
    m.rotation.y = p.yaw;
    m.position.set(cx, gnd(cx, cz) + 0.8, cz);
    ctx.add(m);
    ctx.solid(m);
  }

  /* ---------- downtown skyline across the west channel ---------- */
  const TOWERS = [   // x, z, width, depth, height, colour
    [-840, -150, 60, 50, 120, 0x9aa7b3], [-870, -60, 45, 40, 170, 0xc7ccd2], [-905, 40, 55, 45, 95, 0x7f8f9d],
    [-860, 120, 50, 60, 140, 0xaeb7bf], [-935, 175, 40, 40, 70, 0x8a98a6], [-980, -210, 50, 45, 60, 0xb9b1a4],
    [-1000, -20, 50, 50, 105, 0x6d7d8c], [-980, 110, 60, 50, 80, 0xd2c9b8], [-1040, -120, 55, 45, 150, 0x95a4b0],
    [-1060, 50, 45, 45, 210, 0xdfe3e6], [-1090, 190, 40, 40, 90, 0x7b8a97], [-1120, -220, 45, 40, 80, 0xa8b0b6],
    [-1140, 0, 50, 50, 120, 0x5f6e7b]
  ];
  const wc = document.createElement('canvas');
  wc.width = 64; wc.height = 64;
  const wg = wc.getContext('2d');
  wg.fillStyle = '#2b3a48'; wg.fillRect(0, 0, 64, 64);
  wg.fillStyle = '#9cc3dc';
  for (let y = 4; y < 60; y += 8) for (let x = 4; x < 60; x += 8) wg.fillRect(x, y, 4, 5);
  const winTex = new T.CanvasTexture(wc);
  winTex.wrapS = winTex.wrapT = T.RepeatWrapping;
  TOWERS.forEach(t => {
    const tex = winTex.clone();
    tex.repeat.set(Math.max(2, Math.round(t[2] / 7.5)), Math.max(2, Math.round(t[4] / 8)));
    tex.needsUpdate = true;
    const m = new T.Mesh(new T.BoxGeometry(t[2], t[4], t[3]), ctx.mat(t[5], { map: tex, roughness: 0.3, metalness: 0.2 }));
    m.position.set(t[0], gnd(t[0], t[1]) + t[4] / 2, t[1]);
    ctx.add(m);
  });

  /* ---------- island trees: instanced trunks and canopies on the island, away from the road and the basin ---------- */
  const N_TREES = 380;
  const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.35, 0.45, 3, 5), ctx.mat(0x6b4f2e, { roughness: 0.9 }), N_TREES);
  const canopies = new T.InstancedMesh(new T.ConeGeometry(3.4, 9, 6), ctx.mat(0xffffff, { flatShading: true, roughness: 0.9 }), N_TREES);
  const cols = [0x3d7a2c, 0x4f8a36, 0x2f6b27, 0x5c9a40, 0x3a7a3a];
  const dummy = new T.Object3D();
  let n = 0;
  for (let tries = 0; tries < 8000 && n < N_TREES; tries++) {
    const x = -405 + ctx.rand() * 790, z = -1105 + ctx.rand() * 2130;
    const s = 0.8 + ctx.rand() * 0.6;
    if (!ctx.clearOf(x, z, 3.4 * s + 0.5)) continue;
    if (basinDist(x, z) < BASIN_HALF + 4 + 3.4 * s) continue;
    const g = gnd(x, z);
    dummy.position.set(x, g + 1.5, z); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    trunks.setMatrixAt(n, dummy.matrix);
    dummy.position.set(x, g + 2.4 + 4.5 * s, z); dummy.scale.set(s, s, s); dummy.updateMatrix();
    canopies.setMatrixAt(n, dummy.matrix);
    canopies.setColorAt(n, new T.Color(cols[Math.floor(ctx.rand() * cols.length)]));
    n++;
  }
  trunks.count = n; canopies.count = n;
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  ctx.add(trunks);
  ctx.add(canopies);
};
