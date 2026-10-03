/**
 * Race State Machine, Checkpoints, Laps, Boundaries & Leaderboard Subsystem
 */
(function(window) {
  var RaceEngine = {
    // Configuration
    mode: 'circuit', // 'circuit', 'sprint', 'timetrial', 'freedrive'
    totalLaps: 3,
    state: 'idle', // 'idle', 'grid', 'countdown', 'racing', 'finished', 'results'
    
    // Progress tracking
    currentLap: 1,
    currentCheckpoint: 0,
    checkpoints: [],
    lapStartTime: 0,
    raceStartTime: 0,
    lapTimes: [],
    bestLapTime: null,
    totalRaceTime: null,
    finished: false,
    finalPosition: 1,
    trackLength: 0,        // metres, from the actual centreline
    minLapMs: 8000,        // a lap faster than this is physically impossible, so it is not counted
    centerline: [],        // dense samples of the road centre, used for the off-track test
    cdIdx: 0,
    prevPos: null,         // last frame's position, for plane-crossing tests
    wrongWayT: 0,
    wrongWay: false,

    // Starting grid & Spawns
    gridSlots: [], // [{x, y, z, yaw}]
    
    // Out of bounds / respawn
    offRoadTimer: 0,
    maxOffRoadSeconds: 1.5,
    lastSafeCheckpoint: null,
    isOutOfBounds: false,

    // Leaderboard
    leaderboard: [], // sorted array of racers {id, name, isMe, position, lap, checkpoint, dist, time, finished}

    get active() {
      return this.state === 'racing' || this.state === 'countdown' || this.state === 'grid';
    },

    get isHolding() {
      return this.state === 'countdown' || this.state === 'grid';
    },

    init: function() {
      this.reset();
    },

    initTrack: function(mode, curve, samples, opts) {
      this.mode = mode || 'circuit';
      if (opts && opts.laps) this.totalLaps = Math.max(1, Math.min(50, parseInt(opts.laps, 10) || 3));
      if (curve) {
        this.setupTrackCheckpoints(curve, 16, (opts && opts.roadWidth) || 12);
        if (curve.getPointAt) {
          var p0 = curve.getPointAt(0);
          var tg0 = curve.getTangentAt(0);
          this.setupGridSpawns({ p: p0, tg: tg0, n: { x: -tg0.z, y: 0, z: tg0.x } }, 8, (opts && opts.roadWidth) || 12);
        }
      }
      this.reset();
      this.updateHud();
    },

    stopRace: function() {
      this.reset();
      this.updateHud();
    },

    reset: function() {
      this.state = 'idle';
      this.currentLap = 1;
      this.currentCheckpoint = 0;
      this.lapStartTime = 0;
      this.raceStartTime = 0;
      this.lapTimes = [];
      this.bestLapTime = null;
      this.totalRaceTime = null;
      this.finished = false;
      this.offRoadTimer = 0;
      this.isOutOfBounds = false;
      this.lastSafeCheckpoint = null;
      this.leaderboard = [];
      this.prevPos = null;
      this.wrongWayT = 0;
      this.wrongWay = false;
      this.showWrongWay(false);
    },

    setConfiguration: function(mode, totalLaps) {
      this.mode = mode || 'circuit';
      this.totalLaps = Math.max(1, parseInt(totalLaps, 10) || 3);
      this.updateHud();
    },

    setupTrackCheckpoints: function(curve, count, roadWidth) {
      this.checkpoints = [];
      if (!curve) return;
      count = Math.max(4, count || 12);
      roadWidth = roadWidth || 12;

      for (var i = 0; i < count; i++) {
        var u = i / count;
        var p = curve.getPointAt(u);
        var tg = curve.getTangentAt(u);
        var nx = -tg.z;
        var nz = tg.x;
        this.checkpoints.push({
          index: i,
          u: u,
          pos: p,
          tangent: tg,
          normal: { x: nx, y: 0, z: nz },
          width: roadWidth + 6,
          passed: false
        });
      }
      this.lastSafeCheckpoint = this.checkpoints[0];

      // True road centreline. The off-track test used to measure the distance to the nearest
      // *gate*, which sits ~150 m from the next one on a 2.4 km lap, so mid-straight cars looked "off track".
      this.centerline = [];
      this.trackLength = curve.getLength ? curve.getLength() : 0;
      var n = Math.max(64, Math.min(600, Math.round((this.trackLength || 1200) / 8)));
      for (var j = 0; j < n; j++) {
        var q = curve.getPointAt(j / n);
        this.centerline.push({ x: q.x, z: q.z, y: q.y });
      }
      this.cdIdx = 0;
      this.roadHalf = roadWidth / 2;
      // ~290 km/h is faster than any car here can lap at; anything quicker is a skipped section
      this.minLapMs = Math.max(8000, (this.trackLength / 80) * 1000);
    },

    setupGridSpawns: function(startP, count, roadWidth) {
      this.gridSlots = [];
      count = Math.max(8, count || 8);
      var w = (roadWidth || 12) * 0.28;
      var yaw = Math.atan2(startP.tg.x, startP.tg.z);

      for (var i = 0; i < count; i++) {
        var backDist = 6 + i * 7.5;
        var side = (i % 2 === 0 ? 1 : -1) * w;
        var x = startP.p.x - startP.tg.x * backDist + startP.n.x * side;
        var z = startP.p.z - startP.tg.z * backDist + startP.n.z * side;
        var y = startP.p.y + 0.8;
        this.gridSlots.push({ x: x, y: y, z: z, yaw: yaw });
      }
    },

    getSpawnForSlot: function(slotIndex) {
      if (this.gridSlots.length === 0) {
        return { x: 0, y: 2, z: 0, yaw: 0 };
      }
      return this.gridSlots[slotIndex % this.gridSlots.length];
    },

    // ----------------------------------------------------
    // RACE LIFE CYCLE
    // ----------------------------------------------------
    startCountdown: function(slotIndex, onGridReady) {
      this.reset();
      this.state = 'countdown';
      var spawn = this.getSpawnForSlot(slotIndex || 0);
      if (onGridReady) onGridReady(spawn);
      this.updateHud();
    },

    startRace: function(now) {
      this.state = 'racing';
      this.raceStartTime = now;
      this.lapStartTime = now;
      this.currentLap = 1;
      this.currentCheckpoint = 0;
      this.finished = false;
      this.updateHud();
    },

    // Called every frame during race
    update: function(a, b, c, d, e) {
      if (this.state !== 'racing' && this.state !== 'countdown') return;

      var now, dt, carPos, carFwd, onRespawnTrigger;
      if (typeof a === 'number' && typeof b === 'number' && c && typeof c === 'object') {
        // Called as (now, dt, ctx) from game.js
        now = a;
        dt = b;
        var ctx = c;
        carPos = ctx.pos || (ctx.chassisB && ctx.chassisB.position) || { x: 0, y: 0, z: 0 };
        carFwd = (ctx.car && ctx.car.getWorldDirection) ? ctx.car.getWorldDirection(new THREE.Vector3()) : { x: 0, y: 0, z: 1 };
        onRespawnTrigger = function(spawn) {
          if (window.resetCarTo) window.resetCarTo(spawn);
        };
        // Also update leaderboard if peers available
        if (ctx.peers) {
          var myName = (typeof myName === 'function') ? myName() : 'You';
          this.updateLeaderboard('me', myName, carPos, Array.from(ctx.peers.values()));
        }
      } else {
        // Called as (carPos, carFwd, dt, now, onRespawnTrigger)
        carPos = a;
        carFwd = b;
        dt = c;
        now = d;
        onRespawnTrigger = e;
      }

      if (this.state === 'racing') {
        var prev = this.prevPos;
        // a respawn or grid reset moves the car instantly; that must not count as driving through a gate
        if (prev && Math.hypot(carPos.x - prev.x, carPos.z - prev.z) > 40) prev = null;
        this.checkCheckpointsAndLaps(carPos, prev, now);
        this.checkWrongWay(carPos, prev, dt);
        this.checkTrackBoundaries(carPos, dt, onRespawnTrigger);
        this.updateHud(now);
      }
      this.prevPos = { x: carPos.x, z: carPos.z };
    },

    // Driving against the flow of the track for more than a second shows WRONG WAY.
    checkWrongWay: function(carPos, prev, dt) {
      if (!prev || !this.checkpoints.length || !(dt > 0)) return;
      var vx = (carPos.x - prev.x) / dt, vz = (carPos.z - prev.z) / dt;
      var sp = Math.hypot(vx, vz), cp = null, bd = 1e12;
      for (var i = 0; i < this.checkpoints.length; i++) {
        var g = this.checkpoints[i], d = (g.pos.x - carPos.x) * (g.pos.x - carPos.x) + (g.pos.z - carPos.z) * (g.pos.z - carPos.z);
        if (d < bd) { bd = d; cp = g; }
      }
      var against = cp && sp > 6 && (vx * cp.tangent.x + vz * cp.tangent.z) / sp < -0.45;
      this.wrongWayT = against ? this.wrongWayT + dt : Math.max(0, this.wrongWayT - dt * 2);
      var on = this.wrongWayT > 1.0;
      if (on !== this.wrongWay) { this.wrongWay = on; this.showWrongWay(on); }
    },

    showWrongWay: function(on) {
      var el = document.getElementById('dwrongway');
      if (!el) {
        if (!on) return;
        el = document.createElement('div');
        el.id = 'dwrongway';
        el.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:50;pointer-events:none;' +
          'padding:8px 22px;border-radius:8px;background:rgba(200,40,30,.88);color:#fff;font:700 22px/1 ui-monospace,monospace;letter-spacing:.2em';
        el.textContent = 'WRONG WAY';
        document.body.appendChild(el);
      }
      el.style.display = on ? 'block' : 'none';
    },

    /* Gates are crossed as planes, in order, in the direction of travel.
       currentCheckpoint counts gates passed this lap: 0 = start line not crossed yet, 1 = start line crossed,
       N = every gate passed and only the finish line (gate 0) is left. The gate that counts next is always
       currentCheckpoint % N, so skipping one, cutting across the infield, or rolling backwards over the line
       can never advance the lap. */
    checkCheckpointsAndLaps: function(carPos, prev, now) {
      if (this.finished || this.checkpoints.length === 0 || !prev) return;
      var N = this.checkpoints.length;
      var want = this.currentCheckpoint % N;
      var cp = this.checkpoints[want];
      if (this.crossesGate(cp, prev, carPos)) {
        this.lastSafeCheckpoint = cp;
        if (want === 0 && this.currentCheckpoint >= N) {
          var lapMs = now - this.lapStartTime;
          if (lapMs < this.minLapMs) {
            if (window.toastMsg) window.toastMsg('Lap not counted: too fast');
            return;
          }
          this.currentCheckpoint = 1;
          this.onLapCompleted(now);
        } else {
          this.currentCheckpoint++;
          if (want !== 0 && window.soundBlip) window.soundBlip(680 + (want * 30), 0.12, 0.08);
        }
        return;
      }
      // Told clearly when a gate was missed (the next one along was crossed instead)
      var after = this.checkpoints[(want + 1) % N];
      if (this.currentCheckpoint > 0 && this.crossesGate(after, prev, carPos) && now - (this._missToast || 0) > 3000) {
        this._missToast = now;
        if (window.toastMsg) window.toastMsg('Missed checkpoint ' + want + ' · go back through it');
      }
    },

    crossesGate: function(cp, a, b) {
      var tg = cp.tangent, nx = cp.normal.x, nz = cp.normal.z;
      var s0 = (a.x - cp.pos.x) * tg.x + (a.z - cp.pos.z) * tg.z;
      var s1 = (b.x - cp.pos.x) * tg.x + (b.z - cp.pos.z) * tg.z;
      if (!(s0 < 0 && s1 >= 0)) return false;       // wrong direction, or no crossing this frame
      var t = s0 / (s0 - s1);
      var px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
      var lat = Math.abs((px - cp.pos.x) * nx + (pz - cp.pos.z) * nz);
      return lat <= cp.width * 0.6;
    },

    onLapCompleted: function(now) {
      var lapTime = now - this.lapStartTime;
      this.lapTimes.push(lapTime);
      this.lapStartTime = now;

      if (!this.bestLapTime || lapTime < this.bestLapTime) {
        this.bestLapTime = lapTime;
      }

      if (this.mode === 'circuit') {
        // lapTimes.length laps are done; the race ends exactly when that reaches totalLaps
        if (this.lapTimes.length >= this.totalLaps) {
          this.currentLap = this.totalLaps;
          this.onRaceFinished(now);
        } else {
          this.currentLap = this.lapTimes.length + 1;
          if (window.toastMsg) {
            window.toastMsg('Lap ' + this.lapTimes.length + ' · ' + this.formatTime(lapTime) + ' · Lap ' + this.currentLap + '/' + this.totalLaps + (this.currentLap === this.totalLaps ? ' · final lap' : ''));
          }
          if (window.soundBlip) {
            window.soundBlip(880, 0.25, 0.12);
          }
        }
      } else if (this.mode === 'sprint') {
        this.onRaceFinished(now);
      }
    },

    onRaceFinished: function(now) {
      this.finished = true;
      this.state = 'finished';
      this.totalRaceTime = now - this.raceStartTime;

      // Daily Track: record against the day the track belongs to (not the clock at the finish), with the best lap.
      // Only a full race of valid laps reaches here, and each lap already passed every gate and the minimum lap time.
      if (this.isDaily) {
        var day = this.dailyDate || new Date().toISOString().slice(0, 10);
        var rec = { name: (localStorage.getItem('sl_name') || 'Driver'), time: this.totalRaceTime, best: this.bestLapTime, laps: this.totalLaps, day: day, date: Date.now() };
        try {
          var key = 'sl_daily_' + day;
          var records = JSON.parse(localStorage.getItem(key) || '[]');
          records.push(rec);
          records.sort(function(a, b) { return a.time - b.time; });
          localStorage.setItem(key, JSON.stringify(records.slice(0, 50)));
        } catch(e) {}
        if (window.DailyBoard) window.DailyBoard.submit(rec).then(function(ok) { if (ok && window.toastMsg) window.toastMsg('Daily time posted to the global board'); });
      }

      if (window.toastMsg) {
        window.toastMsg('RACE FINISHED! Final Time: ' + this.formatTime(this.totalRaceTime));
      }
      if (window.soundBlip) {
        window.soundBlip(1040, 0.4, 0.15);
        setTimeout(function() { if (window.soundBlip) window.soundBlip(1320, 0.5, 0.15); }, 150);
      }

      var self = this;
      setTimeout(function() {
        self.showResultsModal();
      }, 1500);
    },

    // ----------------------------------------------------
    // TRACK BOUNDARIES & RESPAWN
    // ----------------------------------------------------
    nearestCenterDist: function(x, z) {
      var c = this.centerline, n = c.length;
      if (!n) return 0;
      var best = 1e12, bi = this.cdIdx;
      // the car moves a little each frame, so look near where it was; fall back to a full scan if that is far off
      for (var pass = 0; pass < 2; pass++) {
        var span = pass ? n : 24;
        for (var k = -span; k <= span; k += 1) {
          var i = ((this.cdIdx + k) % n + n) % n, dx = x - c[i].x, dz = z - c[i].z, d = dx * dx + dz * dz;
          if (d < best) { best = d; bi = i; }
        }
        if (best < 40 * 40) break;
      }
      this.cdIdx = bi;
      return Math.sqrt(best);
    },

    checkTrackBoundaries: function(carPos, dt, onRespawnTrigger) {
      if (this.checkpoints.length === 0) return;
      var minDist = this.nearestCenterDist(carPos.x, carPos.z);
      var maxAllowedDist = (this.roadHalf || 8) + 4.6 + 8;   // past the barrier line (game.js BARRIER_OFF) means the car got out
      var oobEl = document.getElementById('doob');

      // Off the world: well away from the road, below the ground, or the position is no longer a number
      var bad = !isFinite(carPos.x) || !isFinite(carPos.y) || !isFinite(carPos.z);
      if (bad || minDist > maxAllowedDist || carPos.y < -15) {
        this.offRoadTimer += dt;
        this.isOutOfBounds = true;
        var remain = Math.max(0, this.maxOffRoadSeconds - this.offRoadTimer);

        if (oobEl) {
          oobEl.style.display = 'block';
          oobEl.textContent = 'TRACK LIMIT EXCEEDED · RESPAWNING IN ' + remain.toFixed(1) + 's';
        }

        if (this.offRoadTimer >= this.maxOffRoadSeconds || carPos.y < -15 || bad) {
          this.triggerRespawn(onRespawnTrigger);
        }
      } else {
        this.offRoadTimer = Math.max(0, this.offRoadTimer - dt * 1.5);
        if (this.offRoadTimer <= 0) {
          this.isOutOfBounds = false;
          if (oobEl) oobEl.style.display = 'none';
        }
      }
    },

    triggerRespawn: function(onRespawnTrigger) {
      this.offRoadTimer = 0;
      this.isOutOfBounds = false;
      var oobEl = document.getElementById('doob');
      if (oobEl) oobEl.style.display = 'none';

      var respawnTarget = this.lastSafeCheckpoint || (this.checkpoints.length > 0 ? this.checkpoints[0] : null);
      if (respawnTarget && onRespawnTrigger) {
        var rx = respawnTarget.pos.x - respawnTarget.tangent.x * 4;   // 4 m behind the gate plane, so driving off again crosses it in the right direction
        var rz = respawnTarget.pos.z - respawnTarget.tangent.z * 4;
        var ry = respawnTarget.pos.y + 1.2;
        // resetCarTo reads {pos, tangent}; the old {x,y,z,yaw} shape was ignored, so respawns never used the checkpoint
        onRespawnTrigger({
          pos: { x: rx, y: ry - 1.2, z: rz },
          tangent: respawnTarget.tangent,
          x: rx, y: ry, z: rz,
          yaw: Math.atan2(respawnTarget.tangent.x, respawnTarget.tangent.z)
        });
        this.prevPos = null;
        if (window.toastMsg) window.toastMsg('Vehicle respawned at safe track checkpoint');
      }
    },

    // ----------------------------------------------------
    // DYNAMIC LEADERBOARD POSITIONING
    // ----------------------------------------------------
    updateLeaderboard: function(myId, myName, carPos, peerRacerList) {
      var racers = [];

      // Calculate my score
      var totalCp = Math.max(1, this.checkpoints.length);
      var nextCp = this.checkpoints[this.currentCheckpoint % totalCp];
      var distToNext = nextCp ? Math.hypot(carPos.x - nextCp.pos.x, carPos.z - nextCp.pos.z) : 100;
      var myScore = this.finished ? 1e9 - (this.totalRaceTime || 0) : ((this.currentLap - 1) * 100000 + this.currentCheckpoint * 1000 - distToNext);

      racers.push({
        id: myId,
        name: myName,
        isMe: true,
        finished: this.finished,
        finishTime: this.totalRaceTime,
        lap: this.currentLap,
        checkpoint: this.currentCheckpoint,
        score: myScore
      });

      // Add peer racers
      (peerRacerList || []).forEach(function(p) {
        var pScore = p.finished ? 1e9 - (p.finishTime || 0) : ((p.lap - 1) * 100000 + (p.checkpoint || 0) * 1000 - (p.distToNext || 50));
        racers.push({
          id: p.id,
          name: p.name,
          isMe: false,
          finished: p.finished,
          finishTime: p.finishTime,
          lap: p.lap || 1,
          checkpoint: p.checkpoint || 0,
          score: pScore
        });
      });

      // Sort racers by score descending (higher score = further in race)
      racers.sort(function(a, b) {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.score - a.score;
      });

      for (var pos = 0; pos < racers.length; pos++) {
        racers[pos].position = pos + 1;
        if (racers[pos].isMe) {
          this.finalPosition = pos + 1;
        }
      }
      this.leaderboard = racers;
      this.updateHud();
    },

    // ----------------------------------------------------
    // HUD & RESULTS MODAL
    // ----------------------------------------------------
    updateHud: function(now) {
      var lapEl = document.getElementById('dlap');
      var lapN = document.getElementById('dlapn');
      var lapT = document.getElementById('dlapt');
      var lapB = document.getElementById('dlapb');
      var posEl = document.getElementById('dpos');

      if (!lapEl) return;
      if (this.state === 'racing' || this.state === 'finished') {
        lapEl.style.display = 'block';
        if (lapN) {
          lapN.textContent = this.mode === 'circuit' ? ('Lap ' + this.currentLap + ' / ' + this.totalLaps) : 'Sprint';
        }
        if (lapT && now && this.lapStartTime) {
          lapT.textContent = this.formatTime(now - this.lapStartTime);
        }
        if (lapB) {
          lapB.textContent = this.bestLapTime ? ('Best ' + this.formatTime(this.bestLapTime)) : 'Best --:--.--';
        }
      }

      if (posEl) {
        posEl.style.display = (this.state === 'racing' || this.state === 'finished') ? 'block' : 'none';
        var total = Math.max(1, this.leaderboard.length);
        posEl.textContent = 'P' + (this.finalPosition || 1) + ' / ' + total;
      }
    },

    showResultsModal: function() {
      var modal = document.getElementById('dresults');
      if (!modal) return;
      var list = document.getElementById('dreslist');
      if (!list) return;

      list.innerHTML = '';
      var board = this.leaderboard.length > 0 ? this.leaderboard : [{
        position: 1, name: 'You', finishTime: this.totalRaceTime || 0, isMe: true
      }];

      board.forEach(function(r) {
        var li = document.createElement('li');
        li.style.cssText = 'display:grid;grid-template-columns:32px 1fr auto;gap:12px;align-items:center;padding:12px 6px;border-bottom:1px solid rgba(255,255,255,0.1);font-weight:600;' + (r.isMe ? 'background:rgba(212,168,58,0.15);' : '');
        var posBadge = r.position === 1 ? '🥇 1st' : r.position === 2 ? '🥈 2nd' : r.position === 3 ? '🥉 3rd' : (r.position + 'th');
        li.innerHTML = '<span style="font-size:14px;color:#d4a83a;">' + posBadge + '</span>' +
          '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (r.name || 'Driver') + (r.isMe ? ' (You)' : '') + '</span>' +
          '<span style="font-family:monospace;font-size:13px;color:#f2eee6;">' + (r.finishTime ? RaceEngine.formatTime(r.finishTime) : 'DNF') + '</span>';
        list.appendChild(li);
      });

      // completed laps only, for this driver
      var lapsEl = document.getElementById('dreslaps');
      if (!lapsEl) {
        lapsEl = document.createElement('div');
        lapsEl.id = 'dreslaps';
        lapsEl.className = 'mono';
        lapsEl.style.cssText = 'margin-top:14px;font-size:12px;line-height:1.7;color:#f2eee6;';
        list.parentNode.insertBefore(lapsEl, list.nextSibling);
      }
      var self = this, html = '';
      this.lapTimes.forEach(function(t, i) {
        html += '<div style="display:flex;justify-content:space-between"><span>LAP ' + (i + 1) + (t === self.bestLapTime ? ' · best' : '') + '</span><span>' + self.formatTime(t) + '</span></div>';
      });
      if (this.totalRaceTime) html += '<div style="display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,.15);margin-top:4px;padding-top:4px"><b>TOTAL · ' + this.totalLaps + ' LAP' + (this.totalLaps > 1 ? 'S' : '') + '</b><b>' + this.formatTime(this.totalRaceTime) + '</b></div>';
      lapsEl.innerHTML = html;

      modal.style.display = '';
      modal.classList.add('on');
      this.state = 'results';
    },

    closeResultsModal: function() {
      var modal = document.getElementById('dresults');
      if (modal) { modal.classList.remove('on'); modal.style.display = ''; }
      this.state = 'idle';
    },

    formatTime: function(ms) {
      if (!ms || ms <= 0) return '00:00.00';
      var totalSec = Math.floor(ms / 1000);
      var min = Math.floor(totalSec / 60);
      var sec = totalSec % 60;
      var centi = Math.floor((ms % 1000) / 10);
      return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + '.' + String(centi).padStart(2, '0');
    }
  };

  window.RaceEngine = RaceEngine;
})(window);
