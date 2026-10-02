/** Procedural game audio built on the Web Audio API (no assets required). */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private driftGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private lastHit = 0;

  get ready() {
    return !!this.ctx;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.9;
      master.connect(ctx.destination);
      this.master = master;

      // Engine: two detuned oscillators through a low-pass filter
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 1.2;
      const eg = ctx.createGain();
      eg.gain.value = 0.0;
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 60;
      const o2 = ctx.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 30;
      const o2g = ctx.createGain();
      o2g.gain.value = 0.35;
      o1.connect(filter);
      o2.connect(o2g).connect(filter);
      filter.connect(eg).connect(master);
      o1.start();
      o2.start();
      this.engineOsc = o1;
      this.engineOsc2 = o2;
      this.engineGain = eg;
      this.engineFilter = filter;

      // Drift: looping noise through a band-pass
      const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = nb.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = nb;
      const noise = ctx.createBufferSource();
      noise.buffer = nb;
      noise.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100;
      bp.Q.value = 0.6;
      const dg = ctx.createGain();
      dg.gain.value = 0;
      noise.connect(bp).connect(dg).connect(master);
      noise.start();
      this.driftGain = dg;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  setEngine(ratio: number, load: number, running: boolean) {
    if (!this.ctx || !this.engineOsc || !this.engineOsc2 || !this.engineGain || !this.engineFilter) return;
    const t = this.ctx.currentTime;
    const r = Math.max(0, Math.min(1.3, ratio));
    const f = 50 + r * 105 + load * 15;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(500 + r * 1400, t, 0.1);
    const g = running ? 0.045 + r * 0.05 + load * 0.02 : 0.02;
    this.engineGain.gain.setTargetAtTime(g, t, 0.1);
  }

  setDrift(intensity: number) {
    if (!this.ctx || !this.driftGain) return;
    this.driftGain.gain.setTargetAtTime(Math.min(1, intensity) * 0.22, this.ctx.currentTime, 0.08);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.25, when = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  beep(final: boolean) {
    this.tone(final ? 988 : 660, final ? 0.6 : 0.16, 'square', 0.15);
  }

  boost() {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.Q.value = 1.5;
    hp.frequency.setValueAtTime(300, t);
    hp.frequency.exponentialRampToValueAtTime(3200, t + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.8);
    this.tone(520, 0.35, 'triangle', 0.12);
    this.tone(780, 0.35, 'triangle', 0.1, 0.05);
  }

  /** Rising jingle when the manual boost meter becomes full. */
  boostReady() {
    this.tone(660, 0.12, 'square', 0.1);
    this.tone(880, 0.12, 'square', 0.1, 0.09);
    this.tone(1320, 0.2, 'square', 0.1, 0.18);
  }

  hit(strength: number) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    if (now - this.lastHit < 0.15) return;
    this.lastHit = now;
    const v = Math.min(0.5, 0.15 + strength * 0.02);
    this.tone(110, 0.25, 'triangle', v);
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(v, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      src.connect(lp).connect(g).connect(this.master);
      src.start(now);
      src.stop(now + 0.2);
    }
  }

  score(combo: number) {
    const base = 440 + Math.min(5, combo) * 80;
    this.tone(base, 0.12, 'sine', 0.12);
    this.tone(base * 1.5, 0.18, 'sine', 0.1, 0.07);
  }

  lap() {
    this.tone(660, 0.12, 'square', 0.1);
    this.tone(880, 0.2, 'square', 0.1, 0.1);
  }

  zoneEnter() {
    this.tone(523, 0.1, 'square', 0.09);
    this.tone(784, 0.16, 'square', 0.09, 0.08);
  }

  zoneClear(stars: number) {
    const notes = stars >= 3 ? [659, 784, 1047, 1319] : stars === 2 ? [587, 740, 988] : stars === 1 ? [523, 659] : [330];
    notes.forEach((n, i) => this.tone(n, 0.18, 'triangle', 0.14, i * 0.08));
  }

  /** Short "chip" tick used while a score counts up. */
  tick(pitch = 1) {
    this.tone(900 * pitch, 0.04, 'square', 0.05);
  }

  finish(won: boolean) {
    const notes = won ? [523, 659, 784, 1047] : [392, 440, 494, 523];
    notes.forEach((n, i) => this.tone(n, 0.35, 'triangle', 0.18, i * 0.14));
  }

  dispose() {
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }
}
