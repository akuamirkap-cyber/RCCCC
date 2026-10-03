/**
 * Offline headless test untuk AI rival Sakura RC Drift (tanpa browser/WebGL).
 * Menjalankan 5 bot + 1 "pemain" pasif selama 3 lap di setiap sirkuit Aula dan
 * mengukur: lap selesai, waktu per lap, kedekatan ke pembatas, kehalusan setir
 * (jerk), kontak antar bot, lama recovery, dan seberapa beragam gaya tiap bot.
 *
 * Jalankan:  node scripts/sakuraBotTest.mts
 */
import * as THREE from 'three';
import { RC_CIRCUITS, ENEMY_BOTS_DATA } from '../src/games/sakura_rc/data/circuitsAndCars.ts';
import {
  buildBotTrack,
  carSpheres,
  createBotBrain,
  deepestSphereContact,
  personalityFromSpec,
  resolveSoftContact,
  stepBotAI,
  type BotNeighbor,
  type CarSphere,
  type SphereContact,
  type ContactResult,
} from '../src/games/sakura_rc/utils/botAi.ts';

// RNG deterministik supaya hasil bisa direproduksi
let seed = 20261003;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

function buildCurve(controlPoints: [number, number][]) {
  const pts = controlPoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const raw = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
  const dense: THREE.Vector3[] = [];
  const denseCount = 96;
  for (let i = 0; i < denseCount; i++) dense.push(raw.getPointAt(i / denseCount));
  for (let pass = 0; pass < 2; pass++) {
    const next = dense.map((_, idx) => {
      const p = dense[(idx - 1 + denseCount) % denseCount];
      const c = dense[idx];
      const n = dense[(idx + 1) % denseCount];
      return new THREE.Vector3(p.x * 0.22 + c.x * 0.56 + n.x * 0.22, 0, p.z * 0.22 + c.z * 0.56 + n.z * 0.22);
    });
    for (let i = 0; i < denseCount; i++) dense[i].copy(next[i]);
  }
  return new THREE.CatmullRomCurve3(dense, true, 'centripetal', 0.5);
}

interface Metrics {
  name: string;
  laps: number;
  lapTimes: number[];
  minWallGap: number;
  wallTime: number; // detik dengan jarak ke pembatas < 0.6m
  recoveryTime: number;
  reverseCount: number;
  maxJerk: number; // perubahan angularVel per detik
  avgSpeed: number;
  maxDrift: number;
  contacts: number;
  states: Record<string, number>;
  lateralSamples: number[];
}

