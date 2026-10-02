import type { CSSProperties } from 'react';
import {
  DEFAULT_ENGINE,
  DEFAULT_RACE,
  DEFAULT_SLIP,
  DEFAULT_TUNING,
  DIFFICULTIES,
  ENGINES,
  MAX_LAPS,
  MIN_LAPS,
  PRESETS,
  SLIP_FIELDS,
  SLIP_PRESETS,
  TUNING_FIELDS,
  clampSlip,
  clampTuning,
  driftStyle,
  estimateZeroToHundred,
  estimateZeroToHundredSlip,
  matchPreset,
  matchSlipPreset,
  norm,
  slipDriftAngle,
  slipStyle,
  type CarTuning,
  type EngineKind,
  type FieldDef,
  type GameSetup,
  type RaceSettings,
  type SlipTuning,
} from '../game/tuning';
import { cn } from '../utils/cn';

interface Props {
  setup: GameSetup;
  onEngine: (e: EngineKind) => void;
  onTuning: (t: CarTuning) => void;
  onSlipTuning: (t: SlipTuning) => void;
  onRace: (r: RaceSettings) => void;
  onClose: () => void;
  inRace: boolean;
}

function Slider<K extends string>({ field, value, onChange }: { field: FieldDef<K>; value: number; onChange: (v: number) => void }) {
  const pct = norm(field, value) * 100;
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold text-slate-700">{field.label}</span>
        <span className="text-sm font-bold tabular-nums text-brand">{field.format(value)}</span>
      </div>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="slider mt-1.5"
        style={{ '--pct': `${pct}%` } as CSSProperties}
        aria-label={field.label}
      />
      <div className="mt-1 text-[11px] leading-tight text-slate-500">{field.hint}</div>
    </label>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl bg-slate-100 px-2 py-2">
      <div className="text-[10px] font-bold tracking-widest text-slate-500">{label}</div>
      <div className="text-lg font-bold leading-tight tabular-nums text-slate-800 sm:text-xl">
        {value}
        {unit && <span className="ml-1 text-xs font-semibold text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

function PresetChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-bold tracking-wide transition active:scale-95 sm:text-sm',
        active ? 'bg-gradient-to-b from-orange-400 to-brand text-white shadow-[0_4px_18px_rgba(255,90,31,0.4)]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
      )}
    >
      {label}
    </button>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn('flex overflow-hidden rounded-full bg-slate-100 p-1', disabled && 'opacity-50')}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-full px-2 py-1.5 text-sm font-bold transition',
            o.value === value ? 'bg-gradient-to-b from-orange-400 to-brand text-white shadow' : 'text-slate-600 hover:bg-white',
            !disabled && 'active:scale-95',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TuningPanel({ setup, onEngine, onTuning, onSlipTuning, onRace, onClose, inRace }: Props) {
  const { engine, tuning, slipTuning, race } = setup;
  const slip = engine === 'slip';
  const preset = slip ? matchSlipPreset(slipTuning) : matchPreset(tuning);
  const zeroTo100 = slip ? estimateZeroToHundredSlip(slipTuning) : estimateZeroToHundred(tuning);
  const top = slip ? slipTuning : tuning;
  const setClassic = (key: keyof CarTuning, v: number) => onTuning(clampTuning({ ...tuning, [key]: v }));
  const setSlip = (key: keyof SlipTuning, v: number) => onSlipTuning(clampSlip({ ...slipTuning, [key]: v }));
  const isDefault =
    engine === DEFAULT_ENGINE &&
    TUNING_FIELDS.every((f) => Math.abs(tuning[f.key] - DEFAULT_TUNING[f.key]) < 1e-6) &&
    SLIP_FIELDS.every((f) => Math.abs(slipTuning[f.key] - DEFAULT_SLIP[f.key]) < 1e-6) &&
    race.laps === DEFAULT_RACE.laps &&
    race.difficulty === DEFAULT_RACE.difficulty;

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center p-2 font-display sm:p-6"
      style={{ background: 'rgba(40, 80, 140, 0.35)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="anim-slide-up card-solid flex max-h-full w-full max-w-3xl flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6">
          <div>
            <div className="text-lg font-bold tracking-wide text-slate-800 sm:text-2xl">🔧 CAR SETUP</div>
            <div className="text-[11px] text-slate-500 sm:text-xs">
              {preset ? `${preset.emoji} ${preset.name} · ${preset.desc}` : '✨ Custom setup'} · changes apply instantly
            </div>
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

        {/* Body */}
        <div className="scroll-y px-4 py-4 sm:px-6">
          {/* Engine */}
          <div className="text-sm font-bold tracking-wider text-slate-800">PHYSICS ENGINE</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ENGINES.map((e) => {
              const active = engine === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onEngine(e.id)}
                  className={cn(
                    'flex items-start gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition active:scale-[0.98]',
                    active ? 'border-brand bg-orange-50 shadow-[0_4px_18px_rgba(255,90,31,0.25)]' : 'border-slate-200 bg-white hover:border-slate-300',
                  )}
                >
                  <span className="text-2xl leading-none">{e.emoji}</span>
                  <span className="min-w-0">
                    <span className={cn('block text-sm font-bold', active ? 'text-brand' : 'text-slate-800')}>{e.label}</span>
                    <span className="block text-[11px] leading-tight text-slate-500">{e.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {slip && (
            <div className="mt-2 rounded-2xl bg-violet-50 px-3 py-2 text-[11px] leading-snug text-violet-900">
              <b>How it drives:</b> the rear breaks loose past ~11° of slip and locks into a lower <i>Drift Grip</i>; the <i>Stability</i> torque
              pulls the nose back toward the direction of travel (lift the steering and it straightens itself), counter-steer to hold the angle,
              and a tap of the handbrake above 6 units/s kicks the tail out. Angle costs speed (scrub) — the rivals run the same physics.
            </div>
          )}

          {/* Presets */}
          <div className="mt-4 flex flex-wrap gap-2">
            {slip
              ? SLIP_PRESETS.map((p) => <PresetChip key={p.id} active={preset?.id === p.id} label={`${p.emoji} ${p.name}`} onClick={() => onSlipTuning({ ...p.tuning })} />)
              : PRESETS.map((p) => <PresetChip key={p.id} active={preset?.id === p.id} label={`${p.emoji} ${p.name}`} onClick={() => onTuning({ ...p.tuning })} />)}
          </div>

          {/* Live stats */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <Stat label="TOP SPEED" value={`${Math.round(top.maxSpeed)}`} unit="km/h" />
            <Stat label="WITH BOOST" value={`${Math.round(top.maxSpeed + top.boostPower)}`} unit="km/h" />
            <Stat label="0–100 KM/H" value={zeroTo100 ? zeroTo100.toFixed(1) : '—'} unit="s" />
            {slip ? (
              <Stat label="DRIFT ANGLE" value={`≈${Math.round(slipDriftAngle(slipTuning))}°`} unit={slipStyle(slipTuning)} />
            ) : (
              <Stat label="DRIFT STYLE" value={driftStyle(tuning)} />
            )}
          </div>

          {/* Sliders */}
          <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {slip
              ? SLIP_FIELDS.map((f) => <Slider key={f.key} field={f} value={slipTuning[f.key]} onChange={(v) => setSlip(f.key, v)} />)
              : TUNING_FIELDS.map((f) => <Slider key={f.key} field={f} value={tuning[f.key]} onChange={(v) => setClassic(f.key, v)} />)}
          </div>

          {/* Race settings */}
          <div className="mt-6 rounded-2xl bg-slate-50 p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold tracking-wider text-slate-800">🏁 RACE SETTINGS</div>
              {inRace && <span className="text-[11px] text-slate-500">Locked during a race</span>}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] font-bold tracking-widest text-slate-500">LAPS</div>
                <Segmented
                  options={Array.from({ length: MAX_LAPS - MIN_LAPS + 1 }, (_, i) => ({ value: MIN_LAPS + i, label: String(MIN_LAPS + i) }))}
                  value={race.laps}
                  onChange={(laps) => onRace({ ...race, laps })}
                  disabled={inRace}
                />
              </div>
              <div>
                <div className="mb-1 text-[11px] font-bold tracking-widest text-slate-500">RIVAL DIFFICULTY</div>
                <Segmented
                  options={DIFFICULTIES.map((d) => ({ value: d.id, label: d.label }))}
                  value={race.difficulty}
                  onChange={(difficulty) => onRace({ ...race, difficulty })}
                  disabled={inRace}
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  {DIFFICULTIES.find((d) => d.id === race.difficulty)?.desc} · rivals scale with your top speed
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:px-6">
          <button
            type="button"
            disabled={isDefault}
            onClick={() => {
              onEngine(DEFAULT_ENGINE);
              onTuning({ ...DEFAULT_TUNING });
              onSlipTuning({ ...DEFAULT_SLIP });
              if (!inRace) onRace({ ...DEFAULT_RACE });
            }}
            className="text-sm font-semibold text-slate-500 transition hover:text-slate-800 disabled:opacity-40"
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
