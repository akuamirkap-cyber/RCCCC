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

  // === REAL BRUSHLESS HD (super realistic RC drift car) ===
  // Bus + saturasi + kompresor + convolution reverb aula
  private realBus: GainNode | null = null;
  private realDry: GainNode | null = null;
  private realWet: GainNode | null = null;
  // Motor whine (electrical frequency, 4-pole sensored) 3 harmonik + jitter LFO
  private motorOsc1: OscillatorNode | null = null;
  private motorOsc2: OscillatorNode | null = null;
  private motorOsc3: OscillatorNode | null = null;
  private motorJitter: OscillatorNode | null = null;
  private motorJitterGain: GainNode | null = null;
  private motorGain: GainNode | null = null;
  private motorPresence: BiquadFilterNode | null = null;
  // Spur/pinion gear mesh (sawtooth + resonansi chassis)
  private gearOsc: OscillatorNode | null = null;
  private gearFilter: BiquadFilterNode | null = null;
  private gearGain: GainNode | null = null;
  // ESC drag-brake / cogging buzz saat lepas gas
  private escOsc: OscillatorNode | null = null;
  private escFilter: BiquadFilterNode | null = null;
  private escGain: GainNode | null = null;
  // Belt / bearing hiss (noise highband) + road rumble (noise lowband)
  private beltFilter: BiquadFilterNode | null = null;
  private beltGain: GainNode | null = null;
  private rumbleFilter: BiquadFilterNode | null = null;
  private rumbleGain: GainNode | null = null;
  // Tire scrub HD (dua band: body 600-900 Hz + squeal 2.4-4.5 kHz)
  private scrubLoFilter: BiquadFilterNode | null = null;
  private scrubLoGain: GainNode | null = null;
  private scrubHiFilter: BiquadFilterNode | null = null;
  private scrubHiGain: GainNode | null = null;
  private realLoad: number = 0; // beban motor (0..1) smoothing

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

  /** Impulse response sintetis aula olahraga: early reflections + tail 1.7 s, HF damping bertahap */
  private makeHallImpulse(ctx: AudioContext, seconds = 1.7): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    const early = [0.011, 0.019, 0.027, 0.041, 0.058, 0.074, 0.092];
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / rate;
        const env = Math.exp(-3.4 * t) * (1 - Math.exp(-t * 90));
        const white = Math.random() * 2 - 1;
        // Damping HF makin kuat seiring waktu (udara + panel akustik)
        const k = 0.18 + Math.min(0.78, t * 0.42);
        lp = lp + (white - lp) * (1 - k);
        d[i] = lp * env * 0.55;
      }
      for (const et of early) {
        const idx = Math.floor((et + (ch ? 0.0021 : 0)) * rate);
        if (idx < len) d[idx] += (0.5 - et * 3.6) * (ch ? 0.9 : 1.0);
      }
    }
    return buf;
  }

  private buildRealBrushlessGraph(ctx: AudioContext, master: GainNode, noiseBuffer: AudioBuffer) {
    // --- Bus: saturasi lembut -> kompresor -> dry/wet reverb ---
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.makeWarmSaturationCurve(6);
    shaper.oversample = '2x';
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 14;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;

    this.realBus = ctx.createGain();
    this.realBus.gain.value = 1.0;
    this.realBus.connect(shaper);
    shaper.connect(comp);

    this.realDry = ctx.createGain();
    this.realDry.gain.value = 0.86;
    comp.connect(this.realDry);
    this.realDry.connect(master);

    const conv = ctx.createConvolver();
    conv.buffer = this.makeHallImpulse(ctx);
    conv.normalize = true;
    this.realWet = ctx.createGain();
    this.realWet.gain.value = 0.2;
    comp.connect(conv);
    conv.connect(this.realWet);
    this.realWet.connect(master);

    // --- Motor whine: fundamental listrik + 2x + 3x, jitter halus ---
    this.motorOsc1 = ctx.createOscillator();
    this.motorOsc2 = ctx.createOscillator();
    this.motorOsc3 = ctx.createOscillator();
    this.motorOsc1.type = 'sine';
    this.motorOsc2.type = 'sine';
    this.motorOsc3.type = 'triangle';
    this.motorOsc2.detune.value = 4;
    this.motorOsc3.detune.value = -5;
    const m1 = ctx.createGain();
    m1.gain.value = 0.62;
    const m2 = ctx.createGain();
    m2.gain.value = 0.3;
    const m3 = ctx.createGain();
    m3.gain.value = 0.14;
    this.motorOsc1.connect(m1);
    this.motorOsc2.connect(m2);
    this.motorOsc3.connect(m3);

    this.motorJitter = ctx.createOscillator();
    this.motorJitter.type = 'sine';
    this.motorJitter.frequency.value = 7.3;
    this.motorJitterGain = ctx.createGain();
    this.motorJitterGain.gain.value = 3;
    this.motorJitter.connect(this.motorJitterGain);
    this.motorJitterGain.connect(this.motorOsc1.frequency);
    this.motorJitterGain.connect(this.motorOsc2.frequency);

    this.motorPresence = ctx.createBiquadFilter();
    this.motorPresence.type = 'peaking';
    this.motorPresence.frequency.value = 2600;
    this.motorPresence.Q.value = 0.9;
    this.motorPresence.gain.value = 3.5;
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    m1.connect(this.motorPresence);
    m2.connect(this.motorPresence);
    m3.connect(this.motorPresence);
    this.motorPresence.connect(this.motorGain);
    this.motorGain.connect(this.realBus);

    // --- Gear mesh: sawtooth tipis lewat bandpass resonan (spur 48P + pinion) ---
    this.gearOsc = ctx.createOscillator();
    this.gearOsc.type = 'sawtooth';
    this.gearFilter = ctx.createBiquadFilter();
    this.gearFilter.type = 'bandpass';
    this.gearFilter.frequency.value = 1800;
    this.gearFilter.Q.value = 5.5;
    this.gearGain = ctx.createGain();
    this.gearGain.gain.value = 0;
    this.gearOsc.connect(this.gearFilter);
    this.gearFilter.connect(this.gearGain);
    this.gearGain.connect(this.realBus);

    // --- ESC drag brake / cogging buzz ---
    this.escOsc = ctx.createOscillator();
    this.escOsc.type = 'square';
    this.escFilter = ctx.createBiquadFilter();
    this.escFilter.type = 'lowpass';
    this.escFilter.frequency.value = 900;
    this.escFilter.Q.value = 0.8;
    this.escGain = ctx.createGain();
    this.escGain.gain.value = 0;
    this.escOsc.connect(this.escFilter);
    this.escFilter.connect(this.escGain);
    this.escGain.connect(this.realBus);

    // --- Noise layers (satu buffer pink noise dibagi 4 filter) ---
    const mkNoise = () => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      src.loopStart = Math.random() * 1.5;
      src.start();
      return src;
    };
    this.beltFilter = ctx.createBiquadFilter();
    this.beltFilter.type = 'bandpass';
    this.beltFilter.frequency.value = 2600;
    this.beltFilter.Q.value = 0.7;
    this.beltGain = ctx.createGain();
    this.beltGain.gain.value = 0;
    mkNoise().connect(this.beltFilter);
    this.beltFilter.connect(this.beltGain);
    this.beltGain.connect(this.realBus);

    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 140;
    this.rumbleFilter.Q.value = 0.6;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    mkNoise().connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.rumbleGain);
    this.rumbleGain.connect(this.realBus);

    this.scrubLoFilter = ctx.createBiquadFilter();
    this.scrubLoFilter.type = 'bandpass';
    this.scrubLoFilter.frequency.value = 700;
    this.scrubLoFilter.Q.value = 1.1;
    this.scrubLoGain = ctx.createGain();
    this.scrubLoGain.gain.value = 0;
    mkNoise().connect(this.scrubLoFilter);
    this.scrubLoFilter.connect(this.scrubLoGain);
    this.scrubLoGain.connect(this.realBus);

    this.scrubHiFilter = ctx.createBiquadFilter();
    this.scrubHiFilter.type = 'bandpass';
    this.scrubHiFilter.frequency.value = 3200;
    this.scrubHiFilter.Q.value = 2.2;
    this.scrubHiGain = ctx.createGain();
    this.scrubHiGain.gain.value = 0;
    mkNoise().connect(this.scrubHiFilter);
    this.scrubHiFilter.connect(this.scrubHiGain);
    this.scrubHiGain.connect(this.realBus);

    this.motorOsc1.start();
    this.motorOsc2.start();
    this.motorOsc3.start();
    this.motorJitter.start();
    this.gearOsc.start();
    this.escOsc.start();
  }

  /** Redam semua layer mode REAL HD (dipakai saat mute / ganti mode) */
  private fadeRealLayers(now: number, tc = 0.05) {
    const gains = [
      this.motorGain,
      this.gearGain,
      this.escGain,
      this.beltGain,
      this.rumbleGain,
      this.scrubLoGain,
      this.scrubHiGain,
    ];
    for (const g of gains) g?.gain.setTargetAtTime(0, now, tc);
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

      // --- 4. REAL BRUSHLESS HD GRAPH (motor whine + gear mesh + ESC + noise + reverb aula) ---
      this.buildRealBrushlessGraph(this.ctx, this.masterGain, noiseBuffer);

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
      this.fadeRealLayers(now, 0.04);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public updateTelemetrySound(
    rpm: number,
    driftAngleDeg: number,
    speedKmh: number,
    turboActive: boolean,
    throttle01: number = 1,
    braking: boolean = false
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
      this.fadeRealLayers(now, 0.05);
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
      if (performance.now() - this.lastFlutterTime > 650 && this.soundMode !== 'real_brushless_hd') {
        this.playTurboFlutter();
        this.lastFlutterTime = performance.now();
      }
    }
    this.prevRpm = rpm;
    this.prevTurbo = turboActive;

    if (this.soundMode === 'real_brushless_hd') {
      this.updateRealBrushless(now, rpm, normRpm, driftAngleDeg, speedKmh, turboActive, throttle01, braking);
      return;
    }
    // Mode lama aktif -> pastikan layer REAL HD diam
    if (this.motorGain && this.motorGain.gain.value > 0.0005) this.fadeRealLayers(now, 0.04);

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

  /**
   * REAL BRUSHLESS HD — model akustik mobil RC drift 1/10 sensored brushless:
   * - Whine motor = frekuensi listrik (rpm/60 x 2 pasang kutub), 3 harmonik, naik-turun mengikuti rpm
   * - Beban (gas ditekan) menambah level + harmonik atas; lepas gas -> whine meluncur turun + drag brake buzz
   * - Gear mesh spur/pinion beresonansi di 1.2–4.5 kHz, belt/bearing hiss ikut kecepatan
   * - Scrub ban P-tile: body 600–900 Hz + squeal 2.4–4.5 kHz saat sudut drift besar
   * - Semua masuk bus saturasi + kompresor + convolution reverb aula
   */
  private updateRealBrushless(
    now: number,
    rpm: number,
    normRpm: number,
    driftAngleDeg: number,
    speedKmh: number,
    turboActive: boolean,
    throttle01: number,
    braking: boolean
  ) {
    if (
      !this.motorOsc1 || !this.motorOsc2 || !this.motorOsc3 || !this.motorGain || !this.motorPresence ||
      !this.motorJitter || !this.motorJitterGain ||
      !this.gearOsc || !this.gearFilter || !this.gearGain ||
      !this.escOsc || !this.escFilter || !this.escGain ||
      !this.beltFilter || !this.beltGain || !this.rumbleFilter || !this.rumbleGain ||
      !this.scrubLoFilter || !this.scrubLoGain || !this.scrubHiFilter || !this.scrubHiGain ||
      !this.engineGain || !this.turboGain || !this.slideNoiseGain || !this.realWet
    ) {
      return;
    }

    // Layer mode lama diam
    this.engineGain.gain.setTargetAtTime(0, now, 0.04);
    this.turboGain.gain.setTargetAtTime(0, now, 0.04);
    this.slideNoiseGain.gain.setTargetAtTime(0, now, 0.04);

    const thr = Math.min(1, Math.max(0, throttle01));
    const spd01 = Math.min(1, Math.max(0, speedKmh / 110));
    // Beban motor: gas + akselerasi (rpm naik) + drift (ban spin). Smoothing agar tidak klik.
    const rpmRise = Math.min(1, Math.max(0, (rpm - this.prevRpm) / 900));
    const loadTarget = thr * (0.55 + 0.45 * rpmRise) + (turboActive ? 0.15 : 0);
    this.realLoad += (loadTarget - this.realLoad) * 0.18;
    const load = Math.min(1, this.realLoad);

    // Frekuensi listrik 4-pole: rpm/60 * 2 (clamp agar tidak terlalu melengking)
    const elecF = Math.min(2300, Math.max(140, (rpm / 60) * 2));
    // Lepas gas: pitch meluncur lebih lambat (freewheel), gas: respons cepat
    const tcF = thr > 0.5 ? 0.028 : 0.07;
    this.motorOsc1.frequency.setTargetAtTime(elecF, now, tcF);
    this.motorOsc2.frequency.setTargetAtTime(elecF * 2, now, tcF);
    this.motorOsc3.frequency.setTargetAtTime(elecF * 3, now, tcF);
    this.motorJitter.frequency.setTargetAtTime(5 + normRpm * 9, now, 0.1);
    this.motorJitterGain.gain.setTargetAtTime(1.5 + load * 4, now, 0.1);
    // Presence lebih terang saat beban (arus tinggi)
    this.motorPresence.gain.setTargetAtTime(1.5 + load * 5, now, 0.06);
    this.motorPresence.frequency.setTargetAtTime(1800 + normRpm * 1800, now, 0.08);
    const motorLevel =
      0.012 + normRpm * 0.05 + load * (0.03 + normRpm * 0.035) + (turboActive ? 0.012 : 0);
    this.motorGain.gain.setTargetAtTime(motorLevel, now, 0.045);

    // Gear mesh: pitch mengikuti motor, resonansi chassis geser naik
    const gearF = Math.min(4500, 650 + elecF * 1.35);
    this.gearOsc.frequency.setTargetAtTime(elecF * 0.75, now, tcF);
    this.gearFilter.frequency.setTargetAtTime(gearF, now, 0.05);
    this.gearGain.gain.setTargetAtTime(0.003 + normRpm * 0.014 + load * 0.008, now, 0.05);

    // ESC drag brake / cogging: muncul saat lepas gas di kecepatan, atau rem ditekan
    const coast = (1 - thr) * spd01;
    const escLevel = (braking ? 0.03 : 0) + coast * 0.012;
    this.escOsc.frequency.setTargetAtTime(Math.max(60, elecF * 0.25), now, 0.05);
    this.escFilter.frequency.setTargetAtTime(500 + spd01 * 900, now, 0.06);
    this.escGain.gain.setTargetAtTime(escLevel, now, braking ? 0.02 : 0.08);

    // Belt / bearing hiss + rumble lantai
    this.beltFilter.frequency.setTargetAtTime(1900 + spd01 * 2400, now, 0.08);
    this.beltGain.gain.setTargetAtTime(0.004 + spd01 * 0.03, now, 0.08);
    this.rumbleFilter.frequency.setTargetAtTime(90 + spd01 * 120, now, 0.1);
    this.rumbleGain.gain.setTargetAtTime(0.01 + spd01 * 0.08, now, 0.1);

    // Scrub ban HD: dua band
    const slide =
      Math.min(1, Math.max(0, (driftAngleDeg - 8) / 50)) * Math.min(1, speedKmh / 12);
    const squeal = Math.min(1, Math.max(0, (driftAngleDeg - 22) / 45)) * Math.min(1, speedKmh / 25);
    this.scrubLoFilter.frequency.setTargetAtTime(560 + slide * 360, now, 0.05);
    this.scrubLoGain.gain.setTargetAtTime(slide * 0.075, now, 0.05);
    this.scrubHiFilter.frequency.setTargetAtTime(2400 + squeal * 1800 + spd01 * 300, now, 0.05);
    this.scrubHiGain.gain.setTargetAtTime(squeal * 0.035 * (0.6 + load * 0.4), now, 0.05);

    // Reverb aula sedikit lebih basah saat kencang (jauh dari kamera) & drift
    this.realWet.gain.setTargetAtTime(0.16 + spd01 * 0.08 + slide * 0.05, now, 0.2);
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