function runCircuit(circuitIdx: number, dt: number, durationS: number) {
  const circuit = RC_CIRCUITS[circuitIdx];
  const curve = buildCurve(circuit.controlPoints as [number, number][]);
  const N = 640;
  const frames: { x: number; z: number }[] = [];
  for (let i = 0; i < N; i++) {
    const p = curve.getPointAt(i / N);
    frames.push({ x: p.x, z: p.z });
  }
  const halfWidth = circuit.trackWidth * 0.5;
  const track = buildBotTrack(frames, halfWidth, true);
  const SAFE = 1.3;

  const bots = ENEMY_BOTS_DATA.map((def, i) => {
    const t = (def.startGridT + 1) % 1;
    const tan = curve.getTangentAt(t).normalize();
    const n = new THREE.Vector3(-tan.z, 0, tan.x);
    const p = curve.getPointAt(t).clone().addScaledVector(n, def.startGridOffset);
    const brain = createBotBrain(p, Math.atan2(tan.x, tan.z), t, def.startGridOffset);
    const personality = personalityFromSpec(def, i);
    const m: Metrics = {
      name: def.shortName,
      laps: 1,
      lapTimes: [],
      minWallGap: 99,
      wallTime: 0,
      recoveryTime: 0,
      reverseCount: 0,
      maxJerk: 0,
      avgSpeed: 0,
      maxDrift: 0,
      contacts: 0,
      states: {},
      lateralSamples: [],
    };
    return { def, brain, personality, m, lastT: t, lapStart: 0, prevAngVel: 0, prevReverse: false, speedAcc: 0, n: 0 };
  });

  // Pemain pasif: diam di grid (bot harus bisa menghindar / tetap lewat).
  const pT = 0.012;
  const pTan = curve.getTangentAt(pT).normalize();
  const pNorm = new THREE.Vector3(-pTan.z, 0, pTan.x);
  const playerPos = curve.getPointAt(pT).clone().addScaledVector(pNorm, -2.0);
  const playerHeading = Math.atan2(pTan.x, pTan.z);
  const playerBody = { pos: playerPos, vel: new THREE.Vector3(), heading: playerHeading, invMass: 0.82, kick: null };

  const sphereBufs: CarSphere[][] = bots.map(() => [0, 1, 2].map(() => ({ offset: 0, x: 0, z: 0, radius: 0 })));
  const playerSph: CarSphere[] = [0, 1, 2].map(() => ({ offset: 0, x: 0, z: 0, radius: 0 }));
  const cbuf: SphereContact = { nx: 1, nz: 0, penetration: 0, cx: 0, cz: 0, offsetA: 0, offsetB: 0 };
  const cres: ContactResult = { impulse: 0, closingSpeed: 0, pushSign: 1 };
  const bodies = bots.map((b) => ({
    pos: b.brain.pos,
    vel: b.brain.vel,
    heading: 0,
    invMass: 1,
    kick: b.brain.kick,
    kickSpinSink: (dw: number) => {
      b.brain.kickSpin += dw;
    },
  }));

  let time = 0;
  const steps = Math.round(durationS / dt);
  let maxFrameSpike = 0;
  const stepCosts: number[] = [];
  for (let step = 0; step < steps; step++) {
    const t0 = performance.now();
    time += dt;
    bots.forEach((b, i) => {
      const neighbors: BotNeighbor[] = [];
      const add = (x: number, z: number, t: number, lat: number, spd: number, isPlayer: boolean) => {
        let d = t - b.lastT;
        if (d < -0.5) d += 1;
        if (d > 0.5) d -= 1;
        neighbors.push({ x, z, lateral: lat, aheadM: d * track.length, speed: spd, isPlayer });
      };
      add(playerPos.x, playerPos.z, pT, -2.0, 0, true);
      bots.forEach((o, j) => j !== i && add(o.brain.pos.x, o.brain.pos.z, o.lastT, o.brain.lateral, o.brain.speed, false));

      stepBotAI(b.brain, b.personality, track, {
        dt,
        time,
        active: true,
        paceScale: 1.35, // preset 'sedang'
        gapToPlayerM: 0,
        neighbors,
        zones: circuit.clippingZones.map((z) => ({ t: z.t, offset: z.offset })),
        isLeader: i === 0,
        rand,
        safeMargin: SAFE,
      });

      const T = b.brain.trackT;
      if (b.lastT > 0.85 && T < 0.15) {
        b.m.laps++;
        b.m.lapTimes.push(time - b.lapStart);
        b.lapStart = time;
      }
      b.lastT = T;

      const gap = halfWidth - Math.abs(b.brain.lateral);
      b.m.minWallGap = Math.min(b.m.minWallGap, gap);
      if (gap < 0.6) b.m.wallTime += dt;
      if (b.brain.recovery > 0.3) b.m.recoveryTime += dt;
      const rev = b.brain.reverseTimer > 0;
      if (rev && !b.prevReverse) b.m.reverseCount++;
      b.prevReverse = rev;
      const jerk = Math.abs(b.brain.angularVel - b.prevAngVel) / dt;
      b.prevAngVel = b.brain.angularVel;
      if (time > 2) b.m.maxJerk = Math.max(b.m.maxJerk, jerk);
      b.speedAcc += b.brain.speed;
      b.n++;
      b.m.maxDrift = Math.max(b.m.maxDrift, b.brain.driftDegAbs);
      b.m.states[b.brain.tacticalState] = (b.m.states[b.brain.tacticalState] ?? 0) + dt;
      if (step % 30 === 0) b.m.lateralSamples.push(b.brain.lateral);
    });

    // Kontak
    carSpheres(playerPos.x, playerPos.z, playerHeading, playerSph);
    bots.forEach((b, i) => {
      bodies[i].heading = b.brain.heading;
      carSpheres(b.brain.pos.x, b.brain.pos.z, b.brain.heading, sphereBufs[i]);
    });
    bots.forEach((b, i) => {
      const c = deepestSphereContact(playerSph, sphereBufs[i], cbuf);
      if (c) resolveSoftContact(playerBody, bodies[i], c.nx, c.nz, c.penetration, dt, undefined, cres);
      for (let j = i + 1; j < bots.length; j++) {
        const cc = deepestSphereContact(sphereBufs[i], sphereBufs[j], cbuf);
        if (cc) {
          resolveSoftContact(bodies[i], bodies[j], cc.nx, cc.nz, cc.penetration, dt, undefined, cres);
          if (cres.closingSpeed > 1.5) {
            b.m.contacts++;
            bots[j].m.contacts++;
          }
        }
      }
    });
    const cost = performance.now() - t0;
    maxFrameSpike = Math.max(maxFrameSpike, cost);
    stepCosts.push(cost);
  }

  console.log(`\n=== ${circuit.name} (width ${circuit.trackWidth}m, length ${track.length.toFixed(0)}m) ===`);
  stepCosts.sort((a, b) => a - b);
  const p99 = stepCosts[Math.floor(stepCosts.length * 0.99)];
  console.log(`sim step cost (5 bots + kontak): p99=${p99.toFixed(3)} ms, max=${maxFrameSpike.toFixed(2)} ms`);
  let ok = true;
  for (const b of bots) {
    b.m.avgSpeed = b.speedAcc / Math.max(1, b.n);
    const lapStr = b.m.lapTimes.map((x) => x.toFixed(1)).join(' / ');
    const stateStr = Object.entries(b.m.states)
      .sort((a, c) => c[1] - a[1])
      .map(([k, v]) => `${k}:${((v / time) * 100).toFixed(0)}%`)
      .join(' ');
    // Varians lateral lintas lap = indikator garis tidak monoton
    const lat = b.m.lateralSamples;
    const mean = lat.reduce((a, c) => a + c, 0) / lat.length;
    const sd = Math.sqrt(lat.reduce((a, c) => a + (c - mean) ** 2, 0) / lat.length);
    console.log(
      `${b.m.name.padEnd(16)} laps=${b.m.laps - 1} [${lapStr}] avgV=${b.m.avgSpeed.toFixed(1)} maxDrift=${b.m.maxDrift.toFixed(0)}° ` +
        `minWallGap=${b.m.minWallGap.toFixed(2)}m wall<0.6m=${b.m.wallTime.toFixed(1)}s recov=${b.m.recoveryTime.toFixed(1)}s ` +
        `reverse=${b.m.reverseCount} maxJerk=${b.m.maxJerk.toFixed(1)} contacts=${b.m.contacts} latSD=${sd.toFixed(2)} | ${stateStr}`
    );
    if (b.m.laps - 1 < 3) {
      ok = false;
      console.log(`   !! ${b.m.name} tidak menyelesaikan 3 lap`);
    }
    if (b.m.minWallGap < SAFE - 0.75) {
      ok = false;
      console.log(`   !! ${b.m.name} terlalu mepet pembatas (${b.m.minWallGap.toFixed(2)}m)`);
    }
    if (b.m.wallTime > 1.5) {
      ok = false;
      console.log(`   !! ${b.m.name} menempel pembatas ${b.m.wallTime.toFixed(1)}s`);
    }
    if (b.m.maxJerk > 60) {
      ok = false;
      console.log(`   !! ${b.m.name} gerakan menyentak (jerk ${b.m.maxJerk.toFixed(0)})`);
    }
  }
  // Keberagaman: waktu lap rata-rata antar bot harus berbeda, bukan identik
  const avgLaps = bots.map((b) => {
    const full = b.m.lapTimes.filter((x) => x > 5);
    return full.reduce((a, c) => a + c, 0) / Math.max(1, full.length);
  });
  const spread = Math.max(...avgLaps) - Math.min(...avgLaps);
  console.log(`lap-time spread antar bot: ${spread.toFixed(2)}s  (avg laps: ${avgLaps.map((x) => x.toFixed(1)).join(', ')})`);
  if (spread < 0.4) {
    ok = false;
    console.log('   !! semua bot terlalu seragam');
  }
  return ok;
}

// Uji juga dengan frame-rate berbeda: hasil harus tetap stabil.
let allOk = true;
for (let c = 0; c < RC_CIRCUITS.length; c++) {
  if (RC_CIRCUITS[c].id?.toString().toLowerCase().includes('haruna')) continue;
  allOk = runCircuit(c, 1 / 60, 150) && allOk;
}
console.log('\n--- 30fps stability check (circuit 0) ---');
allOk = runCircuit(0, 1 / 30, 120) && allOk;

console.log(allOk ? '\nALL BOT TESTS PASSED' : '\nSOME BOT TESTS FAILED');
process.exit(allOk ? 0 : 1);
