export class CarAudio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  osc1!: OscillatorNode;
  osc2!: OscillatorNode;
  osc3!: OscillatorNode;
  osc3Gain!: GainNode;
  filter!: BiquadFilterNode;
  engGain!: GainNode;
  screechGain!: GainNode;
  screechFilter!: BiquadFilterNode;
  turboOsc!: OscillatorNode;
  turboGain!: GainNode;
  lfo!: OscillatorNode;
  lfoGain!: GainNode;
  noiseBuf: AudioBuffer | null = null;
  muted = false;
  rc = false; // true = sound box RB26DETT (RC Drift)

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.35;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.filter.Q.value = 3;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0.25;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc3 = ctx.createOscillator();
    this.osc3.type = 'sawtooth';
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.osc3Gain = ctx.createGain();
    this.osc3Gain.gain.value = 0;
    this.osc1.connect(this.filter);
    this.osc2.connect(g2).connect(this.filter);
    this.osc3.connect(this.osc3Gain).connect(this.filter);
    this.filter.connect(this.engGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();
    this.osc3.start();

    // idle "lope" khas RB26: modulasi volume lambat saat RPM rendah
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 7;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain).connect(this.engGain.gain);
    this.lfo.start();

    // desis turbo (spool whistle)
    this.turboOsc = ctx.createOscillator();
    this.turboOsc.type = 'sine';
    this.turboOsc.frequency.value = 1000;
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turboOsc.connect(this.turboGain).connect(this.master);
    this.turboOsc.start();

    // noise: decit ban, BOV, backfire
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.screechFilter = ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.value = 1400;
    this.screechFilter.Q.value = 6;
    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0;
    src.connect(this.screechFilter).connect(this.screechGain).connect(this.master);
    src.start();
  }

  setRc(on: boolean) {
    this.rc = on;
  }

  update(rpm: number, throttle: number, slip: number, onRoad: boolean, boost = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.rc) {
      // inline-6: 3 pembakaran per putaran
      const f = (rpm / 60) * 3;
      this.osc1.frequency.setTargetAtTime(f, t, 0.03);
      this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
      this.osc3.frequency.setTargetAtTime(f * 2, t, 0.03);
      this.osc3Gain.gain.setTargetAtTime(0.14, t, 0.1);
      this.filter.frequency.setTargetAtTime(420 + throttle * 1500 + rpm * 0.16, t, 0.05);
      this.engGain.gain.setTargetAtTime(0.15 + throttle * 0.14, t, 0.05);
      const idle = Math.max(0, 1 - (rpm - 1000) / 1400);
      this.lfo.frequency.setTargetAtTime(5 + idle * 3, t, 0.2);
      this.lfoGain.gain.setTargetAtTime(0.045 * idle, t, 0.1);
      this.turboOsc.frequency.setTargetAtTime(1000 + boost * 4500, t, 0.05);
      this.turboGain.gain.setTargetAtTime(boost * boost * 0.06, t, 0.06);
    } else {
      const f = (rpm / 60) * 2; // 4-cyl firing frequency
      this.osc1.frequency.setTargetAtTime(f, t, 0.03);
      this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
      this.osc3Gain.gain.setTargetAtTime(0, t, 0.1);
      this.filter.frequency.setTargetAtTime(500 + throttle * 1400 + rpm * 0.12, t, 0.05);
      this.engGain.gain.setTargetAtTime(0.16 + throttle * 0.14, t, 0.05);
      this.lfoGain.gain.setTargetAtTime(0, t, 0.1);
      this.turboGain.gain.setTargetAtTime(0, t, 0.05);
    }
    const s = onRoad ? Math.min(1, Math.max(0, (slip - 2.5) / 6)) : 0;
    this.screechGain.gain.setTargetAtTime(s * 0.22, t, 0.06);
    this.screechFilter.frequency.setTargetAtTime(1200 + s * 600, t, 0.1);
  }

  /** Blow-off valve: desis + "stu-tu-tu" saat gas dilepas dengan boost tinggi. */
  bov(strength: number) {
    if (!this.ctx || !this.noiseBuf || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const pulses = 3;
    for (let i = 0; i < pulses; i++) {
      const t0 = now + i * 0.085;
      const amp = 0.3 * strength * (1 - i * 0.28);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2800 - i * 500;
      bp.Q.value = 1.3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.075);
      src.connect(bp).connect(g).connect(this.master);
      src.start(t0, Math.random());
      src.stop(t0 + 0.1);
    }
  }

  /** Letupan knalpot saat deselerasi di RPM tinggi. */
  backfire() {
    if (!this.ctx || !this.noiseBuf || this.muted) return;
    const ctx = this.ctx;
    const pop = (t0: number, amp: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900 + Math.random() * 500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
      src.connect(lp).connect(g).connect(this.master);
      src.start(t0, Math.random());
      src.stop(t0 + 0.12);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t0);
      o.frequency.exponentialRampToValueAtTime(38, t0 + 0.12);
      const og = ctx.createGain();
      og.gain.setValueAtTime(amp * 0.7, t0);
      og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.13);
      o.connect(og).connect(this.master);
      o.start(t0);
      o.stop(t0 + 0.15);
    };
    const now = ctx.currentTime;
    pop(now, 0.42 + Math.random() * 0.15);
    if (Math.random() < 0.5) pop(now + 0.06 + Math.random() * 0.05, 0.3);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.35, this.ctx.currentTime, 0.05);
  }

  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(0, t, 0.1);
    this.screechGain.gain.setTargetAtTime(0, t, 0.1);
    this.turboGain.gain.setTargetAtTime(0, t, 0.1);
    this.lfoGain.gain.setTargetAtTime(0, t, 0.1);
  }
}
