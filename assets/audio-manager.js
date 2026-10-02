/**
 * WebAudio Sound Engine Subsystem: Synthesizers, Motor Pitch, Wind, Squeal, Impacts
 * Vehicle-specific audio profiles: F1, SUV, Bike, Hypercar, EV, Standard Car
 */
(function(window) {
  var AudioManager = {
    AC: null,
    SND: null,
    muted: false,
    vehicleProfile: 'car', // 'f1', 'suv', 'bike', 'hypercar', 'ev', 'car'

    init: function() {
      if (this.AC) {
        try {
          if (this.AC.state === 'suspended') this.AC.resume();
        } catch(e) {}
        return;
      }
      try {
        var AC = new (window.AudioContext || window.webkitAudioContext)();
        this.AC = AC;
        var T = AC.currentTime, sr = AC.sampleRate;
        var G = function(v) { var g = AC.createGain(); g.gain.value = v; return g; };
        var F = function(t, f, q) { var x = AC.createBiquadFilter(); x.type = t; x.frequency.value = f; if (q != null) x.Q.value = q; return x; };
        var O = function(t, f) { var o = AC.createOscillator(); o.type = t; o.frequency.value = f; o.start(T); return o; };
        var L = function(b) { var s = AC.createBufferSource(); s.buffer = b; s.loop = true; s.start(T, Math.random() * 1.5); return s; };

        var comp = AC.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 14; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.25;

        var bus = G(0.9), tone = F('lowpass', 18000, 0.5);
        bus.connect(tone); tone.connect(comp); comp.connect(AC.destination);

        var n = sr * 2, pk = AC.createBuffer(1, n, sr), wh = AC.createBuffer(1, n, sr),
            pd = pk.getChannelData(0), wd = wh.getChannelData(0);
        var b0 = 0, b1 = 0, b2 = 0;
        for (var i = 0; i < n; i++) {
          var w = Math.random() * 2 - 1;
          wd[i] = w;
          b0 = 0.99765 * b0 + w * 0.099046;
          b1 = 0.963 * b1 + w * 0.2965164;
          b2 = 0.57 * b2 + w * 1.0526913;
          pd[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
        }

        // Base motor oscillators (will be retuned per vehicle)
        var mG = G(0), mF = F('lowpass', 1000, 0.7);
        mF.connect(mG); mG.connect(bus);
        var m1 = O('sine', 130), m2 = O('triangle', 65), m3 = O('sine', 390),
            g1 = G(0.6), g2 = G(0.3), g3 = G(0.04);
        m1.connect(g1); m2.connect(g2); m3.connect(g3);
        g1.connect(mF); g2.connect(mF); g3.connect(mF);

        var lfo = O('sine', 4.3), lg = G(1.4);
        lfo.connect(lg); lg.connect(m1.frequency); lg.connect(m3.frequency);

        var rG = G(0), rF = F('lowpass', 300, 0.6);
        L(pk).connect(rF); rF.connect(rG); rG.connect(bus);

        var gG = G(0), gF = F('bandpass', 1900, 0.7);
        L(wh).connect(gF); gF.connect(gG); gG.connect(bus);

        var wG = G(0), wF = F('bandpass', 700, 0.45);
        L(pk).connect(wF); wF.connect(wG); wG.connect(bus);

        var sG = G(0), s1 = F('bandpass', 1050, 11), s2 = F('bandpass', 2200, 13),
            s2g = G(0.55), sn = L(wh);
        sn.connect(s1); sn.connect(s2); s1.connect(sG); s2.connect(s2g); s2g.connect(sG); sG.connect(bus);

        // Vehicle-specific noise buffers
        this.noiseBuffers = { pk: pk, wh: wh };

        this.SND = { 
          bus: bus, tone: tone, pk: pk, wh: wh, 
          mG: mG, mF: mF, m1: m1, m2: m2, m3: m3, g1: g1, g2: g2, g3: g3,
          rG: rG, rF: rF, gG: gG, wG: wG, wF: wF, sG: sG, s1: s1, s2: s2, ld: 0 
        };
        
        // Apply default car profile
        this.setVehicleProfile('car');
      } catch(e) {
        this.SND = null;
      }
    },

    setVehicleProfile: function(profile) {
      if (!this.AC || !this.SND) return;
      this.vehicleProfile = profile;
      var S = this.SND, T = this.AC.currentTime;
      
      // Vehicle-specific motor tuning
      var profiles = {
        f1: {
          // High-revving V10/V8 scream
          baseFreq: 220,        // Higher base frequency
          cylinders: 10,        // V10 character
          redline: 15000,       // High redline
          idleRPM: 4000,
          harmonics: [1, 2, 3, 4, 5, 6],  // Rich harmonics
          motorGain: 0.12,
          lfoRate: 0.8,         // Subtle vibrato
          lfoDepth: 2.5,
          exhaustNote: 'scream',
          exhaustGain: 0.15,
          gearWhine: true,
          gearWhineGain: 0.03,
          backfireChance: 0.08,
          turboWhistle: false
        },
        suv: {
          // Deep V8 rumble
          baseFreq: 65,
          cylinders: 8,
          redline: 6000,
          idleRPM: 650,
          harmonics: [0.5, 1, 1.5, 2, 3],
          motorGain: 0.15,
          lfoRate: 2.2,
          lfoDepth: 5,
          exhaustNote: 'rumble',
          exhaustGain: 0.18,
          gearWhine: false,
          intakeRoar: true,
          intakeGain: 0.08
        },
        bike: {
          // Inline-4 motorcycle howl
          baseFreq: 110,
          cylinders: 4,
          redline: 14000,
          idleRPM: 1300,
          harmonics: [1, 2, 3, 4, 5, 6, 7, 8],
          motorGain: 0.18,
          lfoRate: 1.5,
          lfoDepth: 3,
          exhaustNote: 'howl',
          exhaustGain: 0.2,
          gearWhine: true,
          gearWhineGain: 0.05,
          mechanicalClatter: true,
          chainNoise: true
        },
        hypercar: {
          // Twin-turbo V8 / V12 hybrid
          baseFreq: 90,
          cylinders: 8,
          redline: 8500,
          idleRPM: 800,
          harmonics: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5],
          motorGain: 0.14,
          lfoRate: 1.0,
          lfoDepth: 2,
          exhaustNote: 'turbo',
          exhaustGain: 0.16,
          turboWhistle: true,
          turboGain: 0.07,
          blowoffValve: true,
          hybridWhine: true,
          hybridGain: 0.04
        },
        ev: {
          // Electric motor whine + tire noise
          baseFreq: 0,          // No combustion
          motorWhine: true,
          whineBaseFreq: 800,   // High-pitched electric whine
          whineGain: 0.06,
          inverterWhine: true,
          inverterGain: 0.03,
          tireNoiseGain: 1.3,   // More prominent tire noise
          regenWhine: true
        },
        car: {
          // Standard sedan - inline-4 or V6
          baseFreq: 85,
          cylinders: 4,
          redline: 6500,
          idleRPM: 800,
          harmonics: [1, 2, 3, 4],
          motorGain: 0.1,
          lfoRate: 2.0,
          lfoDepth: 4,
          exhaustNote: 'standard',
          exhaustGain: 0.12
        }
      };

      var p = profiles[profile] || profiles.car;
      
      // Retune motor oscillators
      var baseHz = p.baseFreq;
      if (baseHz > 0) {
        S.m1.frequency.setTargetAtTime(baseHz, T, 0.1);
        S.m2.frequency.setTargetAtTime(baseHz * 0.5, T, 0.1);
        S.m3.frequency.setTargetAtTime(baseHz * 3, T, 0.1);
        S.mF.frequency.setTargetAtTime(400 + baseHz * 2, T, 0.1);
        S.mG.gain.setTargetAtTime(p.motorGain, T, 0.1);
        S.lfo = S.lfo || this.AC.createOscillator();
        if (!S.lfo.started) {
          S.lfo.type = 'sine';
          S.lfo.frequency.value = p.lfoRate;
          S.lfo.start(T);
          var lg = this.AC.createGain();
          lg.gain.value = p.lfoDepth;
          S.lfo.connect(lg);
          lg.connect(S.m1.frequency);
          lg.connect(S.m3.frequency);
          S.lfo.started = true;
        }
      }

      // Electric vehicle - replace motor with whine
      if (profile === 'ev') {
        S.m1.frequency.setTargetAtTime(p.whineBaseFreq, T, 0.1);
        S.m1.type = 'sine';
        S.m2.frequency.setTargetAtTime(p.whineBaseFreq * 0.5, T, 0.1);
        S.m2.type = 'triangle';
        S.m3.frequency.setTargetAtTime(p.whineBaseFreq * 2, T, 0.1);
        S.m3.type = 'sine';
        S.g1.gain.setTargetAtTime(p.whineGain, T, 0.1);
        S.g2.gain.setTargetAtTime(p.inverterGain, T, 0.1);
        S.g3.gain.setTargetAtTime(p.whineGain * 0.3, T, 0.1);
        S.mF.frequency.setTargetAtTime(1200, T, 0.1);
      }

      // Turbo whistle for hypercar
      if (p.turboWhistle && !S.turboOsc) {
        S.turboOsc = this.AC.createOscillator();
        S.turboOsc.type = 'sine';
        S.turboGain = this.AC.createGain();
        S.turboGain.gain.value = 0;
        S.turboOsc.connect(S.turboGain);
        S.turboGain.connect(this.SND.bus);
        S.turboOsc.start(T);
      }
      if (p.turboWhistle) {
        S.turboOsc.frequency.setTargetAtTime(2800, T, 0.05);
      }

      // Hybrid whine
      if (p.hybridWhine && !S.hybridOsc) {
        S.hybridOsc = this.AC.createOscillator();
        S.hybridOsc.type = 'sine';
        S.hybridGain = this.AC.createGain();
        S.hybridGain.gain.value = 0;
        S.hybridOsc.connect(S.hybridGain);
        S.hybridGain.connect(this.SND.bus);
        S.hybridOsc.start(T);
      }
      if (p.hybridWhine) {
        S.hybridOsc.frequency.setTargetAtTime(1800, T, 0.05);
      }

      // Store profile for update loop
      this.currentProfile = p;
    },

    update: function(dt, speed, rpm, throttle, braking, grounded, vehicleType) {
      if (!this.AC || !this.SND || this.muted) return;
      if (vehicleType) this.setVehicleProfile(vehicleType);
      
      var S = this.SND, T = this.AC.currentTime, p = this.currentProfile || {};
      var spN = Math.min(1, speed / (p.redline ? p.redline / 100 : 50));
      var thr = throttle - braking;
      
      // Update load factor
      S.ld = (S.ld == null ? 0 : S.ld) + ((thr > 0 ? 1 : 0) - (S.ld == null ? 0 : S.ld)) * Math.min(1, dt * 3);

      if (this.vehicleProfile === 'ev') {
        // Electric motor: whine pitch follows speed directly
        var whineHz = p.whineBaseFreq + spN * 2200;
        S.m1.frequency.setTargetAtTime(whineHz, T, 0.05);
        S.m2.frequency.setTargetAtTime(whineHz * 0.5, T, 0.05);
        S.m3.frequency.setTargetAtTime(whineHz * 2, T, 0.05);
        
        var motorGain = (p.whineGain + spN * 0.08) * (thr > 0 ? 1.2 : 0.4);
        S.g1.gain.setTargetAtTime(motorGain, T, 0.05);
        S.g2.gain.setTargetAtTime(p.inverterGain * (1 + spN), T, 0.05);
        
        // Regen whine when braking
        if (braking > 0 && speed > 5) {
          S.g3.gain.setTargetAtTime(p.whineGain * 0.5, T, 0.05);
        } else {
          S.g3.gain.setTargetAtTime(0, T, 0.1);
        }
        
        // Tire noise more prominent
        S.rG.gain.setTargetAtTime(this.muted ? 0 : spN * (p.tireNoiseGain || 1) * 0.045 * (grounded ? 1 : 0.15), T, 0.1);
        return;
      }

      // Combustion engine vehicles
      var baseHz = p.baseFreq;
      var hz = baseHz + spN * (p.redline - p.idleRPM) / 30; // Scale RPM to frequency
      
      S.m1.frequency.setTargetAtTime(hz, T, 0.08);
      S.m2.frequency.setTargetAtTime(hz * 0.5, T, 0.08);
      S.m3.frequency.setTargetAtTime(hz * 3.0, T, 0.08);
      S.mF.frequency.setTargetAtTime(480 + spN * 1300, T, 0.1);
      
      var motorGain = (p.motorGain || 0.1) * (0.4 + 0.6 * (thr > 0 ? 1 : 0.35));
      S.mG.gain.setTargetAtTime(this.muted ? 0 : motorGain, T, 0.08);

      // Exhaust character
      var exhaustGain = (p.exhaustGain || 0.12) * spN;
      S.rF.frequency.setTargetAtTime(150 + spN * 500, T, 0.1);
      S.rG.gain.setTargetAtTime(this.muted ? 0 : exhaustGain * (grounded ? 1 : 0.15), T, 0.1);

      // Gear whine
      if (p.gearWhine && S.gG) {
        S.gG.gain.setTargetAtTime(this.muted ? 0 : (p.gearWhineGain || 0.03) * spN * (grounded ? 1 : 0.2), T, 0.1);
      }

      // Intake roar (SUV)
      if (p.intakeRoar && S.gG) {
        S.gG.gain.setTargetAtTime(this.muted ? 0 : (p.intakeGain || 0.08) * spN * (thr > 0 ? 1 : 0.3), T, 0.1);
      }

      // Turbo whistle (hypercar)
      if (p.turboWhistle && S.turboGain) {
        var turboGain = (p.turboGain || 0.07) * Math.max(0, thr) * spN * spN;
        S.turboGain.gain.setTargetAtTime(this.muted ? 0 : turboGain, T, 0.1);
        S.turboOsc.frequency.setTargetAtTime(2800 + spN * 1200, T, 0.05);
      }

      // Blowoff valve on throttle lift
      if (p.blowoffValve && thr < -0.3 && spN > 0.3 && !this._blowoffPlayed) {
        this._blowoffPlayed = true;
        this.blowoff();
        setTimeout(() => { this._blowoffPlayed = false; }, 500);
      }

      // Hybrid whine
      if (p.hybridWhine && S.hybridGain) {
        var hybridGain = (p.hybridGain || 0.04) * (thr > 0 ? 1 : 0.2);
        S.hybridGain.gain.setTargetAtTime(this.muted ? 0 : hybridGain, T, 0.1);
        S.hybridOsc.frequency.setTargetAtTime(1800 + spN * 800, T, 0.05);
      }

      // Mechanical clatter (bike)
      if (p.mechanicalClatter && S.gG) {
        S.gG.gain.setTargetAtTime(this.muted ? 0 : 0.02 * (1 + spN), T, 0.1);
      }

      // Wind noise
      var windG = Math.min(0.03, spN * spN * 0.05);
      S.wG.gain.setTargetAtTime(this.muted ? 0 : windG, T, 0.15);
      if (windG > 0) S.wF.frequency.setTargetAtTime(420 + speed * 18, T, 0.2);

      // Squeal
      S.sG.gain.setTargetAtTime(0, T, 0.05);
    },

    blowoff: function() {
      if (!this.AC || this.muted || !this.SND) return;
      try {
        var T = this.AC.currentTime, o = this.AC.createOscillator(), g = this.AC.createGain(), f = this.AC.createBiquadFilter();
        o.type = 'sine'; o.frequency.setValueAtTime(1200, T); o.frequency.exponentialRampToValueAtTime(300, T + 0.4);
        f.type = 'highpass'; f.frequency.setValueAtTime(800, T);
        g.gain.setValueAtTime(0.1, T); g.gain.exponentialRampToValueAtTime(0.001, T + 0.5);
        o.connect(f); f.connect(g); g.connect(this.SND.bus);
        o.start(T); o.stop(T + 0.6);
      } catch(e) {}
    },

    blip: function(freq, dur, vol) {
      freq = freq || 880; dur = dur || 0.12; vol = vol || 0.08;
      if (!this.AC || this.muted) return;
      try {
        var T = this.AC.currentTime, o = this.AC.createOscillator(), g = this.AC.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0, T);
        g.gain.linearRampToValueAtTime(vol, T + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, T + dur);
        o.connect(g); g.connect(this.SND ? this.SND.bus : this.AC.destination);
        o.start(T); o.stop(T + dur + 0.02);
      } catch(e) {}
    },

    thud: function(k) {
      if (!this.AC || this.muted || !this.SND) return;
      try {
        var T = this.AC.currentTime, S = this.SND;
        var s = this.AC.createBufferSource();
        s.buffer = S.pk;
        var f = this.AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240 + k * 520;
        var g = this.AC.createGain();
        g.gain.setValueAtTime(0, T);
        g.gain.linearRampToValueAtTime(0.12 + 0.5 * k, T + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, T + 0.42);
        s.connect(f); f.connect(g); g.connect(S.bus);
        s.start(T, Math.random()); s.stop(T + 0.46);

        var o = this.AC.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(92, T); o.frequency.exponentialRampToValueAtTime(36, T + 0.3);
        var g2 = this.AC.createGain();
        g2.gain.setValueAtTime(0.08 + 0.32 * k, T);
        g2.gain.exponentialRampToValueAtTime(0.0001, T + 0.34);
        o.connect(g2); g2.connect(S.bus);
        o.start(T); o.stop(T + 0.38);
      } catch(e) {}
    },

    setMuted: function(m) { this.muted = m; if (this.AC) this.AC.suspend().catch(()=>{}).then(()=>{ if(!m) this.AC.resume().catch(()=>{}) }) }
  };

  window.AudioManager = AudioManager;
})(window);