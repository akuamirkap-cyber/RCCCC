/**
 * "Bicycle-lite" arcade drift engine with an explicit slip angle.
 *
 * Pure functions, no React / Three. World-space velocity (vx, vz) is decomposed into the car's
 * axes every frame, modified, and recomposed with the OLD heading basis. Because the heading has
 * rotated in the meantime, a lateral component shows up in the next frame — that is the slip.
 *
 * Conventions (match the renderer): heading h ↔ rotation.y = h, model front = +z
 *   forward = ( sin h,  cos h)       right = forward × up = (-cos h, sin h)
 *   positive heading change = LEFT turn, steer +1 = RIGHT (heading decreases)
 */
import type { Track } from './track';
import { SLIP_ACCEL_FLOOR, SLIP_KMH, type SlipTuning } from './tuning';

export const RAD2DEG = 180 / Math.PI;

export interface VehicleState {
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  angVel: number;
  steer: number; // smoothed steering (-1..1)
  throttle: number; // -1..1
  handbrake: boolean;
  slip: number; // angle between nose and direction of travel (rad)
  drifting: boolean; // hysteresis state
  onGrass: boolean;
  // derived every step
  fwd: number;
  lat: number;
  speed: number;
  lateralAccel: number;
  braking: boolean;
  smokeIntensity: number;
  // track
  idx: number;
  lateralOffset: number;
  hitCooldown: number;
}

export interface VehicleInput {
  steerTarget: number; // -1 (left) .. 1 (right)
  throttle: number; // auto throttle = 1, foot brake = -0.6
  handbrake: boolean;
  active: boolean; // false in menu / after the finish → the car coasts to a stop
}

export interface TrackBounds {
  halfWidth: number; // beyond this = grass
  wall: number; // invisible wall distance from the centerline
}

