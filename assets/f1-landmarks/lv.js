window.F1Landmarks = window.F1Landmarks || {};
window.F1Landmarks['lv'] = function (ctx) {
  var THREE = ctx.THREE;
  var rnd = ctx.rand;

  // ---------- canvas helpers (emissive textures) ----------
  function canvasTex(w, h, draw) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var g = cv.getContext('2d');
    draw(g, w, h);
    var t = new THREE.CanvasTexture(cv);
    return t;
  }

  // ---------- the Sphere (112 m tall, 157 m wide), beside Turns 7-9 ----------
  // Turn 9 sits at lap .363 on the west leg. The Sphere stands on the inside (east) of that leg.
  var sphereTex = canvasTex(512, 256, function (g, w, h) {
    var grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ffb8e8');
    grd.addColorStop(0.5, '#7fe8ff');
    grd.addColorStop(1, '#ffe27a');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // giant eye: white sclera, cyan iris, dark pupil, lash strokes
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.36, h * 0.30, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a6fb0';
    g.beginPath(); g.arc(w / 2, h / 2, h * 0.22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#081426';
    g.beginPath(); g.arc(w / 2, h / 2, h * 0.09, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(w / 2 + h * 0.07, h / 2 - h * 0.07, h * 0.03, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2b1640'; g.lineWidth = 6;
    for (var i = 0; i < 14; i++) {
      var a = Math.PI + i * (Math.PI / 13);
      var x0 = w / 2 + Math.cos(a) * w * 0.36, y0 = h / 2 + Math.sin(a) * h * 0.30;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * 26, y0 + Math.sin(a) * 26); g.stroke();
    }
  });
  sphereTex.wrapS = THREE.RepeatWrapping;
  sphereTex.repeat.set(2, 1);

  // the Sphere is a sphere on a short plinth; its emissive look comes from a MeshBasic (unlit) material
  var sphereR = 78.5;               // 157 m wide
  var sphereCentre = ctx.at(0.363);  // Turn 9 point on the road
  // walk from Turn 9 toward the inside of the loop (the driver's left, +lx: the leg heads south, so left is east)
  // until a circle of the Sphere's radius clears every part of the track
  var cxS = sphereCentre.x, czS = sphereCentre.z;
  // 112 m corner-safe radius: the Sphere's footprint is a 157 m square, so its corners must clear too
  for (var s = 0; s < 800; s++) {
    var tx = sphereCentre.x + sphereCentre.lx * s * 0.5;
    var tz = sphereCentre.z + sphereCentre.lz * s * 0.5;
    if (ctx.clearOf(tx, tz, 112)) { cxS = tx; czS = tz; break; }
  }
  var baseY = ctx.ground(cxS, czS);
  // ellipsoid: 157 m wide, 112 m tall, bottom on the ground
  var sphereMesh = new THREE.Mesh(
    new THREE.SphereGeometry(sphereR, 40, 28),
    ctx.basic(0xffffff, { map: sphereTex })
  );
  sphereMesh.name = 'lv-sphere';
  sphereMesh.scale.set(1, 112 / 157, 1);
  sphereMesh.position.set(cxS, baseY + 56, czS);
  ctx.add(sphereMesh);

  // plinth / base ring at ground level
  var plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(sphereR * 0.55, sphereR * 0.7, 14, 24),
    ctx.mat(0x6d7178)
  );
  plinth.position.set(cxS, baseY + 7, czS);
  plinth.name = 'lv-sphere-plinth';
  ctx.add(plinth);

  // soft glow ring around the Sphere base (emissive)
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(sphereR * 0.72, 2.2, 6, 48),
    ctx.basic(0x8ff0ff)
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(cxS, baseY + 16, czS);
  ring.name = 'lv-sphere-ring';
  ctx.add(ring);

  // ---------- casino resorts on the west side of the Strip leg (lap .44 - .56) ----------
  // place(): off metres to the RIGHT of the driver (west on this leg), box w across the road, d along it.
  // The ctx.clearOf test uses the box's half-diagonal, so a building can never sit on the road.
  function winTex(base, litCols, cells, density) {
    return canvasTex(256, 256, function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      var cw = w / cells, ch = h / cells;
      for (var i = 0; i < cells; i++) {
        for (var j = 0; j < cells; j++) {
          if (rnd() < density) {
            g.fillStyle = litCols[Math.floor(rnd() * litCols.length)];
            g.fillRect(i * cw + cw * 0.22, j * ch + ch * 0.25, cw * 0.56, ch * 0.5);
          }
        }
      }
    });
  }
  function facade(tex, rx, ry) {
    var t = tex.clone();
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry); t.needsUpdate = true;
    return ctx.basic(0xffffff, { map: t });
  }
  var TEX_GLASS = winTex('#0c1a33', ['#ffe3a0', '#fff1c8', '#9fe6ff', '#ff9fd0'], 16, 0.55);
  var TEX_WARM = winTex('#2a1d14', ['#ffd77a', '#ffb347', '#fff0c0'], 12, 0.6);
  var TEX_SAND = winTex('#d9c9a3', ['#ffe9a8', '#ffd27a'], 14, 0.45);

  function sideOffset(p, off, sgn) { return { x: p.x + p.lx * off * sgn, z: p.z + p.lz * off * sgn }; }

  // true if every sampled point of the rotated w x d footprint stays clear of the track
  function footprintClear(cx, cz, w, d, yaw) {
    var c = Math.cos(yaw), s = Math.sin(yaw);
    for (var i = 0; i <= 6; i++) {
      for (var j = 0; j <= 6; j++) {
        var lx = -w / 2 + w * i / 6, lz = -d / 2 + d * j / 6;
        var px = cx + lx * c + lz * s, pz = cz - lx * s + lz * c;
        if (ctx.trackDist(px, pz) < ctx.clear + 0.5) { return false; }
      }
    }
    return true;
  }

  function place(u, off, w, d, h, mat, sgn, name) {
    var p = ctx.at(u);
    var s = sideOffset(p, off, sgn === undefined ? -1 : sgn);
    if (!footprintClear(s.x, s.z, w, d, p.yaw)) { return null; }
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(s.x, ctx.ground(s.x, s.z) + h / 2, s.z);
    m.rotation.y = p.yaw;
    m.name = name || 'lv-building';
    ctx.add(m);
    return m;
  }

  // Bellagio: low wide hotel, fountain lake on the road side
  place(0.440, 94, 120, 180, 58, facade(TEX_GLASS, 9, 4), -1, 'lv-bellagio');
  // fountain lake: a flat blue slab between the hotel and the track, with a few water jets
  var bp = ctx.at(0.440);
  var lakeS = sideOffset(bp, 24, -1);
  var lake = new THREE.Mesh(new THREE.BoxGeometry(20, 0.4, 120), ctx.basic(0x2fb8e8));
  lake.position.set(lakeS.x, ctx.ground(lakeS.x, lakeS.z) + 0.2, lakeS.z);
  lake.rotation.y = bp.yaw;
  lake.name = 'lv-bellagio-lake';
  ctx.add(lake);
  var jet = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 24, 6), ctx.basic(0xe8fbff));
  jet.position.set(lakeS.x, 12, lakeS.z);
  jet.name = 'lv-bellagio-jet';
  ctx.add(jet);

  // Caesars Palace: pale stone tower with gold-lit windows
  place(0.475, 110, 150, 160, 112, facade(TEX_SAND, 8, 16), -1, 'lv-caesars');

  // Paris Las Vegas: casino block plus a half-size Eiffel Tower in front
  place(0.495, 110, 120, 120, 40, facade(TEX_WARM, 6, 3), -1, 'lv-paris-block');
  var pp = ctx.at(0.495);
  var eiS = sideOffset(pp, 62, -1);
  if (ctx.clearOf(eiS.x, eiS.z, 10)) {
    var eiffel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 9, 50, 4, 1, false), ctx.basic(0xf2c46a));
    eiffel.position.set(eiS.x, ctx.ground(eiS.x, eiS.z) + 25, eiS.z);
    eiffel.rotation.y = Math.PI / 4;
    eiffel.name = 'lv-paris-eiffel';
    ctx.add(eiffel);
  }

  // Venetian: big resort block with a campanile on the roof
  var venBlock = place(0.520, 125, 200, 210, 80, facade(TEX_WARM, 10, 6), -1, 'lv-venetian');
  if (venBlock) {
    var vp = ctx.at(0.520);
    var vS = sideOffset(vp, 125, -1);
    var camp = new THREE.Mesh(new THREE.CylinderGeometry(7, 8.5, 75, 12), ctx.basic(0xf7e6c4));
    camp.position.set(vS.x, 80 + 37.5, vS.z);
    camp.name = 'lv-venetian-campanile';
    ctx.add(camp);
  }

  // Cosmopolitan: tall slim tower with glass
  place(0.545, 95, 110, 110, 135, facade(TEX_GLASS, 6, 12), -1, 'lv-cosmopolitan');

  // Wynn: two curved bronze towers (cylinders, 20 sides) set back from the Strip
  var bronze = ctx.mat(0x8f6a3c, { metalness: 0.35, roughness: 0.45 });
  // east of the lower-right corner, clear of the track (explicit coordinates: the corner's right side faces the bottom leg)
  var wS = { x: 690, z: 560 };
  if (ctx.clearOf(wS.x, wS.z, 40)) {
    var wynnA = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 140, 20), bronze);
    wynnA.position.set(wS.x, ctx.ground(wS.x, wS.z) + 70, wS.z);
    wynnA.name = 'lv-wynn-a';
    ctx.add(wynnA);
  }
  // second tower set further back from the Strip, beside the first
  var wS2 = { x: 690, z: 420 };
  var wynnBx = wS2.x, wynnBz = wS2.z;
  if (ctx.clearOf(wynnBx, wynnBz, 36)) {
    var wynnB = new THREE.Mesh(new THREE.CylinderGeometry(36, 36, 120, 20), bronze);
    wynnB.position.set(wynnBx, ctx.ground(wynnBx, wynnBz) + 60, wynnBz);
    wynnB.name = 'lv-wynn-b';
    ctx.add(wynnB);
  }

  // ---------- neon signs on the casino faces (above 7.5 m, so they never block the track) ----------
  function signTex(text, col) {
    return canvasTex(768, 128, function (g, w, h) {
      g.fillStyle = '#080812'; g.fillRect(0, 0, w, h);
      g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = col; g.shadowBlur = 22; g.fillStyle = col;
      g.fillText(text, w / 2, h / 2 + 4);
    });
  }
  function neonSign(u, off, side, w, h, y, text, col) {
    var p = ctx.at(u);
    var s = sideOffset(p, off, side);
    var plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      ctx.basic(0xffffff, { map: signTex(text, col), side: THREE.DoubleSide }));
    // plane normal faces the road: left vector for a sign on the right side, right vector for a sign on the left
    plane.rotation.y = side < 0 ? Math.atan2(p.lx, p.lz) : Math.atan2(-p.lx, -p.lz);
    plane.position.set(s.x, ctx.ground(s.x, s.z) + y, s.z);
    plane.name = 'lv-sign-' + text;
    ctx.add(plane);
  }
  neonSign(0.440, 33.5, -1, 58, 9, 44, 'BELLAGIO', '#ffd36b');
  neonSign(0.475, 34.5, -1, 60, 12, 92, 'CAESARS PALACE', '#ffe27a');
  neonSign(0.495, 49.5, -1, 48, 10, 42, 'PARIS', '#8fd0ff');
  neonSign(0.520, 24.5, -1, 60, 12, 80, 'VENETIAN', '#ff8fc7');
  neonSign(0.545, 39.5, -1, 50, 10, 110, 'COSMOPOLITAN', '#7fffe0');

  // ---------- monorail: rail on pylons on the INSIDE of the Strip leg (driver's left, +lx), never over the road ----------
  var MR_OFF = 25;
  var railMat = ctx.mat(0x9aa3ad, { metalness: 0.4, roughness: 0.5 });
  for (var k = 0; k < 25; k++) {
    var u0 = 0.41 + k * 0.008, u1 = u0 + 0.008;
    var a = sideOffset(ctx.at(u0), MR_OFF, 1), b = sideOffset(ctx.at(u1), MR_OFF, 1);
    var dx = b.x - a.x, dz = b.z - a.z, segLen = Math.hypot(dx, dz);
    var seg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, segLen + 0.6), railMat);
    seg.position.set((a.x + b.x) / 2, ctx.ground((a.x + b.x) / 2, (a.z + b.z) / 2) + 14, (a.z + b.z) / 2);
    seg.rotation.y = Math.atan2(dx, dz);
    seg.name = 'lv-monorail-rail';
    ctx.add(seg);
  }
  var PYLONS = 47;
  var pylonGeo = new THREE.BoxGeometry(1.6, 14, 1.6);
  var pylons = new THREE.InstancedMesh(pylonGeo, ctx.mat(0x6d7178), PYLONS);
  var dummy = new THREE.Object3D();
  for (var i = 0; i < PYLONS; i++) {
    var pu = 0.41 + i * (0.19 / (PYLONS - 1));
    var ps = sideOffset(ctx.at(pu), MR_OFF, 1);
    dummy.position.set(ps.x, ctx.ground(ps.x, ps.z) + 7, ps.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    pylons.setMatrixAt(i, dummy.matrix);
  }
  pylons.name = 'lv-monorail-pylons';
  ctx.add(pylons);
  // one monorail train, halfway along the rail
  var trainP = sideOffset(ctx.at(0.50), MR_OFF, 1);
  var train = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.6, 16),
    ctx.basic(0xf4f4f4));
  train.position.set(trainP.x, 14, trainP.z);
  train.rotation.y = ctx.at(0.50).yaw;
  train.name = 'lv-monorail-train';
  ctx.add(train);

  // ---------- street lamps on the Strip side of the leg (lap .47 - .56, 16 m off the centreline) ----------
  var LAMPS = 14;
  var poleIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 9, 0.5), ctx.mat(0x2a2d33), LAMPS);
  var headIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), ctx.basic(0xffd27a), LAMPS);
  for (var j = 0; j < LAMPS; j++) {
    var lu = 0.47 + j * (0.09 / (LAMPS - 1));
    var ls = sideOffset(ctx.at(lu), 16, -1);
    var gy = ctx.ground(ls.x, ls.z);
    dummy.position.set(ls.x, gy + 4.5, ls.z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    poleIM.setMatrixAt(j, dummy.matrix);
    dummy.position.set(ls.x, gy + 9.2, ls.z); dummy.updateMatrix();
    headIM.setMatrixAt(j, dummy.matrix);
  }
  poleIM.name = 'lv-lamp-poles'; headIM.name = 'lv-lamp-heads';
  ctx.add(poleIM); ctx.add(headIM);

  // ---------- pit building in the former car park, north of the start straight ----------
  // the start straight runs east; left of the driver (+lx) is north, the inside of the loop
  var pitP = ctx.at(0.985);
  var carParkC = sideOffset(pitP, 76, 1);
  var carPark = new THREE.Mesh(new THREE.BoxGeometry(92, 0.1, 320), ctx.mat(0x3a3d44));
  carPark.position.set(carParkC.x, 0.05, carParkC.z);
  carPark.rotation.y = pitP.yaw;
  carPark.name = 'lv-car-park';
  ctx.add(carPark);
  var pitC = sideOffset(pitP, 45, 1);
  var pitWall = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 300), ctx.mat(0x8a909a));
  pitWall.position.set(pitC.x, 3, pitC.z);
  pitWall.rotation.y = pitP.yaw;
  pitWall.name = 'lv-pit-building';
  ctx.add(pitWall);
  var pitRoof = new THREE.Mesh(new THREE.BoxGeometry(22, 1.2, 304), ctx.mat(0xb7bcc4));
  pitRoof.position.set(pitC.x, 6.6, pitC.z);
  pitRoof.rotation.y = pitP.yaw;
  pitRoof.name = 'lv-pit-roof';
  ctx.add(pitRoof);
  ctx.solid(pitWall);
};
