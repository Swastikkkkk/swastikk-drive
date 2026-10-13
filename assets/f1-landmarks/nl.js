/* Circuit Zandvoort: marram-grass dunes all round, the North Sea and beach to the west with beach pavilions,
   orange grandstands at Tarzan (T1), Hugenholtzbocht (T3) and Arie Luyendijkbocht (T14), and the town
   apartment blocks and water tower to the south. Geometry is built from primitives, all placed with ctx. */
window.F1Landmarks['nl'] = function (ctx) {
  var T = ctx.THREE, L = ctx.lengthM, PI = Math.PI, TWO = Math.PI * 2;
  var M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), UP = new T.Vector3(0, 1, 0), COL = new T.Color();

  // set one instance: translation, yaw about the vertical axis, and scale
  function place(inst, i, x, y, z, yaw, sx, sy, sz) {
    P.set(x, y, z); Q.setFromAxisAngle(UP, yaw || 0); S.set(sx, sy, sz);
    M.compose(P, Q, S); inst.setMatrixAt(i, M);
  }
  function tint(inst, i, hex) { COL.setHex(hex); inst.setColorAt(i, COL); }
  function pickHex(list) { return list[Math.floor(ctx.rand() * list.length) % list.length]; }
  function instanced(geo, mat, count, name) { var m = new T.InstancedMesh(geo, mat, count); m.name = name; ctx.add(m); return m; }

  var SAND = [0xe6c890, 0xdcb97c, 0xefd9a4, 0xd4b06e];
  var GRASS = [0x8c9450, 0x6e7a3c, 0xa3a866, 0x7b8b4a];
  var ORANGE = [0xff6a00, 0xff7a1a, 0xf26b0f, 0xff8c1a, 0xe85d04];
  var ROOFS = [0x2f7fc1, 0xd9473a, 0xf2c230, 0x2aa198, 0xff6a00];
  var CREAM = [0xf1ebdc, 0xe6dcc6, 0xd9c7a8, 0xf4f1ea, 0xc9a27e, 0xe8e0cf];

  // track extent in the game's frame
  var minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, k, q;
  for (k = 0; k < 500; k++) {
    q = ctx.at(k / 500);
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
    minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z);
  }

  var matSand = ctx.mat(0xffffff, { flatShading: true, roughness: 1 });
  var matGrass = ctx.mat(0xffffff, { flatShading: true, roughness: 1 });
  var matSea = ctx.mat(0x2b6f8f, { roughness: 0.3, metalness: 0.05 });
  var matBeach = ctx.mat(0xead8a8, { flatShading: true, roughness: 1 });
  var matWood = ctx.mat(0xb08154, { roughness: 0.9 });
  var matPavBody = ctx.mat(0xf6f3ec, { roughness: 0.7 });
  var matPavRoof = ctx.mat(0xffffff, { roughness: 0.7 });
  var matOrange = ctx.mat(0xffffff, { flatShading: true, roughness: 0.8 });
  var matCrowd = ctx.mat(0xffffff, { roughness: 0.9 });
  var matRoof = ctx.mat(0x3b4048, { roughness: 0.6 });
  var matPost = ctx.mat(0x8c9299, { roughness: 0.6 });

  // ---- sea and beach: flat tiles sitting on the ground, west of the track ----
  var seaCols = [], zs = [], j;
  for (j = 0; j < 6; j++) seaCols.push(minX - 410 - 100 * j);
  for (var zc = minZ - 300; zc <= maxZ + 300; zc += 100) zs.push(zc);
  var tile = new T.PlaneGeometry(100, 100);
  tile.rotateX(-PI / 2);
  var seaM = instanced(tile, matSea, seaCols.length * zs.length, 'nl-sea');
  var n = 0;
  seaCols.forEach(function (x) {
    zs.forEach(function (z) { place(seaM, n++, x, ctx.ground(x, z) + 0.05, z, 0, 1, 1, 1); });
  });
  var beachX = minX - 310;
  var beachM = instanced(tile, matBeach, zs.length, 'nl-beach');
  zs.forEach(function (z, i) { place(beachM, i, beachX, ctx.ground(beachX, z) + 0.12, z, 0, 1, 1, 1); });

  // beach pavilions along the sand, facing the sea
  var pav = [];
  for (var pz0 = minZ - 60; pz0 < maxZ + 80; pz0 += 118) {
    var px = beachX + (ctx.rand() - 0.5) * 20, pz = pz0 + (ctx.rand() - 0.5) * 30;
    pav.push({ x: px, z: pz, gy: ctx.ground(px, pz) });
  }
  var pavDeck = instanced(new T.BoxGeometry(1, 1, 1), matWood, pav.length, 'nl-pavilion-decks');
  var pavBody = instanced(new T.BoxGeometry(1, 1, 1), matPavBody, pav.length, 'nl-pavilion-bodies');
  var pavRoof = instanced(new T.BoxGeometry(1, 1, 1), matPavRoof, pav.length, 'nl-pavilion-roofs');
  pav.forEach(function (p, i) {
    place(pavDeck, i, p.x, p.gy + 0.2, p.z, 0, 16, 0.4, 9);
    place(pavBody, i, p.x + 1, p.gy + 2.1, p.z, 0, 9, 3.4, 7);
    place(pavRoof, i, p.x + 1, p.gy + 4.05, p.z, 0, 10.5, 0.5, 8.5);
    tint(pavRoof, i, pickHex(ROOFS));
  });

  // ---- marram-grass dunes all round the circuit, clear of the track ----
  var dunes = [];
  var xLo = minX - 255, xHi = maxX + 170, zLo = minZ - 200, zHi = maxZ + 60;
  for (var t = 0; t < 1400 && dunes.length < 260; t++) {
    var r = 10 + ctx.rand() * 14, h = r * (0.28 + ctx.rand() * 0.22);
    var x = xLo + r * 1.5 + ctx.rand() * (xHi - xLo - r * 1.5);
    var z = zLo + ctx.rand() * (zHi - zLo);
    if (!ctx.clearOf(x, z, r * 1.4143)) continue;
    dunes.push({ x: x, z: z, r: r, h: h, gy: ctx.ground(x, z) });
  }
  var duneM = instanced(new T.SphereGeometry(1, 10, 6), matSand, dunes.length, 'nl-dunes');
  dunes.forEach(function (d, i) {
    place(duneM, i, d.x, d.gy - 0.3 * d.h, d.z, 0, d.r, d.h, d.r);
    tint(duneM, i, pickHex(SAND));
  });

  var tufts = [];
  dunes.forEach(function (d) {
    var cy = d.gy - 0.3 * d.h, cnt = Math.round(d.r * 0.9);
    for (var j2 = 0; j2 < cnt; j2++) {
      var a = ctx.rand() * TWO, rr = Math.sqrt(ctx.rand()) * 0.85 * d.r;
      var tx = d.x + Math.cos(a) * rr, tz = d.z + Math.sin(a) * rr;
      var top = cy + d.h * Math.sqrt(Math.max(0, 1 - (rr / d.r) * (rr / d.r)));
      var s = 0.8 + ctx.rand() * 0.6;
      tufts.push({ x: tx, y: top - 0.1 + 0.65 * s, z: tz, s: s, c: pickHex(GRASS) });
    }
  });
  var grassM = instanced(new T.ConeGeometry(0.45, 1.3, 3, 1, false), matGrass, tufts.length, 'nl-marram-grass');
  tufts.forEach(function (g, i) {
    place(grassM, i, g.x, g.y, g.z, 0, g.s, g.s, g.s);
    tint(grassM, i, g.c);
  });

  // ---- orange grandstands: outside Tarzan, Hugenholtzbocht (T3) and Arie Luyendijkbocht (T14) ----
  // u0/u1 = lap fraction span, side = +1 for the driver's left (outside of a right-hander), -1 for the right
  var ROWS = 8, ROWD = 1.6, ROWH = 0.75, D0 = 14, DMAX = 44;
  var stands = [
    { u0: 0.138, u1: 0.170, side: 1 },   // Tarzan, right-hand hairpin
    { u0: 0.256, u1: 0.282, side: -1 },  // Turn 3, Hugenholtzbocht
    { u0: 0.926, u1: 0.964, side: 1 }    // Turn 14, Arie Luyendijkbocht
  ];
  // each 10 m section sits on the outside of the road at the smallest lateral offset that keeps every row,
  // post and roof clear of the track (sections that cannot fit anywhere are left out)
  // radius from a box's centre that covers its world-space bounding box (what the checker samples)
  function aabbRadius(a, b, yaw) {
    var c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
    return Math.hypot(a * c + b * sn, a * sn + b * c);
  }
  function fitSection(p, sd, len) {
    var rowR = aabbRadius(ROWD / 2, len / 2, p.yaw);
    for (var D = D0; D <= DMAX; D += 1) {
      var ok = true, i;
      for (i = 0; i < ROWS && ok; i++) {
        var dl = D + (i + 0.5) * ROWD;
        ok = ctx.clearOf(p.x + sd * p.lx * dl, p.z + sd * p.lz * dl, rowR);
      }
      var fx = p.x + sd * p.lx * (D - 0.4), fz = p.z + sd * p.lz * (D - 0.4);
      var bx = p.x + sd * p.lx * (D + ROWS * ROWD - 0.2), bz = p.z + sd * p.lz * (D + ROWS * ROWD - 0.2);
      ok = ok && ctx.clearOf(fx, fz, 0.35) && ctx.clearOf(bx, bz, 0.35);
      if (ok) return D;
    }
    return -1;
  }
  var secs = [];
  stands.forEach(function (st) {
    var cnt = Math.max(3, Math.round((st.u1 - st.u0) * L / 10));
    for (var k2 = 0; k2 < cnt; k2++) {
      var uc = st.u0 + (k2 + 0.5) / cnt * (st.u1 - st.u0);
      var p = ctx.at(uc), len = (st.u1 - st.u0) * L / cnt * 0.96;
      var D = fitSection(p, st.side, len);
      if (D > 0) secs.push({ p: p, side: st.side, len: len, D: D });
    }
  });
  var tierN = secs.length * ROWS;
  var tierM = instanced(new T.BoxGeometry(1, 1, 1), matOrange, tierN, 'nl-grandstand-tiers');
  var crowdM = instanced(new T.BoxGeometry(0.55, 0.9, 0.45), matCrowd, tierN * 5, 'nl-grandstand-crowd');
  var roofM = instanced(new T.BoxGeometry(1, 1, 1), matRoof, secs.length, 'nl-grandstand-roofs');
  var postM = instanced(new T.BoxGeometry(1, 1, 1), matPost, secs.length * 2, 'nl-grandstand-posts');
  var ti = 0, ci = 0, pi = 0;
  secs.forEach(function (s, sIdx) {
    var p = s.p, sd = s.side, D0s = s.D;
    for (var i = 0; i < ROWS; i++) {
      var dLat = D0s + (i + 0.5) * ROWD, hI = ROWH * (i + 1);
      var bx = p.x + sd * p.lx * dLat, bz = p.z + sd * p.lz * dLat;
      place(tierM, ti, bx, ctx.ground(bx, bz) + hI / 2, bz, p.yaw, ROWD, hI, s.len);
      tint(tierM, ti, pickHex(ORANGE));
      ti++;
      for (var j3 = 0; j3 < 5; j3++) {
        var off = ((j3 + 0.5) / 5 - 0.5) * s.len * 0.9, lat = dLat + (ctx.rand() - 0.5) * 0.6;
        var cx = p.x + p.tx * off + sd * p.lx * lat, cz = p.z + p.tz * off + sd * p.lz * lat;
        place(crowdM, ci, cx, ctx.ground(cx, cz) + hI + 0.45, cz, p.yaw, 1, 1, 1);
        var rv = ctx.rand();
        tint(crowdM, ci, rv < 0.7 ? pickHex(ORANGE) : rv < 0.86 ? 0xf4f4ef : 0x26292e);
        ci++;
      }
    }
    var dRoof = D0s + ROWS * ROWD / 2, rw = ROWS * ROWD + 2;
    var rx = p.x + sd * p.lx * dRoof, rz = p.z + sd * p.lz * dRoof;
    place(roofM, sIdx, rx, ctx.ground(rx, rz) + 9.3, rz, p.yaw, rw, 0.6, s.len);
    var fx = p.x + sd * p.lx * (D0s - 0.4), fz = p.z + sd * p.lz * (D0s - 0.4);
    place(postM, pi++, fx, ctx.ground(fx, fz) + 4.5, fz, 0, 0.5, 9, 0.5);
    var bkx = p.x + sd * p.lx * (D0s + ROWS * ROWD - 0.2), bkz = p.z + sd * p.lz * (D0s + ROWS * ROWD - 0.2);
    place(postM, pi++, bkx, ctx.ground(bkx, bkz) + 4.5, bkz, 0, 0.5, 9, 0.5);
  });

  // ---- the town to the south: apartment blocks with a window texture, and the water tower ----
  var wc = document.createElement('canvas');
  wc.width = 256; wc.height = 512;
  var wg = wc.getContext('2d');
  wg.fillStyle = '#f2eee4'; wg.fillRect(0, 0, 256, 512);
  for (var wr = 0; wr < 20; wr++) for (var wq = 0; wq < 8; wq++) {
    wg.fillStyle = wr % 5 === 4 ? '#cfc6b3' : '#4b5866';
    wg.fillRect(wq * 32 + 7, wr * 25.6 + 6, 18, 14);
  }
  var windowTex = new T.CanvasTexture(wc);
  var matBlocks = ctx.mat(0xffffff, { map: windowTex, roughness: 0.85 });

  var blocks = [];
  for (var bt = 0; bt < 400 && blocks.length < 14; bt++) {
    var bw = 16 + ctx.rand() * 10, bd = 11 + ctx.rand() * 4, storeys = 6 + Math.floor(ctx.rand() * 6);
    var bh = storeys * 3.2 + 0.6, bxp = minX + 80 + ctx.rand() * (maxX - minX - 140), bzp = maxZ + 120 + ctx.rand() * 140;
    var byaw = ctx.rand() < 0.5 ? 0 : PI / 2;
    if (!ctx.clearOf(bxp, bzp, Math.hypot(bw, bd) / 2)) continue;
    blocks.push({ x: bxp, z: bzp, w: bw, d: bd, h: bh, yaw: byaw, gy: ctx.ground(bxp, bzp) });
  }
  var blockM = instanced(new T.BoxGeometry(1, 1, 1), matBlocks, blocks.length, 'nl-town-blocks');
  blocks.forEach(function (b, i) {
    place(blockM, i, b.x, b.gy + b.h / 2, b.z, b.yaw, b.w, b.h, b.d);
    tint(blockM, i, pickHex(CREAM));
  });

  var twX = minX - 20, twZ = maxZ + 220, twG = ctx.ground(twX, twZ);
  var column = new T.Mesh(new T.CylinderGeometry(2.6, 3.6, 34, 10), ctx.mat(0xcfd3d6, { roughness: 0.9 }));
  column.position.set(twX, twG + 17, twZ); ctx.add(column);
  var tank = new T.Mesh(new T.CylinderGeometry(7.5, 7.5, 8, 14), ctx.mat(0xf1ead8, { roughness: 0.8 }));
  tank.position.set(twX, twG + 38, twZ); ctx.add(tank);
  var cap = new T.Mesh(new T.ConeGeometry(7.9, 3.2, 14), ctx.mat(0x9a3b2e, { roughness: 0.7 }));
  cap.position.set(twX, twG + 43.6, twZ); ctx.add(cap);
};