export interface StepResult {
  /** Wall impact speed when a "crash" happened (> 4 units/s, 0.6 s cooldown), otherwise 0 */
  hit: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function createVehicle(x: number, z: number, heading: number, idx: number): VehicleState {
  return {
    x,
    z,
    heading,
    vx: 0,
    vz: 0,
    angVel: 0,
    steer: 0,
    throttle: 0,
    handbrake: false,
    slip: 0,
    drifting: false,
    onGrass: false,
    fwd: 0,
    lat: 0,
    speed: 0,
    lateralAccel: 0,
    braking: false,
    smokeIntensity: 0,
    idx,
    lateralOffset: 0,
    hitCooldown: 0,
  };
}

/** Advances one vehicle by dt (clamped to 1/30 so 30 fps behaves like 60 fps). */
export function stepVehicle(s: VehicleState, input: VehicleInput, t: SlipTuning, track: Track, bounds: TrackBounds, dtRaw: number): StepResult {
  const dt = Math.min(dtRaw, 1 / 30);

  // 3.1 steering smoothing (~80 ms) — digital input becomes analog
  s.steer += (clamp(input.steerTarget, -1, 1) - s.steer) * Math.min(1, dt * 12);
  s.throttle = input.active ? input.throttle : 0;
  s.handbrake = input.active && input.handbrake;

  // basis of the OLD heading (kept for the recomposition)
  const h = s.heading;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const rx = -Math.cos(h);
  const rz = Math.sin(h);

  // 3.2 decomposition
  let fwd = s.vx * fx + s.vz * fz;
  let lat = s.vx * rx + s.vz * rz;
  const slip = Math.atan2(lat, Math.max(Math.abs(fwd), 0.5));
  s.slip = slip;

  // 3.3 drift state machine with hysteresis
  if (!s.drifting) {
    if (Math.abs(slip) > 0.2 || (s.handbrake && Math.abs(fwd) > 6)) s.drifting = true;
  } else if (Math.abs(slip) < 0.09 && !s.handbrake) {
    s.drifting = false;
  }

  // 3.4 three-level lateral grip, applied as an exponential decay of the lateral speed
  let grip = s.drifting ? t.gripDrift : t.gripNormal;
  if (s.handbrake) grip = Math.min(t.gripDrift, 1.4 / t.handbrake);
  if (s.onGrass) grip *= 0.6;
  const latBefore = lat;
  lat *= Math.exp(-grip * dt);

  // 3.5 longitudinal
  const MAX = t.maxSpeed / SLIP_KMH;
  const maxSpd = s.onGrass ? MAX * 0.4 : MAX;
  if (input.active) {
    if (s.throttle > 0) {
      const drop = 1 - fwd / maxSpd;
      // floor keeps pulling near the top so the tuned top speed is really reached on a straight
      const a = (drop <= 0 ? 0 : t.accel * 0.72 * Math.max(SLIP_ACCEL_FLOOR, Math.min(drop, 1.2))) * (s.handbrake ? 0.4 : 1);
      fwd += a * s.throttle * dt;
    } else {
      fwd -= fwd * 0.35 * dt; // drag / engine braking
      if (s.throttle < 0) {
        fwd += s.throttle * t.brake * 0.6 * dt; // -0.6 × 18 at the default brake power
        if (fwd < -6) fwd = -6;
      }
    }
    if (fwd > maxSpd) fwd -= (fwd - maxSpd) * 2 * dt;
    if (s.onGrass) fwd -= fwd * 1.4 * dt;
    if (s.handbrake) fwd -= fwd * 0.6 * dt;
    if (s.drifting) fwd -= Math.abs(lat) * 0.12 * dt; // drift scrub: angle costs speed
  } else {
    fwd -= fwd * 2 * dt;
  }

  // 3.6 yaw: steer torque (× driftBoost while drifting) + self-aligning torque + handbrake kick
  const spdFactor = Math.min(1, Math.abs(fwd) / 9);
  const driftBoost = s.drifting ? t.driftBoost : 1;
  const align = -slip * t.align * spdFactor;
  const sgn = fwd > 0.05 ? 1 : fwd < -0.05 ? -1 : 0;
  const angTarget = -s.steer * t.turnRate * spdFactor * driftBoost * sgn + align;
  const kick = s.handbrake && Math.abs(fwd) > 6 ? -s.steer * t.handbrake : 0;
  s.angVel += (angTarget + kick - s.angVel) * Math.min(1, dt * 7); // rotational inertia
  s.heading = wrapAngle(s.heading + s.angVel * dt);

  // 3.7 recomposition with the OLD basis — the key trick that lets slip appear naturally
  s.vx = fx * fwd + rx * lat;
  s.vz = fz * fwd + rz * lat;
  s.x += s.vx * dt;
  s.z += s.vz * dt;

  // 3.8 track & walls
  const idx = track.nearestIndex(s.x, s.z, s.idx, 50);
  s.idx = idx;
  const sm = track.samples[idx];
  const off = (s.x - sm.x) * sm.rx + (s.z - sm.z) * sm.rz;
  s.lateralOffset = off;
  s.onGrass = Math.abs(off) > bounds.halfWidth;
  let hit = 0;
  s.hitCooldown = Math.max(0, s.hitCooldown - dt);
  if (Math.abs(off) > bounds.wall) {
    const sg = Math.sign(off);
    const over = Math.abs(off) - bounds.wall;
    s.x -= sm.rx * over * sg;
    s.z -= sm.rz * over * sg;
    const vn = s.vx * sm.rx + s.vz * sm.rz;
    if (vn * sg > 0) {
      s.vx -= sm.rx * vn * 1.3;
      s.vz -= sm.rz * vn * 1.3;
      s.vx *= 0.6;
      s.vz *= 0.6;
      s.angVel *= 0.5;
      if (Math.abs(vn) > 4 && s.hitCooldown <= 0) {
        hit = Math.abs(vn);
        s.hitCooldown = 0.6;
      }
    }
  }

  // 3.9 derived outputs
  s.fwd = fwd;
  s.lat = lat;
  s.speed = Math.hypot(s.vx, s.vz);
  s.lateralAccel = (lat - latBefore) / dt;
  s.braking = s.handbrake || s.throttle < 0 || (input.active && s.throttle < 0.5 && s.speed > 4);
  s.smokeIntensity = s.drifting && !s.onGrass ? Math.min(1, (Math.abs(slip) / 0.7) * Math.min(1, s.speed / 18)) : 0;
  return { hit };
}

/** Re-places a vehicle on the centerline of the nearest sample (recovery after getting stuck). */
export function resetVehicleOnTrack(s: VehicleState, track: Track, lane: number, speed: number) {
  const idx = track.nearestIndex(s.x, s.z, -1);
  const sm = track.samples[idx];
  s.idx = idx;
  s.x = sm.x + sm.rx * lane;
  s.z = sm.z + sm.rz * lane;
  s.heading = sm.angle;
  s.vx = sm.tx * speed;
  s.vz = sm.tz * speed;
  s.angVel = 0;
  s.steer = 0;
  s.slip = 0;
  s.drifting = false;
  s.onGrass = false;
  s.hitCooldown = 0;
  s.lateralOffset = lane;
}

/* ------------------------------------------------------------------ */
/*  Car ↔ car collisions (circles, impulse with restitution 0.35)      */
/* ------------------------------------------------------------------ */

const RESTITUTION = 0.35;

/** Resolves an overlap between two equal-mass vehicles. Returns the closing speed (0 when no bounce). */
export function collideVehicles(a: VehicleState, b: VehicleState, radius: number, rand: () => number = Math.random): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const minDist = radius * 2;
  if (dist >= minDist || dist < 1e-4) return 0;
  const nx = dx / dist;
  const nz = dz / dist;
  const overlap = minDist - dist;
  a.x -= nx * overlap * 0.5;
  a.z -= nz * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.z += nz * overlap * 0.5;
  const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (vn >= 0) return 0;
  const j = (-(1 + RESTITUTION) * vn) / 2; // 1/mA + 1/mB with unit masses
  a.vx -= j * nx;
  a.vz -= j * nz;
  b.vx += j * nx;
  b.vz += j * nz;
  const twist = 0.3 * Math.abs(vn);
  a.angVel += (rand() - 0.5) * 2 * twist;
  b.angVel += (rand() - 0.5) * 2 * twist;
  return Math.abs(vn);
}

