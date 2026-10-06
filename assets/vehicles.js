/**
 * Vehicle bodies, built from lofted cross-sections instead of boxes.
 *
 * A body is a run of stations along the car (z, front = +z). Each station has a bottom edge (which follows the
 * wheel arches), a top edge (bonnet / waist / boot), a half width, and a "squareness" exponent for its rounded
 * cross-section. Lofting those gives one smooth shell with a real silhouette. The glasshouse is a second loft on
 * top of the waist, tapering in toward the roof, with a body-coloured roof panel over it. Lights, grilles, mirrors,
 * bumpers, wings, exhausts and the rest are added per model.
 *
 * Coordinates match the old builders: ground at y = 0, axles at z = zf / zb, wheel centres at y = r. The wheels
 * themselves are drawn by game.js from the physics wheels, so a body only needs to leave room for them.
 *
 * VehicleKit.build(id, o) returns {g, body, wheels: [], tail, paint, rev} like CarBuilder, or null for ids it does
 * not model (the EVs and the F1 keep their existing builders).
 */
(function (window) {
  'use strict';
  var CB = window.CarBuilder || {};
  var phong = CB.phong || function (c, o) { return new THREE.MeshPhongMaterial(Object.assign({ color: c, shininess: 80 }, o || {})); };
  var glassM = phong(0x0a0e13, { specular: 0x8a949c, shininess: 120, reflectivity: 0.14, side: THREE.DoubleSide });
  var trimM = new THREE.MeshPhongMaterial({ color: 0x15161a, specular: 0x2a2a2e, shininess: 20 });
  var darkM = new THREE.MeshLambertMaterial({ color: 0x0b0b0c });
  var chromeM = phong(0xd8dce0, { specular: 0xffffff, shininess: 150, reflectivity: 0.8 });
  var greyM = new THREE.MeshPhongMaterial({ color: 0x3b3d42, specular: 0x333333, shininess: 30 });
  var rubberM = new THREE.MeshPhongMaterial({ color: 0x141414, specular: 0x222222, shininess: 8 });
  var revM = new THREE.MeshLambertMaterial({ color: 0xdedede, emissive: 0xffffff, emissiveIntensity: 0.15 });

  // ---------- profile helpers ----------
  // keys: [[z, value], ...] sorted by z; cosine-eased between keys, held flat outside
  function prof(keys) {
    return function (z) {
      if (z <= keys[0][0]) return keys[0][1];
      for (var i = 1; i < keys.length; i++) {
        if (z <= keys[i][0]) {
          var a = keys[i - 1], b = keys[i], t = (z - a[0]) / Math.max(1e-6, b[0] - a[0]);
          t = (1 - Math.cos(t * Math.PI)) / 2;
          return a[1] + (b[1] - a[1]) * t;
        }
      }
      return keys[keys.length - 1][1];
    };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* Loft a closed shell. S: array of stations {z, yb, yt, hw, n, top} where top is the half-width factor at the
     top edge (tumblehome) and n the superellipse exponent (2 = oval, 6+ = nearly square). Ends are capped. */
  function loft(S, mat, M) {
    M = M || 22;
    var pos = [], idx = [];
    for (var i = 0; i < S.length; i++) {
      var s = S[i], mid = (s.yb + s.yt) / 2, hh = Math.max(0.005, (s.yt - s.yb) / 2), e = 2 / (s.n || 4);
      for (var j = 0; j < M; j++) {
        var a = j / M * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        var x = Math.sign(c) * Math.pow(Math.abs(c), e), y = Math.sign(sn) * Math.pow(Math.abs(sn), e);
        var hgt = (y + 1) / 2, w = s.hw * lerp(s.bot == null ? 1 : s.bot, s.top == null ? 1 : s.top, hgt);
        pos.push(x * w, mid + y * hh, s.z);
      }
    }
    for (var i2 = 0; i2 < S.length - 1; i2++) {
      for (var j2 = 0; j2 < M; j2++) {
        var a0 = i2 * M + j2, a1 = i2 * M + (j2 + 1) % M, b0 = a0 + M, b1 = a1 + M;
        idx.push(a0, b0, a1, a1, b0, b1);
      }
    }
    // caps
    [[0, false], [S.length - 1, true]].forEach(function (cp) {
      var ring = cp[0] * M, ci = pos.length / 3, s = S[cp[0]];
      pos.push(0, (s.yb + s.yt) / 2, s.z);
      for (var j3 = 0; j3 < M; j3++) {
        var p = ring + j3, q = ring + (j3 + 1) % M;
        if (cp[1]) idx.push(ci, p, q); else idx.push(ci, q, p);
      }
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    var m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = false;   // the body casts; it doesn't shade itself (stripes on curved panels)
    return m;
  }

  // sample a body description into stations
  function stations(z0, z1, n, fn) {
    var out = [];
    for (var i = 0; i <= n; i++) { var z = lerp(z0, z1, i / n); out.push(fn(z, i / n)); }
    return out;
  }

  // the underside follows the wheel arches so the wheels show; never closer than 7 cm to the top
  function archBottom(o, sill, gap) {
    var A = o.r + (gap == null ? 0.07 : gap);
    return function (z, top) {
      var y = sill;
      [o.zf, o.zb].forEach(function (zw) {
        var d = z - zw;
        if (Math.abs(d) < A) y = Math.max(y, o.r + Math.sqrt(A * A - d * d));
      });
      return Math.min(y, top - 0.07);
    };
  }

  function box(w, h, d, mat, x, y, z, parent, rx, ry, rz) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0);
    m.castShadow = true; parent.add(m); return m;
  }
  function cyl(rt, rb, h, mat, x, y, z, parent, rx, ry, rz, seg) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 14), mat);
    m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0);
    m.castShadow = true; parent.add(m); return m;
  }
  function blob(rx, ry, rz, mat, x, y, z, parent) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mat);
    m.scale.set(rx, ry, rz); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  }
  // a tube between two points
  function tube(a, b, r, mat, parent) {
    var A = new THREE.Vector3(a[0], a[1], a[2]), B = new THREE.Vector3(b[0], b[1], b[2]), d = B.clone().sub(A), L = d.length();
    var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 10), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.castShadow = true; parent.add(m); return m;
  }
  function mirrorPair(x, y, z, paint, parent) {
    [-1, 1].forEach(function (s) {
      box(0.05, 0.05, 0.05, trimM, s * (x - 0.04), y - 0.02, z, parent);
      box(0.2, 0.11, 0.07, paint, s * (x + 0.08), y + 0.02, z - 0.02, parent);
      box(0.17, 0.08, 0.01, glassM, s * (x + 0.08), y + 0.02, z - 0.06, parent);
    });
  }
  function lightPair(x, y, z, w, h, mat, parent, back) {
    [-1, 1].forEach(function (s) { box(w, h, 0.05, mat, s * x, y, z + (back ? -0.02 : 0.02), parent); });
  }
  function roundLights(x, y, z, rad, mat, parent, back, n) {
    for (var k = 0; k < (n || 1); k++) {
      [-1, 1].forEach(function (s) {
        var m = cyl(rad, rad, 0.05, mat, s * (x - k * rad * 2.4), y, z, parent, Math.PI / 2, 0, 0, 16);
        m.castShadow = false;
      });
    }
  }
  function wing(o, z, y, span, chord, paint, parent, endplates) {
    box(span, 0.05, chord, paint, 0, y, z, parent, -0.06);
    [-1, 1].forEach(function (s) {
      box(0.05, y - o.deck + 0.02, 0.14, trimM, s * span * 0.32, (y + o.deck) / 2, z + 0.02, parent);
      if (endplates) box(0.03, 0.26, chord + 0.08, paint, s * span / 2, y + 0.05, z, parent);
    });
  }
  function exhaust(x, y, z, r, parent) { cyl(r, r, 0.22, chromeM, x, y, z, parent, Math.PI / 2); cyl(r * 0.7, r * 0.7, 0.23, darkM, x, y, z - 0.005, parent, Math.PI / 2); }

  /* ---------- the common car: shell + glasshouse + roof + details from one spec ----------
     spec: { len: [B, F] (bumper z), sill, top: prof keys (waist / bonnet / boot line), hw: prof keys (half width),
             n: squareness, cabin: { z0, z1, roof: prof keys, belt (y offset from top), taper, hwK } } */
  function sculpt(o, spec, paint, body) {
    var B = spec.len[0], F = spec.len[1];
    var top = prof(spec.top), hw = prof(spec.hw), bot = archBottom(o, spec.sill, spec.archGap);
    var nF = spec.nF ? prof(spec.nF) : function () { return spec.n || 4; };
    // fenders: over each wheel the body stands at least 13 cm above the arch, blending out along the car,
    // so the wheels sit under real wings instead of a thin lip
    var AR = o.r + (spec.archGap == null ? 0.07 : spec.archGap), fender = function (z) {
      var f = 0;
      [o.zf, o.zb].forEach(function (zw) { var d = Math.abs(z - zw) / (AR + 0.45); if (d < 1) f = Math.max(f, (o.r + AR + 0.13) * (0.5 + 0.5 * Math.cos(d * Math.PI)) ); });
      return f;
    };
    // the waist runs level with the arch tops between the axles (a car, not a hot rod with separate wings)
    var waist = o.r + AR + 0.08, topRaw = top;
    top = function (z) {
      var inside = z >= o.zb && z <= o.zf ? 1 : Math.max(0, 1 - Math.min(Math.abs(z - o.zb), Math.abs(z - o.zf)) / 0.5);
      return Math.max(topRaw(z), fender(z), (spec.lowWaist ? 0 : 1) * waist * (inside > 0 ? (0.55 + 0.45 * inside) : 0));
    };
    var shell = stations(B, F, 56, function (z) {
      var t = top(z);
      return { z: z, yb: bot(z, t), yt: t, hw: hw(z), n: nF(z), top: spec.waistTaper || 0.94, bot: spec.sillTaper || 0.93 };
    });
    body.add(loft(shell, paint, 26));
    if (spec.cabin) {
      var C = spec.cabin, roof = prof(C.roof), belt = C.belt || 0.0;
      var cab = stations(C.z0, C.z1, 26, function (z, u) {
        var yb = top(z) - 0.03 - belt, yt = Math.max(yb + 0.02, roof(z));
        return { z: z, yb: yb, yt: yt, hw: hw(z) * (C.hwK || 0.9), n: C.n || 5, top: C.taper || 0.78, bot: 1 };
      });
      body.add(loft(cab, glassM, 24));
      // painted roof panel over the glass (leaves the side windows and screens as glass)
      var rz0 = C.roofZ ? C.roofZ[0] : lerp(C.z0, C.z1, 0.26), rz1 = C.roofZ ? C.roofZ[1] : lerp(C.z0, C.z1, 0.86);
      var rp = stations(rz0, rz1, 16, function (z) {
        var yt = roof(z) + 0.012;
        return { z: z, yb: yt - 0.045, yt: yt, hw: hw(z) * (C.hwK || 0.9) * (C.taper || 0.78) * 1.03, n: 8 };
      });
      body.add(loft(rp, paint, 16));
      // B pillar
      if (C.pillar != null) {
        var zp = C.pillar, yb2 = top(zp) - 0.03, yt2 = roof(zp);
        [-1, 1].forEach(function (s) {
          var x0 = hw(zp) * (C.hwK || 0.9), x1 = x0 * (C.taper || 0.78);
          var m = box(0.05, yt2 - yb2, 0.09, paint, s * (x0 + x1) / 2 + s * 0.005, (yb2 + yt2) / 2, zp, body);
          m.rotation.z = -s * Math.atan2(x0 - x1, yt2 - yb2);
        });
      }
    }
    // dark lower sill between the arches
    var sz0 = o.zb + o.r + 0.12, sz1 = o.zf - o.r - 0.12;
    if (sz1 > sz0) [-1, 1].forEach(function (s) { box(0.04, 0.09, sz1 - sz0, trimM, s * (hw((sz0 + sz1) / 2) * 0.93 + 0.01), spec.sill + 0.04, (sz0 + sz1) / 2, body); });
    return { top: top, hw: hw };
  }

  function makeResult(g, body, o, paint) {
    var tail = o.tail || new THREE.MeshLambertMaterial({ color: 0xff3b30, emissive: 0xff2a20, emissiveIntensity: 0.55 });
    return { g: g, body: body, wheels: [], tail: tail, paint: paint, rev: revM };
  }

  // ---------- models ----------
  var MODELS = {};





  /* Outlaw V8: a late-60s style fastback muscle coupe (an original design, no real make). Long flat bonnet with a
     power bulge and scoop, a full-width recessed grille with quad round lamps, chrome bumpers that wrap the corners,
     coke-bottle hips over the rear wheels, a fastback roof with louvres over the back glass, a kicked-up ducktail,
     a full-width segmented tail panel, twin over-the-top stripes and quad exhaust tips. */
  MODELS.outlaw = function (o, paint, body) {
    var B = o.B - 0.03, F = o.F + 0.03, W = o.Wb, zf = o.zf, zb = o.zb;
    var lum = (function (h) { return (((h >> 16) & 255) * 0.3 + ((h >> 8) & 255) * 0.59 + (h & 255) * 0.11) / 255; })(o.paint || 0);
    var stripeM = phong(lum > 0.55 ? 0x121214 : 0xf1efe8, { reflectivity: 0.08, specular: 0x5a5a5a, shininess: 70 });
    var amberM = new THREE.MeshLambertMaterial({ color: 0xffa31a, emissive: 0xff8a00, emissiveIntensity: 0.35 });
    var grilleM = new THREE.MeshPhongMaterial({ color: 0x0c0c0e, specular: 0x1c1c20, shininess: 18 });
    var s = sculpt(o, {
      len: [B, F], sill: 0.31, n: 7, archGap: 0.05, waistTaper: 0.95, sillTaper: 0.95,
      // deck: bumper top, kicked-up ducktail, flat deck, then the long flat bonnet falling gently to the nose
      top: [[B, 0.64], [B + 0.06, 0.98], [B + 0.16, 1.1], [B + 0.42, 1.06], [zb + 0.45, 1.05], [zf - 1.25, 1.06], [zf - 0.2, 1.05], [F - 0.22, 1.0], [F - 0.04, 0.95], [F, 0.66]],
      // coke bottle: wide over the rear haunches, pinched at the doors, full over the front wings
      hw: [[B, W * 0.9], [B + 0.25, W * 0.99], [zb, W * 1.02], [zb + 0.75, W * 0.97], [0.15, W * 0.94], [zf - 0.55, W * 0.97], [zf, W * 0.98], [F - 0.25, W * 0.96], [F, W * 0.9]],
      nF: [[B, 8], [B + 0.3, 7], [zf, 7], [F, 9]],
      cabin: { z0: B + 0.5, z1: zf - 1.18, n: 6, taper: 0.8, hwK: 0.88, belt: 0.01,
        roof: [[B + 0.5, 1.07], [B + 1.25, 1.3], [zb + 0.7, 1.42], [-0.5, 1.5], [-0.05, 1.5], [zf - 1.62, 1.45], [zf - 1.18, 1.05]],
        roofZ: [B + 1.2, zf - 1.5] }
    }, paint, body);
    var top = s.top, hw = s.hw;
    // bonnet power bulge, rising toward the cowl, with a dark scoop mouth at its front
    var bulge = stations(zf - 1.12, F - 0.42, 18, function (z, u) {
      var h = 0.075 * Math.sin(Math.min(1, (1 - u) * 1.6 + 0.15) * Math.PI / 2);
      return { z: z, yb: top(z) - 0.03, yt: top(z) + h, hw: 0.36 - u * 0.04, n: 3, top: 0.75 };
    });
    body.add(loft(bulge, paint, 18));
    box(0.5, 0.055, 0.05, darkM, 0, top(F - 0.5) + 0.04, F - 0.45, body, -0.2);
    [-1, 1].forEach(function (k) { cyl(0.018, 0.018, 0.02, chromeM, k * 0.62, top(F - 0.2) + 0.008, F - 0.2, body); });   // bonnet pins
    // twin stripes over bonnet, roof and deck lid
    [-0.17, 0.17].forEach(function (x) {
      var hood = stations(zf - 1.1, F - 0.06, 24, function (z) { var u = Math.min(1, Math.max(0, (z - (zf - 1.12)) / ((F - 0.42) - (zf - 1.12)))), bh = z < F - 0.42 ? 0.075 * Math.sin(Math.min(1, (1 - u) * 1.6 + 0.15) * Math.PI / 2) : 0; var t = top(z) + (Math.abs(x) < 0.33 ? bh : 0); return { z: z, yb: t - 0.004, yt: t + 0.008, hw: 0.075, n: 8 }; });
      body.add(loft(hood, stripeM, 8));
      var deck = stations(B + 0.17, B + 0.5, 6, function (z) { var t = top(z); return { z: z, yb: t - 0.004, yt: t + 0.008, hw: 0.075, n: 8 }; });
      body.add(loft(deck, stripeM, 8));
    });
    o.__stripe = stripeM;
    // grille: full width, recessed, chrome surround, horizontal bars, quad round lamps set into it
    var gy = 0.74, gh = 0.27, gw = W * 1.72;
    box(gw, gh, 0.06, grilleM, 0, gy, F - 0.02, body);
    for (var i = -2; i <= 2; i++) box(gw - 0.06, 0.012, 0.02, trimM, 0, gy + i * 0.045, F + 0.012, body);
    box(gw + 0.04, 0.025, 0.03, chromeM, 0, gy + gh / 2, F + 0.015, body); box(gw + 0.04, 0.025, 0.03, chromeM, 0, gy - gh / 2, F + 0.015, body);
    [-1, 1].forEach(function (k) {
      box(0.025, gh + 0.03, 0.03, chromeM, k * gw / 2, gy, F + 0.015, body);
      [W * 0.62, W * 0.83].forEach(function (x, j) {
        var r0 = j ? 0.088 : 0.078;
        cyl(r0 + 0.018, r0 + 0.018, 0.03, chromeM, k * x, gy + 0.005, F + 0.01, body, Math.PI / 2, 0, 0, 20);
        var l = cyl(r0, r0, 0.035, o.head, k * x, gy + 0.005, F + 0.02, body, Math.PI / 2, 0, 0, 20); l.castShadow = false;
      });
      box(0.12, 0.035, 0.02, chromeM, k * 0.06, gy, F + 0.03, body);   // centre badge bar
    });
    // front bumper: a chrome blade wrapping round the corners, a dark valance and amber parking lamps under it
    box(W * 1.86, 0.1, 0.11, chromeM, 0, 0.46, F + 0.02, body);
    [-1, 1].forEach(function (k) {
      var m = box(0.36, 0.1, 0.11, chromeM, k * (W * 0.93 + 0.1), 0.46, F - 0.1, body); m.rotation.y = k * 0.75;
      box(0.16, 0.05, 0.03, amberM, k * W * 0.55, 0.36, F, body);
      box(0.04, 0.05, 0.12, amberM, k * (hw(F - 0.35) * 0.97 + 0.012), 0.6, F - 0.35, body);    // side marker
      box(0.04, 0.05, 0.12, o.tail, k * (hw(B + 0.4) * 0.97 + 0.012), 0.66, B + 0.4, body);
    });
    box(W * 1.5, 0.12, 0.05, darkM, 0, 0.33, F - 0.06, body);                                   // valance / chin
    // rear: dark tail panel with three lamps a side, chrome surround, centre filler cap, chrome bumper, quad tips
    var ty = 0.84;
    box(W * 1.76, 0.2, 0.04, grilleM, 0, ty, B + 0.005, body);
    box(W * 1.8, 0.022, 0.03, chromeM, 0, ty + 0.11, B, body); box(W * 1.8, 0.022, 0.03, chromeM, 0, ty - 0.11, B, body);
    [-1, 1].forEach(function (k) {
      for (var j = 0; j < 3; j++) { var x = k * (0.24 + j * 0.24); box(0.2, 0.13, 0.03, o.tail, x, ty, B - 0.012, body); box(0.012, 0.15, 0.035, chromeM, x + k * 0.11, ty, B - 0.012, body) }
      var m = box(0.34, 0.1, 0.11, chromeM, k * (W * 0.93 + 0.08), 0.48, B + 0.1, body); m.rotation.y = -k * 0.75;
      exhaust(k * W * 0.52, 0.27, B + 0.02, 0.042, body); exhaust(k * W * 0.66, 0.27, B + 0.02, 0.042, body);
    });
    cyl(0.07, 0.07, 0.03, chromeM, 0, ty, B - 0.02, body, Math.PI / 2);
    box(W * 1.82, 0.1, 0.11, chromeM, 0, 0.48, B - 0.01, body);
    box(0.36, 0.11, 0.01, new THREE.MeshLambertMaterial({ color: 0xe9e6dc }), 0, 0.6, B - 0.02, body);   // number plate
    // fastback louvres over the back glass
    for (var q = 0; q < 7; q++) {
      var z = lerp(B + 0.62, zb + 0.55, q / 6), y = prof([[B + 0.5, 1.07], [B + 1.25, 1.3], [zb + 0.7, 1.42]])(z);
      box(hw(z) * 1.32 * 0.8, 0.014, 0.06, darkM, 0, y + 0.012, z, body, -0.3);
    }
    // chrome drip rails and belt line trim, door handles, bullet mirrors
    [-1, 1].forEach(function (k) {
      var z0 = B + 0.55, z1 = zf - 1.22, n = 16, prev = null;
      for (var j = 0; j <= n; j++) { var z = lerp(z0, z1, j / n), p = [k * (hw(z) * 0.95), top(z) + 0.005, z]; if (prev) tube(prev, p, 0.011, chromeM, body); prev = p; }
      box(0.025, 0.025, 0.16, chromeM, k * (hw(0.1) * 0.97 + 0.012), top(0.1) - 0.1, 0.1, body);
      var mz = zf - 1.15, mx = hw(mz) * 0.93;
      cyl(0.012, 0.012, 0.09, chromeM, k * (mx + 0.03), top(mz) + 0.05, mz, body);
      var mh = blob(0.07, 0.05, 0.085, chromeM, k * (mx + 0.08), top(mz) + 0.11, mz - 0.01, body);
      box(0.02, 0.06, 0.4, trimM, k * (hw(0) * 0.95 + 0.01), 0.42, 0, body);                     // rocker trim
    });
    // front chin and a lip on the ducktail
    box(W * 1.4, 0.025, 0.12, paint, 0, top(B + 0.1) + 0.012, B + 0.1, body, 0.18);
  };

  // Mamba: a modern four-door sports saloon. Shark nose, long roof that flows into a short tail, quad exhausts
  MODELS.mamba = function (o, paint, body) {
    var B = o.B - 0.03, F = o.F + 0.04, W = o.Wb, zf = o.zf, zb = o.zb;
    var s = sculpt(o, {
      len: [B, F], sill: 0.29, n: 6, archGap: 0.05, waistTaper: 0.93,
      top: [[B, 0.66], [B + 0.08, 0.98], [B + 0.3, 1.04], [zb + 0.3, 1.02], [zf - 0.9, 1.0], [zf - 0.2, 0.98], [F - 0.25, 0.92], [F - 0.05, 0.84], [F, 0.62]],
      hw: [[B, W * 0.88], [B + 0.3, W * 0.98], [zb, W], [0, W * 0.97], [zf, W * 0.99], [F - 0.3, W * 0.95], [F, W * 0.84]],
      cabin: { z0: B + 0.32, z1: zf - 0.95, n: 6, taper: 0.8, hwK: 0.9, pillar: -0.25,
        roof: [[B + 0.32, 1.03], [B + 0.95, 1.33], [zb + 0.6, 1.43], [-0.3, 1.46], [zf - 1.45, 1.42], [zf - 0.95, 1.0]], roofZ: [B + 0.9, zf - 1.35] }
    }, paint, body);
    var gy = 0.62;
    box(W * 1.05, 0.2, 0.05, darkM, 0, gy, F - 0.01, body);                                     // grille
    for (var i = -2; i <= 2; i++) box(W * 1.0, 0.01, 0.02, trimM, 0, gy + i * 0.04, F + 0.016, body);
    [-1, 1].forEach(function (k) {
      var l = box(0.46, 0.07, 0.05, o.head, k * W * 0.66, 0.8, F - 0.07, body); l.rotation.y = -k * 0.12; l.castShadow = false;   // slim LED lamps
      box(0.42, 0.012, 0.055, o.head, k * W * 0.66, 0.75, F - 0.07, body).castShadow = false;
      box(0.3, 0.13, 0.05, darkM, k * W * 0.7, 0.42, F - 0.02, body);                             // corner intakes
      var t = box(0.5, 0.07, 0.04, o.tail, k * W * 0.58, 0.86, B + 0.07, body); t.castShadow = false;
      exhaust(k * W * 0.45, 0.3, B + 0.03, 0.04, body); exhaust(k * W * 0.6, 0.3, B + 0.03, 0.04, body);
      box(0.03, 0.025, 0.14, chromeM, k * (s.hw(0.4) * 0.96 + 0.01), s.top(0.4) - 0.12, 0.4, body);   // door handles
      box(0.03, 0.025, 0.14, chromeM, k * (s.hw(-0.6) * 0.96 + 0.01), s.top(-0.6) - 0.12, -0.6, body);
    });
    box(W * 1.2, 0.014, 0.04, o.tail, 0, 0.86, B + 0.07, body).castShadow = false;                 // light bar across the boot
    box(W * 1.6, 0.06, 0.12, darkM, 0, 0.3, F - 0.05, body);                                       // splitter
    box(W * 1.4, 0.08, 0.06, darkM, 0, 0.36, B + 0.04, body);                                      // diffuser
    box(W * 1.5, 0.02, 0.12, paint, 0, s.top(B + 0.1) + 0.01, B + 0.1, body, 0.15);                 // boot lip
    mirrorPair(s.hw(zf - 0.95) * 0.9, 1.1, zf - 0.95, paint, body);
  };



  // Skyline GT-R: a squared-off performance coupe, four round tail lamps, big rear wing
  MODELS.skyline = function (o, paint, body) {
    var B = o.B - 0.02, F = o.F + 0.04, W = o.Wb + 0.02;
    var s = sculpt(o, {
      len: [B, F], sill: 0.27, n: 7,
      top: [[B, 0.66], [B + 0.08, 0.98], [B + 0.5, 1.0], [o.zb + 0.3, 0.99], [o.zf - 0.3, 0.98], [F - 0.2, 0.92], [F, 0.64]],
      hw: [[B, W * 0.92], [o.zb, W], [0, W * 0.96], [o.zf, W], [F, W * 0.9]],
      cabin: { z0: B + 0.55, z1: o.zf - 0.5, n: 6, taper: 0.8, roof: [[B + 0.55, 0.98], [B + 1.3, 1.38], [-0.1, 1.42], [o.zf - 1.0, 1.38], [o.zf - 0.5, 0.97]], pillar: -0.15 }
    }, paint, body);
    lightPair(W * 0.66, 0.8, F - 0.04, 0.42, 0.1, o.head, body);
    box(W * 0.8, 0.18, 0.04, darkM, 0, 0.64, F + 0.005, body);
    box(W * 1.4, 0.12, 0.04, darkM, 0, 0.36, F, body);                                           // splitter intake
    roundLights(W * 0.7, 0.84, B + 0.07, 0.085, o.tail, body, true, 2);                         // the four round lamps
    o.deck = 0.99; wing(o, B + 0.22, 1.22, W * 1.8, 0.28, paint, body, true);
    exhaust(-W * 0.55, 0.3, B + 0.04, 0.05, body);
    mirrorPair(s.hw(o.zf - 0.55) * 0.92, 1.08, o.zf - 0.55, paint, body);
    [-1, 1].forEach(function (k) { box(0.04, 0.08, 1.5, darkM, k * W * 0.96, 0.32, 0, body); });  // side skirts
  };







  // Titan 4x4: an off-roader. High clearance, boxy, flared arches, roof rack, snorkel, spare on the tailgate
  MODELS.titan4x4 = function (o, paint, body) {
    var B = o.B, F = o.F + 0.05, W = o.Wb;
    var s = sculpt(o, {
      len: [B, F], sill: 0.62, n: 9, archGap: 0.12,
      top: [[B, 1.08], [B + 0.1, 1.2], [o.zf - 0.5, 1.18], [F - 0.15, 1.14], [F, 0.98]],
      hw: [[B, W * 0.96], [0, W], [F, W * 0.96]],
      cabin: { z0: B + 0.08, z1: o.zf - 0.4, n: 9, taper: 0.9, hwK: 0.96, roof: [[B + 0.08, 1.92], [o.zf - 0.75, 1.92], [o.zf - 0.4, 1.18]], roofZ: [B + 0.1, o.zf - 0.65], pillar: -0.15 }
    }, paint, body);
    // flared black arches
    [o.zf, o.zb].forEach(function (zw) {
      [-1, 1].forEach(function (k) {
        var m = new THREE.Mesh(new THREE.TorusGeometry(o.r + 0.1, 0.07, 6, 16, Math.PI), trimM);
        m.rotation.y = Math.PI / 2; m.position.set(k * (W + 0.03), o.r, zw); m.castShadow = true; body.add(m);
      });
    });
    // roof rack
    box(W * 1.7, 0.04, 1.7, greyM, 0, 2.02, -0.3, body);
    [-1, 1].forEach(function (k) { box(0.05, 0.12, 1.8, greyM, k * W * 0.84, 1.98, -0.3, body); });
    // spare wheel on the tailgate, bolted to the body
    var sp = new THREE.Group(); sp.position.set(0, 1.2, B - 0.12); body.add(sp);
    cyl(o.r * 0.95, o.r * 0.95, 0.26, rubberM, 0, 0, 0, sp, Math.PI / 2);
    cyl(o.r * 0.55, o.r * 0.55, 0.27, greyM, 0, 0, 0, sp, Math.PI / 2);
    box(0.24, 0.2, 0.14, greyM, 0, 1.2, B - 0.0, body);
    // bull bar, lamps, grille
    tube([-W * 0.75, 0.55, F + 0.15], [W * 0.75, 0.55, F + 0.15], 0.045, greyM, body);
    tube([-W * 0.55, 0.55, F + 0.15], [-W * 0.55, 1.05, F + 0.05], 0.04, greyM, body);
    tube([W * 0.55, 0.55, F + 0.15], [W * 0.55, 1.05, F + 0.05], 0.04, greyM, body);
    tube([-W * 0.55, 1.05, F + 0.05], [W * 0.55, 1.05, F + 0.05], 0.04, greyM, body);
    roundLights(W * 0.72, 0.98, F - 0.01, 0.1, o.head, body, false, 1);
    for (var i = -3; i <= 3; i++) box(0.05, 0.3, 0.03, darkM, i * 0.12, 0.96, F + 0.005, body);
    [-1, 1].forEach(function (k) { box(0.12, 0.3, 0.05, o.tail, k * W * 0.86, 1.1, B - 0.01, body); });
    // snorkel up the right A-pillar
    tube([W + 0.06, 0.9, o.zf - 0.3], [W + 0.06, 1.95, o.zf - 0.55], 0.06, darkM, body);
    box(0.16, 0.12, 0.2, darkM, W + 0.06, 1.98, o.zf - 0.55, body);
    // running boards
    [-1, 1].forEach(function (k) { box(0.18, 0.05, Math.max(0.2, o.zf - o.zb - 2 * o.r - 0.35), greyM, k * (W + 0.02), 0.52, (o.zf + o.zb) / 2, body); });
    mirrorPair(W * 0.96, 1.38, o.zf - 0.5, paint, body);
  };

  // Valkyrie LeMans: a closed-cockpit prototype. Pointed nose, wheel pods, bubble canopy, fin, wide wing
  MODELS.valkyrie = function (o, paint, body) {
    var B = o.B - 0.12, F = o.F + 0.25, W = o.Wb + 0.05;
    // central tub
    var tub = stations(B, F, 40, function (z) {
      var t = prof([[B, 0.62], [B + 0.2, 0.86], [o.zb, 0.84], [-0.2, 0.7], [o.zf - 0.2, 0.52], [F - 0.2, 0.36], [F, 0.24]])(z);
      var w = prof([[B, W * 0.8], [o.zb, W * 0.86], [0, W * 0.62], [o.zf, W * 0.7], [F - 0.2, W * 0.5], [F, W * 0.3]])(z);
      return { z: z, yb: 0.16, yt: t, hw: w, n: 4, top: 0.9 };
    });
    body.add(loft(tub, paint, 24));
    // wheel pods over each wheel
    [o.zf, o.zb].forEach(function (zw, ax) {
      [-1, 1].forEach(function (k) {
        var pod = stations(zw - o.r - 0.35, zw + o.r + 0.35, 16, function (z) {
          var d = Math.abs(z - zw) / (o.r + 0.35), top = 2 * o.r + 0.12 - d * d * 0.25;
          return { z: z, yb: archBottom(o, 0.18, 0.06)(z, top), yt: top, hw: 0.22, n: 4 };
        });
        var m = loft(pod, paint, 14); m.position.x = k * (W - 0.2); body.add(m);
      });
    });
    // bubble canopy
    var can = stations(-0.85, 0.75, 22, function (z) {
      var u = (z + 0.85) / 1.6, h = Math.sin(u * Math.PI);
      return { z: z, yb: 0.66, yt: 0.7 + h * 0.42, hw: 0.08 + h * 0.36, n: 2.4, top: 0.75 };
    });
    body.add(loft(can, glassM, 20));
    // shark fin + wing
    var fin = stations(B + 0.25, -0.7, 12, function (z, u) { return { z: z, yb: 0.8, yt: 0.86 + (1 - u) * 0.36, hw: 0.025, n: 8 }; });
    body.add(loft(fin, paint, 8));
    o.deck = 0.86; wing(o, B + 0.18, 1.2, W * 1.95, 0.36, paint, body, true);
    box(W * 1.9, 0.05, 0.45, trimM, 0, 0.14, F - 0.25, body);                                   // front splitter
    box(W * 1.3, 0.25, 0.3, trimM, 0, 0.32, B + 0.05, body);                                    // diffuser
    lightPair(W * 0.6, 0.52, o.zf + 0.3, 0.32, 0.05, o.head, body);
    box(W * 1.8, 0.04, 0.05, o.tail, 0, 0.84, B + 0.01, body);
    exhaust(0, 0.62, B + 0.02, 0.06, body);
    hypercarDetail(o, paint, body, { B: B, F: F, W: W });
  };

  /* ---------- race-car detail kit (Valkyrie and the F1 car) ----------
     carbon weave, a contrasting accent (the paint's complementary hue, so every paint gets a matching livery),
     racing numbers and sponsor-style decals drawn once on canvases */
  var carbonM = phong(0x1b1d22, { specular: 0x55606e, shininess: 90 });
  var accentOf = function (paint) { var c = paint.color.clone(), h = {}; c.getHSL(h); return phong(new THREE.Color().setHSL((h.h + 0.5) % 1, Math.max(0.6, h.s), h.l < 0.35 ? 0.6 : 0.5), { shininess: 110, specular: 0x666666 }); };
  var DECALS = {};
  function decal(key, draw, w, h) {
    if (DECALS[key]) return DECALS[key];
    var c = document.createElement('canvas'); c.width = w || 256; c.height = h || 128; draw(c.getContext('2d'), c.width, c.height);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.__shared = true;
    DECALS[key] = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide });
    return DECALS[key];
  }
  var roundel = function (num) {
    return decal('n' + num, function (g, w, h) { g.clearRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.46, 0, 6.283); g.fill();
      g.lineWidth = 6; g.strokeStyle = '#111317'; g.stroke(); g.fillStyle = '#111317'; g.font = 'bold ' + Math.round(h * 0.56) + 'px Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, w / 2, h / 2 + 4); }, 128, 128);
  };
  var sponsor = function (word) {
    return decal('s' + word, function (g, w, h) { g.clearRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.font = 'bold italic ' + Math.round(h * 0.62) + 'px Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(word, w / 2, h / 2 + 3); }, 256, 64);
  };
  function plane(w, h, mat, x, y, z, ry, parent, rx) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); parent.add(m); return m; }
  // a helmet with a visor and a stripe in the accent colour, at (x, y, z), looking forward (+z)
  function helmet(x, y, z, r, paint, acc, parent) {
    blob(r, r * 0.95, r * 1.08, paint, x, y, z, parent);
    blob(r * 0.86, r * 0.42, r * 0.5, glassM, x, y + r * 0.06, z + r * 0.62, parent);
    box(r * 0.22, r * 0.12, r * 1.9, acc, x, y + r * 0.9, z - r * 0.05, parent);
    blob(r * 0.55, r * 0.22, r * 0.4, acc, x, y + r * 0.82, z - r * 0.82, parent);     // small spoiler
  }

  function hypercarDetail(o, paint, body, d) {
    var B = d.B, F = d.F, W = d.W, acc = accentOf(paint), cz = -0.05;
    // driver in the canopy
    helmet(0, 0.98, cz + 0.05, 0.15, paint, acc, body);
    box(0.34, 0.16, 0.42, darkM, 0, 0.78, cz - 0.15, body);                                      // shoulders / seat back
    // livery: an accent stripe over the nose, canopy edge and engine cover, number roundels on the pods
    box(0.22, 0.012, F - 0.6, acc, 0, 0.52, (F + 0.6) / 2 - 0.15, body, -0.08);
    box(0.16, 0.012, 1.6, acc, 0, 0.9, B + 1.0, body);
    [-1, 1].forEach(function (k) {
      plane(0.34, 0.34, roundel('27'), k * (W + 0.03), 0.5, o.zb + o.r + 0.22, -k * Math.PI / 2 + Math.PI, body);
      plane(0.7, 0.18, sponsor('APEX'), k * (W * 0.86 + 0.01), 0.42, 0.25, -k * Math.PI / 2 + Math.PI, body);
      // side intake scoop behind the cockpit, with a dark mouth
      box(0.12, 0.26, 0.46, paint, k * (W * 0.72), 0.64, -0.95, body);
      box(0.1, 0.2, 0.04, darkM, k * (W * 0.72), 0.64, -0.71, body);
      // louvres on top of each front wheel pod (vents for the brakes)
      for (var i = 0; i < 6; i++) box(0.3, 0.02, 0.05, darkM, k * (W - 0.2), 2 * o.r + 0.13 - Math.abs(i - 2.5) * 0.012, o.zf - 0.3 + i * 0.12, body, 0.35);
      // headlight bar sweeping round each front pod, and a running-light strip
      box(0.03, 0.05, 0.6, o.head, k * (W - 0.02), 0.5, o.zf + 0.1, body);
      // dive planes and canards on the nose corners
      box(0.32, 0.02, 0.18, carbonM, k * (W * 0.82), 0.3, F - 0.42, body, 0, 0, k * 0.18);
      box(0.26, 0.02, 0.14, carbonM, k * (W * 0.8), 0.4, F - 0.6, body, 0, 0, k * 0.28);
      // mirrors on stalks
      tube([k * 0.32, 0.86, 0.42], [k * 0.5, 0.95, 0.5], 0.015, carbonM, body);
      box(0.16, 0.08, 0.06, paint, k * 0.55, 0.96, 0.5, body);
      box(0.13, 0.06, 0.01, glassM, k * 0.55, 0.96, 0.465, body);
      // swan-neck wing mounts and big endplates with louvres
      tube([k * 0.18, 0.86, B + 0.45], [k * 0.22, 1.24, B + 0.2], 0.022, carbonM, body);
      for (var j = 0; j < 4; j++) box(0.035, 0.012, 0.32, darkM, k * (W * 0.975 + 0.01), 1.12 + j * 0.06, B + 0.18, body);
      // diffuser strakes and rear wheel-pod vents
      box(0.02, 0.22, 0.42, carbonM, k * (0.15 + 0.17), 0.26, B + 0.15, body);
      box(0.02, 0.22, 0.42, carbonM, k * 0.08, 0.26, B + 0.15, body);
      box(0.16, 0.14, 0.04, darkM, k * (W - 0.2), 0.62, o.zb - o.r - 0.33, body);
      // front splitter end fences and a brake-cooling duct in each pod
      box(0.02, 0.1, 0.4, carbonM, k * (W * 0.94), 0.17, F - 0.25, body);
      blob(0.07, 0.07, 0.03, darkM, k * (W - 0.22), 0.38, o.zf + o.r + 0.34, body);
    });
    // roof scoop on the canopy, antenna, pitot, tow loop, rain light
    box(0.24, 0.12, 0.34, paint, 0, 1.13, -0.55, body);
    box(0.18, 0.08, 0.02, darkM, 0, 1.13, -0.37, body);
    tube([0.12, 1.08, -0.7], [0.14, 1.32, -0.82], 0.008, darkM, body);
    tube([0, 0.38, F - 0.05], [0, 0.38, F + 0.12], 0.01, chromeM, body);
    cyl(0.04, 0.04, 0.02, accentOf(paint), 0, 0.42, B - 0.02, body, Math.PI / 2);
    box(0.14, 0.14, 0.04, o.tail, 0, 0.5, B - 0.02, body);
    // the wing gets a second element (gurney) in the accent colour
    box(W * 1.9, 0.03, 0.14, acc, 0, 1.3, B + 0.08, body, -0.5);
  }

  // F1 Apex: an open-wheel single-seater, built with as much of the real thing as reads at game scale
  MODELS.f1apex = function (o, paint, body) {
    var r = o.r, zf = o.zf, zb = o.zb, F = o.F + 0.35, B = o.B - 0.12, xw = (o.xw || 1.1) * 0.9, acc = accentOf(paint);
    // floor: a flat carbon plank wider than the tub between the wheels, with edge wings
    box(1.5, 0.04, zf - zb - 2 * r - 0.1, carbonM, 0, 0.1, (zf + zb) / 2 - 0.1, body);
    [-1, 1].forEach(function (k) { box(0.05, 0.08, zf - zb - 2 * r - 0.3, carbonM, k * 0.76, 0.14, (zf + zb) / 2 - 0.1, body); });
    // the tub and nose: one lofted shell from the nose tip back to the gearbox
    var tub = stations(B + 0.35, F - 0.05, 46, function (z) {
      var t = prof([[B + 0.35, 0.5], [zb + 0.2, 0.62], [-0.55, 0.72], [0.2, 0.68], [zf - 0.6, 0.52], [zf, 0.42], [F - 0.3, 0.3], [F - 0.05, 0.24]])(z);
      var w = prof([[B + 0.35, 0.16], [zb + 0.1, 0.24], [-0.6, 0.36], [0.25, 0.3], [zf - 0.5, 0.18], [zf + 0.1, 0.14], [F - 0.3, 0.1], [F - 0.05, 0.06]])(z);
      var yb = prof([[B + 0.35, 0.18], [zf - 0.4, 0.16], [zf + 0.2, 0.2], [F - 0.05, 0.16]])(z);
      return { z: z, yb: yb, yt: t, hw: w, n: 3.2, top: 0.85 };
    });
    body.add(loft(tub, paint, 22));
    // sidepods with an undercut and a dark radiator inlet; the accent livery runs along their tops
    [-1, 1].forEach(function (k) {
      var pod = stations(zb + r + 0.25, 0.3, 26, function (z, u) {
        var h = prof([[zb + r + 0.25, 0.34], [-0.3, 0.52], [0.3, 0.56]])(z);
        return { z: z, yb: 0.15 + (1 - u) * 0.05, yt: h, hw: 0.2 + u * 0.12, n: 3, top: 0.7 };
      });
      var m = loft(pod, paint, 16); m.position.x = k * 0.46; body.add(m);
      box(0.3, 0.2, 0.03, darkM, k * 0.46, 0.4, 0.31, body);
      box(0.06, 0.012, 1.0, acc, k * 0.46, 0.56, -0.25, body);
      plane(0.55, 0.14, sponsor('APEX'), k * 0.795, 0.36, -0.1, -k * Math.PI / 2 + Math.PI, body);
      // bargeboards / sidepod deflectors
      for (var i = 0; i < 3; i++) box(0.02, 0.24 - i * 0.04, 0.34, carbonM, k * (0.7 + i * 0.05), 0.24, 0.55 - i * 0.12, body, 0, k * 0.12);
      // mirrors on stalks beside the cockpit
      tube([k * 0.3, 0.66, 0.4], [k * 0.5, 0.74, 0.45], 0.012, carbonM, body);
      box(0.14, 0.07, 0.05, paint, k * 0.53, 0.75, 0.45, body);
      box(0.11, 0.05, 0.01, glassM, k * 0.53, 0.75, 0.42, body);
    });
    // cockpit: opening, halo, driver, steering wheel
    box(0.4, 0.04, 0.7, darkM, 0, 0.71, -0.05, body);
    var halo = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 8, 22, Math.PI), carbonM); halo.rotation.set(-Math.PI / 2, 0, 0); halo.position.set(0, 0.92, -0.15); body.add(halo);
    tube([0, 0.92, 0.11], [0, 0.72, 0.36], 0.03, carbonM, body);                                    // halo centre pillar
    helmet(0, 0.86, -0.12, 0.15, paint, acc, body);
    box(0.24, 0.04, 0.02, carbonM, 0, 0.78, 0.18, body);                                            // steering wheel
    // airbox above the driver's head, engine cover with a shark fin, T-camera
    var airbox = stations(-0.85, -0.3, 10, function (z, u) { return { z: z, yb: 0.7, yt: 0.72 + u * 0.36, hw: 0.08 + u * 0.06, n: 3, top: 0.7 }; });
    body.add(loft(airbox, paint, 12)); box(0.14, 0.14, 0.02, darkM, 0, 0.95, -0.29, body);
    box(0.02, 0.36, 1.3, paint, 0, 0.96, -1.35, body, 0.18);
    box(0.24, 0.05, 0.06, acc, 0, 1.12, -0.6, body);                                                // T-cam
    plane(0.26, 0.26, roundel('16'), 0, 0.455, zf - 0.1, Math.PI, body, Math.PI / 2 - 0.22);       // number on top of the nose, readable from the cockpit
    [-1, 1].forEach(function (k) { plane(0.3, 0.3, roundel('16'), k * 0.03 + k * 0.012, 1.05, -1.45, -k * Math.PI / 2 + Math.PI, body); });
    // front wing: three elements, endplates, the nose pillars down to it
    for (var e = 0; e < 3; e++) box(xw * 2 + 0.25 - e * 0.18, 0.025, 0.22 - e * 0.04, e === 2 ? acc : carbonM, 0, 0.12 + e * 0.05, F - 0.12 - e * 0.13, body, -0.12 - e * 0.18);
    [-1, 1].forEach(function (k) {
      box(0.02, 0.24, 0.5, paint, k * (xw + 0.13), 0.2, F - 0.25, body);
      tube([k * 0.05, 0.28, F - 0.35], [k * 0.08, 0.15, F - 0.25], 0.012, carbonM, body);
    });
    // rear wing: main plane + DRS flap, endplates with louvres, a swan-neck pylon, a beam wing below
    var rwZ = B + 0.12, rwY = 0.98;
    box(xw * 1.5, 0.03, 0.3, carbonM, 0, rwY, rwZ, body, -0.1);
    box(xw * 1.5, 0.025, 0.2, acc, 0, rwY + 0.12, rwZ - 0.12, body, -0.5);
    box(xw * 1.2, 0.025, 0.16, carbonM, 0, 0.42, rwZ + 0.05, body, -0.2);
    [-1, 1].forEach(function (k) {
      box(0.02, 0.62, 0.52, paint, k * xw * 0.75, 0.74, rwZ - 0.02, body);
      for (var j = 0; j < 4; j++) box(0.025, 0.01, 0.28, darkM, k * xw * 0.755, 0.86 + j * 0.05, rwZ - 0.06, body);
      tube([k * 0.04, 0.6, B + 0.45], [k * 0.06, rwY + 0.02, rwZ + 0.05], 0.02, carbonM, body);
      plane(0.38, 0.1, sponsor('APEX'), k * (xw * 0.75 + 0.012), 0.68, rwZ - 0.02, -k * Math.PI / 2 + Math.PI, body);
    });
    box(0.1, 0.06, 0.08, darkM, 0, rwY + 0.18, rwZ - 0.08, body);                                    // DRS actuator
    // diffuser strakes, rain light, exhaust
    for (var d2 = -2; d2 <= 2; d2++) box(0.015, 0.16, 0.36, carbonM, d2 * 0.14, 0.2, B + 0.32, body);
    box(0.12, 0.08, 0.03, o.tail, 0, 0.36, B + 0.22, body);
    exhaust(0, 0.5, B + 0.28, 0.05, body);
    // suspension: upper and lower wishbones and a pushrod to every wheel; brake ducts
    [[zf, 1], [zb, -1]].forEach(function (ax) {
      var z = ax[0], fwd = ax[1];
      [-1, 1].forEach(function (k) {
        var hub = [k * (xw - 0.12), r, z];
        tube([k * 0.18, 0.5, z + 0.18 * fwd], hub, 0.016, carbonM, body);
        tube([k * 0.18, 0.5, z - 0.18 * fwd], hub, 0.016, carbonM, body);
        tube([k * 0.15, 0.26, z + 0.16 * fwd], [hub[0], r - 0.12, z], 0.016, carbonM, body);
        tube([k * 0.15, 0.26, z - 0.16 * fwd], [hub[0], r - 0.12, z], 0.016, carbonM, body);
        tube([k * 0.2, 0.6, z - 0.08 * fwd], [hub[0] * 0.9, r - 0.08, z], 0.013, greyM, body);
        box(0.08, 0.16, 0.2, carbonM, k * (xw - 0.2), r + 0.05, z, body);                              // brake duct
      });
    });
  };

  // Titan Hauler: a conventional tractor unit with sleeper cab and a box trailer body on the same chassis
  MODELS.truck = function (o, paint, body) {
    var F = o.F + 0.2, B = o.B - 0.4, W = o.Wb + 0.05, cabBack = o.zf - 0.9;
    // chassis rails + fuel tanks
    [-1, 1].forEach(function (k) { box(0.14, 0.24, F - B - 0.4, darkM, k * 0.55, 0.78, (F + B) / 2 - 0.1, body); });
    [-1, 1].forEach(function (k) { cyl(0.28, 0.28, 1.0, chromeM, k * (W - 0.15), 0.78, cabBack - 0.7, body, Math.PI / 2); });
    // bonnet + front end
    // bonnet and cab arch over the big front wheels instead of cutting through them
    var tArch = archBottom(o, 0.95, 0.1);
    var hood = stations(o.zf - 0.2, F, 16, function (z, u) { var yt = lerp(1.75, 1.62, u * u); return { z: z, yb: tArch(z, yt), yt: yt, hw: lerp(W * 0.86, W * 0.8, u), n: 6 }; });
    body.add(loft(hood, paint, 18));
    // cab
    var cab = stations(cabBack - 1.3, o.zf - 0.2, 18, function (z) { return { z: z, yb: tArch(z, 2.85), yt: 2.85, hw: W, n: 9, top: 0.96 }; });
    body.add(loft(cab, paint, 20));
    // big windscreen + side windows
    box(W * 1.75, 0.85, 0.05, glassM, 0, 2.3, o.zf - 0.17, body, -0.12);
    [-1, 1].forEach(function (k) { box(0.04, 0.6, 0.8, glassM, k * (W + 0.005), 2.25, o.zf - 0.6, body); });
    // roof fairing over the sleeper
    var fair = stations(cabBack - 1.3, o.zf - 0.4, 12, function (z, u) { return { z: z, yb: 2.82, yt: lerp(3.45, 2.95, u * u), hw: W * 0.95, n: 6 }; });
    body.add(loft(fair, paint, 16));
    // grille, bumper, lamps
    box(W * 1.2, 0.62, 0.05, chromeM, 0, 1.25, F + 0.005, body);
    for (var i = 0; i < 6; i++) box(W * 1.1, 0.03, 0.06, darkM, 0, 1.0 + i * 0.1, F + 0.01, body);
    box(W * 2.05, 0.3, 0.25, greyM, 0, 0.62, F + 0.08, body);
    lightPair(W * 0.78, 1.05, F + 0.03, 0.34, 0.16, o.head, body);
    for (var j = -2; j <= 2; j++) box(0.08, 0.05, 0.05, new THREE.MeshLambertMaterial({ color: 0xffa21a, emissive: 0xff8800, emissiveIntensity: 0.6 }), j * 0.25, 2.88, o.zf - 0.2, body);
    // exhaust stacks
    [-1, 1].forEach(function (k) { cyl(0.07, 0.07, 2.2, chromeM, k * (W - 0.05), 2.0, cabBack - 1.35, body); });
    // box body (cargo)
    var cargoF = cabBack - 1.45, cargoB = B;
    var floorY = 2 * o.r + 0.18;                                                                 // box floor clears the rear tyres
    var cargo = box(W * 2.0, 2.35, cargoF - cargoB, phong(0xe8e6df, { reflectivity: 0.1 }), 0, floorY + 1.175, (cargoF + cargoB) / 2, body);
    cargo.receiveShadow = true;
    box(W * 2.02, 0.32, cargoF - cargoB - 0.2, paint, 0, floorY + 1.2, (cargoF + cargoB) / 2, body);   // livery band
    box(W * 2.02, 0.08, cargoF - cargoB, greyM, 0, floorY - 0.02, (cargoF + cargoB) / 2, body);  // floor rail
    [-1, 1].forEach(function (k) { box(0.1, 0.16, 0.05, o.tail, k * W * 0.85, floorY - 0.12, cargoB - 0.03, body); });
    box(W * 1.9, 0.12, 0.12, greyM, 0, 0.6, cargoB - 0.1, body);                                // under-ride bar
    // mud flaps behind the rear wheels
    [-1, 1].forEach(function (k) { box(0.36, 0.5, 0.03, rubberM, k * (W - 0.25), 0.45, o.zb - o.r - 0.25, body); });
    mirrorPair(W, 2.2, o.zf - 0.25, darkM, body);
  };

  // Phantom Bike: a sports motorcycle. Two in-line wheels (drawn by game.js at x = 0), a real frame, tank, seat,
  // fairing, fork, bars and exhaust, sized from the wheelbase
  MODELS.phantombike = function (o, paint, body) {
    var zf = o.zf, zb = o.zb, r = o.r, wb = zf - zb;
    var head = [0, r + 0.72, zf - 0.28], swingPivot = [0, r + 0.12, zb + wb * 0.42];
    // front fork: two legs from the steering head to the front axle
    [-1, 1].forEach(function (k) { tube([k * 0.09, head[1], head[2]], [k * 0.09, r, zf], 0.035, chromeM, body); });
    tube([-0.1, head[1] + 0.02, head[2]], [0.1, head[1] + 0.02, head[2]], 0.05, darkM, body);       // top yoke
    // handlebars (clip-ons)
    tube([-0.34, head[1] + 0.08, head[2] - 0.08], [0.34, head[1] + 0.08, head[2] - 0.08], 0.022, darkM, body);
    [-1, 1].forEach(function (k) { cyl(0.03, 0.03, 0.12, rubberM, k * 0.36, head[1] + 0.08, head[2] - 0.08, body, 0, 0, Math.PI / 2); });
    // frame: twin spars from the head to the swing-arm pivot, and the swing arm to the rear axle
    [-1, 1].forEach(function (k) {
      tube([k * 0.12, head[1] - 0.05, head[2] - 0.05], [k * 0.14, swingPivot[1] + 0.15, swingPivot[2]], 0.045, greyM, body);
      tube([k * 0.13, swingPivot[1], swingPivot[2]], [k * 0.1, r, zb], 0.04, greyM, body);
    });
    // engine block
    box(0.34, 0.36, 0.5, darkM, 0, r + 0.2, swingPivot[2] + 0.42, body);
    cyl(0.16, 0.16, 0.36, greyM, 0, r + 0.12, swingPivot[2] + 0.3, body, 0, 0, Math.PI / 2);
    // fuel tank
    var tank = stations(swingPivot[2] + 0.15, head[2] - 0.08, 14, function (z, u) {
      var h = Math.sin(Math.min(1, u * 1.2) * Math.PI * 0.5 + 0.2);
      return { z: z, yb: r + 0.52, yt: r + 0.62 + h * 0.2, hw: 0.17 + h * 0.06, n: 2.6, top: 0.7 };
    });
    body.add(loft(tank, paint, 18));
    // seat + tail unit
    var seat = stations(zb + 0.12, swingPivot[2] + 0.18, 12, function (z, u) { return { z: z, yb: r + 0.5, yt: r + 0.62 + (1 - u) * 0.1, hw: lerp(0.07, 0.16, u), n: 3 }; });
    body.add(loft(seat, rubberM, 14));
    var tail = stations(zb - 0.08, swingPivot[2] - 0.15, 12, function (z, u) { return { z: z, yb: r + 0.42 + u * 0.05, yt: r + 0.64 + (1 - u) * 0.12, hw: lerp(0.05, 0.13, u), n: 3 }; });
    body.add(loft(tail, paint, 14));
    box(0.12, 0.05, 0.03, o.tail, 0, r + 0.58, zb - 0.09, body);
    // front fairing with screen and headlight
    var fair = stations(head[2] - 0.12, zf - 0.02, 14, function (z, u) {
      return { z: z, yb: lerp(r + 0.25, r + 0.42, u), yt: lerp(r + 0.92, r + 0.62, u * u), hw: lerp(0.26, 0.1, u), n: 2.6, top: 0.55 };
    });
    body.add(loft(fair, paint, 18));
    box(0.26, 0.2, 0.02, glassM, 0, r + 0.95, head[2] - 0.05, body, -0.6);
    blob(0.1, 0.05, 0.03, o.head, 0, r + 0.6, zf, body);
    // belly pan and side panels
    var belly = stations(swingPivot[2] + 0.05, head[2] - 0.1, 10, function (z) { return { z: z, yb: r - 0.04, yt: r + 0.36, hw: 0.2, n: 3 }; });
    body.add(loft(belly, paint, 14));
    // exhaust under the tail
    tube([0.14, r + 0.05, swingPivot[2] + 0.3], [0.18, r + 0.3, zb + 0.25], 0.045, greyM, body);
    cyl(0.07, 0.07, 0.38, chromeM, 0.19, r + 0.32, zb + 0.12, body, Math.PI / 2 + 0.25);
    // mudguards
    var mg = new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.05, 6, 16, Math.PI * 0.7), paint);
    mg.rotation.set(0, Math.PI / 2, 0.3); mg.position.set(0, r, zf); mg.scale.set(1, 1, 1.6); body.add(mg);
    /* the rider, tucked in: sat on the seat, chest low over the tank, hands on the clip-ons, boots on the pegs.
       Dark leathers with stripes, sliders and a helmet in the bike's own paint, a dark visor. */
    var suitM = phong(0x1c1d22, { shininess: 30, specular: 0x333333 }), bootM = phong(0x101013, { shininess: 50 }),
        visorM = phong(0x0a0c11, { shininess: 160, specular: 0x8899aa });
    var seatZ = (zb + 0.12 + swingPivot[2] + 0.18) / 2, seatY = r + 0.66, gripY = head[1] + 0.08, gripZ = head[2] - 0.08;
    var hip = [0, seatY + 0.12, seatZ - 0.04], chest = [0, gripY + 0.2, lerp(seatZ, gripZ, 0.62)], hd = [0, gripY + 0.36, lerp(seatZ, gripZ, 0.8)];
    blob(0.2, 0.15, 0.22, suitM, hip[0], hip[1], hip[2], body);                                    // seat of the leathers
    tube(hip, chest, 0.17, suitM, body);                                                          // back, low over the tank
    tube([0, hip[1] + 0.12, hip[2] + 0.05], [0, chest[1] + 0.13, chest[2] - 0.02], 0.045, paint, body);   // the stripe down the spine
    blob(0.23, 0.17, 0.2, suitM, chest[0], chest[1], chest[2], body);                             // shoulders
    tube([0, chest[1] + 0.05, chest[2] + 0.05], hd, 0.06, suitM, body);                           // neck
    blob(0.155, 0.155, 0.175, paint, hd[0], hd[1], hd[2], body);                                  // helmet
    blob(0.125, 0.07, 0.08, visorM, 0, hd[1] + 0.005, hd[2] + 0.11, body);                        // visor
    blob(0.06, 0.035, 0.1, paint, 0, hd[1] + 0.12, hd[2] - 0.08, body);                           // helmet spoiler
    [-1, 1].forEach(function (k) {
      var sh = [k * 0.2, chest[1] + 0.03, chest[2]], hand = [k * 0.36, gripY + 0.02, gripZ], el = [k * 0.3, lerp(sh[1], hand[1], 0.5) - 0.07, lerp(sh[2], hand[2], 0.45)];
      tube(sh, el, 0.065, suitM, body); tube(el, hand, 0.05, suitM, body);
      blob(0.07, 0.07, 0.07, paint, el[0], el[1], el[2], body);                                    // elbow slider
      blob(0.055, 0.045, 0.07, bootM, hand[0], hand[1], hand[2], body);                            // glove on the grip
      var hp = [k * 0.13, hip[1] - 0.02, hip[2] + 0.02], kn = [k * 0.28, hip[1] - 0.08, lerp(hip[2], gripZ, 0.45)], ft = [k * 0.22, r + 0.2, swingPivot[2] + 0.1];
      tube(hp, kn, 0.085, suitM, body); tube(kn, ft, 0.06, suitM, body);
      blob(0.08, 0.08, 0.08, paint, kn[0], kn[1], kn[2], body);                                    // knee slider
      box(0.09, 0.1, 0.24, bootM, ft[0], ft[1] - 0.03, ft[2] + 0.05, body);                         // boot on the peg
      box(0.03, 0.02, 0.12, greyM, k * 0.22, r + 0.13, swingPivot[2] + 0.1, body);                   // the peg
    });
  };

  function build(id, o) {
    var fn = MODELS[id];
    if (!fn) return null;
    var g = new THREE.Group(), body = new THREE.Group();
    g.add(body);
    // body paint: glossy but its own colour, not a mirror of the sky
    var paint = phong(o.paint, { reflectivity: 0.08, specular: 0x5a5a5a, shininess: 70 });
    // the body is at least as wide as the wheels it covers (game.js puts wheel centres at 0.9 * xw)
    o.Wb = Math.max(o.W / 2, (o.xw || 0) * 0.9 + 0.2);
    o.head = o.head || new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 1.2 });
    o.tail = o.tail || new THREE.MeshLambertMaterial({ color: 0xff3b30, emissive: 0xff2a20, emissiveIntensity: 0.55 });
    fn(o, paint, body);
    return makeResult(g, body, o, paint);
  }

  window.VehicleKit = { build: build, has: function (id) { return !!MODELS[id]; }, ids: Object.keys(MODELS) };
})(window);
