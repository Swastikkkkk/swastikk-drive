/* per-circuit scenery for the F1 circuits: window.F1Landmarks[id](ctx) - see F1.build in game.js for ctx. Built from assets/f1-landmarks/*.js */
window.F1Landmarks=window.F1Landmarks||{};
;/* ---- assets/f1-landmarks/at.js ---- */
window.F1Landmarks['at'] = function (ctx) {
  const T = ctx.THREE;
  const rnd = ctx.rand;
  const TAU = Math.PI * 2;
  const VX = -830, VZ = 470;   // Spielberg village, south-west of the circuit (approximate)

  const mat = (color, o) => ctx.mat(color, Object.assign({ flatShading: true }, o || {}));
  const put = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); return o; };
  // point d metres left (+) / right (-) of the road centreline at lap fraction u
  const beside = (u, d) => { const p = ctx.at(u); return { x: p.x + p.lx * d, z: p.z + p.lz * d, yaw: p.yaw }; };
  const m4 = new T.Matrix4(), qt = new T.Quaternion(), eu = new T.Euler(), pv = new T.Vector3(), sv = new T.Vector3();
  const setI = (im, i, x, y, z, sx, sy, sz, ry) => {
    eu.set(0, ry || 0, 0); qt.setFromEuler(eu); pv.set(x, y, z); sv.set(sx, sy, sz);
    m4.compose(pv, qt, sv); im.setMatrixAt(i, m4);
  };
  const inst = (geo, m, n) => { const im = new T.InstancedMesh(geo, m, n); im.frustumCulled = false; return im; };

  // 1. Red Bull bull: steel sculpture on a plinth, on the hillside beside Turn 3, facing the road
  const bull = (x, z, toX, toZ) => {
    const g = new T.Group();
    const steel = mat(0xaeb6bf, { roughness: 0.35, metalness: 0.75 });
    const dark = mat(0x4a4f57, { roughness: 0.8, metalness: 0.1 });
    const red = mat(0xc8102e, { roughness: 0.5 });
    const add = o => g.add(o);
    add(put(new T.BoxGeometry(16, 2, 10), dark, 0, 1, 0));
    add(put(new T.BoxGeometry(16.4, 0.3, 10.4), red, 0, 2.15, 0));
    const legG = new T.CylinderGeometry(0.6, 0.7, 5.5, 6);
    [[-1.8, -4], [1.8, -4], [-1.8, 4], [1.8, 4]].forEach(p => add(put(legG, steel, p[0], 4.75, p[1])));
    add(put(new T.BoxGeometry(5, 4.6, 11), steel, 0, 9.8, 0));
    add(put(new T.BoxGeometry(5.6, 5, 3.6), steel, 0, 10.5, 6.4));
    add(put(new T.BoxGeometry(3.6, 3.4, 3), steel, 0, 12.4, 8.4));
    add(put(new T.BoxGeometry(3.4, 3.2, 4.4), steel, 0, 11.2, 10.6));
    const hornG = new T.ConeGeometry(0.45, 3.2, 6);
    [-1, 1].forEach(s => { const h = put(hornG, dark, s * 1.5, 14.2, 10.4); h.rotation.z = -s * 0.5; add(h); });
    const eyeG = new T.BoxGeometry(0.6, 0.4, 0.2);
    [-1, 1].forEach(s => add(put(eyeG, red, s * 0.9, 11.6, 12.85)));
    const tail = put(new T.CylinderGeometry(0.25, 0.15, 4.5, 5), dark, 0, 8.6, -7.2);
    tail.rotation.x = -0.6; add(tail);
    g.position.set(x, ctx.ground(x, z), z);
    g.rotation.y = Math.atan2(toX - x, toZ - z);
    ctx.add(g);
  };

  // 2. Start-finish pit building: long glass hall with a swept, wing-shaped canopy roof
  const pitBuilding = (u, side, d, len) => {
    const p = beside(u, side * d);
    const g = new T.Group();
    const wall = mat(0xeef1f4, { roughness: 0.6 });
    const glass = mat(0x2d4a5e, { roughness: 0.2, metalness: 0.3 });
    const roofM = mat(0xc9d0d8, { roughness: 0.35, metalness: 0.5, side: T.DoubleSide });
    const colM = mat(0x8c949c, { roughness: 0.7 });
    const L2 = len / 2, W = 14, D = 26, segs = 4, sl = len / segs;
    const sh = new T.Shape();
    sh.moveTo(-L2, 8);
    sh.quadraticCurveTo(0, 9, L2, 22);
    sh.lineTo(L2, 25);
    sh.quadraticCurveTo(0, 13, -L2, 11);
    sh.lineTo(-L2, 8);
    const roofG = new T.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 16 });
    roofG.rotateY(-Math.PI / 2);
    roofG.translate(D / 2, 0, 0);
    g.add(put(roofG, roofM, 0, 0, 0));
    const walls = [];
    for (let k = 0; k < segs; k++) {
      const zc = -L2 + (k + 0.5) * sl;
      const w = put(new T.BoxGeometry(W, 8, sl - 0.6), wall, 0, 4, zc);
      walls.push(w); g.add(w);
      g.add(put(new T.BoxGeometry(0.3, 4.4, sl - 3), glass, -side * (W / 2 + 0.05), 4.6, zc));
    }
    const cols = [];
    for (let k = 0; k <= 10; k++) {
      const zc = -L2 + 4 + k * ((len - 8) / 10);
      cols.push([-11, zc], [11, zc]);
    }
    const colG = new T.CylinderGeometry(0.5, 0.5, 1, 6);
    const colIM = inst(colG, colM, cols.length);
    cols.forEach((c, i) => {
      const top = 8 + (c[1] + L2) / len * 14 - 0.6;   // underside of the canopy above this column
      setI(colIM, i, c[0], top / 2, c[1], 1, top, 1, 0);
    });
    g.add(colIM);
    g.position.set(p.x, ctx.ground(p.x, p.z), p.z);
    g.rotation.y = p.yaw;
    ctx.add(g);
    g.updateMatrixWorld(true);
    walls.forEach(w => ctx.solid(w));
  };

  // 3. Turn 3 hillside grandstand: stepped terrace with a canopy on posts, seats facing the road
  const grandstand = (u, side, d) => {
    const p = beside(u, side * d);
    const g = new T.Group();
    const conc = mat(0xa3a9af, { roughness: 0.9 });
    const seatA = mat(0xd6222e, { roughness: 0.8 });
    const seatB = mat(0xf2f2f2, { roughness: 0.8 });
    const len = 90, tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const h = 1.1 + i * 1.1, x = side * i * 3;
      g.add(put(new T.BoxGeometry(3, h, len), conc, x, h / 2, 0));
      g.add(put(new T.BoxGeometry(2.4, 0.25, len - 4), i % 2 ? seatA : seatB, x, h + 0.12, 0));
    }
    g.add(put(new T.BoxGeometry(9, 0.6, len), conc, side * 11, 9.5, 0));
    const postG = new T.CylinderGeometry(0.4, 0.4, 9.2, 6);
    postG.translate(0, 4.6, 0);
    const posts = inst(postG, mat(0x6c747c, { roughness: 0.7 }), 4);
    [-40, -13, 13, 40].forEach((z, i) => setI(posts, i, side * 15.5, 0, z, 1, 1, 1, 0));
    g.add(posts);
    g.position.set(p.x, ctx.ground(p.x, p.z), p.z);
    g.rotation.y = p.yaw;
    ctx.add(g);
  };

  // 4. Styrian mountains: a ring of tall peaks with snow caps, pine forest on their slopes
  const mountains = () => {
    const peaks = [];
    const NP = 26;
    for (let i = 0; i < NP; i++) {
      const a = (i + 0.3 + rnd() * 0.4) / NP * TAU;
      const x = Math.cos(a) * (1520 + rnd() * 240), z = Math.sin(a) * (1120 + rnd() * 200);
      const R0 = 300 + rnd() * 220, H = 360 + rnd() * 460;
      if (ctx.clearOf(x, z, R0 * 1.42)) peaks.push({ x, z, R0, H, y: ctx.ground(x, z), yaw: rnd() * TAU });
    }
    const coneG = new T.ConeGeometry(1, 1, 8);
    coneG.translate(0, 0.5, 0);
    const peakIM = inst(coneG, mat(0x56685a, { roughness: 0.95 }), peaks.length);
    peaks.forEach((p, i) => setI(peakIM, i, p.x, p.y, p.z, p.R0, p.H, p.R0, p.yaw));
    ctx.add(peakIM);

    const snow = peaks.filter(p => p.H > 540);
    if (snow.length) {
      const snowIM = inst(coneG, mat(0xf1f5f9, { roughness: 0.6 }), snow.length);
      snow.forEach((p, i) => setI(snowIM, i, p.x, p.y + 0.64 * p.H, p.z, 0.36 * p.R0, 0.36 * p.H, 0.36 * p.R0, p.yaw));
      ctx.add(snowIM);
    }

    const trees = [];
    peaks.forEach(p => {
      let n = 0;
      for (let t = 0; t < 160 && n < 34; t++) {
        const f = 0.45 + rnd() * 0.45, a = rnd() * TAU;
        const x = p.x + Math.cos(a) * f * p.R0, z = p.z + Math.sin(a) * f * p.R0;
        if (!ctx.clearOf(x, z, 6)) continue;
        trees.push({ x, y: p.y + p.H * (1 - f) - 0.5, z, s: 0.7 + rnd() * 0.6, ry: rnd() * TAU });
        n++;
      }
    });
    // valley floor pines, kept out of the village
    for (let t = 0, n = 0; t < 1400 && n < 240; t++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd());
      const x = Math.cos(a) * r * 1050, z = Math.sin(a) * r * 800;
      if (Math.hypot(x - VX, z - VZ) < 170 || !ctx.clearOf(x, z, 6)) continue;
      trees.push({ x, y: ctx.ground(x, z), z, s: 0.8 + rnd() * 0.6, ry: rnd() * TAU });
      n++;
    }
    if (trees.length) {
      const trunkG = new T.CylinderGeometry(0.4, 0.5, 3, 5);
      trunkG.translate(0, 1.5, 0);
      const folG = new T.ConeGeometry(2.8, 9.5, 6);
      folG.translate(0, 7.25, 0);
      const trunk = inst(trunkG, mat(0x5b4129, { roughness: 1 }), trees.length);
      const fol = inst(folG, mat(0x1f4d2e, { roughness: 0.9 }), trees.length);
      trees.forEach((t, i) => {
        setI(trunk, i, t.x, t.y, t.z, t.s, t.s, t.s, t.ry);
        setI(fol, i, t.x, t.y, t.z, t.s, t.s, t.s, t.ry);
      });
      ctx.add(trunk);
      ctx.add(fol);
    }
  };

  // 5. Meadows: flat green patches on the valley floor and the infield, never under the road
  const meadows = () => {
    const list = [];
    for (let t = 0, n = 0; t < 400 && n < 36; t++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()), rad = 60 + rnd() * 90;
      const x = Math.cos(a) * r * 950, z = Math.sin(a) * r * 720;
      if (!ctx.clearOf(x, z, rad * 1.45)) continue;
      list.push({ x, z, rad, y: ctx.ground(x, z) + 0.05 });
      n++;
    }
    if (!list.length) return;
    const geo = new T.CircleGeometry(1, 18);
    geo.rotateX(-Math.PI / 2);
    const im = inst(geo, mat(0x6a9f3e, { roughness: 1 }), list.length);
    list.forEach((m, i) => setI(im, i, m.x, m.y, m.z, m.rad, 1, m.rad, 0));
    ctx.add(im);
  };

  // 6. Spielberg village: steep-roofed houses and a church tower
  const village = () => {
    const houses = [];
    for (let t = 0; t < 500 && houses.length < 18; t++) {
      const x = VX + (rnd() - 0.5) * 280, z = VZ + (rnd() - 0.5) * 220;
      if (!ctx.clearOf(x, z, 9) || houses.some(h => Math.hypot(h.x - x, h.z - z) < 13)) continue;
      houses.push({ x, z, ry: Math.floor(rnd() * 2) * Math.PI / 2 + (rnd() - 0.5) * 0.2, c: Math.floor(rnd() * 4) });
    }
    if (houses.length) {
      const bodyG = new T.BoxGeometry(8.8, 6, 10);
      bodyG.translate(0, 3, 0);
      const tri = new T.Shape();
      tri.moveTo(-5.2, 0); tri.lineTo(5.2, 0); tri.lineTo(0, 7.4); tri.closePath();
      const roofG = new T.ExtrudeGeometry(tri, { depth: 11, bevelEnabled: false });
      roofG.translate(0, 6, -5.5);
      const body = inst(bodyG, mat(0xffffff), houses.length);
      const roof = inst(roofG, mat(0xffffff, { roughness: 0.9 }), houses.length);
      const wallCols = [0xefe3c8, 0xe6c58a, 0xcfe0e6, 0xf2f0ea];
      const roofCols = [0x7a3b2b, 0x6a3428, 0x4e4a48, 0x8a4a2e];
      houses.forEach((h, i) => {
        const gy = ctx.ground(h.x, h.z);
        setI(body, i, h.x, gy, h.z, 1, 1, 1, h.ry);
        setI(roof, i, h.x, gy, h.z, 1, 1, 1, h.ry);
        body.setColorAt(i, new T.Color(wallCols[h.c]));
        roof.setColorAt(i, new T.Color(roofCols[h.c]));
      });
      ctx.add(body);
      ctx.add(roof);
    }
    const cx = VX + 60, cz = VZ - 50;
    if (ctx.clearOf(cx, cz, 12)) {
      const cy = ctx.ground(cx, cz);
      ctx.add(put(new T.BoxGeometry(7, 14, 7), mat(0xf4efe4), cx, cy + 7, cz));
      ctx.add(put(new T.ConeGeometry(4.8, 16, 6), mat(0x3f7a5a), cx, cy + 22, cz));
    }
  };

  village();
  meadows();
  mountains();
  const t3 = ctx.at(0.25);
  const bp = beside(0.25, -48);
  bull(bp.x, bp.z, t3.x, t3.z);
  pitBuilding(0, -1, 36, 130);
  grandstand(0.25, 1, 33);
};

;/* ---- assets/f1-landmarks/au.js ---- */
/* Albert Park Circuit, Melbourne (day race): Albert Park Lake filling the inside of the loop with sailing boats,
   mature parkland trees around the lake and outside the track, the golf course greens, Lakeside Stadium, and the
   Melbourne CBD skyline to the north with a tall Eureka-style tower. Water and trees are tested with ctx.clearOf. */
