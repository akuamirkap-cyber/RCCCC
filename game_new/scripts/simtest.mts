import { samples, SAMPLES } from '../src/game/track.ts'
import { stepVehicle, KMH, type Vehicle } from '../src/game/physics.ts'
import { PRESETS } from '../src/game/tuning.ts'
import { gridSlot } from '../src/game/bots.ts'
for (const [name, p] of Object.entries(PRESETS)) {
  const g = gridSlot(3)
  const v: Vehicle = { x: g.x, z: g.z, heading: g.heading, vx: 0, vz: 0, angVel: 0, steer: 0, throttle: 1, handbrake: false, speed: 0, forwardSpeed: 0, lateralSpeed: 0, slip: 0, drifting: false, onGrass: false, lateralAccel: 0, prevLateral: 0, steerVisual: 0, wheelSpin: 0, trackIdx: g.idx, lateralOffset: 0, crashCooldown: 0, shake: 0, smokeIntensity: 0, braking: false }
  let t = 0, crash = 0, drift = 0, grass = 0, top = 0, laps = 0, lastP = g.idx / SAMPLES, lastLap = 0
  const lapT: number[] = []
  const dt = 1 / 60
  for (let s = 0; s < 60 * 90; s++) {
    t += dt
    const la = samples[(v.trackIdx + Math.round(14 + v.speed * 0.8)) % SAMPLES]
    const ah = Math.atan2(-(la.x - v.x), -(la.z - v.z))
    let err = ah - v.heading; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI
    const st = Math.abs(err) > 0.06 ? -Math.sign(err) : 0
    v.handbrake = Math.abs(err) > 0.5 && v.speed > 14
    v.throttle = Math.abs(err) > 0.7 && v.speed > 20 ? 0.2 : 1
    const r = stepVehicle(v, p.t, dt, st, true)
    if (r.crashed) crash++
    if (v.drifting) drift += dt
    if (v.onGrass) grass += dt
    top = Math.max(top, v.speed * KMH)
    const pr = v.trackIdx / SAMPLES
    if (lastP > 0.9 && pr < 0.1) { laps++; if (laps > 1) lapT.push(t - lastLap); lastLap = t }
    lastP = pr
  }
  console.log(name.padEnd(9), `top ${top.toFixed(0)}km/j`, `crash ${crash}`, `drift ${drift.toFixed(1)}s`, `grass ${grass.toFixed(1)}s`, `laps ${laps}`, `lapT ${lapT.map(x => x.toFixed(1)).join('/')}`)
}
