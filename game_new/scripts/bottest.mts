// Simulasi bot 60 detik memakai modul game asli
import { bots, resetBots, stepBot } from '../src/game/bots.ts'
import { resolveCarCollision } from '../src/game/physics.ts'

resetBots()
const dt = 1 / 60
const stats = bots.map(() => ({ crash: 0, driftT: 0, grassT: 0, hbT: 0, top: 0, maxSlip: 0, stuck: 0 }))
let t = 0
const lapT: number[][] = bots.map(() => [])
const lastLap = bots.map(() => 0)
const prevLap = bots.map(() => 0)
for (let step = 0; step < 60 * 75; step++) {
  t += dt
  bots.forEach((b, i) => {
    const r = stepBot(b, dt, true, t, 0)
    const s = stats[i]
    if (r.crashed) s.crash++
    if (b.drifting) s.driftT += dt
    if (b.onGrass) s.grassT += dt
    if (b.handbrake) s.hbT += dt
    if (b.speed < 1.5 && t > 3) s.stuck += dt
    s.top = Math.max(s.top, b.speed * 8.4)
    s.maxSlip = Math.max(s.maxSlip, Math.abs(b.slip))
    if (b.lap !== prevLap[i]) { if (prevLap[i] >= 1) lapT[i].push(t - lastLap[i]); lastLap[i] = t; prevLap[i] = b.lap }
  })
  for (let i = 0; i < bots.length; i++) for (let j = i + 1; j < bots.length; j++) resolveCarCollision(bots[i], bots[j])
}
bots.forEach((b, i) => {
  const s = stats[i]
  console.log(
    b.name.padEnd(6),
    `laps ${b.lap}`,
    `top ${s.top.toFixed(0)}km/j`,
    `slipMax ${((s.maxSlip * 180) / Math.PI).toFixed(0)}°`,
    `drift ${s.driftT.toFixed(1)}s`,
    `hb ${s.hbT.toFixed(1)}s`,
    `crash ${s.crash}`,
    `grass ${s.grassT.toFixed(1)}s`,
    `stuck ${s.stuck.toFixed(1)}s`,
    `lapT ${lapT[i].map((v) => v.toFixed(1)).join('/')}`,
  )
})