window.F1Landmarks['au'] = function (ctx) {
  const T = ctx.THREE, rand = ctx.rand;
  const add = o => ctx.add(o);
  const D = new T.Object3D();

  // a generic instanced builder: fn(item, D, i, mesh) sets the transform (and optionally the colour) of instance i
  function inst(geo, mat, items, fn) {
    const m = new T.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { D.position.set(0, 0, 0); D.rotation.set(0, 0, 0); D.scale.set(1, 1, 1); fn(it, D, i, m); D.updateMatrix(); m.setMatrixAt(i, D.matrix); });
    m.frustumCulled = false; add(m); return m;
  }

  // ---- the loop, sampled from the centreline: point-in-loop test for the lake ----
  const NS = 1200, poly = [];
  for (let i = 0; i < NS; i++) poly.push(ctx.at(i / NS));
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  poly.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
  function inLoop(x, z) {
    let c = false;
    for (let i = 0, j = NS - 1; i < NS; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
  }

  // ---- the lake: square water tiles that fill the loop's interior, each one checked with clearOf ----
  // A tile is kept only if its centre is inside the loop and its whole square (half-diagonal) stays clear of the
  // road; a tile that is too close is split into four until it is small enough, so the shoreline follows the track.
  const leaves = [];
  function lakeCell(x0, z0, s) {
    const h = s / 2, cx = x0 + h, cz = z0 + h;
    if (ctx.clearOf(cx, cz, h * Math.SQRT2)) { if (inLoop(cx, cz)) leaves.push({ x: cx, z: cz, s: s }); return; }
    if (s <= 6) return;
    lakeCell(x0, z0, h); lakeCell(x0 + h, z0, h); lakeCell(x0, z0 + h, h); lakeCell(x0 + h, z0 + h, h);
  }
  for (let x = minX - 48; x < maxX; x += 48) for (let z = minZ - 48; z < maxZ; z += 48) lakeCell(x, z, 48);
  function onWater(x, z) {
    for (let i = 0; i < leaves.length; i++) { const l = leaves[i], h = l.s / 2; if (x > l.x - h && x < l.x + h && z > l.z - h && z < l.z + h) return true; }
    return false;
  }
  const wGeo = new T.PlaneGeometry(1, 1); wGeo.rotateX(-Math.PI / 2);
  const water = inst(wGeo, ctx.mat('#2b7fa6', { roughness: .25, metalness: .05 }), leaves, (l, d) => {
    d.position.set(l.x, ctx.ground(l.x, l.z) + .05, l.z); d.scale.set(l.s, 1, l.s);
  });
  water.name = 'albert-park-lake';

  // ---- sailing boats on the lake: hull, mast and sails as instanced meshes ----
  const boats = [];
  for (let t = 0; t < 4000 && boats.length < 11; t++) {
    const l = leaves[Math.floor(rand() * leaves.length)];
    const x = l.x + (rand() - .5) * l.s, z = l.z + (rand() - .5) * l.s;
    if (!onWater(x, z) || !ctx.clearOf(x, z, 7)) continue;          // hull (about 6 m half-diagonal) clear of the road
    if (boats.some(b => Math.hypot(b.x - x, b.z - z) < 45)) continue;
    boats.push({ x: x, z: z, yaw: rand() * Math.PI * 2, col: ['#f4f1ea', '#1d3557', '#c8553d', '#f4f1ea', '#e9c46a'][Math.floor(rand() * 5)] });
  }
  const hullShape = new T.Shape();   // plan view: bow at +z after the rotation below, deck 0.9 m high
  hullShape.moveTo(-1.2, 3.8); hullShape.lineTo(1.2, 3.8); hullShape.lineTo(1.25, -1.0); hullShape.lineTo(0, -4.6); hullShape.lineTo(-1.25, -1.0); hullShape.closePath();
  const hullGeo = new T.ExtrudeGeometry(hullShape, { depth: .9, bevelEnabled: false }); hullGeo.rotateX(-Math.PI / 2);
  const mastGeo = new T.CylinderGeometry(.07, .09, 11, 5); mastGeo.translate(0, .9 + 5.5, .6);
  // sails: a mainsail and a jib in the boat's fore-and-aft plane, double-sided
  const sailPos = new Float32Array([
    0, 11.6, .6,   0, .9, .6,   0, .9, -4.2,        // mainsail
    0, 11.6, .6,   0, .9, .6,   0, .9, 3.7         // jib
  ]);
  const sailGeo = new T.BufferGeometry(); sailGeo.setAttribute('position', new T.BufferAttribute(sailPos, 3)); sailGeo.computeVertexNormals();
  const boatBase = (b) => ctx.ground(b.x, b.z) + .05 - .25;
  if (boats.length) {
    const hulls = inst(hullGeo, ctx.mat('#ffffff', { roughness: .45 }), boats, (b, d, i, m) => {
      d.position.set(b.x, boatBase(b), b.z); d.rotation.set(0, b.yaw, 0); m.setColorAt(i, new T.Color(b.col));
    });
    hulls.name = 'sailing-boat-hulls';
    inst(mastGeo, ctx.mat('#d9d4c6', { roughness: .5 }), boats, (b, d) => { d.position.set(b.x, boatBase(b), b.z); d.rotation.set(0, b.yaw, 0); });
    inst(sailGeo, ctx.mat('#f7f5ef', { roughness: .7, side: T.DoubleSide }), boats, (b, d) => { d.position.set(b.x, boatBase(b), b.z); d.rotation.set(0, b.yaw, 0); });
  }

  // ---- the golf course greens: a 3 x 3 layout west of the track, with fairways, bunkers and flags ----
  const GX = -640, GZ = 150, holes = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const gx = GX + (i - 1) * 105 + (rand() - .5) * 24, gz = GZ + (j - 1) * 80 + (rand() - .5) * 20;
    const yaw = rand() * Math.PI * 2, bunkers = [];
    for (let k = 0; k < 2; k++) { const a = rand() * Math.PI * 2; bunkers.push({ x: gx + Math.cos(a) * 15, z: gz + Math.sin(a) * 15 }); }
    holes.push({ x: gx, z: gz, yaw: yaw, bunkers: bunkers });
  }
  const golfOK = holes.filter(h => ctx.clearOf(h.x, h.z, 33));
  const greenGeo = new T.CircleGeometry(9.5, 16); greenGeo.rotateX(-Math.PI / 2);
  inst(greenGeo, ctx.mat('#56a84e', { roughness: .9 }), golfOK, (h, d) => { d.position.set(h.x, ctx.ground(h.x, h.z) + .08, h.z); });
  const fairGeo = new T.PlaneGeometry(14, 58); fairGeo.rotateX(-Math.PI / 2);
  inst(fairGeo, ctx.mat('#6aa957', { roughness: .9 }), golfOK, (h, d) => {
    const sx = Math.sin(h.yaw), sz = Math.cos(h.yaw);
    d.position.set(h.x - sx * 29, ctx.ground(h.x, h.z) + .06, h.z - sz * 29); d.rotation.set(0, h.yaw, 0);
  });
  const bunkerList = []; golfOK.forEach(h => h.bunkers.forEach(b => { if (ctx.clearOf(b.x, b.z, 6.5)) bunkerList.push(b); }));
  const bunkerGeo = new T.CircleGeometry(4.2, 10); bunkerGeo.rotateX(-Math.PI / 2);
  if (bunkerList.length) inst(bunkerGeo, ctx.mat('#e2cf96', { roughness: 1 }), bunkerList, (b, d) => { d.position.set(b.x, ctx.ground(b.x, b.z) + .09, b.z); });
  if (golfOK.length) {
    const poleGeo = new T.CylinderGeometry(.05, .05, 2.6, 4); poleGeo.translate(0, 1.3, 0);
    inst(poleGeo, ctx.mat('#eeeeee', { roughness: .6 }), golfOK, (h, d) => { d.position.set(h.x, ctx.ground(h.x, h.z) + .08, h.z); });
    const flagGeo = new T.BoxGeometry(.9, .5, .03); flagGeo.translate(.45, 2.35, 0);
    inst(flagGeo, ctx.mat('#c62828', { roughness: .7 }), golfOK, (h, d) => { d.position.set(h.x, ctx.ground(h.x, h.z) + .08, h.z); d.rotation.set(0, h.yaw, 0); });
  }

  // ---- Lakeside Stadium: pitch, running track, stepped stands on all four sides, floodlights ----
  const SX = 150, SZ = 1000, sgy = ctx.ground(SX, SZ);
  if (ctx.clearOf(SX, SZ, 170)) {
    const pitchGeo = new T.PlaneGeometry(106, 70); pitchGeo.rotateX(-Math.PI / 2);
    const pitch = new T.Mesh(pitchGeo, ctx.mat('#3c8d3c', { roughness: .9 })); pitch.position.set(SX, sgy + .1, SZ); add(pitch);
    const ringShape = new T.Shape(); ringShape.moveTo(-86, -66); ringShape.lineTo(86, -66); ringShape.lineTo(86, 66); ringShape.lineTo(-86, 66); ringShape.closePath();
    const ringHole = new T.Path(); ringHole.moveTo(-64, -46); ringHole.lineTo(-64, 46); ringHole.lineTo(64, 46); ringHole.lineTo(64, -46); ringHole.closePath();
    ringShape.holes.push(ringHole);
    const ringGeo = new T.ShapeGeometry(ringShape); ringGeo.rotateX(-Math.PI / 2);
    const ring = new T.Mesh(ringGeo, ctx.mat('#b9573a', { roughness: .8 })); ring.position.set(SX, sgy + .06, SZ); add(ring);
    // stands: five stepped tiers per side, each tier a box from the ground up to its own height
    const tiers = [];
    const seat = ['#27467a', '#c9ced6', '#b33a3a', '#27467a', '#c9ced6'];
    for (let k = 0; k < 5; k++) {
      const H = (k + 1) * 2.8;
      tiers.push({ x: 0, z: -(69 + 6 * k), sx: 176, sz: 6, H: H, col: seat[k] });   // north stand
      tiers.push({ x: 0, z: (69 + 6 * k), sx: 176, sz: 6, H: H, col: seat[k] });    // south stand
      tiers.push({ x: -(89 + 6 * k), z: 0, sx: 6, sz: 132, H: H, col: seat[k] });   // west stand
      tiers.push({ x: (89 + 6 * k), z: 0, sx: 6, sz: 132, H: H, col: seat[k] });    // east stand
    }
    const standMesh = inst(new T.BoxGeometry(1, 1, 1), ctx.mat('#ffffff', { roughness: .8 }), tiers, (t, d, i, m) => {
      d.position.set(SX + t.x, sgy + t.H / 2, SZ + t.z); d.scale.set(t.sx, t.H, t.sz); m.setColorAt(i, new T.Color(t.col));
    });
    standMesh.name = 'lakeside-stands';
    const lights = [[-125, -104], [125, -104], [-125, 104], [125, 104]];
    const mastGeo = new T.CylinderGeometry(.5, .7, 36, 6); mastGeo.translate(0, 18, 0);
    inst(mastGeo, ctx.mat('#8a929b', { roughness: .6 }), lights, (l, d) => { d.position.set(SX + l[0], sgy, SZ + l[1]); });
    const headGeo = new T.BoxGeometry(6, 1.6, 3); headGeo.translate(0, 36.5, 0);
    inst(headGeo, ctx.mat('#dfe4ea', { roughness: .5 }), lights, (l, d) => { d.position.set(SX + l[0], sgy, SZ + l[1]); });
  }

  // ---- the CBD skyline to the north: a cluster of glass towers and the Eureka-style tower ----
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
  const CX = 180, CZ = -2350, towers = [];
  const glass = ['#7f98ad', '#9fb4c4', '#5d7388', '#c9d3dc', '#4f6a82', '#8ea5b8'];
  for (let i = 0; i < 44; i++) {
    towers.push({
      x: CX + gauss() * 360, z: CZ + gauss() * 200,
      w: 16 + rand() * 18, d: 16 + rand() * 18, H: 35 + rand() * 120 * (.5 + .5 * rand()),
      col: glass[Math.floor(rand() * glass.length)]
    });
  }
  inst(new T.BoxGeometry(1, 1, 1), ctx.mat('#ffffff', { roughness: .35, metalness: .1 }), towers, (t, d, i, m) => {
    d.position.set(t.x, ctx.ground(t.x, t.z) + t.H / 2, t.z); d.scale.set(t.w, t.H, t.d); m.setColorAt(i, new T.Color(t.col));
  });
  // Eureka-style tower: a tall blue-glass shaft, a darker crown and a thin mast on top (about 297 m)
  const eX = 560, eZ = -2200, egy = ctx.ground(eX, eZ);
  const eGlass = ctx.mat('#5f8fbf', { roughness: .35, metalness: .15 }), eDark = ctx.mat('#2c4a6e', { roughness: .4, metalness: .2 });
  const shaft = new T.Mesh(new T.BoxGeometry(30, 250, 30), eGlass); shaft.position.set(eX, egy + 125, eZ); add(shaft);
  const crown = new T.Mesh(new T.BoxGeometry(22, 30, 22), eDark); crown.position.set(eX, egy + 265, eZ); add(crown);
  const mast = new T.Mesh(new T.CylinderGeometry(.4, .9, 17, 6), eDark); mast.position.set(eX, egy + 288.5, eZ); add(mast);
  shaft.name = 'eureka-style-tower';

  // ---- mature parkland trees: placed along both sides of the track, so they line the lake shore and fill the land
  //      outside the circuit; trunks and canopies are instanced ----
  const excl = [
    [GX - 170, GX + 170, GZ - 140, GZ + 140],          // golf course playing area
    [SX - 135, SX + 135, SZ - 115, SZ + 115]            // stadium and its approaches
  ];
  const inExcl = (x, z) => excl.some(r => x > r[0] && x < r[1] && z > r[2] && z < r[3]);
  const trees = [];
  for (let t = 0; t < 6000 && trees.length < 600; t++) {
    const p = ctx.at(rand()), side = rand() < .5 ? 1 : -1;
    const d = 6 + Math.pow(rand(), 1.6) * 150;
    const x = p.x + p.lx * side * d, z = p.z + p.lz * side * d;
    const R = 3.6 + rand() * 2.8;                        // canopy radius (m)
    if (!ctx.clearOf(x, z, R * 2.05) || onWater(x, z) || inExcl(x, z)) continue;   // yawed box reaches 2R from its centre
    if (trees.some(q => (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z) < Math.pow(q.R + R + 1.5, 2))) continue;
    trees.push({ x: x, z: z, R: R, trunk: 4 + rand() * 2, yaw: rand() * Math.PI * 2, col: ['#3f7a34', '#4d8a3b', '#346b2e', '#5a9340', '#3c7f3f'][Math.floor(rand() * 5)] });
  }
  if (trees.length) {
    const trunkGeo = new T.CylinderGeometry(.32, .45, 1, 6); trunkGeo.translate(0, .5, 0);
    inst(trunkGeo, ctx.mat('#6b4f36', { roughness: .95 }), trees, (tr, d) => { d.position.set(tr.x, ctx.ground(tr.x, tr.z), tr.z); d.scale.set(1, tr.trunk, 1); });
    const canopyGeo = new T.IcosahedronGeometry(1, 1);
    const canopies = inst(canopyGeo, ctx.mat('#ffffff', { roughness: .85, flatShading: true }), trees, (tr, d, i, m) => {
      d.position.set(tr.x, ctx.ground(tr.x, tr.z) + tr.trunk + .85 * tr.R, tr.z);
      d.rotation.set(0, tr.yaw, 0); d.scale.set(tr.R, .85 * tr.R, tr.R); m.setColorAt(i, new T.Color(tr.col));
    });
    canopies.name = 'parkland-trees';
  }
};

