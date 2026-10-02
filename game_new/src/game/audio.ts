let ctx: AudioContext | null = null
let engineOsc: OscillatorNode | null = null
let engineOsc2: OscillatorNode | null = null
let engineGain: GainNode | null = null
let squealGain: GainNode | null = null
let squealFilter: BiquadFilterNode | null = null
let master: GainNode | null = null
let muted = false

function makeNoise(c: AudioContext) {
  const len = c.sampleRate * 2
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  src.loop = true
  return src
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume()
    return
  }
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
  } catch {
    return
  }
  const c = ctx
  master = c.createGain()
  master.gain.value = muted ? 0 : 0.6
  master.connect(c.destination)

  // Engine: two oscillators + lowpass
  engineGain = c.createGain()
  engineGain.gain.value = 0.0
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 900
  engineOsc = c.createOscillator()
  engineOsc.type = 'sawtooth'
  engineOsc.frequency.value = 60
  engineOsc2 = c.createOscillator()
  engineOsc2.type = 'square'
  engineOsc2.frequency.value = 30
  const g2 = c.createGain()
  g2.gain.value = 0.35
  engineOsc.connect(lp)
  engineOsc2.connect(g2).connect(lp)
  lp.connect(engineGain).connect(master)
  engineOsc.start()
  engineOsc2.start()

  // Tire squeal: filtered noise
  const noise = makeNoise(c)
  squealFilter = c.createBiquadFilter()
  squealFilter.type = 'bandpass'
  squealFilter.frequency.value = 1800
  squealFilter.Q.value = 6
  squealGain = c.createGain()
  squealGain.gain.value = 0
  noise.connect(squealFilter).connect(squealGain).connect(master)
  noise.start()
}

export function updateAudio(speed: number, driftIntensity: number, throttle: number) {
  if (!ctx || !engineOsc || !engineGain || !squealGain || !engineOsc2 || !squealFilter) return
  const t = ctx.currentTime
  const rpm = 55 + speed * 5.5 + throttle * 12
  engineOsc.frequency.setTargetAtTime(rpm, t, 0.05)
  engineOsc2.frequency.setTargetAtTime(rpm / 2, t, 0.05)
  engineGain.gain.setTargetAtTime(0.06 + Math.min(speed / 30, 1) * 0.08, t, 0.1)
  const sq = Math.min(1, driftIntensity) * 0.16
  squealGain.gain.setTargetAtTime(sq, t, 0.08)
  squealFilter.frequency.setTargetAtTime(1400 + driftIntensity * 900 + speed * 15, t, 0.1)
}

export function playBlip(freq = 880, dur = 0.08, vol = 0.25) {
  if (!ctx || !master) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.value = freq
  g.gain.value = vol
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
  o.connect(g).connect(master)
  o.start()
  o.stop(ctx.currentTime + dur)
}

export function playCrash() {
  if (!ctx || !master) return
  const n = makeNoise(ctx)
  const g = ctx.createGain()
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 500
  g.gain.value = 0.5
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
  n.connect(f).connect(g).connect(master)
  n.start()
  n.stop(ctx.currentTime + 0.3)
}

export function setMuted(m: boolean) {
  muted = m
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.05)
}
