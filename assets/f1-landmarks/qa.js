/* Lusail International Circuit (qa): night race, clockwise, 5.38 km.
   Start/finish at lap fraction 0; the 1,068 m main straight runs from there to Turn 1 (u .197).
   Left of the straight (the pit side): the long pit building with its canopy and control tower.
   Right: the main grandstand, with a lit screen on its front.
   Around the lap: a ring of tall lit floodlight masts, desert with dunes and gravel, artificial grass
   borders just outside the barriers, and the Lusail skyline on the horizon to the south (+z). */
window.F1Landmarks['qa'] = function (ctx) {
  var THREE = ctx.THREE, L = ctx.lengthM, rnd = ctx.rand;
  var night = !!ctx.night;

  // point on the road d metres from the line (negative = behind it)
  function along(d) { return ctx.at(d / L); }
  // local height for a group whose origin sits 0.5 m under the ground (lets a structure sink into a dip)
  function H(h) { return 0.5 + h; }
  // a group at road distance d, rotated so its local +z runs with the race and its local +x is the driver's left
  function frame(d, y0) {
    var p = along(d), g = new THREE.Group();
    g.position.set(p.x, y0, p.z);
    g.rotation.y = p.yaw;
    ctx.add(g);
    return g;
  }
  // the lowest ground under a strip from road distance d0 to d1, lateral lat0..lat1 (left is +)
  function lowestGround(d0, d1, lat0, lat1) {
    var m = 1e9;
    for (var s = 0; s <= 24; s++) {
      var p = along(d0 + (d1 - d0) * s / 24);
      for (var k = 0; k <= 2; k++) {
        var lat = lat0 + (lat1 - lat0) * k / 2;
        m = Math.min(m, ctx.ground(p.x + p.lx * lat, p.z + p.lz * lat));
      }
    }
    return m;
  }
  function box(g, w, h, len, x, y, z, mat) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }
  // a long box split into pieces of at most 30 m along the group's z (centred on the group origin)
  // matFn(pieceLength) gives each piece its material, so a repeating texture can keep its scale
  function seg(g, w, h, total, x, y, matFn) {
    var n = Math.ceil(total / 30), step = total / n;
    for (var i = 0; i < n; i++) box(g, w, h, step, x, y, -total / 2 + step * (i + .5), matFn(step));
  }
  // one InstancedMesh; items {x,y,z, sx,sy,sz, ry, c}
  function inst(g, geom, mat, items) {
    var im = new THREE.InstancedMesh(geom, mat, items.length), o = new THREE.Object3D();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      o.position.set(it.x, it.y, it.z);
      o.rotation.set(0, it.ry || 0, 0);
      o.scale.set(it.sx == null ? 1 : it.sx, it.sy == null ? 1 : it.sy, it.sz == null ? 1 : it.sz);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      if (it.c != null) im.setColorAt(i, new THREE.Color(it.c));
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    g.add(im);
    return im;
  }
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  // true for the stretch of straight that holds the pit building and grandstand (kept clear of masts)
  var p0 = along(0);
  function onStraight(x, z) {
    var dx = x - p0.x, dz = z - p0.z;
    var d = dx * p0.tx + dz * p0.tz, lat = dx * p0.lx + dz * p0.lz;
    return d > -90 && d < 230 && Math.abs(lat) < 66;
  }

  var scene = new THREE.Group();
  ctx.add(scene);

  /* ---------- the long pit building on the left of the straight (d -40 .. 200) ---------- */
  var P0 = -40, P1 = 200, PC = (P0 + P1) / 2, PL = P1 - P0;
  var pg = frame(PC, lowestGround(P0, P1, 30, 52) - 0.5);
  var garageTex = canvasTex(256, 128, function (g, w, h) {
    g.fillStyle = '#b4b1aa'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c0432f'; g.fillRect(0, 0, w, 10);
    g.fillStyle = '#8f8c86'; g.fillRect(0, 0, 12, h);
    g.fillStyle = '#2d323a'; g.fillRect(20, 26, 216, h - 26);
    g.fillStyle = '#434a55';
    for (var y = 38; y < h; y += 12) g.fillRect(20, y, 216, 2);
  });
  var officeMat = ctx.mat(0xd8d3c6), canopyMat = ctx.mat(0x5b616b), towerMat = ctx.mat(0xd8d3c6);
  // garage block, lat 34..43: one bay (12 m) per texture repeat
  seg(pg, 9, 6, PL, 38.5, H(3), function (step) {
    var t = garageTex.clone(); t.repeat.set(step / 12, 1); t.needsUpdate = true;
    return ctx.mat(0xffffff, { map: t });
  });
  seg(pg, 5, 4, PL, 38.5, H(8), function () { return officeMat; });                       // offices on top
  seg(pg, 0.25, 2.6, PL - 6, 35.8, H(8.4), function () { return ctx.basic(night ? 0xffe3a3 : 0xc9c2b0); }); // lit office windows
  seg(pg, 16, 0.7, PL, 36, H(12), function () { return canopyMat; });                    // canopy, lat 28..44
  var colItems = [];
  for (var k = 0; k < 20; k++) colItems.push({ x: 30.5, y: H(6), z: -PL / 2 + 6 + k * 12, sy: 12 });
  inst(pg, new THREE.CylinderGeometry(0.4, 0.4, 1, 8), ctx.mat(0x7a808a), colItems);     // canopy columns
  box(pg, 6, 30, 8, 49, H(15), -68, towerMat);                                           // control tower, d 12
  box(pg, 6.2, 4, 8.2, 49, H(28), -68, ctx.basic(night ? 0xfff0c8 : 0xc9c2b0));          // tower cab, lit

  /* ---------- the main grandstand on the right of the straight (d 0 .. 120) ---------- */
  var GC = 60, GL = 120;
  var sg = frame(GC, lowestGround(0, 120, -62, -32) - 0.5);
  var tierMat = ctx.mat(0xcfc6b4), roofMat = ctx.mat(0x4a4f57);
  for (var i = 0; i < 5; i++) {
    var top = 3 * (i + 1), latT = -(34 + 5 * i + 2.5);
    seg(sg, 5, top, GL, latT, H(top / 2), function () { return tierMat; });              // stepped seating tiers
  }
  var SEAT = [0xc0392b, 0x2e6fb5, 0xf1c40f, 0xf4f4f4, 0x2e8b57, 0x8e44ad];
  var crowd = [];
  for (var ti = 0; ti < 5; ti++) {
    var topC = 3 * (ti + 1), latC = -(34 + 5 * ti + 2.5);
    for (var r = -1; r <= 1; r++)
      for (var z = -GL / 2 + 1; z < GL / 2; z += 1.6)
        crowd.push({ x: latC + r * 1.6, y: H(topC) + 0.45, z: z, c: SEAT[Math.floor(rnd() * SEAT.length)] });
  }
  inst(sg, new THREE.BoxGeometry(0.5, 0.9, 0.4), ctx.mat(0xffffff), crowd);
  seg(sg, 26, 0.8, GL, -47, H(19), function () { return roofMat; });                     // cantilever roof
  var stCols = [];
  for (var c2 = -54; c2 <= 54; c2 += 18) stCols.push({ x: -60.5, y: H(9.5), z: c2, sy: 19 });
  inst(sg, new THREE.CylinderGeometry(0.4, 0.4, 1, 8), roofMat, stCols);                 // roof columns, behind the tiers
  var boardTex = canvasTex(512, 40, function (g, w, h) {
    g.fillStyle = '#0b0d10'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd24a'; g.font = 'bold 30px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('LUSAIL', w / 2, h / 2 + 1);
  });
  var board = new THREE.Mesh(new THREE.PlaneGeometry(24, 4.2), ctx.basic(0xffffff, { map: boardTex, side: THREE.DoubleSide }));
  board.position.set(-33.6, H(5), 0);
  board.rotation.y = Math.PI / 2;                                                        // faces the track
  sg.add(board);

  /* ---------- floodlight masts: a ring of tall lit masts 48..128 m off the road ---------- */
  var masts = [];
  for (var mi = 0; mi < 56; mi++) {
    for (var mt = 0; mt < 14; mt++) {
      var mp = ctx.at((mi + rnd()) / 56), side = rnd() < .5 ? -1 : 1, off = 48 + rnd() * 80;
      var mx = mp.x + mp.lx * side * off, mz = mp.z + mp.lz * side * off;
      if (onStraight(mx, mz) || !ctx.clearOf(mx, mz, 3)) continue;
      masts.push({ x: mx, y: ctx.ground(mx, mz), z: mz, h: 44 + rnd() * 14, ry: Math.atan2(mp.x - mx, mp.z - mz) });
      break;
    }
  }
  var lamps = [];
  masts.forEach(function (m) {
    lamps.push({ x: m.x, y: m.y + m.h - 0.6, z: m.z, ry: m.ry });
    lamps.push({ x: m.x, y: m.y + m.h - 4.6, z: m.z, ry: m.ry });
  });
  inst(scene, new THREE.CylinderGeometry(0.35, 0.9, 1, 8), ctx.mat(0xc3c7cd, { metalness: .2, roughness: .6 }),
    masts.map(function (m) { return { x: m.x, y: m.y + m.h / 2, z: m.z, sy: m.h }; }));
  inst(scene, new THREE.BoxGeometry(4.2, 1.4, 1.4), ctx.basic(night ? 0xfff1c4 : 0xbfbfb8), lamps);

  /* ---------- the desert: low dunes and gravel fields, well clear of the road ---------- */
  var dunes = [], gravel = [];
  for (var di = 0; di < 400 && dunes.length < 16; di++) {
    var dx0 = -1000 + rnd() * 2000, dz0 = -900 + rnd() * 1700;
    var rx = 40 + rnd() * 70, rz = 30 + rnd() * 50, ry = 4 + rnd() * 7;
    if (onStraight(dx0, dz0) || !ctx.clearOf(dx0, dz0, Math.sqrt(rx * rx + rz * rz) + 3)) continue;
    dunes.push({ x: dx0, y: ctx.ground(dx0, dz0) - ry * 0.2, z: dz0, sx: rx, sy: ry, sz: rz, ry: 0 });
  }
  inst(scene, new THREE.SphereGeometry(1, 12, 6), ctx.mat(0xd9b888, { flatShading: true }), dunes);
  for (var gi = 0; gi < 400 && gravel.length < 14; gi++) {
    var gx = -1000 + rnd() * 2000, gz = -900 + rnd() * 1700, gr = 25 + rnd() * 45;
    if (onStraight(gx, gz) || !ctx.clearOf(gx, gz, gr * 1.42 + 3)) continue;
    gravel.push({ x: gx, y: ctx.ground(gx, gz) + 0.08, z: gz, sx: gr, sy: 1, sz: gr });
  }
  inst(scene, new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), ctx.mat(0x8d7b61, { roughness: 1 }), gravel);

  /* ---------- artificial grass borders just outside the barrier line, both sides ---------- */
  var NG = Math.round(L / 4.2), grass = [];
  for (var gk = 0; gk < NG; gk++) {
    var u = (gk + .5) / NG, gp = ctx.at(u), gd = (u > .5 ? u - 1 : u) * L;
    for (var s = -1; s <= 1; s += 2) {
      if (s === 1 && gd > -200 && gd < 130) continue;      // left side of the straight is the pit lane and building
      var glat = s * 19.5, grx = gp.x + gp.lx * glat, grz = gp.z + gp.lz * glat;
      grass.push({ x: grx, y: ctx.ground(grx, grz) + 0.1, z: grz, ry: gp.yaw });
    }
  }
  inst(scene, new THREE.BoxGeometry(3, 0.2, 4.6), ctx.mat(0x3f9a4a, { roughness: .95 }), grass);

  /* ---------- the Lusail skyline on the horizon to the south: modern towers with lit windows ---------- */
  var skyTex = canvasTex(256, 256, function (g, w, h) {
    g.fillStyle = '#16202e'; g.fillRect(0, 0, w, h);
    for (var wy = 0; wy < 8; wy++) for (var wx = 0; wx < 8; wx++) {
      var lit = rnd() < .45;
      g.fillStyle = lit ? (rnd() < .6 ? '#ffd58a' : '#fff3d6') : '#22324a';
      g.fillRect(wx * 32 + 5, wy * 32 + 6, 22, 20);
    }
  });
  for (var q = 0; q < 22; q++) {
    var tw = 20 + rnd() * 18, td = 18 + rnd() * 14, th = (q % 6 === 0) ? 200 + rnd() * 60 : 70 + rnd() * 130;
    var stx = -760 + (q + .5) * (1520 / 22) + (rnd() - .5) * 30, stz = 1150 + (rnd() - .5) * 160;
    var tex = skyTex.clone();
    tex.repeat.set(tw / 27, th / 27);
    tex.needsUpdate = true;
    var tower = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), ctx.basic(0xffffff, { map: tex }));
    tower.position.set(stx, ctx.ground(stx, stz) + th / 2, stz);
    scene.add(tower);
  }
};