;/* ---- assets/f1-landmarks/az.js ---- */
window.F1Landmarks['az'] = function (ctx) {
  // Baku City Circuit: Old City walls with crenellations and towers along the castle section, the Maiden Tower and
  // Palace of the Shirvanshahs inside them, three Flame Towers on the hill above Turn 13, Government House on
  // Azadliq Square, a Caspian promenade with plane trees and the sea to the south of the main straight, and city
  // apartment blocks on the other side of the straight. Day race: daylight materials only.
  const T = ctx.THREE, clear = ctx.clear, rand = ctx.rand;
  const dummy = new T.Object3D();
  const placed = [];                       // circles of everything solid-ish we placed, so nothing overlaps
  const TILE = 20, HD = TILE * Math.SQRT1_2;

  // point d metres to the left (sgn +1) or right (sgn -1) of the road at a sample point p
  function off(p, sgn, d) { return { x: p.x + sgn * p.lx * d, z: p.z + sgn * p.lz * d }; }
  // yaw that turns local +z to face the road from side sgn (so the box's local x runs along the road)
  function faceYaw(p, sgn) { return Math.atan2(-sgn * p.lx, -sgn * p.lz); }
  // does a box (half sizes hx along local x, hz along local z, rotated by yaw) stay clear of the track?
  // checks the whole axis-aligned bounds of the rotated box, the same way the checker does
  function fits(cx, cz, yaw, hx, hz) {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    const ex = c * hx + s * hz, ez = s * hx + c * hz;
    const nx = Math.ceil(2 * ex / 3) + 1, nz = Math.ceil(2 * ez / 3) + 1;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (ctx.trackDist(cx - ex + 2 * ex * i / (nx - 1), cz - ez + 2 * ez * j / (nz - 1)) < clear + 2.2) return false;
    }
    return true;
  }
  function isFree(x, z, r) {
    for (const q of placed) if (Math.hypot(q.x - x, q.z - z) < q.r + r + 2) return false;
    return true;
  }
  function reserve(x, z, r) { placed.push({ x: x, z: z, r: r }); }
  // first spot looking out from lap fraction u0 on side sgn (d0..d1 metres from the road) that fits the box
  function findSpot(u0, sgn, d0, d1, yawMode, hx, hz) {
    const shifts = [0, 0.004, -0.004, 0.008, -0.008, 0.012, -0.012, 0.016, -0.016, 0.024, -0.024];
    const r = Math.hypot(hx, hz);
    for (const sh of shifts) {
      const p = ctx.at(u0 + sh);
      const yaw = yawMode === 'face' ? faceYaw(p, sgn) : p.yaw;
      for (let d = d0; d <= d1; d += 3) {
        const c = off(p, sgn, d);
        if (isFree(c.x, c.z, r) && fits(c.x, c.z, yaw, hx, hz)) return { x: c.x, z: c.z, yaw: yaw, p: p, d: d };
      }
    }
    return null;
  }
  // a box standing on the ground at (x,z), local x = hx, local z = hz (both half sizes), height h
  function box(mat, x, z, yaw, hx, h, hz) {
    const m = new T.Mesh(new T.BoxGeometry(2 * hx, h, 2 * hz), mat);
    m.position.set(x, ctx.ground(x, z) + h / 2, z);
    m.rotation.y = yaw;
    return m;
  }
  function addSolidIfNear(m, x, z) {
    ctx.add(m);
    if (ctx.trackDist(x, z) < 60) ctx.solid(m);
  }
  function instanced(geo, mat, list, place) {
    if (!list.length) return null;
    const im = new T.InstancedMesh(geo, mat, list.length);
    for (let i = 0; i < list.length; i++) {
      place(dummy, list[i]);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    ctx.add(im);
    return im;
  }
  // canvas texture: one window per tile on a plain facade; rx, ry = repeats
  function windowTex(bg, glass, rx, ry) {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 64, 64);
    g.fillStyle = glass; g.fillRect(10, 8, 44, 40);
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
  }

  // ---- materials ----------------------------------------------------------------------------------
  const M = {
    wall: ctx.mat(0xcab38b, { roughness: 0.95, flatShading: true }),
    stone: ctx.mat(0xb9a57f, { roughness: 0.95, flatShading: true }),
    palace: ctx.mat(0xa88f66, { roughness: 0.95, flatShading: true }),
    roofTile: ctx.mat(0x7a5a3b, { roughness: 0.9, flatShading: true }),
    maiden: ctx.mat(0xd3b98f, { roughness: 0.9, flatShading: true }),
    cream: ctx.mat(0xe8dfc9, { roughness: 0.9 }),
    gold: ctx.mat(0xc2a25a, { roughness: 0.5, metalness: 0.3 }),
    paving: ctx.mat(0xd8cfbb, { roughness: 0.9 }),
    promenade: ctx.mat(0xcbc1ab, { roughness: 0.9 }),
    sea: ctx.mat(0x1f6f8f, { roughness: 0.2, metalness: 0.15 }),
    trunk: ctx.mat(0x6e5234, { roughness: 0.9 }),
    crown: ctx.mat(0x5f9446, { roughness: 0.9, flatShading: true }),
    flame: ctx.mat(0x5b6a73, { roughness: 0.35, metalness: 0.2, map: windowTex('#4a5a66', '#8fb3c7', 0.25, 0.25) })
  };

  // ---- Old City walls along the castle section (Turns 8-12), on the inside of the loop -----------
  const WALL_UA = 0.182, WALL_UB = 0.258, WALL_D = 25, WALL_H = 9, SEG = 16;
  const nSeg = Math.round((WALL_UB - WALL_UA) * ctx.lengthM / SEG);
  const merlons = [];
  for (let s = 0; s < nSeg; s++) {
    const u = WALL_UA + (s + 0.5) * (WALL_UB - WALL_UA) / nSeg;
    const p = ctx.at(u);
    const c = off(p, 1, WALL_D);
    const hx = 1.2, hz = SEG / 2;
    if (!fits(c.x, c.z, p.yaw, hx, hz + 0.3)) continue;
    const g = ctx.ground(c.x, c.z);
    const wm = new T.Mesh(new T.BoxGeometry(2 * hx, WALL_H, 2 * hz), M.wall);
    wm.position.set(c.x, g + WALL_H / 2, c.z);
    wm.rotation.y = p.yaw;
    ctx.add(wm); ctx.solid(wm);
    reserve(c.x, c.z, hz + 1);
    for (let q = -hz + 1.4; q < hz - 1; q += 2.8) {
      merlons.push({ x: c.x + Math.sin(p.yaw) * q, z: c.z + Math.cos(p.yaw) * q, y: g + WALL_H + 0.8, yaw: p.yaw });
    }
  }
  // crenellations: every other block along the wall top
  instanced(new T.BoxGeometry(2.4, 1.6, 1.4), M.wall, merlons, (o, m) => {
    o.position.set(m.x, m.y, m.z); o.rotation.set(0, m.yaw, 0); o.scale.set(1, 1, 1);
  });
  // round towers on the wall
  const wallTowers = [];
  for (const u of [0.19, 0.212, 0.236]) {
    const p = ctx.at(u), c = off(p, 1, WALL_D);
    if (!fits(c.x, c.z, 0, 3.6, 3.6)) continue;
    wallTowers.push({ x: c.x, z: c.z, g: ctx.ground(c.x, c.z) });
    reserve(c.x, c.z, 4);
  }
  instanced(new T.CylinderGeometry(3.2, 3.5, 15, 10), M.wall, wallTowers, (o, t) => {
    o.position.set(t.x, t.g + 7.5, t.z); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
  });
  instanced(new T.CylinderGeometry(3.7, 3.7, 1.4, 10), M.wall, wallTowers, (o, t) => {
    o.position.set(t.x, t.g + 15.7, t.z); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
  });

  // ---- Palace of the Shirvanshahs and the Maiden Tower inside the walls ----------------------------
  const palace = findSpot(0.205, 1, 34, 80, 'road', 15, 12);
  if (palace) {
    reserve(palace.x, palace.z, 19);
    addSolidIfNear(box(M.palace, palace.x, palace.z, palace.yaw, 15, 12, 12), palace.x, palace.z);
    const roof = box(M.roofTile, palace.x, palace.z, palace.yaw, 13.5, 1.6, 10.5);
    roof.position.y = ctx.ground(palace.x, palace.z) + 12 + 0.8;
    addSolidIfNear(roof, palace.x, palace.z);
  }
  const maiden = findSpot(0.243, 1, 30, 75, 'road', 8.5, 8.5);
  if (maiden) {
    reserve(maiden.x, maiden.z, 9);
    const g = ctx.ground(maiden.x, maiden.z);
    const shaft = new T.Mesh(new T.CylinderGeometry(7.4, 8.2, 28, 16), M.maiden);
    shaft.position.set(maiden.x, g + 14, maiden.z);
    addSolidIfNear(shaft, maiden.x, maiden.z);
    const cap = new T.Mesh(new T.ConeGeometry(8.4, 6, 16), M.roofTile);
    cap.position.set(maiden.x, g + 31, maiden.z);
    ctx.add(cap);
  }

  // a few low stone houses in the Old City, between the walls and the palace
  let houses = 0;
  for (let t = 0; t < 60 && houses < 10; t++) {
    const u = 0.19 + rand() * 0.07;
    const p = ctx.at(u);
    const hx = 4 + rand() * 3, hz = 4 + rand() * 3, h = 6 + rand() * 6;
    const c = off(p, 1, 26 + rand() * 34);
    if (!fits(c.x, c.z, p.yaw, hx, hz) || !isFree(c.x, c.z, Math.hypot(hx, hz))) continue;
    reserve(c.x, c.z, Math.hypot(hx, hz));
    addSolidIfNear(box(M.stone, c.x, c.z, p.yaw, hx, h, hz), c.x, c.z);
    houses++;
  }

  // ---- Flame Towers: three flame-shaped towers on the hill outside the loop, above Turn 13 ----------
  function flameGeo(H) {
    const s = new T.Shape();
    s.moveTo(-16, 0);
    s.lineTo(16, 0);
    s.bezierCurveTo(16.5, 0.22 * H, 6, 0.42 * H, 9, 0.62 * H);
    s.bezierCurveTo(11, 0.8 * H, 5, 0.9 * H, 0.5, H);
    s.bezierCurveTo(-5, 0.88 * H, -10, 0.72 * H, -8.5, 0.5 * H);
    s.bezierCurveTo(-7, 0.3 * H, -16.5, 0.2 * H, -16, 0);
    const geo = new T.ExtrudeGeometry(s, { depth: 22, bevelEnabled: false, steps: 1 });
    geo.translate(0, 0, -11);
    return geo;
  }
  const flameH = [190, 178, 162];
  for (let i = 0; i < 3; i++) {
    const sp = findSpot(0.318 + i * 0.009, -1, 110, 240, 'face', 16, 11);
    if (!sp) continue;
    reserve(sp.x, sp.z, Math.hypot(16, 11));
    const m = new T.Mesh(flameGeo(flameH[i]), M.flame);
    m.position.set(sp.x, ctx.ground(sp.x, sp.z), sp.z);
    m.rotation.y = sp.yaw;
    ctx.add(m);
  }

  // ---- Azadliq Square and Government House (Stalinist block) on the outside, Turns 15-16 ----------
  const plaza = findSpot(0.505, -1, 46, 90, 'road', 28, 60);
  if (plaza) {
    reserve(plaza.x, plaza.z, Math.hypot(28, 60));
    const pm = box(M.paving, plaza.x, plaza.z, plaza.yaw, 28, 0.6, 60);
    pm.position.y = ctx.ground(plaza.x, plaza.z) + 0.3;
    ctx.add(pm);
  }
  const gov = plaza
    ? findSpot(0.505, -1, plaza.d + 28 + 22 + 6, plaza.d + 220, 'road', 22, 70)
    : findSpot(0.505, -1, 90, 230, 'road', 22, 70);
  if (gov) {
    reserve(gov.x, gov.z, Math.hypot(22, 70));
    const gh = 34;
    const win = windowTex('#e4dac4', '#5f7483', 16, 9);
    const body = box(ctx.mat(0xe8dfc9, { roughness: 0.9, map: win }), gov.x, gov.z, gov.yaw, 22, gh, 70);
    ctx.add(body);
    const tower = box(M.cream, gov.x, gov.z, gov.yaw, 11, 58, 11);
    ctx.add(tower);
    const spire = new T.Mesh(new T.ConeGeometry(4.5, 16, 4), M.gold);
    spire.position.set(gov.x, ctx.ground(gov.x, gov.z) + 58 + 8, gov.z);
    spire.rotation.y = gov.yaw + Math.PI / 4;
    ctx.add(spire);
    // colonnade on the face toward the track
    const o = { x: -gov.p.lx, z: -gov.p.lz };          // outward from the track (gov sits on the right)
    const cols = [];
    for (let s = -60; s <= 60; s += 8) {
      const x = gov.x - o.x * 23.6 + gov.p.tx * s, z = gov.z - o.z * 23.6 + gov.p.tz * s;
      if (!ctx.clearOf(x, z, 1.5)) continue;
      cols.push({ x: x, z: z, g: ctx.ground(x, z) });
    }
    instanced(new T.CylinderGeometry(1.1, 1.2, 26, 8), M.cream, cols, (ob, c) => {
      ob.position.set(c.x, c.g + 13, c.z); ob.rotation.set(0, 0, 0); ob.scale.set(1, 1, 1);
    });
  }

  // ---- Caspian: sea to the right (south) of the main straight, promenade strip and trees ----------
  const samples = [];
  for (let k = 0; k < 200; k++) { const sp = ctx.at(k / 200); sp.u = k / 200; samples.push(sp); }
  function nearestSample(x, z) {
    let best = samples[0], bd = 1e18;
    for (const sp of samples) {
      const dx = sp.x - x, dz = sp.z - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = sp; }
    }
    return best;
  }
  const seaTiles = [], promTiles = [];
  for (let gx = -400; gx <= 1300; gx += TILE) for (let gz = -300; gz <= 900; gz += TILE) {
    const cx = gx + TILE / 2, cz = gz + TILE / 2;
    const ns = nearestSample(cx, cz);
    if (ns.u < 0.655 || ns.u > 0.99) continue;                              // only beside the main straight
    if ((cx - ns.x) * ns.lx + (cz - ns.z) * ns.lz > 0) continue;            // left of the road is the city side
    const dd = ctx.trackDist(cx, cz);
    if (dd > 320 || dd < clear + HD) continue;
    (dd < clear + HD + 20 ? promTiles : seaTiles).push([cx, cz]);
  }
  instanced(new T.BoxGeometry(TILE, 0.3, TILE), M.sea, seaTiles, (o, t) => {
    o.position.set(t[0], ctx.ground(t[0], t[1]) - 0.1, t[1]); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
  });
  instanced(new T.BoxGeometry(TILE, 0.5, TILE), M.promenade, promTiles, (o, t) => {
    o.position.set(t[0], ctx.ground(t[0], t[1]) + 0.1, t[1]); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
  });

  // plane trees between the barrier and the promenade, and a second row further out on the promenade
  const trees = [];
  for (let u = 0.66; u < 0.985; u += 0.0028) {
    const p = ctx.at(u);
    const c = off(p, -1, clear + 5.5 + rand() * 3);
    if (ctx.clearOf(c.x, c.z, 2.9)) trees.push({ x: c.x, z: c.z, s: 0.9 + rand() * 0.35 });
    if (rand() < 0.5) {
      const c2 = off(p, -1, clear + 24 + rand() * 6);
      if (ctx.clearOf(c2.x, c2.z, 2.9)) trees.push({ x: c2.x, z: c2.z, s: 0.9 + rand() * 0.35 });
    }
  }
  instanced(new T.CylinderGeometry(0.3, 0.42, 3, 5), M.trunk, trees, (o, t) => {
    o.position.set(t.x, ctx.ground(t.x, t.z) + 1.5 * t.s, t.z); o.rotation.set(0, 0, 0); o.scale.set(t.s, t.s, t.s);
  });
  instanced(new T.IcosahedronGeometry(2.3, 0), M.crown, trees, (o, t) => {
    o.position.set(t.x, ctx.ground(t.x, t.z) + 3.6 * t.s, t.z); o.rotation.set(0, 0, 0); o.scale.set(t.s, t.s, t.s);
  });

  // ---- city apartment blocks on the left (north) of the main straight ------------------------------
  const blockTex = windowTex('#ebe6dc', '#6d8797', 1, 1);
  const blockCols = [0xd9cbb1, 0xc4c9c6, 0xe3d6c0, 0xb9a88f, 0xa9bdb2];
  let blocks = 0;
  for (let t = 0; t < 500 && blocks < 22; t++) {
    const u = 0.66 + rand() * 0.325;
    const p = ctx.at(u);
    const hx = 7 + rand() * 6, hz = 10 + rand() * 14, h = 16 + rand() * 36;
    const c = off(p, 1, clear + hx + 4 + rand() * 60);
    if (!fits(c.x, c.z, p.yaw, hx, hz) || !isFree(c.x, c.z, Math.hypot(hx, hz))) continue;
    reserve(c.x, c.z, Math.hypot(hx, hz));
    const tx = blockTex.clone();
    tx.repeat.set(Math.max(2, Math.round(hz / 2.2)), Math.max(2, Math.round(h / 3.4)));
    tx.needsUpdate = true;
    const mat = ctx.mat(blockCols[Math.floor(rand() * blockCols.length)], { roughness: 0.9, map: tx });
    addSolidIfNear(box(mat, c.x, c.z, p.yaw, hx, h, hz), c.x, c.z);
    blocks++;
  }
};

;/* ---- assets/f1-landmarks/bh.js ---- */
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

;/* ---- assets/f1-landmarks/ca.js ---- */
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

;/* ---- assets/f1-landmarks/cn.js ---- */
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

;/* ---- assets/f1-landmarks/es.js ---- */
/* Circuit de Barcelona-Catalunya (es): recognisable scenery. Day race, clockwise, 4.65 km.
   Corners (lap fraction): Elf .225 (T1, right-hander), Renault .30 (T3), Repsol .358, Seat .39, Campsa .62, La Caixa .746.
   The start/finish straight runs south-south-west into the line at u=0. Its right (infield) side carries the main
   grandstand; its left (pit) side carries the pit buildings and the control tower. Hillside grandstands sit on the
   outside of T1 (left) and T3 (right). Dry Catalan hills rise to the north (-z), the Montserrat range is to the west
   (-x), and Montmelo village lies to the south (+z). */
