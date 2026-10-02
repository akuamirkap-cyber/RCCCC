import { samples, headingFromTangent } from './track'
import type { Vehicle } from './physics'

export interface PlayerState extends Vehicle {
  progress: number
  lastProgress: number
  lap: number
  lapStart: number
  time: number
  lapTimes: number[]
  pending: number
  driftTime: number
  grace: number
  mult: number
  score: number
  clipsCollected: Set<number>
  totalClips: number
  running: boolean
  resetCount: number
}

export const sim: PlayerState = {
  // pose
  x: 0,
  z: 0,
  heading: 0,
  vx: 0,
  vz: 0,
  angVel: 0,
  // input
  steer: 0, // +1 = kanan
  throttle: 0,
  handbrake: false,
  // derived
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
  // track
  trackIdx: 0,
  lateralOffset: 0,
  progress: 0,
  lastProgress: 0,
  // race
  lap: 0,
  lapStart: 0,
  time: 0,
  lapTimes: [] as number[],
  // score
  pending: 0,
  driftTime: 0,
  grace: 0,
  mult: 1,
  score: 0,
  clipsCollected: new Set<number>(),
  totalClips: 0,
  // fx
  shake: 0,
  crashCooldown: 0,
  smokeIntensity: 0,
  braking: false,
  running: false,
  resetCount: 0,
}

export function resetSim(start?: { x: number; z: number; heading: number; idx: number }) {
  const s0 = samples[0]
  const back = samples[samples.length - 6]
  const startIdx = start ? start.idx : samples.length - 6
  sim.x = start ? start.x : back.x
  sim.z = start ? start.z : back.z
  sim.heading = start ? start.heading : headingFromTangent(s0.tx, s0.tz)
  sim.vx = 0
  sim.vz = 0
  sim.angVel = 0
  sim.steer = 0
  sim.throttle = 0
  sim.handbrake = false
  sim.speed = 0
  sim.forwardSpeed = 0
  sim.lateralSpeed = 0
  sim.slip = 0
  sim.drifting = false
  sim.onGrass = false
  sim.lateralAccel = 0
  sim.prevLateral = 0
  sim.steerVisual = 0
  sim.wheelSpin = 0
  sim.trackIdx = startIdx
  sim.lateralOffset = 0
  sim.progress = startIdx / samples.length
  sim.lastProgress = sim.progress
  sim.lap = 0
  sim.lapStart = 0
  sim.time = 0
  sim.lapTimes = []
  sim.pending = 0
  sim.driftTime = 0
  sim.grace = 0
  sim.mult = 1
  sim.score = 0
  sim.clipsCollected = new Set()
  sim.totalClips = 0
  sim.shake = 0
  sim.crashCooldown = 0
  sim.smokeIntensity = 0
  sim.braking = false
  sim.running = false
  sim.resetCount++
}

resetSim()

