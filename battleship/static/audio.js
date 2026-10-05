const GameAudio = (() => {
  let ctx = null;
  let master = null;
  let sfxGain = null;
  let ambGain = null;
  let muted = localStorage.getItem("battleship.muted") === "1";
  let ambience = null;
  let noiseBuf = null;
  let music = null;
  let musicGain = null;
  let musicVolume = parseFloat(localStorage.getItem("battleship.music"));
  if (!(musicVolume >= 0 && musicVolume <= 1)) musicVolume = 0.35;

  function init() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.8;
      sfxGain.connect(master);
      ambGain = ctx.createGain();
      ambGain.gain.value = 0.2;
      ambGain.connect(master);
      music = new Audio("/static/music/hot_swing.mp3");
      music.loop = true;
      music.preload = "auto";
      const musicSrc = ctx.createMediaElementSource(music);
      musicGain = ctx.createGain();
      musicGain.gain.value = musicVolume;
      musicSrc.connect(musicGain);
      musicGain.connect(master);
      music.play().catch(() => {});
      if (!muted) startAmbience();
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  function setMusicVolume(v) {
    v = Math.min(1, Math.max(0, v));
    musicVolume = v;
    localStorage.setItem("battleship.music", String(v));
    if (musicGain && ctx) {
      const t = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(t);
      musicGain.gain.setValueAtTime(musicGain.gain.value, t);
      musicGain.gain.linearRampToValueAtTime(v, t + 0.1);
    }
    return v;
  }

  function getMusicVolume() {
    return musicVolume;
  }

  function duckMusic(seconds) {
    if (!ctx || !musicGain) return;
    const t = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.linearRampToValueAtTime(musicVolume * 0.25, t + 0.4);
    musicGain.gain.setValueAtTime(musicVolume * 0.25, t + seconds);
    musicGain.gain.linearRampToValueAtTime(musicVolume, t + seconds + 1.5);
  }

  function brassNote(freq, when, dur, peak = 0.25) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(700, when);
    f.frequency.linearRampToValueAtTime(2200, when + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.03);
    g.gain.setValueAtTime(peak, when + Math.max(0.03, dur - 0.25));
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(when);
      o.stop(when + dur + 0.05);
    }
    f.connect(g);
    g.connect(sfxGain);
  }

  function firework() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const pan = Math.random() * 1.6 - 0.8;
    playNoise({
      duration: 0.12,
      filterType: "lowpass",
      freqStart: 800,
      freqEnd: 200,
      gainPeak: 0.25,
      attack: 0.005,
      pan,
    });
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      playNoise({
        duration: 0.02,
        filterType: "highpass",
        freqStart: 3000,
        gainPeak: 0.08,
        attack: 0.002,
        when: t + 0.08 + Math.random() * 0.35,
        pan,
      });
    }
  }

  function slam() {
    if (!ctx || muted) return;
    tone({ type: "sine", freqStart: 70, freqEnd: 30, duration: 0.4, gainPeak: 0.9 });
    playNoise({
      duration: 0.35,
      filterType: "lowpass",
      freqStart: 400,
      freqEnd: 60,
      gainPeak: 0.7,
      attack: 0.003,
      decay: 0.35,
    });
  }

  function victory() {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + 0.05;
    const E = 0.225, Q = 0.45;
    const G4 = 392.0, C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880.0, C6 = 1046.5;
    const at = (q) => t0 + q * Q;
    // G4 G4 G4 eighths -> C5 dotted quarter
    brassNote(G4, at(0), E * 0.9);
    brassNote(G4, at(0.5), E * 0.9);
    brassNote(G4, at(1), E * 0.9);
    brassNote(C5, at(1.5), Q * 1.4);
    tone({ type: "triangle", freqStart: C5 / 4, duration: Q * 1.4, gainPeak: 0.18, when: at(1.5) });
    // rest quarter, then E5 E5 E5 eighths -> G5 half
    brassNote(E5, at(3), E * 0.9);
    brassNote(E5, at(3.5), E * 0.9);
    brassNote(E5, at(4), E * 0.9);
    brassNote(G5, at(4.5), Q * 2, 0.22);
    brassNote(E5, at(4.5), Q * 2, 0.14);
    tone({ type: "triangle", freqStart: G5 / 4, duration: Q * 2, gainPeak: 0.18, when: at(4.5) });
    // A5 G5 eighths -> C6 whole with crescendo
    brassNote(A5, at(6.5), E * 0.9);
    brassNote(G5, at(7), E * 0.9);
    brassNote(C6, at(7.5), Q * 3.5, 0.28);
    brassNote(G5, at(7.5), Q * 3.5, 0.16);
    tone({ type: "triangle", freqStart: C6 / 4, duration: Q * 3.5, gainPeak: 0.2, when: at(7.5) });
    // snare rolls under the first two bars (16th notes, ~90ms)
    for (let i = 0; i < 12; i++) {
      playNoise({
        duration: 0.05,
        filterType: "bandpass",
        freqStart: 1800,
        gainPeak: 0.07,
        attack: 0.002,
        q: 1.2,
        when: t0 + i * 0.11,
      });
    }
    // cymbal crash on final C6
    playNoise({
      duration: 2,
      filterType: "highpass",
      freqStart: 4000,
      gainPeak: 0.2,
      attack: 0.005,
      decay: 2,
      when: at(7.5),
    });
  }

  function horn(freqA, freqB, when, peak) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.5);
    g.gain.setValueAtTime(peak, when + 2.1);
    g.gain.linearRampToValueAtTime(0.0001, when + 2.9);
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 4;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 1.5;
    lfo.connect(lfoDepth);
    for (const fr of [freqA, freqB]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = fr;
      lfoDepth.connect(o.frequency);
      o.connect(f);
      o.start(when);
      o.stop(when + 3);
    }
    lfo.start(when);
    lfo.stop(when + 3);
    f.connect(g);
    g.connect(sfxGain);
  }

  function tympani(when) {
    tone({ type: "sine", freqStart: 55, freqEnd: 40, duration: 0.5, gainPeak: 0.5, when });
    playNoise({
      duration: 0.15,
      filterType: "lowpass",
      freqStart: 300,
      gainPeak: 0.3,
      attack: 0.003,
      when,
    });
  }

  function defeat() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    // sub rumble
    playNoise({
      duration: 2.5,
      filterType: "lowpass",
      freqStart: 150,
      freqEnd: 25,
      gainPeak: 0.8,
      attack: 0.01,
      decay: 2.5,
    });
    tone({ type: "sine", freqStart: 60, freqEnd: 20, duration: 2, gainPeak: 0.7 });
    // ship's horns
    horn(92, 138, t + 0.4, 0.22);
    horn(78, 117, t + 3.2, 0.15);
    // minor dirge: D4 C4 Bb3 A3 then Ab3->G3 slide
    const dirge = [
      [293.66, 1.0, 0.6],
      [261.63, 1.6, 0.6],
      [233.08, 2.2, 0.6],
      [220.0, 2.8, 1.2],
    ];
    for (const [f, off, d] of dirge) brassNote(f, t + off, d, 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + 4.0);
    g.gain.linearRampToValueAtTime(0.12, t + 4.05);
    g.gain.linearRampToValueAtTime(0.0001, t + 5.8);
    const slide = ctx.createOscillator();
    slide.type = "sawtooth";
    slide.frequency.setValueAtTime(207.65, t + 4.0); // Ab3
    slide.frequency.exponentialRampToValueAtTime(196.0, t + 5.8); // G3
    const sf = ctx.createBiquadFilter();
    sf.type = "lowpass";
    sf.frequency.value = 1200;
    slide.connect(sf);
    sf.connect(g);
    g.connect(sfxGain);
    slide.start(t + 4.0);
    slide.stop(t + 5.9);
    // sparse tympani
    for (const off of [0, 1.2, 2.4, 4.2]) tympani(t + off);
  }

  function setMuted(m) {
    muted = m;
    localStorage.setItem("battleship.muted", m ? "1" : "0");
    if (!ctx) return muted;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(m ? 0 : 1, t + 0.1);
    if (!m) startAmbience();
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  function isMuted() {
    return muted;
  }

  function noiseBuffer(seconds) {
    if (noiseBuf && noiseBuf.duration >= seconds) return noiseBuf;
    const len = Math.ceil(ctx.sampleRate * seconds);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function playNoise({
    duration,
    filterType = "lowpass",
    freqStart = 1000,
    freqEnd = null,
    gainPeak = 0.5,
    attack = 0.01,
    decay = null,
    q = 1,
    when = null,
    pan = null,
    dest = null,
  }) {
    const t = when !== null ? when : ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration + 0.1);
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.setValueAtTime(freqStart, t);
    filt.Q.value = q;
    if (freqEnd !== null) {
      filt.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + duration);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gainPeak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (decay || duration));
    src.connect(filt);
    filt.connect(g);
    let out = g;
    if (pan !== null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    out.connect(dest || sfxGain);
    src.start(t);
    src.stop(t + duration + 0.1);
    return src;
  }

  function tone({
    type = "sine",
    freqStart = 440,
    freqEnd = null,
    duration = 0.3,
    gainPeak = 0.2,
    when = null,
    dest = null,
    filterFreq = null,
  }) {
    const t = when !== null ? when : ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + duration);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gainPeak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    let out = g;
    if (filterFreq !== null) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = filterFreq;
      g.connect(f);
      out = f;
    }
    out.connect(dest || sfxGain);
    osc.start(t);
    osc.stop(t + duration + 0.05);
    return osc;
  }

  function planePass(dir = 1, duration = 1.1) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(1200, t + duration * 0.45);
    f.frequency.linearRampToValueAtTime(600, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + duration * 0.45);
    g.gain.linearRampToValueAtTime(0, t + duration);
    for (const fr of [110, 112]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = fr;
      o.connect(f);
      o.start(t);
      o.stop(t + duration);
    }
    f.connect(g);
    let out = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(-dir, t);
      p.pan.linearRampToValueAtTime(dir, t + duration);
      g.connect(p);
      out = p;
    }
    out.connect(sfxGain);
    playNoise({
      duration,
      filterType: "bandpass",
      freqStart: 400,
      gainPeak: 0.05,
      attack: 0.2,
      decay: duration,
    });
  }

  function bombWhistle(duration = 0.5) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.exponentialRampToValueAtTime(500, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function explosion() {
    if (!ctx || muted) return;
    playNoise({
      duration: 0.6,
      filterType: "lowpass",
      freqStart: 1200,
      freqEnd: 80,
      gainPeak: 0.9,
      attack: 0.005,
      decay: 0.6,
    });
    playNoise({
      duration: 0.9,
      filterType: "lowpass",
      freqStart: 200,
      freqEnd: 30,
      gainPeak: 0.7,
      attack: 0.005,
      decay: 0.9,
    });
    tone({ type: "sine", freqStart: 110, freqEnd: 30, duration: 0.5, gainPeak: 0.8 });
  }

  function splash() {
    if (!ctx || muted) return;
    playNoise({
      duration: 0.35,
      filterType: "bandpass",
      freqStart: 900,
      gainPeak: 0.4,
      attack: 0.01,
      q: 0.8,
    });
    playNoise({
      duration: 0.25,
      filterType: "highpass",
      freqStart: 2500,
      gainPeak: 0.12,
      attack: 0.02,
      when: ctx.currentTime + 0.08,
    });
  }

  function sunk() {
    if (!ctx || muted) return;
    explosion();
    const t = ctx.currentTime + 0.12;
    playNoise({
      duration: 1.2,
      filterType: "lowpass",
      freqStart: 400,
      freqEnd: 40,
      gainPeak: 0.5,
      attack: 0.01,
      decay: 1.2,
      when: t,
    });
    tone({
      type: "sawtooth",
      freqStart: 180,
      freqEnd: 60,
      duration: 1.0,
      gainPeak: 0.08,
      when: t,
      filterFreq: 600,
    });
  }

  function click() {
    if (!ctx || muted) return;
    tone({ type: "square", freqStart: 600, duration: 0.03, gainPeak: 0.05 });
  }

  function startAmbience() {
    if (!ctx || ambience) return;
    const nodes = [];
    const timeouts = [];
    let stopped = false;

    // Distant artillery
    function scheduleArtillery() {
      if (stopped) return;
      const delay = 4000 + Math.random() * 7000;
      timeouts.push(
        setTimeout(() => {
          if (stopped) return;
          const shots = Math.random() < 0.3 ? 2 : 1;
          for (let i = 0; i < shots; i++) {
            playNoise({
              duration: 1.5,
              filterType: "lowpass",
              freqStart: 250,
              freqEnd: 60,
              gainPeak: 0.25 * (0.6 + Math.random() * 0.8),
              attack: 0.02,
              decay: 1.5,
              when: ctx.currentTime + i * 0.35,
              pan: Math.random() * 1.6 - 0.8,
              dest: ambGain,
            });
          }
          scheduleArtillery();
        }, delay)
      );
    }
    scheduleArtillery();

    // Propeller aircraft flyby
    function scheduleFlyby() {
      if (stopped) return;
      const delay = 20000 + Math.random() * 20000;
      timeouts.push(
        setTimeout(() => {
          if (!stopped) flyby();
          scheduleFlyby();
        }, delay)
      );
    }
    function flyby() {
      const t = ctx.currentTime;
      const dur = 9;
      const oscs = [55, 56.5].map((f) => {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(f, t);
        o.frequency.linearRampToValueAtTime(f * 1.05, t + dur * 0.5);
        o.frequency.linearRampToValueAtTime(f * 0.9, t + dur);
        return o;
      });
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 4);
      g.gain.linearRampToValueAtTime(0, t + dur);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      oscs.forEach((o) => o.connect(filt));
      filt.connect(g);
      if (pan) {
        pan.pan.setValueAtTime(-1, t);
        pan.pan.linearRampToValueAtTime(1, t + dur);
        g.connect(pan);
        pan.connect(ambGain);
      } else {
        g.connect(ambGain);
      }
      oscs.forEach((o) => {
        o.start(t);
        o.stop(t + dur + 0.1);
      });
      nodes.push(...oscs);
    }
    scheduleFlyby();

    ambience = { nodes, timeouts, stop: () => { stopped = true; } };
  }

  function stopAmbience() {
    if (!ambience) return;
    ambience.stop();
    for (const n of ambience.nodes) {
      try {
        n.stop();
      } catch (e) {}
    }
    for (const t of ambience.timeouts) clearTimeout(t);
    ambience = null;
  }

  return {
    init,
    setMuted,
    toggleMute,
    isMuted,
    setMusicVolume,
    getMusicVolume,
    duckMusic,
    firework,
    slam,
    bombWhistle,
    planePass,
    explosion,
    splash,
    sunk,
    click,
    victory,
    defeat,
    startAmbience,
    stopAmbience,
    get _ctx() {
      return ctx;
    },
    get _music() {
      return music;
    },
  };
})();

window.GameAudio = GameAudio;
