import type { RaceResult } from '../game/Game';
import {
  DIFFICULTIES,
  ENGINES,
  FIELD_BY_KEY,
  SLIP_FIELD_BY_KEY,
  estimateZeroToHundred,
  estimateZeroToHundredSlip,
  matchPreset,
  matchSlipPreset,
  norm,
  type GameSetup,
} from '../game/tuning';
import { CAMERA_MODES, CAR_STYLES, matchSmokePreset, type VisualPrefs } from '../game/prefs';
import { formatTime, ordinal, useRollingNumber } from './Hud';
import { cn } from '../utils/cn';

export interface BestRecords {
  score: number;
  lap: number | null;
  wins: number;
  races: number;
}

/** Bright translucent backdrop (no black panels) */
const OVERLAY_BG = 'linear-gradient(180deg, rgba(64,140,230,0.42) 0%, rgba(120,180,240,0.28) 45%, rgba(255,150,80,0.32) 100%)';

function SoundButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="pill pointer-events-auto absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center text-xl text-white transition active:scale-95"
      aria-label={muted ? 'Unmute' : 'Mute'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  const filled = Math.max(1, Math.round(value * 5));
  return (
    <div className="flex items-center gap-2">
      <span className="w-11 text-[10px] font-bold tracking-wider text-slate-500">{label}</span>
      <div className="flex gap-0.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('h-2 w-4 rounded-sm', i < filled ? 'bg-brand' : 'bg-slate-200')} />
        ))}
      </div>
    </div>
  );
}

export function SetupCard({ setup, onClick, compact }: { setup: GameSetup; onClick: () => void; compact?: boolean }) {
  const slip = setup.engine === 'slip';
  const engineInfo = ENGINES.find((e) => e.id === setup.engine);
  const preset = slip ? matchSlipPreset(setup.slipTuning) : matchPreset(setup.tuning);
  const top = slip ? setup.slipTuning : setup.tuning;
  const z = slip ? estimateZeroToHundredSlip(setup.slipTuning) : estimateZeroToHundred(setup.tuning);
  const diff = DIFFICULTIES.find((d) => d.id === setup.race.difficulty)?.label ?? 'Normal';
  const bars = slip
    ? [
        ['SPEED', norm(SLIP_FIELD_BY_KEY.maxSpeed, setup.slipTuning.maxSpeed)],
        ['ACCEL', norm(SLIP_FIELD_BY_KEY.accel, setup.slipTuning.accel)],
        ['STEER', norm(SLIP_FIELD_BY_KEY.turnRate, setup.slipTuning.turnRate)],
        ['GRIP', norm(SLIP_FIELD_BY_KEY.gripNormal, setup.slipTuning.gripNormal)],
      ]
    : [
        ['SPEED', norm(FIELD_BY_KEY.maxSpeed, setup.tuning.maxSpeed)],
        ['ACCEL', norm(FIELD_BY_KEY.accel, setup.tuning.accel)],
        ['STEER', norm(FIELD_BY_KEY.handling, setup.tuning.handling)],
        ['GRIP', norm(FIELD_BY_KEY.grip, setup.tuning.grip)],
      ];
  return (
    <button
      type="button"
      onClick={onClick}
      className="card-solid pointer-events-auto w-full max-w-sm px-4 py-3 text-left transition hover:brightness-105 active:scale-[0.98]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-2xl">{preset?.emoji ?? '✨'}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold tracking-wide text-slate-800">{preset?.name ?? 'Custom Setup'}</span>
              <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wider', slip ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700')}>
                {engineInfo?.emoji} {slip ? 'SLIP' : 'CLASSIC'}
              </span>
            </div>
            <div className="truncate text-[11px] text-slate-500">
              {Math.round(top.maxSpeed)} km/h · 0–100 {z ? `${z.toFixed(1)}s` : '—'} · {setup.race.laps} lap
              {setup.race.laps > 1 ? 's' : ''} · {diff}
            </div>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-gradient-to-b from-orange-400 to-brand px-3 py-1 text-[11px] font-bold tracking-widest text-white shadow-[0_4px_16px_rgba(255,90,31,0.45)]">
          🔧 SETUP
        </span>
      </div>
      {!compact && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 short:hidden">
          {bars.map(([label, value]) => (
            <StatBar key={label as string} label={label as string} value={value as number} />
          ))}
        </div>
      )}
    </button>
  );
}