window.F1Landmarks = window.F1Landmarks || {};
window.F1Landmarks['es'] = function (ctx) {
  var T = ctx.THREE, L = ctx.lengthM, rnd = ctx.rand;
  var UP = new T.Vector3(0, 1, 0), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), M = new T.Matrix4(), C = new T.Color();
  var PAL = [0xe4572e, 0xf3a712, 0xd9d4c6, 0x2f6f9e, 0x3f8a56, 0xb8322f, 0x5c4b8a, 0xe0bd58];
  var keep = [];   // [x, z, radius]: no trees or scrub inside these

  // point on the road at lap fraction u, o metres to the LEFT of the centreline (negative = right); yaw = its heading
  function road(u, o) { var p = ctx.at(u); return { x: p.x + p.lx * o, z: p.z + p.lz * o, yaw: p.yaw }; }
  // set instance i: centre (x,y,z), heading yaw, scale (sx across the road, sy up, sz along it)
  function put(im, i, x, y, z, yaw, sx, sy, sz) { Q.setFromAxisAngle(UP, yaw); S.set(sx, sy, sz); P.set(x, y, z); M.compose(P, Q, S); im.setMatrixAt(i, M); }
  function inst(geo, mat, n, shadow) { var im = new T.InstancedMesh(geo, mat, n); im.castShadow = !!shadow; im.receiveShadow = !!shadow; ctx.add(im); return im; }
  function done(im) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; return im; }
  function nearKeep(x, z) { for (var i = 0; i < keep.length; i++) { var k = keep[i]; if (Math.hypot(k[0] - x, k[1] - z) < k[2]) return true; } return false; }

  // a stepped grandstand beside the road over lap fractions u0..u1; sd = +1 left, -1 right. Its front edge is `inner` m
  // from the centreline; each of the `tiers` decks is `depth` m further out and `rise` m higher. Optional roof
  // {h, d0, d1} (height and lateral extent) with columns along the rear edge.
  function stand(u0, u1, sd, inner, tiers, depth, rise, roof) {
    var n = Math.max(1, Math.round((u1 - u0) * L / 6)), du = (u1 - u0) / n, sl = (u1 - u0) * L / n;
    var body = inst(new T.BoxGeometry(1, 1, 1), ctx.mat(0xc9c3b4, { roughness: .9 }), n * tiers, true);
    var seats = inst(new T.BoxGeometry(1, 1, 1), ctx.mat(0xffffff, { roughness: 1 }), n * tiers * 6, false);
    var roofIM = null, cols = null, nc = 0;
    if (roof) {
      roofIM = inst(new T.BoxGeometry(1, 1, 1), ctx.mat(0xd9d4c6, { roughness: .7 }), n, true);
      nc = Math.floor((u1 - u0) * L / 12) + 1;
      cols = inst(new T.BoxGeometry(1, 1, 1), ctx.mat(0xc9c3b4, { roughness: .9 }), nc, true);
      for (var c = 0; c < nc; c++) {
        var cp = road(u0 + c * 12 / L, sd * (roof.d1 - 1)), cg = ctx.ground(cp.x, cp.z);
        put(cols, c, cp.x, cg + roof.h / 2, cp.z, cp.yaw, .8, roof.h, .8);
      }
    }
    var bi = 0, si = 0;
    for (var k = 0; k < n; k++) {
      var uc = u0 + (k + .5) * du;
      if (roof) {
        var rc = road(uc, sd * (roof.d0 + roof.d1) / 2), rg = ctx.ground(rc.x, rc.z);
        put(roofIM, k, rc.x, rg + roof.h, rc.z, rc.yaw, roof.d1 - roof.d0, .8, sl * 1.02);
      }
      for (var t = 0; t < tiers; t++) {
        var d = inner + t * depth, h = (t + 1) * rise;
        var c0 = road(uc, sd * (d + depth / 2)), g = ctx.ground(c0.x, c0.z);
        put(body, bi++, c0.x, g + h / 2, c0.z, c0.yaw, depth, h, sl * 1.02);
        for (var r = 0; r < 2; r++) for (var j = -1; j <= 1; j++) {
          var q = road(uc + j * sl / 3 / L, sd * (d + .9 + r * 1.2)), gq = ctx.ground(q.x, q.z);
          put(seats, si, q.x, gq + h + .45, q.z, q.yaw, .6, .9, .6);
          C.setHex(PAL[(rnd() * PAL.length) | 0]); seats.setColorAt(si, C); si++;
        }
      }
    }
    done(body); done(seats); if (roofIM) done(roofIM); if (cols) done(cols);
    // keep trees and scrub out from behind the stand's footprint
    var reach = 16 + tiers * depth / 2;
    for (var s = 0; s <= 6; s++) { var kp = road(u0 + (u1 - u0) * s / 6, sd * (inner + tiers * depth / 2)); keep.push([kp.x, kp.z, reach]); }
  }

  /* ---- main grandstand: long, roofed, on the infield (right) side of the start/finish straight, 40-190 m before the line ---- */
  stand(1 - 190 / L, 1 - 40 / L, -1, 21.5, 4, 3, 2.6, { h: 13.6, d0: 20.5, d1: 35.5 });

  /* ---- hillside grandstands on the outside of the first corners: Elf (T1, right-hander) on the left, Renault (T3) on the right ---- */
  stand(.198, .246, 1, 22, 5, 3, 2.4, null);
  stand(.278, .316, -1, 22, 5, 3, 2.4, null);

  /* ---- pit side (left of the straight): pit buildings in 15 m blocks, then the control tower ---- */
  var PU0 = 1 - 150 / L, PU1 = 1 - 60 / L, PB = 6, pb = [];
  var pitGlass = inst(new T.BoxGeometry(1, 1, 1), ctx.basic(0x4f7f8c), PB * 3, false);
  var pitRoof = inst(new T.BoxGeometry(1, 1, 1), ctx.mat(0x8c8a84, { roughness: .8 }), PB, true);
  var gi = 0;
  for (var pk = 0; pk < PB; pk++) {
    var pu = PU0 + (pk + .5) * (PU1 - PU0) / PB, pp = road(pu, 34), pg = ctx.ground(pp.x, pp.z);
    var blk = new T.Mesh(new T.BoxGeometry(10, 13, 15 * 1.02), ctx.mat(0xdcd8cc, { roughness: .85 }));
    blk.position.set(pp.x, pg + 6.5, pp.z); blk.rotation.y = pp.yaw; blk.castShadow = true; blk.receiveShadow = true;
    ctx.add(blk); ctx.solid(blk); pb.push(blk);
    for (var st = 0; st < 3; st++) {
      var gp = road(pu, 28.85), gg = ctx.ground(gp.x, gp.z);
      put(pitGlass, gi++, gp.x, gg + 2.6 + st * 4.2, gp.z, gp.yaw, .3, 2.2, 14);
    }
    var rp = road(pu, 34), rg2 = ctx.ground(rp.x, rp.z);
    put(pitRoof, pk, rp.x, rg2 + 13.4, rp.z, rp.yaw, 11, .8, 15 * 1.02);
    keep.push([pp.x, pp.z, 14]);
  }
  done(pitGlass); done(pitRoof);

  // control tower, set back behind the pit buildings
  var tw = road(1 - 48 / L, 44), tg = ctx.ground(tw.x, tw.z);
  var shaft = new T.Mesh(new T.BoxGeometry(8, 34, 8), ctx.mat(0xe8e4da, { roughness: .8 }));
  shaft.position.set(tw.x, tg + 17, tw.z); shaft.rotation.y = tw.yaw; shaft.castShadow = true;
  ctx.add(shaft); ctx.solid(shaft);
  var cab = new T.Mesh(new T.BoxGeometry(12, 5, 12), ctx.basic(0x7fb3c4));
  cab.position.set(tw.x, tg + 36.5, tw.z); cab.rotation.y = tw.yaw; ctx.add(cab);
  var cap = new T.Mesh(new T.BoxGeometry(13, 1, 13), ctx.mat(0x3a3d44, { roughness: .6 }));
  cap.position.set(tw.x, tg + 39.5, tw.z); cap.rotation.y = tw.yaw; ctx.add(cap);
  keep.push([tw.x, tw.z, 14]);

  /* ---- Montmelo village, south of the circuit (+z), clear of the road ---- */
  var VX = -120, VZ = 650, houses = [];
  for (var vt = 0; vt < 500 && houses.length < 38; vt++) {
    var va = rnd() * Math.PI * 2, vr = 95 * Math.sqrt(rnd());
    var hx = VX + Math.cos(va) * vr, hz = VZ + Math.sin(va) * vr * .8;
    if (!ctx.clearOf(hx, hz, 10) || nearKeep(hx, hz)) continue;
    var hok = true;
    for (var hq = 0; hq < houses.length; hq++) if (Math.hypot(houses[hq].x - hx, houses[hq].z - hz) < 14) { hok = false; break; }
    if (!hok) continue;
    houses.push({ x: hx, z: hz, w: 7 + rnd() * 4, d: 6 + rnd() * 4, h: 6 + rnd() * 3, yaw: (rnd() - .5) * .3 });
    keep.push([hx, hz, 14]);
  }
  if (houses.length) {
    var walls = inst(new T.BoxGeometry(1, 1, 1), ctx.mat(0xffffff, { roughness: .9 }), houses.length, true);
    // pyramid roofs: a four-sided cone turned so its base is square to the road grid, then scaled to each house
    var roofGeo = new T.ConeGeometry(1, 1, 4); roofGeo.rotateY(Math.PI / 4);
    var roofs = inst(roofGeo, ctx.mat(0xb5583a, { roughness: .9 }), houses.length, true);
    var wh = [0xefe6d2, 0xe8dcc4, 0xf2ead8, 0xd9c9a8, 0xf5efe2];
    for (var hi = 0; hi < houses.length; hi++) {
      var hs = houses[hi], hg = ctx.ground(hs.x, hs.z);
      put(walls, hi, hs.x, hg + hs.h / 2, hs.z, hs.yaw, hs.w, hs.h, hs.d);
      put(roofs, hi, hs.x, hg + hs.h + 1.6, hs.z, hs.yaw, hs.w * .707, 3.2, hs.d * .707);
      C.setHex(wh[(rnd() * wh.length) | 0]); walls.setColorAt(hi, C);
    }
    done(walls); done(roofs);
  }

  /* ---- dry hills to the north, rising as they go: hemispheres on the ground ---- */
  var HILLS = [   // x, z, radius, height, colour
    [-640, -1020, 270, 150, 0xa48a58], [-180, -1090, 300, 175, 0x8c7548], [240, -1010, 250, 120, 0xb39d6d],
    [620, -930, 230, 95, 0xa48a58], [-960, -880, 260, 130, 0x8c7548], [60, -1480, 380, 240, 0x9a8052],
    [-420, -1500, 340, 215, 0xb39d6d], [500, -1420, 300, 190, 0x8c7548]];
  var hillIM = inst(new T.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), ctx.mat(0xffffff, { flatShading: true, roughness: 1 }), HILLS.length, false);
  for (var hl = 0; hl < HILLS.length; hl++) {
    var hd = HILLS[hl], hgY = ctx.ground(hd[0], hd[1]);
    put(hillIM, hl, hd[0], hgY, hd[1], 0, hd[2], hd[3], hd[2]); C.setHex(hd[4]); hillIM.setColorAt(hl, C);
  }
  done(hillIM);

  /* ---- Montserrat-style jagged range on the western horizon: tall thin pinnacles in three massifs ---- */
  var peaks = [], MASS = [[-2450, -700], [-2500, 0], [-2400, 650]];
  for (var mm = 0; mm < MASS.length; mm++) for (var mk = 0; mk < 16; mk++) {
    var ma = rnd() * Math.PI * 2, mr = 250 * Math.sqrt(rnd());
    peaks.push({ x: MASS[mm][0] + Math.cos(ma) * mr, z: MASS[mm][1] + Math.sin(ma) * mr, r: 110 + rnd() * 80, h: 260 + rnd() * 260, yaw: rnd() * 6.28 });
  }
  var peakIM = inst(new T.ConeGeometry(1, 1, 5), ctx.mat(0xffffff, { flatShading: true, roughness: 1 }), peaks.length, false);
  var PEAKC = [0x7b6e5f, 0x8e8170, 0x6d6457, 0x9b8d7b];
  for (var pi = 0; pi < peaks.length; pi++) {
    var pk2 = peaks[pi], pg2 = ctx.ground(pk2.x, pk2.z);
    put(peakIM, pi, pk2.x, pg2 + pk2.h / 2, pk2.z, pk2.yaw, pk2.r, pk2.h, pk2.r);
    C.setHex(PEAKC[(rnd() * PEAKC.length) | 0]); peakIM.setColorAt(pi, C);
  }
  done(peakIM);

  /* ---- pine trees and scrub across the dry land around the circuit (instanced), denser to the north ---- */
  var pines = [], scrub = [];
  for (var tr = 0; tr < 9000 && (pines.length < 230 || scrub.length < 650); tr++) {
    var tx = -950 + rnd() * 1900, tz = -1050 + rnd() * 2000;
    if (tz > 0 && rnd() < .5) continue;
    var isPine = rnd() < .3;
    if (isPine ? pines.length >= 230 : scrub.length >= 650) continue;
    var tRad = isPine ? 2.5 + rnd() * .8 : 1 + rnd() * .6;
    if (!ctx.clearOf(tx, tz, tRad + 6) || nearKeep(tx, tz)) continue;
    (isPine ? pines : scrub).push({ x: tx, z: tz, r: tRad, yaw: rnd() * 6.28 });
  }
  if (pines.length) {
    var trunks = inst(new T.CylinderGeometry(.35, .5, 4.5, 5), ctx.mat(0x5a3d26, { roughness: 1 }), pines.length, true);
    var crowns = inst(new T.IcosahedronGeometry(1, 0), ctx.mat(0xffffff, { flatShading: true, roughness: 1 }), pines.length, true);
    var PINEC = [0x2e5a34, 0x35643a, 0x284f30];
    for (var pn = 0; pn < pines.length; pn++) {
      var pt = pines[pn], ptg = ctx.ground(pt.x, pt.z);
      put(trunks, pn, pt.x, ptg + 2.25, pt.z, pt.yaw, 1, 1, 1);
      put(crowns, pn, pt.x, ptg + 4.8 + .6 * pt.r, pt.z, pt.yaw, pt.r * 1.1, pt.r * .8, pt.r * 1.1);
      C.setHex(PINEC[(rnd() * PINEC.length) | 0]); crowns.setColorAt(pn, C);
    }
    done(trunks); done(crowns);
  }
  if (scrub.length) {
    var bushes = inst(new T.IcosahedronGeometry(1, 0), ctx.mat(0xffffff, { flatShading: true, roughness: 1 }), scrub.length, false);
    var SCRUBC = [0x6f7a3d, 0x8a8a4e, 0x9a8a55, 0x66703a];
    for (var sb = 0; sb < scrub.length; sb++) {
      var sc = scrub[sb], sg = ctx.ground(sc.x, sc.z);
      put(bushes, sb, sc.x, sg + .25 * sc.r, sc.z, sc.yaw, sc.r * 1.5, sc.r * .7, sc.r * 1.3);
      C.setHex(SCRUBC[(rnd() * SCRUBC.length) | 0]); bushes.setColorAt(sb, C);
    }
    done(bushes);
  }
};

