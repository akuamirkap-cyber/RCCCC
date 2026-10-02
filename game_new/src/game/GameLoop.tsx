import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { sim, resetSim } from './sim'
import { getSteer, getHandbrake, input } from './input'
import { clipPoints, outerZones, driftSectors, inRange, SAMPLES, TRACK_WIDTH } from './track'
import { useGame, RACE_LAPS, TIME_LIMIT } from './store'
import { updateAudio, playBlip, playCrash } from './audio'
import { tuning } from './tuning'
import { stepVehicle, resolveCarCollision } from './physics'
import { bots, resetBots, stepBot, gridSlot, PLAYER_GRID_SLOT } from './bots'

export { KMH } from './physics'

const CLIP_RADIUS = 3.6
const MAX_MULT = 20

function resetAll() {
  resetBots()
  resetSim(gridSlot(PLAYER_GRID_SLOT))
}

// state skor tambahan (di luar React)
const sc = {
  bonusMult: 0,
  outerDone: new Set<number>(),
  sectorId: -1,
  sectorTime: 0,
  sectorDrift: 0,
  sectorDone: new Set<number>(),
  tandemTime: 0,
  tandemAcc: 0,
  tandemAnnounce: 0,
  bigAngleShown: false,
  lastSectorPct: 0,
}
function resetScore() {
  sc.bonusMult = 0
  sc.outerDone.clear()
  sc.sectorId = -1
  sc.sectorTime = 0
  sc.sectorDrift = 0
  sc.sectorDone.clear()
  sc.tandemTime = 0
  sc.tandemAcc = 0
  sc.tandemAnnounce = 0
  sc.bigAngleShown = false
}

