import * as THREE from 'three'

// =============================================================
//  SAKURA SOUNDBOX — RB26DETT + turbo + BOV + backfire (WebAudio)
//  Full sintetis, tanpa file audio. Start setelah gesture user.
// =============================================================

export interface SoundFrame {
  speed: number // m/s
  maxSpeed: number
  throttle: number
  brake: number
  drifting: boolean
  driftAngle: number
  escTurbo: number // 0-100
}

export class RCSoundBox {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engOsc1: OscillatorNode | null = null
  private engOsc2: OscillatorNode | null = null
  private engSub: OscillatorNode | null = null
  private engFilter: BiquadFilterNode | null = null
  private engGain: GainNode | null = null
  private turboSrc: AudioBufferSourceNode | null = null
  private turboFilter: BiquadFilterNode | null = null
  private turboGain: GainNode | null = null
  private skidSrc: AudioBufferSourceNode | null = null
  private skidFilter: BiquadFilterNode | null = null
  private skidGain: GainNode | null = null
  enabled = true
  private started = false
  private prevThrottle = 0
  private prevRpm = 0
  private backfireT = 0

  /** panggil dari klik / keydown pertama */
  ensure() {
    if (this.started) {
      if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {})
      return
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AC()
    } catch {
      return
    }
    const ctx = this.ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.enabled ? 0.5 : 0
    this.master.connect(ctx.destination)

    // --- mesin: 2 saw detune + sub square ---
    this.engFilter = ctx.createBiquadFilter()
    this.engFilter.type = 'lowpass'
    this.engFilter.frequency.value = 700
    this.engFilter.Q.value = 2.5
    this.engGain = ctx.createGain()
    this.engGain.gain.value = 0.0
    this.engFilter.connect(this.engGain)
    this.engGain.connect(this.master)
    this.engOsc1 = ctx.createOscillator()
    this.engOsc1.type = 'sawtooth'
    this.engOsc1.frequency.value = 55
    this.engOsc2 = ctx.createOscillator()
    this.engOsc2.type = 'sawtooth'
    this.engOsc2.frequency.value = 55 * 1.007
    this.engSub = ctx.createOscillator()
    this.engSub.type = 'square'
    this.engSub.frequency.value = 28
    const subG = ctx.createGain()
    subG.gain.value = 0.4
    this.engOsc1.connect(this.engFilter)
    this.engOsc2.connect(this.engFilter)
    this.engSub.connect(subG)
    subG.connect(this.engFilter)
    this.engOsc1.start()
    this.engOsc2.start()
    this.engSub.start()

    // --- noise buffer reusable ---
    const len = ctx.sampleRate * 1.5
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1

    // turbo spool: bandpass 3-6kHz
    this.turboSrc = ctx.createBufferSource()
    this.turboSrc.buffer = buf
    this.turboSrc.loop = true
    this.turboFilter = ctx.createBiquadFilter()
    this.turboFilter.type = 'bandpass'
    this.turboFilter.frequency.value = 4200
    this.turboFilter.Q.value = 1.4
    this.turboGain = ctx.createGain()
    this.turboGain.gain.value = 0
    this.turboSrc.connect(this.turboFilter)
    this.turboFilter.connect(this.turboGain)
    this.turboGain.connect(this.master)
    this.turboSrc.start()

    // skid ban saat drift: bandpass ~900Hz
    this.skidSrc = ctx.createBufferSource()
    this.skidSrc.buffer = buf
    this.skidSrc.loop = true
    this.skidSrc.playbackRate.value = 0.7
    this.skidFilter = ctx.createBiquadFilter()
    this.skidFilter.type = 'bandpass'
    this.skidFilter.frequency.value = 950
    this.skidFilter.Q.value = 2.2
    this.skidGain = ctx.createGain()
    this.skidGain.gain.value = 0
    this.skidSrc.connect(this.skidFilter)
    this.skidFilter.connect(this.skidGain)
    this.skidGain.connect(this.master)
    this.skidSrc.start()

