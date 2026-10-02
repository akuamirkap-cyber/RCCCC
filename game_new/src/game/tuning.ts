export interface Tuning {
  maxSpeed: number // km/j tampilan (unit internal = /3.2)
  accel: number // m/s^2
  turnRate: number // rad/s
  gripNormal: number // grip ban saat normal (lebih tinggi = lebih nempel)
  gripDrift: number // grip saat drift (lebih rendah = drift lebih panjang)
  handbrake: number // kekuatan kick rem tangan
  driftBoost: number // multiplier belok saat drift
  align: number // torsi penyelaras (lebih tinggi = lebih stabil, lebih susah spin)
}

export interface TuningField {
  key: keyof Tuning
  label: string
  desc: string
  min: number
  max: number
  step: number
  unit?: string
}

export const TUNING_FIELDS: TuningField[] = [
  { key: 'maxSpeed', label: 'Kecepatan Maks', desc: 'Top speed mobil', min: 100, max: 300, step: 5, unit: 'km/j' },
  { key: 'accel', label: 'Akselerasi', desc: 'Seberapa cepat mobil ngegas', min: 10, max: 45, step: 1 },
  { key: 'turnRate', label: 'Setir', desc: 'Sensitivitas belok', min: 1.4, max: 3.6, step: 0.1 },
  { key: 'gripNormal', label: 'Grip Ban', desc: 'Tinggi = nempel, rendah = licin', min: 3, max: 12, step: 0.5 },
  { key: 'gripDrift', label: 'Grip Drift', desc: 'Rendah = drift lebih panjang', min: 0.8, max: 4, step: 0.1 },
  { key: 'driftBoost', label: 'Sudut Drift', desc: 'Kemampuan belok saat ngepot', min: 1, max: 2.2, step: 0.05 },
  { key: 'handbrake', label: 'Rem Tangan', desc: 'Kekuatan kick saat SPASI/DRIFT', min: 0.4, max: 2.5, step: 0.1 },
  { key: 'align', label: 'Stabilitas', desc: 'Tinggi = susah spin, rendah = liar', min: 0.5, max: 4, step: 0.1 },
]

export const PRESETS: Record<string, { name: string; icon: string; desc: string; t: Tuning }> = {
  beginner: {
    name: 'Pemula',
    icon: '🟢',
    desc: 'Nempel & stabil, gampang dikontrol',
    t: { maxSpeed: 150, accel: 20, turnRate: 2.2, gripNormal: 9, gripDrift: 2.4, handbrake: 0.9, driftBoost: 1.3, align: 3.2 },
  },
  balanced: {
    name: 'Seimbang',
    icon: '🟡',
    desc: 'Lebih kalem, cocok buat belajar',
    t: { maxSpeed: 190, accel: 26, turnRate: 2.4, gripNormal: 7, gripDrift: 1.6, handbrake: 1.2, driftBoost: 1.5, align: 2.0 },
  },
  pro: {
    name: 'Pro Drift',
    icon: '🔴',
    desc: '220 km/j, licin, sudut drift besar',
    t: { maxSpeed: 220, accel: 30, turnRate: 2.8, gripNormal: 6, gripDrift: 1.3, handbrake: 1.6, driftBoost: 1.7, align: 1.7 },
  },
  master: {
    name: 'Drift Master',
    icon: '👑',
    desc: 'Default · 250 km/j, akselerasi 34, liar!',
    t: { maxSpeed: 250, accel: 34, turnRate: 3.0, gripNormal: 7, gripDrift: 1.3, handbrake: 1.7, driftBoost: 1.8, align: 2.2 },
  },
}

export const DEFAULT_TUNING: Tuning = { ...PRESETS.master.t }

// objek mutable yang dibaca game loop tiap frame (tanpa re-render React)
export const tuning: Tuning = { ...loadTuning() }

const TUNING_KEY = 'rc-drift-tuning-v3'

export function loadTuning(): Tuning {
  try {
    const raw = localStorage.getItem(TUNING_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const out: Tuning = { ...DEFAULT_TUNING }
      for (const f of TUNING_FIELDS) {
        const v = Number(parsed[f.key])
        if (Number.isFinite(v)) out[f.key] = Math.min(f.max, Math.max(f.min, v))
      }
      return out
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_TUNING }
}

export function applyTuning(t: Tuning) {
  Object.assign(tuning, t)
  try {
    localStorage.setItem(TUNING_KEY, JSON.stringify(t))
  } catch {
    /* ignore */
  }
}

export function matchPreset(t: Tuning): string | null {
  for (const [k, p] of Object.entries(PRESETS)) {
    if (TUNING_FIELDS.every((f) => Math.abs(p.t[f.key] - t[f.key]) < 1e-6)) return k
  }
  return null
}

// Statistik ringkas untuk ditampilkan (0..1)
export function tuningStats(t: Tuning) {
  const n = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)))
  return {
    speed: n(t.maxSpeed, 100, 300),
    accel: n(t.accel, 10, 45),
    handling: n(t.turnRate, 1.4, 3.6) * 0.5 + n(t.gripNormal, 3, 12) * 0.5,
    drift: n(4 - t.gripDrift, 0, 3.2) * 0.4 + n(t.driftBoost, 1, 2.2) * 0.3 + n(t.handbrake, 0.4, 2.5) * 0.3,
    stability: n(t.align, 0.5, 4),
  }
}
