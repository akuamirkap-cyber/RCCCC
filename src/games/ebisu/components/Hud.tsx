import { useEffect, useMemo, useRef, useState } from 'react';
import type { HudState, PopupKind, Standing, ZoneHud } from '../game/Game';
import { cn } from '../utils/cn';
import './hud.css';

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
  great: 'eb-grad-gold',
  epic: 'eb-grad-accent',
  bad: 'text-[#ff8da0]',
  info: 'eb-grad-cyan',
  boost: 'eb-grad-accent',
  zone: 'eb-grad-violet',
};

const RANK_NAMES = ['DRIFT', 'NICE DRIFT', 'GREAT DRIFT', 'PERFECT DRIFT'];
const RANK_TEXT = ['text-white', 'eb-grad-cyan', 'eb-grad-gold', 'eb-grad-accent'];
function rankOf(t: number) {
  return t > 2.6 ? 3 : t > 1.5 ? 2 : t > 0.8 ? 1 : 0;
}
function multClass(m: number) {
  return m >= 5 ? 'eb-mult--5' : m >= 4 ? 'eb-mult--4' : m >= 3 ? 'eb-mult--3' : m >= 2 ? 'eb-mult--2' : '';
}

function MiniMap({ data, hud }: { data: MinimapData; hud: HudState }) {
  const pad = 22;
  return (
    <svg viewBox={`${data.minX - pad} ${data.minZ - pad} ${data.w + pad * 2} ${data.h + pad * 2}`} className="h-20 w-20 sm:h-28 sm:w-28">
      <path d={data.path} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={26} strokeLinejoin="round" />
      <path d={data.path} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={14} strokeLinejoin="round" />
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
      <div className="eb-label eb-shadow">Score</div>
      <div key={bump} className={cn('eb-num eb-grad-gold eb-outline text-3xl sm:text-4xl', bump > 0 && 'anim-punch')}>
        {shown.toLocaleString()}
      </div>
      {gains.map((g, i) => (
        <div
          key={g.id}
          className="anim-float-up eb-num pointer-events-none absolute left-full ml-2 whitespace-nowrap text-base text-[#ffd166]"
          style={{ top: 8 - i * 8 }}
        >
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
      <div key={rank} className={cn('anim-pop-in eb-rank eb-outline', RANK_TEXT[rank])}>
        {RANK_NAMES[rank]}
      </div>
      <div className="mt-1 flex items-center gap-2.5">
        <span className="eb-num eb-outline text-5xl sm:text-6xl">{shown.toLocaleString()}</span>
        <span key={view.mult} className={cn('eb-mult anim-pop-in', multClass(view.mult), view.mult >= 3 && 'anim-breathe')}>
          ×{view.mult}
        </span>
      </div>
      <div className="eb-bar eb-bar--seg mt-2 w-36 sm:w-48">
        <div className="eb-bar__fill" style={{ width: `${Math.round(view.boost * 100)}%` }} />
      </div>
      <div className="eb-label mt-1 flex items-center gap-2 text-white/80">
        <span className={cn(view.meterFull && 'eb-anim-blink text-[#ffd166]')}>
          {view.meterFull ? 'Nitro full — fire it' : view.boost >= 1 ? 'Max charge' : 'Nitro charge'}
        </span>
        {view.slipDeg > 0 && <span className="text-[#9eefff]">Slip {view.slipDeg}°</span>}
      </div>
    </div>
  );
}

/** NFS Underground-style live leaderboard: rank · colour bar · name · gap to leader. */
function Leaderboard({ rows }: { rows: Standing[] }) {
  if (!rows.length) return null;
  return (
    <div className="eb-board">
      <div className="eb-board__head">
        <span>Pos</span>
        <span>Driver</span>
        <span className="text-right">Gap</span>
      </div>
      {rows.map((r) => (
        <div key={r.name} className={cn('eb-board__row', r.player && 'eb-board__row--me', r.finished && 'eb-board__row--fin')}>
          <span className="eb-board__pos">{r.position}</span>
          <span className="eb-board__name">
            <span className="eb-board__swatch" style={{ background: r.color }} />
            {r.name}
          </span>
          <span className="eb-board__gap">{r.finished ? 'FIN' : r.position === 1 ? 'LEADER' : `+${r.gap.toFixed(2)}`}</span>
        </div>
      ))}
    </div>
  );
}

/** Slim zone status strip under the timer. */
function ZoneStrip({ zone, leaving }: { zone: ZoneHud; leaving: boolean }) {
  const gold = zone.mult >= 3;
  const shown = useRollingNumber(zone.score, 180);
  return (
    <div className={cn('flex flex-col items-center', leaving ? 'anim-pop-out' : 'anim-pop-in')}>
      <div className="flex items-center gap-2.5 px-1">
        <span className={cn('eb-mult !text-base !min-w-[2rem]', gold ? 'eb-mult--3' : 'eb-mult--5')}>×{zone.mult}</span>
        <span className="eb-outline text-sm font-extrabold uppercase tracking-[0.18em] text-white sm:text-base">{zone.name}</span>
        <span className="eb-num eb-outline text-lg text-[#ffd166] sm:text-xl">{shown.toLocaleString()}</span>
        <span className="flex text-sm leading-none">
          {[1, 2, 3].map((st) => (
            <span key={`${st}-${zone.stars >= st}`} className={cn(zone.stars >= st ? 'anim-star-pop text-[#ffd166]' : 'text-white/25')}>
              ★
            </span>
          ))}
        </span>
        {zone.full && <span className="eb-tag eb-tag--green">Full</span>}
      </div>
      <div className="eb-bar mt-1.5 h-1 w-44 sm:w-60">
        <div className={cn('eb-bar__fill', !gold && 'eb-bar__fill--violet')} style={{ width: `${Math.round(zone.progress * 100)}%` }} />
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
  /** Throttle hold — only shown for the Sakura RC engine (manual gas). */
  onGas?: (down: boolean) => void;
  onBoost: (down: boolean) => void;
  onPause: () => void;
  onToggleMute: () => void;
  onCycleCamera: () => void;
  /** R — put the car back on the track centerline. */
  onReset?: () => void;
  onCycleEngine?: () => void;
  muted: boolean;
  isTouch: boolean;
  /** 'mobile' = compact landscape HUD with on-screen steer / drift / nitro buttons. */
  layout?: 'pc' | 'mobile';
}

const CAMERA_ICON: Record<HudState['camera'], string> = { rally: '🎨', chase: '🎬', cockpit: '🪟', far: '🚁' };

export function Hud({ hud, minimap, popups, onSteer, onHandbrake, onGas, onBoost, onPause, onToggleMute, onCycleCamera, onReset, onCycleEngine, muted, isTouch: isTouchDevice, layout = 'pc' }: HudProps) {
  const active = hud.phase === 'racing' || hud.phase === 'countdown' || hud.phase === 'finished';
  const racing = hud.phase === 'racing';
  const mobile = layout === 'mobile';
  // Mobile layout always behaves like touch (buttons + "tap" hints), PC layout follows the device
  const isTouch = mobile || isTouchDevice;
  const [steerHeld, setSteerHeld] = useState<'left' | 'right' | null>(null);
  const steerBtn = (side: 'left' | 'right', down: boolean) => {
    setSteerHeld(down ? side : (prev) => (prev === side ? null : prev));
    onSteer(side, down);
  };
  const speedPct = Math.min(100, (hud.speed / Math.max(60, hud.topSpeed)) * 100);

  const driftValue = useMemo<DriftView | null>(
    () =>
      racing && hud.isDrifting
        ? {
            chips: hud.driftChips,
            mult: hud.combo,
            time: hud.driftTime,
            boost: hud.driftBoost,
            slipDeg: hud.engine !== 'classic' ? hud.slipDeg : 0,
            meterFull: hud.boost >= 1 && !hud.boosting,
          }
        : null,
    [racing, hud.isDrifting, hud.driftChips, hud.combo, hud.driftTime, hud.driftBoost, hud.boost, hud.boosting, hud.engine, hud.slipDeg],
  );
  const drift = useLinger(driftValue, 380);
  const zoneValue = useMemo(() => (racing ? hud.zone : null), [racing, hud.zone]);
  const zone = useLinger(zoneValue, 400);

  return (
    <div className={cn('eb-hud pointer-events-none absolute inset-0 overflow-hidden text-white', mobile && 'eb-hud--mobile')}>
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


      {active && (
        <>
          {/* Top left: minimap (below the PILIH GAME / BODY BMW chips), no panel */}
          {minimap && (
            <div className="eb-corner-tl absolute left-3 top-14 sm:left-5 sm:top-16">
              <div className="eb-map">
                <MiniMap data={minimap} hud={hud} />
              </div>
            </div>
          )}

          {/* Top center: timer + lap (text only) + zone strip */}
          <div className="eb-corner-tc absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-1.5 sm:top-4">
            <div className="flex items-end gap-4">
              <div className="flex flex-col items-center">
                <span className="eb-label eb-shadow">Time</span>
                <span className="eb-num eb-outline text-3xl sm:text-4xl">{formatTime(hud.raceTime)}</span>
              </div>
              <div className="flex flex-col items-start pb-0.5">
                <span className="eb-label eb-shadow">Lap {Math.min(hud.lap, hud.totalLaps)}/{hud.totalLaps}</span>
                <span className="eb-outline text-base font-bold tabular-nums text-white/90 sm:text-lg">{formatTime(hud.lapTime)}</span>
              </div>
              {hud.bestLap !== null && (
                <div className="flex flex-col items-start pb-0.5">
                  <span className="eb-label eb-shadow text-[#ffd166]/85">Best</span>
                  <span className="eb-outline text-base font-bold tabular-nums text-[#ffd166] sm:text-lg">{formatTime(hud.bestLap)}</span>
                </div>
              )}
            </div>
            <div className="flex gap-1">
              {Array.from({ length: hud.totalLaps }).map((_, i) => (
                <span key={i} className={cn('h-1 w-6 rounded-full shadow', i < hud.lap - 1 ? 'bg-[#ffb703]' : i === hud.lap - 1 ? 'bg-white' : 'bg-white/30')} />
              ))}
            </div>
            {zone && <ZoneStrip zone={zone.value} leaving={zone.leaving} />}
          </div>

          {/* Drift meter: high above the car (higher still for the top-down rally cam) */}
          <div className={cn('eb-center absolute left-1/2 -translate-x-1/2', hud.camera === 'rally' ? 'top-[20%] sm:top-[17%]' : 'top-[27%] sm:top-[24%]')}>
            {drift && <DriftMeter view={drift.value} leaving={drift.leaving} />}
            {hud.wrongWay && racing && (
              <div className="anim-flash flex justify-center">
                <span className="eb-tag eb-tag--red !text-base sm:!text-lg">Wrong way</span>
              </div>
            )}
            {hud.offTrack && !hud.isDrifting && !hud.wrongWay && racing && (
              <div className="eb-anim-rise flex justify-center">
                <span className="eb-tag eb-tag--amber !text-sm sm:!text-base">Off track</span>
              </div>
            )}
          </div>

          {/* Top right: NFS-style leaderboard + buttons */}
          <div className="eb-corner-tr absolute right-3 top-3 flex flex-col items-end gap-2 sm:right-5 sm:top-4">
            <Leaderboard rows={hud.standings} />
            {hud.phase !== 'finished' && (
              <div className="flex gap-1.5">
                {onCycleEngine && (
                  <button
                    type="button"
                    onClick={onCycleEngine}
                    className="eb-chip eb-chip--ghost pointer-events-auto cursor-pointer"
                    aria-label="Change engine"
                    title="Ganti Engine Gerakan (Sakura RC / Slip / Classic)"
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', hud.engine === 'sakura_rc' ? 'bg-pink-400' : hud.engine === 'slip' ? 'bg-[#37e4ff]' : 'bg-white')} />
                    <span>{hud.engine === 'sakura_rc' ? 'Sakura RC' : hud.engine === 'slip' ? 'Slip' : 'Classic'}</span>
                  </button>
                )}
                {onReset && racing && (
                  <button type="button" onClick={onReset} className="eb-chip eb-chip--ghost pointer-events-auto cursor-pointer" aria-label="Reset to track" title="Kembali ke jalur (R)">
                    <span>↺</span>
                    <span>{isTouch ? 'Reset' : 'Reset · R'}</span>
                  </button>
                )}
                <button type="button" onClick={onCycleCamera} className="eb-chip eb-chip--ghost eb-chip--icon pointer-events-auto cursor-pointer" aria-label="Change camera" title="Change camera (C)">
                  {CAMERA_ICON[hud.camera]}
                </button>
                <button type="button" onClick={onToggleMute} className="eb-chip eb-chip--ghost eb-chip--icon pointer-events-auto cursor-pointer" aria-label={muted ? 'Unmute' : 'Mute'}>
                  {muted ? '🔇' : '🔊'}
                </button>
                <button type="button" onClick={onPause} className="eb-chip eb-chip--ghost eb-chip--icon pointer-events-auto cursor-pointer" aria-label="Pause">
                  <span className="flex gap-[3px]">
                    <span className="block h-3 w-[3px] rounded-sm bg-white" />
                    <span className="block h-3 w-[3px] rounded-sm bg-white" />
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Bottom left: score + speed (text only) */}
          <div className={cn('eb-corner-bl absolute', mobile ? 'bottom-3 left-[11.5rem]' : 'bottom-4 left-3 sm:bottom-6 sm:left-5')}>
            <Score score={hud.driftScore} />
            <div className="mt-1 flex items-end gap-2">
              <span className={cn('eb-num eb-outline text-6xl sm:text-7xl', hud.boosting && 'eb-grad-accent')}>{hud.speed}</span>
              <div className="mb-1.5 flex flex-col leading-none">
                <span className="eb-label eb-shadow">km/h</span>
                {hud.engine !== 'classic' && hud.isDrifting && (
                  <span className="eb-shadow mt-1 text-xs font-extrabold tabular-nums text-[#9eefff]">{hud.slipDeg}° SLIP</span>
                )}
              </div>
            </div>
            <div className="eb-bar eb-bar--seg eb-bar--glass mt-1.5 w-36 sm:w-48">
              <div className={cn('eb-bar__fill', !hud.boosting && 'eb-bar__fill--cyan')} style={{ width: `${speedPct}%` }} />
            </div>
          </div>

          {/* Bottom right: manual boost meter — tap / SHIFT to fire when ready */}
          <div
            className={cn(
              'eb-corner-br pointer-events-auto absolute cursor-pointer select-none transition active:scale-95',
              mobile ? 'bottom-3 right-[12.5rem]' : 'bottom-4 right-3 sm:bottom-6 sm:right-5',
            )}
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
            <div className="flex flex-col items-end">
              <div className="flex items-baseline gap-1">
                <span className="eb-num eb-outline text-4xl sm:text-5xl">{hud.position}</span>
                <span className="eb-num eb-outline text-xl text-white/85">{ordinal(hud.position)}</span>
                <span className="eb-shadow ml-1 text-sm font-bold text-white/60">/{hud.totalCars}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                {!hud.boosting && hud.boostReady && <span className="eb-tag eb-tag--amber eb-anim-blink">{isTouch ? 'Tap' : 'Shift'}</span>}
                <span className={cn('eb-num eb-outline text-2xl sm:text-3xl', hud.boosting ? 'eb-grad-accent' : hud.boostReady ? 'text-[#ffd166]' : 'text-white')}>
                  {hud.boosting ? 'BOOST' : 'NITRO'}
                </span>
                <span className="eb-num eb-outline text-lg text-white/70">{Math.round(hud.boost * 100)}%</span>
              </div>
              <div className={cn('eb-bar eb-bar--seg eb-bar--glass mt-1.5 h-2 w-36 sm:w-48', !hud.boosting && hud.boostReady && 'eb-anim-glow', !hud.boosting && !hud.boostReady && hud.boost <= 0 && 'opacity-60')}>
                <div className={cn('eb-bar__fill', hud.boosting ? 'eb-bar__fill--stripes' : 'eb-bar__fill--nitro')} style={{ width: `${Math.round(hud.boost * 100)}%` }} />
              </div>
              {!hud.boosting && (
                <div className="eb-label eb-shadow mt-1">
                  {hud.boostReady ? (isTouch ? 'Tap to fire' : 'Press shift to fire') : isTouch ? 'Drift to charge' : 'Drift to charge · shift to fire'}
                </div>
              )}
            </div>
          </div>

          {/* Zone ahead */}
          {racing && hud.zoneAhead && !hud.isDrifting && !hud.zone && (
            <div className={cn('absolute left-1/2 -translate-x-1/2', mobile ? 'bottom-[6.5rem]' : 'bottom-[8rem] sm:bottom-[9rem]')}>
              <div className="eb-outline flex items-center gap-2.5 px-3.5 py-1.5 text-sm font-extrabold uppercase tracking-[0.16em]">
                <span className="anim-chevrons text-[#b47cff]">»»</span>
                <span className="text-white">Drift zone</span>
                <span className={cn('eb-mult !text-sm !min-w-[1.8rem]', hud.zoneAhead.mult >= 3 ? 'eb-mult--3' : 'eb-mult--5')}>×{hud.zoneAhead.mult}</span>
                <span className="text-white/55">{hud.zoneAhead.dist}m</span>
              </div>
            </div>
          )}

          {/* Handbrake button */}
          {racing && (
            <button
              type="button"
              className={cn(
                'eb-drift-btn pointer-events-auto absolute select-none',
                mobile ? 'bottom-3 right-3 eb-drift-btn--mobile' : 'bottom-4 left-1/2 -translate-x-1/2 sm:bottom-6',
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
                {!isTouch && <span className="text-[10px] font-bold tracking-[0.3em] text-white/80">SPACE</span>}
              </span>
            </button>
          )}

          {/* GAS button — Sakura RC engine only (manual throttle, like the original Sakura RC) */}
          {racing && hud.engine === 'sakura_rc' && onGas && (
            <button
              type="button"
              className={cn(
                'eb-drift-btn eb-gas-btn pointer-events-auto absolute select-none',
                mobile ? 'bottom-3 right-[7.5rem] eb-drift-btn--mobile' : 'bottom-4 left-1/2 ml-28 sm:bottom-6 sm:ml-32',
                !isTouch && 'hidden sm:flex',
              )}
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                onGas(true);
              }}
              onPointerUp={() => onGas(false)}
              onPointerCancel={() => onGas(false)}
              onLostPointerCapture={() => onGas(false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="flex flex-col items-center leading-tight">
                GAS
                {!isTouch && <span className="text-[10px] font-bold tracking-[0.3em] text-white/80">W / ↑</span>}
              </span>
            </button>
          )}

          {/* Mobile landscape: on-screen steer buttons (left) */}
          {mobile && racing && (
            <div className="pointer-events-auto absolute bottom-3 left-3 flex gap-2">
              {(['left', 'right'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  className={cn('eb-steer-btn', steerHeld === side && 'eb-steer-btn--on')}
                  style={{ touchAction: 'none' }}
                  aria-label={side === 'left' ? 'Steer left' : 'Steer right'}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    steerBtn(side, true);
                  }}
                  onPointerUp={() => steerBtn(side, false)}
                  onPointerCancel={() => steerBtn(side, false)}
                  onLostPointerCapture={() => steerBtn(side, false)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {side === 'left' ? '◀' : '▶'}
                </button>
              ))}
            </div>
          )}

          {/* Touch hint on the sides (PC-layout touch devices only) */}
          {isTouch && !mobile && racing && hud.raceTime < 4 && (
            <>
              <div className="anim-flash absolute bottom-1/3 left-6 text-5xl text-white/70 drop-shadow-lg">◀</div>
              <div className="anim-flash absolute bottom-1/3 right-6 text-5xl text-white/70 drop-shadow-lg">▶</div>
            </>
          )}
        </>
      )}

      {/* Popups: floating gradient text, above the car */}
      <div className="absolute left-1/2 top-[40%] sm:top-[38%]">
        {popups.map((p, i) => (
          <div
            key={p.id}
            className={cn('anim-popup eb-num eb-outline absolute left-0 whitespace-nowrap text-3xl uppercase tracking-wide sm:text-5xl', popupStyles[p.kind])}
            style={{ top: i * 48 }}
          >
            {p.text}
          </div>
        ))}
      </div>

      {/* Countdown */}
      {hud.countdown >= 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div key={hud.countdown} className={cn('anim-count eb-num eb-outline text-[8rem] sm:text-[13rem]', hud.countdown === 0 ? 'eb-grad-cyan' : 'eb-grad-accent')}>
            {hud.countdown === 0 ? 'GO!' : hud.countdown}
          </div>
        </div>
      )}
    </div>
  );
}