    this.started = true
  }

  setEnabled(on: boolean) {
    this.enabled = on
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.05)
    }
  }

  private burst(time: number, freq: number, q: number, gain: number, dur: number, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const len = Math.floor(ctx.sampleRate * dur)
    const b = ctx.createBuffer(1, len, ctx.sampleRate)
    const ch = b.getChannelData(0)
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = b
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.value = gain
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(time)
  }

  /** stututu BOV: 6 cipratan cepat saat lepas gas dari boost */
  bov() {
    if (!this.ctx || !this.started || !this.enabled) return
    const t0 = this.ctx.currentTime + 0.01
    for (let k = 0; k < 6; k++) {
      this.burst(t0 + k * 0.045, 3800 + Math.random() * 1200, 3.5, 0.32, 0.05, 'highpass')
    }
  }

  /** letupan backfire saat deselerasi */
  backfire(big = false) {
    if (!this.ctx || !this.started || !this.enabled) return
    const t = this.ctx.currentTime + 0.01
    this.burst(t, big ? 300 : 480, 1.2, big ? 0.5 : 0.28, big ? 0.16 : 0.09, 'lowpass')
  }

  update(f: SoundFrame, dt: number) {
    if (!this.ctx || !this.started || !this.enabled) {
      this.prevThrottle = f.throttle
      return
    }
    const ctx = this.ctx
    const t = ctx.currentTime
    const rpm01 = THREE.MathUtils.clamp((f.speed / f.maxSpeed) * 0.72 + f.throttle * 0.28, 0, 1)
    // idle tidak pernah mati total (soundbox RC selalu bunyi)
    const idleAlive = 0.05
    const load = Math.max(idleAlive, rpm01)

    // --- mesin RB26: freq naik agresif + filter buka ---
    const freq = 52 + load * 165 + f.throttle * 26
    this.engOsc1?.frequency.setTargetAtTime(freq, t, 0.06)
    this.engOsc2?.frequency.setTargetAtTime(freq * 1.008 + 2, t, 0.06)
    this.engSub?.frequency.setTargetAtTime(freq * 0.5, t, 0.06)
    this.engFilter?.frequency.setTargetAtTime(420 + load * 2600 + f.throttle * 900, t, 0.08)
    this.engGain?.gain.setTargetAtTime(0.05 + load * 0.11 + f.throttle * 0.03, t, 0.09)

    // --- turbo spool: hidup di gas + rpm menengah-atas, makin kencang dgn ESC turbo ---
    const turboAmt = (f.escTurbo / 100) * 0.7 + 0.3
    const spool = f.throttle * THREE.MathUtils.clamp((rpm01 - 0.3) / 0.7, 0, 1) * turboAmt
    this.turboGain?.gain.setTargetAtTime(spool * 0.11, t, 0.12)
    this.turboFilter?.frequency.setTargetAtTime(3200 + rpm01 * 3200, t, 0.1)

    // --- skid ---
    const skid = f.drifting ? THREE.MathUtils.clamp(f.driftAngle / 38, 0, 1) * 0.5 : 0
    this.skidGain?.gain.setTargetAtTime(skid * 0.16, t, 0.08)

    // --- BOV: lepas gas mendadak dari boost tinggi ---
    if (this.prevThrottle > 0.65 && f.throttle < 0.15 && this.prevRpm > 0.55) {
      this.bov()
    }
    // --- backfire: deselerasi / engine-brake dari rpm tinggi, acak ---
    this.backfireT -= dt
    const decel = this.prevRpm - rpm01
    if (decel > 0.02 && rpm01 > 0.45 && this.backfireT <= 0 && Math.random() < 0.5) {
      this.backfire(Math.random() < 0.25)
      this.backfireT = 0.18 + Math.random() * 0.4
    }
    this.prevThrottle = f.throttle
    this.prevRpm = rpm01
  }

  dispose() {
    try {
      this.engOsc1?.stop()
      this.engOsc2?.stop()
      this.engSub?.stop()
      this.turboSrc?.stop()
      this.skidSrc?.stop()
      this.ctx?.close()
    } catch {
      /* abaikan */
    }
    this.started = false
    this.ctx = null
  }
}
