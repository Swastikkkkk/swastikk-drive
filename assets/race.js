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

    // Starting grid & Spawns
    gridSlots: [], // [{x, y, z, yaw}]
    
    // Out of bounds / respawn
    offRoadTimer: 0,
    maxOffRoadSeconds: 3.0,
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
      if (opts && opts.laps) this.totalLaps = Math.max(1, parseInt(opts.laps, 10) || 3);
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
        this.checkCheckpointsAndLaps(carPos, carFwd, now);
        this.checkTrackBoundaries(carPos, dt, onRespawnTrigger);
        this.updateHud(now);
      }
    },

    checkCheckpointsAndLaps: function(carPos, carFwd, now) {
      if (this.finished || this.checkpoints.length === 0) return;

      var totalCp = this.checkpoints.length;
      // check the next gate and the one after it, so one gate missed on a wide line or after a
      // respawn doesn't freeze lap counting for the rest of the race (skipping two still won't count)
      for (var k = 0; k < 2; k++) {
        var targetCpIdx = (this.currentCheckpoint + k) % totalCp;
        var targetCp = this.checkpoints[targetCpIdx];
        var dx = carPos.x - targetCp.pos.x;
        var dz = carPos.z - targetCp.pos.z;
        var dist = Math.hypot(dx, dz);
        var dotFwd = dx * targetCp.tangent.x + dz * targetCp.tangent.z;
        if (dist < targetCp.width && Math.abs(dotFwd) < 7.0) {
          this.lastSafeCheckpoint = targetCp;
          this.currentCheckpoint += k + 1;
          // the lap ends on the start/finish line (gate 0) once the other gates have been passed
          if (targetCpIdx === 0 && this.currentCheckpoint > totalCp) {
            this.currentCheckpoint = 1;
            this.onLapCompleted(now);
            return;
          }
          if (window.soundBlip) window.soundBlip(680 + (targetCpIdx * 30), 0.12, 0.08);
          return;
        }
      }
    },

    onLapCompleted: function(now) {
      var lapTime = now - this.lapStartTime;
      this.lapTimes.push(lapTime);
      this.lapStartTime = now;

      if (!this.bestLapTime || lapTime < this.bestLapTime) {
        this.bestLapTime = lapTime;
      }

      if (this.mode === 'circuit') {
        if (this.currentLap >= this.totalLaps) {
          // Finished the race!
          this.onRaceFinished(now);
        } else {
          this.currentLap++;
          if (window.toastMsg) {
            window.toastMsg('Lap ' + (this.currentLap - 1) + ' · ' + this.formatTime(lapTime) + ' · Lap ' + this.currentLap + '/' + this.totalLaps);
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

      // Safe anti-cheat daily leaderboard persistence
      var dStr = new Date().toISOString().slice(0, 10);
      var minPossibleTime = 12000 * (this.totalLaps || 1); // Anti-cheat: each lap must take at least 12 seconds
      if (this.isDaily && this.totalRaceTime >= minPossibleTime) {
        try {
          var key = 'sl_daily_' + dStr;
          var records = JSON.parse(localStorage.getItem(key) || '[]');
          var myName = localStorage.getItem('sl_name') || 'Driver';
          records.push({ name: myName, time: this.totalRaceTime, date: Date.now() });
          records.sort(function(a, b) { return a.time - b.time; });
          if (records.length > 20) records = records.slice(0, 20);
          localStorage.setItem(key, JSON.stringify(records));
        } catch(e) {}
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
    checkTrackBoundaries: function(carPos, dt, onRespawnTrigger) {
      if (this.checkpoints.length === 0) return;

      // Find distance to closest checkpoint or road centerline
      var minDist = 1e9;
      var closestCp = null;
      for (var i = 0; i < this.checkpoints.length; i++) {
        var cp = this.checkpoints[i];
        var d = Math.hypot(carPos.x - cp.pos.x, carPos.z - cp.pos.z);
        if (d < minDist) {
          minDist = d;
          closestCp = cp;
        }
      }

      var maxAllowedDist = (closestCp ? closestCp.width : 20) + 12;
      var oobEl = document.getElementById('doob');

      // Check if vehicle is off-road or falling under ground
      if (minDist > maxAllowedDist || carPos.y < -15 || isNaN(carPos.y)) {
        this.offRoadTimer += dt;
        this.isOutOfBounds = true;
        var remain = Math.max(0, this.maxOffRoadSeconds - this.offRoadTimer);

        if (oobEl) {
          oobEl.style.display = 'block';
          oobEl.textContent = 'TRACK LIMIT EXCEEDED · RESPAWNING IN ' + remain.toFixed(1) + 's';
        }

        if (this.offRoadTimer >= this.maxOffRoadSeconds || carPos.y < -15 || isNaN(carPos.y)) {
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
        var yaw = Math.atan2(respawnTarget.tangent.x, respawnTarget.tangent.z);
        onRespawnTrigger({
          x: respawnTarget.pos.x,
          y: respawnTarget.pos.y + 1.2,
          z: respawnTarget.pos.z,
          yaw: yaw
        });
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

      modal.style.display = 'grid';
      this.state = 'results';
    },

    closeResultsModal: function() {
      var modal = document.getElementById('dresults');
      if (modal) modal.style.display = 'none';
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
