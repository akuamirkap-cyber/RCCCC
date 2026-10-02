/**
 * Offline sanity test for the slip engine: a naive bang-bang controller must complete 3 laps.
 * Run with:  npx tsx scripts/simtest.mts
 */
import { Track, HALF_WIDTH, CURB_WIDTH, WALL_DIST } from '../src/game/track.ts';
import { createVehicle, stepVehicle } from '../src/game/slipEngine.ts';
import { DEFAULT_SLIP, SLIP_PRESETS, SLIP_KMH } from '../src/game/tuning.ts';

const track = new Track();
const n = track.count;
const bounds = { halfWidth: HALF_WIDTH + CURB_WIDTH * 0.7, wall: WALL_DIST };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function run(name: string, tuning = DEFAULT_SLIP, dt = 1 / 60) {
  const start = track.samples[n - 6];
  const v = createVehicle(start.x, start.z, start.angle, n - 6);
  let progress = 0;
  let lastIdx = v.idx;
  let time = 0;
  let crashes = 0;
  let slipMax = 0;
  let driftTime = 0;
  let topSpeed = 0;
  while (progress < 3 * n && time < 400) {
    // bang-bang toward a look-ahead point on the centerline, handbrake into big corners
    const look = track.samples[(v.idx + Math.round(8 + v.speed * 0.8)) % n];
    const desired = Math.atan2(look.x - v.x, look.z - v.z);
    const err = wrap(desired - v.heading);
    const steerTarget = err > 0.05 ? -1 : err < -0.05 ? 1 : 0;
    let turn = 0;
    for (let k = 4; k <= 26; k++) turn += track.samples[(v.idx + k) % n].curv * track.spacing;
    const handbrake = Math.abs(turn) > 0.5 && v.speed > 12 && Math.abs(v.slip) < 0.85 && turn * steerTarget < 0;
    const res = stepVehicle(v, { steerTarget, throttle: Math.abs(turn) > 0.9 && v.speed > 14 ? 0.2 : 1, handbrake, active: true }, tuning, track, bounds, dt);
    if (res.hit > 0) crashes++;
    let d = v.idx - lastIdx;
    if (d > n / 2) d -= n;
    else if (d < -n / 2) d += n;
    progress += d;
    lastIdx = v.idx;
    time += dt;
    slipMax = Math.max(slipMax, Math.abs(v.slip));
    topSpeed = Math.max(topSpeed, v.speed);
    if (v.drifting && !v.onGrass) driftTime += dt;
  }
  const ok = progress >= 3 * n;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name.padEnd(14)} laps=${(progress / n).toFixed(2)} time=${time.toFixed(1)}s crashes=${crashes} ` +
      `slipMax=${((slipMax * 180) / Math.PI).toFixed(0)}° drift=${driftTime.toFixed(1)}s top=${(topSpeed * SLIP_KMH).toFixed(0)}km/h dt=${(1 / dt).toFixed(0)}fps`,
  );
  return ok;
}

let pass = true;
for (const p of SLIP_PRESETS) pass = run(p.name, p.tuning) && pass;
pass = run('Master@30fps', DEFAULT_SLIP, 1 / 30) && pass;
process.exit(pass ? 0 : 1);
