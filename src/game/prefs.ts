/** Visual / feel preferences: camera, smoke, car style. Saved separately from the car tuning. */
export type CameraMode = 'rally' | 'chase' | 'cockpit' | 'far';
export type CarStyle = 'standard' | 'toon';

export interface SmokeSettings {
  amount: number; // 0..2 — emission density multiplier
  size: number; // 0.5..2 — puff size multiplier
  duration: number; // 0.5..2 — lifetime multiplier
  opacity: number; // 0.2..1.2 — alpha multiplier
  tint: number; // 0..1 — 0 = white smoke, 1 = warm burnt-rubber tint
  wheelSpin: boolean; // swirling smoke from the spinning rear wheels
}

export interface VisualPrefs {
  camera: CameraMode;
  carStyle: CarStyle;
  smoke: SmokeSettings;
}

export const CAMERA_MODES: { id: CameraMode; label: string; emoji: string; desc: string }[] = [
  { id: 'rally', label: 'Art of Rally', emoji: '🎨', desc: 'High isometric follow cam, fixed heading — see the whole slide' },
  { id: 'chase', label: 'Chase', emoji: '🎬', desc: 'Classic close chase cam that swings with the drift' },
  { id: 'cockpit', label: 'Cockpit', emoji: '🪟', desc: 'Behind the wheel, windshield hidden — pure speed' },
  { id: 'far', label: 'Chase Far', emoji: '🚁', desc: 'Wide cinematic chase, higher and further back' },
];

export const CAR_STYLES: { id: CarStyle; label: string; emoji: string; desc: string }[] = [
  { id: 'standard', label: 'Standard', emoji: '🚗', desc: 'Low & long racing proportions' },
  { id: 'toon', label: 'Toon', emoji: '🧸', desc: 'Short, tall & chunky cartoon car' },
];

export interface SmokeField {
  key: keyof Omit<SmokeSettings, 'wheelSpin'>;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

export const SMOKE_FIELDS: SmokeField[] = [
  { key: 'amount', label: 'Amount', min: 0, max: 2, step: 0.1, format: (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`) },
  { key: 'size', label: 'Puff Size', min: 0.5, max: 2, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'duration', label: 'Lifetime', min: 0.5, max: 2, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'opacity', label: 'Opacity', min: 0.2, max: 1.2, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'tint', label: 'Rubber Tint', min: 0, max: 1, step: 0.05, format: (v) => (v < 0.15 ? 'White' : v < 0.6 ? 'Light' : 'Burnt') },
];

export const SMOKE_PRESETS: { id: string; label: string; emoji: string; smoke: SmokeSettings }[] = [
  { id: 'subtle', label: 'Subtle', emoji: '🌬️', smoke: { amount: 0.6, size: 0.85, duration: 0.8, opacity: 0.65, tint: 0.1, wheelSpin: true } },
  { id: 'normal', label: 'Normal', emoji: '💨', smoke: { amount: 1, size: 1, duration: 1, opacity: 0.9, tint: 0.2, wheelSpin: true } },
  { id: 'heavy', label: 'Heavy', emoji: '🌫️', smoke: { amount: 1.6, size: 1.35, duration: 1.4, opacity: 1.1, tint: 0.35, wheelSpin: true } },
  { id: 'burnout', label: 'Burnout', emoji: '🔥', smoke: { amount: 2, size: 1.5, duration: 1.6, opacity: 1.2, tint: 0.8, wheelSpin: true } },
];

export const DEFAULT_PREFS: VisualPrefs = {
  camera: 'chase',
  carStyle: 'toon',
  smoke: { ...SMOKE_PRESETS[1].smoke },
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function clampSmoke(s: Partial<SmokeSettings> | null | undefined): SmokeSettings {
  const out: SmokeSettings = { ...DEFAULT_PREFS.smoke };
  if (!s) return out;
  for (const f of SMOKE_FIELDS) {
    const v = s[f.key];
    if (typeof v === 'number' && Number.isFinite(v)) out[f.key] = clamp(v, f.min, f.max);
  }
  if (typeof s.wheelSpin === 'boolean') out.wheelSpin = s.wheelSpin;
  return out;
}

export function matchSmokePreset(s: SmokeSettings) {
  return SMOKE_PRESETS.find((p) => SMOKE_FIELDS.every((f) => Math.abs(p.smoke[f.key] - s[f.key]) < 1e-6) && p.smoke.wheelSpin === s.wheelSpin) ?? null;
}

const STORAGE_KEY = 'drift-king-prefs-v1';

export function loadPrefs(): VisualPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<VisualPrefs>;
      return {
        camera: CAMERA_MODES.some((c) => c.id === p.camera) ? (p.camera as CameraMode) : DEFAULT_PREFS.camera,
        carStyle: CAR_STYLES.some((c) => c.id === p.carStyle) ? (p.carStyle as CarStyle) : DEFAULT_PREFS.carStyle,
        smoke: clampSmoke(p.smoke),
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PREFS, smoke: { ...DEFAULT_PREFS.smoke } };
}

export function savePrefs(p: VisualPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
