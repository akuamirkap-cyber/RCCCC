import { useEffect, useMemo, useRef, useState } from 'react';
import type { HudState, PopupKind, ZoneHud } from '../game/Game';
import { cn } from '../utils/cn';

export interface Popup {
  id: number;
  text: string;
  kind: PopupKind;
}

export interface MinimapData {
  path: string;
  minX: number;
  minZ: number;
  w: number;
  h: number;
  zones: { path: string; color: string }[];
}

export function formatTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const c = Math.floor((t * 100) % 100);
  return `${m}:${s.toString().padStart(2, '0')}.${c.toString().padStart(2, '0')}`;
}

export function ordinal(n: number) {
  return n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH';
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/** Eases a displayed number toward its target (count-up). */
export function useRollingNumber(target: number, duration = 550): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    if (target < from) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (target - from) * e);
      shownRef.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return shown;
}

/** Keeps the last non-null value around for `ms` so it can animate out. */
function useLinger<T>(value: T | null, ms = 400): { value: T; leaving: boolean } | null {
  const [state, setState] = useState<{ value: T; leaving: boolean } | null>(value ? { value, leaving: false } : null);
  useEffect(() => {
    if (value) setState({ value, leaving: false });
    else setState((s) => (s && !s.leaving ? { ...s, leaving: true } : s));
  }, [value]);
  const leaving = state?.leaving ?? false;
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setState((s) => (s?.leaving ? null : s)), ms);
    return () => window.clearTimeout(t);
  }, [leaving, ms]);
  return state;
}

/* ------------------------------------------------------------------ */
/*  Pieces                                                             */
/* ------------------------------------------------------------------ */

const popupStyles: Record<PopupKind, string> = {
  good: 'text-white',
  great: 'grad-text',
  epic: 'grad-text-fire',
  bad: 'text-red-300',
  info: 'grad-text-ice',
  boost: 'grad-text-fire',
  zone: 'grad-text-violet',
};

const RANK_NAMES = ['DRIFT', 'NICE DRIFT', 'GREAT DRIFT', 'PERFECT DRIFT'];
const RANK_TEXT = ['text-white', 'grad-text-ice', 'grad-text', 'grad-text-fire'];
const MULT_BG = [
  'from-white/80 to-white/60 text-slate-800',
  'from-white/80 to-white/60 text-slate-800',
  'from-sky-300 to-cyan-400 text-white',
  'from-yellow-300 to-amber-400 text-slate-900',
  'from-orange-400 to-rose-500 text-white',
  'from-fuchsia-400 to-violet-500 text-white',
];
function rankOf(t: number) {
  return t > 2.6 ? 3 : t > 1.5 ? 2 : t > 0.8 ? 1 : 0;
}

function MiniMap({ data, hud }: { data: MinimapData; hud: HudState }) {
  const pad = 22;
  return (
    <svg viewBox={`${data.minX - pad} ${data.minZ - pad} ${data.w + pad * 2} ${data.h + pad * 2}`} className="h-20 w-20 sm:h-28 sm:w-28">
      <path d={data.path} fill="none" stroke="rgba(20,30,60,0.35)" strokeWidth={24} strokeLinejoin="round" />
      <path d={data.path} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth={15} strokeLinejoin="round" />
      {data.zones.map((z, i) => (
        <path key={i} d={z.path} fill="none" stroke={z.color} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {hud.cars.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.z} r={c.player ? 11 : 8} fill={c.color} stroke="#fff" strokeWidth={c.player ? 4 : 2.5} />
      ))}
    </svg>
  );
}

function Score({ score }: { score: number }) {
  const shown = useRollingNumber(score, 600);
  const prev = useRef(score);
  const [bump, setBump] = useState(0);
  const [gains, setGains] = useState<{ id: number; amount: number }[]>([]);
  useEffect(() => {
    const d = score - prev.current;
    prev.current = score;
    if (d > 0) {
      const id = Date.now() + Math.random();
      setBump((b) => b + 1);
      setGains((g) => [...g.slice(-2), { id, amount: d }]);
      window.setTimeout(() => setGains((g) => g.filter((x) => x.id !== id)), 1000);
    }
  }, [score]);
  return (
    <div className="relative">
      <div key={bump} className={cn('flex items-baseline gap-1.5', bump > 0 && 'anim-punch')}>
        <span className="hud-text text-[10px] font-bold tracking-[0.25em] text-white/80">SCORE</span>
        <span className="hud-text-lg grad-text text-2xl font-bold leading-none tabular-nums sm:text-3xl">{shown.toLocaleString()}</span>
      </div>
      {gains.map((g, i) => (
        <div key={g.id} className="anim-float-up hud-text pointer-events-none absolute left-full ml-2 whitespace-nowrap text-sm font-bold text-yellow-200" style={{ top: -2 - i * 8 }}>
          +{g.amount.toLocaleString()}
        </div>
      ))}
    </div>
  );
}

