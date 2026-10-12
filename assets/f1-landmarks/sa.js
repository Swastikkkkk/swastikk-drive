/* Jeddah Corniche Circuit (night race): the Red Sea to the west with a corniche promenade and palms, a lagoon
   inland, the tall fountain jet far out at sea, lit floodlight masts along the lap, a grandstand footbridge beside
   the main straight, and modern towers inland to the east with lit windows. */
window.F1Landmarks['sa'] = function (ctx) {
  const T = ctx.THREE, clear = ctx.clear, rnd = ctx.rand, night = ctx.night;
  const dummy = new T.Object3D();
  const SAMP = 800, route = [];
  for (let i = 0; i < SAMP; i++) route.push(ctx.at(i / SAMP));

  // sides of the road: +1 is the driver's left, -1 the right. West is the side with the smaller x.
  const westSide = p => (p.lx < 0 ? 1 : -1), eastSide = p => -westSide(p);
  const beside = (p, side, off) => ({ x: p.x + side * p.lx * off, z: p.z + side * p.lz * off });

  // the coast: sea lies west of the westernmost road within 160 m of this z, minus a 70 m corniche band
  const coastCache = {};
  function coastX(z) {
    const key = Math.round(z / 20);
    if (coastCache[key] !== undefined) return coastCache[key];
    const zc = key * 20; let mn = 1e9;
    for (const p of route) if (Math.abs(p.z - zc) < 160 && p.x < mn) mn = p.x;
    return (coastCache[key] = (mn < 1e8 ? mn : -200) - 70);
  }
  const gMax = (x, z, h) => Math.max(ctx.ground(x, z), ctx.ground(x - h, z - h), ctx.ground(x + h, z - h), ctx.ground(x - h, z + h), ctx.ground(x + h, z + h));

  function place(im, i, x, y, z, ry, sx, sy, sz, rx) {
    dummy.position.set(x, y, z); dummy.rotation.set(rx || 0, ry || 0, 0); dummy.scale.set(sx || 1, sy || 1, sz || 1);
    dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
  }
  function instanced(geo, mat, n) {
    const im = new T.InstancedMesh(geo, mat, n); ctx.add(im); return im;
  }

  // ---- the Red Sea: 60 m water cells west of the coast, kept 44 m+ from the road ----
  const CELL = 60, seaCells = [];
  for (let x = -1350 + CELL / 2; x < 0; x += CELL)
    for (let z = -1500 + CELL / 2; z < 1500; z += CELL) {
      if (x > coastX(z) - 20) continue;
      if (ctx.trackDist(x, z) < clear + CELL * 0.71 + 2) continue;
      seaCells.push([x, gMax(x, z, CELL / 2) + 0.05, z]);
    }
  const sea = instanced(new T.PlaneGeometry(CELL, CELL), ctx.mat(night ? 0x123f57 : 0x1f6f8e, { roughness: 0.35, metalness: 0.15 }), seaCells.length);
  seaCells.forEach((c, i) => place(sea, i, c[0], c[1], c[2], 0, 1, 1, 1, -Math.PI / 2));

  // ---- the lagoon: a basin of 30 m water cells inland (east) of the middle of the lap ----
  const LX = 50, LZ = -430, LRX = 120, LRZ = 85, LC = 30, lagCells = [];
  for (let i = -6; i <= 6; i++) for (let j = -4; j <= 4; j++) {
    const x = LX + i * LC, z = LZ + j * LC;
    if (Math.pow((x - LX) / LRX, 2) + Math.pow((z - LZ) / LRZ, 2) > 1) continue;
    if (ctx.trackDist(x, z) < clear + LC * 0.71 + 2) continue;
    lagCells.push([x, gMax(x, z, LC / 2) + 0.06, z]);
  }
  if (lagCells.length) {
    const lag = instanced(new T.PlaneGeometry(LC, LC), ctx.mat(night ? 0x2a8f96 : 0x46b7b0, { roughness: 0.3, metalness: 0.1 }), lagCells.length);
    lagCells.forEach((c, i) => place(lag, i, c[0], c[1], c[2], 0, 1, 1, 1, -Math.PI / 2));
  }

  // ---- corniche promenade: pale 6 m paving tiles along the west edge of the road, on the coast side.
  // A rotated tile's bounding box reaches 6 m from its centre at worst, so the tiles sit 7.2 m out and must clear 6.5 m.
  const prom = [];
  for (let k = 0; k < SAMP; k++) {
    const p = route[k], q = beside(p, westSide(p), clear + 7.2);
    if (!ctx.clearOf(q.x, q.z, 6.5)) continue;
    if (q.x - coastX(q.z) > 130) continue;
    prom.push([q.x, ctx.ground(q.x, q.z) + 0.15, q.z, p.yaw]);
  }
  if (prom.length) {
    const pm = instanced(new T.BoxGeometry(6, 0.3, 6), ctx.mat(0xd8cba6, { roughness: 0.9 }), prom.length);
    prom.forEach((c, i) => place(pm, i, c[0], c[1], c[2], c[3]));
  }

  // ---- palms along the promenade (trunk + flattened crown) ----
  const palms = [];
  for (let k = 0; k < SAMP; k += 2) {
    const p = route[k];
    if (rnd() < 0.4) continue;
    const q = beside(p, westSide(p), clear + 6.5);
    if (!ctx.clearOf(q.x, q.z, 1)) continue;
    if (q.x - coastX(q.z) > 130) continue;
    palms.push([q.x, ctx.ground(q.x, q.z), q.z, rnd() * 6.28]);
  }
  if (palms.length) {
    const trunks = instanced(new T.CylinderGeometry(0.35, 0.55, 11, 6), ctx.mat(0x7a5a3a, { roughness: 0.9 }), palms.length);
    palms.forEach((c, i) => place(trunks, i, c[0], c[1] + 5.5, c[2], 0, 1, 1, 1));
    const crowns = instanced(new T.DodecahedronGeometry(3.4, 0), ctx.mat(0x3f8f4a, { roughness: 0.7 }), palms.length);
    palms.forEach((c, i) => place(crowns, i, c[0], c[1] + 11.4, c[2], c[3], 1.35, 0.42, 1.35));
  }

  // ---- floodlight masts along the lap, alternating sides, lamp heads lit ----
  const masts = [], heads = [];
  for (let k = 0; k < SAMP; k += 5) {
    const p = route[k], first = ((k / 5) % 2) ? westSide(p) : eastSide(p);
    let q = null;
    for (const s of [first, -first]) { const c = beside(p, s, clear + 4.5); if (ctx.clearOf(c.x, c.z, 0.6)) { q = c; break; } }
    if (!q) continue;
    const g = ctx.ground(q.x, q.z);
    masts.push([q.x, g, q.z]); heads.push([q.x, g, q.z, p.yaw]);
  }
  if (masts.length) {
    const poles = instanced(new T.CylinderGeometry(0.28, 0.45, 30, 6), ctx.mat(0xb8bec6, { metalness: 0.3, roughness: 0.5 }), masts.length);
    masts.forEach((c, i) => place(poles, i, c[0], c[1] + 15, c[2], 0));
    const lamps = instanced(new T.BoxGeometry(3.6, 1.6, 1.4), ctx.basic(0xfff6d8), heads.length);
    heads.forEach((c, i) => place(lamps, i, c[0], c[1] + 30.5, c[2], c[3]));
  }

  // ---- modern towers inland (east) with lit windows, kept clear of the road and the lagoon ----
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const g2 = cv.getContext('2d');
  g2.fillStyle = '#16202e'; g2.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const lit = rnd();
    g2.fillStyle = lit < 0.45 ? '#ffd98a' : (lit < 0.6 ? '#fff1c9' : '#26364d');
    g2.fillRect(c * 16 + 3, r * 16 + 4, 10, 9);
  }
  const towers = [];
  const anchors = [0.06, 0.12, 0.2, 0.28, 0.36, 0.45, 0.55, 0.63, 0.72, 0.8, 0.88, 0.95];
  for (const u of anchors) {
    const p = ctx.at(u), s = eastSide(p);
    for (let t = 0; t < 8; t++) {
      const off = 150 + rnd() * 110, along = (rnd() - 0.5) * 160;
      const x = p.x + s * p.lx * off + p.tx * along, z = p.z + s * p.lz * off + p.tz * along;
      if (x < coastX(z) + 250 || ctx.trackDist(x, z) < 110) continue;
      if (Math.pow((x - LX) / (LRX + 60), 2) + Math.pow((z - LZ) / (LRZ + 50), 2) < 1) continue;
      if (towers.some(q => Math.hypot(q.x - x, q.z - z) < 75)) continue;
      if (!ctx.clearOf(x, z, 20)) continue;
      towers.push({ x, z, g: ctx.ground(x, z), w: 22 + rnd() * 12, d: 22 + rnd() * 12, h: 60 + rnd() * 65 });
      break;
    }
  }
  for (const b of towers) {
    const tex = new T.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(b.w / 25.6, b.h / 25.6);
    const body = new T.Mesh(new T.BoxGeometry(b.w, b.h, b.d), ctx.basic(0xffffff, { map: tex }));
    body.position.set(b.x, b.g + b.h / 2, b.z); ctx.add(body);
    const crown = new T.Mesh(new T.BoxGeometry(b.w * 0.55, 7, b.d * 0.55), ctx.mat(0x3a4656));
    crown.position.set(b.x, b.g + b.h + 3.5, b.z); ctx.add(crown);
    const beacon = new T.Mesh(new T.BoxGeometry(1.2, 1.2, 1.2), ctx.basic(0xff3b30));
    beacon.position.set(b.x, b.g + b.h + 7.6, b.z); ctx.add(beacon);
  }

  // ---- the fountain jet far out in the Red Sea (west of the coast) ----
  const FX = -950, FZ = 0, fg = ctx.ground(FX, FZ);
  const fBase = new T.Mesh(new T.CylinderGeometry(70, 80, 4, 24), ctx.mat(0xd9e6ea, { roughness: 0.6 }));
  fBase.position.set(FX, fg + 2, FZ); ctx.add(fBase);
  const fJet = new T.Mesh(new T.CylinderGeometry(3.5, 6.5, 240, 10), ctx.basic(night ? 0xe6fbff : 0xf4fbff, { transparent: true, opacity: 0.8 }));
  fJet.position.set(FX, fg + 4 + 120, FZ); ctx.add(fJet);
  const fTop = new T.Mesh(new T.CylinderGeometry(16, 22, 6, 16), ctx.basic(0xbff3ff));
  fTop.position.set(FX, fg + 4 + 243, FZ); ctx.add(fTop);

  // ---- grandstand footbridge beside the main straight (lap 0.92-1.0), on the inland side, not over the road ----
  const bp = ctx.at(0.955), bs = eastSide(bp), BR = clear + 30;
  const bx = bp.x + bs * bp.lx * BR, bz = bp.z + bs * bp.lz * BR, bg = ctx.ground(bx, bz);
  const bridge = new T.Group();
  bridge.position.set(bx, bg + 14, bz); bridge.rotation.y = bp.yaw;
  const deck = new T.Mesh(new T.BoxGeometry(10, 0.9, 130), ctx.mat(0xaab2bb, { roughness: 0.7 }));
  bridge.add(deck);
  for (const sx of [-4.8, 4.8]) {
    const rail = new T.Mesh(new T.BoxGeometry(0.25, 1.1, 130), ctx.mat(0x6d7a88));
    rail.position.set(sx, 0.9, 0); bridge.add(rail);
  }
  for (const pz of [-58, 0, 58]) {
    const pil = new T.Mesh(new T.BoxGeometry(3.2, 14.5, 3.2), ctx.mat(0x8c96a1));
    pil.position.set(0, -7.7, pz); bridge.add(pil);
  }
  ctx.add(bridge);
};
