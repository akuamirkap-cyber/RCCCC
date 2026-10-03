import React, { useMemo } from 'react';
import {
  Volume2,
  VolumeX,
  Sliders,
  Camera,
  Eye,
  RotateCcw,
  Zap,
  Radio,
  Sparkles,
  Flame,
  MapPin,
  CloudFog,
  Home,
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
  onToggleSmokeMode?: () => void;
  telemetry: LiveTelemetry;
  rcCredits: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenPitBench: () => void;
  onOpenBMWAdjust?: () => void;
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
    result.push({
      x: cur.x,
      z: cur.z,
      nx: -dz / len,
      nz: dx / len,
    });
  }
  return result;
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
  onToggleSmokeMode,
  telemetry,
  rcCredits,
  isMuted,
  onToggleMute,
  onOpenPitBench,
  onOpenBMWAdjust,
  onResetRun,
  onBackToMenu,
  externalSteer,
  onChangeExternalSteer,
  onThrottleHold,
  onBrakeHold,
  onTurboHold,
}) => {
  const cameraLabel =
    cameraMode === 'isometric_broadcast'
      ? 'BROADCAST CAM'
      : cameraMode === 'driver_stand'
      ? 'ROSTRUM STAND'
      : 'CHASE CAM';

  const shellLabel =
    bodyShellMode === 'painted'
      ? 'SHELL: PAINTED'
      : bodyShellMode === 'translucent'
      ? 'SHELL: X-RAY'
      : 'NAKED CHASSIS';

  const rpmPct = Math.min(100, Math.max(8, Math.round((telemetry.rpm / 62000) * 100)));

  // Precompute smooth SVG path and Clipping Zone coordinates for the 2D Track Map Radar
  const trackMapData = useMemo(() => {
    const samples = sampleClosedSpline2D(circuit.controlPoints, 140);
    const dPath =
      samples
        .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.z.toFixed(1)}`)
        .join(' ') + ' Z';

    const clipMarkers = circuit.clippingZones.map((cz, index) => {
      const sIdx = Math.floor(cz.t * samples.length) % samples.length;
      const sample = samples[sIdx];
      const offsetDist = cz.offset * (circuit.trackWidth * 0.42);
      return {
        ...cz,
        shortCode: `Z${index + 1}`,
        x: sample.x + sample.nx * offsetDist,
        z: sample.z + sample.nz * offsetDist,
      };
    });

    const startSample = samples[0];

    return {
      dPath,
      clipMarkers,
      startX: startSample.x,
      startZ: startSample.z,
    };
  }, [circuit]);

  const carHeadingDeg =
    telemetry.carHeadingRad !== undefined
      ? (telemetry.carHeadingRad * 180) / Math.PI
      : 0;

  const leadCarHeadingDeg =
    telemetry.leadCarHeadingRad !== undefined
      ? (telemetry.leadCarHeadingRad * 180) / Math.PI
      : 0;

  const raceStandings = useMemo(() => {
    if (!telemetry.botRacers || telemetry.botRacers.length === 0) return [];
    const playerEntry = {
      id: 'player',
      name: 'YOU (PLAYER)',
      shortName: 'YOU',
      color: '#00F0FF',
      rank: telemetry.racePosition || 1,
      speedKmh: Math.round(telemetry.speedKmh),
      lap: telemetry.currentLap,
      isPlayer: true,
      styleLabel: 'PRO DRIFT PILOT',
      tacticalState: '',
    };
    const botEntries = telemetry.botRacers.map((b) => ({
      id: b.id,
      name: b.name,
      shortName: b.shortName,
      color: b.color,
      rank: b.rank,
      speedKmh: b.speedKmh,
      lap: b.lap,
      isPlayer: false,
      styleLabel: b.styleLabel || '',
      tacticalState: b.tacticalState || '',
    }));
    return [playerEntry, ...botEntries].sort((a, b) => a.rank - b.rank);
  }, [telemetry.botRacers, telemetry.racePosition, telemetry.speedKmh, telemetry.currentLap]);

  return (
    <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-between p-3 sm:p-5">
      {/* TOP BAR: 3-CLUSTER TELEMETRY HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* TOP-LEFT: CIRCUIT SELECTOR, MODE TABS & LIVE 2D TRACK MAP RADAR */}
        <div className="pointer-events-auto flex flex-col gap-2 max-w-full sm:max-w-md">
          <div className="hud-panel rounded-xl p-2.5 flex items-center gap-2.5">
            <div className="w-2 h-9 rounded-full bg-[#00F0FF] shadow-[0_0_12px_#00F0FF]" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono-tabular uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                  circuit.mapStyle === 'haruna'
                    ? 'bg-[#E5C06A]/15 text-[#FDE68A] border-[#E5C06A]/40'
                    : 'bg-[#00F0FF]/15 text-[#00F0FF] border-[#00F0FF]/30'
                }`}>
                  {circuit.mapStyle === 'haruna' ? 'SKYLINE R34 // HARUNA OUTDOOR' : 'SKYLINE R34 // AULA'}
                </span>
                <span className="text-[11px] text-slate-400 truncate hidden sm:inline">
                  {circuit.jpName}
                </span>
              </div>
              <select
                value={circuit.id}
                onChange={(e) => {
                  const found = circuits.find((c) => c.id === e.target.value);
                  if (found) onSelectCircuit(found);
                }}
                aria-label="Select Map or Circuit"
                className="mt-0.5 bg-transparent font-display font-bold text-sm sm:text-base text-white tracking-wider uppercase focus:outline-none cursor-pointer pr-2"
              >
                {circuits.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0B0D13] text-white">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* RC Credits Pill */}
            <div className="px-2.5 py-1 rounded-lg bg-slate-900/90 border border-white/10 text-right">
              <div className="text-[9px] text-slate-400 uppercase tracking-wider">PIT CREDITS</div>
              <div className="font-mono-tabular font-bold text-xs text-[#CCFF00]">
                RC$ {rcCredits.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="hud-panel rounded-xl p-1 flex items-center gap-1">
            {(
              [
                { id: 'race', label: 'RACE 6P 🏁' },
                { id: 'tsuiso', label: 'TSUISO' },
                { id: 'qualifying', label: 'QUALIFY' },
                { id: 'freedrift', label: 'FREE' },
              ] as { id: GameMode; label: string }[]
            ).map((m) => {
              const active = gameMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onSelectGameMode(m.id)}
                  className={`flex-1 px-2 py-1.5 rounded-lg font-display text-[10px] sm:text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer text-center ${
                    active
                      ? 'bg-[#00F0FF] text-[#0B0D13] shadow-[0_0_15px_rgba(0,240,255,0.5)]'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Speed profile — can be changed without leaving the race */}
          <div className="hud-panel rounded-xl px-2.5 py-1.5 flex items-center gap-2">
            <span className="text-[10px] font-mono-tabular font-bold tracking-widest text-slate-300 uppercase">
              KECEPATAN
            </span>
            <div className="flex gap-1 bg-black/45 rounded-lg p-0.5 border border-white/10">
              {([
                ['normal', 'NORMAL'],
                ['sedang', 'SEDANG'],
                ['2x', '2X'],
              ] as [SpeedLevel, string][]).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => onChangeSpeedLevel(value)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-mono-tabular font-bold transition cursor-pointer ${
                    speedLevel === value
                      ? 'bg-[#FB7185] text-black shadow-[0_0_10px_rgba(251,113,133,0.5)]'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* LIVE 2D CIRCUIT TRACK MAP RADAR */}
          <div className="hud-panel rounded-2xl p-2.5 w-52 sm:w-60 hidden sm:block">
            <div className="flex items-center justify-between text-[10px] font-mono-tabular text-slate-300 mb-1 px-1">
              <span className="flex items-center gap-1 font-bold text-[#00F0FF]">
                <MapPin className="w-3 h-3" />
                <span>CIRCUIT TRACK MAP</span>
              </span>
              <span className="text-slate-400">
                CLIPS: {telemetry.clippedZoneIds.length}/{circuit.clippingZones.length}
              </span>
            </div>

            <div className="relative w-full h-32 rounded-xl bg-slate-950/85 border border-white/10 overflow-hidden flex items-center justify-center">
              <svg
                viewBox="-64 -48 128 96"
                className="w-full h-full"
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Outer Track Curb Border */}
                <path
                  d={trackMapData.dPath}
                  fill="none"
                  stroke="#334155"
                  strokeWidth={circuit.trackWidth + 2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* Main P-Tile Track Ribbon */}
                <path
                  d={trackMapData.dPath}
                  fill="none"
                  stroke="#0F172A"
                  strokeWidth={circuit.trackWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* Ideal Drift Line Groove */}
                <path
                  d={trackMapData.dPath}
                  fill="none"
                  stroke={circuit.accentColor}
                  strokeWidth="1.3"
                  strokeDasharray="3 2.5"
                  strokeOpacity="0.65"
                />

                {/* Start / Finish Line Marker */}
                <circle
                  cx={trackMapData.startX}
                  cy={trackMapData.startZ}
                  r="3.2"
                  fill="#FFFFFF"
                  stroke="#0B0D13"
                  strokeWidth="1.2"
                />

                {/* Clipping Zone Markers (OZ-1, CP-2, OZ-3, CP-4) */}
                {trackMapData.clipMarkers.map((cz) => {
                  const isClipped = telemetry.clippedZoneIds.includes(cz.id);
                  const strokeCol = isClipped
                    ? '#CCFF00'
                    : cz.type === 'wall_kiss'
                    ? '#FF2A85'
                    : '#00F0FF';
                  return (
                    <g key={cz.id} transform={`translate(${cz.x}, ${cz.z})`}>
                      <circle
                        r={isClipped ? 4.8 : 4.0}
                        fill={isClipped ? '#CCFF00' : '#0B0D13'}
                        fillOpacity={isClipped ? 0.35 : 0.85}
                        stroke={strokeCol}
                        strokeWidth="1.6"
                      />
                      <text
                        y="1.5"
                        textAnchor="middle"
                        fill={isClipped ? '#CCFF00' : '#F8FAFC'}
                        fontSize="4.2"
                        fontWeight="800"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {cz.shortCode}
                      </text>
                    </g>
                  );
                })}

                {/* 5 Pro Enemy AI Bots on Minimap Radar */}
                {telemetry.botRacers && telemetry.botRacers.length > 0 ? (
                  telemetry.botRacers.map((b) => {
                    const bHeadingDeg = (b.headingRad * 180) / Math.PI;
                    return (
                      <g
                        key={b.id}
                        transform={`translate(${b.x}, ${b.z}) rotate(${-bHeadingDeg + 180})`}
                      >
                        <circle r="4.8" fill={b.color} fillOpacity="0.4" />
                        <polygon
                          points="0,-4.5 3.2,3.4 0,1.6 -3.2,3.4"
                          fill={b.color}
                          stroke="#FFFFFF"
                          strokeWidth="0.8"
                        />
                      </g>
                    );
                  })
                ) : (
                  (gameMode === 'tsuiso' || gameMode === 'freedrift' || gameMode === 'race') &&
                  telemetry.leadCarX !== undefined &&
                  telemetry.leadCarZ !== undefined && (
                    <g
                      transform={`translate(${telemetry.leadCarX}, ${telemetry.leadCarZ}) rotate(${-leadCarHeadingDeg + 180})`}
                    >
                      <circle r="5.2" fill="#FF2A85" fillOpacity="0.32" />
                      <polygon
                        points="0,-4.5 3.4,3.5 0,1.8 -3.4,3.5"
                        fill="#FF2A85"
                        stroke="#FFFFFF"
                        strokeWidth="0.9"
                      />
                    </g>
                  )
                )}

                {/* Player Nissan Skyline GT-R Live Position & Drift Heading Arrow */}
                {telemetry.carX !== undefined && telemetry.carZ !== undefined && (
                  <g
                    transform={`translate(${telemetry.carX}, ${telemetry.carZ}) rotate(${-carHeadingDeg + 180})`}
                  >
                    <circle r="5.8" fill="#00F0FF" fillOpacity="0.35" className="animate-ping" />
                    <circle r="5.0" fill="#00F0FF" fillOpacity="0.28" />
                    <polygon
                      points="0,-4.8 3.6,3.8 0,2.0 -3.6,3.8"
                      fill="#00F0FF"
                      stroke="#FFFFFF"
                      strokeWidth="1.1"
                    />
                  </g>
                )}
              </svg>

              {/* Map Legend Overlay */}
              <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between text-[8px] font-mono-tabular text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#00F0FF] inline-block shadow-[0_0_6px_#00F0FF]" />
                  YOU (R34)
                </span>
                <span className="flex items-center gap-1 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-[#FF2A85] inline-block" />
                  <span className="w-2 h-2 rounded-full bg-[#FF6B00] inline-block" />
                  <span className="w-2 h-2 rounded-full bg-[#DC2626] inline-block" />
                  <span>5 BOTS</span>
                </span>
                <span className="text-[#CCFF00]">Z1-Z4</span>
              </div>
            </div>

            {/* LIVE 6-CAR RACE STANDINGS LEADERBOARD */}
            {raceStandings.length > 0 && (
              <div className="hud-panel rounded-xl p-2 font-mono-tabular border border-white/10 shadow-xl max-w-full">
                <div className="flex items-center justify-between text-[9px] font-display font-extrabold uppercase tracking-wider text-slate-300 pb-1 mb-1 border-b border-white/10">
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <span>🏁</span>
                    <span>LIVE 6P STANDINGS</span>
                  </span>
                  <span className="text-slate-400 text-[8px]">SPEED • LAP</span>
                </div>
                <div className="space-y-1">
                  {raceStandings.map((racer) => {
                    const isP1 = racer.rank === 1;
                    const isP2 = racer.rank === 2;
                    const isP3 = racer.rank === 3;
                    return (
                      <div
                        key={racer.id}
                        className={`flex items-center justify-between px-2 py-0.5 rounded-lg text-[10px] transition-all ${
                          racer.isPlayer
                            ? 'bg-[#00F0FF]/20 border border-[#00F0FF]/60 text-white font-bold shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                            : 'bg-black/30 border border-white/5 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-black shrink-0 ${
                              isP1
                                ? 'bg-amber-400 text-black shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                                : isP2
                                ? 'bg-slate-200 text-black'
                                : isP3
                                ? 'bg-amber-700 text-white'
                                : 'bg-white/10 text-slate-400'
                            }`}
                          >
                            {racer.rank}
                          </span>
                          <span
                            className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                            style={{ backgroundColor: racer.color }}
                          />
                          <span
                            className={`truncate text-[10px] ${
                              racer.isPlayer ? 'text-[#00F0FF] font-black' : 'text-slate-200 font-medium'
                            }`}
                          >
                            {racer.shortName}
                          </span>
                          {/* Live tactical / personality badge */}
                          {racer.tacticalState === 'overtaking' ? (
                            <span className="text-[7.5px] px-1 py-0.5 rounded bg-amber-500/25 border border-amber-400/50 text-amber-300 font-bold animate-pulse shrink-0">
                              ⚡ PASS
                            </span>
                          ) : racer.tacticalState === 'defending' ? (
                            <span className="text-[7.5px] px-1 py-0.5 rounded bg-blue-500/25 border border-blue-400/50 text-blue-300 font-bold shrink-0">
                              🛡️ DEF
                            </span>
                          ) : racer.tacticalState === 'feint_entry' ? (
                            <span className="text-[7.5px] px-1 py-0.5 rounded bg-fuchsia-500/25 border border-fuchsia-400/50 text-fuchsia-300 font-bold shrink-0">
                              🌀 FEINT
                            </span>
                          ) : racer.tacticalState === 'recovering' ? (
                            <span className="text-[7.5px] px-1 py-0.5 rounded bg-emerald-500/25 border border-emerald-400/50 text-emerald-300 font-bold shrink-0">
                              🔄 REJOIN
                            </span>
                          ) : racer.styleLabel ? (
                            <span className="hidden sm:inline-block text-[7px] px-1 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-medium truncate max-w-[80px]">
                              {racer.styleLabel.split(' ')[0]}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-[9px] text-slate-400">
                          <span className="font-mono-tabular font-bold text-slate-300">{racer.speedKmh} km/h</span>
                          <span className="text-[8px] px-1 rounded bg-white/10 text-slate-400 font-bold">
                            L{racer.lap}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TOP-CENTER: LIVE JUDGE SCOREBOARD & CLIPPING ZONES */}
        <div className="pointer-events-none flex flex-col items-center mx-auto order-3 lg:order-2 w-full lg:w-auto">
          <div className="hud-panel-cyan rounded-2xl px-5 py-2.5 flex items-center gap-5 sm:gap-7">
            <div className="text-left">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {gameMode === 'race'
                  ? `RACE POS & LAP`
                  : gameMode === 'qualifying'
                  ? `QUALIFYING LAP`
                  : gameMode === 'tsuiso'
                  ? 'TSUISO PROXIMITY'
                  : 'ENDLESS SESSION'}
              </div>
              <div className="font-mono-tabular font-extrabold text-lg sm:text-xl text-white">
                {gameMode === 'race' ? (
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-black tracking-wider ${
                        telemetry.racePosition === 1
                          ? 'bg-amber-400 text-black shadow-[0_0_12px_rgba(251,191,36,0.6)]'
                          : telemetry.racePosition === 2
                          ? 'bg-slate-200 text-black shadow-[0_0_10px_rgba(226,232,240,0.5)]'
                          : telemetry.racePosition === 3
                          ? 'bg-amber-700 text-white'
                          : 'bg-white/20 text-cyan-300'
                      }`}
                    >
                      {telemetry.racePosition === 1
                        ? '🥇 P1'
                        : telemetry.racePosition === 2
                        ? '🥈 P2'
                        : telemetry.racePosition === 3
                        ? '🥉 P3'
                        : `P${telemetry.racePosition || 1}`}
                      <span className="text-[9px] opacity-75 ml-0.5">/6</span>
                    </span>
                    <span className="text-sm text-slate-300 font-bold">
                      LAP {telemetry.currentLap}/{telemetry.maxLaps}
                    </span>
                  </div>
                ) : gameMode === 'qualifying' ? (
                  <>
                    {telemetry.currentLap}
                    <span className="text-slate-400 text-sm">/{telemetry.maxLaps}</span>
                  </>
                ) : gameMode === 'tsuiso' ? (
                  <span
                    className={
                      telemetry.tsuisoSyncActive ? 'text-[#CCFF00]' : 'text-[#00F0FF]'
                    }
                  >
                    {telemetry.tsuisoDistanceM < 25
                      ? `${telemetry.tsuisoDistanceM}m`
                      : 'CHASE LEAD'}
                  </span>
                ) : (
                  <span>FREE</span>
                )}
              </div>
            </div>

            <div className="text-center border-x border-white/10 px-5">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                TOTAL DRIFT PTS
              </div>
              <div className="font-mono-tabular font-extrabold text-2xl sm:text-3xl tracking-tight text-white">
                {telemetry.sessionScore.toLocaleString()}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-[#FF2A85]">
                  ACTIVE COMBO
                </div>
                <div className="font-mono-tabular font-bold text-lg sm:text-xl text-[#FF2A85]">
                  +{telemetry.currentComboPoints.toLocaleString()}
                </div>
              </div>
              <div
                className={`px-2.5 py-1 rounded-md font-display font-extrabold text-base sm:text-lg -skew-x-10 transition-transform ${
                  telemetry.comboMultiplier >= 4
                    ? 'bg-[#FF2A85] text-white shadow-[0_0_18px_#FF2A85] scale-105'
                    : 'bg-white/10 text-[#00F0FF] border border-[#00F0FF]/40'
                }`}
              >
                {telemetry.comboMultiplier.toFixed(1)}x
              </div>
            </div>
          </div>

          {/* Clipping Zone Pills for Current Lap */}
          <div className="mt-2 flex items-center gap-1.5">
            {circuit.clippingZones.map((cz) => {
              const clipped = telemetry.clippedZoneIds.includes(cz.id);
              return (
                <div
                  key={cz.id}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono-tabular font-bold tracking-wider uppercase border transition-all ${
                    clipped
                      ? 'bg-[#CCFF00]/25 border-[#CCFF00] text-[#CCFF00] shadow-[0_0_12px_rgba(204,255,0,0.45)]'
                      : 'bg-slate-950/75 border-white/15 text-slate-400'
                  }`}
                >
                  {clipped ? '✓ ' : ''}
                  {cz.label}
                </div>
              );
            })}
          </div>

          {telemetry.judgeCallout && (
            <div
              key={telemetry.judgeCallout.timestamp}
              className="mt-2.5 px-4 py-1.5 rounded-xl bg-slate-950/90 border border-[#CCFF00] shadow-[0_0_25px_rgba(204,255,0,0.35)] text-center animate-bounce"
            >
              <div className="font-display font-extrabold text-sm sm:text-base tracking-wider text-[#CCFF00] uppercase">
                {telemetry.judgeCallout.text}
              </div>
              <div className="font-mono-tabular text-[10px] text-slate-300 uppercase tracking-widest">
                {telemetry.judgeCallout.subtext}
              </div>
            </div>
          )}
        </div>

        {/* TOP-RIGHT: PIT BENCH, SMOKE MODE, X-RAY CHASSIS VIEW, CAMERA, AUDIO */}
        <div className="pointer-events-auto flex items-center gap-2 order-2 lg:order-3">
          {onToggleSmokeMode && (
            <button
              onClick={onToggleSmokeMode}
              title="Toggle Mode Asap Baru (5-Stage Pipeline) vs Mode Asap Lama"
              className={`hud-panel px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs font-display font-bold tracking-wider uppercase transition cursor-pointer ${
                (tuning.smokeConfig?.mode || 'new_pipeline') === 'new_pipeline'
                  ? 'border-[#CCFF00]/60 text-[#CCFF00] bg-[#CCFF00]/10 shadow-[0_0_12px_rgba(204,255,0,0.2)]'
                  : 'text-slate-300 hover:border-white/30'
              }`}
            >
              <CloudFog className="w-4 h-4 text-[#CCFF00]" />
              <span className="hidden sm:inline">
                {(tuning.smokeConfig?.mode || 'new_pipeline') === 'new_pipeline'
                  ? 'SMOKE: BARU (5-TAHAP)'
                  : 'SMOKE: LAMA'}
              </span>
            </button>
          )}

          <button
            onClick={onCycleBodyShellMode}
            title="Toggle Painted Lexan / X-Ray Shell / Naked 1:10 Chassis"
            className={`hud-panel px-3 py-2 rounded-xl flex items-center gap-2 text-xs font-display font-bold tracking-wider uppercase transition cursor-pointer ${
              bodyShellMode !== 'painted'
                ? 'border-[#CCFF00]/60 text-[#CCFF00] bg-[#CCFF00]/10'
                : 'text-slate-200 hover:border-white/30'
            }`}
          >
            <Eye className="w-4 h-4 text-[#00F0FF]" />
            <span className="hidden md:inline">{shellLabel}</span>
          </button>

          <button
            onClick={onCycleCamera}
            title="Switch RC Camera Perspective"
            className="hud-panel px-3 py-2 rounded-xl flex items-center gap-2 text-xs font-display font-bold tracking-wider uppercase text-slate-200 hover:border-[#00F0FF]/50 transition cursor-pointer"
          >
            <Camera className="w-4 h-4 text-[#00F0FF]" />
            <span className="hidden md:inline">{cameraLabel}</span>
          </button>

          {onOpenBMWAdjust && (
            <button
              onClick={onOpenBMWAdjust}
              title="Atur Panjang, Lebar, Tinggi dan Letak Ketinggian Body BMW GLB"
              className="hud-panel px-2.5 sm:px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs font-display font-bold tracking-wider uppercase text-pink-300 border border-pink-400/50 bg-pink-950/40 hover:bg-pink-900/50 hover:border-pink-400 transition cursor-pointer shadow-[0_0_12px_rgba(244,63,94,0.2)]"
            >
              <span>📐</span>
              <span className="hidden sm:inline">BODY BMW</span>
            </button>
          )}

          <button
            onClick={onResetRun}
            title="Reset Car to Start Line"
            className="hud-panel p-2 rounded-xl text-slate-300 hover:text-white hover:border-white/30 transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {onBackToMenu && (
            <button
              onClick={onBackToMenu}
              title="Kembali ke Main Menu Sakura"
              className="hud-panel p-2 rounded-xl text-pink-200 hover:text-white hover:border-pink-300/50 transition cursor-pointer"
            >
              <Home className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onToggleMute}
            title={isMuted ? 'Unmute RB26 Sound' : 'Mute Sound'}
            className="hud-panel p-2 rounded-xl text-slate-300 hover:text-white hover:border-white/30 transition cursor-pointer"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-[#00F0FF]" />
            )}
          </button>

          <button
            onClick={onOpenPitBench}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#00B8FF] text-[#0B0D13] font-display font-extrabold text-xs sm:text-sm tracking-wider uppercase flex items-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.45)] hover:brightness-110 active:scale-95 transition cursor-pointer"
          >
            <Sliders className="w-4 h-4 stroke-[2.5]" />
            <span>PIT BENCH</span>
          </button>
        </div>
      </div>

      {/* BOTTOM CLUSTER: TRANSMITTER TOUCH CONTROLS (LEFT) + LIVE 1:10 RWD TELEMETRY (RIGHT) */}
      <div className="flex items-end justify-between gap-4">
        <div className="pointer-events-auto flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleAutoThrottle}
              className={`px-3 py-1.5 rounded-lg font-display font-bold text-xs tracking-wider uppercase flex items-center gap-1.5 border transition cursor-pointer ${
                tuning.autoThrottle
                  ? 'bg-[#CCFF00]/20 border-[#CCFF00] text-[#CCFF00] shadow-[0_0_15px_rgba(204,255,0,0.3)]'
                  : 'hud-panel text-slate-300 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>1-HAND AUTO THROTTLE: {tuning.autoThrottle ? 'ON' : 'OFF'}</span>
            </button>

            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/70 border border-white/10 text-[11px] text-slate-400 font-mono-tabular">
              <Radio className="w-3.5 h-3.5 text-[#00F0FF]" />
              <span>KEYS: [W/A/S/D] or [ARROWS] • [SPACE] CLUTCH KICK • [SHIFT] ESC TURBO</span>
            </div>
          </div>

          <div className="hud-panel rounded-2xl p-2.5 flex items-center gap-2.5">
            <button
              onPointerDown={() => onChangeExternalSteer(1)}
              onPointerUp={() => onChangeExternalSteer(0)}
              onPointerLeave={() => onChangeExternalSteer(0)}
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl font-display font-extrabold text-sm flex flex-col items-center justify-center border transition select-none cursor-pointer ${
                externalSteer > 0.2
                  ? 'bg-[#00F0FF] text-[#0B0D13] border-[#00F0FF] shadow-[0_0_16px_#00F0FF]'
                  : 'bg-slate-900/90 text-white border-white/15 hover:border-[#00F0FF]/50'
              }`}
            >
              <span className="text-lg leading-none">◀</span>
              <span className="text-[9px] mt-1 tracking-wider">LEFT</span>
            </button>

            <button
              onPointerDown={() => onChangeExternalSteer(-1)}
              onPointerUp={() => onChangeExternalSteer(0)}
              onPointerLeave={() => onChangeExternalSteer(0)}
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl font-display font-extrabold text-sm flex flex-col items-center justify-center border transition select-none cursor-pointer ${
                externalSteer < -0.2
                  ? 'bg-[#00F0FF] text-[#0B0D13] border-[#00F0FF] shadow-[0_0_16px_#00F0FF]'
                  : 'bg-slate-900/90 text-white border-white/15 hover:border-[#00F0FF]/50'
              }`}
            >
              <span className="text-lg leading-none">▶</span>
              <span className="text-[9px] mt-1 tracking-wider">RIGHT</span>
            </button>

            <div className="h-10 w-[1px] bg-white/10 mx-0.5" />

            {!tuning.autoThrottle && (
              <button
                onPointerDown={() => onThrottleHold(true)}
                onPointerUp={() => onThrottleHold(false)}
                onPointerLeave={() => onThrottleHold(false)}
                className="w-16 h-14 sm:w-20 sm:h-16 rounded-xl bg-gradient-to-b from-[#00F0FF]/25 to-[#00F0FF]/10 border border-[#00F0FF]/50 text-[#00F0FF] font-display font-extrabold text-xs flex flex-col items-center justify-center active:bg-[#00F0FF] active:text-[#0B0D13] transition select-none cursor-pointer"
              >
                <Zap className="w-4 h-4 mb-0.5" />
                <span>THROTTLE</span>
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
              className="w-16 h-14 sm:w-20 sm:h-16 rounded-xl bg-gradient-to-b from-[#FF2A85]/30 to-[#FF2A85]/10 border border-[#FF2A85]/60 text-[#FF2A85] font-display font-extrabold text-xs flex flex-col items-center justify-center active:bg-[#FF2A85] active:text-white transition select-none cursor-pointer"
            >
              <Flame className="w-4 h-4 mb-0.5" />
              <span>ESC TURBO</span>
            </button>

            <button
              onPointerDown={() => onBrakeHold(true)}
              onPointerUp={() => onBrakeHold(false)}
              onPointerLeave={() => onBrakeHold(false)}
              className="w-12 h-14 sm:w-14 sm:h-16 rounded-xl bg-slate-900/90 border border-white/15 text-slate-300 font-display font-bold text-[10px] flex flex-col items-center justify-center active:bg-rose-500 active:text-white transition select-none cursor-pointer"
            >
              <span>BRAKE</span>
              <span className="text-[8px] text-slate-400">KICK</span>
            </button>
          </div>
        </div>

        {/* BOTTOM-RIGHT: 1:10 RWD ACKERMANN, GYRO & RB26 TELEMETRY GAUGE */}
        <div className="pointer-events-auto hud-panel rounded-2xl p-3 sm:p-4 w-72 sm:w-84">
          <div className="flex items-center justify-between gap-3">
            <div className="relative w-20 h-20 rounded-xl bg-slate-950/90 border border-white/10 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 80 80" className="w-16 h-16">
                <rect
                  x="33"
                  y="14"
                  width="14"
                  height="52"
                  rx="4"
                  fill="#1E293B"
                  stroke="#475569"
                  strokeWidth="1.5"
                />
                <line
                  x1="16"
                  y1="24"
                  x2="64"
                  y2="24"
                  stroke="#00F0FF"
                  strokeWidth="2"
                  strokeOpacity="0.6"
                />
                <line x1="16" y1="58" x2="64" y2="58" stroke="#475569" strokeWidth="2" />
                <rect x="10" y="50" width="8" height="16" rx="2" fill="#94A3B8" />
                <rect x="62" y="50" width="8" height="16" rx="2" fill="#94A3B8" />
                <g transform={`translate(14, 24) rotate(${-telemetry.frontSteerDeg})`}>
                  <rect x="-4" y="-8" width="8" height="16" rx="2" fill="#00F0FF" />
                </g>
                <g transform={`translate(66, 24) rotate(${-telemetry.frontSteerDeg})`}>
                  <rect x="-4" y="-8" width="8" height="16" rx="2" fill="#00F0FF" />
                </g>
              </svg>
              <span className="absolute bottom-1 text-[8px] font-mono-tabular uppercase text-slate-400">
                ACKERMANN
              </span>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-2">
              <div className="bg-slate-950/75 rounded-xl p-2 border border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-slate-400">
                  DRIFT ANGLE
                </div>
                <div
                  className={`font-mono-tabular font-extrabold text-xl sm:text-2xl ${
                    telemetry.driftAngleDeg >= 35
                      ? 'text-[#CCFF00]'
                      : telemetry.driftAngleDeg >= 16
                      ? 'text-[#00F0FF]'
                      : 'text-white'
                  }`}
                >
                  {telemetry.driftAngleDeg}°
                </div>
                <div className="text-[9px] font-mono-tabular text-slate-400">
                  LOCK: {Math.abs(telemetry.frontSteerDeg)}°/{tuning.maxSteerAngle}°
                </div>
              </div>

              <div className="bg-slate-950/75 rounded-xl p-2 border border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-slate-400">
                  SCALE SPEED
                </div>
                <div className="font-mono-tabular font-extrabold text-xl sm:text-2xl text-white">
                  {telemetry.scaleSpeedKmh}
                  <span className="text-[10px] font-normal text-slate-400 ml-0.5">
                    km/h
                  </span>
                </div>
                <div className="text-[9px] font-mono-tabular text-[#00F0FF]">
                  REAL: {telemetry.speedKmh} km/h
                </div>
              </div>
            </div>
          </div>

          {/* Live 4-Corner Pro Suspension Damper Compression & Weight Transfer Readout */}
          <div className="mt-2.5 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between text-[9px] font-mono-tabular mb-1">
              <span className="text-slate-400 uppercase">
                COILOVER DAMPERS (#{tuning.suspension?.shockOilCst ?? 250} CST)
              </span>
              <span
                className={`font-bold ${
                  (telemetry.pitchSquatDeg ?? 0) > 0.6
                    ? 'text-[#CCFF00]'
                    : (telemetry.pitchSquatDeg ?? 0) < -0.6
                    ? 'text-[#FF2A85]'
                    : 'text-[#00F0FF]'
                }`}
              >
                {(telemetry.pitchSquatDeg ?? 0) > 0.6
                  ? `REAR SQUAT +${telemetry.pitchSquatDeg}°`
                  : (telemetry.pitchSquatDeg ?? 0) < -0.6
                  ? `NOSE DIVE ${telemetry.pitchSquatDeg}°`
                  : `ROLL ${telemetry.rollDeg ?? 0}°`}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { label: 'FL', val: telemetry.damperFL ?? 50 },
                  { label: 'FR', val: telemetry.damperFR ?? 50 },
                  { label: 'RL', val: telemetry.damperRL ?? 50 },
                  { label: 'RR', val: telemetry.damperRR ?? 50 },
                ] as { label: string; val: number }[]
              ).map((d) => (
                <div
                  key={d.label}
                  className="bg-slate-950/80 rounded px-1.5 py-1 border border-white/10"
                >
                  <div className="flex justify-between text-[8px] font-mono-tabular text-slate-400 mb-0.5">
                    <span>{d.label}</span>
                    <span className="text-white">{d.val}%</span>
                  </div>
                  <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-75 ${
                        d.val > 72
                          ? 'bg-[#CCFF00]'
                          : d.val < 35
                          ? 'bg-[#FF2A85]'
                          : 'bg-[#00F0FF]'
                      }`}
                      style={{ width: `${d.val}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2">
            <div className="flex justify-between text-[10px] font-mono-tabular mb-1">
              <span className="text-slate-400 uppercase">
                RC GYRO ASSIST ({tuning.gyroGain}% GAIN)
              </span>
              <span className="text-[#00F0FF] font-bold">
                {telemetry.gyroActivePct}% ACTIVE
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#00F0FF] to-[#CCFF00] transition-all duration-75"
                style={{ width: `${telemetry.gyroActivePct}%` }}
              />
            </div>
          </div>

          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] font-mono-tabular mb-1">
              <span className="text-slate-400 uppercase flex items-center gap-1">
                RB26 // 10.5T RPM
                {telemetry.turboActive && (
                  <span className="px-1.5 py-0.2 rounded bg-[#FF2A85] text-white text-[9px] font-bold animate-pulse">
                    TWIN TURBO
                  </span>
                )}
              </span>
              <span
                className={`font-bold ${
                  telemetry.turboActive ? 'text-[#FF2A85]' : 'text-white'
                }`}
              >
                {telemetry.rpm.toLocaleString()} RPM
              </span>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  telemetry.turboActive
                    ? 'bg-gradient-to-r from-[#00F0FF] via-[#FF2A85] to-[#F59E0B]'
                    : 'bg-[#00F0FF]'
                }`}
                style={{ width: `${rpmPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
