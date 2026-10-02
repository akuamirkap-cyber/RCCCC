import { samples, SAMPLES, headingFromTangent, TRACK_WIDTH } from './track'
import type { Vehicle } from './physics'
import { stepVehicle, forwardOf } from './physics'
import type { Tuning } from './tuning'
import { PRESETS } from './tuning'
import type { CarId } from './cars'

export interface Bot extends Vehicle {
  id: number
  name: string
  model: CarId
  color: string
  tuning: Tuning
  // kepribadian
  aggression: number // 0..1 -> seberapa sering handbrake & seberapa cepat masuk tikungan
  lineBias: number // offset lateral favorit (-1..1) * lebar
  skill: number // 0..1 -> presisi steering
  // status AI
  hbTimer: number
  hbCooldown: number
  wobble: number
  wobbleT: number
  // balapan
  lap: number
  lastProgress: number
  progress: number
  finished: boolean
  finishTime: number
}

export const BOT_COUNT = 3
export const bots: Bot[] = []

const BOT_DEFS: { name: string; model: CarId; color: string; aggression: number; lineBias: number; skill: number }[] = [
  { name: 'Kenji', model: 'gtr', color: '#f1f1ee', aggression: 0.85, lineBias: 0.25, skill: 0.85 },
  { name: 'Rara', model: 'yaris', color: '#f5c518', aggression: 0.7, lineBias: -0.3, skill: 0.75 },
  { name: 'Dimas', model: 'gtr', color: '#3b1f66', aggression: 0.95, lineBias: 0.05, skill: 0.65 },
]

export function botDef(i: number) {
  return BOT_DEFS[i % BOT_DEFS.length]
}

function makeBot(i: number): Bot {
  const d = botDef(i)
  const base = PRESETS.master.t
  // variasi tuning tiap bot agar karakter drift beda
  const tuning: Tuning = {
    ...base,
    maxSpeed: base.maxSpeed * (0.86 + d.skill * 0.08 + (i === 0 ? 0.02 : 0)),
    accel: base.accel * (0.9 + d.aggression * 0.08),
    gripDrift: base.gripDrift * (1.1 - d.aggression * 0.25),
    align: base.align * (1.2 - d.aggression * 0.2),
    handbrake: base.handbrake * (0.8 + d.aggression * 0.4),
  }
  return {
    id: i,
    name: d.name,
    model: d.model,
    color: d.color,
    tuning,
    aggression: d.aggression,
    lineBias: d.lineBias,
    skill: d.skill,
    hbTimer: 0,
    hbCooldown: 0,
    wobble: 0,
    wobbleT: 0,
    x: 0,
    z: 0,
    heading: 0,
    vx: 0,
    vz: 0,
    angVel: 0,
    steer: 0,
    throttle: 0,
    handbrake: false,
    speed: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    slip: 0,
    drifting: false,
    onGrass: false,
    lateralAccel: 0,
    prevLateral: 0,
    steerVisual: 0,
    wheelSpin: 0,
    trackIdx: 0,
    lateralOffset: 0,
    crashCooldown: 0,
    shake: 0,
    smokeIntensity: 0,
    braking: false,
    lap: 0,
    lastProgress: 0,
    progress: 0,
    finished: false,
    finishTime: 0,
  }
}

// Slot grid: 0 = paling depan. Pemain pakai slot terakhir (harus nyalip!)
export function gridSlot(slot: number) {
  const idx = (SAMPLES - 6 - slot * 6 + SAMPLES) % SAMPLES
  const s = samples[idx]
  const lateral = slot % 2 === 0 ? -1.9 : 1.9
  return { idx, x: s.x + s.rx * lateral, z: s.z + s.rz * lateral, heading: headingFromTangent(s.tx, s.tz) }
}

export const PLAYER_GRID_SLOT = BOT_COUNT

export function resetBots() {
  bots.length = 0
  for (let i = 0; i < BOT_COUNT; i++) {
    const b = makeBot(i)
    const g = gridSlot(i)
    b.x = g.x
    b.z = g.z
    b.heading = g.heading
    b.trackIdx = g.idx
    b.progress = g.idx / SAMPLES
    b.lastProgress = b.progress
    bots.push(b)
  }
}

// Kurvatur ke depan (rad) dari idx sepanjang `span` sampel
function curvatureAhead(idx: number, from: number, span: number) {
  const a = samples[(idx + from + SAMPLES) % SAMPLES]
  const b = samples[(idx + from + span) % SAMPLES]
  const cross = a.tx * b.tz - a.tz * b.tx
  const dot = a.tx * b.tx + a.tz * b.tz
  return Math.atan2(cross, dot) // bertanda: >0 belok kiri? (tergantung basis) — kita pakai magnitude & tanda relatif
}

