/**
 * Offline bot test: three bots driven by botInput() with the same stepVehicle must finish
 * 3 laps with no crashes and no stuck recoveries.
 * Run with:  npx tsx scripts/bottest.mts
 */
import { Track, HALF_WIDTH, CURB_WIDTH, WALL_DIST } from '../src/game/track.ts';
import { botInput, collideVehicles, createBotBrain, createVehicle, stepVehicle } from '../src/game/slipEngine.ts';
import { DEFAULT_SLIP, SLIP_KMH } from '../src/game/tuning.ts';

const track = new Track();
const n = track.count;
const bounds = { halfWidth: HALF_WIDTH + CURB_WIDTH * 0.7, wall: WALL_DIST };
const botTuning = { ...DEFAULT_SLIP, turnRate: 3.0, gripNormal: 7, gripDrift: 1.5, driftBoost: 1.6, handbrake: 1.4, align: 3.0 };
const vmax = DEFAULT_SLIP.maxSpeed / SLIP_KMH;
const ratios = [0.8, 0.735, 0.67];

// deterministic RNG so runs are reproducible
let seed = 1234;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const bots = ratios.map((ratio, i) => {
  const idx = n - 6 - i * 5;
  const s = track.samples[idx];
  const lane = i % 2 === 0 ? -3.2 : 3.2;
  return { v: createVehicle(s.x + s.rx * lane, s.z + s.rz * lane, s.angle, idx), brain: createBotBrain(), lane, base: vmax * ratio, progress: idx - n, lastIdx: idx, crashes: 0, stuck: 0, stuckEvents: 0, slipMax: 0, driftTime: 0 };
});

const dt = 1 / 60;
let time = 0;
while (bots.some((b) => b.progress < 3 * n) && time < 500) {
  for (const b of bots) {
    if (b.progress >= 3 * n) continue;
    const s = track.samples[b.v.idx];
    const target = b.base * Math.max(0.62, 1 - s.aheadCurv * 9);
    const input = botInput(b.v, b.brain, track, b.lane, target, dt, rand);
    const res = stepVehicle(b.v, input, botTuning, track, bounds, dt);
    if (res.hit > 0) b.crashes++;
    let d = b.v.idx - b.lastIdx;
    if (d > n / 2) d -= n;
    else if (d < -n / 2) d += n;
    b.progress += d;
    b.lastIdx = b.v.idx;
    b.stuck = b.v.speed < 2.5 && time > 3 ? b.stuck + dt : 0;
    if (b.stuck > 2) {
      b.stuckEvents++;
      b.stuck = 0;
    }
    b.slipMax = Math.max(b.slipMax, Math.abs(b.v.slip));
    if (b.v.drifting && !b.v.onGrass) b.driftTime += dt;
  }
  for (let i = 0; i < bots.length; i++) for (let j = i + 1; j < bots.length; j++) collideVehicles(bots[i].v, bots[j].v, 1.15, rand);
  time += dt;
}

let pass = true;
bots.forEach((b, i) => {
  const ok = b.progress >= 3 * n && b.crashes === 0 && b.stuckEvents === 0;
  pass = pass && ok;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} bot${i} laps=${(b.progress / n).toFixed(2)} crashes=${b.crashes} stuck=${b.stuckEvents} ` +
      `slipMax=${((b.slipMax * 180) / Math.PI).toFixed(0)}° drift=${b.driftTime.toFixed(1)}s`,
  );
});
console.log(`total time ${time.toFixed(1)}s`);
process.exit(pass ? 0 : 1);