;/* ---- assets/f1-landmarks/gb.js ---- */
/* Silverstone Circuit (gb): The Wing pit complex, Silverstone Experience hangar, bridge grandstands at Copse and Stowe */
window.F1Landmarks['gb'] = function (ctx) {
  const T = ctx.THREE;
  const ds = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // lowest ground under a rectangle (centre cx,cz, along-direction yaw, half sizes ha (along) and hb (across))
  function minGround(cx, cz, yaw, ha, hb) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    let m = 1e9;
    for (let i = -4; i <= 4; i++) for (let j = -2; j <= 2; j++) {
      const a = ha * i / 4, b = hb * j / 2;
      const x = cx + s * a + c * b, z = cz + c * a - s * b;
      m = Math.min(m, ctx.ground(x, z));
    }
    return m;
  }

  // ---------- The Wing: long pit and paddock building with a swept, wing-shaped roof on the infield side of the Hamilton Straight ----------
  const S = ctx.at(0.005);
  const yaw = S.yaw;
  const right = { x: -S.lx, z: -S.lz };            // infield side (clockwise lap: the centre is on the driver's right)
  const L = 150, D = 26, OFF = 30;                 // length along the straight, depth across, near edge distance from centreline
  const cx = S.x + right.x * (OFF + D / 2), cz = S.z + right.z * (OFF + D / 2);
  const gY = minGround(cx, cz, yaw, L / 2, D / 2);

  // ground-level block (the pit garages and paddock floors) - solid so cars cannot drive into it
  const H = 9;
  const baseG = new T.BoxGeometry(D, H, L);
  const base = new T.Mesh(baseG, ctx.mat(0xd9d4c8, { roughness: .9 }));
  base.position.set(cx, gY + H / 2, cz); base.rotation.y = yaw; base.name = 'wing-base';
  ctx.add(base); ctx.solid(base);

  // the wing roof: a side profile (across x, height y) extruded along the straight, rising towards the back and overhanging the pit lane
  const prof = new T.Shape();
  prof.moveTo(-D / 2 - 2, 0);
  prof.lineTo(D / 2 + 2, 0);
  prof.lineTo(D / 2 + 2, 2.2);
  prof.lineTo(D / 2 - 6, 9.5);
  prof.lineTo(-D / 2, 15.5);
  prof.lineTo(-D / 2 - 4, 13.5);     // cantilever lip over the pit lane side
  prof.lineTo(-D / 2 - 2, 0);
  const roofG = new T.ExtrudeGeometry(prof, { depth: L, bevelEnabled: false, steps: 1 });
  roofG.translate(0, 0, -L / 2);
  const roof = new T.Mesh(roofG, ctx.mat(0xe9e6df, { roughness: .6, side: T.DoubleSide }));
  roof.position.set(cx, gY + H, cz); roof.rotation.y = yaw; roof.name = 'wing-roof';
  ctx.add(roof);
  // glazed band under the roof, lit at night
  const band = new T.Mesh(new T.BoxGeometry(D - 4, 2.2, L - 6), ctx.basic(ctx.night || ctx.dusk ? 0xffe9b0 : 0x6fa8c8));
  band.position.set(cx, gY + H - 1.6, cz); band.rotation.y = yaw; band.name = 'wing-band';
  ctx.add(band);

  // ---------- Silverstone Experience: a former RAF hangar with a curved barrel roof, outside the track on the Hamilton Straight ----------
  const E = ctx.at(0.985);                         // a little before the start line, on the outside (left) of the straight
  const eYaw = E.yaw;
  const eOff = 92, eA = 34, eB = 26;               // along/across half sizes
  const ecx = E.x + E.lx * (eOff + eB), ecz = E.z + E.lz * (eOff + eB);
  const eY = minGround(ecx, ecz, eYaw, eA, eB);
  const hall = new T.Mesh(new T.BoxGeometry(2 * eB, 9, 2 * eA), ctx.mat(0x8a949c, { roughness: .8 }));
  hall.position.set(ecx, eY + 4.5, ecz); hall.rotation.y = eYaw; hall.name = 'experience-walls';
  ctx.add(hall); ctx.solid(hall);
  // barrel roof: a half cylinder lying along the hangar length
  const barrel = new T.Mesh(new T.CylinderGeometry(eB, eB, 2 * eA, 14, 1, true, Math.PI / 2, Math.PI), ctx.mat(0xb7bdc2, { roughness: .7, side: T.DoubleSide }));
  barrel.rotation.order = 'YXZ';                   // axis along the hangar length, upper half arc only
  barrel.rotation.y = eYaw; barrel.rotation.x = Math.PI / 2;
  barrel.position.set(ecx, eY + 9, ecz);
  barrel.name = 'experience-roof';
  ctx.add(barrel);
  // front face glazing with the museum sign colour
  const front = new T.Mesh(new T.BoxGeometry(2 * eB - 8, 6, 0.6), ctx.basic(0x1d4f7a));
  front.position.set(ecx - Math.sin(eYaw) * (eA + 0.3), eY + 3, ecz - Math.cos(eYaw) * (eA + 0.3));
  front.rotation.y = eYaw; front.name = 'experience-front';
  ctx.add(front);

  // ---------- Bridge-style grandstands straddling the track at Copse (0.37) and Stowe (0.67) ----------
  function bridgeStand(u, label) {
    const p = ctx.at(u);
    const deckY = p.y + 9;                         // underside of the deck 9 m above the road: nothing under it can reach the cars
    // leg centres sit outside the barrier line on both sides of the road
    let R = ctx.clear + 2.5;
    while (!(ctx.clearOf(p.x + p.lx * R, p.z + p.lz * R, 2.0) && ctx.clearOf(p.x - p.lx * R, p.z - p.lz * R, 2.0))) R += 1;
    const legH = deckY - 1 - ctx.ground(p.x, p.z);
    for (const sgn of [1, -1]) {
      const lx = p.x + sgn * p.lx * R, lz = p.z + sgn * p.lz * R;
      const gy = ctx.ground(lx, lz);
      const leg = new T.Mesh(new T.BoxGeometry(2.4, deckY - gy, 2.4), ctx.mat(0x6d7379, { roughness: .6 }));
      leg.position.set(lx, gy + (deckY - gy) / 2, lz); leg.rotation.y = p.yaw; leg.name = label + '-leg';
      ctx.add(leg);
    }
    // the deck spans across the road (its long axis runs across the track), 40 m along the road
    const spanW = 2 * R + 6, deepL = 40;
    const deck = new T.Mesh(new T.BoxGeometry(spanW, 1.6, deepL), ctx.mat(0x5a6168, { roughness: .6 }));
    deck.position.set(p.x, deckY, p.z); deck.rotation.y = p.yaw + Math.PI / 2; deck.name = label + '-deck';
    ctx.add(deck);
    // seating terraces on top of the deck (one side) and a canopy roof
    const seats = new T.Mesh(new T.BoxGeometry(spanW - 8, 4, deepL - 6), ctx.mat(0x3c4650, { roughness: .9 }));
    seats.position.set(p.x, deckY + 2.8, p.z); seats.rotation.y = p.yaw + Math.PI / 2; seats.name = label + '-seats';
    ctx.add(seats);
    const canopy = new T.Mesh(new T.BoxGeometry(spanW, 0.6, deepL + 2), ctx.mat(0xe2e5e8, { roughness: .5 }));
    canopy.position.set(p.x, deckY + 9.5, p.z); canopy.rotation.y = p.yaw + Math.PI / 2; canopy.name = label + '-canopy';
    ctx.add(canopy);
    // a row of upright posts holding the canopy, at the deck edges
    for (const sgn of [1, -1]) for (const k of [-1, 1]) {
      const px = p.x + sgn * p.lx * (R + 3) + p.tx * k * (deepL / 2 - 2), pz = p.z + sgn * p.lz * (R + 3) + p.tz * k * (deepL / 2 - 2);
      const post = new T.Mesh(new T.BoxGeometry(0.5, 9.3, 0.5), ctx.mat(0x9aa1a8));
      post.position.set(px, deckY + 4.6, pz); post.name = label + '-post';
      ctx.add(post);
    }
  }
  bridgeStand(0.37, 'copse-stand');
  bridgeStand(0.67, 'stowe-stand');

  // ---------- the flat airfield land and English countryside around it ----------
  // footprints of the buildings above, so nothing else is placed on them
  const wHx = Math.abs(Math.sin(yaw)) * L / 2 + Math.abs(Math.cos(yaw)) * D / 2 + 2;
  const wHz = Math.abs(Math.cos(yaw)) * L / 2 + Math.abs(Math.sin(yaw)) * D / 2 + 2;
  const occ = [{ x0: cx - wHx, x1: cx + wHx, z0: cz - wHz, z1: cz + wHz },
    { x0: ecx - (Math.abs(Math.sin(eYaw)) * eA + Math.abs(Math.cos(eYaw)) * eB) - 2, x1: ecx + (Math.abs(Math.sin(eYaw)) * eA + Math.abs(Math.cos(eYaw)) * eB) + 2,
      z0: ecz - (Math.abs(Math.cos(eYaw)) * eA + Math.abs(Math.sin(eYaw)) * eB) - 2, z1: ecz + (Math.abs(Math.cos(eYaw)) * eA + Math.abs(Math.sin(eYaw)) * eB) + 2 }];
  const occHit = (x0, x1, z0, z1, m) => occ.some(o => x0 < o.x1 + m && x1 > o.x0 - m && z0 < o.z1 + m && z1 > o.z0 - m);
  // a rectangle is free when it misses every building and every sample (8 m apart) is 6 m or more clear of the road,
  // which keeps the whole rectangle clear of the track (the 8 m spacing is within the 6 m margin)
  function freeRect(x0, x1, z0, z1) {
    if (occHit(x0, x1, z0, z1, 4)) return false;
    const nx = Math.ceil((x1 - x0) / 8), nz = Math.ceil((z1 - z0) / 8);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++)
      if (!ctx.clearOf(x0 + (x1 - x0) * i / nx, z0 + (z1 - z0) * j / nz, 6)) return false;
    return true;
  }
  // a flat patch (field, runway) whose vertices follow the terrain, lifted a little above it
  function flatPatch(x0, x1, z0, z1, color, lift, nx, nz) {
    const g = new T.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, ctx.ground(pos.getX(i), pos.getZ(i)) + lift);
    pos.needsUpdate = true; g.computeVertexNormals();
    const m = new T.Mesh(g, ctx.mat(color, { roughness: 1 }));
    ctx.add(m);
    return m;
  }

  // fields
  const FIELD_COLS = [0x6f9a3e, 0x84a94b, 0x5c8a35, 0xa8a25c, 0x9bb55a, 0x7a9d48, 0xbfa95e];
  const fields = [];
  for (let t = 0, made = 0; t < 160 && made < 30; t++) {
    const w = 110 + ctx.rand() * 140, h = 100 + ctx.rand() * 130;
    const x0 = -1000 + ctx.rand() * 1800 - w / 2, z0 = -1150 + ctx.rand() * 2400 - h / 2;
    const x1 = x0 + w, z1 = z0 + h;
    if (fields.some(f => x0 < f.x1 + 2 && x1 > f.x0 - 2 && z0 < f.z1 + 2 && z1 > f.z0 - 2)) continue;
    if (!freeRect(x0, x1, z0, z1)) continue;
    fields.push({ x0, x1, z0, z1 });
    flatPatch(x0, x1, z0, z1, FIELD_COLS[Math.floor(ctx.rand() * FIELD_COLS.length)], 0.07, 4, 4);
    made++;
  }

  // hedgerows along every field edge (one instanced mesh) and oaks growing out of them (instanced trunks and crowns)
  const hedges = [], oaks = [];
  const m4 = new T.Matrix4(), q0 = new T.Quaternion(), pv = new T.Vector3(), sv = new T.Vector3();
  const HEDGE = 12;
  for (const f of fields) {
    const edges = [
      { along: 'x', fixed: f.z0, from: f.x0, to: f.x1 }, { along: 'x', fixed: f.z1, from: f.x0, to: f.x1 },
      { along: 'z', fixed: f.x0, from: f.z0, to: f.z1 }, { along: 'z', fixed: f.x1, from: f.z0, to: f.z1 }];
    for (const e of edges) {
      for (let s = e.from + HEDGE / 2; s + HEDGE / 2 <= e.to; s += HEDGE) {
        const hx = e.along === 'x' ? s : e.fixed, hz = e.along === 'x' ? e.fixed : s;
        if (!ctx.clearOf(hx, hz, 3)) continue;
        hedges.push({ hx, hz, along: e.along });
        if (ctx.rand() < 0.4 && ctx.clearOf(hx, hz, 6)) oaks.push({ x: hx, z: hz, r: 3.2 + ctx.rand() * 2.2 });
      }
    }
  }
  // oaks scattered in the fields
  for (let t = 0, placed = 0; t < 400 && placed < 60 && fields.length; t++) {
    const f = fields[Math.floor(ctx.rand() * fields.length)];
    const x = f.x0 + 10 + ctx.rand() * (f.x1 - f.x0 - 20), z = f.z0 + 10 + ctx.rand() * (f.z1 - f.z0 - 20);
    if (!ctx.clearOf(x, z, 6)) continue;
    oaks.push({ x, z, r: 3.2 + ctx.rand() * 2.2 }); placed++;
  }
  const hedgeIM = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), ctx.mat(0x3e6a2a, { roughness: 1 }), hedges.length);
  hedges.forEach((h, i) => {
    const lenX = h.along === 'x' ? HEDGE : 1.8, lenZ = h.along === 'x' ? 1.8 : HEDGE;
    pv.set(h.hx, ctx.ground(h.hx, h.hz) + 1.1, h.hz); sv.set(lenX, 2.2, lenZ);
    m4.compose(pv, q0, sv); hedgeIM.setMatrixAt(i, m4);
  });
  hedgeIM.instanceMatrix.needsUpdate = true; hedgeIM.name = 'hedgerows'; ctx.add(hedgeIM);

  const trunkIM = new T.InstancedMesh(new T.CylinderGeometry(0.35, 0.55, 3.5, 5, 1), ctx.mat(0x5b4630, { roughness: 1 }), oaks.length);
  const crownIM = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), ctx.mat(0x3f7a2c, { roughness: 1, flatShading: true }), oaks.length);
  oaks.forEach((o, i) => {
    const g = ctx.ground(o.x, o.z);
    pv.set(o.x, g + 1.75, o.z); sv.set(1, 1, 1); m4.compose(pv, q0, sv); trunkIM.setMatrixAt(i, m4);
    pv.set(o.x, g + 3.5 + o.r * 0.6, o.z); sv.set(o.r, o.r * 0.85, o.r); m4.compose(pv, q0, sv); crownIM.setMatrixAt(i, m4);
  });
  trunkIM.instanceMatrix.needsUpdate = true; crownIM.instanceMatrix.needsUpdate = true;
  trunkIM.name = 'oak-trunks'; crownIM.name = 'oak-crowns';
  ctx.add(trunkIM); ctx.add(crownIM);

  // two old runway strips crossing the airfield, placed on the first free spots found
  let runways = 0;
  for (let t = 0; t < 300 && runways < 2; t++) {
    const horiz = runways === 0, len = 900, wd = 40;
    const cx2 = -1000 + ctx.rand() * 1800, cz2 = -1150 + ctx.rand() * 2400;
    const x0 = horiz ? cx2 - len / 2 : cx2 - wd / 2, x1 = horiz ? cx2 + len / 2 : cx2 + wd / 2;
    const z0 = horiz ? cz2 - wd / 2 : cz2 - len / 2, z1 = horiz ? cz2 + wd / 2 : cz2 + len / 2;
    if (!freeRect(x0, x1, z0, z1)) continue;
    flatPatch(x0, x1, z0, z1, 0x9a9a92, 0.12, horiz ? 40 : 4, horiz ? 4 : 40);
    occ.push({ x0, x1, z0, z1 }); runways++;
  }

  // two hangars with barrel roofs on the airfield (walls + half-cylinder roof, axis along the hangar length)
  let hangars = 0;
  for (let t = 0; t < 300 && hangars < 2; t++) {
    const hx = -1000 + ctx.rand() * 1800, hz = -1150 + ctx.rand() * 2400, R = 15, A = 28, wallH = 12;
    if (!freeRect(hx - R, hx + R, hz - A, hz + A)) continue;
    const g = ctx.ground(hx, hz) - 0.2;
    const wall = new T.Mesh(new T.BoxGeometry(2 * R, wallH + 0.2, 2 * A), ctx.mat(0xa9b0b6, { roughness: .7 }));
    wall.position.set(hx, g + (wallH + 0.2) / 2, hz); wall.name = 'hangar-walls';
    ctx.add(wall);
    const roof = new T.Mesh(new T.CylinderGeometry(R, R, 2 * A, 14, 1, true, Math.PI / 2, Math.PI), ctx.mat(0xc4cacf, { roughness: .6, side: T.DoubleSide }));
    roof.rotation.order = 'YXZ'; roof.rotation.x = Math.PI / 2;
    roof.position.set(hx, g + wallH, hz); roof.name = 'hangar-roof';
    ctx.add(roof);
    occ.push({ x0: hx - R, x1: hx + R, z0: hz - A, z1: hz + A }); hangars++;
  }
};

;/* ---- assets/f1-landmarks/hu.js ---- */
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

;/* ---- assets/f1-landmarks/im.js ---- */
/* Imola (Autodromo Enzo e Dino Ferrari): the Santerno river outside the Tamburello corner, the Ayrton Senna memorial
   in the park by Tamburello, a pit block behind the pit lane, two grandstands at Rivazza, wooded hills and vine rows
   outside Acque Minerali and Rivazza, and the town of Imola to the north with its church tower. */
