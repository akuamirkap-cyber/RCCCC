/* ------------------------------------------------------------------ */
/*  Engines                                                            */
/* ------------------------------------------------------------------ */

export type EngineKind = 'classic' | 'slip';

export const ENGINES: { id: EngineKind; label: string; emoji: string; desc: string }[] = [
  { id: 'classic', label: 'Classic Arcade', emoji: '🕹️', desc: 'Grip-based arcade handling — snappy, simple and forgiving' },
  {
    id: 'slip',
    label: 'Slip Drift',
    emoji: '🌀',
    desc: 'Bicycle-lite with an explicit slip angle: hysteresis drift, self-aligning torque, yaw inertia and an e-brake kick — you can spin if careless',
  },
];

/** Engine used for fresh installs / "Reset to default" */
export const DEFAULT_ENGINE: EngineKind = 'slip';

/* ------------------------------------------------------------------ */
/*  Classic engine tuning                                              */
/* ------------------------------------------------------------------ */

/** Adjustable car parameters used directly by the classic physics in Game.ts */
export interface CarTuning {
  maxSpeed: number; // km/h — top speed without boost (actually reachable on the straights)
  accel: number; // m/s² — engine acceleration from standstill
  brake: number; // m/s² — foot brake force
  handling: number; // steering rate multiplier
  grip: number; // lateral grip when not drifting
  driftGrip: number; // lateral grip while drifting (lower = longer slides)
  boostPower: number; // km/h added on top of maxSpeed while boosting
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface RaceSettings {
  laps: number;
  difficulty: Difficulty;
}

export interface GameSetup {
  engine: EngineKind;
  tuning: CarTuning;
  slipTuning: SlipTuning;
  race: RaceSettings;
}

/**
 * World scale: 1 unit = 1 meter (a 4.2-unit car ≈ a 4.2 m car, 14-unit track ≈ 14 m wide).
 * So displayed km/h = m/s × 3.6 — a true, accurate speedometer.
 */
export const KMH = 3.6;
/** Engine never drops below this fraction of `accel`, so the top speed is really reached. */
export const ACCEL_FLOOR = 0.18;

/** Classic engine acceleration (m/s²) at velocity `v` for a car with `accel` and top speed `vmax` (both internal units). */
export function engineAccel(v: number, accel: number, vmax: number): number {
  if (v >= vmax) return 0;
  return accel * Math.max(ACCEL_FLOOR, 1 - v / vmax);
}

/** Default = "Drift Master": loose rear, sharp steering, 180 km/h true speed */
export const DEFAULT_TUNING: CarTuning = {
  maxSpeed: 180,
  accel: 34,
  brake: 30,
  handling: 1.3,
  grip: 4.5,
  driftGrip: 1.1,
  boostPower: 40,
};

export const DEFAULT_RACE: RaceSettings = { laps: 3, difficulty: 'normal' };
export const MIN_LAPS = 1;
export const MAX_LAPS = 5;

export const DIFFICULTIES: { id: Difficulty; label: string; desc: string }[] = [
  { id: 'easy', label: 'Easy', desc: 'Relaxed rivals' },
  { id: 'normal', label: 'Normal', desc: 'Fair fight' },
  { id: 'hard', label: 'Hard', desc: 'Aggressive pace' },
];

/** Rival speed multiplier (relative to the player's top speed) */
export const DIFFICULTY_MUL: Record<Difficulty, number> = { easy: 0.88, normal: 1, hard: 1.1 };

export interface FieldDef<K extends string> {
  key: K;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint: string;
}

export type TuningField = FieldDef<keyof CarTuning>;

export const TUNING_FIELDS: TuningField[] = [
  { key: 'maxSpeed', label: 'Top Speed', min: 80, max: 180, step: 5, format: (v) => `${Math.round(v)} km/h`, hint: 'True top speed — 1 unit = 1 m, so the speedometer is accurate' },
  { key: 'accel', label: 'Acceleration', min: 8, max: 45, step: 1, format: (v) => `${v} m/s²`, hint: 'How quickly the car reaches top speed' },
  { key: 'brake', label: 'Brake Power', min: 10, max: 50, step: 1, format: (v) => `${v} m/s²`, hint: 'Stopping force of the foot brake (S / ↓)' },
  { key: 'handling', label: 'Steering', min: 0.6, max: 1.6, step: 0.05, format: (v) => `${Math.round(v * 100)}%`, hint: 'Turn rate — higher = sharper, twitchier turns' },
  { key: 'grip', label: 'Tire Grip', min: 2.5, max: 9, step: 0.25, format: (v) => v.toFixed(2), hint: 'Higher = sticks to the road, harder to start a slide' },
  { key: 'driftGrip', label: 'Drift Grip', min: 0.8, max: 3.5, step: 0.1, format: (v) => v.toFixed(1), hint: 'Lower = longer, looser drifts · higher = quick recovery' },
  { key: 'boostPower', label: 'Boost Power', min: 10, max: 60, step: 5, format: (v) => `+${Math.round(v)} km/h`, hint: 'Extra top speed while boosting — drift to charge, SHIFT to fire' },
];

export const FIELD_BY_KEY = Object.fromEntries(TUNING_FIELDS.map((f) => [f.key, f])) as Record<keyof CarTuning, TuningField>;

export interface TuningPreset {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  tuning: CarTuning;
}

export const PRESETS: TuningPreset[] = [
  { id: 'drift', name: 'Drift Master', emoji: '🌀', desc: 'Loose rear, sharp steering, big boosts (default)', tuning: { ...DEFAULT_TUNING } },
  { id: 'balanced', name: 'Balanced', emoji: '🏁', desc: 'All-round setup', tuning: { maxSpeed: 150, accel: 26, brake: 28, handling: 1, grip: 5.5, driftGrip: 1.8, boostPower: 30 } },
  { id: 'speed', name: 'Speed Demon', emoji: '🚀', desc: 'Maxed top speed, heavier steering', tuning: { maxSpeed: 180, accel: 30, brake: 30, handling: 0.85, grip: 5.5, driftGrip: 2.0, boostPower: 55 } },
  { id: 'grip', name: 'Grip Racer', emoji: '🧲', desc: 'Glued to the tarmac, hard to slide', tuning: { maxSpeed: 160, accel: 26, brake: 36, handling: 1.1, grip: 8.5, driftGrip: 3.0, boostPower: 30 } },
  { id: 'rookie', name: 'Rookie', emoji: '🐣', desc: 'Slower and forgiving', tuning: { maxSpeed: 120, accel: 20, brake: 34, handling: 1.15, grip: 7, driftGrip: 2.4, boostPower: 25 } },
];

export function clampTuning(t: Partial<CarTuning> | null | undefined): CarTuning {
  const out: CarTuning = { ...DEFAULT_TUNING };
  if (!t) return out;
  for (const f of TUNING_FIELDS) {
    const v = t[f.key];
    if (typeof v === 'number' && Number.isFinite(v)) out[f.key] = Math.min(f.max, Math.max(f.min, v));
  }
  return out;
}

export function clampRace(r: Partial<RaceSettings> | null | undefined): RaceSettings {
  const out: RaceSettings = { ...DEFAULT_RACE };
  if (!r) return out;
  if (typeof r.laps === 'number' && Number.isFinite(r.laps)) out.laps = Math.min(MAX_LAPS, Math.max(MIN_LAPS, Math.round(r.laps)));
  if (r.difficulty && r.difficulty in DIFFICULTY_MUL) out.difficulty = r.difficulty;
  return out;
}

export function matchPreset(t: CarTuning): TuningPreset | null {
  return PRESETS.find((p) => TUNING_FIELDS.every((f) => Math.abs(p.tuning[f.key] - t[f.key]) < 1e-6)) ?? null;
}

/** Normalized 0..1 position of a value inside a range */
export function normRange(min: number, max: number, v: number): number {
  return Math.min(1, Math.max(0, (v - min) / (max - min)));
}
export function norm(field: { min: number; max: number }, v: number): number {
  return normRange(field.min, field.max, v);
}

/** Simulates the exact classic acceleration model to estimate 0–100 km/h time (seconds) */
export function estimateZeroToHundred(t: CarTuning): number | null {
  const target = 100 / KMH;
  const vmax = t.maxSpeed / KMH;
  if (vmax <= target) return null;
  let v = 0;
  let time = 0;
  const dt = 0.005;
  while (v < target && time < 30) {
    v += engineAccel(v, t.accel, vmax) * dt;
    time += dt;
  }
  return time >= 30 ? null : time;
}

export function driftStyle(t: CarTuning): string {
  if (t.driftGrip < 1.4) return 'Loose';
  if (t.driftGrip < 2.4) return 'Neutral';
  return 'Tight';
}

/* ------------------------------------------------------------------ */
/*  Slip engine tuning ("bicycle-lite" with explicit slip)             */
/* ------------------------------------------------------------------ */

/** Slip engine: same true scale as classic (1 unit = 1 m → km/h = m/s × 3.6) */
export const SLIP_KMH = 3.6;
/** Slip engine keeps pulling near the top so 180 km/h is really reachable on the straights. */
export const SLIP_ACCEL_FLOOR = 0.16;

export interface SlipTuning {
  maxSpeed: number; // km/h — asymptotic top speed
  accel: number; // initial slope of the acceleration curve
  brake: number; // foot brake force (S / ↓)
  turnRate: number; // steering torque gain
  gripNormal: number; // lateral decay rate while gripping
  gripDrift: number; // lateral decay rate while drifting
  driftBoost: number; // steering multiplier while drifting ("drift angle")
  handbrake: number; // e-brake yaw kick; handbrake grip = 1.4 / value
  align: number; // self-aligning torque ("stability")
  boostPower: number; // km/h added while boosting
}

/**
 * Default Slip Drift setup (same handling as the reference screenshot, top speed capped):
 * 180 km/h · accel 43 · brake 30 · steering 3.0 · grip 5.50 · drift grip 1.1 ·
 * drift angle ×2.10 · handbrake 0.8 · stability 1.0 · boost +40 km/h → ≈81° "Wild"
 */
export const DEFAULT_SLIP: SlipTuning = {
  maxSpeed: 180,
  accel: 43,
  brake: 30,
  turnRate: 3.0,
  gripNormal: 5.5,
  gripDrift: 1.1,
  driftBoost: 2.1,
  handbrake: 0.8,
  align: 1.0,
  boostPower: 40,
};

export type SlipField = FieldDef<keyof SlipTuning>;

export const SLIP_FIELDS: SlipField[] = [
  { key: 'maxSpeed', label: 'Top Speed', min: 80, max: 180, step: 5, format: (v) => `${Math.round(v)} km/h`, hint: 'True top speed (1 unit = 1 m) — the engine really gets there' },
  { key: 'accel', label: 'Acceleration', min: 8, max: 45, step: 1, format: (v) => `${v}`, hint: 'Initial slope of the acceleration curve' },
  { key: 'brake', label: 'Brake Power', min: 10, max: 50, step: 1, format: (v) => `${v}`, hint: 'Foot brake force (S / ↓) — can crawl backwards' },
  { key: 'turnRate', label: 'Steering', min: 1.5, max: 4.5, step: 0.1, format: (v) => v.toFixed(1), hint: 'Steering torque gain' },
  { key: 'gripNormal', label: 'Tire Grip', min: 3, max: 10, step: 0.25, format: (v) => v.toFixed(2), hint: 'Lateral decay while gripping — low = breaks loose easily' },
  { key: 'gripDrift', label: 'Drift Grip', min: 0.6, max: 3, step: 0.1, format: (v) => v.toFixed(1), hint: 'Lateral decay while drifting — low = long slides' },
  { key: 'driftBoost', label: 'Drift Angle', min: 1, max: 2.5, step: 0.05, format: (v) => `×${v.toFixed(2)}`, hint: 'Steering multiplier while drifting — throws the tail further' },
  { key: 'handbrake', label: 'Handbrake', min: 0.6, max: 2.5, step: 0.1, format: (v) => v.toFixed(1), hint: 'E-brake yaw kick; also lowers handbrake grip (1.4 ÷ value)' },
  { key: 'align', label: 'Stability', min: 1, max: 4.5, step: 0.1, format: (v) => v.toFixed(1), hint: 'Self-aligning torque — low = easy to spin, high = auto-corrects' },
  { key: 'boostPower', label: 'Boost Power', min: 10, max: 60, step: 5, format: (v) => `+${Math.round(v)} km/h`, hint: 'Extra top speed while boosting — drift to charge, SHIFT to fire' },
];

export const SLIP_FIELD_BY_KEY = Object.fromEntries(SLIP_FIELDS.map((f) => [f.key, f])) as Record<keyof SlipTuning, SlipField>;

export interface SlipPreset {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  tuning: SlipTuning;
}

export const SLIP_PRESETS: SlipPreset[] = [
  { id: 'master', name: 'Drift Master', emoji: '🌀', desc: 'Maximum attack — 180 km/h, ≈81° drift angle, Wild (default)', tuning: { ...DEFAULT_SLIP } },
  {
    id: 'balanced',
    name: 'Balanced',
    emoji: '🏁',
    desc: 'Medium everything',
    tuning: { maxSpeed: 155, accel: 28, brake: 30, turnRate: 2.8, gripNormal: 7, gripDrift: 1.4, driftBoost: 1.6, handbrake: 1.4, align: 2.7, boostPower: 30 },
  },
  {
    id: 'rookie',
    name: 'Rookie',
    emoji: '🐣',
    desc: 'Strong anti-spin, gentle angles',
    tuning: { maxSpeed: 120, accel: 22, brake: 34, turnRate: 2.6, gripNormal: 7.5, gripDrift: 1.8, driftBoost: 1.4, handbrake: 1.2, align: 3.2, boostPower: 25 },
  },
  {
    id: 'speed',
    name: 'Speed Demon',
    emoji: '🚀',
    desc: 'Top speed first, calmer steering',
    tuning: { maxSpeed: 180, accel: 32, brake: 30, turnRate: 2.5, gripNormal: 6.5, gripDrift: 1.5, driftBoost: 1.5, handbrake: 1.3, align: 2.6, boostPower: 55 },
  },
  {
    id: 'grip',
    name: 'Grip Racer',
    emoji: '🧲',
    desc: 'Sticky tires, quick recovery',
    tuning: { maxSpeed: 160, accel: 28, brake: 36, turnRate: 3.0, gripNormal: 9, gripDrift: 2.4, driftBoost: 1.3, handbrake: 1.0, align: 3.0, boostPower: 30 },
  },
  {
    id: 'hooligan',
    name: 'Hooligan',
    emoji: '🔥',
    desc: 'Almost no stability — spins if you blink',
    tuning: { maxSpeed: 175, accel: 34, brake: 30, turnRate: 3.2, gripNormal: 5.5, gripDrift: 1.0, driftBoost: 2.0, handbrake: 1.9, align: 1.8, boostPower: 50 },
  },
];

export function clampSlip(t: Partial<SlipTuning> | null | undefined): SlipTuning {
  const out: SlipTuning = { ...DEFAULT_SLIP };
  if (!t) return out;
  for (const f of SLIP_FIELDS) {
    const v = t[f.key];
    if (typeof v === 'number' && Number.isFinite(v)) out[f.key] = Math.min(f.max, Math.max(f.min, v));
  }
  return out;
}

export function matchSlipPreset(t: SlipTuning): SlipPreset | null {
  return SLIP_PRESETS.find((p) => SLIP_FIELDS.every((f) => Math.abs(p.tuning[f.key] - t[f.key]) < 1e-6)) ?? null;
}

/** Simulates the slip engine's longitudinal model (with the accel floor) to estimate 0–100 km/h (seconds). */
export function estimateZeroToHundredSlip(t: SlipTuning): number | null {
  const target = 100 / SLIP_KMH;
  const MAX = t.maxSpeed / SLIP_KMH;
  if (MAX <= target) return null;
  let v = 0;
  let time = 0;
  const dt = 0.005;
  while (v < target && time < 30) {
    const drop = 1 - v / MAX;
    v += (drop <= 0 ? 0 : t.accel * 0.72 * Math.max(SLIP_ACCEL_FLOOR, drop)) * dt;
    time += dt;
  }
  return time >= 30 ? null : time;
}

/**
 * Equilibrium drift angle estimate (degrees): with full lock in a drift the yaw balances when
 * steer·turnRate·driftBoost ≈ slip·align → atan(turnRate·driftBoost / align).
 */
export function slipDriftAngle(t: SlipTuning): number {
  return (Math.atan((t.turnRate * t.driftBoost) / t.align) * 180) / Math.PI;
}

export function slipStyle(t: SlipTuning): string {
  if (t.align < 2.0) return 'Wild';
  if (t.align < 2.9) return 'Lively';
  return 'Stable';
}

/* ------------------------------------------------------------------ */
/*  Persistence                                                        */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'drift-king-setup-v5';

export function loadSetup(): GameSetup {
  const fallback: GameSetup = { engine: DEFAULT_ENGINE, tuning: { ...DEFAULT_TUNING }, slipTuning: { ...DEFAULT_SLIP }, race: { ...DEFAULT_RACE } };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameSetup>;
      return {
        engine: parsed.engine === 'classic' ? 'classic' : DEFAULT_ENGINE,
        tuning: clampTuning(parsed.tuning),
        slipTuning: clampSlip(parsed.slipTuning),
        race: clampRace(parsed.race),
      };
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function saveSetup(s: GameSetup) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
