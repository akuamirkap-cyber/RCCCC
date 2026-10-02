import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type HudState, type Phase, type PopupKind, type RaceResult } from './game/Game';
import {
  DEFAULT_ENGINE,
  DEFAULT_RACE,
  DEFAULT_SLIP,
  DEFAULT_TUNING,
  loadSetup,
  saveSetup,
  type CarTuning,
  type EngineKind,
  type GameSetup,
  type RaceSettings,
  type SlipTuning,
} from './game/tuning';
import { loadPrefs, savePrefs, type CameraMode, type CarStyle, type SmokeSettings, type VisualPrefs } from './game/prefs';
import { Hud, type MinimapData, type Popup } from './components/Hud';
import { PauseOverlay, ResultScreen, StartScreen, type BestRecords } from './components/Screens';
import { TuningPanel } from './components/TuningPanel';
import { VisualPanel } from './components/VisualPanel';

const STORAGE_KEY = 'drift-king-best-v1';

function loadBest(): BestRecords {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const b = JSON.parse(raw) as Partial<BestRecords>;
      return { score: b.score ?? 0, lap: b.lap ?? null, wins: b.wins ?? 0, races: b.races ?? 0 };
    }
  } catch {
    /* ignore */
  }
  return { score: 0, lap: null, wins: 0, races: 0 };
}

function saveBest(b: BestRecords) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

const initialPrefs = loadPrefs();

const initialHud: HudState = {
  phase: 'menu',
  countdown: -1,
  speed: 0,
  lap: 1,
  totalLaps: DEFAULT_RACE.laps,
  position: 4,
  totalCars: 4,
  raceTime: 0,
  lapTime: 0,
  bestLap: null,
  driftScore: 0,
  driftChips: 0,
  driftCurrent: 0,
  driftTime: 0,
  combo: 1,
  isDrifting: false,
  boost: 0,
  boosting: false,
  boostReady: false,
  driftBoost: 0,
  offTrack: false,
  wrongWay: false,
  topSpeed:
    DEFAULT_ENGINE === 'slip'
      ? DEFAULT_SLIP.maxSpeed + DEFAULT_SLIP.boostPower
      : DEFAULT_TUNING.maxSpeed + DEFAULT_TUNING.boostPower,
  paused: false,
  camera: initialPrefs.camera,
  engine: DEFAULT_ENGINE,
  slipDeg: 0,
  zone: null,
  zoneAhead: null,
  cars: [],
};

const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

