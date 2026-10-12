/* Shanghai International Circuit (cn): viewing wings on both sides of the start/finish straight joined by a high bridge,
   pit pavilions on stilts over a lake behind the pits, covered stands at the back-straight hairpin, Jiading factories and
   distant towers to the south-east. Local frame: s = metres past the line (negative = behind it), o = metres to the LEFT of
   the road centreline (negative = right). Every piece is an instanced box/cylinder placed in its own road-aligned frame, so
   each instance's bounding box stays clear of the track. */
window.F1Landmarks = window.F1Landmarks || {};
window.F1Landmarks['cn'] = function (ctx) {
  const T = ctx.THREE, L = ctx.lengthM, UP = new T.Vector3(0, 1, 0), AX = new T.Vector3(1, 0, 0);
  const add = m => ctx.add(m);
  const rnd = (a, b) => a + (b - a) * ctx.rand();
  const road = s => ctx.at((((s / L) % 1) + 1) % 1);
  const gnd = (s, o) => { const r = road(s); return ctx.ground(r.x + r.lx * o, r.z + r.lz * o); };

  // frame at (s, o) with base height y: local x = along the road, y = up, z = to the right
  function frame(s, o, y) {
    const r = road(s), M = new T.Matrix4();
    M.makeBasis(new T.Vector3(r.tx, 0, r.tz), UP, new T.Vector3(-r.tz, 0, r.tx));
    M.setPosition(r.x + r.lx * o, y, r.z + r.lz * o);
    return M;
  }
  // world matrix of a part in frame M: a along, c up, b right (metres from the frame origin), size, tilt about the along axis
  const P = new T.Vector3(), S = new T.Vector3(), Q = new T.Quaternion(), TMP = new T.Matrix4();
  function loc(M, a, c, b, sx, sy, sz, tilt) {
    P.set(a, c, b); S.set(sx, sy, sz); Q.setFromAxisAngle(AX, tilt || 0);
    return new T.Matrix4().multiplyMatrices(M, TMP.compose(P, Q, S));
  }
  // plain world matrix: position, yaw, size
  function mk(x, y, z, yaw, sx, sy, sz) {
    return new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromAxisAngle(UP, yaw || 0), new T.Vector3(sx, sy, sz));
  }
  function inst(geom, material, list, colors) {
    if (!list.length) return;
    const m = new T.InstancedMesh(geom, material, list.length);
    for (let i = 0; i < list.length; i++) { m.setMatrixAt(i, list[i]); if (colors) m.setColorAt(i, new T.Color(colors[i])); }
    m.instanceMatrix.needsUpdate = true;
    if (colors && m.instanceColor) m.instanceColor.needsUpdate = true;
    add(m);
  }
  function block(M, a, c, b, sx, sy, sz, tilt, material) {
    const g = new T.BoxGeometry(sx, sy, sz);
    g.applyMatrix4(loc(M, a, c, b, 1, 1, 1, tilt));
    add(new T.Mesh(g, material));
  }

  const BOX = new T.BoxGeometry(1, 1, 1), CYL = new T.CylinderGeometry(1, 1, 1, 10);
  const PLANE = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mWhite = ctx.mat(0xeceff1, { roughness: .6 }), mGlass = ctx.mat(0x2b5266, { roughness: .25, metalness: .2 }),
    mRed = ctx.mat(0xb3262e, { roughness: .6 }), mDark = ctx.mat(0x3d434b, { roughness: .7 }),
    mConc = ctx.mat(0xc2c0b8, { roughness: .9 }), mWater = ctx.mat(0x3e8fa3, { roughness: .2, metalness: .15 }),
    mWhiteI = ctx.mat(0xffffff, { roughness: .8 }), mTowerI = ctx.mat(0xffffff, { roughness: .35, metalness: .25 });

  /* 1. viewing wings on both sides of the start/finish straight (+o = pit side, -o = grandstand side), joined by a high bridge */
  const wBody = [], wGlass = [], wRoof = [];
  for (const side of [1, -1]) {
    const o = 30 * side, tilt = -0.2 * side;          // the roof sweeps up toward the track
    for (let s = 84; s <= 124; s += 8) {
      const M = frame(s, o, gnd(s, o));
      wBody.push(loc(M, 0, 6, 0, 8, 12, 16));
      wGlass.push(loc(M, 0, 8, 0, 8.02, 4.2, 16.02));
      wRoof.push(loc(M, 0, 15, 0, 8.6, 0.8, 22, tilt));
    }
  }
  inst(BOX, mWhite, wBody); inst(BOX, mGlass, wGlass); inst(BOX, mRed, wRoof);
  // the bridge's lowest point is ~9 m above the road, over the start straight; its ends sit inside the two wings
  { const M = frame(102, 0, road(102).y + 10.5);
    block(M, 0, 0, 0, 14, 2.4, 64, 0, mWhite);
    block(M, 0, 3.4, 0, 8, 1.8, 48, 0, mRed); }

  /* 2. pit pavilions on stilts over the lake behind the pits (pit side, well behind the pit building) */
  const pFloor = [], pBody = [], pGlass = [], pRoof = [], pStilt = [];
  for (const s0 of [-116, -60, 4]) for (let k = 0; k < 5; k++) {
    const s = s0 + 8 * k, o = 53, W = gnd(s, o) + 0.05, M = frame(s, o, W);
    pFloor.push(loc(M, 0, 4.0, 0, 8, 0.8, 24));
    pBody.push(loc(M, 0, 7.5, 0, 8, 6.2, 20));
    pGlass.push(loc(M, 0, 7.5, 0, 8.02, 3.4, 20.02));
    pRoof.push(loc(M, 0, 11.0, 0, 8.8, 0.8, 27));
    pStilt.push(loc(M, 0, 0.55, -9, 0.45, 6.1, 0.45), loc(M, 0, 0.55, 9, 0.45, 6.1, 0.45));
  }
  inst(BOX, mConc, pFloor); inst(BOX, mWhite, pBody); inst(BOX, mGlass, pGlass);
  inst(BOX, mDark, pRoof); inst(CYL, mConc, pStilt);

  /* 3. the lake behind the pits: flat tiles, each at the local ground height */
  const lake = [];
  for (let s = -168; s <= 64; s += 8) for (let o = 38; o <= 142; o += 8)
    lake.push(loc(frame(s, o, gnd(s, o) + 0.05), 0, 0, 0, 8, 1, 8));
  inst(PLANE, mWater, lake);

  /* 4. covered stands at the back-straight hairpin: one on the south side of the back straight (s = u .272),
        one on the outside of the hairpin apex (u .31). Both sit on the left (+o) of the road. */
  const palette = [0xe4572e, 0xf3a712, 0xd9d4c6, 0x2f6f9e, 0x3f8a56, 0xb8322f, 0x5c4b8a, 0xe0bd58];
  const tiers = [], sRoof = [], sCol = [], crowd = [], crowdC = [];
  for (const [sc, k0, k1] of [[0.272 * L, -5, 4], [0.31 * L, -4, 3]]) for (let k = k0; k <= k1; k++) {
    const s = sc + 8 * k, M = frame(s, 44, gnd(s, 44));
    for (let t = 0; t < 4; t++) {
      const h = 1.2 + 1.5 * t, b = 6 - 4 * t;               // rising away from the track
      tiers.push(loc(M, 0, h / 2, b, 8, h, 4));
      for (let j = 0; j < 5; j++) {
        crowd.push(loc(M, -3.2 + 1.6 * j, h + 0.45, b + 1.2, 0.6, 0.9, 0.5));
        crowdC.push(palette[(ctx.rand() * palette.length) | 0]);
      }
    }
    sRoof.push(loc(M, 0, 9.5, -1, 8.2, 0.8, 22));
    sCol.push(loc(M, 0, 4.55, 9.6, 0.7, 9.1, 0.7), loc(M, 0, 4.55, -11.6, 0.7, 9.1, 0.7));
  }
  inst(BOX, mConc, tiers); inst(BOX, mWhiteI, crowd, crowdC);
  inst(BOX, mRed, sRoof); inst(BOX, mConc, sCol);

  /* 5. Jiading surroundings: factories with stacks, well away from the track */
  const fb = [], fbC = [], fr = [], fc = [], fcM = [];
  const fcol = [0x9c9385, 0xa04a3a, 0xc9c3b4, 0x6f7b84, 0x8c6a55, 0xb5ab98];
  const sites = [[-900, 120], [-960, 230], [-880, 300], [-980, 60], [100, -800], [220, -870], [40, -900],
    [300, -790], [900, -120], [960, -220], [930, -60], [-600, 650], [-700, 600], [-520, 700]];
  for (const [x0, z0] of sites) {
    const w = rnd(60, 85), h = rnd(10, 15), d = rnd(28, 40), yaw = rnd(-0.4, 0.4);
    const x = x0 + rnd(-25, 25), z = z0 + rnd(-20, 20), g = ctx.ground(x, z);
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    fb.push(mk(x, g + h / 2, z, yaw, w, h, d)); fbC.push(fcol[(ctx.rand() * fcol.length) | 0]);
    fr.push(mk(x, g + h + 1.2, z, yaw, w * 0.5, 2.4, d * 0.35));
    const lx = w * 0.3, lz = -d * 0.25, cx = x + lx * c + lz * sn, cz = z - lx * sn + lz * c, hc = rnd(24, 40);
    fc.push(mk(cx, ctx.ground(cx, cz) + hc / 2, cz, 0, 1.3, hc, 1.3));
  }
  inst(BOX, mWhiteI, fb, fbC); inst(BOX, mDark, fr); inst(CYL, mConc, fc);

  /* 6. distant Shanghai towers to the south-east, about 2 km out */
  const towers = [[1900, 1050, 632, 34], [2120, 1330, 421, 24], [1960, 1560, 492, 26], [2280, 980, 468, 22]];
  const tBody = [], tBodyC = [], tSpire = [], tSpireC = [];
  const TOWER_GEO = new T.CylinderGeometry(0.55, 1, 1, 8).translate(0, 0.5, 0);
  const SPIRE_GEO = new T.ConeGeometry(1, 1, 6).translate(0, 0.5, 0);
  for (const [x, z, H, R] of towers) {
    const g = ctx.ground(x, z), tint = [0xd6dfe5, 0xc3ced6, 0xe2e8ec][(ctx.rand() * 3) | 0];
    tBody.push(mk(x, g, z, 0, R, H, R)); tBodyC.push(tint);
    tSpire.push(mk(x, g + H, z, 0, R * 0.2, H * 0.08, R * 0.2)); tSpireC.push(0xb8c4cc);
  }
  inst(TOWER_GEO, mTowerI, tBody, tBodyC); inst(SPIRE_GEO, mTowerI, tSpire, tSpireC);
};