const PRIMARY_BTN =
  'pointer-events-auto rounded-full bg-gradient-to-b from-orange-400 to-brand font-bold tracking-widest text-white shadow-[0_10px_40px_rgba(255,90,31,0.55)] ring-4 ring-white/50 transition active:scale-95';
const SECONDARY_BTN = 'pill pointer-events-auto font-bold tracking-widest text-white transition active:scale-95';

interface StartProps {
  best: BestRecords;
  setup: GameSetup;
  prefs: VisualPrefs;
  muted: boolean;
  onToggleMute: () => void;
  onStart: () => void;
  onOpenSetup: () => void;
  onOpenVisual: () => void;
  isTouch: boolean;
}

function VisualChip({ prefs, onClick }: { prefs: VisualPrefs; onClick: () => void }) {
  const cam = CAMERA_MODES.find((c) => c.id === prefs.camera);
  const car = CAR_STYLES.find((c) => c.id === prefs.carStyle);
  return (
    <button type="button" onClick={onClick} className={cn(SECONDARY_BTN, 'flex items-center gap-2 px-4 py-1.5 text-xs sm:text-sm')}>
      <span>🎥</span>
      <span>{cam?.label}</span>
      <span className="text-white/60">·</span>
      <span>
        {car?.emoji} {car?.label}
      </span>
      <span className="text-white/60">·</span>
      <span>💨 {matchSmokePreset(prefs.smoke)?.label ?? 'Custom'}</span>
    </button>
  );
}