window.F1Landmarks['im'] = function (ctx) {
  const T = ctx.THREE, L = ctx.lengthM, rnd = ctx.rand;
  const mat = (c, o) => ctx.mat(c, o);
  const ground = (x, z) => ctx.ground(x, z);
  const U = d => d / L;                          // metres along the lap from the start line -> lap fraction

  // road frame at lap fraction u; s metres to the left (+) or right (-) of the centreline
  const frame = (u, s) => {
    const a = ctx.at(u), k = s || 0;
    return { x: a.x + a.lx * k, z: a.z + a.lz * k, yaw: a.yaw, lx: a.lx, lz: a.lz };
  };

  // an item's axis-aligned footprint (its sx by sz box turned by yaw) must stay clear of the road
  const footOK = it => {
    const c = Math.abs(Math.cos(it.yaw || 0)), s = Math.abs(Math.sin(it.yaw || 0));
    const hx = (it.sx * c + it.sz * s) / 2, hz = (it.sx * s + it.sz * c) / 2;
    for (let x = it.x - hx; x <= it.x + hx + .01; x += 2)
      for (let z = it.z - hz; z <= it.z + hz + .01; z += 2) if (!ctx.clearOf(x, z, 0)) return false;
    return true;
  };

  // one InstancedMesh from items {x,y,z,yaw,sx,sy,sz,c}; items that would stand on the road are left out
  const instanced = (geo, m, items, name, parent, guard) => {
    const keep = guard === false ? items : items.filter(footOK);
    if (!keep.length) return null;
    const im = new T.InstancedMesh(geo, m, keep.length);
    const mx = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), sc = new T.Vector3(), col = new T.Color();
    keep.forEach((it, i) => {
      q.setFromEuler(e.set(0, it.yaw || 0, 0));
      mx.compose(p.set(it.x, it.y, it.z), q, sc.set(it.sx, it.sy, it.sz));
      im.setMatrixAt(i, mx);
      im.setColorAt(i, col.setHex(it.c === undefined ? 0xffffff : it.c));
    });
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    im.name = name;
    if (parent) parent.add(im); else ctx.add(im);
    return im;
  };

  const cube = new T.BoxGeometry(1, 1, 1);
  // gable roof, unit size: ridge along z, eaves at y=-0.5, apex at y=+0.5
  const gableGeo = (() => {
    const v = [
      -.5, -.5, -.5,   .5, -.5, -.5,   0, .5, -.5,
      -.5, -.5,  .5,   0, .5,  .5,     .5, -.5, .5,
      -.5, -.5, -.5,   0, .5, -.5,     0, .5,  .5,
      -.5, -.5, -.5,   0, .5,  .5,    -.5, -.5, .5,
       .5, -.5, -.5,   .5, -.5, .5,    0, .5,  .5,
       .5, -.5, -.5,   0, .5,  .5,     0, .5, -.5
    ];
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  })();

  // a strip (river water or bank) along a polyline of {x,z}, half a metre-width `half` either side, lifted `lift` above ground
  const strip = (pts, half, lift, m, name) => {
    if (pts.length < 2) return;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    pts.forEach(p => { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; });
    let ok = true;
    for (let x = x0 - half; ok && x <= x1 + half; x += 2.5)
      for (let z = z0 - half; z <= z1 + half; z += 2.5) if (!ctx.clearOf(x, z, 0)) { ok = false; break; }
    if (!ok) {                                   // the strip's box reaches the road: cut it and test each half
      if (pts.length > 3) { const h = pts.length >> 1; strip(pts.slice(0, h + 1), half, lift, m, name); strip(pts.slice(h), half, lift, m, name); }
      return;
    }
    const pos = [], idx = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const y = ground(p.x, p.z) + lift;
      pos.push(p.x - dz * half, y, p.z + dx * half, p.x + dz * half, y, p.z - dx * half);
    });
    for (let i = 0; i < pts.length - 1; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new T.Mesh(g, m);
    mesh.name = name;
    ctx.add(mesh);
  };

  /* ---- 1. the Santerno: a channel about 60 m outside the road, from the approach to the start straight round the
          outside of the Tamburello corner ---- */
  {
    const water = mat(0x3b7d96, { roughness: .22, metalness: .12, side: T.DoubleSide });
    const bank = mat(0x6e6a57, { roughness: .95, side: T.DoubleSide });
    const runs = [];
    let run = [];
    for (let u = -0.04; u <= 0.105; u += 0.0025) {
      const f = frame(u, -(60 + 7 * Math.sin(u * 12 * Math.PI)));
      if (ctx.clearOf(f.x, f.z, 17)) run.push({ x: f.x, z: f.z });
      else { if (run.length > 1) runs.push(run); run = []; }
    }
    if (run.length > 1) runs.push(run);
    runs.forEach((r, k) => {
      strip(r, 17, .08, bank, 'Santerno bank ' + k);
      strip(r, 10, .2, water, 'Santerno water ' + k);
    });
  }

  /* ---- 2. Ayrton Senna memorial: a statue on a plinth in the park by Tamburello, facing the road ---- */
  {
    const f = frame(0.05, -34), gy = ground(f.x, f.z);
    const g = new T.Group();
    g.position.set(f.x, gy, f.z);
    g.rotation.y = Math.atan2(f.lx, f.lz);       // local +z points at the road
    const stone = mat(0xbdb6a6, { roughness: .9 }), bronze = mat(0x8a6a2e, { roughness: .4, metalness: .45 });
    const part = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    part(new T.BoxGeometry(3.4, .3, 3.4), stone, 0, .15, 0);          // base step
    part(new T.BoxGeometry(2.4, 1.2, 2.4), stone, 0, .9, 0);          // plinth
    part(new T.BoxGeometry(2.7, .2, 2.7), stone, 0, 1.6, 0);          // cap
    part(new T.BoxGeometry(.8, .9, .42), bronze, 0, 2.15, 0);         // legs
    part(new T.BoxGeometry(.95, 1.15, .5), bronze, 0, 3.175, 0);      // torso
    part(new T.BoxGeometry(.22, .95, .25), bronze, -.6, 3.1, 0);      // arms
    part(new T.BoxGeometry(.22, .95, .25), bronze, .6, 3.1, 0);
    part(new T.SphereGeometry(.27, 10, 8), bronze, 0, 4.02, 0);       // head
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 160;
    const c2 = cv.getContext('2d');
    c2.fillStyle = '#2b2d31'; c2.fillRect(0, 0, 512, 160);
    c2.strokeStyle = '#d4b35a'; c2.lineWidth = 8; c2.strokeRect(10, 10, 492, 140);
    c2.fillStyle = '#ecd98e'; c2.font = 'bold 60px Arial, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.fillText('AYRTON SENNA', 256, 82);
    part(new T.PlaneGeometry(1.3, .42), mat(0xffffff, { map: new T.CanvasTexture(cv), roughness: .5, metalness: .2 }), 0, .95, 1.21);
    const flowers = [0xd7263d, 0xf4d03f, 0xffffff, 0xe67e22, 0x8e44ad], fi = [];
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * Math.PI * 2, r = 2.7 + rnd() * .8;
      fi.push({ x: Math.cos(a) * r, y: .25, z: Math.sin(a) * r, yaw: 0, sx: .5, sy: .5, sz: .5, c: flowers[i % flowers.length] });
    }
    instanced(new T.IcosahedronGeometry(.5, 0), mat(0xffffff, { roughness: .8 }), fi, 'Senna flower bed', g, false);
    ctx.add(g);
  }

  /* ---- 3. pit block: a long two-storey building 36 m left of the road on the pit side of the start straight,
          behind the pit lane, with a red band and garage doors facing the lane ---- */
  {
    const bodyMat = mat(0xd9d5c9, { roughness: .8 });
    const roofs = [], bands = [], doors = [];
    [[-132, -87], [-87, -42], [-42, 3], [3, 48]].forEach(([d0, d1]) => {
      const f = frame(U((d0 + d1) / 2), 36), len = d1 - d0, gy = ground(f.x, f.z);
      const g = new T.Group();
      g.position.set(f.x, gy, f.z);
      g.rotation.y = f.yaw;
      const body = new T.Mesh(new T.BoxGeometry(14, 7.5, len), bodyMat);
      body.position.set(0, 3.75, 0);
      g.add(body);
      ctx.add(g);
      ctx.solid(body);
      roofs.push({ x: f.x, y: gy + 7.75, z: f.z, yaw: f.yaw, sx: 16, sy: .5, sz: len, c: 0x3a3f47 });
      const b = frame(U((d0 + d1) / 2), 28.97);
      bands.push({ x: b.x, y: gy + 5.4, z: b.z, yaw: f.yaw, sx: .25, sy: .45, sz: len, c: 0xc8102e });
    });
    for (let d = -128; d <= 44; d += 6) {
      const f = frame(U(d), 29.05), gy = ground(f.x, f.z);
      doors.push({ x: f.x, y: gy + 1.5, z: f.z, yaw: f.yaw, sx: .3, sy: 3, sz: 3.2, c: 0x2c3e4c });
    }
    instanced(cube, mat(0xffffff, { roughness: .6 }), roofs, 'pit block roof');
    instanced(cube, mat(0xffffff, { roughness: .5 }), bands, 'pit block red band');
    instanced(cube, mat(0xffffff, { roughness: .4 }), doors, 'pit garage doors');
  }

  /* ---- 4. Rivazza grandstands: two stepped stands on the outside of the corner, 26 m off the road, facing it ---- */
  {
    const tiers = [], canopies = [], posts = [], crowd = [];
    const crowdCols = [0xc62828, 0x1e4a8c, 0xf2f2f2, 0xf4b400, 0x2e7d32, 0x6d4c41, 0x8e24aa, 0x222222];
    [0.785, 0.838].forEach(u0 => {
      for (let c = 0; c < 3; c++) {                 // three 25 m blocks per stand
        const d0 = u0 * L + c * 25, dc = d0 + 12.5;
        for (let i = 0; i < 6; i++) {               // six tiers, each further from the road and higher
          const h = 1.2 + .85 * i, t = frame(U(dc), -(27.2 + 2.4 * i));
          tiers.push({ x: t.x, y: ground(t.x, t.z) + h / 2, z: t.z, yaw: t.yaw, sx: 2.4, sy: h, sz: 25, c: 0x9aa0a8 });
          for (let d = d0 + 1; d < d0 + 25; d += 1.9) {
            if (rnd() > .75) continue;
            const sp = frame(U(d), -(26 + 2.4 * i + .6 + 1.2 * rnd()));
            crowd.push({ x: sp.x, y: ground(sp.x, sp.z) + h + .45, z: sp.z, yaw: sp.yaw, sx: .45, sy: .9, sz: .45, c: crowdCols[(rnd() * crowdCols.length) | 0] });
          }
        }
        const r = frame(U(dc), -34);
        canopies.push({ x: r.x, y: ground(r.x, r.z) + 7.65, z: r.z, yaw: r.yaw, sx: 16, sy: .5, sz: 25, c: 0xc62828 });
        [-9, 9].forEach(o => {
          const p = frame(U(dc + o), -41.5);
          posts.push({ x: p.x, y: ground(p.x, p.z) + 3.7, z: p.z, yaw: p.yaw, sx: .5, sy: 7.4, sz: .5, c: 0x4a4f57 });
        });
      }
    });
    instanced(cube, mat(0xffffff, { roughness: .9 }), tiers, 'Rivazza tiers');
    instanced(cube, mat(0xffffff, { roughness: .6 }), canopies, 'Rivazza canopies');
    instanced(cube, mat(0xffffff, { roughness: .6 }), posts, 'Rivazza posts');
    instanced(cube, mat(0xffffff, { roughness: .9 }), crowd, 'Rivazza crowd');
  }

  /* ---- 5. wooded hills and vine rows: outside Acque Minerali and outside Rivazza ---- */
  const hills = [
    { u: .385, s: -150, R: 58, H: 16, c: 0x3f5b2c },
    { u: .45, s: -186, R: 52, H: 13, c: 0x6b5a2a },
    { u: .85, s: -168, R: 60, H: 18, c: 0x3f5b2c }
  ].map(k => { const f = frame(k.u, k.s); return { x: f.x, z: f.z, R: k.R, H: k.H, c: k.c, gy: ground(f.x, f.z) }; });
  hills.forEach(k => {
    if (!ctx.clearOf(k.x, k.z, k.R * 1.42)) return;
    const m = new T.Mesh(new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(k.c, { roughness: .95, flatShading: true }));
    m.scale.set(k.R, k.H, k.R);
    m.position.set(k.x, k.gy - .15 * k.H, k.z);
    m.name = 'wooded hill';
    ctx.add(m);
  });
  // ground under a tree: the hill's surface where a dome covers the point, else the terrain
  const surf = (x, z) => {
    let y = ground(x, z);
    hills.forEach(k => {
      const q = Math.hypot(x - k.x, z - k.z) / k.R;
      if (q < 1) { const s = k.gy - .15 * k.H + k.H * Math.sqrt(1 - q * q); if (s > y) y = s; }
    });
    return y;
  };
  const trunks = [], cones = [], balls = [];
  const tree = (x, z) => {
    const y = surf(x, z), t = rnd();
    trunks.push({ x, y: y + 1.2, z, yaw: 0, sx: .32, sy: 2.4, sz: .32, c: 0x5a4330 });
    if (t < .45) {
      const r = 1.9 + rnd() * .9, h = 6.5 + rnd() * 4;
      cones.push({ x, y: y + 1.8 + h / 2, z, yaw: rnd() * 3, sx: r * 2, sy: h, sz: r * 2, c: [0x23402a, 0x2d4d2f, 0x1e3a26][(rnd() * 3) | 0] });
    } else {
      const R = 2.6 + rnd() * .9;
      balls.push({ x, y: y + 2.2 + R * .7, z, yaw: rnd() * 3, sx: R * 2, sy: R * 1.7, sz: R * 2, c: [0xc2561f, 0xd98a2b, 0x9c3b1c, 0x7a7a2a, 0xe0b23c][(rnd() * 5) | 0] });
    }
  };
  let placed = 0;
  for (let t = 0; t < 1400 && placed < 470; t++) {
    let u, s;
    if (t % 2) { u = .335 + .165 * rnd(); s = -(92 + 100 * rnd()); }   // Acque Minerali side
    else { u = .745 + .165 * rnd(); s = -(70 + 120 * rnd()); }         // Rivazza side
    const f = frame(u, s);
    if (!ctx.clearOf(f.x, f.z, 5)) continue;
    tree(f.x, f.z);
    placed++;
  }
  instanced(new T.CylinderGeometry(.5, .6, 1, 6), mat(0xffffff, { roughness: .9 }), trunks, 'wood trunks');
  instanced(new T.ConeGeometry(.5, 1, 7), mat(0xffffff, { roughness: .9, flatShading: true }), cones, 'conifers');
  instanced(new T.IcosahedronGeometry(.5, 0), mat(0xffffff, { roughness: .9, flatShading: true }), balls, 'autumn trees');

  // vine rows: thin trellis rows running along the road, 42-88 m out
  const rowsAt = (u0, s0) => {
    const out = [];
    for (let k = 0; k < 11; k++) {
      const f = frame(u0, s0 - k * 4.2);
      out.push({ x: f.x, y: ground(f.x, f.z) + .7, z: f.z, yaw: f.yaw, sx: .9, sy: 1.4, sz: 50, c: k % 3 === 2 ? 0x7d4a2a : 0x4f7d2b });
    }
    return out;
  };
  instanced(cube, mat(0xffffff, { roughness: .9 }), rowsAt(.425, -42).concat(rowsAt(.812, -46)), 'vine rows');

  /* ---- 6. the town of Imola, north of the circuit: red-roofed houses on streets, and the church tower ---- */
  const CX = -150, CZ = -775;
  const wallCols = [0xefe4cc, 0xe2c79a, 0xf1ead8, 0xd9a77a, 0xe9dcb4];
  const roofCols = [0xa9472b, 0x8f3a25, 0xb85a33, 0x9a4530];
  const hw = [], hr = [], placedH = [];
  for (let t = 0; t < 2600 && hw.length < 330; t++) {
    const x = -560 + 800 * rnd(), z = -990 + 400 * rnd();
    if (Math.hypot(x - CX, z - CZ) < 70 || !ctx.clearOf(x, z, 14)) continue;
    const w = 7 + 4 * rnd(), d = 6 + 3 * rnd(), rr = Math.max(w, d) * .75;
    if (placedH.some(o => Math.hypot(o.x - x, o.z - z) < o.r + rr + 2)) continue;
    placedH.push({ x, z, r: rr });
    const gy = ground(x, z), h = 6.5 + 4 * rnd(), rh = .4 * w, yaw = (rnd() < .5 ? 0 : Math.PI / 2) + (rnd() - .5) * .08;
    hw.push({ x, y: gy + h / 2, z, yaw, sx: w, sy: h, sz: d, c: wallCols[(rnd() * wallCols.length) | 0] });
    hr.push({ x, y: gy + h + rh / 2, z, yaw, sx: w + .8, sy: rh, sz: d + .8, c: roofCols[(rnd() * roofCols.length) | 0] });
  }
  instanced(cube, mat(0xffffff, { roughness: .85 }), hw, 'town houses');
  instanced(gableGeo, mat(0xffffff, { roughness: .8, side: T.DoubleSide }), hr, 'town red roofs');
  {
    const g = new T.Group(), gy = ground(CX, CZ);
    g.position.set(CX, gy, CZ);
    const cream = mat(0xefe6d0, { roughness: .9 }), ochre = mat(0xd9c08f, { roughness: .9 }), tile = mat(0x9a4530, { roughness: .8, side: T.DoubleSide });
    const part = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    part(new T.BoxGeometry(20, 13, 34), cream, 0, 6.5, 0);                        // nave
    const nr = part(gableGeo, tile, 0, 16, 0);                                    // nave roof
    nr.scale.set(20.8, 6, 34.8);
    part(new T.BoxGeometry(7, 40, 7), ochre, 0, 20, 20.5);                        // bell tower
    part(new T.BoxGeometry(6.4, 7, 6.4), cream, 0, 43.5, 20.5);                   // belfry
    const sp = part(new T.ConeGeometry(4.5, 15, 4), tile, 0, 54.5, 20.5);         // spire
    sp.rotation.y = Math.PI / 4;
    ctx.add(g);
  }
};

;/* ---- assets/f1-landmarks/jp.js ---- */
/* Suzuka Circuit (jp): landmarks.
   Frame: a = metres to the LEFT of the road centreline (negative = right); d = metres along the road from the
   start line (negative = before it, i.e. on the main straight). Motopia sits to the left of the road beside the
   First Curve; the main grandstand stands on the right of the start straight, the pit building on the left (the
   pit-lane side the game builds); wooded hills and tree groups ring the circuit, rice paddies lie farther out. */