interface DriftView {
  chips: number;
  mult: number;
  time: number;
  boost: number; // charge this drift will bank into the meter
  slipDeg: number; // 0 when the classic engine is active
  meterFull: boolean; // stored meter already full — fire it instead of charging
}

/** Floating drift meter — sits high above the car, nothing solid behind it. */
function DriftMeter({ view, leaving }: { view: DriftView; leaving: boolean }) {
  const rank = rankOf(view.time);
  const total = Math.round(view.chips * view.mult);
  const shown = useRollingNumber(total, 180);
  return (
    <div className={cn('flex flex-col items-center', leaving ? 'anim-pop-out' : 'anim-pop-in')}>
      <div key={rank} className={cn('anim-pop-in hud-text-lg text-lg font-bold italic tracking-[0.2em] sm:text-2xl', RANK_TEXT[rank])}>
        {RANK_NAMES[rank]}
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="hud-text-lg text-4xl font-bold leading-none tabular-nums text-white sm:text-5xl">{shown.toLocaleString()}</span>
        <span
          key={view.mult}
          className={cn(
            'anim-pop-in rounded-full bg-gradient-to-b px-2.5 py-0.5 text-lg font-bold shadow-[0_4px_14px_rgba(0,0,0,0.25)] sm:text-2xl',
            MULT_BG[Math.min(5, view.mult)],
            view.mult >= 3 && 'anim-breathe',
          )}
        >
          ×{view.mult}
        </span>
      </div>
      <div className="track mt-1.5 h-1.5 w-32 sm:w-44">
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-300 via-yellow-300 to-white transition-[width] duration-100"
          style={{ width: `${Math.round(view.boost * 100)}%` }}
        />
      </div>
      <div className="hud-text mt-0.5 text-[10px] font-semibold tracking-widest text-white/80">
        {view.meterFull ? 'METER FULL — FIRE IT!' : view.boost >= 1 ? 'MAX CHARGE' : 'BOOST CHARGE'}
        {view.slipDeg > 0 && <span className="ml-2 text-violet-200">SLIP {view.slipDeg}°</span>}
      </div>
    </div>
  );
}

