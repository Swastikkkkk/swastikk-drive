/**
 * WebAudio Sound Engine Subsystem: Synthesizers, Motor Pitch, Wind, Squeal, Impacts
 */
(function(window) {
  var AudioManager = {
    AC: null,
    SND: null,
    muted: false,

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

        this.SND = { bus: bus, tone: tone, pk: pk, wh: wh, mG: mG, mF: mF, m1: m1, m2: m2, m3: m3, g3: g3, rG: rG, rF: rF, gG: gG, wG: wG, wF: wF, sG: sG, s1: s1, s2: s2, ld: 0 };
      } catch(e) {
        this.SND = null;
      }
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
    }
  };

  window.AudioManager = AudioManager;
})(window);