window.F1Landmarks['jp'] = function (ctx) {
  const T = ctx.THREE, L = ctx.lengthM, rnd = ctx.rand;
  const lap = d => ((d / L) % 1 + 1) % 1;
  const RED = 0xd8322f, WHITE = 0xf1efe8, STEEL = 0x5d616b, GREY = 0x9b988f;
  const HM = new T.Matrix4(), HQ = new T.Quaternion(), HE = new T.Euler(), HP = new T.Vector3(), HS = new T.Vector3();
  const HC = new T.Color(), HUP = new T.Vector3(0, 1, 0);
  const mat = (hex, o) => ctx.mat(hex, o);
  const add = o => { ctx.add(o); return o; };
  const mesh = (geo, m) => add(new T.Mesh(geo, m));
  const inst = (geo, m, n) => add(new T.InstancedMesh(geo, m, n));
  const tint = (im, i, hex) => im.setColorAt(i, HC.setHex(hex));
  const done = im => { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; return im; };
  // one instance: world position, yaw (about Y) and an optional roll about the local Z axis, then a scale
  function put(im, i, x, y, z, sx, sy, sz, ry, rz) {
    HE.set(0, ry || 0, rz || 0, 'YXZ'); HQ.setFromEuler(HE); HP.set(x, y, z); HS.set(sx, sy, sz);
    HM.compose(HP, HQ, HS); im.setMatrixAt(i, HM);
  }
  // an instance stretched between two world points (unit-height cylinder or box, thickness th)
  function seg(im, i, p0, p1, th) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    HP.set((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    HQ.setFromUnitVectors(HUP, new T.Vector3(dx / len, dy / len, dz / len)); HS.set(th, len, th);
    HM.compose(HP, HQ, HS); im.setMatrixAt(i, HM);
  }
  // a point beside the road: d along from the line, a metres to the left; y = terrain there; yaw = heading
  // (local +z = along the road, local +x = left, so the yaw turns boxes to match the road)
  function road(d, a) {
    const b = ctx.at(lap(d)), x = b.x + b.lx * a, z = b.z + b.lz * a;
    return { x: x, z: z, y: ctx.ground(x, z), yaw: b.yaw };
  }

  /* ---------- Motopia amusement park: left of the road, beside the First Curve ---------- */
  const fc = ctx.at(0.01), FY = fc.yaw;
  const PA = 68, PF = 96;                       // park centre: metres left of, and ahead of, the First Curve point
  const pcx = fc.x + fc.lx * PA + fc.tx * PF, pcz = fc.z + fc.lz * PA + fc.tz * PF, pcy = ctx.ground(pcx, pcz);
  // park-local point: a = left, y = up, f = forward (along the road heading at the First Curve)
  const pl = (a, y, f) => ({ x: pcx + fc.lx * a + fc.tx * f, y: pcy + y, z: pcz + fc.lz * a + fc.tz * f });
  const place = (o, p, rz) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, FY, rz || 0, 'YXZ'); return o; };

  // plaza
  place(mesh(new T.BoxGeometry(84, 0.3, 120), mat(0x8e8b82)), pl(0, 0.15, 0));

  // Ferris wheel: hub 42 m up, rim radius 30, wheel plane facing the road (spanned by left and up)
  const HA = -14, HY = 42, HF = -6, WR = 30, SPK = 16, GDN = 16;
  const hubP = pl(HA, HY, HF);
  place(mesh(new T.TorusGeometry(WR, 0.8, 6, 56), mat(WHITE)), hubP);
  place(mesh(new T.CylinderGeometry(2.6, 2.6, 3.2, 8).rotateX(Math.PI / 2), mat(RED)), hubP);
  const spokes = inst(new T.BoxGeometry(0.25, WR, 0.25), mat(0xd9d6cc), SPK);
  for (let k = 0; k < SPK; k++) {
    const th = k * 2 * Math.PI / SPK, c = pl(HA + Math.cos(th) * WR / 2, HY + Math.sin(th) * WR / 2, HF);
    put(spokes, k, c.x, c.y, c.z, 1, 1, 1, FY, th - Math.PI / 2);
  }
  done(spokes);
  const gon = inst(new T.BoxGeometry(2.6, 2.4, 2.4), mat(0xffffff), GDN);
  const GPAL = [RED, 0xf2efe6, 0xffd23f, 0x2f6f9e];
  for (let k = 0; k < GDN; k++) {
    const th = k * 2 * Math.PI / GDN, c = pl(HA + Math.cos(th) * WR, HY + Math.sin(th) * WR - 1.9, HF);
    put(gon, k, c.x, c.y, c.z, 1, 1, 1, FY, 0); tint(gon, k, GPAL[k % GPAL.length]);
  }
  done(gon);
  // A-frame legs from the ground up to the hub, and a grey plinth
  const legs = inst(new T.CylinderGeometry(0.6, 0.6, 1, 5), mat(RED), 2);
  seg(legs, 0, pl(HA - 17, 0, HF), pl(HA, HY - 2, HF), 1.2);
  seg(legs, 1, pl(HA + 17, 0, HF), pl(HA, HY - 2, HF), 1.2);
  done(legs);
  place(mesh(new T.BoxGeometry(34, 0.8, 4), mat(GREY)), pl(HA, 0.4, HF));

  // roller coaster: one closed steel loop around the park, on posts
  const CP = [[26, 10, -52], [46, 15, -40], [54, 26, -14], [44, 32, 12], [26, 18, 30], [4, 28, 44], [-22, 13, 48], [-40, 11, 24]];
  const curve = new T.CatmullRomCurve3(CP.map(p => new T.Vector3(p[0], p[1], p[2])), true);
  const rail = new T.TubeGeometry(curve, 240, 0.45, 6, true);
  // the tube is built in park-local space: map its vertices to the world (rotation + translation)
  const rp = rail.attributes.position, tmpV = new T.Vector3();
  for (let i = 0; i < rp.count; i++) {
    tmpV.set(rp.getX(i), rp.getY(i), rp.getZ(i));
    const q = pl(tmpV.x, tmpV.y, tmpV.z); rp.setXYZ(i, q.x, q.y, q.z);
  }
  rail.computeBoundingBox(); rail.computeBoundingSphere(); rail.computeVertexNormals();
  mesh(rail, mat(STEEL, { metalness: 0.3 }));
  const NP = 30, posts = inst(new T.CylinderGeometry(0.4, 0.4, 1, 5), mat(STEEL), NP);
  for (let i = 0; i < NP; i++) {
    const p = curve.getPointAt(i / NP);
    const w = pl(p.x, 0, p.z), top = pcy + p.y - 0.45, h = Math.max(0.5, p.y - 0.45);
    put(posts, i, w.x, top - h / 2, w.z, 1, h, 1, 0, 0);
  }
  done(posts);

  // station: white block with a red canopy, and a MOTOPIA board on the road-side front
  place(mesh(new T.BoxGeometry(14, 7, 9), mat(WHITE)), pl(26, 3.5, -52));
  place(mesh(new T.BoxGeometry(16, 0.8, 11), mat(RED)), pl(26, 7.4, -52));
  const bc = document.createElement('canvas'); bc.width = 512; bc.height = 128;
  const bg = bc.getContext('2d'); bg.fillStyle = '#d8322f'; bg.fillRect(0, 0, 512, 128);
  bg.fillStyle = '#ffffff'; bg.font = 'bold 80px sans-serif'; bg.textAlign = 'center'; bg.textBaseline = 'middle'; bg.fillText('MOTOPIA', 256, 66);
  const board = mesh(new T.PlaneGeometry(10, 2.5), ctx.basic(0xffffff, { map: new T.CanvasTexture(bc) }));
  board.position.set(pl(26, 5, -56.7).x, pl(26, 5, -56.7).y, pl(26, 5, -56.7).z); board.rotation.set(0, FY + Math.PI, 0, 'YXZ');

  // kiosks along both plaza edges
  const KZ = []; for (let f = -40; f <= 40; f += 16) { KZ.push([-36, f]); KZ.push([36, f]); }
  const kiosks = inst(new T.BoxGeometry(4, 3.4, 3), mat(0xffffff), KZ.length);
  KZ.forEach((k, i) => { const c = pl(k[0], 1.7, k[1]); put(kiosks, i, c.x, c.y, c.z, 1, 1, 1, FY, 0); tint(kiosks, i, [0xffffff, RED, 0xffd23f][i % 3]); });
  done(kiosks);

  /* ---------- main grandstand: right of the start straight, facing the road (100 m, ten 10 m bays) ---------- */
  const GS0 = -190, GN = 10, TIERS = 4, ROWS = 2, COLS = 12;
  const tiers = inst(new T.BoxGeometry(4, 2, 10), mat(WHITE), GN * TIERS);
  const seats = inst(new T.BoxGeometry(0.55, 0.9, 0.5), mat(0xffffff), GN * TIERS * ROWS * COLS);
  const roofs = inst(new T.BoxGeometry(18, 0.6, 10.2), mat(0xf4f2ec), GN);
  const fascia = inst(new T.BoxGeometry(0.5, 1.6, 10.2), mat(RED), GN);
  const stripe = inst(new T.BoxGeometry(17.6, 0.3, 10.25), mat(RED), GN);
  const pillars = inst(new T.BoxGeometry(0.7, 10.6, 0.7), mat(RED), (GN + 1) * 2);
  const SPAL = [RED, WHITE, RED, 0x2f6f9e, WHITE, 0xf3a712, 0x3f8a56, RED, 0x5c4b8a, WHITE];
  let ti = 0, si = 0;
  for (let b = 0; b < GN; b++) {
    const dc = GS0 + 5 + 10 * b;
    for (let t = 0; t < TIERS; t++) {
      const tp = road(dc, -28 - 4 * t);
      put(tiers, ti++, tp.x, tp.y + 1 + 2 * t, tp.z, 1, 1, 1, tp.yaw, 0);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const q = road(dc - 4.5 + c * 0.85, -26.7 - 4 * t - 1.3 * r);
        put(seats, si, q.x, q.y + 2 * (t + 1) + 0.45, q.z, 1, 1, 1, q.yaw, 0);
        tint(seats, si, SPAL[(rnd() * SPAL.length) | 0]); si++;
      }
    }
    const rf = road(dc, -33), fa = road(dc, -23.8), st = road(dc, -33);
    put(roofs, b, rf.x, rf.y + 10.8, rf.z, 1, 1, 1, rf.yaw, 0);
    put(fascia, b, fa.x, fa.y + 10.5, fa.z, 1, 1, 1, fa.yaw, 0);
    put(stripe, b, st.x, st.y + 10.1, st.z, 1, 1, 1, st.yaw, 0);
  }
  for (let k = 0; k <= GN; k++) {
    const dk = GS0 + 10 * k;
    const fr = road(dk, -24.6), bk = road(dk, -41.4);
    put(pillars, 2 * k, fr.x, fr.y + 5.3, fr.z, 1, 1, 1, fr.yaw, 0);
    put(pillars, 2 * k + 1, bk.x, bk.y + 5.3, bk.z, 1, 1, 1, bk.yaw, 0);
  }
  done(tiers); done(seats); done(roofs); done(fascia); done(stripe); done(pillars);

  /* ---------- pit building: left of the start straight, behind the pit-lane wall (110 m, 21 bays) ---------- */
  const PB0 = -150, PBN = 21;
  const pw = inst(new T.BoxGeometry(12.5, 6, 10), mat(WHITE), PBN);
  const pband = inst(new T.BoxGeometry(12.7, 0.8, 10.1), mat(RED), PBN);
  const proof = inst(new T.BoxGeometry(15, 0.6, 10.2), mat(0x4a4e58), PBN);
  const pdoor = inst(new T.BoxGeometry(0.25, 3.2, 6.5), mat(0x2b2e36), PBN);
  const ppil = inst(new T.BoxGeometry(0.7, 6, 0.7), mat(RED), PBN + 1);
  for (let b = 0; b < PBN; b++) {
    const dc = PB0 + 5 + 10 * b;
    const w = road(dc, 31.5), bd = road(dc, 31.5), ro = road(dc, 32.5), dr = road(dc, 25.1);
    put(pw, b, w.x, w.y + 3, w.z, 1, 1, 1, w.yaw, 0);
    put(pband, b, bd.x, bd.y + 4.4, bd.z, 1, 1, 1, bd.yaw, 0);
    put(proof, b, ro.x, ro.y + 6.3, ro.z, 1, 1, 1, ro.yaw, 0);
    put(pdoor, b, dr.x, dr.y + 1.6, dr.z, 1, 1, 1, dr.yaw, 0);
  }
  for (let k = 0; k <= PBN; k++) {
    const q = road(PB0 + 10 * k, 25.0);
    put(ppil, k, q.x, q.y + 3, q.z, 1, 1, 1, q.yaw, 0);
  }
  done(pw); done(pband); done(proof); done(pdoor); done(ppil);

  /* ---------- wooded hills, tree groups, and rice paddies beyond ---------- */
  const hills = [];
  for (let tries = 0; tries < 12000 && hills.length < 40; tries++) {
    const x = -1300 + rnd() * 2600, z = -950 + rnd() * 1900;
    const td = ctx.trackDist(x, z);
    if (td < 60 || td > 260) continue;
    const R = 50 + rnd() * 50;
    if (Math.hypot(x - pcx, z - pcz) < R + 190) continue;
    if (!ctx.clearOf(x, z, R * 1.42)) continue;
    hills.push({ x: x, z: z, R: R, H: 14 + rnd() * 20, y: ctx.ground(x, z) });
  }
  const hillIM = inst(new T.SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff), hills.length);
  const HILLPAL = [0x3f7a3c, 0x4b8443, 0x35683a, 0x58904b, 0x2f5e36];
  hills.forEach((h, i) => { put(hillIM, i, h.x, h.y, h.z, h.R, h.H, h.R, 0, 0); tint(hillIM, i, HILLPAL[(rnd() * HILLPAL.length) | 0]); });
  done(hillIM);

  const trees = [];
  hills.forEach(h => {
    for (let k = 0; k < 14; k++) {
      const f = Math.sqrt(rnd()) * 0.9, th = rnd() * Math.PI * 2, s = 3.4 + rnd() * 1.4;
      const x = h.x + Math.cos(th) * h.R * f, z = h.z + Math.sin(th) * h.R * f;
      if (!ctx.clearOf(x, z, s * 1.1)) continue;
      trees.push({ x: x, y: h.y + h.H * Math.sqrt(Math.max(0, 1 - f * f)) - 0.5, z: z, s: s });
    }
  });
  for (let k = 0; k < 900 && trees.length < 700; k++) {
    const x = -1200 + rnd() * 2400, z = -900 + rnd() * 1800;
    const td = ctx.trackDist(x, z);
    if (td < 45 || td > 260 || Math.hypot(x - pcx, z - pcz) < 180) continue;
    const s = 3.4 + rnd() * 1.4;
    if (!ctx.clearOf(x, z, s * 1.1)) continue;
    trees.push({ x: x, y: ctx.ground(x, z), z: z, s: s });
  }
  const trunkIM = inst(new T.CylinderGeometry(0.35, 0.45, 1, 5), mat(0x5a4632), trees.length);
  const crownIM = inst(new T.IcosahedronGeometry(1, 0), mat(0xffffff), trees.length);
  const GREEN = [0x2f6b3a, 0x3d7f45, 0x2a5d35, 0x4f8c3f, 0x3a7447];
  trees.forEach((t, i) => {
    put(trunkIM, i, t.x, t.y + 1.8, t.z, 1, 3.6, 1, 0, 0);
    put(crownIM, i, t.x, t.y + 3.6 + t.s * 0.5, t.z, t.s, t.s * 1.1, t.s, 0, 0);
    tint(crownIM, i, GREEN[(rnd() * GREEN.length) | 0]);
  });
  done(trunkIM); done(crownIM);

  // rice paddies: a loose grid of flat fields in the east and south, well beyond the hills
  const PADS = [0x8fb84e, 0xb7c25a, 0x6e9a3c, 0xc9b65a, 0x7a8f45, 0xa3a85a, 0x8a6e4b];
  const pads = [];
  for (let gx = -1300; gx <= 1300; gx += 58) for (let gz = -900; gz <= 1000; gz += 44) {
    if (rnd() < 0.5) continue;
    const x = gx + (rnd() - 0.5) * 14, z = gz + (rnd() - 0.5) * 10;
    if (!(x > 150 || z > 250)) continue;
    const w = 40 + rnd() * 14, d = 26 + rnd() * 12, hd = Math.sqrt(w * w + d * d) / 2;
    if (ctx.trackDist(x, z) < 280 || !ctx.clearOf(x, z, hd)) continue;
    pads.push({ x: x, z: z, w: w, d: d, y: ctx.ground(x, z) });
  }
  const padIM = inst(new T.BoxGeometry(1, 1, 1), mat(0xffffff), pads.length);
  pads.forEach((p, i) => { put(padIM, i, p.x, p.y + 0.06, p.z, p.w, 0.12, p.d, 0, 0); tint(padIM, i, PADS[(rnd() * PADS.length) | 0]); });
  done(padIM);
};

;/* ---- assets/f1-landmarks/lv.js ---- */
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

;/* ---- assets/f1-landmarks/mc.js ---- */
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

;/* ---- assets/f1-landmarks/md.js ---- */
window.F1Landmarks['md'] = function (ctx) {
  const T = ctx.THREE;
  const rnd = ctx.rand;

  // Local frame on the road: lat > 0 is the driver's left, along > 0 is the direction of travel.
  // Returns the world x/z of that point and the road heading.
  function pt(u, lat, along) {
    const q = ctx.at(u);
    return { x: q.x + q.lx * lat + q.tx * along, z: q.z + q.lz * lat + q.tz * along, yaw: q.yaw };
  }

  // A box standing on the ground, footprint w (across the road) x d (along it), top at y0 + h.
  function box(u, lat, along, w, h, d, mat, y0) {
    const p = pt(u, lat, along);
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(p.x, ctx.ground(p.x, p.z) + (y0 || 0) + h / 2, p.z);
    m.rotation.y = p.yaw;
    return ctx.add(m);
  }

  // Axis-aligned box at an absolute world position (for scenery away from the road).
  function place(x, z, w, h, d, mat) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, ctx.ground(x, z) + h / 2, z);
    return ctx.add(m);
  }

  /* ---------- IFEMA exhibition halls: long low halls with white curved roofs, inside the loop by the start straight ---------- */
  const hallMat = ctx.mat(0xf1efe8, { roughness: .55 });
  const plinthMat = ctx.mat(0x8f8b82, { roughness: .9 });
  function hall(u, lat, along, len) {
    const W = 20, WALL = 6;
    box(u, lat, along, W, WALL, len, hallMat);
    box(u, lat, along, W + .4, .8, len, plinthMat);
    // half of a cylinder whose axis runs along the hall: the upper half is the curved roof, the lower half is hidden in the walls
    const p = pt(u, lat, along);
    const roof = new T.Mesh(new T.CylinderGeometry(W / 2, W / 2, len, 18, 1, false), hallMat);
    roof.rotation.order = 'YXZ';
    roof.rotation.y = p.yaw;
    roof.rotation.x = Math.PI / 2;
    roof.position.set(p.x, ctx.ground(p.x, p.z) + WALL, p.z);
    ctx.add(roof);
  }
  hall(.03, -72, -210, 150);
  hall(.03, -72, -40, 150);
  hall(.03, -72, 130, 150);
  hall(.03, -130, -120, 150);

  /* ---------- Spanish flag on a 54 m mast, inside the loop near the start ---------- */
  {
    const f = pt(.058, -36, 0);
    const base = ctx.ground(f.x, f.z);
    const mast = new T.Mesh(new T.CylinderGeometry(.35, .5, 54, 8), ctx.mat(0xd9dde2, { metalness: .3, roughness: .4 }));
    mast.position.set(f.x, base + 27, f.z);
    ctx.add(mast);
    const c = document.createElement('canvas');
    c.width = 128; c.height = 86;
    const g = c.getContext('2d');
    g.fillStyle = '#AA151B'; g.fillRect(0, 0, 128, 22);
    g.fillStyle = '#F1BF00'; g.fillRect(0, 22, 128, 42);
    g.fillStyle = '#AA151B'; g.fillRect(0, 64, 128, 22);
    const tex = new T.CanvasTexture(c);
    // the cloth hangs from the top of the mast, 14 m wide (centred 7 m out from the mast), facing along the road
    const c7 = pt(.058, -36 - 7, 0);
    const cloth = new T.Mesh(new T.PlaneGeometry(14, 9.3), new T.MeshStandardMaterial({ map: tex, side: T.DoubleSide, roughness: .9 }));
    cloth.position.set(c7.x, base + 54 - 4.65, c7.z);
    cloth.rotation.y = f.yaw;
    ctx.add(cloth);
  }

  /* ---------- grandstand around La Monumental (the banked right-hander at lap fraction .373), outside the corner ---------- */
  {
    const tiers = [ctx.mat(0x24457a, { roughness: .9 }), ctx.mat(0xb3262e, { roughness: .9 })];
    const roofMat = ctx.mat(0xe8e6e0, { roughness: .6 });
    const SEG = 6, u0 = .3635, u1 = .3825;
    for (let k = 0; k < SEG; k++) {
      const uc = u0 + (k + .5) * (u1 - u0) / SEG, len = 16.5;
      for (let t = 0; t < 5; t++) {
        box(uc, 16 + t * 3.4 + 1.7, 0, 3.4, 2.6 * (t + 1), len, tiers[t % 2]);
      }
      box(uc, 16, 0, 17.2, .6, len, roofMat, 13.5);
    }
  }

  /* ---------- Valdebebas modern apartment blocks, north-east of the circuit ---------- */
  {
    const blocks = [
      [230, -330, 30, 16, 34, 0xdfd9cc],
      [280, -395, 20, 28, 42, 0xc9d3da],
      [200, -440, 34, 14, 28, 0xe2d5b8],
      [330, -300, 24, 18, 30, 0xcfd6d2],
      [380, -460, 26, 22, 46, 0xd6dde3],
      [150, -520, 30, 18, 38, 0xe6e0d2]
    ];
    for (const b of blocks) {
      const [x, z, w, d, h, col] = b;
      place(x, z, w, h, d, ctx.mat(col, { roughness: .7 }));
      // a darker band two-thirds of the way up each block, slightly proud of the walls
      const band = new T.Mesh(new T.BoxGeometry(w + .4, 1.6, d + .4), ctx.mat(0x6e7782, { roughness: .8 }));
      band.position.set(x, ctx.ground(x, z) + h * .66, z);
      ctx.add(band);
    }
  }

  /* ---------- Parque Juan Carlos I: tree grove along the outside of El Parque (lap fraction .887, the left side there) ---------- */
  {
    const N = 240;
    const trunks = new T.InstancedMesh(new T.CylinderGeometry(.35, .45, 3.2, 5), ctx.mat(0x5b4530), N);
    const crowns = new T.InstancedMesh(new T.IcosahedronGeometry(3, 0), ctx.mat(0x3f7a33, { flatShading: true }), N);
    const m = new T.Matrix4(), pos = new T.Vector3(), quat = new T.Quaternion(), scl = new T.Vector3();
    let k = 0;
    for (let tries = 0; tries < N * 4 && k < N; tries++) {
      const p = pt(.852 + rnd() * .07, 26 + rnd() * 120, (rnd() - .5) * 12);
      if (!ctx.clearOf(p.x, p.z, 4)) continue;
      const gy = ctx.ground(p.x, p.z), s = .8 + rnd() * .5;
      scl.set(s, s, s);
      pos.set(p.x, gy + 1.6 * s, p.z); m.compose(pos, quat, scl); trunks.setMatrixAt(k, m);
      pos.set(p.x, gy + 4.6 * s, p.z); m.compose(pos, quat, scl); crowns.setMatrixAt(k, m);
      k++;
    }
    trunks.count = k; crowns.count = k;
    ctx.add(trunks); ctx.add(crowns);
  }

  /* ---------- Cuatro Torres: four skyscrapers to the south-west, beyond the western side of the loop ---------- */
  {
    const towers = [
      [-470, 580, 250, 30],
      [-410, 590, 248, 28],
      [-455, 650, 236, 26],
      [-400, 660, 250, 28]
    ];
    for (const t of towers) {
      const m = new T.Mesh(new T.CylinderGeometry(t[3] * .36, t[3] * .5, t[2], 6), ctx.mat(0x7d98aa, { metalness: .35, roughness: .25 }));
      m.position.set(t[0], ctx.ground(t[0], t[1]) + t[2] / 2, t[1]);
      ctx.add(m);
    }
  }
};