/** Slim zone status strip under the timer. */
function ZoneStrip({ zone, leaving }: { zone: ZoneHud; leaving: boolean }) {
  const gold = zone.mult >= 3;
  const shown = useRollingNumber(zone.score, 180);
  return (
    <div className={cn('flex flex-col items-center', leaving ? 'anim-pop-out' : 'anim-pop-in')}>
      <div className="pill flex items-center gap-2 px-3 py-1">
        <span className={cn('rounded-full bg-gradient-to-b px-2 py-0.5 text-xs font-bold', gold ? 'from-yellow-300 to-amber-400 text-slate-900' : 'from-violet-400 to-fuchsia-500 text-white')}>
          ×{zone.mult}
        </span>
        <span className="hud-text text-xs font-bold tracking-wider text-white sm:text-sm">{zone.name}</span>
        <span className="hud-text text-sm font-bold tabular-nums text-yellow-200 sm:text-base">{shown.toLocaleString()}</span>
        <span className="flex text-sm leading-none">
          {[1, 2, 3].map((s) => (
            <span key={`${s}-${zone.stars >= s}`} className={cn(zone.stars >= s ? 'anim-star-pop text-yellow-300' : 'text-white/40')}>
              ★
            </span>
          ))}
        </span>
        {zone.full && <span className="rounded-full bg-emerald-400 px-1.5 text-[10px] font-bold text-slate-900">FULL</span>}
      </div>
      <div className="track mt-1 h-1 w-40 sm:w-56">
        <div
          className={cn('h-full rounded-full transition-[width] duration-150', gold ? 'bg-gradient-to-r from-yellow-300 to-orange-400' : 'bg-gradient-to-r from-violet-300 to-fuchsia-400')}
          style={{ width: `${Math.round(zone.progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HUD                                                                */
/* ------------------------------------------------------------------ */

interface HudProps {
  hud: HudState;
  minimap: MinimapData | null;
  popups: Popup[];
  onSteer: (side: 'left' | 'right', down: boolean) => void;
  onHandbrake: (down: boolean) => void;
  onBoost: (down: boolean) => void;
  onPause: () => void;
  onToggleMute: () => void;
  onCycleCamera: () => void;
  muted: boolean;
  isTouch: boolean;
}

const CAMERA_ICON: Record<HudState['camera'], string> = { rally: '🎨', chase: '🎬', cockpit: '🪟', far: '🚁' };

export function Hud({ hud, minimap, popups, onSteer, onHandbrake, onBoost, onPause, onToggleMute, onCycleCamera, muted, isTouch }: HudProps) {
  const active = hud.phase === 'racing' || hud.phase === 'countdown' || hud.phase === 'finished';
  const racing = hud.phase === 'racing';
  const speedPct = Math.min(100, (hud.speed / Math.max(60, hud.topSpeed)) * 100);

  const driftValue = useMemo<DriftView | null>(
    () =>
      racing && hud.isDrifting
        ? {
            chips: hud.driftChips,
            mult: hud.combo,
            time: hud.driftTime,
            boost: hud.driftBoost,
            slipDeg: hud.engine === 'slip' ? hud.slipDeg : 0,
            meterFull: hud.boost >= 1 && !hud.boosting,
          }
        : null,
    [racing, hud.isDrifting, hud.driftChips, hud.combo, hud.driftTime, hud.driftBoost, hud.boost, hud.boosting, hud.engine, hud.slipDeg],
  );
  const drift = useLinger(driftValue, 380);
  const zoneValue = useMemo(() => (racing ? hud.zone : null), [racing, hud.zone]);
  const zone = useLinger(zoneValue, 400);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden font-display text-white">
      {/* Touch steering zones */}
      {active && (
        <>
          <div
            className="pointer-events-auto absolute inset-y-0 left-0 w-1/2"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              onSteer('left', true);
            }}
            onPointerUp={() => onSteer('left', false)}
            onPointerCancel={() => onSteer('left', false)}
            onLostPointerCapture={() => onSteer('left', false)}
          />
          <div
            className="pointer-events-auto absolute inset-y-0 right-0 w-1/2"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              onSteer('right', true);
            }}
            onPointerUp={() => onSteer('right', false)}
            onPointerCancel={() => onSteer('right', false)}
            onLostPointerCapture={() => onSteer('right', false)}
          />
        </>
      )}

      {/* Boost overlay */}
      {hud.boosting && (
        <>
          <div className="anim-boost absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(255,140,40,0) 45%, rgba(255,120,30,0.5) 100%)' }} />
          <div className="speed-lines anim-boost absolute inset-0" />
        </>
      )}

      {/* High-speed streaks above ~130 km/h (below boost intensity) */}
      {!hud.boosting && racing && hud.speed >= 130 && <div className="speed-lines anim-boost absolute inset-0 opacity-30" />}

      {/* Off-track vignette */}
      {hud.offTrack && racing && (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(60,30,0,0.4) 100%)' }} />
      )}

      {active && (
        <>
          {/* Top left: position, lap, score */}
          <div className="absolute left-3 top-3 flex flex-col gap-1.5 sm:left-5 sm:top-5">
            <div className="flex items-end gap-1">
              <span className="hud-text-lg text-5xl font-bold leading-none text-white sm:text-6xl">{hud.position}</span>
              <span className="hud-text mb-1 text-base font-bold text-white/90">{ordinal(hud.position)}</span>
              <span className="hud-text mb-1 ml-0.5 text-sm font-semibold text-white/60">/ {hud.totalCars}</span>
            </div>
            <div className="pill w-max px-3 py-0.5 text-xs font-bold tracking-wider sm:text-sm">
              LAP <span className="text-yellow-200">{hud.lap}</span>
              <span className="text-white/70"> / {hud.totalLaps}</span>
            </div>
            <Score score={hud.driftScore} />
          </div>

          {/* Top center: timer + zone strip */}
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-1.5 sm:top-5">
            <div className="hud-text text-xl font-bold tabular-nums leading-none sm:text-2xl">{formatTime(hud.raceTime)}</div>
            <div className="hud-text text-[10px] font-semibold tracking-widest text-white/75 sm:text-xs">
              LAP {formatTime(hud.lapTime)}
              {hud.bestLap !== null && <span className="ml-2 text-fuchsia-200">BEST {formatTime(hud.bestLap)}</span>}
            </div>
            {zone && <ZoneStrip zone={zone.value} leaving={zone.leaving} />}
          </div>

          {/* Drift meter: high above the car (higher still for the top-down rally cam) */}
          <div className={cn('absolute left-1/2 -translate-x-1/2', hud.camera === 'rally' ? 'top-[20%] sm:top-[17%]' : 'top-[27%] sm:top-[24%]')}>
            {drift && <DriftMeter view={drift.value} leaving={drift.leaving} />}
            {hud.wrongWay && racing && (
              <div className="anim-flash hud-text-lg text-center text-3xl font-bold tracking-wider text-red-300 sm:text-4xl">WRONG WAY</div>
            )}
            {hud.offTrack && !hud.isDrifting && !hud.wrongWay && racing && (
              <div className="hud-text-lg text-center text-lg font-bold tracking-widest text-orange-200 sm:text-xl">OFF TRACK</div>
            )}
          </div>

          {/* Top right: minimap + buttons */}
          <div className="absolute right-3 top-3 flex flex-col items-end gap-2 sm:right-5 sm:top-5">
            {minimap && (
              <div className="card p-1.5">
                <MiniMap data={minimap} hud={hud} />
              </div>
            )}
            {hud.phase !== 'finished' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCycleCamera}
                  className="pill pointer-events-auto flex h-9 w-9 items-center justify-center text-sm transition active:scale-95"
                  aria-label="Change camera"
                  title="Change camera (C)"
                >
                  {CAMERA_ICON[hud.camera]}
                </button>
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="pill pointer-events-auto flex h-9 w-9 items-center justify-center text-sm transition active:scale-95"
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? '🔇' : '🔊'}
                </button>
                <button
                  type="button"
                  onClick={onPause}
                  className="pill pointer-events-auto flex h-9 w-9 items-center justify-center text-sm font-bold transition active:scale-95"
                  aria-label="Pause"
                >
                  ❚❚
                </button>
              </div>
            )}
          </div>

          {/* Bottom left: speed */}
          <div className="absolute bottom-4 left-3 sm:bottom-6 sm:left-5">
            <div className="flex items-end gap-1">
              <span className="hud-text-lg text-5xl font-bold leading-none tabular-nums sm:text-6xl">{hud.speed}</span>
              <span className="hud-text mb-1.5 text-xs font-bold text-white/80 sm:text-sm">km/h</span>
            </div>
            <div className="track mt-1.5 h-2 w-28 sm:w-40">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-100',
                  hud.boosting ? 'bg-gradient-to-r from-orange-300 to-yellow-200' : 'bg-gradient-to-r from-cyan-300 to-white',
                )}
                style={{ width: `${speedPct}%` }}
              />
            </div>
          </div>

          {/* Bottom right: manual boost meter — tap / SHIFT to fire when ready */}
          <div
            className="pointer-events-auto absolute bottom-4 right-3 flex cursor-pointer select-none flex-col items-end transition active:scale-95 sm:bottom-6 sm:right-5"
            style={{ touchAction: 'none' }}
            role="button"
            aria-label={hud.boosting ? 'Boosting' : hud.boostReady ? 'Fire boost' : 'Boost meter'}
            title={isTouch ? 'Tap to boost' : 'Boost (SHIFT)'}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              onBoost(true);
            }}
            onPointerUp={() => onBoost(false)}
            onPointerCancel={() => onBoost(false)}
            onLostPointerCapture={() => onBoost(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div
              className={cn(
                'hud-text text-xs font-bold tracking-widest sm:text-sm',
                hud.boosting ? 'text-orange-200' : hud.boostReady ? 'anim-breathe text-yellow-200' : 'text-white/85',
              )}
            >
              {hud.boosting ? '🔥 BOOSTING' : hud.boostReady ? (isTouch ? '⚡ BOOST READY — TAP!' : '⚡ BOOST READY — SHIFT!') : 'BOOST'}
            </div>
            <div
              className={cn(
                'track mt-1.5 h-2.5 w-28 sm:w-40',
                !hud.boosting && hud.boostReady && 'ring-2 ring-yellow-200/90',
                !hud.boosting && !hud.boostReady && hud.boost <= 0 && 'opacity-60',
              )}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-100',
                  hud.boosting
                    ? 'anim-shimmer bg-gradient-to-r from-yellow-200 via-orange-400 to-yellow-200'
                    : hud.boostReady
                      ? 'bg-gradient-to-r from-yellow-200 to-orange-400'
                      : 'bg-gradient-to-r from-fuchsia-300 to-orange-300',
                )}
                style={{ width: `${Math.round(hud.boost * 100)}%` }}
              />
            </div>
            {!hud.boosting && (
              <div className="hud-text mt-1 text-[10px] font-semibold tracking-widest text-white/70">
                {hud.boostReady ? (isTouch ? 'TAP METER TO FIRE' : 'PRESS SHIFT TO FIRE') : isTouch ? 'DRIFT TO CHARGE' : 'DRIFT TO CHARGE, SHIFT TO FIRE'}
              </div>
            )}
          </div>

          {/* Zone ahead */}
          {racing && hud.zoneAhead && !hud.isDrifting && !hud.zone && (
            <div className="absolute bottom-[7.5rem] left-1/2 -translate-x-1/2 sm:bottom-[8.5rem]">
              <div className="pill flex items-center gap-2 px-3 py-1 text-xs font-bold tracking-wider sm:text-sm">
                <span className="anim-chevrons text-violet-200">»»</span>
                <span className="text-white">DRIFT ZONE</span>
                <span className={cn('rounded-full px-1.5 py-0.5 text-[11px]', hud.zoneAhead.mult >= 3 ? 'bg-yellow-300 text-slate-900' : 'bg-violet-400 text-white')}>×{hud.zoneAhead.mult}</span>
                <span className="text-white/75">{hud.zoneAhead.dist}m</span>
              </div>
            </div>
          )}

          {/* Handbrake button */}
          {racing && (
            <button
              type="button"
              className={cn(
                'pointer-events-auto absolute bottom-4 left-1/2 flex h-20 w-20 -translate-x-1/2 select-none items-center justify-center rounded-full border-4 border-white/80 bg-gradient-to-b from-orange-400 to-brand text-sm font-bold tracking-widest text-white shadow-[0_8px_30px_rgba(255,90,31,0.55)] active:scale-95 sm:bottom-6 sm:h-24 sm:w-24 sm:text-base',
                !isTouch && 'hidden sm:flex',
              )}
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                onHandbrake(true);
              }}
              onPointerUp={() => onHandbrake(false)}
              onPointerCancel={() => onHandbrake(false)}
              onLostPointerCapture={() => onHandbrake(false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="flex flex-col items-center leading-tight">
                DRIFT
                {!isTouch && <span className="text-[10px] font-semibold text-white/80">SPACE</span>}
              </span>
            </button>
          )}

          {/* Touch hint on the sides */}
          {isTouch && racing && hud.raceTime < 4 && (
            <>
              <div className="anim-flash hud-text absolute bottom-1/3 left-6 text-5xl text-white/70">◀</div>
              <div className="anim-flash hud-text absolute bottom-1/3 right-6 text-5xl text-white/70">▶</div>
            </>
          )}
        </>
      )}

      {/* Popups: floating gradient text, above the car */}
      <div className="absolute left-1/2 top-[40%] sm:top-[38%]">
        {popups.map((p, i) => (
          <div
            key={p.id}
            className={cn('anim-popup hud-text-lg absolute left-0 whitespace-nowrap text-2xl font-bold italic tracking-wide sm:text-4xl', popupStyles[p.kind])}
            style={{ top: i * 44 }}
          >
            {p.text}
          </div>
        ))}
      </div>

      {/* Countdown */}
      {hud.countdown >= 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            key={hud.countdown}
            className={cn('anim-count hud-text-lg text-[7rem] font-bold leading-none sm:text-[11rem]', hud.countdown === 0 ? 'grad-text-ice' : 'grad-text')}
          >
            {hud.countdown === 0 ? 'GO!' : hud.countdown}
          </div>
        </div>
      )}
    </div>
  );
}
