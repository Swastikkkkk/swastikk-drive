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
