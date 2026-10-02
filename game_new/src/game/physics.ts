import { nearestSample, samples, TRACK_WIDTH, CURB_WIDTH, BARRIER_OFFSET } from './track'
import type { Tuning } from './tuning'

export const KMH = 8.4 // konversi unit internal -> km/j tampilan (250 km/j ≈ 29.8 u/s)
export const ACCEL_SCALE = 0.72 // akselerasi tampilan -> internal
const DRAG = 0.35
export const WALL = BARRIER_OFFSET - 1.15
export const CAR_RADIUS = 1.05

// State kendaraan yang dipakai pemain (sim) dan bot
export interface Vehicle {
  x: number
  z: number
  heading: number
  vx: number
  vz: number
  angVel: number
  steer: number
  throttle: number
  handbrake: boolean
  speed: number
  forwardSpeed: number
  lateralSpeed: number
  slip: number
  drifting: boolean
  onGrass: boolean
  lateralAccel: number
  prevLateral: number
  steerVisual: number
  wheelSpin: number
  trackIdx: number
  lateralOffset: number
  crashCooldown: number
  shake: number
  smokeIntensity: number
  braking: boolean
}

export function forwardOf(v: Vehicle) {
  return { x: -Math.sin(v.heading), z: -Math.cos(v.heading) }
}
export function rightOf(v: Vehicle) {
  return { x: Math.cos(v.heading), z: -Math.sin(v.heading) }
}

export interface StepResult {
  crashed: boolean
  impact: number
}

/**
 * Satu langkah fisika arcade drift.
 * Input harus sudah di-set: v.steer (target -1..1, akan dihaluskan), v.throttle (-1..1), v.handbrake.
 * `active` = false -> mobil melambat sendiri (menu / setelah finish).
 */
