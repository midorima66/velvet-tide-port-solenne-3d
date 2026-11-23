// Fully synthesized WebAudio: engine hum, police sirens, a slow synthwave music loop
// and every one-shot effect. No audio files exist; M toggles mute.

let ctx = null;
let master = null;
let muted = false;
let engineOsc = null, engineGain = null, engineFilter = null;
let sirenOsc = null, sirenGain = null, sirenLFO = null;
let musicTimer = null, musicStep = 0;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}

export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function env(gain, t0, peak, dur) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function blip(freq, dur, type = 'square', vol = 0.2, slideTo = null) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  env(gain, t0, vol, dur);
  osc.connect(gain).connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

function noise(dur, vol = 0.25, freq = 1200) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = 0.8;
  const gain = ctx.createGain();
  env(gain, t0, vol, dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
}

export const sfx = {
  punch() { noise(0.09, 0.3, 500); blip(120, 0.08, 'sine', 0.25, 60); },
  shoot() { noise(0.16, 0.5, 2400); blip(220, 0.12, 'sawtooth', 0.3, 55); },
  dryFire() { blip(1400, 0.04, 'square', 0.12); },
  hit() { noise(0.07, 0.22, 900); },
  cash() { blip(880, 0.09, 'square', 0.16); setTimeout(() => blip(1318, 0.14, 'square', 0.16), 70); },
  door() { blip(180, 0.1, 'sine', 0.2, 90); noise(0.05, 0.1, 700); },
  crash(intensity = 1) { noise(0.3, 0.35 * intensity, 350); blip(70, 0.25, 'sine', 0.3 * intensity, 40); },
  pickup() { blip(660, 0.08, 'triangle', 0.2); setTimeout(() => blip(990, 0.12, 'triangle', 0.2), 60); },
  mission() { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.2), i * 90)); },
  busted() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'sawtooth', 0.16), i * 150)); },
  wasted() { blip(196, 0.7, 'sawtooth', 0.2, 49); noise(0.5, 0.12, 300); },
  heal() { [440, 554, 659].forEach((f, i) => setTimeout(() => blip(f, 0.14, 'sine', 0.18), i * 70)); },
  star() { blip(1174, 0.1, 'square', 0.14); },
};

/** Engine loop for the car the player drives; speed 0..1. Call with null to stop. */
export function setEngine(speed) {
  if (!ctx) return;
  if (speed === null) {
    if (engineGain) engineGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
    return;
  }
  if (!engineOsc) {
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass'; engineFilter.frequency.value = 400;
    engineGain = ctx.createGain(); engineGain.gain.value = 0.0001;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();
  }
  const t = ctx.currentTime;
  engineOsc.frequency.setTargetAtTime(55 + speed * 165, t, 0.08);
  engineFilter.frequency.setTargetAtTime(300 + speed * 1400, t, 0.08);
  engineGain.gain.setTargetAtTime(muted ? 0.0001 : 0.05 + speed * 0.05, t, 0.08);
}

/** One shared siren wash while any police are close; level 0..1. */
export function setSiren(level) {
  if (!ctx) return;
  if (level <= 0) {
    if (sirenGain) sirenGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
    return;
  }
  if (!sirenOsc) {
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 800;
    sirenLFO = ctx.createOscillator();
    sirenLFO.type = 'sine'; sirenLFO.frequency.value = 0.55;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 190;
    sirenLFO.connect(lfoGain).connect(sirenOsc.frequency);
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0.0001;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start(); sirenLFO.start();
  }
  sirenGain.gain.setTargetAtTime(muted ? 0.0001 : 0.028 * level, ctx.currentTime, 0.2);
}

// A slow minor-key bass + pad loop, scheduled a bar at a time.
const BASS = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 73.4, 0, 61.7, 0];
const PAD = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];

export function startMusic() {
  if (!ctx || musicTimer) return;
  const bar = () => {
    if (!muted) {
      const barIdx = Math.floor(musicStep / 16) % 4;
      for (const f of PAD[barIdx]) {
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = f;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.035, t0 + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.6);
        osc.connect(gain).connect(master);
        osc.start(t0); osc.stop(t0 + 3.8);
      }
    }
    musicTimer = setTimeout(bar, 3840);
  };
  bar();
  // The bass walks on its own faster pulse.
  const bassLoop = () => {
    if (ctx && !muted) {
      const f = BASS[musicStep % 16];
      if (f) blip(f, 0.22, 'square', 0.07);
      musicStep++;
    }
    setTimeout(bassLoop, 240);
  };
  bassLoop();
}
