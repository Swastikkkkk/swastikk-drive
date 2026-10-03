/**
 * Procedural Vehicle 3D Mesh Generator: buildEV, buildCar, buildF1, buildSUV, buildBike, buildHypercar, wheels, materials, and decals
 */
(function(window) {
  var CARENV = (function() {
    var cv = function(fn) {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      fn(c.getContext('2d')); return c;
    };
    var side = cv(function(x) {
      var g = x.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, '#566b82'); g.addColorStop(0.46, '#9aa6b0');
      g.addColorStop(0.52, '#3c3b37'); g.addColorStop(1, '#161513');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
    var up = cv(function(x) {
      x.fillStyle = '#4e6178'; x.fillRect(0, 0, 64, 64);
      var g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, '#aab6c2'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
    var dn = cv(function(x) {
      x.fillStyle = '#22211e'; x.fillRect(0, 0, 64, 64);
    });
    var t = new THREE.CubeTexture([side, side, up, dn, side, side]);
    t.needsUpdate = true;
    return t;
  })();

  var CARMATS = [];
  var phong = function(c, o) {
    var m = new THREE.MeshPhongMaterial(Object.assign({ color: c, specular: 0x4a4a4a, shininess: 85, envMap: CARENV, reflectivity: 0.25, combine: THREE.MixOperation }, o || {}));
    CARMATS.push(m);
    return m;
  };

  var carGlassM = phong(0x06090d, { specular: 0xaaaaaa, shininess: 120, reflectivity: 0.25, side: THREE.DoubleSide });
  var chromeM = phong(0xdcdfe2, { specular: 0xffffff, shininess: 140, reflectivity: 0.8 });
  var carbonM = new THREE.MeshPhongMaterial({ color: 0x111114, specular: 0x333338, shininess: 40 });
  var trimM = new THREE.MeshPhongMaterial({ color: 0x141416, specular: 0x222226, shininess: 24, side: THREE.DoubleSide });
  var plateM = new THREE.MeshLambertMaterial({ color: 0xefece4 });
  var evGlassM = phong(0x040506, { specular: 0x9a9a9a, shininess: 120, reflectivity: 0.18 });
  var goldM = phong(0xd4af37, { specular: 0xffdf78, shininess: 100, reflectivity: 0.6 });
  var npcHeadM = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 1.2 });
  var tailM2 = new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0xff1515, emissiveIntensity: 0.8 });
  var alloyM = phong(0x9aa6b0, { specular: 0xffffff, shininess: 100, reflectivity: 0.4 });
  var tireM2 = new THREE.MeshPhongMaterial({ color: 0x161616, specular: 0x2c2c2c, shininess: 9 });
  var grooveM = new THREE.MeshLambertMaterial({ color: 0x060606 });
  var barrelM = new THREE.MeshLambertMaterial({ color: 0x0c0c0d, side: THREE.DoubleSide });
  var spokeM = phong(0x24272b, { specular: 0x9a9a9a, shininess: 85, reflectivity: 0.22 });
  var lipM = phong(0xc9ccd0, { specular: 0xffffff, shininess: 120, reflectivity: 0.55 });
  var discM2 = new THREE.MeshPhongMaterial({ color: 0x76746f, specular: 0x555555, shininess: 40 });
  var hatM = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
  var calM = new THREE.MeshPhongMaterial({ color: 0xb8322f, specular: 0x664444, shininess: 50 });
  var interiorM = phong(0x0a0a0c, { specular: 0x1a1a1a, shininess: 10 });
  var seatM = phong(0x1a1a1c, { specular: 0x2a2a2c, shininess: 20 });
  var gaugeM = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
  var headLightGlassM = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 200, transparent: true, opacity: 0.9 });
  var indicatorM = new THREE.MeshLambertMaterial({ color: 0xff8800, emissive: 0xff8800, emissiveIntensity: 2 });

  function bakeGroup(root) {
    root.updateMatrixWorld(true);
    var inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), byM = new Map(), kill = [], mx = new THREE.Matrix4();
    root.traverse(function(o) {
      if (!o.isMesh || o.userData.keep) return;
      var g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      mx.multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(mx);
      if (mx.determinant() < 0) {
        var p = g.attributes.position.array, n = g.attributes.normal.array;
        for (var i = 0; i < p.length; i += 9) {
          for (var k = 0; k < 3; k++) {
            var t = p[i+3+k]; p[i+3+k] = p[i+6+k]; p[i+6+k] = t;
            t = n[i+3+k]; n[i+3+k] = n[i+6+k]; n[i+6+k] = t;
          }
        }
      }
      if (!byM.has(o.material)) byM.set(o.material, []);
      byM.get(o.material).push(g);
      kill.push(o);
    });
    kill.forEach(function(o) { o.parent.remove(o); });
    byM.forEach(function(gs, m) {
      var n = 0;
      gs.forEach(function(g) { n += g.attributes.position.count; });
      var P = new Float32Array(n * 3), N = new Float32Array(n * 3);
      var off = 0;
      gs.forEach(function(g) {
        P.set(g.attributes.position.array, off * 3);
        N.set(g.attributes.normal.array, off * 3);
        off += g.attributes.position.count;
        g.dispose();
      });
      var bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(P, 3));
      bg.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      bg.computeBoundingSphere();
      var me = new THREE.Mesh(bg, m);
      me.userData.keep = true;
      me.castShadow = (m !== carGlassM && m !== evGlassM);
      me.receiveShadow = false;
      root.add(me);
    });
  }

  function crease(g, deg) {
    g = g.index ? g.toNonIndexed() : g;
    var p = g.attributes.position.array, cnt = p.length / 9, fn = [], map = new Map();
    var K = function(i) { return Math.round(p[i]*500)+'_'+Math.round(p[i+1]*500)+'_'+Math.round(p[i+2]*500); };
    var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (var f = 0; f < cnt; f++) {
      a.fromArray(p, f * 9); b.fromArray(p, f * 9 + 3); c.fromArray(p, f * 9 + 6);
      var n = c.clone().sub(b).cross(a.clone().sub(b)).normalize();
      fn.push(n);
      for (var k = 0; k < 3; k++) {
        var kk = K(f * 9 + k * 3);
        var L = map.get(kk);
        if (!L) map.set(kk, L = []);
        L.push(f);
      }
    }
    var N = new Float32Array(p.length), ct = Math.cos(deg * Math.PI / 180), sv = new THREE.Vector3();
    for (var f = 0; f < cnt; f++) {
      for (var k = 0; k < 3; k++) {
        sv.set(0, 0, 0);
        if (Math.abs(fn[f].x) > 0.975) {
          N[f*9+k*3] = fn[f].x; N[f*9+k*3+1] = fn[f].y; N[f*9+k*3+2] = fn[f].z;
          continue;
        }
        var L = map.get(K(f * 9 + k * 3));
        for (var q = 0; q < L.length; q++) {
          var m = fn[L[q]];
          if (m.dot(fn[f]) >= ct && Math.abs(m.x) <= 0.975) sv.add(m);
        }
        if (sv.lengthSq() < 1e-8) sv.copy(fn[f]);
        sv.normalize();
        N[f*9+k*3] = sv.x; N[f*9+k*3+1] = sv.y; N[f*9+k*3+2] = sv.z;
      }
    }
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    return g;
  }

  function extrudeSide(shape, width, bev) {
    var g = new THREE.ExtrudeGeometry(shape, { depth: width - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 3, curveSegments: 12 });
    g.translate(0, 0, -(width - bev * 2) / 2);
    g.rotateY(-Math.PI / 2);
    return g;
  }

  function makeWheel(r, wd, sx, detail, aero) {
    var w = new THREE.Group(); w.rotation.order = 'YXZ';
    var spin = new THREE.Group(); w.add(spin);
    var inn = new THREE.Group(); inn.scale.x = sx; spin.add(inn);
    var put = function(geo, m, x, y, z, rx) {
      var o = new THREE.Mesh(geo, m); o.position.set(x, y || 0, z || 0);
      if (rx) o.rotation.x = rx;
      inn.add(o); return o;
    };
    var seg = detail ? 40 : 20, rr = r * 0.7;
    var pr = [[rr, -wd*0.47], [r*0.8, -wd*0.5], [r*0.9, -wd*0.49], [r*0.965, -wd*0.44], [r*0.993, -wd*0.34], [r, -wd*0.2], [r, wd*0.2], [r*0.993, wd*0.34], [r*0.965, wd*0.44], [r*0.9, wd*0.49], [r*0.8, wd*0.5], [rr, wd*0.47]].map(function(p) { return new THREE.Vector2(p[0], p[1]); });
    put(new THREE.LatheGeometry(pr, seg).rotateZ(Math.PI / 2), tireM2, 0);
    if (detail) {
      [-0.12, 0, 0.12].forEach(function(o) { put(new THREE.CylinderGeometry(r * 1.001, r * 1.001, 0.018, seg, 1, true).rotateZ(Math.PI / 2), grooveM, wd * o); });
    }
    put(new THREE.CylinderGeometry(rr * 0.99, rr * 0.99, wd * 0.9, seg, 1, true).rotateZ(Math.PI / 2), barrelM, -wd * 0.02);
    put(new THREE.TorusGeometry(rr * 0.985, 0.02, 8, seg).rotateY(Math.PI / 2), lipM, wd * 0.43);

    var NS = 5, xi = wd * 0.24, xo = wd * 0.42, ri = r * 0.17, ro = rr * 0.95, L = Math.hypot(xo - xi, ro - ri), th = Math.atan2(xo - xi, ro - ri);
    var sg = new THREE.BoxGeometry(detail ? 0.05 : 0.06, L, detail ? 0.048 : 0.06);
    sg.rotateZ(-th); sg.translate((xi + xo) / 2, (ri + ro) / 2, 0);
    for (var k = 0; k < NS; k++) {
      var a0 = k / NS * Math.PI * 2;
      (detail ? [-0.11, 0.11] : [0]).forEach(function(d) {
        var m = new THREE.Mesh(sg, spokeM); m.rotation.x = a0 + d; inn.add(m);
      });
    }
    put(new THREE.CylinderGeometry(r * 0.19, r * 0.21, 0.06, 18).rotateZ(Math.PI / 2), spokeM, xi);
    put(new THREE.CylinderGeometry(r * 0.075, r * 0.075, 0.07, 12).rotateZ(Math.PI / 2), lipM, xi + 0.012);
    if (detail) {
      for (var k = 0; k < 5; k++) {
        var a = k / 5 * Math.PI * 2 + 0.3;
        put(new THREE.CylinderGeometry(0.013, 0.013, 0.07, 6).rotateZ(Math.PI / 2), lipM, xi + 0.01, Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12);
      }
      put(new THREE.CylinderGeometry(rr * 0.78, rr * 0.78, 0.03, 32).rotateZ(Math.PI / 2), discM2, wd * 0.02);
      put(new THREE.CylinderGeometry(r * 0.27, r * 0.27, 0.08, 20).rotateZ(Math.PI / 2), hatM, wd * 0.08);
      // Brake caliper
      var caliper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.18), calM);
      caliper.position.set(wd * 0.43, -r * 0.2, 0);
      caliper.rotation.x = 0.3;
      inn.add(caliper);
    }
    bakeGroup(spin);
    if (detail) {
      var cg = new THREE.Group(); cg.scale.x = sx; w.add(cg);
      var c = new THREE.Mesh(new THREE.TorusGeometry(rr * 0.66, 0.055, 6, 10, 1.1).rotateY(Math.PI / 2), calM);
      c.scale.set(1.6, 1, 1); c.rotation.x = -0.2; c.position.set(wd * 0.12, 0, 0); cg.add(c);
    }
    return { w: w, spin: spin };
  }

  function addBox(g, geo, m, x, y, z, rx, ry, rz) {
    var b = new THREE.Mesh(geo, m);
    b.position.set(x, y, z);
    if (rx) b.rotation.x = rx;
    if (ry) b.rotation.y = ry;
    if (rz) b.rotation.z = rz;
    g.add(b);
    return b;
  }

  /* ------------------- 1. STANDARD SEDAN / ROADSTER ------------------- */
  function buildCar(o) {
    var g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    var r = o.r, zf = o.zf, zb = o.zb, F = o.F, B = o.B, W = o.W, A = r + 0.13, rc = r, sill = 0.27, belt = 0.9;
    var paint = phong(o.paint), roofM = o.roof != null ? phong(o.roof, { reflectivity: 0.15, specular: 0x3a3a3a }) : paint;
    var headM3 = o.head || npcHeadM;

    var s = new THREE.Shape();
    s.moveTo(F - 0.06, 0.3); s.lineTo(zf + A, 0.3); s.lineTo(zf + A, rc); s.absarc(zf, rc, A, 0, Math.PI, false); s.lineTo(zf - A, sill);
    s.lineTo(zb + A, sill); s.lineTo(zb + A, rc); s.absarc(zb, rc, A, 0, Math.PI, false); s.lineTo(zb - A, 0.3); s.lineTo(B + 0.08, 0.3);
    s.quadraticCurveTo(B - 0.04, 0.34, B - 0.02, 0.56); s.lineTo(B - 0.01, 0.78); s.quadraticCurveTo(B, belt + 0.03, B + 0.16, belt + 0.03);
    s.quadraticCurveTo(B + 0.6, belt + 0.05, zb + 0.2, belt + 0.02);
    if (o.ev) {
      s.lineTo(zf - 0.3, belt - 0.02); s.quadraticCurveTo(F - 0.45, belt - 0.14, F - 0.08, 0.64); s.quadraticCurveTo(F + 0.05, 0.61, F + 0.05, 0.52); s.lineTo(F + 0.04, 0.46);
    } else {
      s.lineTo(zf - 0.4, belt); s.quadraticCurveTo(F - 0.5, belt - 0.08, F - 0.12, 0.74); s.quadraticCurveTo(F + 0.03, 0.71, F + 0.04, 0.6); s.lineTo(F + 0.03, 0.5);
    }
    s.quadraticCurveTo(F + 0.02, 0.34, F - 0.06, 0.3);
    var bw = W - 0.04;
    var lb = new THREE.Mesh(crease(extrudeSide(s, bw, o.ev ? 0.12 : 0.09), 38), paint);
    body.add(lb);

    var wsB = zf - (o.ev ? 0.36 : 0.4), rf = o.ev ? -0.1 : o.wagon ? -0.25 : 0.02, rr = o.ev ? B + 0.95 : o.wagon ? B + 0.45 : B + 1.25, rb = o.ev ? B + 0.3 : o.wagon ? B + 0.25 : B + 0.52, rt = belt + (o.ev ? 0.5 : 0.54);
    var P0 = new THREE.Vector2(wsB, belt - 0.04), C0 = new THREE.Vector2(wsB - (o.ev ? 0.5 : 0.42), belt + (o.ev ? 0.44 : 0.44)), P1 = new THREE.Vector2(rf - 0.05, rt - 0.02);
    var C1 = new THREE.Vector2((rf + rr) / 2, rt + 0.06), P2 = new THREE.Vector2(rr, rt - 0.04), C2 = o.ev ? new THREE.Vector2(rr - 0.55, rt - 0.04) : o.wagon ? new THREE.Vector2(rb - 0.02, rt - 0.1) : new THREE.Vector2(rr - 0.4, belt + 0.34), P3 = new THREE.Vector2(rb, belt - 0.02);
    var cs = new THREE.Shape();
    cs.moveTo(P3.x, belt - 0.06); cs.lineTo(P0.x, belt - 0.06); cs.lineTo(P0.x, P0.y); cs.quadraticCurveTo(C0.x, C0.y, P1.x, P1.y); cs.quadraticCurveTo(C1.x, C1.y, P2.x, P2.y); cs.quadraticCurveTo(C2.x, C2.y, P3.x, P3.y);
    var cw = W - 0.32, cb = 0.1, TH = 0.3;
    var tumble = function(geo) {
      var p = geo.attributes.position;
      for (var i = 0; i < p.count; i++) {
        var y = p.getY(i);
        if (y > belt) p.setX(i, p.getX(i) * (1 - (y - belt) * TH));
      }
      p.needsUpdate = true;
      return geo;
    };
    var cab = new THREE.Mesh(crease(tumble(extrudeSide(cs, cw, cb)), 38), o.ev ? evGlassM : roofM);
    body.add(cab);

    // Front headlights (modern LED strip style)
    addBox(body, new THREE.BoxGeometry(W * 0.32, 0.06, 0.1), headLightGlassM, W * 0.28, 0.62, F - 0.08, 0, -0.15);
    addBox(body, new THREE.BoxGeometry(W * 0.32, 0.06, 0.1), headLightGlassM, -W * 0.28, 0.62, F - 0.08, 0, 0.15);
    // LED DRL strip
    addBox(body, new THREE.BoxGeometry(W * 0.4, 0.02, 0.04), headLightGlassM, 0, 0.55, F - 0.05);
    // Rear full-width light bar
    addBox(body, new THREE.BoxGeometry(W * 0.85, 0.05, 0.05), tailM2, 0, 0.85, B + 0.04);
    // Side mirrors
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.12, 0.18, 0.08), paint, sd * (W * 0.48), 1.0, wsB + 0.2);
    });
    // Door handles
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.04, 0.03, 0.12), chromeM, sd * (W * 0.46), 0.75, 0.1);
    });
    // Interior details
    addBox(body, new THREE.BoxGeometry(W * 0.5, 0.15, 1.5), interiorM, 0, 0.75, 0);
    addBox(body, new THREE.BoxGeometry(0.35, 0.35, 0.5), seatM, 0, 0.6, -0.2); // driver seat
    addBox(body, new THREE.BoxGeometry(0.35, 0.35, 0.5), seatM, 0, 0.6, 0.5); // passenger
    // Steering wheel
    addBox(body, new THREE.TorusGeometry(0.12, 0.015, 8, 12), trimM, 0, 0.7, -0.15, Math.PI/2, 0, 0);

    bakeGroup(body);
    return { g: g, body: body, wheels: [], tail: tailM2, paint: paint, vehicleType: 'car' };
  }

  function buildEV(o) {
    var result = buildCar(Object.assign({ ev: true }, o));
    result.vehicleType = 'ev';
    return result;
  }

  /* ------------------- 2. FORMULA 1 SINGLE SEATER RACER ------------------- */
  function buildF1(o) {
    var g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    var paint = phong(o.paint, { shininess: 120, specular: 0x666666 });
    var F = o.F || 2.7, B = o.B || -2.3, W = o.W || 2.0;

    // Narrow aerodynamic nose cone
    var nose = new THREE.Mesh(new THREE.ConeGeometry(0.24, F + 0.2, 16), paint);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.38, (F * 0.45));
    body.add(nose);

    // Cockpit & Monocoque tub
    var tub = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.46, 2.2), paint);
    tub.position.set(0, 0.45, 0.1);
    body.add(tub);

    // Halo safety structure above driver cockpit
    var haloM = carbonM;
    var halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 16, Math.PI), haloM);
    halo.position.set(0, 0.85, 0.2);
    halo.rotation.x = Math.PI / 2;
    body.add(halo);

    // Driver helmet in cockpit
    var helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), goldM);
    helmet.position.set(0, 0.72, 0.15);
    body.add(helmet);
    // Helmet visor
    var visor = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 10, 0, Math.PI), carGlassM);
    visor.position.set(0, 0.72, 0.15);
    visor.rotation.x = -0.3;
    body.add(visor);

    // Sidepods with air intakes
    [-1, 1].forEach(function(sd) {
      var pod = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.38, 1.4), paint);
      pod.position.set(sd * 0.62, 0.38, -0.2);
      body.add(pod);
      // Radiator intake hole
      addBox(body, new THREE.BoxGeometry(0.38, 0.25, 0.08), carbonM, sd * 0.62, 0.4, 0.52);
      // Bargeboards
      addBox(body, new THREE.BoxGeometry(0.04, 0.34, 0.6), carbonM, sd * 0.92, 0.36, 0.4);
      // Sidepod turning vanes
      for (var i = 0; i < 3; i++) {
        addBox(body, new THREE.BoxGeometry(0.02, 0.12, 0.4), carbonM, sd * 1.0, 0.25, -0.1 + i * 0.35);
      }
    });

    // Massive Front Wing with multi-tier elements and endplates
    var fWing = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, 0.04, 0.45), carbonM);
    fWing.position.set(0, 0.18, F - 0.12);
    body.add(fWing);
    // Upper front wing element
    var fWing2 = new THREE.Mesh(new THREE.BoxGeometry(W * 0.88, 0.03, 0.35), carbonM);
    fWing2.position.set(0, 0.22, F - 0.08);
    body.add(fWing2);
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.04, 0.24, 0.52), paint, sd * (W * 0.48), 0.26, F - 0.12);
      // Endplate strakes
      addBox(body, new THREE.BoxGeometry(0.03, 0.18, 0.4), carbonM, sd * (W * 0.48), 0.15, F - 0.05);
    });

    // Rear Wing with high downforce DRS flap and endplates
    var rWing = new THREE.Mesh(new THREE.BoxGeometry(W * 0.75, 0.04, 0.38), carbonM);
    rWing.position.set(0, 1.05, B + 0.1);
    body.add(rWing);
    var rFlap = new THREE.Mesh(new THREE.BoxGeometry(W * 0.75, 0.03, 0.22), paint);
    rFlap.position.set(0, 1.15, B + 0.02);
    rFlap.rotation.x = -0.25;
    body.add(rFlap);
    // DRS actuator pods
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.08, 0.12, 0.15), carbonM, sd * (W * 0.37), 1.22, B + 0.05);
      addBox(body, new THREE.BoxGeometry(0.04, 0.75, 0.48), paint, sd * (W * 0.37), 0.85, B + 0.06);
    });

    // Rear Rain Safety LED
    addBox(body, new THREE.BoxGeometry(0.12, 0.12, 0.08), tailM2, 0, 0.35, B - 0.08);

    // Front and Rear Exposed Wishbone Suspension rods
    var suspM = carbonM;
    [[1, o.zf], [-1, o.zf], [1, o.zb], [-1, o.zb]].forEach(function(pair) {
      var sx = pair[0], z = pair[1];
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.65, 8), suspM);
      arm.position.set(sx * 0.55, 0.34, z);
      arm.rotation.z = sx * 1.35;
      body.add(arm);
      // Upper wishbone
      var arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 8), suspM);
      arm2.position.set(sx * 0.48, 0.52, z);
      arm2.rotation.z = sx * 1.1;
      body.add(arm2);
    });

    // Exhaust tips
    addBox(body, new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), chromeM, 0, 0.55, B - 0.1, Math.PI/2, 0, 0);

    bakeGroup(body);
    return { g: g, body: body, wheels: [], tail: tailM2, paint: paint, vehicleType: 'f1' };
  }

  /* ------------------- 3. HEAVY RUGGED OFF-ROAD SUV 4x4 ------------------- */
  function buildSUV(o) {
    var g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    var paint = phong(o.paint, { shininess: 65, specular: 0x222222 });
    var F = o.F || 2.4, B = o.B || -2.3, W = o.W || 2.35;
    var headM3 = o.head || npcHeadM;

    // High ground clearance boxy lower body
    var lower = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.75, F - B - 0.2), paint);
    lower.position.set(0, 0.72, (F + B) / 2);
    body.add(lower);

    // Heavy duty black underbody fender flares & bull bar
    var bumperF = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.32, 0.35), trimM);
    bumperF.position.set(0, 0.5, F + 0.05);
    body.add(bumperF);
    // Bullbar metal grill guard
    addBox(body, new THREE.TorusGeometry(0.35, 0.04, 8, 16, Math.PI), chromeM, 0, 0.65, F + 0.22, 0, 0, 0);
    // Winch on bullbar
    addBox(body, new THREE.CylinderGeometry(0.06, 0.06, 0.15, 12), chromeM, 0, 0.65, F + 0.3, Math.PI/2, 0, 0);

    // Tall spacious cabin & panoramic roof
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(W - 0.26, 0.75, (F - B) * 0.58), paint);
    cabin.position.set(0, 1.42, (F + B) / 2 - 0.25);
    body.add(cabin);

    // Large dark tinted windows
    addBox(body, new THREE.BoxGeometry(W - 0.28, 0.45, 0.1), carGlassM, 0, 1.45, (F + B) / 2 + 0.75, 0.28, 0, 0); // windshield
    addBox(body, new THREE.BoxGeometry(W - 0.28, 0.48, 0.1), carGlassM, 0, 1.45, B + 0.2, -0.15, 0, 0); // rear glass
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.08, 0.45, (F - B) * 0.5), carGlassM, sd * (W * 0.46), 1.45, (F + B) / 2 - 0.25);
      // Heavy off-road rock sliders / side steps
      addBox(body, new THREE.BoxGeometry(0.18, 0.08, F - B - 0.8), chromeM, sd * (W * 0.52), 0.36, (F + B) / 2);
      // Wide wheel arch flares
      addBox(body, new THREE.BoxGeometry(0.14, 0.28, 0.95), trimM, sd * (W * 0.48), 0.7, o.zf);
      addBox(body, new THREE.BoxGeometry(0.14, 0.28, 0.95), trimM, sd * (W * 0.48), 0.7, o.zb);
      // Side mirrors (large off-road style)
      addBox(body, new THREE.BoxGeometry(0.18, 0.22, 0.12), paint, sd * (W * 0.5), 1.2, (F + B) / 2 - 0.1);
    });

    // Roof rack with overland luggage rails & auxiliary high-beam light bar
    addBox(body, new THREE.BoxGeometry(W * 0.75, 0.06, 1.8), trimM, 0, 1.82, (F + B) / 2 - 0.2);
    // Roof light pods (4 LEDs)
    for (var i = -1.5; i <= 1.5; i += 1) {
      addBox(body, new THREE.BoxGeometry(0.16, 0.09, 0.08), headM3, i * 0.24, 1.88, (F + B) / 2 + 0.65);
    }
    // Roof rails
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.05, 0.05, 1.6), chromeM, sd * (W * 0.37), 1.8, (F + B) / 2 - 0.2);
    });

    // Rear Mounted Spare Wheel
    var spare = makeWheel(o.r || 0.48, 0.35, 1, false);
    spare.w.position.set(0, 0.95, B - 0.2);
    body.add(spare.w);
    // Spare cover
    addBox(body, new THREE.BoxGeometry(0.55, 0.55, 0.08), paint, 0, 0.95, B - 0.45);

    // Front high-power headlights & rear LED vertical light columns
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.35, 0.16, 0.08), headLightGlassM, sd * (W * 0.32), 0.72, F + 0.02);
      addBox(body, new THREE.BoxGeometry(0.08, 0.52, 0.06), tailM2, sd * (W * 0.44), 1.05, B + 0.08);
      // Fog lights
      addBox(body, new THREE.BoxGeometry(0.18, 0.08, 0.06), headLightGlassM, sd * (W * 0.3), 0.42, F + 0.05);
    });
    // Rear diff lock indicator light
    addBox(body, new THREE.BoxGeometry(0.06, 0.06, 0.06), indicatorM, 0.25, 1.05, B + 0.02);

    // Snorkel on A-pillar
    addBox(body, new THREE.CylinderGeometry(0.05, 0.05, 1.6, 10), paint, -W * 0.46, 1.2, (F + B) / 2 + 0.4);

    // Interior - rugged seats
    addBox(body, new THREE.BoxGeometry(W * 0.55, 0.15, 1.8), interiorM, 0, 0.85, (F + B) / 2 - 0.2);
    addBox(body, new THREE.BoxGeometry(0.4, 0.4, 0.55), seatM, 0, 0.7, (F + B) / 2 - 0.3);
    addBox(body, new THREE.BoxGeometry(0.4, 0.4, 0.55), seatM, 0, 0.7, (F + B) / 2 + 0.4);

    bakeGroup(body);
    return { g: g, body: body, wheels: [], tail: tailM2, paint: paint, vehicleType: 'suv' };
  }

  /* ------------------- 4. AERODYNAMIC SUPERBIKE / MOTORCYCLE ------------------- */
  function buildBike(o) {
    var g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    var paint = phong(o.paint, { shininess: 140, specular: 0xffffff });
    var F = o.F || 1.6, B = o.B || -1.5, W = 0.9;
    var headM3 = o.head || npcHeadM;

    // Slim central fuel tank and aerodynamic fairing
    var tank = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.2, 14), paint);
    tank.rotation.x = -Math.PI / 2.3;
    tank.position.set(0, 0.82, 0.25);
    body.add(tank);

    // Ergonomic Racing Seat & tail section
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.6), trimM);
    seat.position.set(0, 0.75, -0.28);
    body.add(seat);
    var tailCowl = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.8, 12), paint);
    tailCowl.rotation.x = Math.PI / 2.2;
    tailCowl.position.set(0, 0.88, -0.72);
    body.add(tailCowl);

    // Front aerodynamic bubble windscreen
    var screen = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI), carGlassM);
    screen.rotation.x = -0.75;
    screen.position.set(0, 0.98, 0.65);
    body.add(screen);

    // Front dual slanted LED headlights
    addBox(body, new THREE.BoxGeometry(0.18, 0.06, 0.08), headLightGlassM, 0.12, 0.75, 0.85, -0.2, 0.2);
    addBox(body, new THREE.BoxGeometry(0.18, 0.06, 0.08), headLightGlassM, -0.12, 0.75, 0.85, -0.2, -0.2);

    // Engine block & exposed titanium exhaust pipe
    var engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.45, 0.65), carbonM);
    engineBlock.position.set(0, 0.42, 0.1);
    body.add(engineBlock);

    var exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 12), chromeM);
    exhaust.rotation.x = -Math.PI / 2.7;
    exhaust.position.set(0.26, 0.48, -0.5);
    body.add(exhaust);
    // Exhaust heat shield
    addBox(body, new THREE.BoxGeometry(0.14, 0.02, 0.5), carbonM, 0.22, 0.46, -0.3);

    // Clip-on Handlebars with bar-end mirrors
    var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 8), chromeM);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.94, 0.52);
    body.add(bar);
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.SphereGeometry(0.05, 8, 8), carbonM, sd * 0.42, 0.96, 0.52);
      // Brake/clutch levers
      addBox(body, new THREE.BoxGeometry(0.015, 0.04, 0.1), chromeM, sd * 0.38, 0.93, 0.52);
    });

    // Front inverted telescopic forks (gold anodized)
    [-1, 1].forEach(function(sd) {
      var fork = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 10), goldM);
      fork.rotation.x = -0.36;
      fork.position.set(sd * 0.15, 0.5, o.zf);
      body.add(fork);
      // Fork slider
      addBox(body, new THREE.CylinderGeometry(0.042, 0.042, 0.08, 10), chromeM, sd * 0.15, 0.38, o.zf - 0.02);
      // Brake caliper on fork
      var cal = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.09), calM);
      cal.position.set(sd * 0.15, 0.35, o.zf + 0.05);
      body.add(cal);
      // Brake disc
      addBox(body, new THREE.CylinderGeometry(0.12, 0.12, 0.01, 16), discM2, sd * 0.15, 0.4, o.zf, Math.PI/2, 0, 0);
    });

    // Single-sided swingarm at rear
    var swingarm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.85), alloyM);
    swingarm.position.set(-0.16, 0.38, (o.zb + 0.2) / 2);
    body.add(swingarm);
    // Swingarm pivot
    addBox(body, new THREE.CylinderGeometry(0.03, 0.03, 0.1, 12), chromeM, -0.16, 0.38, o.zb + 0.15, Math.PI/2, 0, 0);

    // Rear shock absorber
    var shock = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 8), goldM);
    shock.position.set(-0.16, 0.62, -0.3);
    shock.rotation.x = -0.5;
    body.add(shock);

    // Rear slim tail light
    addBox(body, new THREE.BoxGeometry(0.22, 0.04, 0.06), tailM2, 0, 0.92, B + 0.35);

    // Chain & sprocket
    addBox(body, new THREE.TorusGeometry(0.08, 0.008, 8, 20), chromeM, -0.16, 0.42, o.zb, Math.PI/2, 0, 0);
    addBox(body, new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), chromeM, -0.16, 0.42, o.zb + 0.01, Math.PI/2, 0, 0);

    // Foot pegs
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.03, 0.02, 0.12), alloyM, sd * 0.22, 0.45, 0.2);
    });

    // Rear wheel (wider) - single sided
    // The wheel system handles this via makeWheel

    // Dashboard/instrument cluster
    addBox(body, new THREE.BoxGeometry(0.14, 0.06, 0.08), gaugeM, 0, 0.95, 0.45, -0.3, 0, 0);

    bakeGroup(body);
    return { g: g, body: body, wheels: [], tail: tailM2, paint: paint, vehicleType: 'bike' };
  }

  /* ------------------- 5. HYPERREALISTIC AGGRESSIVE HYPERCAR ------------------- */
  function buildHypercar(o) {
    var g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    var paint = phong(o.paint, { shininess: 150, specular: 0xffffff, reflectivity: 0.35 });
    var F = o.F || 2.5, B = o.B || -2.4, W = o.W || 2.38;
    var headM3 = o.head || npcHeadM;

    // Ultra-low slung carbon chassis bottom
    var chassisPlate = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, 0.12, F - B + 0.2), carbonM);
    chassisPlate.position.set(0, 0.22, (F + B) / 2);
    body.add(chassisPlate);

    // Sculpted hypercar body with sharp front splitter & hood air vents
    var mainBody = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.42, F - B - 0.4), paint);
    mainBody.position.set(0, 0.48, (F + B) / 2);
    body.add(mainBody);

    // Sleek fighter-jet style cockpit dome
    var dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), carGlassM);
    dome.scale.set((W * 0.38), 0.52, 1.25);
    dome.position.set(0, 0.8, -0.1);
    body.add(dome);

    // Front race splitter & aggressive intake tunnels
    var splitter = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.05, 0.55), carbonM);
    splitter.position.set(0, 0.16, F + 0.08);
    body.add(splitter);
    // Active aero flaps on splitter
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.15, 0.04, 0.3), carbonM, sd * (W * 0.32), 0.18, F + 0.15, 0, 0, sd * -0.15);
    });

    // Aggressive Le Mans style Shark Fin running down the rear spine
    var fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.55, 1.4), carbonM);
    fin.position.set(0, 0.95, -0.9);
    body.add(fin);

    // Active Aero GT Rear Wing mounted on dual swan-neck struts
    var wing = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.05, 0.42), carbonM);
    wing.position.set(0, 1.05, B + 0.15);
    body.add(wing);
    // DRS flap
    var drsFlap = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.03, 0.18), paint);
    drsFlap.position.set(0, 1.18, B + 0.08);
    drsFlap.rotation.x = -0.3;
    body.add(drsFlap);
    [-1, 1].forEach(function(sd) {
      // Swan neck uprights
      var strut = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.18), carbonM);
      strut.position.set(sd * 0.45, 0.85, B + 0.2);
      strut.rotation.x = -0.22;
      body.add(strut);
      // Wing endplates with aero vortex generators
      addBox(body, new THREE.BoxGeometry(0.03, 0.38, 0.52), paint, sd * (W * 0.46), 1.05, B + 0.15);
      // Deep sculpted side-intake air ducts
      addBox(body, new THREE.BoxGeometry(0.24, 0.35, 1.1), carbonM, sd * (W * 0.44), 0.48, -0.1);
      // Side intake vanes
      for (var i = 0; i < 4; i++) {
        addBox(body, new THREE.BoxGeometry(0.015, 0.28, 0.95), carbonM, sd * (W * 0.44), 0.45 + i * 0.07, -0.1);
      }
    });

    // Rear giant race diffuser with 6 vertical strakes
    var diffuser = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.14, 0.55), carbonM);
    diffuser.position.set(0, 0.22, B - 0.05);
    diffuser.rotation.x = -0.15;
    body.add(diffuser);
    for (var k = -2.5; k <= 2.5; k += 1) {
      addBox(body, new THREE.BoxGeometry(0.02, 0.2, 0.45), carbonM, k * 0.28, 0.25, B - 0.05);
    }
    // Diffuser central exhaust tunnel
    addBox(body, new THREE.BoxGeometry(0.35, 0.18, 0.4), carbonM, 0, 0.25, B - 0.1);

    // Quad central titanium exhaust pipes with blue heat discoloration
    var exhaustTipM = phong(0x8a5a3a, { specular: 0xaaaaaa, shininess: 80 });
    [-0.14, -0.05, 0.05, 0.14].forEach(function(xOff) {
      var ex = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 12), exhaustTipM);
      ex.rotation.x = Math.PI / 2;
      ex.position.set(xOff, 0.62, B - 0.06);
      body.add(ex);
    });

    // Sleek razor-thin matrix laser headlights with LED signature
    [-1, 1].forEach(function(sd) {
      // Main headlight unit
      addBox(body, new THREE.BoxGeometry(0.42, 0.05, 0.18), headLightGlassM, sd * (W * 0.34), 0.54, F - 0.12, 0, sd * -0.28, 0);
      // LED DRL signature (angular)
      addBox(body, new THREE.BoxGeometry(0.28, 0.02, 0.04), headLightGlassM, sd * (W * 0.34), 0.5, F - 0.1, 0, sd * -0.1, 0);
      // Turn signal
      addBox(body, new THREE.BoxGeometry(0.06, 0.06, 0.05), indicatorM, sd * (W * 0.42), 0.58, F - 0.12);
    });

    // Continuous glowing Cyberpunk rear light strip
    var rearLight = new THREE.Mesh(new THREE.BoxGeometry(W * 0.88, 0.04, 0.06), tailM2);
    rearLight.position.set(0, 0.74, B);
    body.add(rearLight);
    // Center brake light (higher)
    addBox(body, new THREE.BoxGeometry(0.6, 0.03, 0.04), tailM2, 0, 0.95, B + 0.02);

    // Side skirts
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.04, 0.18, 1.8), carbonM, sd * (W * 0.48), 0.35, 0);
    });

    // Interior - racing bucket seats
    addBox(body, new THREE.BoxGeometry(W * 0.4, 0.12, 1.2), interiorM, 0, 0.65, -0.1);
    addBox(body, new THREE.BoxGeometry(0.35, 0.38, 0.5), seatM, -0.2, 0.55, -0.35);
    addBox(body, new THREE.BoxGeometry(0.35, 0.38, 0.5), seatM, 0.2, 0.55, -0.35);
    // Racing harness
    addBox(body, new THREE.BoxGeometry(0.01, 0.08, 0.4), trimM, -0.15, 0.55, -0.35);
    addBox(body, new THREE.BoxGeometry(0.01, 0.08, 0.4), trimM, 0.15, 0.55, -0.35);
    // Steering wheel (F1 style)
    addBox(body, new THREE.TorusGeometry(0.1, 0.012, 8, 12), carbonM, 0, 0.6, -0.15, Math.PI/2, 0, 0);
    // Paddle shifters
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.03, 0.01, 0.06), carbonM, sd * 0.1, 0.58, -0.12, 0, sd * 0.3, 0);
    });
    // Digital dash
    addBox(body, new THREE.BoxGeometry(0.18, 0.04, 0.06), gaugeM, 0, 0.72, -0.2, -0.2, 0, 0);

    bakeGroup(body);
    return { g: g, body: body, wheels: [], tail: tailM2, paint: paint, vehicleType: 'hypercar' };
  }

  /* ------------------- 7. HEAVY HAULER TRUCK ------------------- */
  function buildTruck(o) {
    var g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    var paint = phong(o.paint, { shininess: 60, specular: 0x222222 });
    var F = o.F || 3.0, B = o.B || -4.0, W = o.W || 2.5;
    var headM3 = o.head || npcHeadM;

    // Massive chassis frame
    var frame = new THREE.Mesh(new THREE.BoxGeometry(W, 0.8, F - B + 1.0), paint);
    frame.position.set(0, 0.6, (F + B) / 2);
    body.add(frame);

    // Cabin - tall and boxy
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 1.2, 2.0), paint);
    cabin.position.set(0, 1.6, (F + B) / 2 - 0.5);
    body.add(cabin);

    // Windshield (large, flat)
    addBox(body, new THREE.BoxGeometry(W - 0.25, 0.8, 0.1), carGlassM, 0, 1.8, F - 0.1, 0.2, 0, 0);
    // Rear window
    addBox(body, new THREE.BoxGeometry(W - 0.25, 0.6, 0.1), carGlassM, 0, 1.7, B + 0.5, -0.15, 0, 0);

    // Side windows
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.1, 0.7, 1.6), carGlassM, sd * (W * 0.48), 1.7, (F + B) / 2 - 0.5);
      // Door handles
      addBox(body, new THREE.BoxGeometry(0.05, 0.04, 0.15), chromeM, sd * (W * 0.47), 1.2, (F + B) / 2 - 0.8);
      // Side mirrors (large truck mirrors)
      addBox(body, new THREE.BoxGeometry(0.25, 0.3, 0.15), paint, sd * (W * 0.55), 2.0, (F + B) / 2 - 1.0);
    });

    // Massive front bullbar/grille
    var bumper = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.6, 0.5), trimM);
    bumper.position.set(0, 0.7, F + 0.25);
    body.add(bumper);
    // Grille bars
    for (var i = -1; i <= 1; i += 1) {
      addBox(body, new THREE.BoxGeometry(0.04, 0.35, 0.08), chromeM, i * 0.5, 0.85, F + 0.3);
    }

    // Cabin roof fairing
    addBox(body, new THREE.BoxGeometry(W * 0.8, 0.15, 1.8), trimM, 0, 2.3, (F + B) / 2 - 0.5);
    // Roof lights
    for (var i = -1; i <= 1; i += 1) {
      addBox(body, new THREE.BoxGeometry(0.12, 0.08, 0.08), headM3, i * 0.4, 2.5, (F + B) / 2 - 0.3);
    }

    // Sleeper cab extension
    addBox(body, new THREE.BoxGeometry(W - 0.2, 0.8, 2.5), paint, 0, 1.4, B - 1.5);
    // Rear fender flares
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.25, 0.5, 1.2), trimM, sd * (W * 0.52), 0.8, B - 0.5);
    });

    // Massive rear bumper with lights
    var rearBumper = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.6, 0.4), trimM);
    rearBumper.position.set(0, 0.7, B - 0.2);
    body.add(rearBumper);
    // Rear light bar
    addBox(body, new THREE.BoxGeometry(W * 0.9, 0.08, 0.1), tailM2, 0, 0.9, B - 0.4);
    // Mud flaps
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.3, 0.6, 0.05), rubber, sd * (W * 0.5), 0.5, B - 0.6);
    });

    // Front headlights (quad)
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.4, 0.2, 0.12), headLightGlassM, sd * (W * 0.3), 0.85, F + 0.05, 0, sd * -0.15);
      addBox(body, new THREE.BoxGeometry(0.4, 0.1, 0.1), headLightGlassM, sd * (W * 0.3), 0.6, F + 0.02, 0, sd * -0.1);
    });
    // Side marker lights
    [-1, 1].forEach(function(sd) {
      addBox(body, new THREE.BoxGeometry(0.06, 0.06, 0.2), indicatorM, sd * (W * 0.5), 1.0, (F + B) / 2);
    });

    // Exhaust stacks
    [-1, 1].forEach(function(sd) {
      var stack = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.5, 12), chromeM);
      stack.rotation.x = Math.PI / 2;
      stack.position.set(sd * 0.65, 1.4, B - 0.3);
      body.add(stack);
      // Heat shield
      addBox(body, new THREE.BoxGeometry(0.1, 0.04, 0.6), carbonM, sd * 0.6, 1.35, B - 0.25);
    });

    // Fuel tanks
    [-1, 1].forEach(function(sd) {
      var tank = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 16), trimM);
      tank.rotation.x = Math.PI / 2;
      tank.position.set(sd * (W * 0.45), 0.8, (F + B) / 2 - 1.0);
      body.add(tank);
    });

    // Rear dual wheels visualization
    [-1, 1].forEach(function(sd) {
      var dual = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 16), tyreM2);
      dual.rotation.z = Math.PI / 2;
      dual.position.set(sd * 0.9, 0.5, B - 0.8);
      body.add(dual);
      var dual2 = dual.clone();
      dual2.position.z = B - 1.3;
      body.add(dual2);
    });

    bakeGroup(body);
    return { g: g, body: body, wheels: [], tail: tailM2, paint: paint, vehicleType: 'truck' };
  }

  window.CarBuilder = {
    buildCar: buildCar,
    buildEV: buildEV,
    buildF1: buildF1,
    buildSUV: buildSUV,
    buildBike: buildBike,
    buildHypercar: buildHypercar,
    buildTruck: buildTruck,
    makeWheel: makeWheel,
    bakeGroup: bakeGroup,
    crease: crease,
    extrudeSide: extrudeSide,
    phong: phong,
    CARMATS: CARMATS
  };
})(window);