/**
 * SAKURA RC DRIFT — AUTONOMOUS PRO RIVAL BRAIN (headless-safe, zero DOM/WebGL)
 *
 * Kenapa dipisah jadi modul murni:
 *  1. Bisa diuji offline tanpa browser (scripts/sakuraBotTest.mts) — jadi kualitas
 *     AI rival bisa diukur angka, bukan cuma "dirasa".
 *  2. Performa: pencarian posisi di lintasan memakai lookup-table arc-length
 *     (sebelumnya 251x curve.getPointAt() per mobil per frame = frame spike yang
 *     bikin gerakan bot terasa "lag / kaku").
 *  3. Semua keputusan AI memakai waktu eksplisit (dt) + smoothing eksponensial,
 *     jadi hasilnya identik di 30fps maupun 144fps.
 *
 * Prinsip yang dipegang modul ini:
 *  - Bot TETAP bisa tabrakan (tidak ada auto-dodge sempurna), tapi respons
 *    kontaknya lembut (spring-damper + rate limit), bukan dorongan instan.
 *  - Bot menghormati pembatas: ada "safe margin" + tekanan lembut menjauhi dinding
 *    sebelum menyentuhnya, jadi tidak lagi menempel/menggesek pagar.
 *  - Bot yang keluar jalur punya fase recovery kontinu (bukan on/off) dengan
 *    titik re-entry menyudut, lalu menyambung lagi ke racing line secara mulus.
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// 0. Util matematika
// ---------------------------------------------------------------------------

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export const wrapAngle = (a: number) => {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
};

/** Smoothing eksponensial yang tidak tergantung besar-kecilnya dt. */
export const smoothTo = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-Math.max(0, rate) * dt));

/** Smoothstep 0..1 tanpa turunan patah — dipakai untuk blending line/recovery. */
export const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Value-noise 1D deterministik (halus, tanpa Math.random) untuk variasi "manusiawi". */
export const valueNoise = (seed: number, t: number) => {
  const i = Math.floor(t);
  const f = t - i;
  const h = (k: number) => {
    const x = Math.sin((i + k) * 127.1 + seed * 311.7) * 43758.5453123;
    return (x - Math.floor(x)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(0) * (1 - u) + h(1) * u;
};

/** Noise multi-oktaf: variasi garis balap yang tidak periodik/mudah ditebak. */
export const fbmNoise = (seed: number, t: number) =>
  valueNoise(seed, t) * 0.6 + valueNoise(seed + 17.3, t * 2.13) * 0.28 + valueNoise(seed + 41.9, t * 4.7) * 0.12;

// ---------------------------------------------------------------------------
// 1. Lookup-table lintasan (arc-length) — pengganti getPointAt() panas
// ---------------------------------------------------------------------------

export interface BotTrackFrame {
  x: number;
  z: number;
  /** Normal kiri lintasan: (-tz, tx) — konvensi sama dengan player di canvas. */
  nx: number;
  nz: number;
  heading: number;
  /** Jarak arc-length dari titik awal. */
  s: number;
}

export interface BotTrack {
  frames: BotTrackFrame[];
  length: number;
  halfWidth: number;
  closed: boolean;
  frameSpacing: number;
}

export interface TrackPoint {
  x: number;
  z: number;
  nx: number;
  nz: number;
  heading: number;
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

export function buildBotTrack(points: { x: number; z: number }[], halfWidth: number, closed: boolean): BotTrack {
  const n = points.length;
  const frames: BotTrackFrame[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const cur = points[i];
    const prevIdx = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
    const nextIdx = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    let tx = points[nextIdx].x - points[prevIdx].x;
    let tz = points[nextIdx].z - points[prevIdx].z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    if (i > 0) s += Math.hypot(cur.x - points[i - 1].x, cur.z - points[i - 1].z);
    frames.push({ x: cur.x, z: cur.z, nx: -tz, nz: tx, heading: Math.atan2(tx, tz), s });
  }
  if (closed) s += Math.hypot(points[0].x - points[n - 1].x, points[0].z - points[n - 1].z);
  const length = Math.max(1e-3, s);
  return {
    frames,
    length,
    halfWidth,
    closed,
    frameSpacing: length / Math.max(1, closed ? n : n - 1),
  };
}

export const wrapT = (track: BotTrack, t: number) => (track.closed ? t - Math.floor(t) : clamp(t, 0, 1));

/** Ambil frame lintasan pada parameter t (interpolasi linear antar sampel LUT). */
export function frameAt(track: BotTrack, t: number, out: TrackPoint): TrackPoint {
  const { frames } = track;
  const n = frames.length;
  const tt = wrapT(track, t);
  const target = tt * track.length;

  // Binary search frame yang memuat `target`.
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].s <= target) lo = mid;
    else hi = mid - 1;
  }
  const a = frames[lo];
  const bIdx = track.closed ? (lo + 1) % n : Math.min(n - 1, lo + 1);
  const b = frames[bIdx];
  const span = (track.closed && lo === n - 1 ? track.length - a.s : b.s - a.s) || 1;
  const f = clamp((target - a.s) / span, 0, 1);

  out.x = lerp(a.x, b.x, f);
  out.z = lerp(a.z, b.z, f);
  // Interpolasi arah lewat komponen vektor supaya tidak "melompat" di ±PI.
  const tx = lerp(Math.sin(a.heading), Math.sin(b.heading), f);
  const tz = lerp(Math.cos(a.heading), Math.cos(b.heading), f);
  const tl = Math.hypot(tx, tz) || 1;
  out.heading = Math.atan2(tx / tl, tz / tl);
  out.nx = -tz / tl;
  out.nz = tx / tl;
  return out;
}

function projectOnSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  const f = len2 > 1e-9 ? clamp(((px - ax) * abx + (pz - az) * abz) / len2, 0, 1) : 0;
  const cx = ax + abx * f;
  const cz = az + abz * f;
  return { f, d2: (px - cx) * (px - cx) + (pz - cz) * (pz - cz) };
}

export interface TrackProjection {
  t: number;
  /** Offset lateral bertanda (+ = ke arah normal kiri). */
  lateral: number;
  dist: number;
}

/**
 * Proyeksi posisi ke lintasan memakai jendela lokal di sekitar hint.
 * Jauh lebih murah & jauh lebih halus daripada pencarian global 240 langkah:
 * tidak ada lompatan indeks yang bikin setir bot bergetar.
 */
