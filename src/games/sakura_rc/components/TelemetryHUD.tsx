import React, { useEffect, useMemo, useState } from 'react';
import {
  Volume2,
  VolumeX,
  Sliders,
  Camera,
  Eye,
  RotateCcw,
  Zap,
  Sparkles,
  Flame,
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

/* ============================================================
   TELEMETRY HUD — "PRO HYPERCASUAL"
   Prinsip: hanya yang perlu saat nyetir.
   - Kiri-atas  : Home + nama sirkuit/mode + tombol MENU (⋯)
   - Tengah-atas: posisi/lap • skor • combo (1 pill) + callout singkat (auto-hide)
   - Kanan-atas : minimap + klasemen ringkas
   - Tengah-bawah: speed besar + sudut drift + titik clip
   - Kanan-bawah: PIT BENCH + kamera + mute
   - Kiri-bawah : kontrol sentuh (hanya layar sentuh / bisa di-toggle)
   Semua pengaturan lain (mode, kecepatan, shell, smoke, reset, dokumen, dsb.)
   dipindah ke popover MENU (tekan ⋯ atau ESC).
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

const pillBase =
  'hud-panel rounded-full px-3 h-9 flex items-center gap-2 text-[11px] font-display font-bold tracking-wider uppercase text-white';
const iconBtn =
  'hud-panel w-9 h-9 rounded-full flex items-center justify-center text-slate-200 hover:text-white hover:border-white/30 active:scale-95 transition cursor-pointer';

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
      : 'CHASE';
  const shellLabel =
    bodyShellMode === 'painted'
      ? 'PAINTED'
      : bodyShellMode === 'translucent'
      ? 'X-RAY'
      : 'NAKED';

  const trackMapData = useMemo(() => {
    const samples = sampleClosedSpline2D(circuit.controlPoints, 140);
    const dPath =
      samples
        .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.z.toFixed(1)}`)
        .join(' ') + ' Z';
    const clipMarkers = circuit.clippingZones.map((cz) => {
      const sIdx = Math.floor(cz.t * samples.length) % samples.length;
      const sample = samples[sIdx];
      const offsetDist = cz.offset * (circuit.trackWidth * 0.42);
      return { ...cz, x: sample.x + sample.nx * offsetDist, z: sample.z + sample.nz * offsetDist };
    });
    return { dPath, clipMarkers, startX: samples[0].x, startZ: samples[0].z };
  }, [circuit]);

  const carHeadingDeg =
    telemetry.carHeadingRad !== undefined ? (telemetry.carHeadingRad * 180) / Math.PI : 0;

  const standings = useMemo(() => {
    if (!telemetry.botRacers || telemetry.botRacers.length === 0) return [];
    const me = {
      id: 'player',
      shortName: 'YOU',
      color: '#00F0FF',
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
  const driftColor =
    drift >= 35 ? 'text-[#CCFF00]' : drift >= 16 ? 'text-[#00F0FF]' : 'text-slate-300';
  const posBadge =
    telemetry.racePosition === 1
      ? 'bg-amber-400 text-black'
      : telemetry.racePosition === 2
      ? 'bg-slate-200 text-black'
      : telemetry.racePosition === 3
      ? 'bg-amber-700 text-white'
      : 'bg-white/15 text-white';

  const statusLeft =
    gameMode === 'race' ? (
      <>
        <span className={`px-2 h-6 rounded-full flex items-center text-[11px] font-black ${posBadge}`}>
          P{telemetry.racePosition || 1}
          <span className="opacity-60 text-[9px] ml-0.5">/{telemetry.totalRacers || 6}</span>
        </span>
        <span className="text-slate-300">
          LAP {telemetry.currentLap}/{telemetry.maxLaps}
        </span>
      </>
    ) : gameMode === 'qualifying' ? (
      <span className="text-slate-300">
        LAP {telemetry.currentLap}/{telemetry.maxLaps}
      </span>
    ) : gameMode === 'tsuiso' ? (
      <span className={telemetry.tsuisoSyncActive ? 'text-[#CCFF00]' : 'text-[#00F0FF]'}>
        {telemetry.tsuisoDistanceM < 25 ? `GAP ${telemetry.tsuisoDistanceM}m` : 'CHASE LEAD'}
      </span>
    ) : (
      <span className="text-slate-300">FREE RUN</span>
    );

  return (
    <div className="fixed inset-0 pointer-events-none z-10 select-none">
      {/* ---------- KIRI ATAS ---------- */}
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-auto">
        {onBackToMenu && (
          <button onClick={onBackToMenu} title="Kembali ke menu" className={iconBtn}>
            <Home className="w-4 h-4" />
          </button>
        )}
        <div className={`${pillBase} max-w-[62vw] sm:max-w-sm`}>
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              circuit.mapStyle === 'haruna' ? 'bg-[#FDE68A]' : 'bg-[#00F0FF]'
            }`}
          />
          <span className="truncate">{circuit.name}</span>
          <span className="hidden sm:inline text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-slate-300 shrink-0">
            {MODE_LABEL[gameMode]} • {speedLevel.toUpperCase()}
            {speedLevel !== 'normal' && (tuning.cornerSpeedLock ?? true) ? ' • BELOK NORMAL' : ''}
          </span>
        </div>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          title="Menu (ESC)"
          className={`${iconBtn} ${menuOpen ? 'border-[#00F0FF]/60 text-[#00F0FF]' : ''}`}
        >
          {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* ---------- TENGAH ATAS: STATUS ---------- */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 max-w-[92vw]">
        <div className="hud-panel-cyan rounded-full h-10 px-4 flex items-center gap-3 sm:gap-4 font-mono-tabular text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
          <div className="flex items-center gap-2">{statusLeft}</div>
          <div className="w-px h-5 bg-white/15" />
          <div className="font-display font-extrabold text-lg sm:text-xl text-white tracking-tight leading-none">
            {telemetry.sessionScore.toLocaleString()}
          </div>
          <div className="w-px h-5 bg-white/15" />
          <div className="flex items-center gap-1.5">
            {telemetry.currentComboPoints > 0 && (
              <span className="text-[#FF2A85]">+{telemetry.currentComboPoints.toLocaleString()}</span>
            )}
            <span
              className={`px-1.5 h-6 rounded-md flex items-center font-display font-extrabold text-sm -skew-x-6 ${
                telemetry.comboMultiplier >= 4
                  ? 'bg-[#FF2A85] text-white shadow-[0_0_14px_#FF2A85]'
                  : 'bg-white/10 text-[#00F0FF]'
              }`}
            >
              {telemetry.comboMultiplier.toFixed(1)}x
            </span>
          </div>
        </div>

        {telemetry.judgeCallout && calloutVisible && (
          <div
            key={telemetry.judgeCallout.timestamp}
            className="px-4 py-1 rounded-full bg-slate-950/85 border border-[#CCFF00]/70 shadow-[0_0_18px_rgba(204,255,0,0.3)] text-center animate-[hudpop_0.35s_ease-out]"
          >
            <div className="font-display font-extrabold text-xs sm:text-sm tracking-wider text-[#CCFF00] uppercase">
              {telemetry.judgeCallout.text}
            </div>
            {telemetry.judgeCallout.subtext && (
              <div className="font-mono-tabular text-[9px] text-slate-300 uppercase tracking-widest">
                {telemetry.judgeCallout.subtext}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------- KANAN ATAS: MINIMAP + KLASEMEN ---------- */}
      <div className="absolute top-3 right-3 hidden sm:flex flex-col gap-1.5 w-44">
        <div className="hud-panel rounded-2xl p-1.5">
          <div className="relative w-full h-24 rounded-xl bg-slate-950/70 overflow-hidden">
            <svg viewBox="-64 -48 128 96" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
              <path
                d={trackMapData.dPath}
                fill="none"
                stroke="#334155"
                strokeWidth={circuit.trackWidth + 2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={trackMapData.dPath}
                fill="none"
                stroke="#0F172A"
                strokeWidth={circuit.trackWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={trackMapData.dPath}
                fill="none"
                stroke={circuit.accentColor}
                strokeWidth="1.1"
                strokeDasharray="3 2.5"
                strokeOpacity="0.55"
              />
              <circle cx={trackMapData.startX} cy={trackMapData.startZ} r="2.6" fill="#FFFFFF" />
              {trackMapData.clipMarkers.map((cz) => {
                const isClipped = telemetry.clippedZoneIds.includes(cz.id);
                return (
                  <circle
                    key={cz.id}
                    cx={cz.x}
                    cy={cz.z}
                    r={3}
                    fill={isClipped ? '#CCFF00' : '#0B0D13'}
                    stroke={isClipped ? '#CCFF00' : cz.type === 'wall_kiss' ? '#FF2A85' : '#00F0FF'}
                    strokeWidth="1.3"
                  />
                );
              })}
              {telemetry.botRacers?.map((b) => (
                <g
                  key={b.id}
                  transform={`translate(${b.x}, ${b.z}) rotate(${(-b.headingRad * 180) / Math.PI + 180})`}
                >
                  <polygon points="0,-4 2.9,3 0,1.4 -2.9,3" fill={b.color} stroke="#fff" strokeWidth="0.7" />
                </g>
              ))}
              {!telemetry.botRacers?.length &&
                telemetry.leadCarX !== undefined &&
                telemetry.leadCarZ !== undefined && (
                  <g
                    transform={`translate(${telemetry.leadCarX}, ${telemetry.leadCarZ}) rotate(${
                      -((telemetry.leadCarHeadingRad || 0) * 180) / Math.PI + 180
                    })`}
                  >
                    <polygon points="0,-4 3,3 0,1.5 -3,3" fill="#FF2A85" stroke="#fff" strokeWidth="0.8" />
                  </g>
                )}
              {telemetry.carX !== undefined && telemetry.carZ !== undefined && (
                <g transform={`translate(${telemetry.carX}, ${telemetry.carZ}) rotate(${-carHeadingDeg + 180})`}>
                  <circle r="5" fill="#00F0FF" fillOpacity="0.25" />
                  <polygon points="0,-4.6 3.4,3.6 0,1.9 -3.4,3.6" fill="#00F0FF" stroke="#fff" strokeWidth="1" />
                </g>
              )}
            </svg>
          </div>
        </div>

        {standings.length > 0 && (
          <div className="hud-panel rounded-2xl px-2 py-1.5 font-mono-tabular">
            {standings.map((r) => (
              <div
                key={r.id}
                className={`flex items-center gap-1.5 h-5 px-1 rounded-md text-[10px] ${
                  r.isPlayer ? 'bg-[#00F0FF]/15 text-white font-bold' : 'text-slate-300'
                }`}
              >
                <span
                  className={`w-4 text-center font-black ${
                    r.rank === 1 ? 'text-amber-300' : r.rank === 2 ? 'text-slate-100' : r.rank === 3 ? 'text-amber-600' : 'text-slate-500'
                  }`}
                >
                  {r.rank}
                </span>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                <span className="truncate flex-1">{r.shortName}</span>
                <span className="text-[9px] text-slate-500">L{r.lap}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- TENGAH BAWAH: SPEED + DRIFT + CLIPS ---------- */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        <div className="flex items-end gap-3">
          <div className="text-right leading-none">
            <div className="font-display font-black text-5xl sm:text-6xl text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] tabular-nums">
              {telemetry.scaleSpeedKmh}
            </div>
            <div className="text-[10px] font-mono-tabular tracking-widest text-slate-300 uppercase mt-1">
              km/h scale{telemetry.turboActive && <span className="ml-1.5 text-[#FF2A85]">● TURBO</span>}
            </div>
          </div>
          <div className="hud-panel rounded-2xl px-3 py-1.5 text-center min-w-[64px]">
            <div className={`font-display font-extrabold text-2xl leading-none tabular-nums ${driftColor}`}>
              {drift}°
            </div>
            <div className="text-[9px] font-mono-tabular tracking-widest text-slate-400 uppercase mt-0.5">
              drift
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {circuit.clippingZones.map((cz) => {
            const clipped = telemetry.clippedZoneIds.includes(cz.id);
            return (
              <span
                key={cz.id}
                title={cz.label}
                className={`h-1.5 rounded-full transition-all ${
                  clipped ? 'w-6 bg-[#CCFF00] shadow-[0_0_8px_#CCFF00]' : 'w-3 bg-white/25'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* ---------- KANAN BAWAH: AKSI ---------- */}
      <div className="absolute bottom-4 right-3 flex items-center gap-2 pointer-events-auto">
        <button onClick={onCycleCamera} title={`Kamera: ${cameraLabel}`} className={iconBtn}>
          <Camera className="w-4 h-4" />
        </button>
        <button onClick={onToggleMute} title={isMuted ? 'Unmute' : 'Mute'} className={iconBtn}>
          {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <button
          onClick={onOpenPitBench}
          className="h-10 px-4 rounded-full bg-gradient-to-r from-[#00F0FF] to-[#00B8FF] text-[#0B0D13] font-display font-extrabold text-xs tracking-wider uppercase flex items-center gap-2 shadow-[0_0_18px_rgba(0,240,255,0.4)] hover:brightness-110 active:scale-95 transition cursor-pointer"
        >
          <Sliders className="w-4 h-4 stroke-[2.5]" />
          <span>PIT BENCH</span>
        </button>
      </div>

      {/* ---------- KIRI BAWAH: KONTROL SENTUH / HINT ---------- */}
      <div className="absolute bottom-4 left-3 pointer-events-auto">
        {touchPadVisible ? (
          <div className="flex items-end gap-2">
            <div className="hud-panel rounded-2xl p-1.5 flex items-center gap-1.5">
              <button
                onPointerDown={() => onChangeExternalSteer(1)}
                onPointerUp={() => onChangeExternalSteer(0)}
                onPointerLeave={() => onChangeExternalSteer(0)}
                className={`w-14 h-14 rounded-xl text-xl font-black flex items-center justify-center transition select-none cursor-pointer ${
                  externalSteer > 0.2 ? 'bg-[#00F0FF] text-[#0B0D13]' : 'bg-white/10 text-white'
                }`}
              >
                ◀
              </button>
              <button
                onPointerDown={() => onChangeExternalSteer(-1)}
                onPointerUp={() => onChangeExternalSteer(0)}
                onPointerLeave={() => onChangeExternalSteer(0)}
                className={`w-14 h-14 rounded-xl text-xl font-black flex items-center justify-center transition select-none cursor-pointer ${
                  externalSteer < -0.2 ? 'bg-[#00F0FF] text-[#0B0D13]' : 'bg-white/10 text-white'
                }`}
              >
                ▶
              </button>
            </div>
            <div className="hud-panel rounded-2xl p-1.5 flex items-center gap-1.5">
              <button
                onPointerDown={() => onBrakeHold(true)}
                onPointerUp={() => onBrakeHold(false)}
                onPointerLeave={() => onBrakeHold(false)}
                className="w-12 h-14 rounded-xl bg-white/10 text-slate-200 text-[10px] font-display font-bold active:bg-rose-500 active:text-white select-none cursor-pointer"
              >
                BRAKE
              </button>
              {!tuning.autoThrottle && (
                <button
                  onPointerDown={() => onThrottleHold(true)}
                  onPointerUp={() => onThrottleHold(false)}
                  onPointerLeave={() => onThrottleHold(false)}
                  className="w-16 h-14 rounded-xl bg-[#00F0FF]/20 border border-[#00F0FF]/50 text-[#00F0FF] font-display font-extrabold text-[10px] flex flex-col items-center justify-center active:bg-[#00F0FF] active:text-[#0B0D13] select-none cursor-pointer"
                >
                  <Zap className="w-4 h-4 mb-0.5" />
                  GAS
                </button>
              )}
              <button
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
                className="w-16 h-14 rounded-xl bg-[#FF2A85]/20 border border-[#FF2A85]/50 text-[#FF2A85] font-display font-extrabold text-[10px] flex flex-col items-center justify-center active:bg-[#FF2A85] active:text-white select-none cursor-pointer"
              >
                <Flame className="w-4 h-4 mb-0.5" />
                TURBO
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-2 text-[10px] font-mono-tabular text-slate-400/80 px-2.5 h-7 rounded-full bg-slate-950/50 border border-white/5">
            <span>W A D</span>
            <span className="text-slate-600">•</span>
            <span>SPACE kick</span>
            <span className="text-slate-600">•</span>
            <span>SHIFT turbo</span>
            <span className="text-slate-600">•</span>
            <span>ESC menu</span>
          </div>
        )}
      </div>

      {/* ---------- POPOVER MENU (⋯ / ESC) ---------- */}
      {menuOpen && (
        <div
          className="absolute inset-0 pointer-events-auto bg-black/35 backdrop-blur-[2px]"
          onClick={() => setMenuOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-14 left-3 w-[calc(100vw-1.5rem)] sm:w-[380px] hud-panel rounded-2xl p-3 space-y-3 max-h-[calc(100vh-5rem)] overflow-y-auto"
          >
            <Section title="Mode">
              <Seg
                options={(['race', 'tsuiso', 'qualifying', 'freedrift'] as GameMode[]).map((m) => ({
                  v: m,
                  label: MODE_LABEL[m],
                }))}
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
                accent="#FB7185"
              />
              {speedLevel !== 'normal' && onToggleCornerLock && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[9px] font-mono-tabular text-slate-400 uppercase w-20">Belok</span>
                  <Seg
                    options={[
                      { v: 'lock', label: 'TETAP NORMAL' },
                      { v: 'fast', label: 'IKUT MODE' },
                    ]}
                    value={(tuning.cornerSpeedLock ?? true) ? 'lock' : 'fast'}
                    onChange={(v) => onToggleCornerLock(v === 'lock')}
                    accent="#CCFF00"
                  />
                </div>
              )}
            </Section>
            <Section title="Sirkuit">
              <select
                value={circuit.id}
                onChange={(e) => {
                  const found = circuits.find((c) => c.id === e.target.value);
                  if (found) onSelectCircuit(found);
                }}
                className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-2 h-8 text-[11px] font-display font-bold text-white uppercase tracking-wider focus:outline-none cursor-pointer"
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
                <MenuBtn icon={<Camera className="w-3.5 h-3.5" />} label={`Kamera: ${cameraLabel}`} onClick={onCycleCamera} />
                <MenuBtn icon={<Eye className="w-3.5 h-3.5" />} label={`Shell: ${shellLabel}`} onClick={onCycleBodyShellMode} />
                {onToggleSmokeMode && (
                  <MenuBtn
                    icon={<CloudFog className="w-3.5 h-3.5" />}
                    label={`Asap: ${(tuning.smokeConfig?.mode || 'new_pipeline') === 'new_pipeline' ? 'BARU' : 'LAMA'}`}
                    onClick={onToggleSmokeMode}
                  />
                )}
                <MenuBtn
                  icon={<Sparkles className="w-3.5 h-3.5" />}
                  label={`Auto gas: ${tuning.autoThrottle ? 'ON' : 'OFF'}`}
                  active={tuning.autoThrottle}
                  onClick={onToggleAutoThrottle}
                />
                <MenuBtn
                  icon={<Smartphone className="w-3.5 h-3.5" />}
                  label={`Pad sentuh: ${touchPadVisible ? 'ON' : 'OFF'}`}
                  active={touchPadVisible}
                  onClick={() => setShowTouchPad(!touchPadVisible)}
                />
                <MenuBtn
                  icon={<RotateCcw className="w-3.5 h-3.5" />}
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
                <MenuBtn icon={<Sliders className="w-3.5 h-3.5" />} label="Pit Bench" onClick={() => { onOpenPitBench(); setMenuOpen(false); }} />
                {onOpenDocs && <MenuBtn icon={<BookOpen className="w-3.5 h-3.5" />} label="Dokumen desain" onClick={() => { onOpenDocs(); setMenuOpen(false); }} />}
                {onOpenBMWAdjust && <MenuBtn icon={<Ruler className="w-3.5 h-3.5" />} label="Body BMW" onClick={() => { onOpenBMWAdjust(); setMenuOpen(false); }} />}
                {onSwitchGame && <MenuBtn icon={<Gamepad2 className="w-3.5 h-3.5" />} label="Pilih game" onClick={onSwitchGame} />}
                {onBackToMenu && <MenuBtn icon={<Home className="w-3.5 h-3.5" />} label="Menu utama" onClick={onBackToMenu} />}
              </div>
            </Section>
            <div className="flex items-center justify-between text-[9px] font-mono-tabular text-slate-500 px-1">
              <span>PIT CREDITS</span>
              <span className="text-[#CCFF00] font-bold">RC$ {rcCredits.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes hudpop{0%{transform:scale(0.85);opacity:0;}100%{transform:scale(1);opacity:1;}}`}</style>
    </div>
  );
};

/* ---------- komponen kecil ---------- */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="text-[9px] font-display font-bold tracking-[0.2em] text-slate-400 uppercase mb-1">{title}</div>
    {children}
  </div>
);

const Seg: React.FC<{
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  accent?: string;
}> = ({ options, value, onChange, accent = '#00F0FF' }) => (
  <div className="flex gap-1 bg-black/40 rounded-lg p-0.5 border border-white/10">
    {options.map((o) => {
      const active = o.v === value;
      return (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          style={active ? { backgroundColor: accent, color: '#0B0D13' } : undefined}
          className={`flex-1 h-7 rounded-md text-[10px] font-display font-bold tracking-wider uppercase transition cursor-pointer ${
            active ? '' : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
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
  <button
    onClick={onClick}
    className={`h-8 px-2.5 rounded-lg border text-left text-[10px] font-display font-bold tracking-wider uppercase flex items-center gap-1.5 transition cursor-pointer ${
      active
        ? 'bg-[#CCFF00]/15 border-[#CCFF00]/60 text-[#CCFF00]'
        : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 hover:text-white'
    }`}
  >
    <span className="shrink-0 opacity-80">{icon}</span>
    <span className="truncate">{label}</span>
  </button>
);