export function stepVehicle(v: Vehicle, t: Tuning, dt: number, steerTarget: number, active: boolean): StepResult {
  v.steer += (steerTarget - v.steer) * Math.min(1, dt * 12)

  const f = forwardOf(v)
  const r = rightOf(v)

  let fwd = v.vx * f.x + v.vz * f.z
  let lat = v.vx * r.x + v.vz * r.z

  // Drift state (hysteresis)
  const slip = Math.atan2(lat, Math.max(Math.abs(fwd), 0.5))
  v.slip = slip
  const absSlip = Math.abs(slip)
  if (!v.drifting && (absSlip > 0.2 || (v.handbrake && Math.abs(fwd) > 6))) v.drifting = true
  if (v.drifting && absSlip < 0.09 && !v.handbrake) v.drifting = false

  // Grip
  const gripHandbrake = Math.min(t.gripDrift, 1.4 / t.handbrake)
  let grip = v.handbrake ? gripHandbrake : v.drifting ? t.gripDrift : t.gripNormal
  if (v.onGrass) grip *= 0.6

  // Longitudinal
  const MAX_SPEED = t.maxSpeed / KMH
  const maxSpd = v.onGrass ? MAX_SPEED * 0.55 : MAX_SPEED
  if (v.throttle > 0) {
    const accel = t.accel * ACCEL_SCALE * Math.max(0, 1 - Math.max(0, fwd) / maxSpd) * (v.handbrake ? 0.4 : 1)
    fwd += accel * v.throttle * dt
    if (fwd > maxSpd) fwd -= (fwd - maxSpd) * 2 * dt
  } else {
    if (v.throttle < 0) {
      fwd += v.throttle * 18 * dt
      if (fwd < -6) fwd = -6
    }
    fwd -= fwd * DRAG * dt
  }
  if (v.onGrass) fwd -= fwd * 1.4 * dt
  if (v.handbrake) fwd -= fwd * 0.6 * dt
  fwd -= Math.abs(lat) * 0.12 * dt * Math.sign(fwd)
  if (!active) fwd -= fwd * 2 * dt

  // Lateral grip
  lat *= Math.exp(-grip * dt)

  // Yaw
  const spdFactor = Math.min(1, Math.abs(fwd) / 9)
  const driftBoost = v.drifting ? t.driftBoost : 1
  const align = -slip * t.align * spdFactor
  const angTarget = -v.steer * t.turnRate * spdFactor * driftBoost * Math.sign(fwd || 1) + align
  const kick = v.handbrake && Math.abs(fwd) > 6 ? -v.steer * t.handbrake : 0
  v.angVel += (angTarget + kick - v.angVel) * Math.min(1, dt * 7)
  v.heading += v.angVel * dt

  // Recompose pakai basis heading lama (velocity world-space, slip muncul alami)
  v.vx = f.x * fwd + r.x * lat
  v.vz = f.z * fwd + r.z * lat
  v.forwardSpeed = fwd
  v.lateralSpeed = lat
  v.speed = Math.hypot(v.vx, v.vz)
  v.lateralAccel = (lat - v.prevLateral) / Math.max(dt, 1e-4)
  v.prevLateral = lat

  v.x += v.vx * dt
  v.z += v.vz * dt
  v.wheelSpin += fwd * dt * 3.2
  v.steerVisual += (v.steer - v.steerVisual) * Math.min(1, dt * 10)

  // Track relation
  const near = nearestSample(v.x, v.z, v.trackIdx)
  v.trackIdx = near.idx
  v.lateralOffset = near.lateral
  const absOff = Math.abs(near.lateral)
  v.onGrass = absOff > TRACK_WIDTH / 2 + CURB_WIDTH

  // Barrier
  let crashed = false
  let impact = 0
  if (absOff > WALL) {
    const s = samples[near.idx]
    const sign = Math.sign(near.lateral)
    v.x = s.x + s.rx * sign * WALL
    v.z = s.z + s.rz * sign * WALL
    const vn = v.vx * s.rx + v.vz * s.rz
    if (vn * sign > 0) {
      impact = Math.abs(vn)
      v.vx -= s.rx * vn * 1.3
      v.vz -= s.rz * vn * 1.3
      v.vx *= 0.6
      v.vz *= 0.6
      if (impact > 4 && v.crashCooldown <= 0) {
        crashed = true
        v.crashCooldown = 0.6
        v.shake = Math.min(1, impact / 15)
      }
    }
  }
  v.crashCooldown -= dt
  v.shake = Math.max(0, v.shake - dt * 2.5)

  // lampu rem: rem tangan, rem, atau angkat gas saat melaju
  v.braking = v.handbrake || v.throttle < 0 || (v.throttle < 0.5 && v.speed > 4)

  // intensitas asap
  v.smokeIntensity = v.drifting && !v.onGrass ? Math.min(1, (absSlip / 0.7) * Math.min(1, v.speed / 12)) : 0

  return { crashed, impact }
}

/** Tabrakan antar mobil (lingkaran). Mengembalikan kecepatan tumbukan (untuk efek). */
export function resolveCarCollision(a: Vehicle, b: Vehicle, massA = 1, massB = 1): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const d = Math.hypot(dx, dz)
  const minD = CAR_RADIUS * 2
  if (d >= minD || d < 1e-4) return 0
  const nx = dx / d
  const nz = dz / d
  const overlap = minD - d
  const total = massA + massB
  a.x -= nx * overlap * (massB / total)
  a.z -= nz * overlap * (massB / total)
  b.x += nx * overlap * (massA / total)
  b.z += nz * overlap * (massA / total)
  const rvx = b.vx - a.vx
  const rvz = b.vz - a.vz
  const vn = rvx * nx + rvz * nz
  if (vn > 0) return 0 // sudah menjauh
  const e = 0.35
  const j = (-(1 + e) * vn) / (1 / massA + 1 / massB)
  a.vx -= (j / massA) * nx
  a.vz -= (j / massA) * nz
  b.vx += (j / massB) * nx
  b.vz += (j / massB) * nz
  // sedikit putaran saat senggolan
  const spin = 0.6 * Math.abs(vn)
  a.angVel += (Math.random() - 0.5) * spin
  b.angVel += (Math.random() - 0.5) * spin
  return Math.abs(vn)
}
