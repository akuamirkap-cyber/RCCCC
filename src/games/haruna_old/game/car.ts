import * as THREE from 'three'
import { Terrain } from './world'
import { PAL } from './palette'
import { DRIFT_TUNES, TIRES, type DriftModeId, type DriftTune, type RcSetup, DEFAULT_RC_SETUP } from './drift'

export function buildCarMesh(bodyColor = PAL.car, accent = PAL.carDark) {
  const g = new THREE.Group()
  const mat = new THREE.MeshLambertMaterial({ color: bodyColor, flatShading: true })
  const dark = new THREE.MeshLambertMaterial({ color: accent, flatShading: true })
  const glass = new THREE.MeshLambertMaterial({ color: PAL.glass, flatShading: true })

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.52, 4.05), mat)
  body.position.y = 0.55
  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.26, 3.85), dark)
  lower.position.y = 0.3
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.48, 1.85), mat)
  cabin.position.set(0, 1.03, -0.15)
  const wind = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.36, 0.14), glass)
  wind.position.set(0, 1.02, 0.78)
  wind.rotation.x = -0.32
  const rear = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.34, 0.12), glass)
  rear.position.set(0, 1.02, -1.06)
  rear.rotation.x = 0.3
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.09, 0.4), dark)
  wing.position.set(0, 1.12, -1.95)
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.3), dark)
  wingL.position.set(-0.6, 0.96, -1.92)
  const wingR = wingL.clone()
  wingR.position.x = 0.6
  const lightL = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.16, 0.08),
    new THREE.MeshBasicMaterial({ color: PAL.headlight, toneMapped: false }),
  )
  lightL.position.set(-0.52, 0.62, 2.03)
  const lightR = lightL.clone()
  lightR.position.x = 0.52

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10)
  wheelGeo.rotateZ(Math.PI / 2)
  const wheelMat = new THREE.MeshLambertMaterial({ color: '#1c1e22', flatShading: true })
  const wheels: THREE.Mesh[] = []
  for (const [x, z] of [
    [-0.82, 1.28],
    [0.82, 1.28],
    [-0.84, -1.34],
    [0.84, -1.34],
  ]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat)
    w.position.set(x, 0.34, z)
    w.castShadow = true
    wheels.push(w)
    g.add(w)
  }
  ;[body, lower, cabin, wind, rear, wing, wingL, wingR, lightL, lightR].forEach((m) => {
    m.castShadow = true
    g.add(m)
  })
  ;(g as any).wheels = wheels
  return g
}

export interface CarInput {
  throttle: number
  brake: number
  steer: number
  handbrake: boolean
}

export class Car {
  pos = new THREE.Vector3()
  vel = new THREE.Vector2() // x,z dunia
  heading = 0
  steerVis = 0
  speed = 0 // m/s (longitudinal)
  onRoad = true
  slip = 0
  pitch = 0
  roll = 0
  // --- drift engine ---
  tune: DriftTune = DRIFT_TUNES.pas
  driftAngle = 0
  drifting = false
  // --- SAKURA RC state ---
  rc: RcSetup = { ...DEFAULT_RC_SETUP }
  yawRate = 0
  gyroOut = 0 // counter-steer gyro terakhir (-1..1), buat HUD
  turboBoost = 0 // 0..1 boost ESC aktif, buat HUD/suara
  effSteer = 0 // steer efektif setelah gyro clamp

  constructor(private terrain: Terrain) {}

  setTune(id: DriftModeId) {
    this.tune = DRIFT_TUNES[id]
  }
  setRc(rc: RcSetup) {
    this.rc = { ...rc }
  }

  reset(x: number, y: number, z: number, heading: number) {
    this.pos.set(x, y, z)
    this.vel.set(0, 0)
    this.heading = heading
    this.speed = 0
    this.slip = 0
    this.driftAngle = 0
    this.drifting = false
    this.yawRate = 0
    this.gyroOut = 0
    this.turboBoost = 0
  }