export function stepBot(b: Bot, dt: number, active: boolean, raceTime: number, playerProgressTotal: number) {
  // ----- AI steering: pure pursuit dengan lookahead tergantung kecepatan
  const look = Math.round(10 + b.speed * 0.9 * (0.8 + b.skill * 0.4))
  const target = samples[(b.trackIdx + look) % SAMPLES]
  // offset lateral favorit + wobble kecil untuk terlihat "manusiawi"
  b.wobbleT += dt
  if (b.wobbleT > 1.5) {
    b.wobbleT = 0
    b.wobble = (Math.random() - 0.5) * (1 - b.skill) * 2
  }
  const lateral = (b.lineBias + b.wobble * 0.5) * (TRACK_WIDTH / 2 - 1.2)
  const tx = target.x + target.rx * lateral
  const tz = target.z + target.rz * lateral
  const aimHeading = Math.atan2(-(tx - b.x), -(tz - b.z))
  let err = aimHeading - b.heading
  while (err > Math.PI) err -= 2 * Math.PI
  while (err < -Math.PI) err += 2 * Math.PI
  // saat drift, arahkan berdasarkan arah kecepatan agar counter-steer terjadi alami
  let steerTarget = -err * (1.6 + b.skill * 1.2)
  if (b.drifting && b.speed > 6) {
    const velHeading = Math.atan2(-b.vx, -b.vz)
    let verr = aimHeading - velHeading
    while (verr > Math.PI) verr -= 2 * Math.PI
    while (verr < -Math.PI) verr += 2 * Math.PI
    steerTarget = -(verr * 2.2 + err * 0.6)
  }
  steerTarget = Math.max(-1, Math.min(1, steerTarget))

  // ----- Kurvatur ke depan -> keputusan drift & throttle
  const curvNear = Math.abs(curvatureAhead(b.trackIdx, 4, 26))
  const curvFar = Math.abs(curvatureAhead(b.trackIdx, 20, 40))
  const cornerAhead = Math.max(curvNear, curvFar * 0.8)

  // Throttle: angkat gas saat tikungan tajam dan sedang cepat
  const KMH = 8.4
  const topSpd = b.tuning.maxSpeed / KMH
  const speedRatio = b.speed / topSpd
  let throttle = 1
  if (cornerAhead > 0.6 && speedRatio > 0.72 - b.aggression * 0.2) throttle = 0.15
  else if (cornerAhead > 0.35 && speedRatio > 0.85) throttle = 0.5

  // Rem tangan: kick drift saat masuk tikungan
  b.hbCooldown -= dt
  if (b.hbTimer > 0) {
    b.hbTimer -= dt
  } else if (
    b.hbCooldown <= 0 &&
    curvNear > 0.32 - b.aggression * 0.1 &&
    b.speed > 9 &&
    Math.abs(err) > 0.12 &&
    !b.onGrass
  ) {
    b.hbTimer = 0.18 + b.aggression * 0.22
    b.hbCooldown = 0.9 + (1 - b.aggression) * 0.8
  }
  // batalkan handbrake jika sudah terlalu miring (hindari spin)
  if (Math.abs(b.slip) > 0.85) b.hbTimer = 0

  // Rubber banding halus: bot yang jauh di depan pemain sedikit menahan diri, yang tertinggal dapat dorongan
  const myTotal = b.lap + b.progress
  const gap = myTotal - playerProgressTotal // + berarti bot di depan
  const rb = Math.max(-0.16, Math.min(0.08, -gap * 0.5))
  const tuning: Tuning = rb !== 0 ? { ...b.tuning, maxSpeed: b.tuning.maxSpeed * (1 + rb) } : b.tuning

  b.throttle = active ? throttle : 0
  b.handbrake = active && b.hbTimer > 0
  const res = stepVehicle(b, tuning, dt, active ? steerTarget : 0, active)

  // Jika macet nempel tembok / berhenti terlalu lama -> mundur sedikit (recovery)
  if (active && b.speed < 1.5 && raceTime > 3) {
    b.hbTimer = 0
    const f = forwardOf(b)
    b.vx += f.x * -2.5 * dt
    b.vz += f.z * -2.5 * dt
  }

  // ----- Lap counting
  const p = b.trackIdx / SAMPLES
  if (b.lastProgress > 0.9 && p < 0.1) b.lap++
  else if (b.lastProgress < 0.1 && p > 0.9) b.lap = Math.max(0, b.lap - 1)
  b.lastProgress = p
  b.progress = p
  return res
}

// siapkan bot sejak awal (tampil di menu sebagai grid)
resetBots()
