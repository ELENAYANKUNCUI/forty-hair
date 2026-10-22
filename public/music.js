(() => {
  const BPM = 104;
  const BEAT = 60 / BPM;
  const BAR = BEAT * 3;
  const BARS = 16;
  const LOOP = BAR * BARS;
  const SR = 32000;
  const VOL = 0.28;

  const CHORDS = [
    [50, [62, 65, 69]],
    [46, [58, 62, 65]],
    [53, [57, 60, 65]],
    [48, [60, 64, 67]],
    [50, [62, 65, 69]],
    [43, [55, 58, 62]],
    [45, [57, 61, 64]],
    [50, [62, 65, 69]],
    [50, [62, 65, 69]],
    [46, [58, 62, 65]],
    [53, [57, 60, 65]],
    [48, [60, 64, 67]],
    [43, [55, 58, 62]],
    [45, [57, 61, 64]],
    [50, [62, 65, 69]],
    [50, [62, 65, 69]]
  ];

  const MELODY = [
    [[69, 0, 2], [65, 2, 1]],
    [[74, 0, 2], [72, 2, 1]],
    [[69, 0, 1], [72, 1, 1], [77, 2, 1]],
    [[76, 0, 2], [79, 2, 1]],
    [[77, 0, 1.5], [76, 1.5, 0.5], [74, 2, 1]],
    [[70, 0, 2], [69, 2, 1]],
    [[67, 0, 1], [69, 1, 1], [72, 2, 1]],
    [[74, 0, 3]],
    [[69, 0, 1], [74, 1, 1], [77, 2, 1]],
    [[79, 0, 1], [77, 1, 1], [74, 2, 1]],
    [[72, 0, 2], [69, 2, 1]],
    [[67, 0, 1], [64, 1, 1], [67, 2, 1]],
    [[69, 0, 2], [70, 2, 1]],
    [[69, 0, 1], [67, 1, 1], [64, 2, 1]],
    [[65, 0, 1], [64, 1, 1], [62, 2, 1]],
    [[62, 0, 3]]
  ];

  const BELLS = { 3: 86, 7: 81, 11: 86, 15: 93 };
  let ctx = null;
  let master = null;
  let dry = null;
  let wet = null;
  let reverb = null;
  let source = null;
  let buffer = null;
  let bufferPromise = null;
  let enabled = true;
  let started = false;

  function freq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function ramp(param, value, time, constant = 0.18) {
    param.cancelScheduledValues(time);
    param.setTargetAtTime(value, time, constant);
  }

  function envelope(gain, t0, attack, duration, level) {
    const g = gain.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, level), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + duration);
  }

  function panNode(c, pan) {
    if (!c.createStereoPanner) return null;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    return p;
  }

  function pluck(c, dest, t, midi, duration, level, pan) {
    const f = freq(midi);
    const o = c.createOscillator();
    const o2 = c.createOscillator();
    const g = c.createGain();
    const filter = c.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    o2.type = 'sine';
    o2.frequency.setValueAtTime(f * 2.004, t);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, t);
    filter.frequency.exponentialRampToValueAtTime(780, t + duration);
    envelope(g, t, 0.006, duration, level);
    o.connect(filter);
    o2.connect(filter);
    filter.connect(g);
    const p = panNode(c, pan);
    if (p) {
      g.connect(p);
      p.connect(dest);
    } else {
      g.connect(dest);
    }
    o.start(t);
    o2.start(t);
    o.stop(t + duration + 0.04);
    o2.stop(t + duration + 0.04);
  }

  function flute(c, dest, t, midi, duration, level, pan) {
    const f = freq(midi);
    const o = c.createOscillator();
    const o2 = c.createOscillator();
    const g = c.createGain();
    const filter = c.createBiquadFilter();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(f, t);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, t);
    lfo.frequency.setValueAtTime(4.8, t);
    lg.gain.setValueAtTime(f * 0.0045, t);
    lfo.connect(lg);
    lg.connect(o.frequency);
    envelope(g, t, 0.055, duration, level);
    o.connect(filter);
    o2.connect(filter);
    filter.connect(g);
    const p = panNode(c, pan);
    if (p) {
      g.connect(p);
      p.connect(dest);
    } else {
      g.connect(dest);
    }
    o.start(t);
    o2.start(t);
    lfo.start(t);
    o.stop(t + duration + 0.06);
    o2.stop(t + duration + 0.06);
    lfo.stop(t + duration + 0.06);
  }

  function bass(c, dest, t, midi, duration, level) {
    const f = freq(midi);
    const o = c.createOscillator();
    const o2 = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(f * 0.5, t);
    envelope(g, t, 0.015, duration, level);
    o.connect(g);
    o2.connect(g);
    g.connect(dest);
    o.start(t);
    o2.start(t);
    o.stop(t + duration + 0.04);
    o2.stop(t + duration + 0.04);
  }

  function bell(c, dest, t, midi, level, pan) {
    const f = freq(midi);
    const o = c.createOscillator();
    const o2 = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o2.type = 'sine';
    o2.frequency.setValueAtTime(f * 2.01, t);
    envelope(g, t, 0.008, 1.5, level);
    o.connect(g);
    o2.connect(g);
    const p = panNode(c, pan);
    if (p) {
      g.connect(p);
      p.connect(dest);
    } else {
      g.connect(dest);
    }
    o.start(t);
    o2.start(t);
    o.stop(t + 1.55);
    o2.stop(t + 1.55);
  }

  function pad(c, dest, t, notes, duration, level) {
    for (const n of notes) {
      const f = freq(n);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      const gg = g.gain;
      gg.setValueAtTime(0.0001, t);
      gg.linearRampToValueAtTime(level, t + 0.45);
      gg.setValueAtTime(level, Math.max(t + 0.5, t + duration - 0.45));
      gg.linearRampToValueAtTime(0.0001, t + duration);
      o.connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + duration + 0.04);
    }
  }

  function schedule(c, dest) {
    const roots = CHORDS;
    for (let bar = 0; bar < BARS; bar += 1) {
      const t0 = bar * BAR;
      const [root, tones] = roots[bar];
      bass(c, dest, t0, root, BEAT * 0.92, 0.075);
      bass(c, dest, t0 + BEAT * 2, root + 7, BEAT * 0.7, 0.035);
      const pattern = [0, 1, 2, 1, 2, 1];
      for (let i = 0; i < 6; i += 1) {
        const midi = tones[pattern[i]] + (i === 4 && bar % 4 === 3 ? 12 : 0);
        pluck(c, dest, t0 + i * BEAT / 2, midi, 0.42, i === 0 ? 0.045 : 0.032, -0.3);
      }
      const padNotes = bar < 8 ? [tones[0], tones[2]] : [tones[0], tones[1], tones[2]];
      pad(c, dest, t0, padNotes, BAR + 0.1, bar < 8 ? 0.012 : 0.009);
      for (const [midi, beat, beats] of MELODY[bar]) {
        flute(c, dest, t0 + beat * BEAT, midi, Math.max(0.18, beats * BEAT * 0.92), 0.058, 0.08);
        if (bar >= 8) {
          pluck(c, dest, t0 + beat * BEAT, midi + 12, Math.max(0.25, beats * BEAT * 0.75), 0.012, 0.38);
        }
      }
      if (BELLS[bar]) bell(c, dest, t0 + BEAT * 2.55, BELLS[bar], 0.022, 0.4);
    }
  }

  function normalize(b) {
    let peak = 0;
    for (let ch = 0; ch < b.numberOfChannels; ch += 1) {
      const data = b.getChannelData(ch);
      for (let i = 0; i < data.length; i += 1) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    if (peak <= 0) return;
    const gain = 0.82 / peak;
    for (let ch = 0; ch < b.numberOfChannels; ch += 1) {
      const data = b.getChannelData(ch);
      for (let i = 0; i < data.length; i += 1) data[i] *= gain;
    }
  }

  function edgeFade(b) {
    const n = Math.floor(b.sampleRate * 0.018);
    for (let ch = 0; ch < b.numberOfChannels; ch += 1) {
      const data = b.getChannelData(ch);
      for (let i = 0; i < n; i += 1) {
        const k = i / n;
        data[i] *= k;
        data[data.length - 1 - i] *= k;
      }
    }
  }

  async function renderBuffer() {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) throw new Error('offline audio unavailable');
    const oc = new Offline(2, Math.ceil(LOOP * SR), SR);
    const out = oc.createGain();
    out.gain.value = 0.9;
    out.connect(oc.destination);
    schedule(oc, out);
    const rendered = await oc.startRendering();
    normalize(rendered);
    edgeFade(rendered);
    return rendered;
  }

  function ensureBuffer() {
    if (!bufferPromise) {
      bufferPromise = renderBuffer().then((b) => {
        buffer = b;
        return b;
      }).catch(() => null);
    }
    return bufferPromise;
  }

  function impulse(c) {
    const length = Math.floor(c.sampleRate * 1.8);
    const b = c.createBuffer(2, length, c.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = b.getChannelData(ch);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.8);
      }
    }
    return b;
  }

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 18;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.24;
    master.connect(comp);
    comp.connect(ctx.destination);
    dry = ctx.createGain();
    dry.gain.value = 0.92;
    dry.connect(master);
    if (ctx.createConvolver) {
      reverb = ctx.createConvolver();
      reverb.buffer = impulse(ctx);
      wet = ctx.createGain();
      wet.gain.value = 0.18;
      wet.connect(master);
    }
    return ctx;
  }

  async function start() {
    started = true;
    if (!enabled) return;
    const pending = ensureBuffer();
    const c = ensureContext();
    if (!c) return;
    try {
      if (c.state === 'suspended') await c.resume();
    } catch (e) {}
    if (!buffer) {
      try {
        await pending;
      } catch (e) {
        return;
      }
    }
    if (!buffer) return;
    if (!source) {
      source = c.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(dry);
      if (reverb) source.connect(reverb);
      source.start();
      if (reverb) reverb.connect(wet);
    }
    ramp(master.gain, VOL, c.currentTime, 0.45);
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    if (enabled) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (started && !source) {
        start().catch(() => {});
      } else {
        ramp(master.gain, VOL, now, 0.25);
      }
    } else {
      ramp(master.gain, 0.0001, now, 0.16);
    }
  }

  function pause() {
    if (!ctx || !master) return;
    ramp(master.gain, 0.0001, ctx.currentTime, 0.12);
  }

  function resume() {
    if (!enabled || !ctx || !master) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    ramp(master.gain, VOL, ctx.currentTime, 0.3);
  }

  function state() {
    return {
      started,
      enabled,
      context: ctx ? ctx.state : 'none',
      playing: !!source,
      buffer: !!buffer,
      duration: buffer ? buffer.duration : 0
    };
  }

  window.KingMusic = {
    preload: () => ensureBuffer(),
    start,
    setEnabled,
    pause,
    resume,
    state
  };

  setTimeout(() => {
    ensureBuffer().catch(() => {});
  }, 0);
})();