  update(dt: number, inp: CarInput) {
    const fx = Math.sin(this.heading)
    const fz = Math.cos(this.heading)
    const rx = Math.cos(this.heading)
    const rz = -Math.sin(this.heading)

    let vLong = this.vel.x * fx + this.vel.y * fz
    let vLat = this.vel.x * rx + this.vel.y * rz

    const info = this.terrain.road(this.pos.x, this.pos.z)
    const onRoad = info.d < 4.6
    const shoulder = info.d < 7.2
    this.onRoad = onRoad

    const T = this.tune
    const isRC = !!T.isRC
    const tire = TIRES[this.rc.tire]
    // ESC turbo boost: semburan tenaga di RPM tinggi (ala timing brushless)
    let escBoost = 0
    if (isRC && inp.throttle > 0 && onRoad) {
      const rpmHi = THREE.MathUtils.clamp((Math.abs(vLong) / T.maxSpeed - 0.45) / 0.55, 0, 1)
      escBoost = rpmHi * (this.rc.escTurbo / 100)
      this.turboBoost += (escBoost - this.turboBoost) * Math.min(1, dt * 3)
    } else {
      this.turboBoost += (0 - this.turboBoost) * Math.min(1, dt * 4)
    }
    // gaya mesin (tune-able + turbo RC)
    const maxSpeed = onRoad ? T.maxSpeed * (isRC ? 1 + (this.rc.escTurbo / 100) * 0.06 : 1) : shoulder ? 34 : 22
    const accel = (onRoad ? T.accel : 8) * (isRC ? tire.slideMul * 0.92 + 0.28 : 1)
    if (inp.throttle > 0) {
      const f = 1 - THREE.MathUtils.clamp(Math.abs(vLong) / maxSpeed, 0, 1)
      vLong += inp.throttle * (accel * (0.35 + 0.65 * f) + escBoost * 9.5 * f) * dt
    }
    if (inp.brake > 0) {
      if (vLong > 0.4) vLong -= Math.min(vLong, inp.brake * 22 * dt)
      else vLong -= inp.brake * 9 * dt // mundur
    }

    // gravitasi sesuai kemiringan jalan (turunan!)
    const ahead = 4
    const hHere = this.terrain.heightAt(this.pos.x, this.pos.z)
    const hAhead = this.terrain.heightAt(this.pos.x + fx * ahead, this.pos.z + fz * ahead)
    const grade = (hHere - hAhead) / ahead
    this.pitch = Math.atan(grade)
    vLong += grade * 9.81 * dt * 0.85

    // hambatan
    const drag = onRoad ? 0.0021 : 0.007
    const roll = onRoad ? 0.55 : 2.6
    vLong -= (drag * vLong * Math.abs(vLong) + roll * Math.sign(vLong) * Math.min(1, Math.abs(vLong))) * dt

    // kemudi — lock & respon ikut tune (angle kit di PAS/BEST)
    const sp = Math.abs(vLong)
    // --- SAKURA RC: gyro + high-angle knuckles + suspensi ---
    let steerTarget = inp.steer
    let steerRateMul = 1
    let responseMul = 1
    let gripMul = isRC ? tire.gripMul : 1
    let overMul = isRC ? tire.slideMul : 1
    if (isRC) {
      // Gyro: baca yaw rate -> counter otomatis (prompt persis)
      // gyroCounter = -angularVelocity * (gain/100) * 0.45
      const gyroCounter = -this.yawRate * (this.rc.gyroGain / 100) * 0.45
      this.gyroOut = THREE.MathUtils.clamp(gyroCounter, -1, 1)
      const maxLock = this.rc.maxSteerDeg / 60 // dinormalisasi ke lock 60°
      steerTarget = THREE.MathUtils.clamp(inp.steer + this.gyroOut, -maxLock, maxLock)
      // knuckle besar = yaw lebih galak
      steerRateMul = 0.72 + (this.rc.maxSteerDeg / 80) * 0.55
      // damper tebal = respon kalem & stabil; per lembut = lincah
      const dampN = (this.rc.damperCst - 300) / 500 // 0..1
      const springN = (this.rc.springRate - 1) / 9 // 0..1
      responseMul = (1 - dampN * 0.28) * (0.88 + springN * 0.32)
      gripMul *= 1 + dampN * 0.1 - springN * 0.06
      // caster tinggi = stabil saat counter, oversteer sedikit kalem
      const casterN = (this.rc.casterDeg - 4) / 8
      overMul *= 1 - casterN * 0.1
    } else {
      this.gyroOut += (0 - this.gyroOut) * Math.min(1, dt * 6)
    }
    const steerAuth =
      THREE.MathUtils.clamp(sp / T.authority, 0, 1) * (1 - THREE.MathUtils.clamp(sp / 130, 0, T.highCut))
    const steerRate = (inp.handbrake ? T.steerHB : T.steerBase) * steerAuth * steerRateMul
    const resp = T.steerResponse * responseMul * (isRC ? 1 + (this.rc.gyroGain / 100) * 0.25 : 1)
    this.steerVis += (steerTarget - this.steerVis) * Math.min(1, dt * resp)
    this.effSteer = this.steerVis
    const prevHeading = this.heading
    this.heading -= this.steerVis * steerRate * dt * Math.sign(vLong || 1)
    // PRO: throttle-steer — gas ikut muterin mobil saat setir belok.
    if (inp.throttle > 0 && sp > 6) {
      const ty = T.throttleYaw * (isRC ? 1 + (this.rc.escTurbo / 100) * 0.3 : 1)
      this.heading -=
        this.steerVis * inp.throttle * ty * dt * THREE.MathUtils.clamp(sp / 15, 0, 1) * Math.sign(vLong || 1)
    }
    // yaw rate aktual (rad/s) buat gyro frame berikut + HUD
    const rawYaw = (this.heading - prevHeading) / Math.max(dt, 1e-4)
    this.yawRate += (rawYaw - this.yawRate) * Math.min(1, dt * 10)

    // grip lateral: seret velocity menuju heading baru
    const baseGrip = (onRoad ? T.grip : T.gripOff) * gripMul
    let grip = inp.handbrake ? T.hbGrip : inp.throttle > 0.5 && sp > 18 ? baseGrip * T.throttleCut : baseGrip
    // camber negatif = grip depan nambah saat belok (khusus RC)
    if (isRC && Math.abs(this.steerVis) > 0.15) {
      grip *= 1 + (Math.abs(this.rc.camberDeg) / 8) * 0.18 * Math.min(1, Math.abs(this.steerVis))
    }
    // PRO: locked-diff feel — gas MENAHAN slide, bukan mengembalikan grip.
    if (inp.throttle > 0 && Math.abs(vLat) > 3.5 && !inp.handbrake) {
      grip *= 1 - T.hold * 0.5 * inp.throttle
    }
    // PRO: counter-steer assist (mode non-RC) / caster-stability (RC)
    if (!isRC && T.counterAssist > 0 && Math.abs(vLat) > 3) {
      const slideDir = Math.sign(vLat)
      const steerDir = Math.abs(this.steerVis) > 0.12 ? Math.sign(this.steerVis) : 0
      if (steerDir !== 0 && steerDir !== slideDir) grip *= 1 + T.counterAssist * 0.9
      else if (steerDir !== 0 && steerDir === slideDir) grip *= 1 - T.counterAssist * 0.32
    }
    if (isRC && Math.abs(vLat) > 3) {
      const casterN = (this.rc.casterDeg - 4) / 8
      const slideDir = Math.sign(vLat)
      const steerDir = Math.abs(this.steerVis) > 0.12 ? Math.sign(this.steerVis) : 0
      if (steerDir !== 0 && steerDir !== slideDir) grip *= 1 + casterN * 0.55 + (this.rc.gyroGain / 100) * 0.35
    }
    vLat -= vLat * Math.min(1, grip * dt)
    // gaya sentrifugal saat menikung (ban poly lebih mudah ngesot)
    const ov = (inp.handbrake ? T.hbOversteer : T.oversteer) * overMul
    vLat += this.steerVis * steerRate * vLong * dt * ov
    // PRO: plafon anti-spin — slide ditahan lembut di maxSlip, anti 360°.
    if (Math.abs(vLat) > T.maxSlip) {
      const over = Math.abs(vLat) - T.maxSlip
      vLat -= Math.sign(vLat) * over * Math.min(1, 8 * dt)
    }

    this.slip = THREE.MathUtils.clamp(Math.abs(vLat) / 9, 0, 1)
    this.driftAngle = (Math.atan2(Math.abs(vLat), Math.abs(vLong) + 0.001) * 180) / Math.PI
    this.drifting = sp > 8 && this.driftAngle > 10 && onRoad
    const loss = inp.handbrake ? T.hbSlideLoss : T.slideLoss
    vLong -= Math.abs(vLat) * loss * dt * (inp.handbrake ? 1 : 1)

    this.vel.set(fx * vLong + rx * vLat, fz * vLong + rz * vLat)
    this.speed = vLong

    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.y * dt

    // tabrakan dengan guardrail — batas tepat di luar tiang pagar,
    // supaya bodi tidak menembus rail
    const after = this.terrain.road(this.pos.x, this.pos.z)
    const limit = 4.05
    if (after.d > limit) {
      const s = after.sample
      const nx = Math.cos(s.heading) * after.side
      const nz = -Math.sin(s.heading) * after.side
      const push = after.d - limit
      this.pos.x -= nx * push
      this.pos.z -= nz * push
      // pantulan lembut
      const vn = this.vel.x * nx + this.vel.y * nz
      if (vn > 0) {
        this.vel.x -= nx * vn * 1.25
        this.vel.y -= nz * vn * 1.25
      }
      this.speed *= 0.965
    }

    const groundY = this.terrain.heightAt(this.pos.x, this.pos.z)
    this.pos.y += (groundY - this.pos.y) * Math.min(1, dt * 12)
    this.roll += (-this.steerVis * 0.1 * THREE.MathUtils.clamp(sp / 30, 0, 1) - this.roll) * Math.min(1, dt * 6)
  }
}
