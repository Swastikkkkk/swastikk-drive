/* Miami International Autodrome: Hard Rock Stadium in the infield, a fake marina with painted water and yachts
   in the hairpin pocket by Turns 6-8, palm trees, the Florida Turnpike interchange beside the track, pastel
   hospitality blocks on the infield's north side and a beach-club pool area to the south. */
window.F1Landmarks['mi'] = function (ctx) {
  var T = ctx.THREE, PI2 = Math.PI * 2;

  function xf(px, py, pz, rx, ry, rz, sx, sy, sz) {
    var m = new T.Matrix4();
    m.compose(new T.Vector3(px, py, pz),
      new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')),
      new T.Vector3(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz));
    return m;
  }
  function mul(a, b) { return new T.Matrix4().multiplyMatrices(a, b); }
  function inst(geo, mat, mats, colors) {
    var im = new T.InstancedMesh(geo, mat, mats.length);
    for (var i = 0; i < mats.length; i++) {
      im.setMatrixAt(i, mats[i]);
      if (colors) im.setColorAt(i, new T.Color(colors[i % colors.length]));
    }
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    ctx.add(im);
    return im;
  }
  function boxAt(w, h, d, mat, x, y, z, ry) {
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    ctx.add(m);
    return m;
  }
  function cylAt(rt, rb, h, seg, mat, x, y, z, open) {
    var m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg, 1, !!open), mat);
    m.position.set(x, y, z);
    ctx.add(m);
    return m;
  }

  /* ---------- Hard Rock Stadium (infield, centre east of the Turn 6-8 hairpins) ---------- */
  var SX = 420, SZ = -20, SB = ctx.ground(SX, SZ);
  var bowlMat = ctx.mat('#c9ced3', { roughness: .9, side: T.DoubleSide });
  var bowl = new T.Mesh(new T.CylinderGeometry(1, 0.86, 42, 48, 1, true), bowlMat);
  bowl.scale.set(150, 1, 115);
  bowl.position.set(SX, SB + 21, SZ);
  ctx.add(bowl);
  var seats = new T.Mesh(new T.CylinderGeometry(0.9, 0.66, 36, 48, 1, true),
    ctx.mat('#1aa5b8', { roughness: .8, side: T.DoubleSide }));
  seats.scale.set(150, 1, 115);
  seats.position.set(SX, SB + 22, SZ);
  ctx.add(seats);
  boxAt(112, .3, 74, ctx.mat('#3f9e46', { roughness: .95 }), SX, SB + .15, SZ);   // pitch
  // canopy roof: an oval ring on four masts
  var roofShape = new T.Shape();
  roofShape.absellipse(0, 0, 175, 130, 0, PI2, false, 0);
  var roofHole = new T.Path();
  roofHole.absellipse(0, 0, 118, 84, 0, PI2, true, 0);
  roofShape.holes.push(roofHole);
  var roof = new T.Mesh(new T.ExtrudeGeometry(roofShape, { depth: 2.2, bevelEnabled: false, curveSegments: 72 }),
    ctx.mat('#eef1f3', { roughness: .5, side: T.DoubleSide }));
  roof.rotation.x = -Math.PI / 2;
  roof.position.set(SX, SB + 52, SZ);
  ctx.add(roof);
  var masts = [];
  [[-120, -90], [120, -90], [120, 90], [-120, 90]].forEach(function (p) {
    masts.push(xf(SX + p[0], SB + 26.25, SZ + p[1]));
  });
  inst(new T.CylinderGeometry(1.4, 2.2, 52.5, 8), ctx.mat('#9aa3ab', { roughness: .6 }), masts);

  /* ---------- Fake marina with painted water and yachts (hairpin pocket, Turns 6-8) ---------- */
  var MX = -620, MZ = 150, MB = ctx.ground(MX, MZ);
  var quay = ctx.mat('#d9d2c3', { roughness: .9 });
  boxAt(128, 1.2, 4, quay, MX, MB + .6, MZ - 27);
  boxAt(128, 1.2, 4, quay, MX, MB + .6, MZ + 27);
  boxAt(4, 1.2, 54, quay, MX - 62, MB + .6, MZ);
  boxAt(4, 1.2, 54, quay, MX + 62, MB + .6, MZ);
  boxAt(120, .3, 50, ctx.mat('#1ea6d4', { roughness: .25 }), MX, MB + .15, MZ);      // water
  boxAt(104, .12, 36, ctx.mat('#4cc6ea', { roughness: .2 }), MX, MB + .36, MZ);      // lighter painted band
  var stripes = [];
  [-12, -4, 4, 12].forEach(function (dz) { stripes.push(xf(MX, MB + .45, MZ + dz)); });
  inst(new T.BoxGeometry(96, .06, 1.1), ctx.basic('#a6ecfa'), stripes);
  boxAt(116, .8, 3, ctx.mat('#a57a50', { roughness: .8 }), MX, MB + .5, MZ);           // central pier

  var hullCols = ['#ffffff', '#f4efe3', '#1f3f63', '#2a9d8f', '#e9a23b', '#d95d6b'];
  var hullM = [], bowM = [], cabinM = [], flyM = [], mastM = [];
  var yachtSpots = [[MX - 30, MZ - 12], [MX, MZ - 12], [MX + 30, MZ - 12],
    [MX - 30, MZ + 12], [MX, MZ + 12], [MX + 30, MZ + 12]];
  yachtSpots.forEach(function (s) {
    var Y = xf(s[0], MB + .3, s[1], 0, Math.PI / 2, 0);   // length runs along x
    hullM.push(mul(Y, xf(0, 1.1, -2)));
    bowM.push(mul(Y, xf(0, 1.1, 11, Math.PI / 2, 0, 0)));
    cabinM.push(mul(Y, xf(0, 3.2, -3)));
    flyM.push(mul(Y, xf(0, 4.3, -1)));
    mastM.push(mul(Y, xf(0, 9.9, -1)));
  });
  var yachtHullMat = ctx.mat('#ffffff', { roughness: .5 });
  inst(new T.BoxGeometry(5.6, 2.2, 22), yachtHullMat, hullM, hullCols);
  inst(new T.ConeGeometry(2.8, 4, 6), yachtHullMat, bowM, hullCols);
  inst(new T.BoxGeometry(4.2, 1.8, 11), ctx.mat('#f7f7f7', { roughness: .4 }), cabinM);
  inst(new T.BoxGeometry(3.2, .8, 5), ctx.mat('#f7f7f7', { roughness: .4 }), flyM);
  inst(new T.CylinderGeometry(.12, .16, 11, 5), ctx.mat('#9aa4ad', { roughness: .5 }), mastM);

  /* ---------- Pastel Miami hospitality blocks (infield north strip) ---------- */
  var HZ = -190, HB = ctx.ground(420, HZ);
  var glass = ctx.basic('#7fd3f2');
  var whiteMat = ctx.mat('#f6f4ef', { roughness: .5 });
  function hospitality(cx, L, D, H, col) {
    var body = boxAt(L, H, D, ctx.mat(col, { roughness: .55 }), cx, HB + H / 2, HZ);
    ctx.solid(body);
    boxAt(L * .9, H * .7, .4, glass, cx, HB + H * .5, HZ + D / 2 + .25);   // glazing on the stadium side
    boxAt(L + 1.2, .8, D + 1.2, whiteMat, cx, HB + H + .4, HZ);             // roof slab
  }
  hospitality(320, 60, 22, 14, '#ffb3c6');
  hospitality(400, 50, 22, 18, '#a8e6cf');
  hospitality(520, 50, 22, 14, '#b8c8ff');
  var tower = cylAt(9, 9, 36, 24, ctx.mat('#ffe9a0', { roughness: .5 }), 462, HB + 18, HZ);
  ctx.solid(tower);
  cylAt(9.15, 9.15, 22, 24, glass, 462, HB + 22, HZ, true);

  /* ---------- Beach-club pool area (south, outside the circuit) ---------- */
  var PZ = 380, PB = ctx.ground(0, PZ);
  boxAt(120, .4, 70, ctx.mat('#f1e1bd', { roughness: .9 }), 0, PB + .2, PZ);
  boxAt(64, .3, 22, ctx.mat('#2bcde0', { roughness: .2 }), 0, PB + .45, PZ - 4);
  var loungers = [];
  [356, 404].forEach(function (z) {
    for (var x = -40; x <= 40; x += 10) loungers.push(xf(x, PB + .7, z));
  });
  inst(new T.BoxGeometry(2, .5, .9), ctx.mat('#ffffff', { roughness: .6 }), loungers);
  var poles = [], canopy = [], canopyCols = [];
  [350, 410].forEach(function (z) {
    [-36, -12, 12, 36].forEach(function (x) {
      poles.push(xf(x, PB + 1.2, z));
      canopy.push(xf(x, PB + 2.9, z));
      canopyCols.push(['#ffb3c6', '#a8e6cf', '#fff1a8', '#b8c8ff'][canopy.length % 4]);
    });
  });
  inst(new T.CylinderGeometry(.1, .1, 2.4, 5), ctx.mat('#ffffff'), poles);
  inst(new T.ConeGeometry(2.6, 1.2, 8), ctx.mat('#ffffff', { roughness: .7 }), canopy, canopyCols);
  var cabBodies = [], cabRoofs = [], cabCols = [];
  [[-50, 352], [50, 352], [-50, 408], [50, 408]].forEach(function (p, i) {
    cabBodies.push(xf(p[0], PB + 1.6, p[1]));
    cabRoofs.push(xf(p[0], PB + 3.45, p[1]));
    cabCols.push(['#ffb3c6', '#a8e6cf', '#fff1a8', '#b8c8ff'][i]);
  });
  inst(new T.BoxGeometry(8, 3.2, 6), ctx.mat('#ffffff', { roughness: .6 }), cabBodies, cabCols);
  inst(new T.BoxGeometry(9.4, .5, 7.4), ctx.mat('#ffffff', { roughness: .6 }), cabRoofs);

  /* ---------- Florida Turnpike interchange beside the track (east side, elevated) ---------- */
  var HW = 820;
  var deckMat = ctx.mat('#b9b6b0', { roughness: .9 });
  boxAt(24, 1.2, 660, deckMat, HW, 10.4, 0);                  // north-south highway
  boxAt(190, 1.2, 22, deckMat, 915, 10.4, -170);             // east-west connector over it
  var LX = 960, LZ = -230, LR = 36;
  var loop = new T.Mesh(new T.TorusGeometry(LR, 2.8, 8, 40), deckMat);   // cloverleaf loop
  loop.rotation.x = Math.PI / 2;
  loop.position.set(LX, 11, LZ);
  ctx.add(loop);
  var pillars = [];
  for (var z = -320; z <= 320; z += 40) pillars.push(xf(HW, 4.9, z, 0, 0, 0, 1, 9.8, 1));
  [860, 920, 980].forEach(function (x) { pillars.push(xf(x, 4.9, -170, 0, 0, 0, 1, 9.8, 1)); });
  for (var a = 0; a < 8; a++) {
    var an = a * PI2 / 8;
    pillars.push(xf(LX + LR * Math.cos(an), 4.1, LZ + LR * Math.sin(an), 0, 0, 0, 1, 8.2, 1));
  }
  inst(new T.BoxGeometry(3, 1, 3), ctx.mat('#c9c5bd', { roughness: .9 }), pillars);

  /* ---------- Palm trees (instanced) ---------- */
  function excluded(x, z) {
    if (Math.abs(x - SX) < 165 && Math.abs(z - SZ) < 130) return true;   // stadium and plaza
    if (Math.abs(x - MX) < 72 && Math.abs(z - MZ) < 40) return true;     // marina
    if (x > 275 && x < 585 && z > -215 && z < -165) return true;         // hospitality row
    if (Math.abs(x) < 70 && z > 335 && z < 425) return true;             // beach club
    if (x > 780 && x < 1060 && Math.abs(z) < 360) return true;           // turnpike
    return false;
  }
  var palms = [], tries = 0;
  while (palms.length < 260 && tries < 60000) {
    tries++;
    var px = -980 + ctx.rand() * 2000, pz = -440 + ctx.rand() * 880;
    if (excluded(px, pz) || !ctx.clearOf(px, pz, 6)) continue;
    var spaced = true;
    for (var k = 0; k < palms.length; k++) {
      var dx = palms[k][0] - px, dz = palms[k][1] - pz;
      if (dx * dx + dz * dz < 15 * 15) { spaced = false; break; }
    }
    if (spaced) palms.push([px, pz, ctx.rand() * PI2, .85 + ctx.rand() * .4, .3 + ctx.rand() * .25]);
  }
  var trunks = [], fronds = [];
  palms.forEach(function (p) {
    var gy = ctx.ground(p[0], p[1]), sc = p[3];
    trunks.push(xf(p[0], gy + 4.75 * sc, p[1], 0, 0, 0, sc, sc, sc));
    var base = xf(p[0], gy + 9.5 * sc, p[1], 0, 0, 0, sc, sc, sc);
    for (var f = 0; f < 7; f++) {
      var ang = p[2] + f * PI2 / 7;
      fronds.push(mul(base, mul(xf(0, 0, 0, 0, ang, 0), xf(0, 0, 3.6, p[4], 0, 0))));
    }
  });
  inst(new T.CylinderGeometry(.22, .42, 9.5, 6), ctx.mat('#8c6d4f', { roughness: .9 }), trunks);
  inst(new T.BoxGeometry(.45, .08, 7.2), ctx.mat('#2f8f3c', { roughness: .7 }), fronds);
};
