/* Bahrain International Circuit, Sakhir (night race): scenery for the F1 circuit id "bh".
   Start/finish at lap fraction 0; the straight runs to Turn 1 at 0.201. The outside of the straight is its left side.
   Sakhir Tower beside the straight, main grandstand and pit building on the outside of the straight, floodlight masts
   round the lap, sand dunes and rocks in the desert, a few date palms behind the pit building. */
window.F1Landmarks['bh'] = function (ctx) {
  var T = ctx.THREE, L = ctx.lengthM, TAU = Math.PI * 2, night = ctx.night;
  var i, q, c, g;

  // middle of the lap and the extent of the circuit (metres), used for "which side is outside" and for scattering scenery
  var cx = 0, cz = 0, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, K0 = 400;
  for (i = 0; i < K0; i++) {
    q = ctx.at(i / K0); cx += q.x; cz += q.z;
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z);
  }
  cx /= K0; cz /= K0;
  x0 -= 250; x1 += 250; z0 -= 250; z1 += 250;

  // a point on the road at lap fraction u, `lat` metres to the left (negative = right), `s` metres further along
  function spot(u, lat, s) {
    var p = ctx.at(u); s = s || 0;
    return { x: p.x + p.lx * lat + p.tx * s, z: p.z + p.lz * lat + p.tz * s, yaw: p.yaw };
  }
  // +1 when the outside of the track is on the left at u, -1 when it is on the right
  function outside(u) {
    var p = ctx.at(u);
    return (p.lx * (cx - p.x) + p.lz * (cz - p.z)) > 0 ? -1 : 1;
  }
  // a point near the pit building, tower and palms, where the scenery is kept clear of desert rocks and dunes
  var zone = spot(0.08, 50, 0);
  function nearZone(x, z, d) { return Math.hypot(x - zone.x, z - zone.z) < d; }

  // one InstancedMesh from a list of {x, y, z, yaw, rx, sx, sy, sz}; geo is a unit-size geometry
  function many(geo, mat, list) {
    if (!list.length) return null;
    var im = new T.InstancedMesh(geo, mat, list.length), m4 = new T.Matrix4(), qu = new T.Quaternion(), e = new T.Euler(),
      p = new T.Vector3(), s = new T.Vector3();
    list.forEach(function (it, n) {
      e.set(it.rx || 0, it.yaw || 0, 0, 'YXZ'); qu.setFromEuler(e);
      p.set(it.x, it.y, it.z); s.set(it.sx || 1, it.sy || 1, it.sz || 1);
      m4.compose(p, qu, s); im.setMatrixAt(n, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    ctx.add(im);
    return im;
  }
  // a box lying along the road from lap fraction u for len metres: lateral span [a, b] (left is +), y0..y1 above the
  // ground. It is cut into pieces of at most 40 m, each turned to the road where it stands, so it follows the bends.
  function slab(u, a, b, y0, y1, len, mat) {
    var n = Math.ceil(len / 40), seg = len / n, out = [];
    for (var k = 0; k < n; k++) {
      var s = -len / 2 + (k + 0.5) * seg;
      var sp = spot(u + s / L, (a + b) / 2, 0), gy = ctx.ground(sp.x, sp.z);
      var m = new T.Mesh(new T.BoxGeometry(b - a, y1 - y0, seg), mat);
      m.position.set(sp.x, gy + (y0 + y1) / 2, sp.z);
      m.rotation.y = sp.yaw;
      ctx.add(m);
      out.push(m);
    }
    return out;
  }

  // materials
  var wall = ctx.mat(0xeee6d6, { flatShading: true }),
    sandStone = ctx.mat(0xe6d8b8, { flatShading: true }),
    dark = ctx.mat(0x3b3f45, { flatShading: true }),
    steel = ctx.mat(0x9aa0a6, { flatShading: true }),
    concrete = ctx.mat(0xb9b2a4, { flatShading: true }),
    seatRed = ctx.mat(0xc8102e, { flatShading: true }),
    seatWhite = ctx.mat(0xe9e4d8, { flatShading: true }),
    seatBlue = ctx.mat(0x2d4f7c, { flatShading: true }),
    tent = ctx.mat(0xd9c49a, { flatShading: true }),
    dune = ctx.mat(0xd9b77a, { flatShading: true }),
    rockA = ctx.mat(0x8c7258, { flatShading: true }),
    rockB = ctx.mat(0xa58b6a, { flatShading: true }),
    trunk = ctx.mat(0x8a6a45, { flatShading: true }),
    frond = ctx.mat(0x3d7a3a, { flatShading: true }),
    glass = ctx.basic(night ? 0xffd27a : 0x7fa8c4),
    lampLit = ctx.basic(0xfff1cc),
    redLight = ctx.basic(0xff3b30);

  /* ---------- main grandstand: six stepped seating tiers and a roof on columns, outside the start/finish line ---------- */
  var uGS = 75 / L, GSLEN = 110, seats = [seatRed, seatWhite, seatBlue, seatRed, seatWhite, seatBlue];
  for (i = 0; i < 6; i++) slab(uGS, 21 + 2 * i, 36, -1, 1.2 + 1.4 * i, GSLEN, seats[i]);
  slab(uGS, 19, 40, 13, 13.8, GSLEN, dark);
  var cols = [];
  for (i = 0; i < 10; i++) {
    c = spot(uGS, 39, -GSLEN / 2 + i * GSLEN / 9); g = ctx.ground(c.x, c.z);
    cols.push({ x: c.x, y: g + 6, z: c.z, yaw: c.yaw, sx: 1, sy: 14, sz: 1 });
  }
  many(new T.BoxGeometry(0.8, 1, 0.8), concrete, cols);

  /* ---------- pit building: garage block with a two-level hospitality block on top, outside the straight ---------- */
  var uPit = 285 / L;
  slab(uPit, 19, 31, 0, 6, 270, wall).forEach(function (m) { ctx.solid(m); });
  slab(uPit, 23, 31, 6, 10, 240, wall);
  slab(uPit, 22.4, 23, 6.6, 9.2, 230, glass);
  slab(uPit, 22, 32, 10, 10.6, 240, dark);

  /* ---------- Sakhir Tower: eight storeys with a tent-shaped roof, beside the straight on the outside ---------- */
  var uT = 760 / L, TX = 62, stor = [], bands = [];
  var cT = spot(uT, TX, 0), gT = ctx.ground(cT.x, cT.z);
  for (i = 0; i < 8; i++) {
    var W = 36 - 1.2 * i, yc = gT + 1 + 3.2 * i + 1.5;
    stor.push({ x: cT.x, y: yc, z: cT.z, yaw: cT.yaw, sx: W, sy: 3, sz: 18 });
    [-1, 1].forEach(function (sg) {
      var b = spot(uT, TX + sg * (W / 2 + 0.12), 0);
      bands.push({ x: b.x, y: yc, z: b.z, yaw: b.yaw, sx: 0.25, sy: 1.9, sz: 16 });
    });
  }
  many(new T.BoxGeometry(1, 1, 1), sandStone, stor);
  many(new T.BoxGeometry(1, 1, 1), glass, bands);
  var sail = new T.Shape();
  sail.moveTo(-19, 0); sail.lineTo(19, 0); sail.lineTo(0, 8); sail.closePath();
  var roofG = new T.ExtrudeGeometry(sail, { depth: 18, bevelEnabled: false });
  roofG.translate(0, 0, -9);
  var roof = new T.Mesh(roofG, tent);
  roof.position.set(cT.x, gT + 26.6, cT.z); roof.rotation.y = cT.yaw; ctx.add(roof);
  var ant = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 6, 5), steel);
  ant.position.set(cT.x, gT + 37.6, cT.z); ctx.add(ant);
  var tip = new T.Mesh(new T.BoxGeometry(0.5, 0.5, 0.5), redLight);
  tip.position.set(cT.x, gT + 40.85, cT.z); ctx.add(tip);

  /* ---------- floodlight masts round the lap (instanced), lit heads turned to the track ---------- */
  var masts = [], frames = [], lamps = [], K = 28;
  for (i = 0; i < K; i++) {
    var u = i / K, side = u < 0.2 ? -outside(u) : outside(u), spotF = null, j;   // on the straight the masts stand inside
    for (j = 0; j < 3 && !spotF; j++) {
      var f = spot(u, side * (40 + 6 * j), 0);
      if (ctx.clearOf(f.x, f.z, 1.5)) spotF = f;
    }
    if (!spotF) continue;
    var gF = ctx.ground(spotF.x, spotF.z), th = spotF.yaw - side * Math.PI / 2;
    var dxF = Math.sin(th), dzF = Math.cos(th);
    masts.push({ x: spotF.x, y: gF + 14, z: spotF.z, sx: 1, sy: 28, sz: 1 });
    frames.push({ x: spotF.x, y: gF + 28.6, z: spotF.z, yaw: th });
    lamps.push({ x: spotF.x + dxF * 0.3, y: gF + 28.6, z: spotF.z + dzF * 0.3, yaw: th });
  }
  many(new T.CylinderGeometry(0.3, 0.55, 1, 6, 1, true), steel, masts);
  many(new T.BoxGeometry(3.8, 2, 0.3), steel, frames);
  many(new T.BoxGeometry(3.4, 1.6, 0.5), lampLit, lamps);

  /* ---------- a few date palms behind the pit building (the paddock side) ---------- */
  var trunks = [], fronds = [];
  for (i = 0; i < 8; i++) {
    var up = 0.033 + i * 0.004, sp = spot(up, outside(up) * (52 + ctx.rand() * 10), 0);
    var gp = ctx.ground(sp.x, sp.z);
    trunks.push({ x: sp.x, y: gp + 4.5, z: sp.z, sx: 1, sy: 9, sz: 1 });
    for (var k = 0; k < 6; k++) {
      fronds.push({ x: sp.x, y: gp + 9, z: sp.z, yaw: k * TAU / 6 + ctx.rand() * 0.5, rx: 0.7 + ctx.rand() * 0.2 });
    }
  }
  many(new T.CylinderGeometry(0.3, 0.42, 1, 6), trunk, trunks);
  var frondGeo = new T.BoxGeometry(0.5, 0.12, 6);
  frondGeo.translate(0, 0, 3);
  many(frondGeo, frond, fronds);

  /* ---------- desert: dunes and rock outcrops well clear of the track (checked against ctx.trackDist) ---------- */
  var duneL = [], t = 0;
  while (duneL.length < 14 && t++ < 4000) {
    var dx = x0 + ctx.rand() * (x1 - x0), dz = z0 + ctx.rand() * (z1 - z0);
    // R bounds the dune's box on the ground: any corner of its turned box is within sx + sz of the centre
    var sx = 60 + ctx.rand() * 90, sz = 40 + ctx.rand() * 70, sy = 8 + ctx.rand() * 14, R = sx + sz;
    if (nearZone(dx, dz, 300 + R) || ctx.trackDist(dx, dz) < R + ctx.clear + 6) continue;
    duneL.push({ x: dx, y: ctx.ground(dx, dz) - sy * 0.35, z: dz, yaw: ctx.rand() * TAU, sx: sx, sy: sy, sz: sz });
  }
  many(new T.SphereGeometry(1, 12, 8), dune, duneL);

  var rkA = [], rkB = [];
  t = 0;
  while (rkA.length + rkB.length < 60 && t++ < 6000) {
    var rx = x0 + ctx.rand() * (x1 - x0), rz = z0 + ctx.rand() * (z1 - z0), r = 2 + ctx.rand() * 4.5;
    if (nearZone(rx, rz, 300)) continue;
    var td = ctx.trackDist(rx, rz);
    if (td > 150 || td < 2.2 * r + ctx.clear + 3) continue;   // 2.2 r bounds the rock's box (sx + sz)
    (rkA.length <= rkB.length ? rkA : rkB).push({ x: rx, y: ctx.ground(rx, rz) + r * 0.25, z: rz, yaw: ctx.rand() * TAU, sx: r * 1.2, sy: r * 0.8, sz: r });
  }
  many(new T.DodecahedronGeometry(1, 0), rockA, rkA);
  many(new T.DodecahedronGeometry(1, 0), rockB, rkB);
};
