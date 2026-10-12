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