/* ------------------------------------------------------------------ */
/*  Bot controller — produces inputs for the same stepVehicle          */
/* ------------------------------------------------------------------ */

export interface BotBrain {
  hbTimer: number; // remaining handbrake kick
  hbCooldown: number;
  lift: number; // remaining throttle lift
}

export function createBotBrain(): BotBrain {
  return { hbTimer: 0, hbCooldown: 0, lift: 0 };
}

/**
 * Pure pursuit toward a look-ahead point on the bot's lane; while drifting the steering is
 * computed from the velocity direction (natural counter-steer). Reads the curvature ahead to
 * kick the handbrake into big corners and to lift the throttle for the tightest ones.
 */
export function botInput(v: VehicleState, brain: BotBrain, track: Track, lane: number, targetSpeed: number, dt: number, rand: () => number = Math.random): VehicleInput {
  const n = track.count;
  const samples = track.samples;
  const idx = v.idx;
  brain.hbTimer = Math.max(0, brain.hbTimer - dt);
  brain.hbCooldown = Math.max(0, brain.hbCooldown - dt);
  brain.lift = Math.max(0, brain.lift - dt);

  // look-ahead point
  const look = Math.round(10 + v.speed * 0.9);
  const ls = samples[(idx + look) % n];
  const tx = ls.x + ls.rx * lane;
  const tz = ls.z + ls.rz * lane;
  const desired = Math.atan2(tx - v.x, tz - v.z);
  const velDir = v.speed > 3 ? Math.atan2(v.vx, v.vz) : v.heading;
  const ref = v.drifting && v.speed > 3 ? v.heading + 0.75 * wrapAngle(velDir - v.heading) : v.heading;
  const err = wrapAngle(desired - ref);
  // positive err = target is to the left → steer negative; small yaw damping against weaving
  const steerTarget = clamp(-err * 1.8 + v.angVel * 0.15, -1, 1);

  // curvature ahead (signed total heading change over samples 4..26)
  let turn = 0;
  for (let k = 4; k <= 26; k++) turn += samples[(idx + k) % n].curv * track.spacing;
  const turnAbs = Math.abs(turn);

  // handbrake kick into the corner (turn > 0 = left turn = steer negative)
  if (turnAbs > 0.32 && v.speed > 11 && brain.hbCooldown <= 0 && Math.abs(v.steer) > 0.25 && turn * v.steer < 0) {
    brain.hbTimer = 0.18 + rand() * 0.22;
    brain.hbCooldown = 1.6;
  }
  if (turnAbs > 0.6 && v.speed > 15 && brain.lift <= 0) brain.lift = 0.25;
  const handbrake = brain.hbTimer > 0 && Math.abs(v.slip) <= 0.85; // anti-spin release

  // speed control
  let throttle: number;
  if (brain.lift > 0) throttle = 0.15;
  else if (v.speed > targetSpeed * 1.12) throttle = -0.6;
  else if (v.speed > targetSpeed) throttle = 0;
  else throttle = 1;

  return { steerTarget, throttle, handbrake, active: true };
}
