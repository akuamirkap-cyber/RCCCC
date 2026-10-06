import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Volume2,
  VolumeX,
  Sliders,
  Camera,
  Eye,
  RotateCcw,
  Sparkles,
  CloudFog,
  Home,
  Menu,
  X,
  Gamepad2,
  BookOpen,
  Ruler,
  Smartphone,
} from 'lucide-react';
import {
  BodyShellMode,
  CameraMode,
  CircuitDef,
  GameMode,
  LiveTelemetry,
  SpeedLevel,
  TuningSetup,
} from '../types/rcDrift';
import { cn } from '../utils/cn';
import { useRollingNumber } from '../../ebisu/components/Hud';
import '../../ebisu/components/hud.css';

/* ============================================================
   TELEMETRY HUD — EBISU DRIFT STYLE
   Same visual language as the Ebisu HUD (eb-* classes): no dark panels,
   outlined condensed numerals, ghost chips, NFS-style leaderboard.
   - Top-left   : Home · circuit chip · MENU chip, minimap underneath
   - Top-center : lap / position / gap + judge callout
   - Top-right  : leaderboard + quick chips (reset, camera, mute, pit bench)
   - Bottom-left: score (rolling + gains) + big speed + speed bar
   - Bottom-right: position + combo multiplier + clip bar
   - Bottom-center: touch controls (steer · kick · gas · turbo)
   Everything else lives in the MENU popover (⋯ / ESC).
   ============================================================ */

interface TelemetryHUDProps {
  circuit: CircuitDef;
  circuits: CircuitDef[];
  onSelectCircuit: (c: CircuitDef) => void;
  gameMode: GameMode;
  onSelectGameMode: (m: GameMode) => void;
  speedLevel: SpeedLevel;
  onChangeSpeedLevel: (level: SpeedLevel) => void;
  cameraMode: CameraMode;
  onCycleCamera: () => void;
  bodyShellMode: BodyShellMode;
  onCycleBodyShellMode: () => void;
  tuning: TuningSetup;
  onToggleAutoThrottle: () => void;
  onToggleCornerLock?: (lock: boolean) => void;
  onToggleSmokeMode?: () => void;
  telemetry: LiveTelemetry;
  rcCredits: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenPitBench: () => void;
  onOpenBMWAdjust?: () => void;
  onOpenDocs?: () => void;
  onSwitchGame?: () => void;
  onResetRun: () => void;
  onBackToMenu?: () => void;
  externalSteer: number;
  onChangeExternalSteer: (val: number) => void;
  onThrottleHold: (active: boolean) => void;
  onBrakeHold: (active: boolean) => void;
  onTurboHold: (active: boolean) => void;
}

// Helper to sample closed Catmull-Rom spline in 2D for the HUD Track Map
function sampleClosedSpline2D(
  points: [number, number][],
  numSamples: number
): { x: number; z: number; nx: number; nz: number }[] {
  const n = points.length;
  const result: { x: number; z: number; nx: number; nz: number }[] = [];
  const getPt = (idx: number) => points[(idx + n * 10) % n];
  const evalCatmull = (tGlobal: number) => {
    const scaled = tGlobal * n;
    const i = Math.floor(scaled);
    const u = scaled - i;
    const p0 = getPt(i - 1);
    const p1 = getPt(i);
    const p2 = getPt(i + 1);
    const p3 = getPt(i + 2);
    const u2 = u * u;
    const u3 = u2 * u;
    const x =
      0.5 *
      (2 * p1[0] +
        (-p0[0] + p2[0]) * u +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3);
    const z =
      0.5 *
      (2 * p1[1] +
        (-p0[1] + p2[1]) * u +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);
    return { x, z };
  };
  for (let s = 0; s < numSamples; s++) {
    const t = s / numSamples;
    const cur = evalCatmull(t);
    const next = evalCatmull((t + 0.005) % 1);
    const dx = next.x - cur.x;
    const dz = next.z - cur.z;
    const len = Math.hypot(dx, dz) || 1;
    result.push({ x: cur.x, z: cur.z, nx: -dz / len, nz: dx / len });
  }
  return result;
}

const MODE_LABEL: Record<GameMode, string> = {
  race: 'RACE',
  tsuiso: 'TSUISO',
  qualifying: 'QUALIFY',
  freedrift: 'FREE',
};

