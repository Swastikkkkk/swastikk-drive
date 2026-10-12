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