export function projectToTrack(track: BotTrack, px: number, pz: number, hintT: number, windowMeters = 45): TrackProjection {
  const { frames } = track;
  const n = frames.length;
  const spanFrames = Math.ceil(windowMeters / Math.max(0.35, track.frameSpacing)) + 3;
  const hintIdx = Math.round(wrapT(track, hintT) * (track.closed ? n : n - 1));

  let best = { d2: Infinity, f: 0, i: 0 };
  const scan = (from: number, to: number) => {
    for (let k = from; k < to; k++) {
      const i = track.closed ? ((k % n) + n) % n : clamp(k, 0, n - 2);
      const a = frames[i];
      const b = frames[track.closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const p = projectOnSeg(px, pz, a.x, a.z, b.x, b.z);
      if (p.d2 < best.d2) best = { d2: p.d2, f: p.f, i };
    }
  };

  scan(hintIdx - spanFrames, hintIdx + spanFrames + 1);
  // Fallback penuh (murah: cuma matematika vektor) kalau mobil terlempar jauh.
  if (Math.sqrt(best.d2) > 22) {
    best = { d2: Infinity, f: 0, i: 0 };
    scan(0, n - 1);
  }

  const a = frames[best.i];
  const b = frames[track.closed ? (best.i + 1) % n : Math.min(n - 1, best.i + 1)];
  const cx = lerp(a.x, b.x, best.f);
  const cz = lerp(a.z, b.z, best.f);
  const sAt = lerp(a.s, best.i === n - 1 && track.closed ? track.length : b.s, best.f);
  const nx = lerp(a.nx, b.nx, best.f);
  const nz = lerp(a.nz, b.nz, best.f);
  const nl = Math.hypot(nx, nz) || 1;
  return {
    t: wrapT(track, sAt / track.length),
    lateral: ((px - cx) * nx + (pz - cz) * nz) / nl,
    dist: Math.sqrt(best.d2),
  };
}

/** Kelengkungan bertanda (1/m). >0 = lintasan berbelok ke arah +normal-kanan. */
export function curvatureAt(track: BotTrack, t: number, windowM = 3.2): number {
  const d = windowM / track.length;
  const a = frameAt(track, t - d, SCRATCH_A);
  const ha = a.heading;
  const b = frameAt(track, t + d, SCRATCH_B);
  return wrapAngle(b.heading - ha) / (2 * windowM);
}

const SCRATCH_A: TrackPoint = { x: 0, z: 0, nx: 0, nz: 0, heading: 0 };
const SCRATCH_B: TrackPoint = { x: 0, z: 0, nx: 0, nz: 0, heading: 0 };

export interface CornerScan {
  /** Kelengkungan bertanda tikungan paling menuntut di depan. */
  curv: number;
  /** |kelengkungan| maksimum di depan. */
  maxAbsCurv: number;
  /** Jarak (m) ke titik kelengkungan maksimum itu. */
  dist: number;
  /** Kelengkungan tepat di posisi sekarang. */
  curvNow: number;
}

/** Pindai tikungan ke depan dalam satuan meter (bukan parameter t yang panjangnya beda tiap sirkuit). */
export function scanCornerAhead(track: BotTrack, t: number, distanceM: number, out: CornerScan): CornerScan {
  out.curvNow = curvatureAt(track, t, 2.6);
  out.maxAbsCurv = 0;
  out.curv = 0;
  out.dist = distanceM;
  const steps = clamp(Math.round(distanceM / 2.2), 2, 40);
  for (let i = 1; i <= steps; i++) {
    const d = (i / steps) * distanceM;
    const c = curvatureAt(track, t + d / track.length, 3.0 + d * 0.12);
    const abs = Math.abs(c);
    if (abs > out.maxAbsCurv) {
      out.maxAbsCurv = abs;
      out.curv = c;
      out.dist = d;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Kepribadian pembalap (turunan dari spec bot di circuitsAndCars.ts)
// ---------------------------------------------------------------------------

export type BrakingBias = 'late' | 'balanced' | 'early_apex' | 'trail';

export interface BotPersonalityInput {
  baseSpeed: number;
  lateralPreference: number;
  aggression: number;
  driftAngleFactor: number;
  counterSteerRate: number;
  brakingBias: BrakingBias;
  overtakeTendency: number;
  feintDriftChance: number;
  lineWanderRate: number;
  style: string;
}

export interface BotPersonality {
  baseSpeed: number;
  lateralPreference: number;
  aggression: number;
  driftAngleFactor: number;
  counterSteerRate: number;
  brakingBias: BrakingBias;
  overtakeTendency: number;
  feintDriftChance: number;
  lineWanderRate: number;
  /** Budget akselerasi lateral (m/s^2) → menentukan kecepatan tikungan. */
  grip: number;
  accelPower: number;
  brakePower: number;
  /** 0..1 — presisi & konsistensi. */
  skill: number;
  /** Lag persepsi (detik) — tiap bot "bereaksi" di waktu berbeda. */
  reactionTau: number;
  /** Gain servo setir (1/s). */
  steerAuthority: number;
  /** Kecepatan putar maksimum (rad/s). */
  maxTurnRate: number;
  seed: number;
}

interface StyleTrait {
  grip: number;
  accel: number;
  brake: number;
  skill: number;
  reaction: number;
  authority: number;
  turn: number;
}

// Catatan skala: pemain Sakura RC hampir tidak pernah mengerem (cukup W+A/D),
// karena model grip-nya mengejar heading tanpa kehilangan kecepatan. Supaya bot
// setara, budget akselerasi lateral (grip) dibuat besar: bot menahan gas di
// hampir semua tikungan dan hanya "angkat gas" di hairpin paling tajam.
const STYLE_TRAITS: Record<string, StyleTrait> = {
  aggressive_dive: { grip: 31, accel: 27, brake: 11.5, skill: 0.76, reaction: 0.155, authority: 7.2, turn: 3.9 },
  smooth_momentum: { grip: 40, accel: 24, brake: 9.0, skill: 0.9, reaction: 0.085, authority: 5.8, turn: 3.1 },
  tactical_cutter: { grip: 37, accel: 25.5, brake: 10.5, skill: 0.95, reaction: 0.07, authority: 6.6, turn: 3.4 },
  apex_gutter: { grip: 38, accel: 25, brake: 10.0, skill: 0.86, reaction: 0.1, authority: 7.6, turn: 3.8 },
  heavy_power: { grip: 30, accel: 28, brake: 10.5, skill: 0.72, reaction: 0.175, authority: 6.8, turn: 4.0 },
};

const DEFAULT_TRAIT: StyleTrait = { grip: 36, accel: 25.5, brake: 10.0, skill: 0.82, reaction: 0.11, authority: 6.6, turn: 3.5 };

/** Bias pengereman → seberapa tinggi kecepatan masuk tikungan yang berani diambil. */
const BRAKING_K: Record<BrakingBias, number> = { late: 1.22, balanced: 1.0, early_apex: 0.86, trail: 1.08 };

/**
 * Kecepatan dasar mobil pemain Sakura RC Pro (m/s, sebelum speedLevel/turbo) —
 * sama dengan konstanta `maxSpeed` di canvas. Bot memakai angka yang sama
 * supaya "secepat pemain", bukan angka terpisah yang terasa lambat.
 */
export const PLAYER_BASE_SPEED = 22.5;
/** Pemain Sakura RC bisa menahan turbo di lurusan (x1.18); bot dapat sebagian. */
export const BOT_TURBO_SHARE = 1.1;
/** Bot minimal selalu memakai pace preset "sedang" (speedFactor 1.35). */
export const BOT_MIN_PACE = 1.35;

export function personalityFromSpec(spec: BotPersonalityInput, index: number): BotPersonality {
  const trait = STYLE_TRAITS[spec.style] ?? DEFAULT_TRAIT;
  const skill = clamp(trait.skill - spec.lineWanderRate * 0.22 + (1 - spec.aggression) * 0.06, 0.42, 0.98);
  return {
    // Top speed per bot: formula pemain x sedikit variasi karakter (±3%).
    baseSpeed: PLAYER_BASE_SPEED * BOT_TURBO_SHARE * (0.985 + spec.aggression * 0.03 + (spec.baseSpeed - 25) * 0.02),
    lateralPreference: spec.lateralPreference,
    aggression: spec.aggression,
    driftAngleFactor: spec.driftAngleFactor,
    counterSteerRate: spec.counterSteerRate,
    brakingBias: spec.brakingBias,
    overtakeTendency: spec.overtakeTendency,
    feintDriftChance: spec.feintDriftChance,
    lineWanderRate: spec.lineWanderRate,
    grip: trait.grip * (0.94 + skill * 0.12),
    accelPower: trait.accel * (0.9 + spec.aggression * 0.22),
    brakePower: trait.brake * BRAKING_K[spec.brakingBias] * (0.92 + skill * 0.16),
    skill,
    reactionTau: trait.reaction * (1.45 - skill * 0.55),
    steerAuthority: trait.authority * (0.9 + skill * 0.2),
    maxTurnRate: trait.turn,
    seed: index * 13.719 + spec.baseSpeed * 3.1,
  };
}

// ---------------------------------------------------------------------------
// 3. State runtime bot
// ---------------------------------------------------------------------------

export interface BotBrainState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  heading: number;
  velocityAngle: number;
  angularVel: number;
  speed: number;

  /** Sisa dorongan dari tabrakan — meluruh halus, bukan lompatan instan. */
  kick: THREE.Vector3;
  kickSpin: number;

  trackT: number;
  lateral: number;
  /** 0 = balapan normal, 1 = mode pemulihan penuh. */
  recovery: number;
  /** 0..1 seberapa menempel ke pembatas (untuk memangkas kecepatan & sudut). */
  wallPressure: number;

  lateralTarget: number;
  lateralSmooth: number;
  aim: THREE.Vector3;
  aimReady: boolean;

  /** Input yang sudah di-lag (simulasi waktu reaksi). */
  errPerceived: number;
  errRate: number;
  slipSmooth: number;
  curvPerceived: number;

  overtakeOffset: number;
  overtakeTimer: number;
  overtakeHold: number;
  tacticalState: 'racing' | 'overtaking' | 'defending' | 'feint_entry' | 'recovering' | 'reversing';

  feintTimer: number;
  feintPhase: number;

  paceBias: number;
  contactTimer: number;
  contactSide: number;
  stallTimer: number;
  reverseTimer: number;
  mistakeTimer: number;
  mistakeNext: number;
  mistakeOffset: number;
  progressM: number;
  prevTrackT: number;
  /** Diagnostik (dipakai HUD + test offline). */
  driftDegSigned: number;
  driftDegAbs: number;
  frontSteerAngle: number;
  targetSpeed: number;
  lastContactImpulse: number;
}

export function createBotBrain(pos: THREE.Vector3, heading: number, trackT: number, lateral: number): BotBrainState {
  return {
    pos: pos.clone(),
    vel: new THREE.Vector3(),
    heading,
    velocityAngle: heading,
    angularVel: 0,
    speed: 0,
    kick: new THREE.Vector3(),
    kickSpin: 0,
    trackT,
    lateral,
    recovery: 0,
    wallPressure: 0,
    lateralTarget: lateral,
    lateralSmooth: lateral,
    aim: pos.clone(),
    aimReady: false,
    errPerceived: 0,
    errRate: 0,
    slipSmooth: 0,
    curvPerceived: 0,
    overtakeOffset: 0,
    overtakeTimer: 0,
    overtakeHold: 0,
    tacticalState: 'racing',
    feintTimer: 0,
    feintPhase: 0,
    paceBias: 1,
    contactTimer: 0,
    contactSide: 0,
    stallTimer: 0,
    reverseTimer: 0,
    mistakeTimer: 0,
    mistakeNext: 14,
    mistakeOffset: 0,
    progressM: 0,
    prevTrackT: trackT,
    driftDegSigned: 0,
    driftDegAbs: 0,
    frontSteerAngle: 0,
    targetSpeed: 0,
    lastContactImpulse: 0,
  };
}

export interface BotNeighbor {
  x: number;
  z: number;
  lateral: number;
  /** Jarak arc-length di depan bot ini (meter, + = di depan). */
  aheadM: number;
  /** Kecepatan skalar mobil tetangga (m/s) — dipakai untuk menjaga jarak ikut. */
  speed: number;
  isPlayer: boolean;
}

export interface BotZone {
  t: number;
  /** -1..1 relatif ke setengah lebar lintasan. */
  offset: number;
}

export interface BotStepInput {
  dt: number;
  time: number;
  active: boolean;
  /** speedLevel x botPace. */
  paceScale: number;
  /** Gap ke pemain dalam meter (positif = bot di depan pemain). */
  gapToPlayerM: number;
  neighbors: BotNeighbor[];
  zones: BotZone[];
  isLeader: boolean;
  rand: () => number;
  /** Jarak aman ke pembatas (meter). */
  safeMargin: number;
}

// Konstanta rasa berkendara — disatukan di sini supaya mudah di-tune.
export const BOT_TUNING = {
  /** Batas lateral nyaman; di luar ini recovery mulai masuk (kontinu). */
  grooveInset: 1.15,
  /** Mulai ada "tekanan" menjauhi dinding. */
  edgePressureStart: 2.7,
  /** Batas fisik lunak: bot boleh menyentuh, tapi tidak menembus. */
  softWallInset: 0.85,
  maxSlipRad: 1.18,
  cornerSpeedFloor: 10.5,
};

// ---------------------------------------------------------------------------
// 4. Langkah AI utama
// ---------------------------------------------------------------------------

const P_CUR: TrackPoint = { x: 0, z: 0, nx: 0, nz: 0, heading: 0 };
const P_AIM: TrackPoint = { x: 0, z: 0, nx: 0, nz: 0, heading: 0 };
const P_REENTRY: TrackPoint = { x: 0, z: 0, nx: 0, nz: 0, heading: 0 };
const SCAN: CornerScan = { curv: 0, maxAbsCurv: 0, dist: 0, curvNow: 0 };

export function stepBotAI(s: BotBrainState, p: BotPersonality, track: BotTrack, input: BotStepInput): void {
  const dt = clamp(input.dt, 1 / 240, 1 / 20);
  const time = input.time;
  const halfWidth = track.halfWidth;
  const maxLat = Math.max(1.4, halfWidth - input.safeMargin);

  // --- A. Lokasi di lintasan (LUT, jendela lokal) ---------------------------
  const proj = projectToTrack(track, s.pos.x, s.pos.z, s.trackT, 26 + s.speed * 1.4);
  s.trackT = proj.t;
  s.lateral = proj.lateral;
  frameAt(track, s.trackT, P_CUR);

  const absLat = Math.abs(s.lateral);
  const latSign = Math.sign(s.lateral) || 1;
  const headingDiff = wrapAngle(s.heading - P_CUR.heading);
  const wrongWay = Math.abs(headingDiff) > Math.PI * 0.46;

  // --- B. Pemindaian tikungan (meter, bukan parameter t) --------------------
  const brakeLook = clamp((s.speed * s.speed) / (2 * Math.max(4, p.brakePower * 0.8)) + 7, 9, 70);
  scanCornerAhead(track, s.trackT, brakeLook, SCAN);
  // Kelengkungan yang "dirasakan" — di-lag sesuai waktu reaksi tiap pembalap.
  // Waktu reaksi efektif mengecil saat cepat (pembalap pro "melihat" lebih jauh).
  const reactTau = p.reactionTau * clamp(20 / Math.max(8, s.speed), 0.45, 1);
  s.curvPerceived = smoothTo(s.curvPerceived, SCAN.curvNow, 1 / Math.max(0.03, reactTau), dt);

  const inCorner = clamp(Math.abs(SCAN.curvNow) / 0.035, 0, 1);
  const preCorner = clamp(SCAN.maxAbsCurv / 0.035, 0, 1) * (1 - inCorner);
  const cornerDist = SCAN.dist;

  // --- C. Recovery kontinu (bukan saklar on/off) ---------------------------
  const groove = halfWidth - BOT_TUNING.grooveInset;
  const fullyOut = halfWidth + 0.35;
  const offAmount = clamp((absLat - groove) / Math.max(0.5, fullyOut - groove), 0, 1);
  const recoveryTarget = Math.max(smoothstep(offAmount), wrongWay ? 1 : 0);
  s.recovery = smoothTo(s.recovery, recoveryTarget, recoveryTarget > s.recovery ? 5.2 : 2.4, dt);

  // Tekanan dinding: bot "merasakan" pagar sebelum menyentuhnya.
  const edgeStart = halfWidth - BOT_TUNING.edgePressureStart;
  // Prediksi lateral ~0.55 s ke depan: bot mengantisipasi pembatas, bukan
  // bereaksi setelah menyentuhnya (inilah yang membuatnya tidak mepet pagar).
  const latVel = s.vel.x * P_CUR.nx + s.vel.z * P_CUR.nz;
  const predLat = s.lateral + latVel * 0.55;
  const predAbs = Math.max(absLat, Math.abs(predLat) * (Math.sign(predLat) === latSign ? 1 : 0));
  const nearEdge = clamp((predAbs - edgeStart) / Math.max(0.4, BOT_TUNING.edgePressureStart - input.safeMargin), 0, 1);
  s.wallPressure = smoothTo(s.wallPressure, nearEdge * nearEdge, nearEdge > s.wallPressure ? 10 : 5, dt);

  // --- D. Kesalahan kecil yang manusiawi (jarang, lalu dikoreksi rapi) ------
  s.mistakeNext -= dt;
  if (s.mistakeNext <= 0 && input.rand() < 0.5) {
    s.mistakeNext = 16 + input.rand() * 34 * (0.5 + p.skill);
    s.mistakeTimer = 0;
    s.mistakeOffset = 0;
  } else if (s.mistakeNext <= 0) {
    s.mistakeNext = 12 + input.rand() * 20 * (0.6 + p.skill);
    s.mistakeTimer = 0.55 + input.rand() * 0.75;
    s.mistakeOffset = (input.rand() < 0.5 ? -1 : 1) * (0.5 + input.rand() * 0.85) * (1.15 - p.skill);
  }
  const mistakeBlend = s.mistakeTimer > 0 ? Math.sin(clamp(1 - s.mistakeTimer / 1.2, 0, 1) * Math.PI) : 0;
  s.mistakeTimer = Math.max(0, s.mistakeTimer - dt);

  // --- D2. Jaga jarak ikut (pro tidak menyeruduk mobil di depannya) ---------
  // Kalau ada mobil tepat di depan pada jalur yang sama, kecepatan dibatasi
  // mendekati kecepatan mobil itu; ruang untuk menyalip dibuka lewat offset
  // lateral (bagian G), bukan dengan menabrak dari belakang.
  let followCap = Number.POSITIVE_INFINITY;
  for (const nb of input.neighbors) {
    if (nb.aheadM <= 0.3 || nb.aheadM > 18) continue;
    const latGap = Math.abs(nb.lateral - s.lateral);
    if (latGap > 2.3) continue;
    const overlap = 1 - clamp((latGap - 1.2) / 1.1, 0, 1); // 1 = tepat di belakang
    const desiredGap = 3.4 + s.speed * 0.2 * (1 - p.aggression * 0.45);
    const cap = Math.max(nb.speed, 0) + (nb.aheadM - desiredGap) * 1.25;
    // Blend: makin tepat di belakang, makin ketat batasnya.
    const blended = lerp(p.baseSpeed * input.paceScale * 1.5, cap, overlap);
    followCap = Math.min(followCap, blended);
  }

  // --- E. Kecepatan target: model tikungan + rubber-band halus --------------
  const vCorner =
    SCAN.maxAbsCurv > 1e-4
      ? Math.sqrt((p.grip * BRAKING_K[p.brakingBias]) / SCAN.maxAbsCurv)
      : Number.POSITIVE_INFINITY;
  // Bot yang mepet dinding tidak boleh tetap ngebut.
  const topSpeed = p.baseSpeed * input.paceScale;
  const wallSpeedCap = lerp(topSpeed, BOT_TUNING.cornerSpeedFloor + 5, s.wallPressure * 0.85);
  const recoverySpeedCap = lerp(topSpeed, wrongWay ? 8 : 13, s.recovery);

  // Rubber-band kontinu terhadap pemain (tanpa lonjakan 0.95/1.02/1.08).
  const rubberTarget = 1 - clamp(input.gapToPlayerM / 85, -1, 1) * 0.075;
  s.paceBias = smoothTo(s.paceBias, rubberTarget, 0.9, dt);

  // Pace noise halus per bot: ritme tiap lap tidak pernah persis sama.
  const paceNoise = 1 + fbmNoise(p.seed + 5.5, time * 0.055) * 0.028 * (1.25 - p.skill);
  // Saat sudah berkomitmen menyalip (sudah bergeser ke sisi), bot menambah
  // dorongan sedikit supaya manuvernya tuntas — bukan menggantung di samping.
  const overtakeBoost = s.overtakeHold > 0 && s.tacticalState === 'overtaking' ? 1 + 0.06 * p.overtakeTendency : 1;
  const rawTarget = Math.min(
    p.baseSpeed * input.paceScale * s.paceBias * paceNoise * overtakeBoost,
    vCorner,
    wallSpeedCap,
    recoverySpeedCap,
    Math.max(followCap, 4.5)
  );
  s.targetSpeed = Math.max(input.active ? 2.2 : 0, rawTarget);

  // Integrasi kecepatan dengan batas akselerasi/rem → tidak ada lonjakan.
  if (!input.active) {
    s.speed = smoothTo(s.speed, 0, 4, dt);
  } else if (s.reverseTimer > 0) {
    s.speed = smoothTo(s.speed, -3.4, 9, dt);
  } else if (s.speed < s.targetSpeed) {
    const traction = 1 - clamp(Math.abs(s.slipSmooth) / 1.6, 0, 0.45);
    s.speed = Math.min(s.targetSpeed, s.speed + p.accelPower * traction * dt);
  } else {
    // Gaya W/A/D: kelebihan kecepatan kecil cukup "angkat gas" (coast ~ decel
    // lepas gas pemain 9.5 m/s^2). Rem sungguhan hanya kalau jauh di atas
    // target (hairpin / mepet pembatas / recovery).
    const over = s.speed - s.targetSpeed;
    const brakeNeed = clamp((over - 3.5) / 6, 0, 1);
    const decel = 9.5 * 0.6 + p.brakePower * brakeNeed;
    s.speed = Math.max(s.targetSpeed, s.speed - decel * dt);
  }

  // --- F. Garis balap: outside → inside → outside, selalu di dalam koridor --
  let line = 0;
  const apexAmp = maxLat * (0.34 + 0.16 * inCorner);
  line += -Math.sign(SCAN.curvNow || 1) * apexAmp * inCorner;
  line += Math.sign(SCAN.curv || 1) * maxLat * 0.3 * preCorner * clamp(cornerDist / 26, 0, 1);

  // Zona clipping D1GP: bot benar-benar memburu clip, tapi stagger antar bot.
  for (const cz of input.zones) {
    let dAhead = cz.t - s.trackT;
    if (track.closed) {
      if (dAhead < -0.5) dAhead += 1;
      if (dAhead > 0.5) dAhead -= 1;
    }
    if (dAhead >= -0.012 && dAhead <= 0.13) {
      line = cz.offset * (halfWidth - 1.35);
      break;
    }
  }

  line += p.lateralPreference * maxLat * 0.3;

  // Feint / Scandinavian flick: hanya saat akan masuk tikungan, timing per bot.
  if (preCorner > 0.35 && cornerDist < 16 && s.feintTimer <= 0 && input.rand() < p.feintDriftChance * dt * 2.2) {
    s.feintTimer = 0.26 + input.rand() * 0.12;
    s.feintPhase = Math.sign(SCAN.curv || 1);
  }
  if (s.feintTimer > 0) {
    s.feintTimer -= dt;
    line += s.feintPhase * halfWidth * 0.24;
  }

  // Variasi garis "manusiawi": noise halus berfrekuensi unik per bot.
  line += fbmNoise(p.seed, time * 0.13) * maxLat * 0.24 * p.lineWanderRate * (1 - s.recovery);
  line += s.mistakeOffset * mistakeBlend * (1 - s.recovery);

  // --- G. Lalu lintas: salip cerdas / bertahan / tidak saling jepit ---------
  let carAhead: BotNeighbor | null = null;
  let closestAhead = 999;
  let carBehindClose = false;
  const occupied: number[] = [];
  for (const nb of input.neighbors) {
    if (Math.abs(nb.lateral) < halfWidth + 1) occupied.push(nb.lateral);
    if (nb.aheadM > 0.4 && nb.aheadM < closestAhead && nb.aheadM < 26) {
      closestAhead = nb.aheadM;
      carAhead = nb;
    }
    if (nb.aheadM < -0.4 && nb.aheadM > -7) carBehindClose = true;
  }

  s.overtakeTimer -= dt;
  s.overtakeHold -= dt;
  if (s.recovery > 0.12 || s.reverseTimer > 0) {
    s.tacticalState = s.reverseTimer > 0 ? 'reversing' : 'recovering';
    s.overtakeOffset = smoothTo(s.overtakeOffset, 0, 5, dt);
    s.overtakeTimer = Math.max(s.overtakeTimer, 0.6);
  } else if (carAhead && closestAhead < 17) {
    const aheadNb = carAhead;
    const sideBlocked = (side: number) =>
      occupied.some((lat) => Math.sign(lat) === side && Math.abs(Math.abs(lat) - Math.abs(side * maxLat * 0.42)) < 1.5);
    if (s.overtakeHold <= 0 && s.overtakeTimer <= 0 && input.rand() < p.overtakeTendency) {
      s.overtakeTimer = 2.0 + input.rand() * 2.6;
      let preferred = 0;
      switch (true) {
        case p.brakingBias === 'late' && p.aggression > 0.8:
          preferred = -Math.sign(aheadNb.lateral || 1);
          break;
        case p.lateralPreference > 0.2:
          preferred = -Math.sign(SCAN.curv || 1);
          break;
        case p.lateralPreference < -0.2:
          preferred = Math.sign(aheadNb.lateral || -1);
          break;
        default:
          preferred = aheadNb.lateral > 0 ? -1 : 1;
      }
      // Kalau sisi favorit tertutup, ambil sisi lain — inilah bagian "pinter".
      if (sideBlocked(preferred) && !sideBlocked(-preferred)) preferred = -preferred;
      s.overtakeOffset = preferred * maxLat * 0.42;
      s.overtakeHold = 1.6 + input.rand() * 1.8;
    }
    s.tacticalState = 'overtaking';
  } else if (input.isLeader || carBehindClose) {
    const guard = -Math.sign(SCAN.curv || 1) * maxLat * 0.26;
    s.overtakeOffset = smoothTo(s.overtakeOffset, guard, 2.6, dt);
    s.tacticalState = 'defending';
  } else {
    s.overtakeOffset = smoothTo(s.overtakeOffset, 0, 1.8, dt);
    s.tacticalState = 'racing';
  }
  line += s.overtakeOffset;

  // Saling memberi ruang kalau benar-benar berdampingan (tetap bisa bersenggolan).
  if (carAhead && closestAhead < 7) {
    const latDiff = carAhead.lateral - s.lateral;
    if (Math.abs(latDiff) < 1.7) {
      const push = -Math.sign(latDiff || 1) * 0.55 * (1 - p.aggression * 0.6);
      line += push;
    }
  }

  // Setelah kontak: buka ruang ke sisi lawan sebentar → tidak nabrak berulang.
  if (s.contactTimer > 0) {
    s.contactTimer -= dt;
    line += s.contactSide * 0.75 * clamp(s.contactTimer / 0.5, 0, 1);
  }

  // --- H. Tekanan menjauhi pembatas + clamp koridor -------------------------
  line += -latSign * s.wallPressure * 3.2;
  s.lateralTarget = clamp(line, -maxLat, maxLat);
  const lineRate = 1.6 + p.skill * 1.5 + s.recovery * 3.2;
  s.lateralSmooth = smoothTo(s.lateralSmooth, s.lateralTarget, lineRate, dt);

  // --- I. Titik bidik: lookahead meter + titik re-entry saat keluar jalur ---
  const lookM = clamp(2.9 + Math.max(0, s.speed) * 0.46 - s.recovery * 2.2, 3.2, 13);
  const aimT = s.trackT + lookM / track.length;
  frameAt(track, aimT, P_AIM);
  const normalLat = clamp(s.lateralSmooth, -maxLat, maxLat);
  let aimX = P_AIM.x + P_AIM.nx * normalLat;
  let aimZ = P_AIM.z + P_AIM.nz * normalLat;

  if (s.recovery > 0.01) {
    // Re-entry menyudut (bukan belok 90°): target di depan, sedikit ke arah dalam.
    const reentryM = clamp(5 + absLat * 2.3, 7, 22) * (0.8 + s.recovery * 0.5);
    frameAt(track, s.trackT + reentryM / track.length, P_REENTRY);
    const reentryLat = clamp(-latSign * Math.min(absLat, 1.5), -maxLat, maxLat);
    const rx = P_REENTRY.x + P_REENTRY.nx * reentryLat;
    const rz = P_REENTRY.z + P_REENTRY.nz * reentryLat;
    const blend = smoothstep(s.recovery);
    aimX = lerp(aimX, rx, blend);
    aimZ = lerp(aimZ, rz, blend);
  }

  // Titik bidik di-smooth juga → setir tidak bergetar walau target berpindah.
  if (!s.aimReady) {
    s.aim.set(aimX, 0, aimZ);
    s.aimReady = true;
  } else {
    s.aim.x = smoothTo(s.aim.x, aimX, 9 + p.skill * 5, dt);
    s.aim.z = smoothTo(s.aim.z, aimZ, 9 + p.skill * 5, dt);
  }

  // --- J. Setir: servo orde-2 dengan damping (halus, tanpa osilasi) --------
  const reversing = s.reverseTimer > 0;
  const desiredVelAngle = reversing
    ? wrapAngle(s.heading + Math.PI)
    : Math.atan2(s.aim.x - s.pos.x, s.aim.z - s.pos.z);
  const err = wrapAngle(desiredVelAngle - s.velocityAngle);
  s.errPerceived = smoothTo(s.errPerceived, err, 1 / Math.max(0.03, reactTau), dt);
  const rawRate = dt > 0 ? (s.errPerceived - s.errRate) / dt : 0;
  s.errRate = smoothTo(s.errRate, s.errPerceived, 12, dt);
  const dampedErr = s.errPerceived - clamp(rawRate * 0.012, -0.08, 0.08);
  const speedGain = 1 / (1 + Math.max(0, s.speed) * 0.028);
  let turn = dampedErr * p.steerAuthority * speedGain * (reversing ? 1.35 : 1);
  if (wrongWay) turn = wrapAngle(P_CUR.heading - s.velocityAngle) * 3.2;
  turn = clamp(turn, -p.maxTurnRate, p.maxTurnRate);
  s.velocityAngle = wrapAngle(s.velocityAngle + turn * dt);

  // --- K. Sudut drift: dari akselerasi lateral, bukan konstanta tetap -------
  const latAccel = Math.abs(s.curvPerceived) * Math.max(0, s.speed) * Math.max(0, s.speed);
  const slipDemand =
    Math.sign(s.curvPerceived || 1) *
    Math.pow(clamp(latAccel / Math.max(4, p.grip * 0.55), 0, 1.5), 0.82) *
    0.62 *
    p.driftAngleFactor;
  // Manji ringan di lintasan lurus biar tidak kaku seperti kereta.
  const straight = 1 - clamp(Math.abs(SCAN.curvNow) / 0.02, 0, 1);
  const manji = straight > 0.4 && s.speed > 10 ? Math.sin(time * (0.55 + (p.seed % 1) * 0.5) + p.seed) * 0.2 * straight : 0;
  const slipTarget = reversing
    ? 0
    : clamp((slipDemand + manji) * (1 - s.recovery) * (1 - s.wallPressure * 0.55), -BOT_TUNING.maxSlipRad, BOT_TUNING.maxSlipRad);
  s.slipSmooth = smoothTo(s.slipSmooth, slipTarget, 3.4 + p.skill * 2.6, dt);

  const desiredHeading = reversing ? s.velocityAngle : wrapAngle(s.velocityAngle + s.slipSmooth);
  const headingErr = wrapAngle(desiredHeading - s.heading);
  const headGain = p.counterSteerRate * 2.35;
  const headDamp = 2 * Math.sqrt(Math.max(1, headGain)) * 1.02;
  s.angularVel = clamp(s.angularVel + (headingErr * headGain - s.angularVel * headDamp + s.kickSpin) * dt, -7.5, 7.5);
  s.kickSpin = smoothTo(s.kickSpin, 0, 5.5, dt);
  s.heading = wrapAngle(s.heading + s.angularVel * dt);

  // --- L. Deteksi macet → mundur teratur lalu nyambung lagi ----------------
  let dT = s.trackT - s.prevTrackT;
  if (track.closed) {
    if (dT < -0.5) dT += 1;
    if (dT > 0.5) dT -= 1;
  }
  s.prevTrackT = s.trackT;
  const progressSpeed = input.active ? (dT * track.length) / dt : 0;
  if (input.active && s.reverseTimer <= 0 && (progressSpeed < 1.2 || Math.abs(s.speed) < 2.4)) {
    s.stallTimer += dt;
  } else {
    s.stallTimer = Math.max(0, s.stallTimer - dt * 1.6);
  }
  if (s.stallTimer > 1.05 && input.active) {
    s.reverseTimer = 0.85;
    s.stallTimer = 0;
  }
  if (s.reverseTimer > 0) {
    s.reverseTimer -= dt;
    // Setir ke arah tengah lintasan supaya mundurnya produktif.
    const toCenter = -s.lateral;
    s.velocityAngle = wrapAngle(s.velocityAngle + clamp(toCenter * 0.35, -1.4, 1.4) * dt);
  }

  // --- M. Integrasi posisi + pagar lunak (tanpa teleport) -------------------
  const decay = Math.exp(-6.5 * dt);
  s.kick.multiplyScalar(decay);
  s.vel.set(Math.sin(s.velocityAngle) * s.speed, 0, Math.cos(s.velocityAngle) * s.speed).add(s.kick);
  s.pos.addScaledVector(s.vel, dt);

  const after = projectToTrack(track, s.pos.x, s.pos.z, s.trackT, 26 + Math.abs(s.speed) * 1.4);
  const absLatAfter = Math.abs(after.lateral);
  const softLimit = halfWidth - BOT_TUNING.softWallInset;
  if (absLatAfter > softLimit) {
    const sgn = Math.sign(after.lateral) || 1;
    const pen = absLatAfter - softLimit;
    const nx = P_CUR.nx * sgn;
    const nz = P_CUR.nz * sgn;
    // Buang komponen kecepatan yang mengarah keluar (halus, bukan dipantul keras).
    const outward = s.vel.x * nx + s.vel.z * nz;
    if (outward > 0) {
      const kill = outward * (1 - Math.exp(-28 * dt));
      s.vel.x -= nx * kill;
      s.vel.z -= nz * kill;
    }
    // Pegas lembut mendorong ke dalam lewat kanal `kick` supaya terasa seperti
    // body roll menumpang pagar, bukan teleport.
    s.kick.x -= nx * Math.min(pen * 26, 6.5) * dt;
    s.kick.z -= nz * Math.min(pen * 26, 6.5) * dt;
    s.kickSpin += -sgn * Math.min(pen * 2.2, 0.9) * dt;
    // Koreksi posisi dibatasi laju (maks ~2.4 m/s) → tidak pernah ada snap.
    // Koreksi posisi dibatasi laju (~6 m/s) → tetap tanpa snap, tapi cukup
    // cepat untuk kecepatan tinggi; batas keras di bibir pembatas.
    const hardLimit = halfWidth - 0.4;
    const push = Math.max(Math.min(pen, 6 * dt), absLatAfter - hardLimit);
    s.pos.x -= nx * push;
    s.pos.z -= nz * push;
    s.lateral = after.lateral - sgn * push;
    s.wallPressure = 1;
  } else {
    s.lateral = after.lateral;
  }
  s.trackT = after.t;

  // --- N. Diagnostik visual --------------------------------------------------
  const slip = wrapAngle(s.heading - s.velocityAngle);
  s.driftDegSigned = THREE.MathUtils.radToDeg(slip);
  s.driftDegAbs = Math.abs(s.driftDegSigned);
  const counterTarget = clamp(-slip * 1.05, -THREE.MathUtils.degToRad(75), THREE.MathUtils.degToRad(75));
  s.frontSteerAngle = smoothTo(s.frontSteerAngle, counterTarget, p.counterSteerRate, dt);
}

// ---------------------------------------------------------------------------
// 5. Kontak antar mobil: spring-damper + rate limit (tabrakan tetap ada,
//    tapi responnya lembut dan tidak "nyentak")
// ---------------------------------------------------------------------------

export interface ContactBody {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  heading: number;
  invMass: number;
  /** Kanal dorongan yang meluruh (bot) — pemain memakai vel langsung. */
  kick: THREE.Vector3 | null;
  kickSpinSink?: (dw: number) => void;
}

export interface ContactOptions {
  /** detik — makin besar makin lembut (transfer momentum disebar beberapa frame). */
  smoothTau: number;
  /** m/s — batas perubahan kecepatan per frame supaya tidak ada lompatan. */
  maxDvPerFrame: number;
  /** m/s — batas laju pemisahan posisi per frame. */
  maxSepSpeed: number;
  /** koefisien gesek tangensial (mobil saling "menggesek", bukan memantul). */
  friction: number;
  /** 0..1 — restitusi maksimum pada tumbukan cepat. */
  restitution: number;
}

export const DEFAULT_CONTACT: ContactOptions = {
  smoothTau: 0.075,
  maxDvPerFrame: 0.85,
  maxSepSpeed: 2.6,
  friction: 0.32,
  restitution: 0.26,
};

export interface ContactResult {
  impulse: number;
  closingSpeed: number;
  /** +1 jika A terdorong ke arah normal. */
  pushSign: number;
}

const _ct = { x: 0, z: 0 };

/**
 * Selesaikan kontak lunak antara dua mobil.
 * `normal` menunjuk dari A ke B. Impuls tidak diberikan sekaligus: dibatasi per
 * frame dan disaring `smoothTau`, sehingga tabrakan terasa seperti body contact
 * yang empuk — bukan dorongan kaku satu frame.
 */
export function resolveSoftContact(
  a: ContactBody,
  b: ContactBody,
  nx: number,
  nz: number,
  penetration: number,
  dt: number,
  opts: ContactOptions = DEFAULT_CONTACT,
  out: ContactResult = { impulse: 0, closingSpeed: 0, pushSign: 1 }
): ContactResult {
  const invSum = a.invMass + b.invMass;
  if (invSum <= 0) return out;

  const avx = a.vel.x + (a.kick ? a.kick.x : 0);
  const avz = a.vel.z + (a.kick ? a.kick.z : 0);
  const bvx = b.vel.x + (b.kick ? b.kick.x : 0);
  const bvz = b.vel.z + (b.kick ? b.kick.z : 0);

  const rvx = bvx - avx;
  const rvz = bvz - avz;
  const vn = rvx * nx + rvz * nz; // >0 = sudah menjauh
  const closing = -vn;

  // Restitusi naik perlahan sesuai kecepatan tumbukan: senggolan pelan tidak memantul.
  const e = opts.restitution * clamp(closing / 7, 0, 1);
  const jRest = closing > 0 ? ((1 + e) * closing) / invSum : 0;
  // Pegas Baumgarte: mendorong penetrasi habis dalam ~smoothTau detik.
  const jSpring = Math.max(0, penetration / Math.max(0.02, opts.smoothTau)) / invSum;
  const jDesired = jRest * 0.65 + jSpring;

  // Rate-limit: inilah kunci "tidak kaku".
  const jMax = opts.maxDvPerFrame / invSum;
  const blend = 1 - Math.exp(-dt / Math.max(0.012, opts.smoothTau));
  const j = clamp(jDesired * blend, 0, jMax);

  if (j > 0) {
    _ct.x = nx * j;
    _ct.z = nz * j;
    applyImpulse(a, -_ct.x, -_ct.z);
    applyImpulse(b, _ct.x, _ct.z);

    // Gesekan tangensial: mobil menggesek berdampingan, terasa seperti door-rub.
    const tx = -nz;
    const tz = nx;
    const vt = rvx * tx + rvz * tz;
    const jt = clamp((-vt / invSum) * opts.friction, -j * opts.friction * 2.4, j * opts.friction * 2.4);
    if (Math.abs(jt) > 1e-4) {
      applyImpulse(a, -tx * jt, -tz * jt);
      applyImpulse(b, tx * jt, tz * jt);
    }

    // Torsi: lengan tuju × impuls, dibatasi supaya tidak spin-out mendadak.
    const torque = (Math.sin(a.heading) * nz - Math.cos(a.heading) * nx) * j * 0.09;
    if (a.kickSpinSink) a.kickSpinSink(clamp(-torque, -1.4, 1.4));
    const torqueB = (Math.sin(b.heading) * nz - Math.cos(b.heading) * nx) * j * 0.09;
    if (b.kickSpinSink) b.kickSpinSink(clamp(torqueB, -1.4, 1.4));
  }

  // Pemisahan posisi dengan laju terbatas (tidak ada teleport antar frame).
  if (penetration > 0) {
    const sep = Math.min(penetration * 0.55, opts.maxSepSpeed * dt);
    a.pos.x -= nx * sep * (a.invMass / invSum);
    a.pos.z -= nz * sep * (a.invMass / invSum);
    b.pos.x += nx * sep * (b.invMass / invSum);
    b.pos.z += nz * sep * (b.invMass / invSum);
  }

  out.impulse = j;
  out.closingSpeed = Math.max(0, closing);
  out.pushSign = 1;
  return out;
}

function applyImpulse(body: ContactBody, jx: number, jz: number) {
  const dvx = jx * body.invMass;
  const dvz = jz * body.invMass;
  if (body.kick) {
    body.kick.x += dvx;
    body.kick.z += dvz;
    // Batasi sisa dorongan supaya tidak menumpuk jadi ledakan.
    const l = Math.hypot(body.kick.x, body.kick.z);
    if (l > 7.5) {
      body.kick.x = (body.kick.x / l) * 7.5;
      body.kick.z = (body.kick.z / l) * 7.5;
    }
  } else {
    body.vel.x += dvx;
    body.vel.z += dvz;
  }
}

/**
 * Cari kontak terdalam dari kapsul multi-sphere dua mobil.
 * Mengembalikan normal (A→B) + penetrasi, atau null bila tidak bersentuhan.
 */
export interface CarSphere {
  offset: number;
  x: number;
  z: number;
  radius: number;
}

export function carSpheres(x: number, z: number, heading: number, out: CarSphere[]): CarSphere[] {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const spec = [
    { offset: 1.05, radius: 0.88 },
    { offset: 0.0, radius: 0.92 },
    { offset: -1.05, radius: 0.88 },
  ];
  for (let i = 0; i < 3; i++) {
    const s = out[i];
    s.offset = spec[i].offset;
    s.radius = spec[i].radius;
    s.x = x + fx * spec[i].offset;
    s.z = z + fz * spec[i].offset;
  }
  return out;
}

export interface SphereContact {
  nx: number;
  nz: number;
  penetration: number;
  cx: number;
  cz: number;
  offsetA: number;
  offsetB: number;
}

export function deepestSphereContact(aSpheres: CarSphere[], bSpheres: CarSphere[], out: SphereContact): SphereContact | null {
  let best = -1;
  let result: SphereContact | null = null;
  for (const as of aSpheres) {
    for (const bs of bSpheres) {
      const dx = bs.x - as.x;
      const dz = bs.z - as.z;
      const dist = Math.hypot(dx, dz);
      const minSep = as.radius + bs.radius;
      const pen = minSep - dist;
      if (pen > best) {
        best = pen;
        const inv = dist > 1e-4 ? 1 / dist : 0;
        if (!result) result = out;
        out.nx = inv > 0 ? dx * inv : 1;
        out.nz = inv > 0 ? dz * inv : 0;
        out.penetration = pen;
        out.cx = (as.x + bs.x) * 0.5;
        out.cz = (as.z + bs.z) * 0.5;
        out.offsetA = as.offset;
        out.offsetB = bs.offset;
      }
    }
  }
  return best > 0 ? result : null;
}