const CALLOUT_GRAD: Record<'cyan' | 'magenta' | 'volt' | 'amber', string> = {
  cyan: 'eb-grad-cyan',
  magenta: 'eb-grad-violet',
  volt: 'eb-grad-gold',
  amber: 'eb-grad-accent',
};

function ordinal(n: number) {
  return n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH';
}

function formatLap(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const c = Math.floor((t * 100) % 100);
  return `${m}:${s.toString().padStart(2, '0')}.${c.toString().padStart(2, '0')}`;
}

function multClass(m: number) {
  return m >= 6 ? 'eb-mult--5' : m >= 4 ? 'eb-mult--4' : m >= 2.5 ? 'eb-mult--3' : m > 1 ? 'eb-mult--2' : '';
}

/** Score with count-up + floating "+gain" tags (same as Ebisu). */
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

export const TelemetryHUD: React.FC<TelemetryHUDProps> = ({
  circuit,
  circuits,
  onSelectCircuit,
  gameMode,
  onSelectGameMode,
  speedLevel,
  onChangeSpeedLevel,
  cameraMode,
  onCycleCamera,
  bodyShellMode,
  onCycleBodyShellMode,
  tuning,
  onToggleAutoThrottle,
  onToggleCornerLock,
  onToggleSmokeMode,
  telemetry,
  rcCredits,
  isMuted,
  onToggleMute,
  onOpenPitBench,
  onOpenBMWAdjust,
  onOpenDocs,
  onSwitchGame,
  onResetRun,
  onBackToMenu,
  externalSteer,
  onChangeExternalSteer,
  onThrottleHold,
  onBrakeHold,
  onTurboHold,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isTouch] = useState<boolean>(() =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia('(pointer: coarse)').matches
      : false
  );
  const [showTouchPad, setShowTouchPad] = useState<boolean | null>(null);
  const touchPadVisible = showTouchPad ?? isTouch;
  const compact = isTouch;

  // ESC = buka/tutup menu
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setMenuOpen((v) => !v);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Callout juri hanya tampil singkat (auto-hide) agar layar tetap bersih
  const [calloutVisible, setCalloutVisible] = useState(false);
  useEffect(() => {
    if (!telemetry.judgeCallout) return;
    setCalloutVisible(true);
    const t = window.setTimeout(() => setCalloutVisible(false), 2600);
    return () => window.clearTimeout(t);
  }, [telemetry.judgeCallout?.timestamp]);

  const cameraLabel =
    cameraMode === 'isometric_broadcast'
      ? 'BROADCAST'
      : cameraMode === 'driver_stand'
      ? 'ROSTRUM'
      : cameraMode === 'chase_far'
      ? 'CHASE FAR'
      : cameraMode === 'rally'
      ? 'ART OF RALLY'
      : cameraMode === 'cockpit'
      ? 'COCKPIT'
      : 'CHASE';
  const shellLabel = bodyShellMode === 'painted' ? 'PAINTED' : bodyShellMode === 'translucent' ? 'X-RAY' : 'NAKED';

  const trackMapData = useMemo(() => {
    const samples = sampleClosedSpline2D(circuit.controlPoints, 160);
    const dPath =
      samples.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.z.toFixed(1)}`).join(' ') + ' Z';
    const clipMarkers = circuit.clippingZones.map((cz) => {
      const sIdx = Math.floor(cz.t * samples.length) % samples.length;
      const sample = samples[sIdx];
      const offsetDist = cz.offset * (circuit.trackWidth * 0.42);
      return { ...cz, x: sample.x + sample.nx * offsetDist, z: sample.z + sample.nz * offsetDist };
    });
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const s of samples) {
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z);
      maxZ = Math.max(maxZ, s.z);
    }
    const pad = circuit.trackWidth * 1.6;
    return {
      dPath,
      clipMarkers,
      startX: samples[0].x,
      startZ: samples[0].z,
      viewBox: `${minX - pad} ${minZ - pad} ${maxX - minX + pad * 2} ${maxZ - minZ + pad * 2}`,
      span: Math.max(maxX - minX, maxZ - minZ),
    };
  }, [circuit]);
  // stroke widths scale with the circuit size so every map reads the same
  const mapUnit = trackMapData.span / 140;

  const standings = useMemo(() => {
    if (!telemetry.botRacers || telemetry.botRacers.length === 0) return [];
    const me = {
      id: 'player',
      shortName: 'YOU',
      color: '#ffd166',
      rank: telemetry.racePosition || 1,
      lap: telemetry.currentLap,
      isPlayer: true,
    };
    const bots = telemetry.botRacers.map((b) => ({
      id: b.id,
      shortName: b.shortName,
      color: b.color,
      rank: b.rank,
      lap: b.lap,
      isPlayer: false,
    }));
    return [me, ...bots].sort((a, b) => a.rank - b.rank);
  }, [telemetry.botRacers, telemetry.racePosition, telemetry.currentLap]);

  const drift = telemetry.driftAngleDeg;
  const isDrifting = drift >= 10;
  const speedPct = Math.min(
    100,
    Math.max(0, Math.round((telemetry.speedKmh / Math.max(1, telemetry.speedLimitKmh)) * 100))
  );
  const clipsTotal = circuit.clippingZones.length;
  const clipsHit = circuit.clippingZones.filter((cz) => telemetry.clippedZoneIds.includes(cz.id)).length;
  const position = telemetry.racePosition || 1;
  const comboM = telemetry.comboMultiplier;

  return (
    <div className={cn('eb-hud fixed inset-0 pointer-events-none z-10 select-none', compact && 'eb-hud--mobile')}>
      {/* ---------- TOP LEFT: chips ---------- */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5 pointer-events-auto sm:left-5 sm:top-4">
        {onBackToMenu && (
          <button type="button" onClick={onBackToMenu} title="Kembali ke menu" className="eb-chip eb-chip--ghost eb-chip--icon cursor-pointer">
            <Home className="h-4 w-4" />
          </button>
        )}
        <div className="eb-chip eb-chip--ghost max-w-[58vw] sm:max-w-md">
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              circuit.mapStyle === 'haruna' ? 'bg-[#ffd166]' : circuit.mapStyle === 'ebisu' ? 'bg-[#ff6a00]' : 'bg-[#37e4ff]'
            )}
          />
          <span className="truncate">{circuit.name.split('//')[0].trim()}</span>
          <span className="hidden sm:inline text-white/55">
            {MODE_LABEL[gameMode]} · {speedLevel.toUpperCase()}
            {speedLevel !== 'normal' && (tuning.cornerSpeedLock ?? true) && circuit.mapStyle !== 'ebisu' ? ' · BELOK NORMAL' : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title="Menu (ESC)"
          className={cn('eb-chip eb-chip--ghost cursor-pointer', menuOpen && 'eb-chip--cyan')}
        >
          {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          <span className="hidden sm:inline">Menu</span>
        </button>
      </div>

      {/* ---------- TOP LEFT: minimap (no panel) ---------- */}
      <div className="eb-corner-tl absolute left-3 top-14 sm:left-5 sm:top-16">
        <div className="eb-map">
          <svg viewBox={trackMapData.viewBox} className="h-20 w-20 sm:h-28 sm:w-28" preserveAspectRatio="xMidYMid meet">
            <path d={trackMapData.dPath} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={mapUnit * 26} strokeLinejoin="round" />
            <path d={trackMapData.dPath} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={mapUnit * 14} strokeLinejoin="round" />
            <circle cx={trackMapData.startX} cy={trackMapData.startZ} r={mapUnit * 7} fill="#fff" stroke="rgba(0,0,0,0.5)" strokeWidth={mapUnit * 2} />
            {trackMapData.clipMarkers.map((cz) => {
              const isClipped = telemetry.clippedZoneIds.includes(cz.id);
              return (
                <circle
                  key={cz.id}
                  cx={cz.x}
                  cy={cz.z}
                  r={mapUnit * 7}
                  fill={isClipped ? '#ffb703' : 'rgba(12,14,22,0.9)'}
                  stroke={isClipped ? '#ffb703' : cz.type === 'wall_kiss' ? '#ff3b5c' : '#b47cff'}
                  strokeWidth={mapUnit * 2.5}
                />
              );
            })}
            {telemetry.botRacers?.map((b) => (
              <circle key={b.id} cx={b.x} cy={b.z} r={mapUnit * 8} fill={b.color} stroke="#fff" strokeWidth={mapUnit * 2.5} />
            ))}
            {!telemetry.botRacers?.length && telemetry.leadCarX !== undefined && telemetry.leadCarZ !== undefined && (
              <circle cx={telemetry.leadCarX} cy={telemetry.leadCarZ} r={mapUnit * 8} fill="#ff3b5c" stroke="#fff" strokeWidth={mapUnit * 2.5} />
            )}
            {telemetry.carX !== undefined && telemetry.carZ !== undefined && (
              <circle cx={telemetry.carX} cy={telemetry.carZ} r={mapUnit * 11} fill="#ffd166" stroke="#fff" strokeWidth={mapUnit * 4} />
            )}
          </svg>
        </div>
      </div>

      {/* ---------- TOP CENTER: lap / status + callout ---------- */}
      <div className="eb-corner-tc absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-1.5 sm:top-4">
        <div className="flex items-end gap-4 sm:gap-6">
          {gameMode === 'tsuiso' ? (
            <div className="flex flex-col items-center leading-none">
              <span className="eb-label eb-shadow">Tsuiso</span>
              <span className={cn('eb-num eb-outline text-3xl sm:text-4xl', telemetry.tsuisoSyncActive ? 'eb-grad-gold' : 'eb-grad-cyan')}>
                {telemetry.tsuisoDistanceM < 25 ? `GAP ${telemetry.tsuisoDistanceM}m` : 'CHASE'}
              </span>
            </div>
          ) : gameMode === 'freedrift' ? (
            <div className="flex flex-col items-center leading-none">
              <span className="eb-label eb-shadow">Mode</span>
              <span className="eb-num eb-outline eb-grad-cyan text-3xl sm:text-4xl">FREE RUN</span>
            </div>
          ) : (
            <div className="flex flex-col items-center leading-none">
              <span className="eb-label eb-shadow">Lap time</span>
              <span className="eb-num eb-outline text-3xl sm:text-4xl">{formatLap(telemetry.lapTimeSec)}</span>
            </div>
          )}
          <div className="flex flex-col items-center leading-none">
            <span className="eb-label eb-shadow">
              Lap {Math.min(telemetry.currentLap, telemetry.maxLaps)}/{telemetry.maxLaps}
            </span>
            <span className="eb-outline text-base font-bold tabular-nums text-white/90 sm:text-lg">{MODE_LABEL[gameMode]}</span>
          </div>
          {telemetry.bestLapScore > 0 && (
            <div className="flex flex-col items-center leading-none">
              <span className="eb-label eb-shadow text-[#ffd166]/85">Best</span>
              <span className="eb-outline text-base font-bold tabular-nums text-[#ffd166] sm:text-lg">{telemetry.bestLapScore.toLocaleString()}</span>
            </div>
          )}
        </div>
        {telemetry.turboActive && <span className="eb-tag eb-tag--amber eb-anim-blink">Turbo</span>}
        {telemetry.judgeCallout && calloutVisible && (
          <div key={telemetry.judgeCallout.timestamp} className="anim-pop-in mt-1 flex flex-col items-center">
            <div className={cn('eb-num eb-outline whitespace-nowrap text-2xl uppercase tracking-wide sm:text-4xl', CALLOUT_GRAD[telemetry.judgeCallout.color])}>
              {telemetry.judgeCallout.text}
            </div>
            {telemetry.judgeCallout.subtext && <div className="eb-label eb-shadow mt-0.5 text-white/80">{telemetry.judgeCallout.subtext}</div>}
          </div>
        )}
      </div>

      {/* ---------- TOP RIGHT: leaderboard + chips ---------- */}
      <div className="eb-corner-tr absolute right-3 top-3 flex flex-col items-end gap-2 sm:right-5 sm:top-4">
        {standings.length > 0 && (
          <div className="eb-board hidden sm:block">
            <div className="eb-board__head">
              <span>Pos</span>
              <span>Driver</span>
              <span className="text-right">Lap</span>
            </div>
            {standings.map((r) => (
              <div key={r.id} className={cn('eb-board__row', r.isPlayer && 'eb-board__row--me')}>
                <span className="eb-board__pos">{r.rank}</span>
                <span className="eb-board__name">
                  <span className="eb-board__swatch" style={{ background: r.color }} />
                  {r.shortName}
                </span>
                <span className="eb-board__gap">{r.rank === 1 ? 'LEADER' : `L${r.lap}`}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1.5 pointer-events-auto">
          <button type="button" onClick={onResetRun} className="eb-chip eb-chip--ghost cursor-pointer" title="Reset ke start">
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
          <button type="button" onClick={onCycleCamera} className="eb-chip eb-chip--ghost eb-chip--icon cursor-pointer" title={`Kamera: ${cameraLabel}`}>
            <Camera className="h-4 w-4" />
          </button>
          <button type="button" onClick={onToggleMute} className="eb-chip eb-chip--ghost eb-chip--icon cursor-pointer" title={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted ? <VolumeX className="h-4 w-4 text-rose-300" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button type="button" onClick={onOpenPitBench} className="eb-chip eb-chip--ghost eb-chip--accent cursor-pointer" title="Pit Bench">
            <Sliders className="h-3.5 w-3.5" />
            <span>Pit bench</span>
          </button>
        </div>
      </div>

      {/* ---------- BOTTOM LEFT: score + speed ---------- */}
      <div className={cn('eb-corner-bl absolute', compact && touchPadVisible ? 'bottom-3 left-[13rem]' : 'bottom-4 left-3 sm:bottom-6 sm:left-5')}>
        <Score score={telemetry.sessionScore} />
        <div className="mt-1 flex items-end gap-2">
          <span className={cn('eb-num eb-outline text-6xl sm:text-7xl', telemetry.turboActive && 'eb-grad-accent')}>{telemetry.speedKmh}</span>
          <div className="mb-1.5 flex flex-col leading-none">
            <span className="eb-label eb-shadow">km/h</span>
            {isDrifting && <span className="eb-shadow mt-1 text-xs font-extrabold tabular-nums text-[#9eefff]">{drift}° SLIP</span>}
          </div>
        </div>
        <div className="eb-bar eb-bar--seg eb-bar--glass mt-1.5 w-36 sm:w-48">
          <div className={cn('eb-bar__fill', !telemetry.turboActive && 'eb-bar__fill--cyan')} style={{ width: `${speedPct}%` }} />
        </div>
      </div>

      {/* ---------- BOTTOM RIGHT: position + combo + clips ---------- */}
      <div className={cn('eb-corner-br absolute', compact && touchPadVisible ? 'bottom-3 right-[15rem]' : 'bottom-4 right-3 sm:bottom-6 sm:right-5')}>
        <div className="flex flex-col items-end">
          {gameMode === 'race' && (
            <div className="flex items-baseline gap-1">
              <span className="eb-num eb-outline text-4xl sm:text-5xl">{position}</span>
              <span className="eb-num eb-outline text-xl text-white/85">{ordinal(position)}</span>
              <span className="eb-shadow ml-1 text-sm font-bold text-white/60">/{telemetry.totalRacers || 6}</span>
            </div>
          )}
          <div className="mt-1 flex items-center gap-2">
            {telemetry.currentComboPoints > 0 && (
              <span className="eb-num eb-outline text-2xl text-[#ffd166] sm:text-3xl">+{telemetry.currentComboPoints.toLocaleString()}</span>
            )}
            <span className={cn('eb-num eb-outline text-2xl sm:text-3xl', comboM > 1 ? 'text-white' : 'text-white/60')}>COMBO</span>
            <span key={comboM.toFixed(1)} className={cn('eb-mult anim-pop-in', multClass(comboM), comboM >= 4 && 'anim-breathe')}>
              ×{comboM.toFixed(1)}
            </span>
          </div>
          <div className="eb-bar eb-bar--seg eb-bar--glass mt-1.5 h-2 w-36 sm:w-48">
            <div className="eb-bar__fill eb-bar__fill--violet" style={{ width: `${clipsTotal ? Math.round((clipsHit / clipsTotal) * 100) : 0}%` }} />
          </div>
          <div className="eb-label eb-shadow mt-1 flex items-center gap-2">
            <span>
              Clips {clipsHit}/{clipsTotal}
            </span>
            {clipsHit === clipsTotal && clipsTotal > 0 && <span className="eb-tag eb-tag--green">Full</span>}
          </div>
        </div>
      </div>

      {/* ---------- BOTTOM CENTER: touch controls / key hint ---------- */}
      {touchPadVisible ? (
        <>
          <div className="pointer-events-auto absolute bottom-3 left-3 flex items-center gap-2" style={{ touchAction: 'none' }}>
            <button
              type="button"
              onPointerDown={() => onChangeExternalSteer(1)}
              onPointerUp={() => onChangeExternalSteer(0)}
              onPointerLeave={() => onChangeExternalSteer(0)}
              onPointerCancel={() => onChangeExternalSteer(0)}
              onContextMenu={(e) => e.preventDefault()}
              className={cn('eb-steer-btn', externalSteer > 0.2 && 'eb-steer-btn--on')}
              aria-label="Steer left"
            >
              ◀
            </button>
            <button
              type="button"
              onPointerDown={() => onChangeExternalSteer(-1)}
              onPointerUp={() => onChangeExternalSteer(0)}
              onPointerLeave={() => onChangeExternalSteer(0)}
              onPointerCancel={() => onChangeExternalSteer(0)}
              onContextMenu={(e) => e.preventDefault()}
              className={cn('eb-steer-btn', externalSteer < -0.2 && 'eb-steer-btn--on')}
              aria-label="Steer right"
            >
              ▶
            </button>
          </div>
          <div className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-2" style={{ touchAction: 'none' }}>
            <button
              type="button"
              onPointerDown={() => {
                onTurboHold(true);
                onThrottleHold(true);
              }}
              onPointerUp={() => {
                onTurboHold(false);
                if (!tuning.autoThrottle) onThrottleHold(false);
              }}
              onPointerLeave={() => {
                onTurboHold(false);
                if (!tuning.autoThrottle) onThrottleHold(false);
              }}
              onPointerCancel={() => {
                onTurboHold(false);
                if (!tuning.autoThrottle) onThrottleHold(false);
              }}
              onContextMenu={(e) => e.preventDefault()}
              className="eb-drift-btn eb-drift-btn--mobile eb-turbo-btn"
            >
              TURBO
            </button>
            {!tuning.autoThrottle && (
              <button
                type="button"
                onPointerDown={() => onThrottleHold(true)}
                onPointerUp={() => onThrottleHold(false)}
                onPointerLeave={() => onThrottleHold(false)}
                onPointerCancel={() => onThrottleHold(false)}
                onContextMenu={(e) => e.preventDefault()}
                className="eb-drift-btn eb-drift-btn--mobile eb-gas-btn"
              >
                GAS
              </button>
            )}
            <button
              type="button"
              onPointerDown={() => onBrakeHold(true)}
              onPointerUp={() => onBrakeHold(false)}
              onPointerLeave={() => onBrakeHold(false)}
              onPointerCancel={() => onBrakeHold(false)}
              onContextMenu={(e) => e.preventDefault()}
              className="eb-drift-btn eb-drift-btn--mobile"
            >
              KICK
            </button>
          </div>
        </>
      ) : (
        <div className="eb-label eb-shadow absolute bottom-4 left-1/2 hidden -translate-x-1/2 items-center gap-2 whitespace-nowrap text-white/75 sm:bottom-6 md:flex">
          <span>W A D</span>
          <span className="text-white/35">·</span>
          <span>Space kick</span>
          <span className="text-white/35">·</span>
          <span>Shift turbo</span>
          <span className="text-white/35">·</span>
          <span>Esc menu</span>
        </div>
      )}

      {/* ---------- POPOVER MENU (⋯ / ESC) ---------- */}
      {menuOpen && (
        <div className="absolute inset-0 pointer-events-auto bg-black/35 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="eb-panel absolute left-3 top-14 w-[calc(100vw-1.5rem)] space-y-3 overflow-y-auto p-3 sm:left-5 sm:top-16 sm:w-[400px]"
            style={{ maxHeight: 'calc(100vh - 5rem)' }}
          >
            <Section title="Mode">
              <Seg
                options={(['race', 'tsuiso', 'qualifying', 'freedrift'] as GameMode[]).map((m) => ({ v: m, label: MODE_LABEL[m] }))}
                value={gameMode}
                onChange={(v) => onSelectGameMode(v as GameMode)}
              />
            </Section>
            <Section title="Kecepatan">
              <Seg
                options={[
                  { v: 'normal', label: 'NORMAL' },
                  { v: 'sedang', label: 'SEDANG' },
                  { v: '2x', label: '2X' },
                ]}
                value={speedLevel}
                onChange={(v) => onChangeSpeedLevel(v as SpeedLevel)}
                accent="#ff6a00"
              />
              {speedLevel !== 'normal' && onToggleCornerLock && circuit.mapStyle !== 'ebisu' && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="eb-label w-16">Belok</span>
                  <Seg
                    options={[
                      { v: 'lock', label: 'TETAP NORMAL' },
                      { v: 'fast', label: 'IKUT MODE' },
                    ]}
                    value={(tuning.cornerSpeedLock ?? true) ? 'lock' : 'fast'}
                    onChange={(v) => onToggleCornerLock(v === 'lock')}
                    accent="#ffb703"
                  />
                </div>
              )}
              {circuit.mapStyle === 'ebisu' && <div className="eb-label mt-1.5 text-white/60">Ebisu: pace 1.6× · kecepatan belokan ikut mode</div>}
            </Section>
            <Section title="Sirkuit">
              <select
                value={circuit.id}
                onChange={(e) => {
                  const found = circuits.find((c) => c.id === e.target.value);
                  if (found) onSelectCircuit(found);
                }}
                className="eb-select"
              >
                {circuits.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0B0D13]">
                    {c.name}
                  </option>
                ))}
              </select>
            </Section>
            <Section title="Tampilan">
              <div className="grid grid-cols-2 gap-1.5">
                <MenuBtn icon={<Camera className="h-3.5 w-3.5" />} label={`Kamera: ${cameraLabel}`} onClick={onCycleCamera} />
                <MenuBtn icon={<Eye className="h-3.5 w-3.5" />} label={`Shell: ${shellLabel}`} onClick={onCycleBodyShellMode} />
                {onToggleSmokeMode && (
                  <MenuBtn
                    icon={<CloudFog className="h-3.5 w-3.5" />}
                    label={`Asap: ${(tuning.smokeConfig?.mode || 'new_pipeline') === 'new_pipeline' ? 'BARU' : 'LAMA'}`}
                    onClick={onToggleSmokeMode}
                  />
                )}
                <MenuBtn icon={<Sparkles className="h-3.5 w-3.5" />} label={`Auto gas: ${tuning.autoThrottle ? 'ON' : 'OFF'}`} active={tuning.autoThrottle} onClick={onToggleAutoThrottle} />
                <MenuBtn
                  icon={<Smartphone className="h-3.5 w-3.5" />}
                  label={`Pad sentuh: ${touchPadVisible ? 'ON' : 'OFF'}`}
                  active={touchPadVisible}
                  onClick={() => setShowTouchPad(!touchPadVisible)}
                />
                <MenuBtn
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  label="Reset ke start"
                  onClick={() => {
                    onResetRun();
                    setMenuOpen(false);
                  }}
                />
              </div>
            </Section>
            <Section title="Lainnya">
              <div className="grid grid-cols-2 gap-1.5">
                <MenuBtn
                  icon={<Sliders className="h-3.5 w-3.5" />}
                  label="Pit Bench"
                  onClick={() => {
                    onOpenPitBench();
                    setMenuOpen(false);
                  }}
                />
                {onOpenDocs && (
                  <MenuBtn
                    icon={<BookOpen className="h-3.5 w-3.5" />}
                    label="Dokumen desain"
                    onClick={() => {
                      onOpenDocs();
                      setMenuOpen(false);
                    }}
                  />
                )}
                {onOpenBMWAdjust && (
                  <MenuBtn
                    icon={<Ruler className="h-3.5 w-3.5" />}
                    label="Body BMW"
                    onClick={() => {
                      onOpenBMWAdjust();
                      setMenuOpen(false);
                    }}
                  />
                )}
                {onSwitchGame && <MenuBtn icon={<Gamepad2 className="h-3.5 w-3.5" />} label="Pilih game" onClick={onSwitchGame} />}
                {onBackToMenu && <MenuBtn icon={<Home className="h-3.5 w-3.5" />} label="Menu utama" onClick={onBackToMenu} />}
              </div>
            </Section>
            <div className="flex items-center justify-between px-1">
              <span className="eb-label">Pit credits</span>
              <span className="eb-num text-base text-[#ffd166]">RC$ {rcCredits.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- komponen kecil (gaya Ebisu) ---------- */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="eb-label mb-1">{title}</div>
    {children}
  </div>
);

const Seg: React.FC<{
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  accent?: string;
}> = ({ options, value, onChange, accent = '#37e4ff' }) => (
  <div className="eb-seg">
    {options.map((o) => {
      const active = o.v === value;
      return (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          style={active ? { backgroundColor: accent, color: '#0b0d14' } : undefined}
          className={cn('eb-seg__btn', active && 'eb-seg__btn--on')}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

const MenuBtn: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}> = ({ icon, label, onClick, active }) => (
  <button type="button" onClick={onClick} className={cn('eb-menu-btn', active && 'eb-menu-btn--on')}>
    <span className="shrink-0 opacity-80">{icon}</span>
    <span className="truncate">{label}</span>
  </button>
);
