import { useState, useCallback, useEffect, useRef } from 'react';
import {
  BodyShellMode,
  CameraMode,
  CarCustomization,
  CircuitDef,
  GameMode,
  LiveTelemetry,
  SessionResult,
  SpeedLevel,
  TuningSetup,
} from './types/rcDrift';
import { DEFAULT_SMOKE_CONFIG, RC_CIRCUITS } from './data/circuitsAndCars';
import { DEFAULT_CUSTOMIZATION, DEFAULT_TUNING } from './data/defaults';
import { RCDriftCanvas3D } from './components/RCDriftCanvas3D';
import { TelemetryHUD } from './components/TelemetryHUD';
import { PitBenchDrawer } from './components/PitBenchDrawer';
import { SessionSummaryModal } from './components/SessionSummaryModal';
import { MainMenu } from './components/MainMenu';
import { DesignDocsModal } from './components/DesignDocsModal';
import { rcSound } from './utils/soundEngine';
import { BMWAdjustmentModal } from '@/components/BMWAdjustmentModal';

export function SakuraDriftApp({
  onSwitchGame,
  initialCircuitId,
  autoStart = false,
  showroom,
  suspended = false,
}: {
  onSwitchGame?: () => void;
  /** Preselect a circuit (e.g. 'ebisu_drift_circuit' when launched from the DRIFT KING menu). */
  initialCircuitId?: string;
  /** Skip the Sakura main menu and drop straight into the session. */
  autoStart?: boolean;
  /**
   * DRIFT KING host mode (defined = hosted). true = the DRIFT KING menu is drawn on top and this app only renders the
   * showroom backdrop (car on the Ebisu grid, static menu camera). Flipping to false starts the race in the SAME
   * scene, so the camera dollies continuously from the menu pose into the chase camera.
   */
  showroom?: boolean;
  /** Ebisu Drift mode is running on top: pause rendering, keep everything else. */
  suspended?: boolean;
}) {
  const hosted = showroom !== undefined;
  const [circuit, setCircuit] = useState<CircuitDef>(
    () => RC_CIRCUITS.find((c) => c.id === initialCircuitId) ?? RC_CIRCUITS[0],
  );
  const [gameMode, setGameMode] = useState<GameMode>('race');
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase_close');
  const [resetTrigger, setResetTrigger] = useState<number>(0);
  const [showBMWAdjust, setShowBMWAdjust] = useState<boolean>(false);

  // Authentic 1:10 RWD RC Drift Physics Tuning State + Pro Suspension + RB26DETT Sound Box + 5-Stage Smoke
  const [tuning, setTuning] = useState<TuningSetup>(DEFAULT_TUNING);

  // Default Car: Nissan Skyline GT-R (BNR34) in Iconic Bayside Blue
  const [customization, setCustomization] = useState<CarCustomization>(DEFAULT_CUSTOMIZATION);

  const [rcCredits, setRcCredits] = useState<number>(3500);
  const [isPitBenchOpen, setIsPitBenchOpen] = useState<boolean>(false);
  const [pitBenchTab, setPitBenchTab] = useState<'suspension' | 'smoke' | 'chassis' | 'tuning'>(
    'suspension'
  );
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  // launched from DRIFT KING (autoStart): never flash Sakura's own menu — the DRIFT KING menu IS the main menu
  const [hasStarted, setHasStarted] = useState<boolean>(autoStart || (hosted && !showroom));
  const [isDocsOpen, setIsDocsOpen] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // On-Screen RC Transmitter Input State
  const [externalSteer, setExternalSteer] = useState<number>(0);
  const [externalThrottle, setExternalThrottle] = useState<boolean>(false);
  const [externalBrake, setExternalBrake] = useState<boolean>(false);
  const [externalTurbo, setExternalTurbo] = useState<boolean>(false);

  // Live 20Hz Telemetry from 3D Engine
  const [telemetry, setTelemetry] = useState<LiveTelemetry>({
    speedKmh: 0,
    scaleSpeedKmh: 0,
    speedLimitKmh: 0,
    rpm: 6500,
    turboActive: false,
    driftAngleDeg: 0,
    signedDriftAngle: 0,
    frontSteerDeg: 0,
    gyroActivePct: 0,
    sessionScore: 0,
    currentComboPoints: 0,
    comboMultiplier: 1.0,
    currentLap: 1,
    maxLaps: 3,
    lapTimeSec: 0,
    bestLapScore: 0,
    clippedZoneIds: [],
    tsuisoDistanceM: 99,
    tsuisoSyncActive: false,
    judgeCallout: {
      text: 'NISSAN SKYLINE GT-R R34 // AULA ARENA READY!',
      subtext: 'RB26DETT SOUND BOX ACTIVE • STEER [A/D] OR [◀/▶]',
      color: 'cyan',
      timestamp: performance.now(),
    },
  });

  const handleTelemetryUpdate = useCallback((newTel: LiveTelemetry) => {
    setTelemetry(newTel);
  }, []);

  const handleSessionFinish = useCallback((result: SessionResult) => {
    setSessionResult(result);
    setRcCredits((prev) => prev + result.rcCreditsEarned);
    try {
      const prevBest = Number(localStorage.getItem('rcdrift.bestScore') || 0);
      if (result.totalScore > prevBest) {
        localStorage.setItem('rcdrift.bestScore', String(result.totalScore));
      }
      const prevLap = Number(localStorage.getItem('rcdrift.bestLap') || 0);
      if (result.maxCombo > prevLap) {
        localStorage.setItem('rcdrift.bestLap', String(result.maxCombo));
      }
    } catch {
      // abaikan jika localStorage tidak tersedia
    }
  }, []);

  const handleCycleCamera = () => {
    rcSound.init();
    // same order as Ebisu Drift: chase → chase far → art of rally → cockpit, then the arena views
    const order: CameraMode[] = ['chase_close', 'chase_far', 'rally', 'cockpit', 'isometric_broadcast', 'driver_stand'];
    setCameraMode((prev) => order[(order.indexOf(prev) + 1) % order.length]);
  };

  const handleCycleBodyShellMode = () => {
    rcSound.init();
    const order: BodyShellMode[] = ['painted', 'translucent', 'naked_chassis'];
    const nextIdx = (order.indexOf(customization.bodyShellMode) + 1) % order.length;
    setCustomization((prev) => ({
      ...prev,
      bodyShellMode: order[nextIdx],
    }));
  };

  const handleToggleMute = () => {
    rcSound.init();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    rcSound.setMuted(nextMuted);
  };

  const handleResetRun = () => {
    rcSound.init();
    setSessionResult(null);
    setResetTrigger((prev) => prev + 1);
  };

  const handleSelectGameMode = (mode: GameMode) => {
    rcSound.init();
    setGameMode(mode);
    setSessionResult(null);
    setResetTrigger((prev) => prev + 1);
  };

  const handleSelectCircuit = (newCircuit: CircuitDef) => {
    rcSound.init();
    setCircuit(newCircuit);
    setSessionResult(null);
    setResetTrigger((prev) => prev + 1);
  };

  const handleStartFromMenu = () => {
    rcSound.init();
    rcSound.playClippingZoneChime(false);
    setSessionResult(null);
    setResetTrigger((prev) => prev + 1);
    setHasStarted(true);
    setCountdown(3);
  };

  // DRIFT KING host: the circuit tile in the menu switches the venue → rebuild the showroom on the new layout
  useEffect(() => {
    if (!hosted || !initialCircuitId) return;
    setCircuit((cur) => {
      if (cur.id === initialCircuitId) return cur;
      const next = RC_CIRCUITS.find((c) => c.id === initialCircuitId);
      if (!next) return cur;
      setSessionResult(null);
      setResetTrigger((prev) => prev + 1);
      return next;
    });
  }, [hosted, initialCircuitId]);

  // DRIFT KING host: menu → START RACE flips `showroom` false → start here without rebuilding the scene;
  // back to the menu (showroom true again) → rebuild so the car is parked on the grid again.
  const showroomPrev = useRef(showroom);
  useEffect(() => {
    if (!hosted || showroomPrev.current === showroom) return;
    showroomPrev.current = showroom;
    if (showroom) {
      setHasStarted(false);
      setSessionResult(null);
      setIsPitBenchOpen(false);
      setResetTrigger((prev) => prev + 1);
    } else {
      rcSound.init();
      rcSound.playClippingZoneChime(false);
      setSessionResult(null);
      setHasStarted(true);
      setCountdown(3);
    }
  }, [hosted, showroom]);

  // Launched from another menu (DRIFT KING → "Ebisu Drift by Sakura RC"): start immediately.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    handleStartFromMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Countdown 3-2-1-GO setelah START
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      const t = window.setTimeout(() => setCountdown(null), 650);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 800);
    return () => window.clearTimeout(t);
  }, [countdown]);

  // Enter di layar hasil = main lagi
  const resetRunRef = useRef(handleResetRun);
  resetRunRef.current = handleResetRun;
  useEffect(() => {
    if (!hasStarted || !sessionResult || isPitBenchOpen || isDocsOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Enter') resetRunRef.current();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [hasStarted, sessionResult, isPitBenchOpen, isDocsOpen]);

  const handleBackToMenu = () => {
    // Launched from the DRIFT KING menu → "menu" means that menu (Ebisu showroom camera + car), not Sakura's own.
    if ((autoStart || hosted) && onSwitchGame) {
      onSwitchGame();
      return;
    }
    setHasStarted(false);
    setSessionResult(null);
  };

  // Haruna opens directly on the downhill setup so its acceleration/drift controls
  // are immediately discoverable; Aula keeps the original suspension entry point.
  const handleOpenPitBench = () => {
    setPitBenchTab(circuit.mapStyle === 'haruna' ? 'tuning' : 'suspension');
    setIsPitBenchOpen(true);
  };

  return (
    <main
      onPointerDown={() => rcSound.init()}
      className="relative w-screen h-screen overflow-hidden bg-[#0B0D13] select-none"
    >
      {/* 100vw x 100vh 3D RC Drift Indoor Aula Arena WebGL Canvas */}
      <RCDriftCanvas3D
        circuit={circuit}
        tuning={tuning}
        customization={customization}
        gameMode={gameMode}
        cameraMode={cameraMode}
        resetTrigger={resetTrigger}
        isMenu={!hasStarted}
        menuShowroom={hosted}
        suspended={suspended}
        externalSteer={externalSteer}
        externalThrottle={externalThrottle}
        externalBrake={externalBrake}
        externalTurbo={externalTurbo}
        onTelemetryUpdate={handleTelemetryUpdate}
        onSessionFinish={handleSessionFinish}
      />

      {/* Sakura main menu — tampil sebelum balapan dimulai */}
      {!hasStarted && !hosted && (
        <MainMenu
          circuits={RC_CIRCUITS}
          circuit={circuit}
          onSelectCircuit={(c) => {
            setCircuit(c);
            setSessionResult(null);
          }}
          gameMode={gameMode}
          onSelectGameMode={setGameMode}
          customization={customization}
          onSelectBody={(bodyId, color) =>
            setCustomization((prev) => ({
              ...prev,
              bodyId,
              bodyColor: color,
            }))
          }
          tuning={tuning}
          onChangeTuning={setTuning}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          rcCredits={rcCredits}
          onStart={handleStartFromMenu}
          onOpenSetup={handleOpenPitBench}
          onOpenCameraFx={() => {
            setPitBenchTab('smoke');
            setIsPitBenchOpen(true);
          }}
          onOpenBMWAdjust={() => setShowBMWAdjust(true)}
        />
      )}

      {/* Lightweight Telemetry & Transmitter HUD */}
      {hasStarted && (
      <TelemetryHUD
        circuit={circuit}
        circuits={RC_CIRCUITS}
        onSelectCircuit={handleSelectCircuit}
        gameMode={gameMode}
        onSelectGameMode={handleSelectGameMode}
        speedLevel={tuning.speedLevel ?? 'normal'}
        onChangeSpeedLevel={(level: SpeedLevel) =>
          setTuning((prev) => ({ ...prev, speedLevel: level }))
        }
        cameraMode={cameraMode}
        onCycleCamera={handleCycleCamera}
        bodyShellMode={customization.bodyShellMode}
        onCycleBodyShellMode={handleCycleBodyShellMode}
        tuning={tuning}
        onToggleAutoThrottle={() =>
          setTuning((prev) => ({ ...prev, autoThrottle: !prev.autoThrottle }))
        }
        onToggleCornerLock={(lock) =>
          setTuning((prev) => ({ ...prev, cornerSpeedLock: lock }))
        }
        onToggleSmokeMode={() =>
          setTuning((prev) => {
            const curSmoke = prev.smokeConfig || DEFAULT_SMOKE_CONFIG;
            return {
              ...prev,
              smokeConfig: {
                ...curSmoke,
                mode: curSmoke.mode === 'new_pipeline' ? 'legacy' : 'new_pipeline',
              },
            };
          })
        }
        telemetry={telemetry}
        rcCredits={rcCredits}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onOpenPitBench={handleOpenPitBench}
        onResetRun={handleResetRun}
        externalSteer={externalSteer}
        onChangeExternalSteer={(val) => {
          rcSound.init();
          setExternalSteer(val);
        }}
        onThrottleHold={(active) => {
          rcSound.init();
          setExternalThrottle(active);
        }}
        onBrakeHold={(active) => {
          rcSound.init();
          setExternalBrake(active);
        }}
        onTurboHold={(active) => {
          rcSound.init();
          setExternalTurbo(active);
        }}
        onBackToMenu={handleBackToMenu}
        onOpenBMWAdjust={() => setShowBMWAdjust(true)}
        onOpenDocs={() => setIsDocsOpen(true)}
        onSwitchGame={autoStart || hosted ? undefined : onSwitchGame}
      />
      )}

      {/* Slide-Over RC Pit Bench Quick-Tuner & Skyline Customizer */}
      <PitBenchDrawer
        isOpen={isPitBenchOpen}
        onClose={() => setIsPitBenchOpen(false)}
        tuning={tuning}
        onChangeTuning={setTuning}
        customization={customization}
        onChangeCustomization={setCustomization}
        isHarunaMap={circuit.mapStyle === 'haruna'}
        initialTab={pitBenchTab}
      />

      {/* Countdown 3-2-1-GO setelah START */}
      {countdown !== null && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center pointer-events-none">
          <div
            key={countdown}
            className="font-display italic font-black text-white text-8xl sm:text-9xl drop-shadow-[4px_4px_0_rgba(0,0,0,0.9)] animate-[countpop_0.7s_ease-out]"
          >
            {countdown > 0 ? countdown : 'GO!'}
          </div>
          <style>{`@keyframes countpop{0%{transform:scale(1.6);opacity:0;}30%{opacity:1;}100%{transform:scale(1);opacity:1;}}`}</style>
        </div>
      )}

      {/* Post-Run Qualifying Judge Scorecard Modal */}
      <SessionSummaryModal
        result={sessionResult}
        onReplay={handleResetRun}
        onOpenPitBench={() => {
          setSessionResult(null);
          handleOpenPitBench();
        }}
      />

      {/* Tombol dokumen desain — hanya di menu; saat balapan ada di popover MENU (⋯) HUD */}
      {!isDocsOpen && !hasStarted && !hosted && (
        <button
          onClick={() => setIsDocsOpen(true)}
          title="Buka dokumen desain map & menu (bisa di-copy)"
          className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[55] px-4 py-2 rounded-full bg-[#1B1430]/90 border border-[#F9A8D4]/50 text-[#FBCFE8] text-[11px] sm:text-xs font-display font-bold tracking-widest uppercase backdrop-blur-md shadow-[0_0_20px_rgba(249,168,212,0.3)] hover:bg-[#2B1B45] hover:border-[#F9A8D4] transition cursor-pointer flex items-center gap-2"
        >
          <span>📖</span>
          <span>DOKUMEN DESAIN (COPY)</span>
        </button>
      )}

      {/* Modal dokumentasi dengan tombol Copy */}
      <DesignDocsModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />

      {/* Floating Top Controls: PILIH GAME & ADJUST BODY BMW — hanya di menu (saat balapan masuk popover MENU HUD) */}
      {!hasStarted && !hosted && (
      <div className="fixed top-3 left-3 z-[60] flex items-center gap-2">
        {onSwitchGame && (
          <button
            onClick={onSwitchGame}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-neutral-900/90 hover:bg-black text-white text-xs font-bold shadow-lg border border-white/20 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
            title="Kembali ke menu pemilihan game"
          >
            <span>🎮</span>
            <span>PILIH GAME</span>
          </button>
        )}

        <button
          onClick={() => setShowBMWAdjust(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pink-950/85 hover:bg-pink-900 text-pink-300 text-xs font-bold shadow-lg border border-pink-500/50 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
          title="Atur panjang, lebar, tinggi dan letak ketinggian (offset Y) body BMW GLB"
        >
          <span>📐</span>
          <span>BODY BMW</span>
        </button>
      </div>
      )}

      {/* BMW GLB Dimensions & Ride Height Adjustment Modal */}
      <BMWAdjustmentModal
        mode="sakura_rc"
        isOpen={showBMWAdjust}
        onClose={() => setShowBMWAdjust(false)}
      />
    </main>
  );
}

export default SakuraDriftApp;
