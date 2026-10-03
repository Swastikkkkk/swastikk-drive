/**
 * Advanced Track Editor, Procedural Stadium, Obstacles & Sharing Subsystem
 */
(function(window) {
  var TrackEditor = {
    canvas: null,
    ctx: null,
    isOpen: false,
    isTesting: false,
    
    // Editor modes: 'draw', 'edit_points', 'obstacles'
    editMode: 'draw',
    
    // Track Geometry
    points: [], // Array of {x, y} in canvas/normalized space
    selectedPointIdx: -1,
    draggedPointIdx: -1,
    roadWidth: 16, // metres
    isClosed: false,
    
    // Custom Obstacles: [{ type: 'speed_breaker'|'blocker'|'ramp'|'tires', u: 0.25, side: 0, scale: 1 }]
    obstacles: [],
    selectedObstacleType: 'speed_breaker',

    // Environment & Stadium Configuration
    environment: 'meadow',
    weather: 'day',
    time: 'day',
    seed: 271828,
    trackName: 'Custom GP',
    gravityMode: 'normal', // 'normal', 'moon', 'mars'

    // Serialized storage
    savedTracks: [],

    init: function() {
      this.loadSavedTracks();
    },

    loadSavedTracks: function() {
      try {
        var raw = localStorage.getItem('sl_custom_tracks');
        if (raw) {
          this.savedTracks = JSON.parse(raw);
        }
      } catch (e) {
        this.savedTracks = [];
      }
    },

    saveCurrentTrack: function(name) {
      if (this.points.length < 8) return false;
      this.trackName = name || this.trackName || 'Custom GP ' + (this.savedTracks.length + 1);
      
      var trackData = this.exportTrackData();
      // Remove existing with same name if any
      this.savedTracks = this.savedTracks.filter(function(t) { return t.name !== trackData.name; });
      this.savedTracks.push(trackData);
      
      try {
        localStorage.setItem('sl_custom_tracks', JSON.stringify(this.savedTracks));
        return true;
      } catch (e) {
        return false;
      }
    },

    exportTrackData: function() {
      return {
        id: 'TRK-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        name: this.trackName,
        points: this.points.map(function(p) { return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]; }),
        roadWidth: this.roadWidth,
        isClosed: this.isClosed,
        obstacles: this.obstacles,
        environment: this.environment,
        weather: this.weather,
        time: this.time,
        seed: this.seed,
        gravityMode: this.gravityMode,
        createdAt: Date.now()
      };
    },

    importTrackData: function(data) {
      if (!data || !Array.isArray(data.points) || data.points.length < 4) return false;
      this.trackName = data.name || 'Imported Track';
      this.points = data.points.map(function(p) { return { x: p[0], y: p[1] }; });
      this.roadWidth = data.roadWidth || 12;
      this.isClosed = data.isClosed !== false;
      this.obstacles = Array.isArray(data.obstacles) ? data.obstacles : [];
      this.environment = data.environment || 'meadow';
      this.weather = data.weather || 'day';
      this.time = data.time || 'day';
      this.seed = data.seed || 271828;
      this.gravityMode = data.gravityMode || 'normal';
      return true;
    },

    // Generates a compact share code
    getShareCode: function() {
      var data = this.exportTrackData();
      try {
        var str = JSON.stringify(data);
        return 'TRK' + btoa(unescape(encodeURIComponent(str)));
      } catch (e) {
        return '';
      }
    },

    loadFromShareCode: function(code) {
      if (!code || !code.startsWith('TRK')) return false;
      try {
        var jsonStr = decodeURIComponent(escape(atob(code.substring(3))));
        var data = JSON.parse(jsonStr);
        return this.importTrackData(data);
      } catch (e) {
        return false;
      }
    },

    // ----------------------------------------------------
    // TRACK VALIDATION
    // ----------------------------------------------------
    validate: function() {
      if (this.points.length < 8) {
        return { valid: false, error: 'Draw a larger loop with at least 8 control points.' };
      }
      if (!this.isClosed) {
        return { valid: false, error: 'Circuit must be closed. Connect the end back to the start.' };
      }

      // Check self-intersections
      var pts = this.points;
      var n = pts.length;
      for (var i = 0; i < n; i++) {
        var a = pts[i], b = pts[(i + 1) % n];
        for (var j = i + 2; j < n; j++) {
          if ((j + 1) % n === i) continue;
          var c = pts[j], d = pts[(j + 1) % n];
          if (this.segmentsIntersect(a, b, c, d)) {
            return { valid: false, error: 'Track intersects itself. Untangle crossing segments.' };
          }
        }
      }

      // Check sharp turns
      for (var i = 0; i < n; i++) {
        var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
        var v1x = p1.x - p0.x, v1y = p1.y - p0.y;
        var v2x = p2.x - p1.x, v2y = p2.y - p1.y;
        var l1 = Math.hypot(v1x, v1y) || 1, l2 = Math.hypot(v2x, v2y) || 1;
        var cosA = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
        var angle = Math.acos(cosA) * 180 / Math.PI;
        if (angle > 110) {
          return { valid: false, error: 'Turn at point ' + (i + 1) + ' is too sharp. Smooth out the corner.' };
        }
      }

      return { valid: true };
    },

    segmentsIntersect: function(a, b, c, d) {
      var d1 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
      var d2 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
      var d3 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      var d4 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
      return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
    },

    // Smooth curve points using Chaikin algorithm
    smoothPoints: function() {
      if (this.points.length < 4) return;
      var newPts = [];
      var n = this.points.length;
      for (var i = 0; i < n; i++) {
        var p0 = this.points[i];
        var p1 = this.points[(i + 1) % n];
        newPts.push({ x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y });
        newPts.push({ x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y });
      }
      this.points = newPts;
    },

    // ----------------------------------------------------
    // PROCEDURAL STADIUM & SOLID COLLISION GENERATION
    // ----------------------------------------------------
    generateStadiumMeshAndColliders: function(scene, world, curve, CN, roadWidth, theme, seed) {
      var root = new THREE.Group();
      var solidBodies = [];
      var ownedMaterials = [];
      var randState = (seed || 271828) >>> 0;
      var rand = function() {
        randState = (Math.imul(randState, 1664525) + 1013904223) >>> 0;
        return randState / 4294967296;
      };

      var L = curve.getLength();
      var halfW = (roadWidth || 12) / 2;

      // Materials
      var standMat = new THREE.MeshLambertMaterial({ color: theme.stand || 0x3a3934 });
      var roofMat = new THREE.MeshLambertMaterial({ color: theme.standTrim || 0xb8322f });
      var glassMat = new THREE.MeshLambertMaterial({ color: 0x9db9c1 });
      var barrierMat = new THREE.MeshLambertMaterial({ color: 0x8a8a8a });
      var rubberMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
      var bumpMat = new THREE.MeshLambertMaterial({ color: 0xd4a83a });
      ownedMaterials.push(standMat, roofMat, glassMat, barrierMat, rubberMat, bumpMat);

      // Sample curve
      var samples = [];
      for (var i = 0; i < CN; i++) {
        var u = i / CN;
        var p = curve.getPointAt(u);
        var tg = curve.getTangentAt(u);
        var nx = -tg.z;
        var nz = tg.x;
        samples.push({ p: p, tg: tg, n: { x: nx, y: 0, z: nz } });
      }

      // 1. Solid Grandstands along Straights
      var numStands = Math.max(6, Math.min(14, Math.floor(L / 50)));
      for (var s = 0; s < numStands; s++) {
        var su = (s + 0.5) / numStands;
        var smp = curve.getPointAt(su);
        var tg = curve.getTangentAt(su);
        var nx = -tg.z, nz = tg.x;
        var side = (s % 2 === 0 ? 1 : -1);
        var dist = halfW + 16 + rand() * 4;

        var gx = smp.x + nx * side * dist;
        var gy = smp.y;
        var gz = smp.z + nz * side * dist;
        var yaw = Math.atan2(smp.x - gx, smp.z - gz);

        var standGrp = new THREE.Group();
        standGrp.position.set(gx, gy, gz);
        standGrp.rotation.y = yaw;

        // Seating block
        var bldgW = 28, bldgH = 9, bldgD = 12;
        var meshBldg = new THREE.Mesh(new THREE.BoxGeometry(bldgW, bldgH, bldgD), standMat);
        meshBldg.position.y = bldgH / 2;
        standGrp.add(meshBldg);

        var meshRoof = new THREE.Mesh(new THREE.BoxGeometry(bldgW + 2, 0.8, bldgD + 4), roofMat);
        meshRoof.position.y = bldgH + 0.4;
        standGrp.add(meshRoof);

        root.add(standGrp);

        // REAL SOLID CANNON COLLISION BODY (Fixes driving inside buildings!)
        var body = new CANNON.Body({ mass: 0, material: world.defaultMaterial });
        body.addShape(new CANNON.Box(new CANNON.Vec3(bldgW / 2, bldgH / 2, bldgD / 2)));
        body.position.set(gx, gy + bldgH / 2, gz);
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
        world.addBody(body);
        solidBodies.push(body);
      }

      // 2. Race Control Tower & Pit Garage Building at Start Line
      var startP = curve.getPointAt(0);
      var startTg = curve.getTangentAt(0);
      var startNx = -startTg.z, startNz = startTg.x;
      var startYaw = Math.atan2(startTg.x, startTg.z);

      // Pit building on right side
      var pitX = startP.x + startNx * (halfW + 14);
      var pitZ = startP.z + startNz * (halfW + 14);
      var pitW = 16, pitH = 6, pitL = 36;

      var pitMesh = new THREE.Mesh(new THREE.BoxGeometry(pitW, pitH, pitL), standMat);
      pitMesh.position.set(pitX, startP.y + pitH / 2, pitZ);
      pitMesh.rotation.y = startYaw;
      root.add(pitMesh);

      var pitBody = new CANNON.Body({ mass: 0 });
      pitBody.addShape(new CANNON.Box(new CANNON.Vec3(pitW / 2, pitH / 2, pitL / 2)));
      pitBody.position.set(pitX, startP.y + pitH / 2, pitZ);
      pitBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), startYaw);
      world.addBody(pitBody);
      solidBodies.push(pitBody);

      // Tower on left side
      var towerX = startP.x - startNx * (halfW + 12);
      var towerZ = startP.z - startNz * (halfW + 12);
      var towW = 8, towH = 18, towL = 8;

      var towerMesh = new THREE.Mesh(new THREE.BoxGeometry(towW, towH, towL), standMat);
      towerMesh.position.set(towerX, startP.y + towH / 2, towerZ);
      towerMesh.rotation.y = startYaw;
      root.add(towerMesh);

      var towerBody = new CANNON.Body({ mass: 0 });
      towerBody.addShape(new CANNON.Box(new CANNON.Vec3(towW / 2, towH / 2, towL / 2)));
      towerBody.position.set(towerX, startP.y + towH / 2, towerZ);
      towerBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), startYaw);
      world.addBody(towerBody);
      solidBodies.push(towerBody);

      // 3. Custom Obstacles: Speed breakers, Blockers, Ramps
      var obstacles = this.obstacles || [];
      for (var o = 0; o < obstacles.length; o++) {
        var obs = obstacles[o];
        var ou = ((obs.u % 1) + 1) % 1;
        var op = curve.getPointAt(ou);
        var otg = curve.getTangentAt(ou);
        var onx = -otg.z, onz = otg.x;
        var oyaw = Math.atan2(otg.x, otg.z);

        var ox = op.x + onx * (obs.side || 0) * (halfW * 0.6);
        var oz = op.z + onz * (obs.side || 0) * (halfW * 0.6);
        var oy = op.y;

        if (obs.type === 'speed_breaker') {
          // Curved bump across road: height 0.35m, depth 1.2m, width roadWidth
          var bW = roadWidth * 0.9, bH = 0.35, bD = 1.2;
          var bumpMesh = new THREE.Mesh(new THREE.CylinderGeometry(bD / 2, bD / 2, bW, 12), bumpMat);
          bumpMesh.rotation.z = Math.PI / 2;
          bumpMesh.rotation.y = oyaw;
          bumpMesh.position.set(ox, oy + 0.1, oz);
          root.add(bumpMesh);

          // Solid bump physics body
          var bumpBody = new CANNON.Body({ mass: 0, material: world.defaultMaterial });
          bumpBody.addShape(new CANNON.Box(new CANNON.Vec3(bW / 2, bH / 2, bD / 2)));
          bumpBody.position.set(ox, oy + bH / 2, oz);
          bumpBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), oyaw);
          world.addBody(bumpBody);
          solidBodies.push(bumpBody);
        } else if (obs.type === 'blocker') {
          // Roadblock barrier
          var blkW = 3.6, blkH = 1.4, blkD = 1.0;
          var blkMesh = new THREE.Mesh(new THREE.BoxGeometry(blkW, blkH, blkD), barrierMat);
          blkMesh.position.set(ox, oy + blkH / 2, oz);
          blkMesh.rotation.y = oyaw;
          root.add(blkMesh);

          var blkBody = new CANNON.Body({ mass: 0 });
          blkBody.addShape(new CANNON.Box(new CANNON.Vec3(blkW / 2, blkH / 2, blkD / 2)));
          blkBody.position.set(ox, oy + blkH / 2, oz);
          blkBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), oyaw);
          world.addBody(blkBody);
          solidBodies.push(blkBody);
        } else if (obs.type === 'ramp') {
          // Stunt Jump Ramp
          var rW = 4.5, rH = 1.8, rL = 6.0;
          var rampMesh = new THREE.Mesh(new THREE.BoxGeometry(rW, rH, rL), barrierMat);
          rampMesh.position.set(ox, oy + rH / 2, oz);
          rampMesh.rotation.y = oyaw;
          rampMesh.rotation.x = -0.22; // incline
          root.add(rampMesh);

          var rampBody = new CANNON.Body({ mass: 0 });
          rampBody.addShape(new CANNON.Box(new CANNON.Vec3(rW / 2, rH / 2, rL / 2)));
          rampBody.position.set(ox, oy + rH / 2, oz);
          rampBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), oyaw);
          world.addBody(rampBody);
          solidBodies.push(rampBody);
        }
      }

      scene.add(root);
      return {
        root: root,
        solidBodies: solidBodies,
        ownedMaterials: ownedMaterials
      };
    },
    exportTrackCode: function() {
      var data = this.exportTrackData();
      return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    },
    importTrackCode: function(code) {
      try {
        var str = decodeURIComponent(escape(atob(code.trim())));
        var data = JSON.parse(str);
        return this.importTrackData(data);
      } catch(e) {
        console.error('Failed to import track code', e);
        return false;
      }
    }
  };

  window.TrackEditor = TrackEditor;
})(window);
