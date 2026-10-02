import { SoundMode } from '../types/rcDrift';

class RCSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // RB26DETT Inline-6 Scale Sound Box Oscillators
  private oscSub: OscillatorNode | null = null;
  private oscInline6: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private engineLfo: OscillatorNode | null = null;
  private engineLfoGain: GainNode | null = null;
  private exhaustFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Silky Turbo Spool / Spur Gear Layer
  private turboOsc: OscillatorNode | null = null;
  private turboFilter: BiquadFilterNode | null = null;
  private turboGain: GainNode | null = null;

  // Indoor Hall Tire Glide Layer (Warm Pink Noise)
  private slideNoiseGain: GainNode | null = null;
  private slideFilter: BiquadFilterNode | null = null;

  private isMuted: boolean = false;
  private isInitialized: boolean = false;
  private soundMode: SoundMode = 'rb26_soundbox';
  private prevRpm: number = 6500;
  private prevTurbo: boolean = false;
  private lastFlutterTime: number = 0;

  private makeWarmSaturationCurve(amount = 18): Float32Array<ArrayBuffer> {
    const k = amount;
    const nSamples = 1024;
    const curve = new Float32Array(new ArrayBuffer(nSamples * 4));
    const deg = Math.PI / 180;
    for (let i = 0; i < nSamples; ++i) {
      const x = (i * 2) / nSamples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  public init() {
    if (this.isInitialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;
      this.masterGain.connect(this.ctx.destination);

      // --- 1. WARM RB26DETT INLINE-6 ENGINE SYNTHESIS ---
      this.oscSub = this.ctx.createOscillator();
      this.oscInline6 = this.ctx.createOscillator();
      this.oscHarmonic = this.ctx.createOscillator();

      this.oscSub.type = 'sine';
      this.oscInline6.type = 'sawtooth';
      this.oscHarmonic.type = 'triangle';
      // Slight detune for natural acoustic multi-cylinder chorus
      this.oscHarmonic.detune.value = 6;

      // Subtle mechanical RPM pulse LFO (exhaust burble)
      this.engineLfo = this.ctx.createOscillator();
      this.engineLfo.type = 'sine';
      this.engineLfo.frequency.value = 14;
      this.engineLfoGain = this.ctx.createGain();
      this.engineLfoGain.gain.value = 2.2;
      this.engineLfo.connect(this.engineLfoGain);
      this.engineLfoGain.connect(this.oscInline6.frequency);

      // Mix individual oscillator levels so bass & warm mids dominate
      const subMix = this.ctx.createGain();
      subMix.gain.value = 0.55;
      const inline6Mix = this.ctx.createGain();
      inline6Mix.gain.value = 0.32;
      const harmMix = this.ctx.createGain();
      harmMix.gain.value = 0.22;

      this.oscSub.connect(subMix);
      this.oscInline6.connect(inline6Mix);
      this.oscHarmonic.connect(harmMix);

      // Soft tube waveshaper for warm muffler resonance
      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this.makeWarmSaturationCurve(14);
      shaper.oversample = '2x';

      // Lowpass filter removes all harsh buzzing frequencies!
      this.exhaustFilter = this.ctx.createBiquadFilter();
      this.exhaustFilter.type = 'lowpass';
      this.exhaustFilter.frequency.value = 260;
      this.exhaustFilter.Q.value = 1.6;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;

      subMix.connect(shaper);
      inline6Mix.connect(shaper);
      harmMix.connect(shaper);
      shaper.connect(this.exhaustFilter);
      this.exhaustFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.oscSub.start();
      this.oscInline6.start();
      this.oscHarmonic.start();
      this.engineLfo.start();

      // --- 2. SILKY TWIN-TURBO SPOOL / RC SPUR GEAR WHISTLE ---
      this.turboOsc = this.ctx.createOscillator();
      this.turboOsc.type = 'sine';
      this.turboFilter = this.ctx.createBiquadFilter();
      this.turboFilter.type = 'bandpass';
      this.turboFilter.frequency.value = 750;
      this.turboFilter.Q.value = 1.2;

      this.turboGain = this.ctx.createGain();
      this.turboGain.gain.value = 0.0;

      this.turboOsc.connect(this.turboFilter);
      this.turboFilter.connect(this.turboGain);
      this.turboGain.connect(this.masterGain);
      this.turboOsc.start();

      // --- 3. INDOOR AULA FLOOR TIRE GLIDE (PINK NOISE) ---
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      // Generate smooth Paul Kellet pink noise instead of harsh white noise
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
        b6 = white * 0.115926;
      }

      const pinkNoise = this.ctx.createBufferSource();
      pinkNoise.buffer = noiseBuffer;
      pinkNoise.loop = true;

      this.slideFilter = this.ctx.createBiquadFilter();
      this.slideFilter.type = 'bandpass';
      this.slideFilter.frequency.value = 480;
      this.slideFilter.Q.value = 1.4;

      this.slideNoiseGain = this.ctx.createGain();
      this.slideNoiseGain.gain.value = 0.0;

      pinkNoise.connect(this.slideFilter);
      this.slideFilter.connect(this.slideNoiseGain);
      this.slideNoiseGain.connect(this.masterGain);
      pinkNoise.start();

      this.isInitialized = true;
    } catch {
      // Ignore if Web Audio is blocked
    }
  }

  public setSoundMode(mode: SoundMode) {
    this.soundMode = mode;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.isMuted && this.ctx && this.engineGain && this.turboGain && this.slideNoiseGain) {
      const now = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(0, now, 0.04);
      this.turboGain.gain.setTargetAtTime(0, now, 0.04);
      this.slideNoiseGain.gain.setTargetAtTime(0, now, 0.04);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public updateTelemetrySound(
    rpm: number,
    driftAngleDeg: number,
    speedKmh: number,
    turboActive: boolean
  ) {
    if (
      !this.isInitialized ||
      !this.ctx ||
      !this.oscSub ||
      !this.oscInline6 ||
      !this.oscHarmonic ||
      !this.exhaustFilter ||
      !this.engineGain ||
      !this.turboOsc ||
      !this.turboFilter ||
      !this.turboGain ||
      !this.slideNoiseGain ||
      !this.slideFilter ||
      !this.engineLfo
    ) {
      return;
    }

    if (this.isMuted || this.ctx.state !== 'running') {
      const now = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(0, now, 0.05);
      this.turboGain.gain.setTargetAtTime(0, now, 0.05);
      this.slideNoiseGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    const now = this.ctx.currentTime;
    const normRpm = Math.min(1, Math.max(0, (rpm - 5000) / 52000));

    // Detect sudden throttle drop from high RPM to trigger Skyline RB26 Turbo Flutter ("Stu-tu-tu")
    const rpmDrop = this.prevRpm - rpm;
    if (
      (rpmDrop > 3800 && this.prevRpm > 28000) ||
      (this.prevTurbo && !turboActive && rpm > 25000)
    ) {
      if (performance.now() - this.lastFlutterTime > 650) {
        this.playTurboFlutter();
        this.lastFlutterTime = performance.now();
      }
    }
    this.prevRpm = rpm;
    this.prevTurbo = turboActive;

    if (this.soundMode === 'rb26_soundbox') {
      // RB26DETT Inline-6 Scale Sound Module:
      // Smooth low fundamental (46 Hz idle -> 175 Hz high-RPM scream)
      const baseFreq = 46 + Math.pow(normRpm, 1.15) * 128 + (turboActive ? 14 : 0);

      this.oscSub.frequency.setTargetAtTime(baseFreq, now, 0.035);
      // 6-cylinder firing cadence (1.5x & 3x harmonics)
      this.oscInline6.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.035);
      this.oscHarmonic.frequency.setTargetAtTime(baseFreq * 3.0, now, 0.035);
      this.engineLfo.frequency.setTargetAtTime(10 + normRpm * 28, now, 0.05);

      // Open up the warm exhaust filter as RPM climbs, never exceeding 640Hz so it stays deep and throaty
      const cutoff = 175 + normRpm * 390 + (turboActive ? 85 : 0);
      this.exhaustFilter.frequency.setTargetAtTime(cutoff, now, 0.04);

      const targetEngineGain = 0.055 + normRpm * 0.075 + (turboActive ? 0.02 : 0);
      this.engineGain.gain.setTargetAtTime(targetEngineGain, now, 0.04);

      // Gentle Twin-Turbo compressor spool whistle in the background
      const spoolFreq = 480 + normRpm * 540 + (turboActive ? 160 : 0);
      this.turboOsc.frequency.setTargetAtTime(spoolFreq, now, 0.05);
      this.turboFilter.frequency.setTargetAtTime(spoolFreq, now, 0.05);
      const targetTurboGain =
        normRpm > 0.25 ? (normRpm - 0.25) * 0.014 + (turboActive ? 0.009 : 0) : 0;
      this.turboGain.gain.setTargetAtTime(targetTurboGain, now, 0.05);
    } else {
      // Silky Geared RC Brushless Mode (Smooth, warm low-mid gear hum, zero harshness)
      const gearFreq = 95 + normRpm * 260 + (turboActive ? 45 : 0);
      this.oscSub.frequency.setTargetAtTime(gearFreq, now, 0.03);
      this.oscInline6.frequency.setTargetAtTime(gearFreq * 2.0, now, 0.03);
      this.oscHarmonic.frequency.setTargetAtTime(gearFreq * 2.5, now, 0.03);

      this.exhaustFilter.frequency.setTargetAtTime(240 + normRpm * 320, now, 0.04);
      this.engineGain.gain.setTargetAtTime(0.035 + normRpm * 0.045, now, 0.04);

      const motorWhirr = 360 + normRpm * 480;
      this.turboOsc.frequency.setTargetAtTime(motorWhirr, now, 0.04);
      this.turboFilter.frequency.setTargetAtTime(motorWhirr, now, 0.04);
      this.turboGain.gain.setTargetAtTime(0.008 + normRpm * 0.015, now, 0.04);
    }

    // Smooth Indoor Hall Tire Scrub (Gentle low-mid rubber/HDPE glide)
    const slideFactor =
      Math.min(1, Math.max(0, (driftAngleDeg - 10) / 55)) *
      Math.min(1, speedKmh / 14);
    this.slideFilter.frequency.setTargetAtTime(360 + slideFactor * 340, now, 0.05);
    this.slideNoiseGain.gain.setTargetAtTime(slideFactor * 0.045, now, 0.05);
  }

  // Iconic Nissan Skyline RB26 "Stu-tu-tu" Turbo Compressor Flutter
  public playTurboFlutter() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(920, now);
    flt.Q.value = 3.0;

    // 4 rapid "stu-tu-tu-tu" flutters descending in pitch
    const pulses = [0, 0.065, 0.13, 0.195];
    gain.gain.setValueAtTime(0.001, now);

    pulses.forEach((offset, idx) => {
      const pitch = 1050 - idx * 130;
      osc.frequency.setValueAtTime(pitch, now + offset);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.78, now + offset + 0.055);

      const amp = 0.038 * Math.pow(0.75, idx);
      gain.gain.setValueAtTime(amp, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.002, now + offset + 0.058);
    });

    osc.connect(flt);
    flt.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.28);
  }

  public playClippingZoneChime(perfect: boolean = false) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const f1 = perfect ? 587.33 : 523.25; // D5 / C5
    const f2 = perfect ? 880.0 : 783.99;  // A5 / G5

    osc.frequency.setValueAtTime(f1, now);
    osc.frequency.exponentialRampToValueAtTime(f2, now + 0.08);

    gain.gain.setValueAtTime(0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playTransitionWhoosh() {
    if (this.isMuted) return;
    this.playTurboFlutter();
  }

  // Authentic Lexan Polycarbonate Body Shell & Bumper Clash Sound
  public playCollisionSound(intensity: number = 0.6) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    const clamped = Math.min(1.0, Math.max(0.2, intensity));

    // Low polycarbonate body thud oscillator
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(145 + clamped * 55, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);

    gain.gain.setValueAtTime(0.14 * clamped, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }
}

export const rcSound = new RCSoundEngine();
