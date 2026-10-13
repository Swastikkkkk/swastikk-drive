/* Monaco (Circuit de Monaco): Monte Carlo landmarks around the real street course.
   Lap fractions: Sainte Devote .03, Casino Square .27, Mirabeau .333, Grand Hotel Hairpin .39, Portier .47,
   Nouvelle Chicane .60, Tabac .66, Piscine .84, La Rascasse .944, Antony Noghes .983. */
window.F1Landmarks = window.F1Landmarks || {};
window.F1Landmarks['mc'] = function (ctx) {
  var T = ctx.THREE;

  /* a point `dist` m to the left (+1) or right (-1) of the road at lap fraction u, pushed further out
     until its circle of radius r clears the track. Returns the point, the road frame and the ground height. */
  function spot(u, side, dist, r) {
    var p = ctx.at(u), x, z, d = dist, tries = 0;
    do {
      x = p.x + p.lx * side * d; z = p.z + p.lz * side * d;
      d += 1; tries++;
    } while (!ctx.clearOf(x, z, r) && tries < 80);
    return { x: x, z: z, y: ctx.ground(x, z), p: p, yaw: p.yaw };
  }
  function box(w, h, d, color, opts) { return new T.Mesh(new T.BoxGeometry(w, h, d), ctx.mat(color, opts)); }
  function put(m, x, y, z, yaw) { m.position.set(x, y, z); if (yaw) m.rotation.y = yaw; ctx.add(m); return m; }

  /* ---- Rocher de Monaco (Monaco-Ville): stepped rock with the Prince's Palace on top, south-west of the circuit ---- */
  (function rock() {
    var cx = -130, cz = 200, base = ctx.ground(cx, cz);
    var rockMat = ctx.mat(0x8c8068, { roughness: 1 });
    [[72, 58, 0], [63, 22, 58], [54, 10, 80]].forEach(function (s) {
      var m = new T.Mesh(new T.CylinderGeometry(s[0], s[0] * 1.08, s[1], 9, 1), rockMat);
      m.position.set(cx, base + s[2] + s[1] / 2, cz); ctx.add(m);
    });
    var pal = 0xd9c48a, roof = 0xb0412e, py = base + 80;
    put(box(64, 14, 22, pal), cx - 4, py + 7, cz - 4);
    put(box(16, 22, 16, pal), cx - 36, py + 11, cz - 4);
    put(box(16, 22, 16, pal), cx + 28, py + 11, cz - 4);
    put(box(72, 2, 26, roof), cx - 4, py + 15, cz - 4);
    put(new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 14, 5), ctx.mat(0xdddddd)), cx - 36, py + 33, cz - 4);
    var flag = new T.Mesh(new T.BoxGeometry(6, 3.5, 0.3), ctx.basic(0xc8102e));
    flag.position.set(cx - 33, py + 38, cz - 4); ctx.add(flag);
  })();

  /* ---- Sainte-Devote chapel beside Turn 1: white nave, red roof, bell tower ---- */
  (function chapel() {
    var s = spot(0.03, -1, 14, 12), y = s.y, yaw = s.yaw;
    put(box(9, 7, 12, 0xf1ece0), s.x, y + 3.5, s.z, yaw);
    var roofM = new T.Mesh(new T.ConeGeometry(7.5, 5, 4), ctx.mat(0xa35a3a));
    roofM.rotation.y = Math.PI / 4 + yaw; roofM.position.set(s.x, y + 9.5, s.z); ctx.add(roofM);
    var tx = s.p.tx * 7, tz = s.p.tz * 7;
    put(box(3.5, 14, 3.5, 0xf1ece0), s.x + tx, y + 7, s.z + tz, yaw);
    var spire = new T.Mesh(new T.ConeGeometry(2.4, 6, 4), ctx.mat(0xa35a3a));
    spire.position.set(s.x + tx, y + 17, s.z + tz); ctx.add(spire);
  })();

  /* ---- Monte Carlo Casino: Belle Epoque facade, two towers, copper-green roofs, on Casino Square ---- */
  (function casino() {
    var s = spot(0.27, -1, 40, 62), y = s.y, yaw = s.yaw, p = s.p;
    var stone = 0xe8dcc0, green = 0x5f8f7a;
    put(box(26, 16, 70, stone), s.x, y + 8, s.z, yaw);                  // main block, long axis along the road
    put(box(20, 6, 40, stone), s.x, y + 19, s.z, yaw);                  // attic storey
    var dome = new T.Mesh(new T.CylinderGeometry(9, 12, 8, 4), ctx.mat(green));
    dome.rotation.y = Math.PI / 4 + yaw; dome.position.set(s.x, y + 26, s.z); ctx.add(dome);
    [-30, 30].forEach(function (o) {
      var ox = p.tx * o, oz = p.tz * o;
      put(box(11, 38, 11, stone), s.x + ox, y + 19, s.z + oz, yaw);      // corner towers
      var cap = new T.Mesh(new T.ConeGeometry(8, 14, 6), ctx.mat(green));
      cap.position.set(s.x + ox, y + 45, s.z + oz); ctx.add(cap);
    });
  })();

  /* ---- Hotel de Paris: cream Belle Epoque hotel beside the Casino, red roof ---- */
  (function hotelDeParis() {
    var s = spot(0.27, -1, 72, 34), y = s.y, yaw = s.yaw;
    put(box(24, 26, 46, 0xf1e7c6), s.x, y + 13, s.z, yaw);
    put(box(26, 3, 48, 0xb0412e), s.x, y + 27.5, s.z, yaw);
  })();

  /* ---- Fairmont: a tall hotel block on the hill north of the tunnel entrance, with a wing carried over the road
     at least 8 m above it (the game builds the tunnel roof up to ~7.4 m above the road) ---- */
  (function fairmont() {
    var w = ctx.at(0.5);
    var wingY = w.y + 8 + 8;                         // underside 8 m above the road, 16 m deep
    put(box(38, 16, 40, 0xdcd3c0), w.x, wingY, w.z, w.yaw);
    var t = spot(0.485, 1, 46, 24), y = t.y;
    put(box(30, 72, 30, 0xdcd3c0), t.x, y + 36, t.z, t.yaw);
    for (var k = 0; k < 6; k++) put(box(31, 0.8, 31, 0x8fa3b0), t.x, y + 12 + k * 11, t.z, t.yaw);
  })();

  /* ---- Rainier III swimming pool beside the Piscine chicane: white surround, blue water ---- */
  (function pool() {
    var s = spot(0.84, 1, 30, 48), y = s.y, yaw = s.yaw;
    put(box(26, 1, 52, 0xf4f4f0), s.x, y + 0.5, s.z, yaw);
    put(box(20, 0.4, 46, 0x2aa7c9, { roughness: 0.3 }), s.x, y + 1.1, s.z, yaw);
  })();

  /* ---- La Rascasse restaurant on the corner of the same name: low building with a yellow sign ---- */
  (function rascasse() {
    var s = spot(0.944, 1, 20, 16), y = s.y, yaw = s.yaw;
    put(box(14, 8, 18, 0xe9dcc4), s.x, y + 4, s.z, yaw);
    var sign = new T.Mesh(new T.BoxGeometry(10, 2.4, 0.3), ctx.basic(0xf2c230));
    sign.position.set(s.x + s.p.tx * 0, y + 9.2, s.z + s.p.tz * 0); sign.rotation.y = yaw; ctx.add(sign);
  })();

  /* ---- Harbour (Port Hercule) and the sea south of the Tabac-Piscine-Rascasse section: water tiles that stop at the
     track, so nothing reaches under the road ---- */
  var dummy = new T.Object3D();
  (function water() {
    var TILE = 12, tiles = [];
    for (var x = 40; x <= 420; x += TILE) for (var z = -60; z <= 540; z += TILE) {
      if (ctx.clearOf(x, z, 9)) tiles.push([x, z]);
    }
    var m = new T.InstancedMesh(new T.BoxGeometry(TILE, 0.2, TILE), ctx.mat(0x2b7fa0, { roughness: 0.35 }), tiles.length);
    tiles.forEach(function (t, i) {
      var g = ctx.ground(t[0], t[1]);
      dummy.position.set(t[0], g + 0.15, t[1]); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true; ctx.add(m);
  })();

  /* ---- Yachts moored in the harbour: a hull and a cabin per boat, varied length and colour ---- */
  (function yachts() {
    var placed = [], colours = [0xffffff, 0xf3efe6, 0x1d2b3a, 0xc9d4de];
    var tries = 0;
    while (placed.length < 34 && tries < 4000) {
      tries++;
      var L = 12 + ctx.rand() * 30, x = 60 + ctx.rand() * 280, z = -30 + ctx.rand() * 170;
      if (!ctx.clearOf(x, z, L / 2 + 3)) continue;
      var ok = placed.every(function (q) { return Math.hypot(q.x - x, q.z - z) > (q.L + L) / 2 + 4; });
      if (!ok) continue;
      placed.push({ x: x, z: z, L: L, yaw: ctx.rand() * Math.PI * 2, c: colours[(ctx.rand() * colours.length) | 0] });
    }
    var hullG = new T.BoxGeometry(1, 1, 1);
    var hm = new T.InstancedMesh(hullG, ctx.mat(0xffffff), placed.length);
    var cm = new T.InstancedMesh(hullG, ctx.mat(0xffffff), placed.length);
    placed.forEach(function (q, i) {
      var g = ctx.ground(q.x, q.z);
      dummy.position.set(q.x, g + 1.2, q.z); dummy.rotation.set(0, q.yaw, 0); dummy.scale.set(5, 2.4, q.L);
      dummy.updateMatrix(); hm.setMatrixAt(i, dummy.matrix); hm.setColorAt(i, new T.Color(0xffffff));
      dummy.position.set(q.x, g + 3.5, q.z); dummy.scale.set(3.4, 2, q.L * 0.55);
      dummy.updateMatrix(); cm.setMatrixAt(i, dummy.matrix); cm.setColorAt(i, new T.Color(q.c));
    });
    hm.instanceMatrix.needsUpdate = true; cm.instanceMatrix.needsUpdate = true;
    if (hm.instanceColor) hm.instanceColor.needsUpdate = true;
    if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
    ctx.add(hm); ctx.add(cm);
  })();

  /* ---- Hillside apartment blocks climbing the slopes off the track (terraced: instanced boxes, varied heights) ---- */
  (function apartments() {
    var sites = [], x, z;
    for (x = -428; x <= -346; x += 18) for (z = 110; z <= 380; z += 18) sites.push([x, z]);     // west of Mirabeau
    for (x = -420; x <= -300; x += 18) for (z = -200; z <= -60; z += 18) sites.push([x, z]);    // north of the hairpin
    var blocks = sites.filter(function (s) { return ctx.clearOf(s[0], s[1], 10); });
    var m = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), ctx.mat(0xffffff, { roughness: 0.9 }), blocks.length);
    var pastel = [0xf1e3c8, 0xe8d3b0, 0xd9c9a8, 0xf4ece0, 0xcbb994, 0xe2cfa6];
    blocks.forEach(function (s, i) {
      var w = 12 + ctx.rand() * 6, d = 10 + ctx.rand() * 6, h = 10 + ctx.rand() * 30, g = ctx.ground(s[0], s[1]);
      dummy.position.set(s[0], g + h / 2, s[1]); dummy.rotation.set(0, 0, 0); dummy.scale.set(w, h, d);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, new T.Color(pastel[(ctx.rand() * pastel.length) | 0]));
    });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    ctx.add(m);
  })();
};
