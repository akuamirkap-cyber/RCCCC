import type { CSSProperties } from 'react';
import {
  CAMERA_MODES,
  CAR_STYLES,
  DEFAULT_PREFS,
  SMOKE_FIELDS,
  SMOKE_PRESETS,
  clampSmoke,
  matchSmokePreset,
  type CameraMode,
  type CarStyle,
  type SmokeSettings,
  type VisualPrefs,
} from '../game/prefs';
import { cn } from '../utils/cn';

interface Props {
  prefs: VisualPrefs;
  onCamera: (c: CameraMode) => void;
  onCarStyle: (s: CarStyle) => void;
  onSmoke: (s: SmokeSettings) => void;
  onClose: () => void;
}

function OptionCard({ active, emoji, label, desc, onClick }: { active: boolean; emoji: string; label: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition active:scale-[0.98]',
        active ? 'border-brand bg-orange-50 shadow-[0_4px_18px_rgba(255,90,31,0.25)]' : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <span className="text-2xl leading-none">{emoji}</span>
      <span className="min-w-0">
        <span className={cn('block text-sm font-bold', active ? 'text-brand' : 'text-slate-800')}>{label}</span>
        <span className="block text-[11px] leading-tight text-slate-500">{desc}</span>
      </span>
    </button>
  );
}

export function VisualPanel({ prefs, onCamera, onCarStyle, onSmoke, onClose }: Props) {
  const smoke = prefs.smoke;
  const preset = matchSmokePreset(smoke);
  const setSmoke = (patch: Partial<SmokeSettings>) => onSmoke(clampSmoke({ ...smoke, ...patch }));

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center p-2 font-display sm:p-6"
      style={{ background: 'rgba(40, 80, 140, 0.35)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="anim-slide-up card-solid flex max-h-full w-full max-w-3xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6">
          <div>
            <div className="text-lg font-bold tracking-wide text-slate-800 sm:text-2xl">🎥 CAMERA & EFFECTS</div>
            <div className="text-[11px] text-slate-500 sm:text-xs">Camera view, car proportions and drift smoke · changes apply instantly</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-700 transition hover:bg-slate-200 active:scale-95"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="scroll-y px-4 py-4 sm:px-6">
          {/* Camera */}
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-bold tracking-wider text-slate-800">CAMERA</div>
            <div className="text-[11px] text-slate-500">
              press <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-700">C</span> in-race to cycle
            </div>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {CAMERA_MODES.map((c) => (
              <OptionCard key={c.id} active={prefs.camera === c.id} emoji={c.emoji} label={c.label} desc={c.desc} onClick={() => onCamera(c.id)} />
            ))}
          </div>

          {/* Car style */}
          <div className="mt-5 text-sm font-bold tracking-wider text-slate-800">CAR STYLE</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {CAR_STYLES.map((s) => (
              <OptionCard key={s.id} active={prefs.carStyle === s.id} emoji={s.emoji} label={s.label} desc={s.desc} onClick={() => onCarStyle(s.id)} />
            ))}
          </div>

          {/* Smoke */}
          <div className="mt-5 flex items-baseline justify-between">
            <div className="text-sm font-bold tracking-wider text-slate-800">💨 DRIFT SMOKE</div>
            <div className="text-[11px] text-slate-500">{preset ? `${preset.emoji} ${preset.label}` : '✨ Custom'}</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {SMOKE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSmoke({ ...p.smoke })}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-bold tracking-wide transition active:scale-95 sm:text-sm',
                  preset?.id === p.id
                    ? 'bg-gradient-to-b from-orange-400 to-brand text-white shadow-[0_4px_18px_rgba(255,90,31,0.4)]'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                )}
              >
                {p.emoji} {p.label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {SMOKE_FIELDS.map((f) => {
              const v = smoke[f.key];
              const pct = ((v - f.min) / (f.max - f.min)) * 100;
              return (
                <label key={f.key} className="block">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-bold text-slate-700">{f.label}</span>
                    <span className="text-sm font-bold tabular-nums text-brand">{f.format(v)}</span>
                  </div>
                  <input
                    type="range"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={v}
                    onChange={(e) => setSmoke({ [f.key]: parseFloat(e.target.value) })}
                    className="slider mt-1.5"
                    style={{ '--pct': `${pct}%` } as CSSProperties}
                    aria-label={f.label}
                  />
                </label>
              );
            })}
            <label className="flex items-center justify-between rounded-2xl bg-slate-100 px-3 py-2">
              <span>
                <span className="block text-sm font-bold text-slate-700">Wheel-spin swirl</span>
                <span className="block text-[11px] text-slate-500">Smoke curls around the spinning rear tires</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={smoke.wheelSpin}
                onClick={() => setSmoke({ wheelSpin: !smoke.wheelSpin })}
                className={cn('relative h-7 w-12 rounded-full transition', smoke.wheelSpin ? 'bg-brand' : 'bg-slate-300')}
              >
                <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all', smoke.wheelSpin ? 'left-6' : 'left-1')} />
              </button>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => {
              onCamera(DEFAULT_PREFS.camera);
              onCarStyle(DEFAULT_PREFS.carStyle);
              onSmoke({ ...DEFAULT_PREFS.smoke });
            }}
            className="text-sm font-semibold text-slate-500 transition hover:text-slate-800"
          >
            ↺ Reset to default
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gradient-to-b from-orange-400 to-brand px-8 py-2.5 text-sm font-bold tracking-widest text-white shadow-[0_6px_24px_rgba(255,90,31,0.45)] transition active:scale-95 sm:text-base"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}
