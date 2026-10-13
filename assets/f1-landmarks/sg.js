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
