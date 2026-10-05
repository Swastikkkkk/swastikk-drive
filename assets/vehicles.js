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

  // Kestrel: a three-box family sedan
  MODELS.kestrel = function (o, paint, body) {
    var B = o.B - 0.02, F = o.F + 0.02, W = o.Wb;
    var s = sculpt(o, {
      len: [B, F], sill: 0.3, n: 5,
      top: [[B, 0.6], [B + 0.12, 0.84], [B + 0.9, 0.9], [o.zb + 0.5, 0.9], [o.zf - 0.6, 0.86], [F - 0.3, 0.8], [F, 0.62]],
      hw: [[B, W * 0.86], [B + 0.3, W * 0.98], [0, W], [F - 0.35, W * 0.97], [F, W * 0.84]],
      cabin: { z0: B + 0.95, z1: o.zf - 0.45, roof: [[B + 0.95, 0.9], [B + 1.45, 1.38], [-0.1, 1.42], [o.zf - 0.95, 1.38], [o.zf - 0.45, 0.88]], n: 6, taper: 0.84, pillar: -0.1 }
    }, paint, body);
    lightPair(W * 0.66, 0.74, F - 0.03, 0.42, 0.11, o.head, body);
    box(W * 0.9, 0.14, 0.04, darkM, 0, 0.6, F + 0.005, body);                                   // grille
    lightPair(W * 0.7, 0.8, B + 0.02, 0.38, 0.12, o.tail, body, true);
    box(W * 1.7, 0.08, 0.06, trimM, 0, 0.4, F - 0.06, body); box(W * 1.7, 0.08, 0.06, trimM, 0, 0.42, B + 0.06, body);
    mirrorPair(s.hw(o.zf - 0.5) * 0.92, 1.0, o.zf - 0.5, paint, body);
    exhaust(-W * 0.55, 0.32, B + 0.05, 0.035, body);
  };

  // Ridgeback: a long-roof estate (wagon)
  MODELS.ridgeback = function (o, paint, body) {
    var B = o.B - 0.02, F = o.F + 0.02, W = o.Wb;
    var s = sculpt(o, {
      len: [B, F], sill: 0.33, n: 5,
      top: [[B, 0.68], [B + 0.12, 0.92], [o.zb + 0.4, 0.94], [o.zf - 0.6, 0.9], [F - 0.32, 0.84], [F, 0.64]],
      hw: [[B, W * 0.9], [B + 0.25, W * 0.99], [0, W], [F - 0.35, W * 0.97], [F, W * 0.86]],
      cabin: { z0: B + 0.12, z1: o.zf - 0.45, n: 6, taper: 0.82, roof: [[B + 0.12, 1.36], [B + 0.3, 1.5], [-0.2, 1.52], [o.zf - 0.95, 1.46], [o.zf - 0.45, 0.92]], roofZ: [B + 0.18, o.zf - 0.9], pillar: -0.2 }
    }, paint, body);
    // roof rails
    [-1, 1].forEach(function (k) { box(0.04, 0.05, 1.9, chromeM, k * W * 0.62, 1.57, -0.5, body); });
    lightPair(W * 0.66, 0.8, F - 0.03, 0.44, 0.12, o.head, body);
    box(W * 0.95, 0.16, 0.04, darkM, 0, 0.64, F + 0.005, body);
    [-1, 1].forEach(function (k) { box(0.1, 0.42, 0.05, o.tail, k * W * 0.86, 1.06, B + 0.02, body); });   // tall wagon tail lamps
    box(W * 1.7, 0.09, 0.06, trimM, 0, 0.44, F - 0.06, body); box(W * 1.7, 0.09, 0.06, trimM, 0, 0.46, B + 0.06, body);
    mirrorPair(s.hw(o.zf - 0.5) * 0.92, 1.05, o.zf - 0.5, paint, body);
  };

  // Mamba: a muscle car, long bonnet, short deck, wide hips, bonnet scoop, ducktail
  MODELS.mamba = function (o, paint, body) {
    var B = o.B - 0.04, F = o.F + 0.06, W = o.Wb + 0.03;
    var s = sculpt(o, {
      len: [B, F], sill: 0.27, n: 6,
      top: [[B, 0.66], [B + 0.08, 0.86], [B + 0.6, 0.88], [o.zb + 0.2, 0.84], [o.zf - 0.2, 0.84], [F - 0.12, 0.8], [F, 0.64]],
      hw: [[B, W * 0.92], [o.zb, W], [o.zb + 0.7, W * 0.95], [o.zf - 0.2, W * 0.96], [F, W * 0.9]],
      cabin: { z0: B + 0.62, z1: o.zf - 0.85, n: 6, taper: 0.76, roof: [[B + 0.62, 0.86], [B + 1.55, 1.26], [-0.55, 1.3], [o.zf - 1.3, 1.26], [o.zf - 0.85, 0.84]] }
    }, paint, body);
    box(0.5, 0.08, 0.7, paint, 0, 0.88, o.zf - 0.25, body);                                      // bonnet scoop
    box(0.42, 0.06, 0.04, darkM, 0, 0.89, o.zf + 0.1, body);
    roundLights(W * 0.72, 0.68, F - 0.02, 0.085, o.head, body, false, 2);
    box(W * 1.1, 0.16, 0.04, darkM, 0, 0.6, F + 0.01, body);
    box(W * 1.7, 0.1, 0.05, o.tail, 0, 0.74, B + 0.02, body);                                   // full-width tail bar
    box(W * 1.95, 0.12, 0.08, chromeM, 0, 0.42, F - 0.01, body); box(W * 1.95, 0.12, 0.08, chromeM, 0, 0.44, B + 0.02, body);
    box(W * 1.6, 0.04, 0.16, paint, 0, 0.9, B + 0.12, body, 0.25);                              // ducktail
    [-1, 1].forEach(function (k) { exhaust(k * W * 0.5, 0.3, B + 0.04, 0.045, body); });
    mirrorPair(s.hw(o.zf - 0.9) * 0.92, 0.98, o.zf - 0.9, paint, body);
    [-1, 1].forEach(function (k) { box(0.02, 0.05, 1.6, darkM, k * (W * 0.98), 0.72, 0.1, body); });   // side stripe
  };

  // RX-7 Spirit: a low, smooth JDM coupe with a bubble fastback and round tail lamps
  MODELS.rx7spirit = function (o, paint, body) {
    var B = o.B - 0.02, F = o.F + 0.04, W = o.Wb;
    var s = sculpt(o, {
      len: [B, F], sill: 0.25, n: 3.4,
      top: [[B, 0.6], [B + 0.1, 0.8], [B + 0.5, 0.84], [o.zb + 0.3, 0.8], [o.zf - 0.2, 0.74], [F - 0.25, 0.64], [F, 0.5]],
      hw: [[B, W * 0.88], [o.zb + 0.1, W], [0, W * 0.94], [o.zf, W], [F, W * 0.8]],
      cabin: { z0: B + 0.45, z1: o.zf - 0.55, n: 3.2, taper: 0.72, roof: [[B + 0.45, 0.82], [B + 1.6, 1.16], [-0.3, 1.2], [o.zf - 1.05, 1.15], [o.zf - 0.55, 0.76]] }
    }, paint, body);
    lightPair(W * 0.68, 0.58, F - 0.08, 0.36, 0.05, o.head, body);                               // slim lamps (pop-ups down)
    box(W * 0.6, 0.09, 0.04, darkM, 0, 0.4, F - 0.02, body);
    roundLights(W * 0.7, 0.72, B + 0.02, 0.07, o.tail, body, true, 2);
    box(W * 1.6, 0.04, 0.2, paint, 0, 0.88, B + 0.2, body, -0.08);                              // lip spoiler
    exhaust(-W * 0.5, 0.3, B + 0.04, 0.04, body);
    mirrorPair(s.hw(o.zf - 0.6) * 0.9, 0.86, o.zf - 0.6, paint, body);
  };

  // Skyline GT-R: a squared-off performance coupe, four round tail lamps, big rear wing
  MODELS.skyline = function (o, paint, body) {
    var B = o.B - 0.02, F = o.F + 0.04, W = o.Wb + 0.02;
    var s = sculpt(o, {
      len: [B, F], sill: 0.27, n: 7,
      top: [[B, 0.64], [B + 0.08, 0.88], [B + 0.5, 0.9], [o.zb + 0.3, 0.88], [o.zf - 0.3, 0.84], [F - 0.2, 0.78], [F, 0.6]],
      hw: [[B, W * 0.92], [o.zb, W], [0, W * 0.96], [o.zf, W], [F, W * 0.9]],
      cabin: { z0: B + 0.55, z1: o.zf - 0.5, n: 6, taper: 0.8, roof: [[B + 0.55, 0.88], [B + 1.3, 1.28], [-0.1, 1.32], [o.zf - 1.0, 1.28], [o.zf - 0.5, 0.86]], pillar: -0.15 }
    }, paint, body);
    lightPair(W * 0.66, 0.7, F - 0.02, 0.4, 0.1, o.head, body);
    box(W * 0.8, 0.18, 0.04, darkM, 0, 0.55, F + 0.01, body);
    box(W * 1.4, 0.12, 0.04, darkM, 0, 0.36, F, body);                                           // splitter intake
    roundLights(W * 0.74, 0.76, B + 0.02, 0.075, o.tail, body, true, 2);                         // the four round lamps
    o.deck = 0.88; wing(o, B + 0.22, 1.12, W * 1.8, 0.28, paint, body, true);
    exhaust(-W * 0.55, 0.3, B + 0.04, 0.05, body);
    mirrorPair(s.hw(o.zf - 0.55) * 0.92, 0.98, o.zf - 0.55, paint, body);
    [-1, 1].forEach(function (k) { box(0.04, 0.08, 1.5, darkM, k * W * 0.96, 0.32, 0, body); });  // side skirts
  };

  // Countach: the wedge. Very low, sharp nose, cab-forward, flared arches, huge wing
  MODELS.countach = function (o, paint, body) {
    var B = o.B - 0.02, F = o.F + 0.1, W = o.Wb + 0.05;
    var s = sculpt(o, {
      len: [B, F], sill: 0.24, n: 8,
      top: [[B, 0.62], [B + 0.06, 0.82], [o.zb + 0.3, 0.84], [-0.2, 0.78], [o.zf - 0.2, 0.62], [F - 0.1, 0.44], [F, 0.38]],
      hw: [[B, W * 0.96], [o.zb, W], [-0.3, W * 0.9], [o.zf, W * 0.97], [F, W * 0.82]],
      cabin: { z0: -0.75, z1: o.zf - 0.1, n: 7, taper: 0.7, hwK: 0.8, roof: [[-0.75, 0.84], [-0.45, 1.05], [0.15, 1.07], [o.zf - 0.1, 0.66]], roofZ: [-0.6, 0.35] }
    }, paint, body);
    lightPair(W * 0.62, 0.46, F - 0.12, 0.34, 0.05, o.head, body);
    box(W * 1.7, 0.12, 0.06, o.tail, 0, 0.66, B + 0.02, body);
    box(W * 1.2, 0.1, 0.04, darkM, 0, 0.48, B, body);
    [-1, 1].forEach(function (k) { box(0.06, 0.18, 0.5, darkM, k * W * 0.86, 0.72, -0.85, body); });  // NACA side scoops
    o.deck = 0.84; wing(o, B + 0.25, 1.06, W * 1.85, 0.38, paint, body, true);
    [-1, 1].forEach(function (k) { exhaust(k * W * 0.35, 0.34, B + 0.03, 0.045, body); exhaust(k * W * 0.55, 0.34, B + 0.03, 0.045, body); });
    mirrorPair(s.hw(o.zf - 0.3) * 0.84, 0.78, o.zf - 0.25, paint, body);
  };

  // Mini Classic: small, upright, round lamps, contrast roof
  MODELS.classicmini = function (o, paint, body) {
    var B = o.B - 0.03, F = o.F + 0.04, W = o.Wb;
    var s = sculpt(o, {
      len: [B, F], sill: 0.24, n: 5,
      top: [[B, 0.56], [B + 0.08, 0.76], [o.zb + 0.2, 0.8], [o.zf - 0.1, 0.78], [F - 0.15, 0.7], [F, 0.5]],
      hw: [[B, W * 0.92], [0, W], [F, W * 0.9]],
      cabin: { z0: B + 0.12, z1: o.zf - 0.15, n: 7, taper: 0.86, hwK: 0.94, roof: [[B + 0.12, 0.8], [B + 0.24, 1.32], [o.zf - 0.35, 1.32], [o.zf - 0.15, 0.8]], roofZ: [B + 0.14, o.zf - 0.22], pillar: -0.05 }
    }, paint, body);
    // white contrast roof cap
    var rp = stations(B + 0.16, o.zf - 0.25, 10, function (z) { return { z: z, yb: 1.32, yt: 1.37, hw: W * 0.94 * 0.86 * 1.06, n: 8 }; });
    body.add(loft(rp, phong(0xf0eee6), 12));
    roundLights(W * 0.62, 0.66, F - 0.02, 0.09, o.head, body, false, 1);
    box(W * 0.75, 0.2, 0.04, chromeM, 0, 0.56, F, body);
    [-1, 1].forEach(function (k) { box(0.1, 0.16, 0.04, o.tail, k * W * 0.8, 0.7, B + 0.01, body); });
    box(W * 1.9, 0.08, 0.08, chromeM, 0, 0.38, F + 0.02, body); box(W * 1.9, 0.08, 0.08, chromeM, 0, 0.38, B, body);
    mirrorPair(s.hw(o.zf - 0.25) * 0.94, 0.86, o.zf - 0.2, paint, body);
  };

  // GT40: a 1960s Le Mans racer, about a metre tall, curvy, long tail, racing stripes
  MODELS.gt40 = function (o, paint, body) {
    var B = o.B - 0.06, F = o.F + 0.08, W = o.Wb + 0.04;
    var s = sculpt(o, {
      len: [B, F], sill: 0.24, n: 3.2,
      top: [[B, 0.6], [B + 0.1, 0.8], [o.zb, 0.86], [-0.4, 0.74], [o.zf - 0.1, 0.7], [F - 0.15, 0.56], [F, 0.42]],
      hw: [[B, W * 0.9], [o.zb, W], [-0.3, W * 0.88], [o.zf, W * 0.98], [F, W * 0.78]],
      cabin: { z0: -0.85, z1: o.zf - 0.25, n: 3, taper: 0.72, hwK: 0.82, roof: [[-0.85, 0.76], [-0.45, 1.0], [0.1, 1.02], [o.zf - 0.25, 0.7]], roofZ: [-0.6, 0.25] }
    }, paint, body);
    var white = phong(0xf3f1ea);
    [-0.18, 0.18].forEach(function (x) {                                                       // twin racing stripes over the top
      var st = stations(B + 0.05, F - 0.05, 30, function (z) { var t = s.top(z); return { z: z, yb: t - 0.01, yt: t + 0.012, hw: 0.07, n: 8 }; });
      var m = loft(st, white, 8); m.position.x = x; body.add(m);
    });
    roundLights(W * 0.68, 0.58, F - 0.14, 0.08, o.head, body, false, 1);
    roundLights(W * 0.66, 0.7, B + 0.02, 0.07, o.tail, body, true, 1);
    box(W * 0.6, 0.1, 0.04, darkM, 0, 0.44, F - 0.03, body);
    box(W * 1.3, 0.08, 0.12, darkM, 0, 0.68, B + 0.08, body);                                   // rear spoiler lip
    [-1, 1].forEach(function (k) { exhaust(k * 0.22, 0.42, B + 0.02, 0.05, body); });
    mirrorPair(s.hw(o.zf - 0.35) * 0.82, 0.8, o.zf - 0.3, paint, body);
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
