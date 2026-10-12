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