;/* ---- assets/f1-landmarks/mi.js ---- */
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

;/* ---- assets/f1-landmarks/nl.js ---- */
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

;/* ---- assets/f1-landmarks/qa.js ---- */
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

;/* ---- assets/f1-landmarks/sa.js ---- */
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

;/* ---- assets/f1-landmarks/sg.js ---- */
window.F1Landmarks['sg'] = function (ctx) {
  // Marina Bay Street Circuit, Singapore. Night race, anticlockwise.
  // The loop encloses the bay in its south-east part. Fullerton Hotel, Esplanade domes and downtown sit on the land
  // to the north and west; the Singapore Flyer is out to the north-east; Marina Bay Sands stands across the water to the south.
  const T = ctx.THREE;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const G = (x, z) => ctx.ground(x, z);
  const P = u => ctx.at(u);
  const qY = a => new T.Quaternion().setFromAxisAngle(V(0, 1, 0), a);
  const qZ = a => new T.Quaternion().setFromAxisAngle(V(0, 0, 1), a);
  const M4 = (p, q, s) => { const m = new T.Matrix4(); m.compose(p, q || new T.Quaternion(), s || V(1, 1, 1)); return m; };
  const add = o => ctx.add(o);

  // the loop as a polygon, to tell the inside (bay, land) from the outside
  const poly = [];
  for (let i = 0; i < 480; i++) { const p = P(i / 480); poly.push([p.x, p.z]); }
  const inLoop = (x, z) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const inBay = (x, z) => x > -60 && x < 660 && z > 100 && z < 190 && inLoop(x, z);

  const reserved = [];
  const reserve = (x, z, r) => reserved.push({ x, z, r });
  const free = (x, z, r) => reserved.every(q => Math.hypot(q.x - x, q.z - z) > q.r + r);

  // walk out from the road at lap fraction u (side +1 = driver's left, -1 = right) until ok(x, z)
  const sideWalk = (u, side, ok) => {
    const p = P(u);
    for (let d = 0; d <= 160; d += 2) {
      const x = p.x + side * p.lx * d, z = p.z + side * p.lz * d;
      if (ok(x, z)) return { x, z, p };
    }
    return null;
  };
  // walk from (x0, z0) along (dx, dz) until ok(x, z)
  const walk = (x0, z0, dx, dz, ok) => {
    for (let d = 0; d <= 240; d += 3) {
      const x = x0 + dx * d, z = z0 + dz * d;
      if (ok(x, z)) return { x, z };
    }
    return null;
  };

  // canvas window grid: some windows lit (used with ctx.basic so they glow at night)
  const winTex = o => {
    const cv = document.createElement('canvas');
    cv.width = o.w; cv.height = o.h;
    const g = cv.getContext('2d');
    g.fillStyle = o.bg; g.fillRect(0, 0, o.w, o.h);
    const cw = o.w / o.cols, rh = o.h / o.rows;
    for (let r = 0; r < o.rows; r++) for (let c = 0; c < o.cols; c++) {
      g.fillStyle = ctx.rand() < o.p ? o.lit[Math.floor(ctx.rand() * o.lit.length)] : o.dark;
      g.fillRect(c * cw + cw * 0.18, r * rh + rh * 0.22, cw * 0.64, rh * 0.52);
    }
    return new T.CanvasTexture(cv);
  };

  // 1. the bay: flat water tiles inside the loop, clear of the road
  const tiles = [];
  for (let x = -50; x <= 650; x += 20) for (let z = 110; z <= 190; z += 20) {
    if (inBay(x, z) && ctx.clearOf(x, z, 14.2)) tiles.push([x, z]);
  }
  if (tiles.length) {
    const water = new T.InstancedMesh(new T.BoxGeometry(20, 0.3, 20), ctx.mat(0x1d5e7a, { roughness: 0.15, metalness: 0.2 }), tiles.length);
    water.name = 'Marina Bay water';
    tiles.forEach(([x, z], i) => water.setMatrixAt(i, M4(V(x, G(x, z) + 0.02, z))));
    water.instanceMatrix.needsUpdate = true;
    add(water);
  }

  // 2. Fullerton Hotel: cream colonial block with a clock tower, on the landward side of the Fullerton hairpin
  const hot = sideWalk(0.485, -1, (x, z) => ctx.clearOf(x, z, 42) && !inBay(x, z));
  if (hot) {
    const x = hot.x, z = hot.z, y = G(x, z);
    reserve(x, z, 50);
    const wall = ctx.basic(0xffffff, { map: winTex({ w: 512, h: 256, cols: 16, rows: 4, bg: '#e6d9bb', lit: ['#ffd27a', '#ffe9b0'], dark: '#3b4a5f', p: 0.7 }) });
    const body = new T.Mesh(new T.BoxGeometry(72, 16, 42), wall);
    body.position.set(x, y + 8, z); body.name = 'Fullerton Hotel';
    add(body);
    const tower = new T.Mesh(new T.BoxGeometry(10, 30, 10), wall);
    tower.position.set(x, y + 31, z); tower.name = 'Fullerton clock tower';
    add(tower);
    const roof = new T.Mesh(new T.BoxGeometry(74, 1.4, 44), ctx.mat(0x4a4f57, { roughness: 0.9 }));
    roof.position.set(x, y + 16.7, z); roof.name = 'Fullerton roof';
    add(roof);
    if (ctx.trackDist(x, z) < 60) ctx.solid(body);
  }

  // 3. Anderson Bridge styling: white steel arch with a deck, standing in the bay beside the Fullerton exit
  const arch = sideWalk(0.53, 1, (x, z) => ctx.clearOf(x, z, 34));
  if (arch) {
    const span = 32, rise = 20;
    const g = new T.Group();
    g.position.set(arch.x, G(arch.x, arch.z), arch.z);
    g.rotation.y = arch.p.yaw;
    g.name = 'Anderson Bridge-style arch';
    const steel = ctx.mat(0xe9ecef, { roughness: 0.5, metalness: 0.3 });
    for (const s of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const zz = -span + 2 * span * i / 14;
        pts.push(V(4.5 * s, rise * (1 - zz * zz / (span * span)), zz));
      }
      g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 40, 0.9, 6, false), steel));
    }
    const deck = new T.Mesh(new T.BoxGeometry(9, 0.8, 2 * span), ctx.mat(0x9aa3ad, { roughness: 0.7 }));
    deck.position.y = 6; g.add(deck);
    const hang = [];
    for (let zz = -26; zz <= 26; zz += 4) {
      const len = rise * (1 - zz * zz / (span * span)) - 6;
      if (len > 0.5) for (const s of [-1, 1]) hang.push([4.5 * s, 6 + len / 2, zz, len]);
    }
    if (hang.length) {
      const hm = new T.InstancedMesh(new T.BoxGeometry(0.25, 1, 0.25), steel, hang.length);
      hang.forEach((h, i) => hm.setMatrixAt(i, M4(V(h[0], h[1], h[2]), null, V(1, h[3], 1))));
      hm.instanceMatrix.needsUpdate = true;
      g.add(hm);
    }
    add(g);
  }

  // 4. Esplanade: two "durian" domes on the landward side of the Fullerton road, clear of the water
  const domeMat = ctx.mat(0xc7d0d8, { roughness: 0.3, metalness: 0.4 });
  const plinthMat = ctx.mat(0x7f8891, { roughness: 0.9 });
  for (const u of [0.585, 0.625]) {
    const s = sideWalk(u, -1, (x, z) => ctx.clearOf(x, z, 52) && free(x, z, 40) && !inBay(x, z));
    if (!s) continue;
    const x = s.x, z = s.z, y = G(x, z);
    reserve(x, z, 44);
    const plinth = new T.Mesh(new T.CylinderGeometry(35, 36, 3, 18), plinthMat);
    plinth.position.set(x, y + 1.5, z); plinth.name = 'Esplanade plinth'; add(plinth);
    const dome = new T.Mesh(new T.SphereGeometry(33, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.set(x, y + 3, z); dome.name = 'Esplanade durian dome'; add(dome);
    const sp = [];
    const N = 150;
    for (let i = 0; i < N; i++) {
      const ny = (i + 0.5) / N;
      if (ny < 0.12) continue;
      const r = Math.sqrt(1 - ny * ny), a = i * 2.39996;
      const nx = r * Math.cos(a), nz = r * Math.sin(a);
      sp.push([x + nx * 34.5, y + 3 + ny * 34.5, z + nz * 34.5, nx, ny, nz]);
    }
    const spikes = new T.InstancedMesh(new T.ConeGeometry(0.55, 3.2, 5), domeMat, sp.length);
    sp.forEach((q, i) => spikes.setMatrixAt(i, M4(V(q[0], q[1], q[2]), new T.Quaternion().setFromUnitVectors(V(0, 1, 0), V(q[3], q[4], q[5])))));
    spikes.instanceMatrix.needsUpdate = true; spikes.name = 'Esplanade spikes'; add(spikes);
  }

  // 5. Singapore Flyer: 165 m observation wheel with lit capsules, out on the north-east side
  const fl = walk(800, -150, 1, 0, (x, z) => ctx.clearOf(x, z, 80));
  if (fl) {
    reserve(fl.x, fl.z, 100);
    const g = new T.Group();
    g.position.set(fl.x, G(fl.x, fl.z), fl.z);
    g.name = 'Singapore Flyer';
    const HUB = 88, RR = 76;
    const steel = ctx.mat(0xdfe6ee, { roughness: 0.4, metalness: 0.3 });
    const rim = new T.Mesh(new T.TorusGeometry(RR, 1.8, 6, 64), steel); rim.position.y = HUB; g.add(rim);
    const hub = new T.Mesh(new T.CylinderGeometry(3.5, 3.5, 6, 10), steel); hub.rotation.x = Math.PI / 2; hub.position.y = HUB; g.add(hub);
    const spokes = new T.InstancedMesh(new T.BoxGeometry(0.7, RR, 0.7), steel, 16);
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI * 2 / 16;
      spokes.setMatrixAt(k, M4(V(Math.cos(a) * RR / 2, HUB + Math.sin(a) * RR / 2, 0), qZ(a - Math.PI / 2)));
    }
    spokes.instanceMatrix.needsUpdate = true; g.add(spokes);
    const caps = new T.InstancedMesh(new T.BoxGeometry(3.2, 2.8, 2.8), ctx.basic(0xfff3d6), 32);
    for (let k = 0; k < 32; k++) {
      const a = k * Math.PI * 2 / 32;
      caps.setMatrixAt(k, M4(V(Math.cos(a) * RR, HUB + Math.sin(a) * RR, 0)));
    }
    caps.instanceMatrix.needsUpdate = true; g.add(caps);
    for (const s of [-1, 1]) {
      const leg = new T.Mesh(new T.CylinderGeometry(1.2, 1.8, 90.7, 6), steel);
      leg.position.set(s * 11, 44, 0); leg.rotation.z = s * 0.245; g.add(leg);
    }
    const station = new T.Mesh(new T.BoxGeometry(34, 5, 26), ctx.mat(0x8a939c, { roughness: 0.7 }));
    station.position.y = 2.5; g.add(station);
    add(g);
  }

  // 6. Marina Bay Sands: three 55-storey towers with the SkyPark on top, across the water to the south
  const mbs = walk(430, 330, 0, 1, (x, z) => [-118, 0, 118].every(o => ctx.clearOf(x + o, z, 30)));
  if (mbs) {
    reserve(mbs.x, mbs.z, 200);
    const y = G(mbs.x, mbs.z);
    const glass = ctx.basic(0xffffff, { map: winTex({ w: 256, h: 512, cols: 8, rows: 44, bg: '#17293c', lit: ['#ffd982', '#f4e6b0', '#9fd0ff'], dark: '#0c1622', p: 0.4 }) });
    [-118, 0, 118].forEach(o => {
      const t = new T.Mesh(new T.BoxGeometry(40, 176, 40), glass);
      t.position.set(mbs.x + o, y + 88, mbs.z); t.name = 'Marina Bay Sands tower'; add(t);
    });
    const sky = new T.Mesh(new T.BoxGeometry(380, 9, 60), ctx.mat(0xc9ced4, { roughness: 0.5, metalness: 0.2 }));
    sky.position.set(mbs.x, y + 180.5, mbs.z); sky.name = 'Marina Bay Sands SkyPark'; add(sky);
  }

  // 7. downtown: dense lit towers, tallest near the centre, on land only (never in the bay, on the track or in reserved spots)
  const skyMats = [
    { w: 128, h: 256, cols: 6, rows: 14, bg: '#1b2433', lit: ['#ffd27a', '#fff0c2', '#9fd8ff'], dark: '#0f1622', p: 0.42 },
    { w: 128, h: 256, cols: 4, rows: 20, bg: '#243044', lit: ['#ffe6a0', '#ffb868'], dark: '#131b28', p: 0.35 },
    { w: 128, h: 256, cols: 8, rows: 10, bg: '#151d2b', lit: ['#cfe8ff', '#ffe9b8'], dark: '#0c121c', p: 0.5 }
  ].map(o => ctx.basic(0xffffff, { map: winTex(o) }));
  const towers = [];
  for (let tries = 0; tries < 12000 && towers.length < 320; tries++) {
    const x = -900 + ctx.rand() * 1800, z = -900 + ctx.rand() * 1150;
    const w = 12 + ctx.rand() * 14, d = 12 + ctx.rand() * 12;
    const dc = Math.hypot(x - 120, z + 300);
    const h = 18 + 150 * Math.exp(-(dc * dc) / (240 * 240)) * (0.35 + 0.65 * ctx.rand()) + ctx.rand() * 14;
    const r = Math.hypot(w / 2, d / 2) + 1;
    if (inBay(x, z) || !ctx.clearOf(x, z, r) || !free(x, z, r)) continue;
    towers.push({ x, z, w, d, h, v: Math.floor(ctx.rand() * 3) });
  }
  const boxBase = new T.BoxGeometry(1, 1, 1);
  boxBase.translate(0, 0.5, 0);
  for (let v = 0; v < 3; v++) {
    const list = towers.filter(t => t.v === v);
    if (!list.length) continue;
    const im = new T.InstancedMesh(boxBase, skyMats[v], list.length);
    list.forEach((t, i) => im.setMatrixAt(i, M4(V(t.x, G(t.x, t.z), t.z), null, V(t.w, t.h, t.d))));
    im.instanceMatrix.needsUpdate = true; im.name = 'downtown towers';
    add(im);
  }

  // 8. street lamps along the road, both sides in turn (about every 22 m), outside the barriers
  const NL = Math.max(8, Math.round(ctx.lengthM / 22));
  const lamps = [];
  for (let k = 0; k < NL; k++) {
    const p = P((k + 0.5) / NL), s = k % 2 ? 1 : -1, d = ctx.clear + 2.2;
    const x = p.x + s * p.lx * d, z = p.z + s * p.lz * d;
    if (inBay(x, z) || !ctx.clearOf(x, z, 1)) continue;
    lamps.push({ x, z, y: G(x, z), yaw: p.yaw });
  }
  if (lamps.length) {
    const poles = new T.InstancedMesh(new T.CylinderGeometry(0.2, 0.25, 9, 5), ctx.mat(0x5d646c, { roughness: 0.6, metalness: 0.4 }), lamps.length);
    const heads = new T.InstancedMesh(new T.BoxGeometry(0.7, 0.35, 1.4), ctx.basic(0xffe2a8), lamps.length);
    lamps.forEach((l, i) => {
      poles.setMatrixAt(i, M4(V(l.x, l.y + 4.5, l.z)));
      heads.setMatrixAt(i, M4(V(l.x, l.y + 8.8, l.z), qY(l.yaw)));
    });
    poles.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
    poles.name = 'street lamp posts'; heads.name = 'street lamp heads';
    add(poles); add(heads);
  }

  // 9. floodlight towers standing outside the barriers
  const FL = 9;
  for (let k = 0; k < FL; k++) {
    const p = P((k + 0.25) / FL), s = k % 2 ? -1 : 1, d = ctx.clear + 11;
    const x = p.x + s * p.lx * d, z = p.z + s * p.lz * d;
    if (inBay(x, z) || !ctx.clearOf(x, z, 4)) continue;
    const y = G(x, z);
    const mast = new T.Mesh(new T.CylinderGeometry(0.35, 0.55, 30, 6), ctx.mat(0x6b737c, { roughness: 0.6, metalness: 0.4 }));
    mast.position.set(x, y + 15, z); mast.name = 'floodlight mast'; add(mast);
    const head = new T.Mesh(new T.BoxGeometry(6, 2.4, 1.4), ctx.basic(0xfff8e6));
    head.position.set(x, y + 29.5, z); head.quaternion.copy(qY(p.yaw)); head.name = 'floodlight head'; add(head);
  }
};

