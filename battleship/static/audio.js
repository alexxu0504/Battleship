const GameAudio = (() => {
  let ctx = null;
  let master = null;
  let sfxGain = null;
  let ambGain = null;
  let muted = localStorage.getItem("battleship.muted") === "1";
  let ambience = null;
  let noiseBuf = null;

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
      ambGain.gain.value = 0.35;
      ambGain.connect(master);
      if (!muted) startAmbience();
    }
    if (ctx.state === "suspended") ctx.resume();
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

  function victory() {
    if (!ctx || muted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => {
      tone({
        type: "triangle",
        freqStart: f,
        duration: 0.18,
        gainPeak: 0.2,
        when: ctx.currentTime + i * 0.16,
      });
    });
  }

  function defeat() {
    if (!ctx || muted) return;
    const notes = [220, 174.61, 146.83]; // A3 F3 D3
    notes.forEach((f, i) => {
      tone({
        type: "sawtooth",
        freqStart: f,
        duration: 0.35,
        gainPeak: 0.15,
        when: ctx.currentTime + i * 0.3,
        filterFreq: 900,
      });
    });
  }

  function startAmbience() {
    if (!ctx || ambience) return;
    const nodes = [];
    const timeouts = [];
    let stopped = false;

    // Ocean waves: looping noise -> lowpass 400 -> LFO-modulated gain
    const oceanSrc = ctx.createBufferSource();
    oceanSrc.buffer = noiseBuffer(4);
    oceanSrc.loop = true;
    const oceanFilt = ctx.createBiquadFilter();
    oceanFilt.type = "lowpass";
    oceanFilt.frequency.value = 400;
    const oceanGain = ctx.createGain();
    oceanGain.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth);
    lfoDepth.connect(oceanGain.gain);
    oceanSrc.connect(oceanFilt);
    oceanFilt.connect(oceanGain);
    oceanGain.connect(ambGain);
    oceanSrc.start();
    lfo.start();
    nodes.push(oceanSrc, lfo);

    // Surf hiss: looping noise -> bandpass 1500 -> LFO gain
    const hissSrc = ctx.createBufferSource();
    hissSrc.buffer = noiseBuffer(4);
    hissSrc.loop = true;
    const hissFilt = ctx.createBiquadFilter();
    hissFilt.type = "bandpass";
    hissFilt.frequency.value = 1500;
    hissFilt.Q.value = 0.5;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.15;
    const hissLfo = ctx.createOscillator();
    hissLfo.type = "sine";
    hissLfo.frequency.value = 0.13;
    const hissLfoDepth = ctx.createGain();
    hissLfoDepth.gain.value = 0.1;
    hissLfo.connect(hissLfoDepth);
    hissLfoDepth.connect(hissGain.gain);
    hissSrc.connect(hissFilt);
    hissFilt.connect(hissGain);
    hissGain.connect(ambGain);
    hissSrc.start();
    hissLfo.start();
    nodes.push(hissSrc, hissLfo);

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
    bombWhistle,
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
  };
})();

window.GameAudio = GameAudio;