type PanelKind = 'none' | 'tuning' | 'visual';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const phaseRef = useRef<Phase>('menu');
  const popupId = useRef(0);

  const [hud, setHud] = useState<HudState>(initialHud);
  const [phase, setPhase] = useState<Phase>('menu');
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [minimap, setMinimap] = useState<MinimapData | null>(null);
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState<BestRecords>(loadBest);
  const [newBest, setNewBest] = useState({ score: false, lap: false });

  // Car setup (tuning + race settings)
  const [setup, setSetup] = useState<GameSetup>(loadSetup);
  const setupRef = useRef(setup);
  setupRef.current = setup;

  // Visual prefs (camera, car style, smoke)
  const [prefs, setPrefs] = useState<VisualPrefs>(initialPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const [panel, setPanel] = useState<PanelKind>('none');
  const panelRef = useRef<PanelKind>('none');
  panelRef.current = panel;
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const bestRef = useRef<BestRecords>(best);
  bestRef.current = best;

  const addPopup = useCallback((text: string, kind: PopupKind) => {
    const id = ++popupId.current;
    setPopups((p) => [...p.slice(-3), { id, text, kind }]);
    window.setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1300);
  }, []);

  const handleResult = useCallback((r: RaceResult) => {
    setResult(r);
    const prev = bestRef.current;
    const newScore = r.driftScore > prev.score;
    const newLap = r.bestLap > 0 && (prev.lap === null || r.bestLap < prev.lap);
    const next: BestRecords = {
      score: Math.max(prev.score, r.driftScore),
      lap: newLap ? r.bestLap : prev.lap,
      wins: prev.wins + (r.position === 1 ? 1 : 0),
      races: prev.races + 1,
    };
    bestRef.current = next;
    saveBest(next);
    setNewBest({ score: newScore, lap: newLap });
    setBest(next);
    window.setTimeout(() => setShowResult(true), 1400);
  }, []);

  const setPausedBoth = useCallback((v: boolean) => {
    pausedRef.current = v;
    setPaused(v);
  }, []);

  const togglePause = useCallback(
    (force?: boolean) => {
      const g = gameRef.current;
      if (!g) return;
      const ph = phaseRef.current;
      if (ph !== 'racing' && ph !== 'countdown') return;
      const next = force ?? !pausedRef.current;
      g.setPaused(next);
      setPausedBoth(next);
      if (!next) setPanel('none');
    },
    [setPausedBoth],
  );

  const updatePrefs = useCallback((patch: Partial<VisualPrefs>) => {
    const next: VisualPrefs = { ...prefsRef.current, ...patch, smoke: { ...(patch.smoke ?? prefsRef.current.smoke) } };
    prefsRef.current = next;
    savePrefs(next);
    setPrefs(next);
  }, []);

  const cycleCamera = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const cam = g.cycleCamera();
    updatePrefs({ camera: cam });
    addPopup(cam === 'rally' ? 'ART OF RALLY CAM' : cam === 'chase' ? 'CHASE CAM' : cam === 'cockpit' ? 'COCKPIT CAM' : 'FAR CHASE CAM', 'info');
  }, [addPopup, updatePrefs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(
      canvas,
      {
        onHud: setHud,
        onPopup: addPopup,
        onPhase: (p, r) => {
          phaseRef.current = p;
          setPhase(p);
          setPausedBoth(false);
          setPanel('none');
          if (p !== 'finished') setShowResult(false);
          if (p === 'finished' && r) handleResult(r);
        },
      },
      prefsRef.current,
    );
    gameRef.current = game;
    game.setTuning(setupRef.current.tuning);
    game.setSlipTuning(setupRef.current.slipTuning);
    game.setEngine(setupRef.current.engine);
    game.setRaceSettings(setupRef.current.race);
    setMinimap(game.getMinimap());

    const onKey = (e: KeyboardEvent, down: boolean) => {
      const g = gameRef.current;
      if (!g) return;
      // let sliders handle their own arrow keys (Escape / P still work)
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
      if (inField && e.code !== 'Escape' && e.code !== 'KeyP') return;
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          g.input.left = down;
          break;
        case 'ArrowRight':
        case 'KeyD':
          g.input.right = down;
          break;
        case 'Space':
          g.input.handbrake = down;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          g.input.boost = down;
          break;
        case 'ArrowDown':
        case 'KeyS':
          g.input.brake = down;
          break;
        case 'KeyC':
          if (down && panelRef.current === 'none' && (phaseRef.current === 'racing' || phaseRef.current === 'countdown')) cycleCamera();
          break;
        case 'Escape':
        case 'KeyP':
          if (down) {
            if (panelRef.current !== 'none' && phaseRef.current === 'menu') setPanel('none');
            else togglePause();
          }
          break;
        case 'Enter':
          if (down && panelRef.current === 'none' && (phaseRef.current === 'menu' || phaseRef.current === 'finished')) g.startRace();
          break;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    const blur = () => {
      const g = gameRef.current;
      if (g) {
        g.input.left = g.input.right = g.input.handbrake = g.input.brake = g.input.boost = false;
      }
    };
    const onVisibility = () => {
      if (document.hidden && phaseRef.current === 'racing') togglePause(true);
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', onVisibility);
      game.dispose();
      gameRef.current = null;
    };
  }, [addPopup, cycleCamera, handleResult, setPausedBoth, togglePause]);

  const start = () => {
    setPopups([]);
    setPanel('none');
    gameRef.current?.startRace();
  };

  const toggleMute = () => {
    setMuted((m) => {
      gameRef.current?.setMuted(!m);
      return !m;
    });
  };

  const applyTuning = useCallback((t: CarTuning) => {
    const next: GameSetup = { ...setupRef.current, tuning: t };
    setupRef.current = next;
    saveSetup(next);
    setSetup(next);
    gameRef.current?.setTuning(t);
  }, []);

  const applyRace = useCallback((r: RaceSettings) => {
    const next: GameSetup = { ...setupRef.current, race: r };
    setupRef.current = next;
    saveSetup(next);
    setSetup(next);
    gameRef.current?.setRaceSettings(r);
  }, []);

  const applySlipTuning = useCallback((t: SlipTuning) => {
    const next: GameSetup = { ...setupRef.current, slipTuning: t };
    setupRef.current = next;
    saveSetup(next);
    setSetup(next);
    gameRef.current?.setSlipTuning(t);
  }, []);

  const applyEngine = useCallback(
    (e: EngineKind) => {
      if (setupRef.current.engine === e) return;
      const next: GameSetup = { ...setupRef.current, engine: e };
      setupRef.current = next;
      saveSetup(next);
      setSetup(next);
      gameRef.current?.setEngine(e);
      if (phaseRef.current === 'racing' || phaseRef.current === 'countdown') addPopup(e === 'slip' ? 'SLIP ENGINE' : 'CLASSIC ENGINE', 'info');
    },
    [addPopup],
  );

  const applyCamera = useCallback(
    (c: CameraMode) => {
      gameRef.current?.setCamera(c);
      updatePrefs({ camera: c });
    },
    [updatePrefs],
  );
  const applyCarStyle = useCallback(
    (s: CarStyle) => {
      gameRef.current?.setCarStyle(s);
      updatePrefs({ carStyle: s });
    },
    [updatePrefs],
  );
  const applySmoke = useCallback(
    (s: SmokeSettings) => {
      gameRef.current?.setSmoke(s);
      updatePrefs({ smoke: s });
    },
    [updatePrefs],
  );

  const steer = useCallback((side: 'left' | 'right', down: boolean) => {
    const g = gameRef.current;
    if (!g) return;
    if (side === 'left') g.input.left = down;
    else g.input.right = down;
  }, []);

  const handbrake = useCallback((down: boolean) => {
    const g = gameRef.current;
    if (g) g.input.handbrake = down;
  }, []);

  const boost = useCallback((down: boolean) => {
    const g = gameRef.current;
    if (g) g.input.boost = down;
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-sky-300">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* Cinematic grade: vignette + warm highlights / cool shadows (below the HUD) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, rgba(24,32,64,0.28) 100%),' +
            'linear-gradient(180deg, rgba(255,170,110,0.08) 0%, rgba(255,170,110,0) 32%, rgba(30,60,140,0.10) 100%)',
        }}
      />

      <Hud
        hud={hud}
        minimap={minimap}
        popups={popups}
        onSteer={steer}
        onHandbrake={handbrake}
        onBoost={boost}
        onPause={() => togglePause(true)}
        onToggleMute={toggleMute}
        onCycleCamera={cycleCamera}
        muted={muted}
        isTouch={isTouchDevice}
      />

      {phase === 'menu' && (
        <StartScreen
          best={best}
          setup={setup}
          prefs={prefs}
          muted={muted}
          onToggleMute={toggleMute}
          onStart={start}
          onOpenSetup={() => setPanel('tuning')}
          onOpenVisual={() => setPanel('visual')}
          isTouch={isTouchDevice}
        />
      )}

      {phase === 'finished' && showResult && result && (
        <ResultScreen
          result={result}
          best={best}
          newBestScore={newBest.score}
          newBestLap={newBest.lap}
          muted={muted}
          onToggleMute={toggleMute}
          onRestart={start}
          onMenu={() => gameRef.current?.backToMenu()}
        />
      )}

      {paused && panel === 'none' && (
        <PauseOverlay
          setup={setup}
          prefs={prefs}
          onResume={() => togglePause(false)}
          onSetup={() => setPanel('tuning')}
          onVisual={() => setPanel('visual')}
          onRestart={start}
          onMenu={() => gameRef.current?.backToMenu()}
        />
      )}

      {panel === 'tuning' && (
        <TuningPanel
          setup={setup}
          onEngine={applyEngine}
          onTuning={applyTuning}
          onSlipTuning={applySlipTuning}
          onRace={applyRace}
          onClose={() => setPanel('none')}
          inRace={phase !== 'menu'}
        />
      )}

      {panel === 'visual' && (
        <VisualPanel prefs={prefs} onCamera={applyCamera} onCarStyle={applyCarStyle} onSmoke={applySmoke} onClose={() => setPanel('none')} />
      )}
    </div>
  );
}
