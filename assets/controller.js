/**
 * Phone-as-Controller Subsystem
 * Supports:
 * 1. Controller mode (runs on phone): touch buttons + tilt/gyro steering -> sends to room channel
 * 2. Receiver mode (runs on PC): listens to phone controller events and maps to game controls
 *    with automatic fallback to keyboard if phone disconnects or goes stale.
 */
(function(window) {
  var CFG = {
    ws: 'wss://oceaylrebzflgyxfjqfb.supabase.co/realtime/v1/websocket',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZWF5bHJlYnpmbGd5eGZqcWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NDk5ODUsImV4cCI6MjEwNjAyNTk4NX0.RTdGpoSF7ZX8oaIrLEY4VAmV14GVHY8rYT1H5j18OHs'
  };

  var PhoneController = {
    isControllerMode: false,
    activeConnection: false,
    lastReceivedTime: 0,
    timeoutMs: 1000,        // phone stops talking -> input goes neutral after 1 s, so throttle never sticks
    everConnected: false,
    currentInput: {
      f: 0, b: 0, l: 0, r: 0, h: 0, boost: 0, horn: 0, cam: 0, reset: 0, steerAnalog: 0
    },
    clientToken: '',
    roomCode: '',
    tiltEnabled: false,
    tiltCenter: 0,
    tiltSensitivity: 1.0,

    init: function() {
      var params = new URLSearchParams(window.location.search);
      var isCtrl = params.get('controller') === 'true' || params.get('ctrl') === '1';
      var room = (params.get('room') || '').toUpperCase().trim();
      var token = params.get('token') || ('c-' + Math.random().toString(36).substr(2, 6));
      this.target = params.get('to') || '';   // id of the player (laptop) this phone drives
      this.playerName = (params.get('pn') || '').slice(0, 14);

      this.isControllerMode = isCtrl;
      this.roomCode = room;
      this.clientToken = token;

      if (isCtrl) {
        this.runAsController(room, token);
      }
    },

    // ----------------------------------------------------
    // RECEIVER (PC GAME SIDE)
    // ----------------------------------------------------
    onControllerInput: function(input) {
      // never trust the wire: copy only known fields, coerce to numbers and clamp
      var n = function(v, lo, hi) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; };
      input = input || {};
      this.lastReceivedTime = performance.now();
      this.activeConnection = true;
      this.everConnected = true;
      this.currentInput = {
        f: n(input.f, 0, 1), b: n(input.b, 0, 1), l: n(input.l, 0, 1), r: n(input.r, 0, 1), h: n(input.h, 0, 1),
        boost: n(input.boost, 0, 1), horn: n(input.horn, 0, 1), cam: n(input.cam, 0, 1), reset: n(input.reset, 0, 1),
        steerAnalog: n(input.steerAnalog, -1, 1)
      };
    },

    isPhoneConnected: function() {
      if (!this.activeConnection) return false;
      if (performance.now() - this.lastReceivedTime > this.timeoutMs) {
        this.activeConnection = false;
        return false;
      }
      return true;
    },

    applyToKeys: function(destKeyObj) {
      if (!this.isPhoneConnected()) {
        return false; // Let keyboard controls apply
      }
      // Phone is connected and healthy: override controls
      var ci = this.currentInput;
      destKeyObj.f = ci.f ? 1 : 0;
      destKeyObj.b = ci.b ? 1 : 0;
      destKeyObj.h = ci.h ? 1 : 0;
      destKeyObj.boost = ci.boost ? 1 : 0;
      destKeyObj.horn = ci.horn ? 1 : 0;

      if (Math.abs(ci.steerAnalog) > 0.05) {
        if (ci.steerAnalog < 0) {
          destKeyObj.l = Math.min(1, -ci.steerAnalog);
          destKeyObj.r = 0;
        } else {
          destKeyObj.r = Math.min(1, ci.steerAnalog);
          destKeyObj.l = 0;
        }
      } else {
        destKeyObj.l = ci.l ? 1 : 0;
        destKeyObj.r = ci.r ? 1 : 0;
      }
      return true;
    },

    // ----------------------------------------------------
    // PHONE CONTROLLER INTERFACE
    // ----------------------------------------------------
    runAsController: function(room, token) {
      // Clean document for pure controller UI
      document.body.innerHTML = '';
      document.body.className = '';
      document.documentElement.style.background = '#06070b';
      document.body.style.cssText = 'margin:0;padding:0;background:#06070b;color:#f2eee6;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden;height:100vh;height:100dvh;display:flex;flex-direction:column;';

      var container = document.createElement('div');
      container.id = 'ctrl-app';
      container.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;padding:12px;';
      document.body.appendChild(container);

      // Header
      var header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:rgba(255,255,255,0.06);border-radius:10px;font-size:12px;font-family:monospace;letter-spacing:0.1em;';
      var esc = function(t) { return String(t).replace(/[&<>"]/g, function(c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); };
      header.innerHTML = '<div>ROOM: <b id="c-room" style="color:#f2eee6;font-size:15px;">' + esc(room || 'NO ROOM') + '</b>' + (PhoneController.playerName ? ' &middot; PLAYER: <b style="color:#f2eee6">' + esc(PhoneController.playerName) + '</b>' : '') + '</div><div id="c-status" style="color:#d4a83a;">CONNECTING...</div>';
      container.appendChild(header);

      // Status Bar & Tilt controls
      var topBar = document.createElement('div');
      topBar.style.cssText = 'display:flex;gap:10px;margin-top:10px;justify-content:space-between;align-items:center;';
      topBar.innerHTML = '<button id="btn-tilt" style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;">GYRO STEER: OFF</button>' +
        '<button id="btn-sens" style="display:none;background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:8px 12px;font-size:11px;font-weight:600;">SENS</button>' +
        '<button id="btn-calib" style="display:none;background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:8px 12px;font-size:11px;font-weight:600;">CALIBRATE</button>' +
        '<div style="display:flex;gap:6px;"><button id="btn-cam" style="background:rgba(255,255,255,0.12);color:#fff;border:0;border-radius:8px;padding:8px 12px;font-size:11px;font-weight:600;">CAM</button>' +
        '<button id="btn-reset" style="background:rgba(180,40,40,0.4);color:#fff;border:0;border-radius:8px;padding:8px 12px;font-size:11px;font-weight:600;">RESPAWN</button></div>';
      container.appendChild(topBar);

      // Gamepad: sized from the screen so every control fits upright or sideways (the old fixed
      // 500px row pushed GAS/BRAKE/BOOST off an upright phone)
      var css = document.createElement('style');
      css.textContent =
        '#c-pad{flex:1;display:grid;gap:12px;margin-top:12px;min-height:0;' +
          'grid-template-columns:1fr auto 1fr;grid-template-areas:"steer extra pedals";align-items:center}' +
        '#c-pad button{touch-action:none;-webkit-tap-highlight-color:transparent;font-family:inherit;font-weight:700;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}' +
        '#c-steer{grid-area:steer;display:flex;gap:4vmin;justify-content:flex-start;align-items:center}' +
        '#c-extra{grid-area:extra;display:flex;flex-direction:column;gap:3vmin;align-items:center}' +
        '#c-pedals{grid-area:pedals;display:flex;gap:4vmin;justify-content:flex-end;align-items:flex-end}' +
        '#c-pedcol{display:flex;flex-direction:column;gap:3vmin;align-items:stretch}' +
        '.c-steer{width:min(24vmin,120px);height:min(24vmin,120px);border-radius:50%;background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.4);font-size:min(9vmin,34px)}' +
        '.c-gas{width:min(28vmin,140px);height:min(40vmin,190px);border-radius:28px;background:#f2eee6;border:0;color:#06070b!important;font-size:min(6vmin,22px);box-shadow:0 8px 24px rgba(255,255,255,.2)}' +
        '.c-brake{width:min(22vmin,105px);height:min(22vmin,105px);border-radius:50%;background:rgba(255,59,48,.25);border:2px solid #ff3b30;color:#ff3b30!important;font-size:min(4.2vmin,16px)}' +
        '.c-boost{width:min(28vmin,140px);height:min(13vmin,62px);border-radius:16px;background:rgba(0,122,255,.35);border:2px solid #007aff;font-size:min(4.2vmin,15px)}' +
        '.c-small{min-width:min(20vmin,96px);height:min(12vmin,52px);border-radius:12px;background:rgba(255,255,255,.14);border:1.5px solid rgba(255,255,255,.3);font-size:min(3.4vmin,12px);padding:0 10px!important}' +
        '.c-horn{background:rgba(212,168,58,.25);border-color:#d4a83a;color:#d4a83a!important}' +
        // upright phone: extras across the top, steering bottom-left, pedals bottom-right
        '@media (orientation:portrait){#c-pad{grid-template-columns:1fr 1fr;grid-template-rows:auto 1fr;grid-template-areas:"extra extra" "steer pedals";align-items:end}' +
          '#c-extra{flex-direction:row;justify-content:center;flex-wrap:wrap}' +
          '#c-steer{flex-direction:row;align-self:end;padding-bottom:2vh}#c-pedals{align-self:end;padding-bottom:2vh}' +
          '.c-steer{width:min(19vw,110px);height:min(19vw,110px)}.c-gas{width:min(25vw,130px);height:min(26vh,210px)}.c-brake{width:min(19vw,100px);height:min(19vw,100px)}.c-boost{width:auto;min-width:min(22vw,110px);height:min(13vw,56px)}}';
      document.head.appendChild(css);
      var pad = document.createElement('div');
      pad.id = 'c-pad';
      pad.innerHTML =
        '<div id="c-steer"><button id="btn-left" class="c-steer" aria-label="Steer left">&#9664;</button><button id="btn-right" class="c-steer" aria-label="Steer right">&#9654;</button></div>' +
        '<div id="c-extra"><button id="btn-boost" class="c-boost">BOOST</button><button id="btn-handbrake" class="c-small">HANDBRAKE</button><button id="btn-horn" class="c-small c-horn">HORN</button></div>' +
        '<div id="c-pedals"><button id="btn-brake" class="c-brake">BRAKE</button><div id="c-pedcol"><button id="btn-gas" class="c-gas">GAS</button></div></div>';
      container.appendChild(pad);

      // Setup WebSocket connection to room channel
      var topic = 'realtime:drv-' + room;
      var ws = null;
      var statusEl = document.getElementById('c-status');
      var joined = false;
      var ref = 0;

      function connect() {
        if (!room) {
          if (statusEl) statusEl.textContent = 'NO ROOM SPECIFIED';
          return;
        }
        statusEl.textContent = 'CONNECTING...';
        try {
          ws = new WebSocket(CFG.ws + '?apikey=' + encodeURIComponent(CFG.key) + '&vsn=1.0.0');
        } catch (e) {
          statusEl.textContent = 'CONN ERROR';
          return;
        }

        ws.onopen = function() {
          ref++;
          ws.send(JSON.stringify({
            topic: topic,
            event: 'phx_join',
            ref: String(ref),
            join_ref: '1',
            payload: {
              config: { broadcast: { ack: false, self: false }, presence: { key: '' } },
              access_token: CFG.key
            }
          }));
        };

        ws.onmessage = function(e) {
          try {
            var m = JSON.parse(e.data);
            if (m.event === 'phx_reply' && m.payload && m.payload.status === 'ok') {
              joined = true;
              statusEl.style.color = '#3f8a56';
              statusEl.textContent = (PhoneController.target && token) ? 'CONNECTED' : 'RESCAN QR ON LAPTOP';
              // Send initial handshake
              sendInput();
            }
          } catch (_) {}
        };

        ws.onclose = function() {
          joined = false;
          try { ws.onclose = null; } catch (_) {}
          statusEl.style.color = '#ff3b30';
          statusEl.textContent = 'CONTROLLER DISCONNECTED · RECONNECTING';
          setTimeout(connect, 2000);
        };
      }

      var inputState = {
        f: 0, b: 0, l: 0, r: 0, h: 0, boost: 0, horn: 0, cam: 0, reset: 0, steerAnalog: 0
      };

      function sendInput() {
        if (!ws || ws.readyState !== 1 || !joined) return;
        ref++;
        ws.send(JSON.stringify({
          topic: topic,
          event: 'broadcast',
          ref: String(ref),
          payload: {
            type: 'broadcast',
            event: 'm',
            payload: {
              k: 'ctrl',
              to: PhoneController.target,
              token: token,
              input: inputState,
              ts: Date.now()
            }
          }
        }));
      }

      // Input polling @ 30Hz
      setInterval(sendInput, 33);

      // Button binding helper
      function bindButton(id, onDown, onUp) {
        var el = document.getElementById(id);
        if (!el) return;
        var active = false;
        var start = function(e) {
          e.preventDefault();
          if (active) return;
          active = true;
          el.style.opacity = '0.7';
          el.style.transform = 'scale(0.94)';
          if (navigator.vibrate) try { navigator.vibrate(15); } catch(_) {}
          onDown();
          sendInput();
        };
        var end = function(e) {
          e.preventDefault();
          if (!active) return;
          active = false;
          el.style.opacity = '1';
          el.style.transform = 'none';
          onUp();
          sendInput();
        };
        el.addEventListener('pointerdown', start);
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
        el.addEventListener('contextmenu', function(e) { e.preventDefault(); });
      }

      bindButton('btn-gas', function() { inputState.f = 1; }, function() { inputState.f = 0; });
      bindButton('btn-brake', function() { inputState.b = 1; }, function() { inputState.b = 0; });
      bindButton('btn-left', function() { inputState.l = 1; }, function() { inputState.l = 0; });
      bindButton('btn-right', function() { inputState.r = 1; }, function() { inputState.r = 0; });
      bindButton('btn-boost', function() { inputState.boost = 1; }, function() { inputState.boost = 0; });
      bindButton('btn-handbrake', function() { inputState.h = 1; }, function() { inputState.h = 0; });
      bindButton('btn-horn', function() { inputState.horn = 1; }, function() { inputState.horn = 0; });
      bindButton('btn-cam', function() { inputState.cam = 1; setTimeout(function() { inputState.cam = 0; }, 200); }, function() {});
      bindButton('btn-reset', function() { inputState.reset = 1; setTimeout(function() { inputState.reset = 0; }, 200); }, function() {});

      /* Gyro steering: hold the phone like a steering wheel and turn it.
         The steering angle is the roll of the phone in the plane of its own screen, worked out from which way
         gravity points on the screen. Raw alpha/beta/gamma change meaning with portrait vs landscape (and
         flip on some phones), which is what made the old version feel off-centre and backwards.
         On top of that: it calibrates itself the moment you switch it on (whatever angle you are holding is
         "straight"), CALIBRATE re-centres on demand, the signal is smoothed, has a small dead zone, and a
         gentle curve so small turns are fine and full lock is a real turn. */
      var tiltBtn = document.getElementById('btn-tilt');
      var calibBtn = document.getElementById('btn-calib');
      var sensBtn = document.getElementById('btn-sens');
      var steerCluster = document.getElementById('c-steer');
      var tiltActive = false;
      var tiltCenter = 0;        // roll (degrees) that counts as straight ahead
      var rollNow = 0;           // latest smoothed roll, degrees
      var haveRoll = false;
      var needCenter = false;
      // how far you turn the phone for full lock. It was 38 degrees, which made small hand movements steer hard;
      // the default is now 60, with Low / Med / High on the SENS button (remembered on this phone)
      var SENS = [{ n: 'LOW', range: 80 }, { n: 'MED', range: 60 }, { n: 'HIGH', range: 42 }];
      var sensI = 1; try { var sv = +localStorage.getItem('ctrl_sens'); if (sv >= 0 && sv < 3) sensI = sv; } catch (_) {}
      var TILT_RANGE = SENS[sensI].range;
      var DEAD = 4;              // degrees ignored around centre: holding the phone, hands always move a little
      var outPrev = 0;
      var lastScreenAngle = null;

      function screenAngle() {
        if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
        return typeof window.orientation === 'number' ? (window.orientation + 360) % 360 : 0;
      }

      function onOrientation(e) {
        if (!tiltActive || e.beta == null || e.gamma == null) return;
        var d2r = Math.PI / 180, b = e.beta * d2r, g = e.gamma * d2r;
        // "up" in the phone's own axes (third row of the W3C orientation matrix); independent of compass heading
        var ux = -Math.cos(b) * Math.sin(g), uy = Math.sin(b);
        // into screen axes for the current rotation, so portrait and either landscape behave the same
        var th = screenAngle() * d2r, c = Math.cos(th), s = Math.sin(th);
        var sx = ux * c - uy * s, sy = ux * s + uy * c;
        if (Math.hypot(sx, sy) < 0.3) return;                // phone lying flat: roll is undefined, hold the last value
        var roll = -Math.atan2(sx, sy) / d2r;                // clockwise wheel turn = positive = steer right
        var ang = screenAngle();
        if (lastScreenAngle !== null && ang !== lastScreenAngle) needCenter = true;   // turned the phone round: re-centre
        lastScreenAngle = ang;
        if (!haveRoll) { rollNow = roll; haveRoll = true; }
        else {
          var dlt = roll - rollNow; if (dlt > 180) dlt -= 360; if (dlt < -180) dlt += 360;
          rollNow += dlt * 0.2;                               // smoothing: steadier, still responsive
          if (rollNow > 180) rollNow -= 360; if (rollNow < -180) rollNow += 360;
        }
        if (needCenter) { tiltCenter = rollNow; needCenter = false; }
        var rel = rollNow - tiltCenter; if (rel > 180) rel -= 360; if (rel < -180) rel += 360;
        var mag = Math.max(0, Math.abs(rel) - DEAD) / (TILT_RANGE - DEAD);
        mag = Math.min(1, mag);
        mag = Math.pow(mag, 1.7);                             // fine control near the centre, full lock still reachable
        var out = (rel < 0 ? -1 : 1) * mag;
        out = outPrev + Math.max(-0.06, Math.min(0.06, out - outPrev));   // no sudden jumps between readings
        outPrev = out;
        inputState.steerAnalog = Math.abs(out) < 0.01 ? 0 : out;
      }

      tiltBtn.onclick = function() {
        if (tiltActive) { setTilt(false); return; }
        var ask = function() {
          if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            return DeviceOrientationEvent.requestPermission().then(function(res) { if (res === 'granted') setTilt(true); });
          }
          setTilt(true);
        };
        try { var r = ask(); if (r && r.catch) r.catch(function() {}); } catch (_) {}
      };

      function setTilt(on) {
        tiltActive = on;
        tiltBtn.textContent = on ? 'GYRO STEER: ON' : 'GYRO STEER: OFF';
        tiltBtn.style.background = on ? '#3f8a56' : 'rgba(255,255,255,0.12)';
        calibBtn.style.display = on ? 'block' : 'none';
        sensBtn.style.display = on ? 'block' : 'none';
        steerCluster.style.opacity = on ? '0.35' : '1.0';
        if (on) {
          haveRoll = false; needCenter = true; outPrev = 0; lastScreenAngle = screenAngle();   // whatever angle you hold now is straight
          window.addEventListener('deviceorientation', onOrientation, true);
        } else {
          window.removeEventListener('deviceorientation', onOrientation, true);
          inputState.steerAnalog = 0;
        }
      }

      function paintSens() { sensBtn.textContent = 'SENS: ' + SENS[sensI].n; }
      sensBtn.onclick = function() {
        sensI = (sensI + 1) % SENS.length; TILT_RANGE = SENS[sensI].range; paintSens();
        try { localStorage.setItem('ctrl_sens', String(sensI)); } catch (_) {}
        if (navigator.vibrate) try { navigator.vibrate(12); } catch (_) {}
      };
      paintSens();
      calibBtn.onclick = function() {
        if (haveRoll) tiltCenter = rollNow; else needCenter = true;
        inputState.steerAnalog = 0; outPrev = 0;
        if (navigator.vibrate) try { navigator.vibrate([20, 50, 20]); } catch(_) {}
      };

      connect();
    }
  };

  window.PhoneController = PhoneController;
  PhoneController.init();
})(window);