export function StartScreen({ best, setup, prefs, muted, onToggleMute, onStart, onOpenSetup, onOpenVisual, isTouch }: StartProps) {
  return (
    <div className="scroll-y absolute inset-0 text-white" style={{ background: OVERLAY_BG }}>
      <SoundButton muted={muted} onToggle={onToggleMute} />
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 py-6 sm:gap-5 short:gap-2 short:py-3">
        <div className="anim-slide-up text-center">
          <div className="hud-text-lg text-5xl font-bold italic tracking-tight sm:text-8xl short:text-4xl">
            <span className="text-white">DRIFT</span>
            <span className="grad-text-fire"> KING</span>
          </div>
          <div className="hud-text mt-1 text-xs font-semibold tracking-[0.4em] text-white/90 sm:text-base short:hidden">EBISU-STYLE DRIFT CIRCUIT</div>
        </div>

        <div className="anim-slide-up flex w-full flex-col items-center gap-3 short:gap-2" style={{ animationDelay: '0.1s' }}>
          <SetupCard setup={setup} onClick={onOpenSetup} />
          <VisualChip prefs={prefs} onClick={onOpenVisual} />
          <button
            type="button"
            onClick={onStart}
            className={cn(PRIMARY_BTN, 'anim-pulse-btn px-12 py-4 text-2xl sm:px-16 sm:py-5 sm:text-3xl short:py-2.5 short:text-xl')}
          >
            {isTouch ? 'TAP TO RACE' : 'START RACE'}
          </button>
          <div className="card grid grid-cols-3 gap-3 px-4 py-2 text-center text-xs sm:text-sm short:py-1">
            <div>
              <div className="hud-text text-white/80">BEST SCORE</div>
              <div className="hud-text text-lg font-bold text-yellow-200">{best.score.toLocaleString()}</div>
            </div>
            <div>
              <div className="hud-text text-white/80">BEST LAP</div>
              <div className="hud-text text-lg font-bold text-fuchsia-200">{best.lap ? formatTime(best.lap) : '--:--.--'}</div>
            </div>
            <div>
              <div className="hud-text text-white/80">WINS</div>
              <div className="hud-text text-lg font-bold text-emerald-200">
                {best.wins}
                <span className="text-sm text-white/70">/{best.races}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="anim-slide-up card max-w-md px-4 py-2 text-center text-[11px] text-white sm:text-sm short:py-1 short:text-[10px]" style={{ animationDelay: '0.2s' }}>
          {isTouch ? (
            <>
              <div className="hud-text font-bold">◀ HOLD LEFT / RIGHT SIDE TO STEER ▶</div>
              <div className="hud-text mt-0.5">
                Auto accelerate · Drift for points × combo · hit the <span className="font-bold text-violet-200">DRIFT ZONES</span> for ×2 / <span className="font-bold text-yellow-200">×3</span>
              </div>
              <div className="hud-text mt-0.5 text-white/85">DRIFT button = handbrake · tap BOOST meter to fire · 🎬 camera · ⏸ pause & tune</div>
            </>
          ) : (
            <>
              <div className="hud-text font-bold">← → or A / D to steer · SPACE = handbrake · SHIFT = boost · S = brake</div>
              <div className="hud-text mt-0.5">
                Auto accelerate · Drift for points × combo · hit the <span className="font-bold text-violet-200">DRIFT ZONES</span> for ×2 / <span className="font-bold text-yellow-200">×3</span>
              </div>
              <div className="hud-text mt-0.5 text-white/85">C = switch camera · ESC / P = pause & tune · Drift to charge boost, SHIFT to fire it</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface PauseProps {
  setup: GameSetup;
  prefs: VisualPrefs;
  onResume: () => void;
  onSetup: () => void;
  onVisual: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

export function PauseOverlay({ setup, prefs, onResume, onSetup, onVisual, onRestart, onMenu }: PauseProps) {
  return (
    <div className="scroll-y absolute inset-0 z-20 text-white" style={{ background: OVERLAY_BG }}>
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 py-6 short:gap-2 short:py-3">
        <div className="anim-slide-up hud-text-lg text-5xl font-bold italic tracking-wide sm:text-7xl short:text-3xl">PAUSED</div>
        <div className="anim-slide-up flex w-full max-w-sm flex-col items-center gap-2" style={{ animationDelay: '0.05s' }}>
          <SetupCard setup={setup} onClick={onSetup} compact />
          <VisualChip prefs={prefs} onClick={onVisual} />
        </div>
        <div className="anim-slide-up flex w-full max-w-xs flex-col gap-2.5 short:max-w-md short:flex-row short:flex-wrap short:justify-center short:gap-2" style={{ animationDelay: '0.1s' }}>
          <button type="button" onClick={onResume} className={cn(PRIMARY_BTN, 'px-8 py-3.5 text-xl short:py-2 short:text-base')}>
            ▶ RESUME
          </button>
          <button type="button" onClick={onSetup} className={cn(SECONDARY_BTN, 'px-8 py-3 text-base short:py-2 short:text-sm')}>
            🔧 CAR SETUP
          </button>
          <button type="button" onClick={onVisual} className={cn(SECONDARY_BTN, 'px-8 py-3 text-base short:py-2 short:text-sm')}>
            🎥 CAMERA & FX
          </button>
          <button type="button" onClick={onRestart} className={cn(SECONDARY_BTN, 'px-8 py-3 text-base short:py-2 short:text-sm')}>
            ↺ RESTART RACE
          </button>
          <button type="button" onClick={onMenu} className="hud-text pointer-events-auto rounded-full px-6 py-2 text-sm font-semibold tracking-widest text-white/85 transition hover:text-white">
            MAIN MENU
          </button>
        </div>
        <div className="hud-text text-xs text-white/80">ESC / P to resume</div>
      </div>
    </div>
  );
}

interface ResultProps {
  result: RaceResult;
  best: BestRecords;
  newBestScore: boolean;
  newBestLap: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

const confettiColors = ['#ff5a1f', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#ffffff'];

export function ResultScreen({ result, newBestScore, newBestLap, muted, onToggleMute, onRestart, onMenu }: ResultProps) {
  const won = result.position === 1;
  const positionText = result.position === 1 ? 'grad-text' : result.position === 2 ? 'text-white' : result.position === 3 ? 'grad-text-fire' : 'text-white/90';
  return (
    <div className="scroll-y absolute inset-0 text-white" style={{ background: OVERLAY_BG }}>
      <SoundButton muted={muted} onToggle={onToggleMute} />
      {won && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className="anim-confetti absolute top-0 h-3 w-2 rounded-sm"
              style={{
                left: `${(i * 37) % 100}%`,
                background: confettiColors[i % confettiColors.length],
                animationDuration: `${2.4 + (i % 5) * 0.4}s`,
                animationDelay: `${(i % 7) * 0.25}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="flex min-h-full flex-col items-center justify-center px-4 py-6 short:py-3">
        <div className="anim-slide-up text-center">
          <div className="hud-text text-sm font-bold tracking-[0.4em] text-white/90">{won ? 'VICTORY' : 'RACE FINISHED'}</div>
          <div className={cn('hud-text-lg mt-1 text-7xl font-bold leading-none sm:text-9xl short:text-5xl', positionText)}>
            {result.position}
            <span className="text-4xl sm:text-5xl">{ordinal(result.position)}</span>
          </div>
          <div className="hud-text mt-1 text-lg text-white/90">{won ? '🏆 Drift King of the circuit!' : `of ${result.totalCars} racers`}</div>
        </div>

        <div className="anim-slide-up card-solid mt-5 w-full max-w-sm p-5 short:mt-2 short:p-3" style={{ animationDelay: '0.15s' }}>
          <ScoreTally score={result.driftScore} newBest={newBestScore} />
          <Row label="Total time" value={formatTime(result.totalTime)} />
          <Row label="Best lap" value={result.bestLap ? formatTime(result.bestLap) : '--'} accent="text-fuchsia-600" badge={newBestLap ? 'NEW BEST' : undefined} />
          <div className="mt-3 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
            {result.lapTimes.map((t, i) => (
              <span key={i}>
                L{i + 1} <span className="font-semibold text-slate-700">{formatTime(t)}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="anim-slide-up mt-5 flex flex-col items-center gap-3 short:mt-2 short:flex-row short:gap-4" style={{ animationDelay: '0.3s' }}>
          <button type="button" onClick={onRestart} className={cn(PRIMARY_BTN, 'anim-pulse-btn px-12 py-4 text-2xl short:py-2.5 short:text-lg')}>
            RACE AGAIN
          </button>
          <button type="button" onClick={onMenu} className="hud-text pointer-events-auto rounded-full px-6 py-2 text-sm font-semibold tracking-widest text-white/85 transition hover:text-white">
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}

/** Final score reveal: counts up, then pops with a badge. */
function ScoreTally({ score, newBest }: { score: number; newBest: boolean }) {
  const shown = useRollingNumber(score, 1400);
  const done = shown >= score;
  return (
    <div className="mb-3 flex flex-col items-center border-b border-slate-200 pb-4">
      <div className="text-[11px] font-bold tracking-[0.3em] text-slate-500">DRIFT SCORE</div>
      <div className={cn('mt-1 text-5xl font-bold tabular-nums sm:text-6xl', done && 'anim-punch')}>
        <span className="grad-text-fire">{shown.toLocaleString()}</span>
      </div>
      {done && newBest && (
        <div className="anim-pop-in mt-2 rounded-full bg-emerald-400 px-3 py-0.5 text-xs font-bold tracking-widest text-slate-900">NEW BEST!</div>
      )}
    </div>
  );
}

function Row({ label, value, accent, badge }: { label: string; value: string; accent?: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 py-2 last:border-b-0">
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <span className="flex items-center gap-2">
        {badge && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{badge}</span>}
        <span className={cn('text-xl font-bold tabular-nums text-slate-800', accent)}>{value}</span>
      </span>
    </div>
  );
}
