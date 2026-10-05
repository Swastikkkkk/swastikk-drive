/* Venue scenery for drawn / custom tracks.
   buildCircuit (game.js) builds the road, ground, barriers and the start area at once, then asks this module for a
   list of jobs and runs them a few milliseconds per frame. Each job adds one kind of prop as an InstancedMesh with
   per-instance colour; game.js then runs its clearance / settle / collision passes on them and cuts every set into
   culled, distance-limited cells.

   Placement rules, for every prop:
     - seeded: the same track + seed grows the same scenery (every driver in a room sees the same venue)
     - spread round the WHOLE lap: positions come from arc length, so no stretch of road is left bare
     - density follows lap length (count per km), capped, so a long track is not a flood of objects
     - outside the road + barrier + a margin for the prop's own size (exact distance to the centre line)
     - not on top of each other (an occupancy grid with a minimum gap per prop)
     - kept out of the start / finish area (grid, gantry, pits) and off the first stretch after the line */
(function (window) {
  'use strict';

  /* palettes: every theme keeps its own ground colours (game.js THEMES) and gets racing accents on top */
  var PAL = {
    meadow:   { acc: [0xe4572e, 0xf3a712, 0x2f6fde, 0xffffff, 0xd6336c, 0x2fb37a], flower: [0xffd23f, 0xff6b6b, 0xffffff, 0xc77dff, 0xff9f1c], leaf: [0x3f8a3a, 0x2f6a26, 0x5b9a3c, 0x4c7f2c], set: 'green' },
    forest:   { acc: [0xf3a712, 0xe4572e, 0x4cc9f0, 0xffffff, 0xb5179e], flower: [0xfff3b0, 0xff8fab, 0xbde0fe], leaf: [0x1f4a1a, 0x2a5c22, 0x35702b], set: 'green' },
    autumn:   { acc: [0xffffff, 0x2f6fde, 0xe4572e, 0xf3a712, 0x2a9d8f], flower: [0xff9f1c, 0xe76f51, 0xf4a261], leaf: [0xc8553d, 0xe09f3e, 0xb5651d, 0x9e2a2b], set: 'green' },
    tropical: { acc: [0xff006e, 0xffbe0b, 0x3a86ff, 0xffffff, 0x06d6a0], flower: [0xff006e, 0xffbe0b, 0xfb5607, 0xffffff], leaf: [0x1b7a46, 0x2a9d5c, 0x158b5e], set: 'green' },
    coastal:  { acc: [0x2f6fde, 0xffffff, 0xe63946, 0xffbe0b, 0x00b4d8], flower: [0xffffff, 0xffd166, 0xef476f], leaf: [0x3f7a4a, 0x52906a], set: 'green' },
    sunset:   { acc: [0xffffff, 0x7b2cbf, 0xf3a712, 0xe4572e, 0x2f6fde], flower: [0xffb703, 0xfb8500, 0xffffff], leaf: [0x6e7c35, 0x8a7a2f], set: 'green' },
    snow:     { acc: [0xe63946, 0x1d6fe0, 0xffb703, 0x2ec4b6, 0xff006e, 0x7b2cbf], leaf: [0x1f4d3a, 0x235a43, 0x2c6650], set: 'snow' },
    alpine:   { acc: [0xe63946, 0x1d6fe0, 0xffb703, 0xffffff, 0x2ec4b6], leaf: [0x2a4d3a, 0x36604a], set: 'snow' },
    desert:   { acc: [0x2f6fde, 0xe63946, 0xffffff, 0x2ec4b6, 0x7b2cbf, 0xffbe0b], leaf: [0x5c7a3a, 0x6f8a45], set: 'desert' },
    canyon:   { acc: [0x2f6fde, 0xffffff, 0x2ec4b6, 0xffbe0b, 0x1d3557], leaf: [0x6b7a3a], set: 'desert' },
    city:     { acc: [0xff006e, 0x3a86ff, 0xffbe0b, 0x06d6a0, 0xffffff, 0xfb5607], leaf: [0x3f8a3a, 0x2f7a3a], set: 'city' },
    moon:     { acc: [0x4cc9f0, 0xf72585, 0x7209b7, 0x80ffdb, 0xffbe0b], leaf: [0x777777], set: 'moon' },
    volcanic: { acc: [0xff5a1f, 0xffbe0b, 0xffffff, 0xe63946], leaf: [0x2a2422], set: 'lava' },
    night:    { acc: [0x5cf2ff, 0xff2bd6, 0xfaff00, 0x7cff6b, 0xffffff], leaf: [0x1e2a22], set: 'neon' },
    rocky:    { acc: [0xe63946, 0x2f6fde, 0xffbe0b, 0xffffff], leaf: [0x56604f], set: 'rock' },
    mountain: { acc: [0xe63946, 0x2f6fde, 0xffbe0b, 0xffffff, 0x2ec4b6], leaf: [0x2f4a33, 0x3a5a3d], set: 'rock' }
  };

  // window grid texture for city buildings: drawn once, shared by every build (game.js never disposes "shared" maps)
  var WIN_TEX = null;
  function winTex(THREE) {
    if (WIN_TEX) return WIN_TEX;
    var c = document.createElement('canvas'); c.width = 64; c.height = 128; var g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 128);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 4; x++) {
      var lit = Math.random() < .45; g.fillStyle = lit ? '#ffe9a8' : '#2a3140';
      g.fillRect(4 + x * 15, 4 + y * 8, 10, 5);
    }
    WIN_TEX = new THREE.CanvasTexture(c); WIN_TEX.wrapS = WIN_TEX.wrapT = THREE.RepeatWrapping; WIN_TEX.__shared = true;
    return WIN_TEX;
  }
  var NUM_TEX = {};
  function boardTex(THREE, text, bg, fg) {
    var k = text + bg + fg; if (NUM_TEX[k]) return NUM_TEX[k];
    var c = document.createElement('canvas'); c.width = 128; c.height = 128; var g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 128, 128); g.fillStyle = fg;
    if (text === '>') {           // chevron arrow
      g.beginPath(); g.moveTo(30, 18); g.lineTo(86, 64); g.lineTo(30, 110); g.lineTo(52, 110); g.lineTo(108, 64); g.lineTo(52, 18); g.closePath(); g.fill();
    } else { g.font = 'bold 64px Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 68); }
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(5, 5, 118, 118);
    var t = new THREE.CanvasTexture(c); t.__shared = true; NUM_TEX[k] = t; return t;
  }

  function jobs(ctx) {
    var THREE = ctx.THREE, root = ctx.root, rnd = ctx.seeded, M = ctx.M, add = ctx.addMat, LOW = ctx.LOW;
    var pal = PAL[ctx.theme.id] || PAL.meadow, set = pal.set, HALF = ctx.CIRC_W / 2, EDGE = HALF + ctx.BARRIER_OFF;
    var TL = ctx.TL, km = TL / 1000, dens = LOW ? .55 : 1;
    var up = new THREE.Vector3(0, 1, 0), MX = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), SC = new THREE.Vector3(), COL = new THREE.Color(), EU = new THREE.Euler();
    var S0 = ctx.alongT(0);
    var pick = function (a) { return a[(rnd() * a.length) | 0]; };

    // ---- occupancy: a 4 m grid of taken spots, so props keep a minimum gap from each other ----
    var OCC = new Map();
    var okey = function (x, z) { return Math.floor(x / 4) * 73856093 ^ Math.floor(z / 4) * 19349663; };
    function free(x, z, r) {
      var n = Math.ceil(r / 4);
      for (var a = -n; a <= n; a++) for (var b = -n; b <= n; b++) {
        var L = OCC.get(okey(x + a * 4, z + b * 4)); if (!L) continue;
        for (var i = 0; i < L.length; i++) { var o = L[i]; if (Math.hypot(o[0] - x, o[1] - z) < r + o[2]) return false; }
      }
      return true;
    }
    function take(x, z, r) { var k = okey(x, z), L = OCC.get(k); if (!L) OCC.set(k, L = []); L.push([x, z, r]); }
    // the start / finish area: the grid behind the line, the gantry, pits and the first run after the line
    function inStart(x, z, r) {
      var dx = x - S0.p.x, dz = z - S0.p.z, along = dx * S0.tx + dz * S0.tz, side = Math.abs(dx * S0.nx + dz * S0.nz);
      return along > -75 && along < 40 && side < HALF + 40 + r;
    }
    /* a clear spot for a prop of radius r, `off` metres outside the barrier line, at arc distance d; checks the whole
       lap (not just the road at d), other props and the start area. Returns null if it does not fit. */
    function spot(d, sd, off, r) {
      var a = ctx.alongT(d), x = a.p.x + a.nx * sd * (EDGE + off), z = a.p.z + a.nz * sd * (EDGE + off);
      if (ctx.trackDist(x, z, EDGE + off + r + 4) < EDGE + r + 1.2) return null;
      if (inStart(x, z, r) || !free(x, z, r)) return null;
      take(x, z, r); return { x: x, z: z, yaw: a.yaw, a: a, y: ctx.gy(x, z) };
    }
    // scattered across the open ground between `lo` and `hi` metres past the barrier, anywhere round the lap
    function scatter(n, lo, hi, r, fn) {
      var placed = 0;
      for (var t = 0; t < n * 12 && placed < n; t++) {
        var d = rnd() * TL, sd = rnd() < .5 ? -1 : 1, off = lo + rnd() * rnd() * (hi - lo);
        var s = spot(d, sd, off, r); if (!s) continue;
        // jitter along the road too, so props do not line up in rows
        s.x += (rnd() - .5) * 6; s.z += (rnd() - .5) * 6; fn(s, sd); placed++;
      }
      return placed;
    }
    // instanced set builder: one InstancedMesh per prop part, per-instance colour, counted down to what was used
    function set_(geo, mat, cap, shadow) {
      var im = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
      // the colour buffer is made at full size up front (white = the material's own colour): three r128 sizes it from
      // the live count on the first setColorAt, and these sets count up from zero, which left every colour black
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 3).fill(1), 3);
      im.count = 0; im.castShadow = !!shadow && !LOW; im.receiveShadow = true;
      im.userData.cap = cap; root.add(im);
      im.put = function (x, y, z, sx, sy, sz, yaw, col, rx, rz) {
        if (im.count >= cap) return; EU.set(rx || 0, yaw || 0, rz || 0, 'YXZ'); Q.setFromEuler(EU); P.set(x, y, z); SC.set(sx, sy, sz); MX.compose(P, Q, SC);
        im.setMatrixAt(im.count, MX); if (col != null && im.setColorAt) im.setColorAt(im.count, COL.set(col)); im.count++;
      };
      im.done = function () { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; };
      return im;
    }
    var white = function (o) { return add(M(0xffffff, o || { roughness: .9 })); };
    var basic = function (c) { return add(new THREE.MeshBasicMaterial({ color: c })); };
    var J = [];

    // corners: the sharpest bends, their arc position and which side is the outside
    var SN = Math.max(60, Math.min(400, Math.round(TL / 6))), corners = [];
    (function () {
      var turn = [], curl = [];
      for (var i = 0; i < SN; i++) {
        var a = ctx.alongT((i - 1) / SN * TL), b = ctx.alongT((i + 1) / SN * TL);
        turn.push(Math.acos(Math.max(-1, Math.min(1, a.tx * b.tx + a.tz * b.tz)))); curl.push(a.tx * b.tz - a.tz * b.tx);
      }
      for (var i2 = 0; i2 < SN; i2++) {
        if (turn[i2] < .06) continue; var mx = true;
        for (var k = -3; k <= 3; k++) if (turn[(i2 + k + SN) % SN] > turn[i2]) { mx = false; break; }
        if (mx && !corners.some(function (c) { return Math.abs(c.d - i2 / SN * TL) < 60; })) corners.push({ d: i2 / SN * TL, out: curl[i2] > 0 ? -1 : 1, k: turn[i2] });
      }
      corners.sort(function (a, b) { return b.k - a.k; });
    })();

    // ================= on every track =================
    // trackside flag poles with pennants in the theme's racing colours, every ~45 m, alternating sides
    J.push(function () {
      var n = Math.round(TL / 45), pole = set_(new THREE.CylinderGeometry(.07, .09, 6, 6), white({ roughness: .5 }), n, false),
        flag = set_(new THREE.PlaneGeometry(1.6, 1.1).translate(.8, 0, 0), add(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })), n, false);
      for (var i = 0; i < n; i++) {
        var s = spot((i + .5) / n * TL, i % 2 ? 1 : -1, 2.2, 1); if (!s) continue; var c = pal.acc[i % pal.acc.length];
        pole.put(s.x, s.y + 3, s.z, 1, 1, 1, 0, 0xdedede); flag.put(s.x, s.y + 5.3, s.z, 1, 1, 1, s.yaw + Math.PI / 2 + (rnd() - .5) * .6, c);
      }
      pole.done(); flag.done();
    });
    // banner boards along the barrier line, in blocks of colour (the barrier itself stays the theme's own)
    J.push(function () {
      var n = Math.round(TL / 32 * dens), board = set_(new THREE.BoxGeometry(.18, 1.25, 7.4), white({ roughness: .6 }), n, false),
        legs = set_(new THREE.BoxGeometry(.16, .7, .16), white(), n * 2, false);
      for (var i = 0; i < n; i++) {
        var d = (i + rnd() * .6) / n * TL, sd = rnd() < .5 ? -1 : 1, s = spot(d, sd, 1.2, 3.8); if (!s) continue;
        var c = pal.acc[(rnd() * pal.acc.length) | 0];
        board.put(s.x, s.y + 1.25, s.z, 1, 1, 1, s.yaw, c);
        for (var k = -1; k <= 1; k += 2) legs.put(s.x + s.a.tx * k * 3, s.y + .35, s.z + s.a.tz * k * 3, 1, 1, 1, 0, 0x333333);
      }
      board.done(); legs.done();
    });
    // street lamps round the lap, heads glowing (cheap: no real lights)
    J.push(function () {
      var n = Math.round(TL / 70), post = set_(new THREE.CylinderGeometry(.12, .18, 8, 6), white({ roughness: .5 }), n, true),
        arm = set_(new THREE.BoxGeometry(.12, .12, 2.6), white(), n, false), head = set_(new THREE.BoxGeometry(.5, .2, 1), basic(0xfff1c4), n, false);
      for (var i = 0; i < n; i++) {
        var sd = i % 2 ? 1 : -1, s = spot((i + .25) / n * TL, sd, 3.2, 1.2); if (!s) continue;
        var ix = -s.a.nx * sd, iz = -s.a.nz * sd, yaw = Math.atan2(ix, iz);
        post.put(s.x, s.y + 4, s.z, 1, 1, 1, 0, set === 'neon' ? 0x15171c : 0x8d9198);
        arm.put(s.x + ix * 1.2, s.y + 7.9, s.z + iz * 1.2, 1, 1, 1, yaw, 0x8d9198); head.put(s.x + ix * 2.3, s.y + 7.75, s.z + iz * 2.3, 1, 1, 1, yaw, set === 'neon' ? pick(pal.acc) : 0xfff1c4);
      }
      post.done(); arm.done(); head.done();
    });
    // corners: chevron boards on the outside, orange cones at the apex, distance boards before the sharpest ones
    J.push(function () {
      var chev = add(new THREE.MeshBasicMaterial({ map: boardTex(THREE, '>', '#111317', '#ffd23f'), side: THREE.DoubleSide })), chevIM = set_(new THREE.PlaneGeometry(2.2, 2.2), chev, corners.length * 4, false),
        cone = set_(new THREE.ConeGeometry(.3, .8, 8), add(M(0xff6b1a, { roughness: .6 })), corners.length * 6, false),
        post = set_(new THREE.BoxGeometry(.14, 1.4, .14), white(), corners.length * 4 + 30, false);
      corners.forEach(function (c) {
        for (var k = -1; k <= 2; k++) {
          var s = spot(c.d + k * 9, c.out, .8, 1.3); if (!s) continue;
          // face the drivers coming into the bend, arrow pointing the way it turns
          var face = Math.atan2(-s.a.tx, -s.a.tz);
          chevIM.put(s.x, s.y + 2.1, s.z, c.out > 0 ? 1 : -1, 1, 1, face, 0xffffff); post.put(s.x, s.y + .7, s.z, 1, 1, 1, 0, 0x222222);
        }
        for (var j = 0; j < 6; j++) { var s2 = spot(c.d + (j - 2.5) * 3, -c.out, .3 + (j % 2) * .6, .4); if (s2) cone.put(s2.x, s2.y + .4, s2.z, 1, 1, 1, 0, 0xff6b1a); }
      });
      // 300 / 200 / 100 boards before the three sharpest corners
      corners.slice(0, 3).forEach(function (c) {
        ['300', '200', '100'].forEach(function (t, k) {
          var d = c.d - (3 - k) * 100 * Math.min(1, TL / 1600), s = spot(d, c.out, 1, 1); if (!s) return;
          var m = add(new THREE.MeshBasicMaterial({ map: boardTex(THREE, t, '#ffffff', '#111317'), side: THREE.DoubleSide })),
            b = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), m);
          b.position.set(s.x, s.y + 1.9, s.z); b.rotation.y = Math.atan2(-s.a.tx, -s.a.tz); root.add(b); post.put(s.x, s.y + .7, s.z, 1, 1, 1, 0, 0x222222);
        });
      });
      chevIM.done(); cone.done(); post.done();
    });

    // ================= per theme =================
    var G = function (n) { return Math.round(n * km * dens); };
    if (set === 'green') {
      // flower meadows and grass tufts along the verges, the whole way round
      J.push(function () {
        var nF = Math.min(900, G(260)), fl = set_(new THREE.IcosahedronGeometry(.28, 0), add(M(0xffffff, { roughness: .8 })), nF, false),
          tuft = set_(new THREE.ConeGeometry(.35, .9, 5), add(M(0xffffff, { roughness: 1 })), nF, false);
        scatter(nF / 6, 2, 26, 3, function (s) {
          var c = pick(pal.flower || pal.acc);
          for (var k = 0; k < 6; k++) { var x = s.x + (rnd() - .5) * 5, z = s.z + (rnd() - .5) * 5; fl.put(x, s.y + .3, z, 1, .7, 1, rnd() * 6, c); tuft.put(x + (rnd() - .5), s.y + .4, z + (rnd() - .5), 1, .8 + rnd() * .6, 1, rnd() * 6, pick(pal.leaf)); }
        });
        fl.done(); tuft.done();
      });
      // round-canopy trees and bushes mixed in with the theme's own forest
      J.push(function () {
        var n = Math.min(260, G(70)), trunk = set_(new THREE.CylinderGeometry(.18, .28, 1, 6), add(M(0x5a4128, { roughness: .9 })), n, true),
          crown = set_(new THREE.IcosahedronGeometry(1, 1), add(M(0xffffff, { roughness: .95 })), n * 2, true), bush = set_(new THREE.IcosahedronGeometry(1, 0), add(M(0xffffff, { roughness: .95 })), n, false);
        scatter(n, 10, 70, 4, function (s) {
          var h = 3 + rnd() * 3, c = pick(pal.leaf), sc = 1.6 + rnd() * 1.4;
          trunk.put(s.x, s.y + h / 2, s.z, 1, h, 1, 0, null);
          crown.put(s.x, s.y + h + sc * .6, s.z, sc, sc * .9, sc, rnd() * 6, c); crown.put(s.x + .6, s.y + h + sc * .2, s.z - .4, sc * .7, sc * .6, sc * .7, rnd() * 6, c);
          if (rnd() < .6) bush.put(s.x + 2, s.y + .5, s.z + 1.5, 1.1, .7, 1, rnd() * 6, pick(pal.leaf));
        });
        trunk.done(); crown.done(); bush.done();
      });
      // wooden fences on the straights, a little way off the road
      J.push(function () {
        var n = Math.min(500, G(160)), post = set_(new THREE.BoxGeometry(.16, 1.2, .16), add(M(0x7a5a3a, { roughness: .95 })), n, false), rail = set_(new THREE.BoxGeometry(.08, .12, 3.1), add(M(0x9a7550, { roughness: .95 })), n * 2, false);
        for (var i = 0; i < n; i++) {
          var d = i / n * TL; if (corners.some(function (c) { return Math.abs(c.d - d) < 40; })) continue;
          var s = spot(d, (Math.floor(i / 12) % 2) ? 1 : -1, 7, .4); if (!s) continue;
          post.put(s.x, s.y + .6, s.z, 1, 1, 1, s.yaw, null); rail.put(s.x + s.a.tx * 1.5, s.y + .55, s.z + s.a.tz * 1.5, 1, 1, 1, s.yaw, null); rail.put(s.x + s.a.tx * 1.5, s.y + 1, s.z + s.a.tz * 1.5, 1, 1, 1, s.yaw, null);
        }
        post.done(); rail.done();
      });
      J.push(function () { cabins(Math.min(14, 2 + G(3)), [0xb8322f, 0x2f6fde, 0xf3a712, 0xffffff], [0x3a3934, 0x5a3a2a]); });
    }
    if (set === 'snow') {
      // snowbanks pushed up along both verges, the whole lap
      J.push(function () {
        var n = Math.round(TL / 9), bank = set_(new THREE.SphereGeometry(1, 10, 6), add(M(0xffffff, { roughness: 1 })), n, false);
        for (var i = 0; i < n; i++) { var s = spot(i / n * TL + rnd() * 4, i % 2 ? 1 : -1, .4 + rnd() * 1.2, 1.5); if (s) bank.put(s.x, s.y + .1, s.z, 3 + rnd() * 2.5, .7 + rnd() * .6, 1.6 + rnd(), s.yaw, rnd() < .5 ? 0xf4f8ff : 0xe3ecf7); }
        bank.done();
      });
      // snowy pines: dark green tiers with white caps, in groves all round
      J.push(function () {
        var n = Math.min(520, G(150)), trunk = set_(new THREE.CylinderGeometry(.16, .26, 1, 6), add(M(0x4a3a2c, { roughness: .9 })), n, true),
          tier = set_(new THREE.ConeGeometry(1.5, 2.4, 8), add(M(0xffffff, { roughness: .95 })), n * 3, true), cap = set_(new THREE.ConeGeometry(1.1, .9, 8), add(M(0xffffff, { roughness: 1 })), n * 3, false);
        scatter(n, 6, 90, 2.6, function (s) {
          var sc = .8 + rnd() * 1.2, h = 2.6 * sc, c = pick(pal.leaf);
          trunk.put(s.x, s.y + h / 2, s.z, sc, h, sc, 0, null);
          for (var t = 0; t < 3; t++) { var y = s.y + h * (.55 + t * .32), w = sc * (1 - t * .22); tier.put(s.x, y, s.z, w, sc, w, rnd() * 6, c); cap.put(s.x, y + .75 * sc, s.z, w * 1.02, sc * .5, w * 1.02, rnd() * 6, 0xf6f9ff); }
        });
        trunk.done(); tier.done(); cap.done();
      });
      // snow-capped rocks, ice patches, cabins and a few snowmen
      J.push(function () {
        var n = Math.min(160, G(45)), rock = set_(new THREE.DodecahedronGeometry(1, 0), add(M(0x6c7380, { roughness: .95 })), n, true), cap = set_(new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), add(M(0xffffff, { roughness: 1 })), n, false),
          ice = set_(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), add(new THREE.MeshLambertMaterial({ color: 0xbfe3ff, transparent: true, opacity: .75 })), 40, false);
        scatter(n, 4, 80, 2, function (s) { var sc = .7 + rnd() * 1.8; rock.put(s.x, s.y + sc * .3, s.z, sc * 1.2, sc * .8, sc, rnd() * 6, null); cap.put(s.x, s.y + sc * .75, s.z, sc * 1.05, sc * .35, sc * .9, 0, null); });
        scatter(Math.min(40, G(10)), 10, 60, 5, function (s) { ice.put(s.x, s.y + .06, s.z, 3 + rnd() * 4, 1, 2 + rnd() * 3, rnd() * 6, null); });
        rock.done(); cap.done(); ice.done();
        snowmen(Math.min(10, 2 + G(2)));
      });
      J.push(function () { cabins(Math.min(14, 2 + G(3)), [0xb8322f, 0x2f6fde, 0x7b4a2a, 0xf3a712], [0xf4f8ff]); });
    }
    if (set === 'desert') {
      J.push(function () {
        var n = Math.min(320, G(90)), trunk = set_(new THREE.CylinderGeometry(.35, .42, 1, 8), add(M(0x3f7a3a, { roughness: .8 })), n, true), arm = set_(new THREE.CylinderGeometry(.24, .26, 1, 7), add(M(0x3f7a3a, { roughness: .8 })), n * 2, false);
        scatter(n, 4, 80, 2, function (s) {
          var h = 3 + rnd() * 3.5, c = rnd() < .5 ? 0x3f7a3a : 0x4f8a45; trunk.put(s.x, s.y + h / 2, s.z, 1, h, 1, 0, c);
          for (var k = 0; k < 2; k++) if (rnd() < .75) { var sd = k ? 1 : -1, ah = 1 + rnd() * 1.3, ay = s.y + h * (.4 + rnd() * .25), yaw = rnd() * 6;
            arm.put(s.x + Math.cos(yaw) * sd * .7, ay, s.z + Math.sin(yaw) * sd * .7, 1, .8, 1, 0, c, 0, sd * 1.57);
            arm.put(s.x + Math.cos(yaw) * sd * 1.05, ay + ah / 2 + .3, s.z + Math.sin(yaw) * sd * 1.05, 1, ah, 1, 0, c); }
        });
        trunk.done(); arm.done();
      });
      // red rock formations and mesas, dry scrub
      J.push(function () {
        var n = Math.min(120, G(30)), mesa = set_(new THREE.CylinderGeometry(1, 1.25, 1, 7), add(M(0xffffff, { roughness: .95 })), n, true), scrub = set_(new THREE.IcosahedronGeometry(1, 0), add(M(0xffffff, { roughness: 1 })), Math.min(600, G(160)), false);
        scatter(n, 18, 120, 9, function (s) { var w = 3 + rnd() * 7, h = 4 + rnd() * 12; mesa.put(s.x, s.y + h / 2 - .5, s.z, w, h, w * (.7 + rnd() * .5), rnd() * 6, pick([0xb5532f, 0xc8693c, 0x9e4426, 0xd98a52])); });
        scatter(Math.min(600, G(160)), 2, 70, 1, function (s) { var sc = .5 + rnd() * .8; scrub.put(s.x, s.y + sc * .35, s.z, sc, sc * .6, sc, rnd() * 6, pick([0x8a7a46, 0x9b8a52, 0x6e6a3a, 0xa0763d])); });
        mesa.done(); scrub.done();
      });
      J.push(function () { cabins(Math.min(10, 2 + G(2)), [0xe9d8a6, 0xd98a52, 0x2f6fde], [0x8a5a3a]); });
    }
    if (set === 'city') {
      // a skyline: blocks of varied heights and colours with lit windows, set back from the circuit
      J.push(function () {
        var n = Math.min(260, G(70)), bm = add(new THREE.MeshLambertMaterial({ color: 0xffffff, map: winTex(THREE) })), blk = set_(new THREE.BoxGeometry(1, 1, 1), bm, n, true),
          roof = set_(new THREE.BoxGeometry(1, 1, 1), add(M(0x3a3d44, { roughness: .8 })), n, false);
        scatter(n, 22, 150, 14, function (s) {
          var w = 10 + rnd() * 14, dpt = 10 + rnd() * 14, h = 12 + rnd() * rnd() * 70, yaw = s.yaw + (rnd() < .5 ? 0 : Math.PI / 2);
          blk.put(s.x, s.y + h / 2, s.z, w, h, dpt, yaw, pick([0xd9d4c6, 0x9db9c1, 0xe7c7a1, 0xb0b8c9, 0xc96f53, 0x7f8fa6, 0xe8e2d4]));
          roof.put(s.x, s.y + h + .4, s.z, w * .9, .8, dpt * .9, yaw, null);
        });
        blk.done(); roof.done();
      });
      // billboards on legs and planters with trees along the verge
      J.push(function () {
        var n = Math.min(70, G(20)), board = set_(new THREE.BoxGeometry(9, 4.5, .4), add(M(0xffffff, { roughness: .6, emissive: 0x111111 })), n, true), leg = set_(new THREE.BoxGeometry(.4, 6, .4), add(M(0x40444c)), n * 2, false);
        scatter(n, 6, 30, 5, function (s) { var yaw = Math.atan2(-s.a.nx, -s.a.nz); board.put(s.x, s.y + 7.5, s.z, 1, 1, 1, yaw, pick(pal.acc));
          for (var k = -1; k <= 1; k += 2) leg.put(s.x + Math.cos(yaw) * k * 3.5, s.y + 3, s.z - Math.sin(yaw) * k * 3.5, 1, 1, 1, 0, null); });
        var nP = Math.min(200, G(60)), pl = set_(new THREE.BoxGeometry(2, .9, 2), add(M(0x9a9893)), nP, false), tr = set_(new THREE.IcosahedronGeometry(1, 1), add(M(0xffffff)), nP, false);
        scatter(nP, 3, 22, 2, function (s) { pl.put(s.x, s.y + .45, s.z, 1, 1, 1, s.yaw, null); tr.put(s.x, s.y + 2.4, s.z, 1.4, 1.6, 1.4, rnd() * 6, pick(pal.leaf)); });
        board.done(); leg.done(); pl.done(); tr.done();
      });
    }
    if (set === 'moon') {
      // craters (raised rims with a dark floor), glowing crystals, beacon markers, habitat domes, planets in the sky
      J.push(function () {
        var n = Math.min(160, G(45)), rim = set_(new THREE.TorusGeometry(1, .22, 6, 18).rotateX(Math.PI / 2), add(M(0x8a8c92, { roughness: 1 })), n, false),
          floor = set_(new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), add(M(0x3e4046, { roughness: 1 })), n, false);
        scatter(n, 6, 140, 8, function (s) { var r = 3 + rnd() * rnd() * 14; rim.put(s.x, s.y + .1, s.z, r, r * 1.4, r, 0, null); floor.put(s.x, s.y + .04, s.z, r * .95, 1, r * .95, 0, null); });
        rim.done(); floor.done();
      });
      J.push(function () {
        var n = Math.min(260, G(70)), cr = set_(new THREE.OctahedronGeometry(1, 0), add(new THREE.MeshBasicMaterial({ color: 0xffffff })), n, false);
        scatter(n / 4, 3, 90, 3, function (s) { var c = pick(pal.acc); for (var k = 0; k < 4; k++) { var h = .8 + rnd() * 2.2; cr.put(s.x + (rnd() - .5) * 3, s.y + h * .5, s.z + (rnd() - .5) * 3, .45 * h / 2, h, .45 * h / 2, rnd() * 6, c, (rnd() - .5) * .6, (rnd() - .5) * .6); } });
        cr.done();
        var nb = Math.round(TL / 60), post = set_(new THREE.CylinderGeometry(.12, .12, 3, 6), add(M(0xd0d4dc)), nb, false), glow = set_(new THREE.SphereGeometry(.35, 10, 8), add(new THREE.MeshBasicMaterial({ color: 0xffffff })), nb, false);
        for (var i = 0; i < nb; i++) { var s = spot((i + .5) / nb * TL, i % 2 ? 1 : -1, 1.4, 1); if (!s) continue; post.put(s.x, s.y + 1.5, s.z, 1, 1, 1, 0, null); glow.put(s.x, s.y + 3.2, s.z, 1, 1, 1, 0, pal.acc[i % pal.acc.length]); }
        post.done(); glow.done();
        var nd = Math.min(12, 3 + G(2)), dome = set_(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), add(M(0xe8ecf2, { roughness: .4 })), nd, true);
        scatter(nd, 30, 110, 12, function (s) { var r = 6 + rnd() * 8; dome.put(s.x, s.y, s.z, r, r * .8, r, 0, null); });
        dome.done();
        // planets hanging over the horizon: big, unlit, outside the fog
        [[0x4c6fff, 140, .9], [0xff7a45, 90, 2.4], [0xb48cff, 60, 4.1]].forEach(function (p) {
          var m = new THREE.Mesh(new THREE.SphereGeometry(p[1], 24, 16), add(new THREE.MeshBasicMaterial({ color: p[0], fog: false })));
          var R = ctx.r0 + 1400; m.position.set(ctx.cx + Math.cos(p[2]) * R, ctx.CIRC_Y + 260 + p[1], ctx.cz + Math.sin(p[2]) * R); m.userData.fixedY = true; m.userData.onTrack = true; m.renderOrder = -2; root.add(m);
        });
      });
    }
    if (set === 'lava' || set === 'neon' || set === 'rock') {
      J.push(function () {
        var n = Math.min(320, G(80)), rock = set_(new THREE.DodecahedronGeometry(1, 0), add(M(0xffffff, { roughness: .95 })), n, true),
          glow = set_(new THREE.IcosahedronGeometry(1, 0), add(new THREE.MeshBasicMaterial({ color: 0xffffff })), set === 'rock' ? 1 : Math.min(140, G(35)), false);
        scatter(n, 3, 110, 2.5, function (s) { var sc = .6 + rnd() * rnd() * 3.5; rock.put(s.x, s.y + sc * .3, s.z, sc * 1.2, sc * .8, sc, rnd() * 6, set === 'lava' ? pick([0x2a2422, 0x3a2e2a, 0x1c1816]) : pick([0x6c6863, 0x7a756d, 0x5d5953, 0x8a847a])); });
        if (set !== 'rock') scatter(Math.min(140, G(35)), 4, 90, 1.5, function (s) { var sc = .4 + rnd() * .8; glow.put(s.x, s.y + sc * .4, s.z, sc, sc * .7, sc, rnd() * 6, set === 'lava' ? pick([0xff5a1f, 0xffbe0b, 0xff2d00]) : pick(pal.acc)); });
        rock.done(); glow.done();
      });
      J.push(function () { cabins(Math.min(8, 2 + G(2)), set === 'neon' ? [0x1c1c22] : [0x5a504a, 0x8a7a6a, 0xb8322f], [0x2a2a2e]); });
    }

    // small buildings (cabins, huts, sheds) set back from the track: walls in a few colours, pitched roofs
    function cabins(n, walls, roofs) {
      var wall = set_(new THREE.BoxGeometry(1, 1, 1), add(M(0xffffff, { roughness: .85 })), n, true), roof = set_(new THREE.CylinderGeometry(0, .78, 1, 4, 1).rotateY(Math.PI / 4), add(M(0xffffff, { roughness: .8 })), n, true),
        door = set_(new THREE.BoxGeometry(.1, 2, 1.1), add(M(0x3a2a20)), n, false);
      scatter(n, 20, 80, 6, function (s) {
        var w = 5 + rnd() * 3, dd = 4 + rnd() * 3, h = 3 + rnd() * 1.2, yaw = rnd() * 6;
        wall.put(s.x, s.y + h / 2, s.z, w, h, dd, yaw, pick(walls)); roof.put(s.x, s.y + h + 1.1, s.z, w * 1.25, 2.2, dd * 1.3, yaw, pick(roofs));
        door.put(s.x + Math.cos(yaw) * w / 2, s.y + 1, s.z - Math.sin(yaw) * w / 2, 1, 1, 1, yaw, null);
      });
      wall.done(); roof.done(); door.done();
      wall.userData.solidInst = { hx: .5, hy: .5, hz: .5, yo: 0 };
    }
    function snowmen(n) {
      var body = set_(new THREE.SphereGeometry(1, 10, 8), add(M(0xffffff, { roughness: 1 })), n * 3, false), hat = set_(new THREE.CylinderGeometry(.22, .22, .35, 8), add(M(0x1a1a1e)), n, false),
        nose = set_(new THREE.ConeGeometry(.06, .3, 6).rotateX(Math.PI / 2), add(M(0xff7a1a)), n, false), scarf = set_(new THREE.TorusGeometry(.32, .07, 6, 12).rotateX(Math.PI / 2), add(M(0xffffff)), n, false);
      scatter(n, 6, 40, 2, function (s) {
        var yaw = Math.atan2(s.a.p.x - s.x, s.a.p.z - s.z);
        body.put(s.x, s.y + .6, s.z, .7, .7, .7, 0, null); body.put(s.x, s.y + 1.45, s.z, .5, .5, .5, 0, null); body.put(s.x, s.y + 2.05, s.z, .34, .34, .34, 0, null);
        hat.put(s.x, s.y + 2.45, s.z, 1, 1, 1, 0, null); nose.put(s.x + Math.sin(yaw) * .35, s.y + 2.05, s.z + Math.cos(yaw) * .35, 1, 1, 1, yaw, null); scarf.put(s.x, s.y + 1.78, s.z, 1, 1, 1, 0, pick(pal.acc));
      });
      body.done(); hat.done(); nose.done(); scarf.done();
    }
    return J;
  }

  window.VenueDecor = { jobs: jobs, PAL: PAL };
})(window);