export function GameLoop() {
  const phase = useGame((s) => s.phase)
  const mode = useGame((s) => s.mode)
  const hudTimer = useRef(0)
  const lastPos = useRef(0)

  useEffect(() => {
    if (phase === 'menu') {
      resetAll()
      return
    }
    if (phase !== 'countdown') return
    resetAll()
    resetScore()
    lastPos.current = 0
    const st = useGame.getState()
    st.setHud({
      score: 0,
      pending: 0,
      mult: 1,
      drifting: false,
      speed: 0,
      lap: 0,
      time: 0,
      lapTimes: [],
      clipsCollected: 0,
      position: bots.length + 1,
      standings: [],
      sector: null,
      tandem: false,
      bigAngle: false,
    })
    let n = 3
    st.setCountdown(n)
    playBlip(660, 0.12)
    const id = setInterval(() => {
      n--
      if (n > 0) {
        useGame.getState().setCountdown(n)
        playBlip(660, 0.12)
      } else {
        useGame.getState().setCountdown(0)
        playBlip(1100, 0.3, 0.3)
        sim.running = true
        useGame.getState().setPhase('playing')
        clearInterval(id)
      }
    }, 900)
    return () => clearInterval(id)
  }, [phase])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const st = useGame.getState()
    const playing = st.phase === 'playing' && sim.running
    const botsActive = st.phase === 'playing' || st.phase === 'finished'

    // ---- Player input & physics
    const steerTarget = playing ? getSteer() : 0
    sim.handbrake = playing && getHandbrake()
    sim.throttle = playing ? (input.brake ? -0.6 : 1) : 0
    const res = stepVehicle(sim, tuning, dt, steerTarget, playing)
    let crashed = res.crashed
    if (crashed) playCrash()

    // ---- Bots
    const playerTotal = sim.lap + sim.progress
    for (const b of bots) stepBot(b, dt, botsActive, sim.time, playerTotal)

    // ---- Car-to-car collisions
    for (let i = 0; i < bots.length; i++) {
      const hit = resolveCarCollision(sim, bots[i])
      if (hit > 5 && sim.crashCooldown <= 0) {
        sim.crashCooldown = 0.5
        sim.shake = Math.min(1, hit / 14)
        playCrash()
        if (hit > 7) crashed = true
      }
      for (let j = i + 1; j < bots.length; j++) resolveCarCollision(bots[i], bots[j])
    }

    const absSlip = Math.abs(sim.slip)
    const slipDeg = (absSlip * 180) / Math.PI

    // ---- Scoring: CHIPS (pending) × MULT
    const scoringDrift = playing && sim.drifting && sim.speed > 6 && !sim.onGrass && absSlip > 0.15
    const hasCombo = sim.pending > 0 || sim.driftTime > 0

    // tandem: drift dekat bot
    let tandem = false
    if (scoringDrift) {
      for (const b of bots) {
        if (Math.hypot(b.x - sim.x, b.z - sim.z) < 5) {
          tandem = true
          break
        }
      }
    }
    const bigAngle = scoringDrift && slipDeg > 48

    const addChips = (n: number, text: string) => {
      sim.pending += n
      st.addTag(text, 'chip')
      st.bump('chip')
    }
    const addMult = (n: number, text: string) => {
      sc.bonusMult = Math.min(MAX_MULT, sc.bonusMult + n)
      st.addTag(text, 'mult')
      st.bump('mult')
      playBlip(700 + sim.mult * 60, 0.1, 0.2)
    }

    if (scoringDrift) {
      sim.driftTime += dt
      sim.grace = 0.6
      let rate = slipDeg * sim.speed * 0.2
      if (tandem) rate *= 1.6
      if (bigAngle) rate *= 1.35
      sim.pending += rate * dt

      // mult dari durasi drift
      const timeMult = Math.min(8, 1 + Math.floor(sim.driftTime / 1.3))
      const newMult = Math.min(MAX_MULT, timeMult + sc.bonusMult)
      if (newMult > sim.mult) {
        sim.mult = newMult
        st.bump('mult')
        if (timeMult > 1 && (sim.driftTime % 1.3) < dt * 1.5) playBlip(500 + newMult * 60, 0.08, 0.15)
      }

      // BIG ANGLE
      if (bigAngle && !sc.bigAngleShown) {
        sc.bigAngleShown = true
        addMult(1, 'BIG ANGLE! +1 MULT')
      }

      // TANDEM
      if (tandem) {
        sc.tandemTime += dt
        sc.tandemAcc += dt
        if (sc.tandemAnnounce <= 0) {
          sc.tandemAnnounce = 3
          st.addTag('TANDEM! ×1.6 chips', 'info')
          playBlip(1200, 0.12, 0.2)
        }
        if (sc.tandemAcc >= 1.5) {
          sc.tandemAcc = 0
          addChips(250, 'TANDEM +250')
        }
      }

      // INNER CLIP
      for (const cp of clipPoints) {
        if (sim.clipsCollected.has(cp.idx)) continue
        if (Math.hypot(cp.x - sim.x, cp.z - sim.z) < CLIP_RADIUS) {
          sim.clipsCollected.add(cp.idx)
          sim.totalClips++
          addChips(400, 'INNER CLIP +400')
          addMult(1, '+1 MULT')
          playBlip(1320, 0.15, 0.25)
        }
      }

      // OUTER ZONE: sisi luar di exit tikungan
      for (const oz of outerZones) {
        if (sc.outerDone.has(oz.idx)) continue
        if (!inRange(sim.trackIdx, oz.from, oz.to)) continue
        if (sim.lateralOffset * oz.side > TRACK_WIDTH / 2 - 1.7) {
          sc.outerDone.add(oz.idx)
          addChips(600, 'OUTER ZONE +600')
          addMult(1, '+1 MULT')
          playBlip(1500, 0.15, 0.25)
        }
      }
    } else {
      sim.grace -= dt
      if (sim.grace <= 0 && hasCombo) {
        const chips = Math.round(sim.pending)
        const mult = sim.mult
        const total = Math.round(chips * mult)
        if (total > 0) {
          sim.score += total
          st.setBank({ id: Date.now(), chips, mult, total })
          playBlip(660, 0.1, 0.2)
          setTimeout(() => playBlip(990, 0.15, 0.2), 90)
        }
        sim.pending = 0
        sim.driftTime = 0
        sim.mult = 1
        sc.bonusMult = 0
        sc.bigAngleShown = false
      }
    }
    sc.tandemAnnounce -= dt
    if (!scoringDrift) sc.bigAngleShown = false

    const killCombo = (text: string) => {
      st.addTag(text, 'bad')
      sim.pending = 0
      sim.driftTime = 0
      sim.mult = 1
      sim.grace = 0
      sc.bonusMult = 0
    }
    if (crashed && hasCombo) killCombo('CRASH! Kombo hangus')
    if (sim.onGrass && playing && hasCombo) killCombo('Keluar lintasan!')

    // ---- DRIFT SECTOR
    let sectorHud: { name: string; pct: number } | null = null
    if (playing) {
      const cur = driftSectors.find((s) => inRange(sim.trackIdx, s.from, s.to))
      if (cur && sc.sectorId !== cur.id && !sc.sectorDone.has(cur.id)) {
        sc.sectorId = cur.id
        sc.sectorTime = 0
        sc.sectorDrift = 0
        st.addTag(`${cur.name} — DRIFT TERUS!`, 'info')
      }
      if (cur && sc.sectorId === cur.id) {
        sc.sectorTime += dt
        if (scoringDrift) sc.sectorDrift += dt
        sectorHud = { name: cur.name, pct: sc.sectorTime > 0 ? sc.sectorDrift / sc.sectorTime : 0 }
      }
      if (!cur && sc.sectorId >= 0) {
        const pct = sc.sectorTime > 0 ? sc.sectorDrift / sc.sectorTime : 0
        const sec = driftSectors[sc.sectorId]
        sc.sectorDone.add(sc.sectorId)
        sc.sectorId = -1
        if (hasCombo && pct >= 0.7) {
          addChips(1500, `PERFECT ${sec.name} +1500`)
          addMult(3, '+3 MULT!')
          sim.grace = Math.max(sim.grace, 0.6)
        } else if (hasCombo && pct >= 0.4) {
          addChips(500, `GOOD ${sec.name} +500`)
          addMult(1, '+1 MULT')
        } else if (pct > 0) {
          st.addTag(`${sec.name} ${Math.round(pct * 100)}% — kurang!`, 'bad')
        }
      }
    }

    // ---- Lap, waktu & posisi
    let position = lastPos.current || bots.length + 1
    if (playing) {
      sim.time += dt
      const prog = sim.trackIdx / SAMPLES
      const crossed = sim.lastProgress > 0.9 && prog < 0.1
      const crossedBack = sim.lastProgress < 0.1 && prog > 0.9
      if (crossed) {
        if (sim.lap >= 1) {
          const lapTime = sim.time - sim.lapStart
          sim.lapTimes.push(lapTime)
          st.addPopup(`LAP ${sim.lapTimes.length}: ${lapTime.toFixed(2)}s`, '#93c5fd')
        }
        sim.lap++
        sim.lapStart = sim.time
        sim.clipsCollected.clear()
        sc.outerDone.clear()
        sc.sectorDone.clear()
        playBlip(990, 0.2, 0.25)
      } else if (crossedBack) {
        sim.lap = Math.max(0, sim.lap - 1)
      }
      sim.lastProgress = prog
      sim.progress = prog

      const myTotal = sim.lap + sim.progress
      position = 1
      for (const b of bots) if (b.lap + b.progress > myTotal) position++
      if (mode === 'race' && position !== lastPos.current && lastPos.current !== 0) {
        if (position < lastPos.current) {
          st.addPopup(`NYALIP! P${position}`, '#a78bfa')
          playBlip(880, 0.12, 0.2)
        } else {
          st.addPopup(`Disalip... P${position}`, '#fca5a5')
        }
      }
      lastPos.current = position

      const finished = mode === 'race' ? sim.lapTimes.length >= RACE_LAPS : sim.time >= TIME_LIMIT
      if (finished) {
        sim.running = false
        const banked = Math.round(sim.pending * sim.mult)
        sim.score += banked
        sim.pending = 0
        sim.mult = 1
        const bestLap = sim.lapTimes.length ? Math.min(...sim.lapTimes) : null
        let posBonus = 0
        if (mode === 'race') posBonus = [5000, 2500, 1000, 0][position - 1] ?? 0
        sim.score += posBonus
        st.setHud({ score: sim.score, pending: 0, mult: 1, drifting: false, lap: sim.lap, time: sim.time, lapTimes: [...sim.lapTimes], position, sector: null, tandem: false, bigAngle: false })
        st.finish(sim.score, bestLap, position, posBonus)
        playBlip(1320, 0.4, 0.3)
      }
    }

    // ---- Audio
    updateAudio(sim.speed, sim.smokeIntensity, sim.throttle > 0 ? 1 : 0)

    // ---- HUD throttle (12Hz)
    hudTimer.current += dt
    if (hudTimer.current > 0.08) {
      hudTimer.current = 0
      const standings = [
        { name: 'KAMU', total: sim.lap + sim.progress, me: true, color: st.carColor },
        ...bots.map((b) => ({ name: b.name, total: b.lap + b.progress, me: false, color: b.color })),
      ]
        .sort((a, b) => b.total - a.total)
        .map((s) => ({ name: s.name, me: s.me, color: s.color }))
      st.setHud({
        score: sim.score,
        pending: Math.round(sim.pending),
        mult: sim.mult,
        drifting: scoringDrift,
        speed: sim.speed,
        lap: sim.lap,
        time: sim.time,
        clipsCollected: sim.totalClips,
        position,
        standings,
        sector: sectorHud,
        tandem,
        bigAngle,
      })
    }
  })

  return null
}
