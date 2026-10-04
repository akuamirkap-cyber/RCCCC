import { useCallback, useEffect, useRef, useState } from 'react';
import type { Venue } from './game/track';
import { Game, type HudState, type MenuBackdrop, type Phase, type PopupKind, type RaceResult } from './game/Game';
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
  type SakuraTuning,
} from './game/tuning';
import { loadPrefs, savePrefs, type CameraMode, type CarStyle, type FxMode, type LightingMode, type SmokeSettings, type VisualPrefs } from './game/prefs';
import { Hud, type MinimapData, type Popup } from './components/Hud';
import './components/hud.css';
import { cn } from './utils/cn';
import { PauseOverlay, ResultScreen, StartScreen, type BestRecords } from './components/Screens';
import { TuningPanel } from './components/TuningPanel';
import { VisualPanel } from './components/VisualPanel';
import { BMWAdjustmentModal } from '@/components/BMWAdjustmentModal';

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
  standings: [],
};

const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** Display mode: PC (keyboard, large HUD) vs Mobile Landscape (touch buttons, compact HUD). */
export type DisplayMode = 'auto' | 'pc' | 'mobile';
const DISPLAY_KEY = 'ebisu.displayMode';
const BACKDROP_KEY = 'ebisu.menuBackdrop';
function loadBackdrop(): MenuBackdrop {
  try {
    return localStorage.getItem(BACKDROP_KEY) === 'wall' ? 'wall' : 'scenic'; // default: circuit scenery; garage is the option
  } catch {
    return 'scenic';
  }
}
function loadDisplayMode(): DisplayMode {
  try {
    const v = localStorage.getItem(DISPLAY_KEY);
    if (v === 'pc' || v === 'mobile' || v === 'auto') return v;
  } catch {
    // ignore
  }
  return 'auto';
}
function useIsPortrait() {
  const [portrait, setPortrait] = useState(() => (typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false));
  useEffect(() => {
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return portrait;
}
/** Best-effort fullscreen + landscape lock for phones (ignored on desktop / unsupported browsers). */
async function enterLandscapeFullscreen() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    // ignore
  }
  try {
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (so && typeof so.lock === 'function') await so.lock('landscape');
  } catch {
    // ignore
  }
}

type PanelKind = 'none' | 'tuning' | 'visual';

export default function EbisuApp({
  onSwitchGame,
  onPlaySakuraEbisu,
  menuShowroom = 'ebisu',
  onShowroomChange,
  venue = 'ebisu',
  onChangeVenue,
}: {
  onSwitchGame?: () => void;
  onPlaySakuraEbisu?: () => void;
  /** What renders behind the DRIFT KING menu: Ebisu's own game ('ebisu') or Sakura RC on the Ebisu circuit ('sakura'). */
  menuShowroom?: 'ebisu' | 'sakura';
  /** Fires when the Sakura backdrop should be visible (menu) or asleep (Ebisu Drift mode running). */
  onShowroomChange?: (visible: boolean) => void;
  /** Circuit/venue for both games (Long Beach street circuit or Ebisu). */
  venue?: Venue;
  onChangeVenue?: (v: Venue) => void;
}) {
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

  // Display mode (PC / Mobile Landscape / Auto)
  const [displayMode, setDisplayMode] = useState<DisplayMode>(loadDisplayMode);
  const [menuBackdrop, setMenuBackdrop] = useState<MenuBackdrop>(loadBackdrop);
  const toggleBackdrop = useCallback(() => {
    setMenuBackdrop((prev) => {
      const next: MenuBackdrop = prev === 'wall' ? 'scenic' : 'wall';
      try {
        localStorage.setItem(BACKDROP_KEY, next);
      } catch {
        /* ignore */
      }
      gameRef.current?.setMenuBackdrop(next);
      return next;
    });
  }, []);
  const mobileUI = displayMode === 'mobile' || (displayMode === 'auto' && isTouchDevice);
  const portrait = useIsPortrait();
  const cycleDisplayMode = () => {
    setDisplayMode((m) => {
      const next: DisplayMode = m === 'auto' ? 'pc' : m === 'pc' ? 'mobile' : 'auto';
      try {
        localStorage.setItem(DISPLAY_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Visual prefs (camera, car style, smoke)
  const [prefs, setPrefs] = useState<VisualPrefs>(initialPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const [panel, setPanel] = useState<PanelKind>('none');
  const panelRef = useRef<PanelKind>('none');
  const playSakuraRef = useRef(onPlaySakuraEbisu);
  playSakuraRef.current = onPlaySakuraEbisu;
  panelRef.current = panel;
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const [showBMWAdjust, setShowBMWAdjust] = useState(false);
  const sakuraShowroom = menuShowroom === 'sakura' && phase === 'menu';
  const showroomChangeRef = useRef(onShowroomChange);
  showroomChangeRef.current = onShowroomChange;
  useEffect(() => {
    gameRef.current?.setSuspended(sakuraShowroom);
    showroomChangeRef.current?.(sakuraShowroom);
  }, [sakuraShowroom]);

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
      venue,
    );
    gameRef.current = game;
    game.setSuspended(menuShowroom === 'sakura' && phaseRef.current === 'menu'); // Sakura showroom owns the screen in the menu
    game.setMenuBackdrop(loadBackdrop());
    game.setTuning(setupRef.current.tuning);
    game.setSlipTuning(setupRef.current.slipTuning);
    game.setSakuraTuning(setupRef.current.sakuraTuning);
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
        case 'ArrowUp':
        case 'KeyW':
          g.input.gas = down;
          break;
        case 'KeyR':
          if (down && panelRef.current === 'none') g.resetToTrack();
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
          if (down && panelRef.current === 'none' && (phaseRef.current === 'menu' || phaseRef.current === 'finished')) {
            // main-menu Enter = hero tile = Sakura RC on the Ebisu circuit; result screen Enter = restart this race
            if (phaseRef.current === 'menu' && playSakuraRef.current) playSakuraRef.current();
            else g.startRace();
          }
          break;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    const blur = () => {
      const g = gameRef.current;
      if (g) {
        g.input.left = g.input.right = g.input.handbrake = g.input.brake = g.input.gas = g.input.boost = false;
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
  }, [addPopup, cycleCamera, handleResult, setPausedBoth, togglePause, venue]);

  const start = () => {
    setPopups([]);
    setPanel('none');
    if (mobileUI) void enterLandscapeFullscreen();
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

  const applySakuraTuning = useCallback((t: SakuraTuning) => {
    const next: GameSetup = { ...setupRef.current, sakuraTuning: t };
    setupRef.current = next;
    saveSetup(next);
    setSetup(next);
    gameRef.current?.setSakuraTuning(t);
  }, []);

  const applyEngine = useCallback(
    (e: EngineKind) => {
      if (setupRef.current.engine === e) return;
      const next: GameSetup = { ...setupRef.current, engine: e };
      setupRef.current = next;
      saveSetup(next);
      setSetup(next);
      gameRef.current?.setEngine(e);
      if (phaseRef.current === 'racing' || phaseRef.current === 'countdown') {
        addPopup(
          e === 'sakura_rc'
            ? '🌸 SAKURA RC PRO ENGINE (GYRO)'
            : e === 'slip'
            ? '🌀 SLIP DRIFT ENGINE'
            : '🕹️ CLASSIC ARCADE ENGINE',
          'info',
        );
      }
    },
    [addPopup],
  );

  const cycleEngine = useCallback(() => {
    const current = setupRef.current.engine;
    const order: EngineKind[] = ['slip', 'sakura_rc', 'classic'];
    const nextIdx = (order.indexOf(current) + 1) % order.length;
    applyEngine(order[nextIdx]);
  }, [applyEngine]);

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
  const applyLighting = useCallback(
    (m: LightingMode) => {
      gameRef.current?.setLighting(m);
      updatePrefs({ lighting: m });
    },
    [updatePrefs],
  );
  const applyFx = useCallback(
    (m: FxMode) => {
      gameRef.current?.setFx(m);
      updatePrefs({ fx: m });
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

  const resetToTrack = useCallback(() => {
    gameRef.current?.resetToTrack();
  }, []);

  const gas = useCallback((down: boolean) => {
    const g = gameRef.current;
    if (g) g.input.gas = down;
  }, []);

  return (
    <div className={cn('relative h-full w-full overflow-hidden', sakuraShowroom ? 'bg-transparent' : 'bg-sky-300')}>
      {/* while the DRIFT KING menu is up, the Sakura RC game (mounted underneath by App) is the backdrop */}
      <canvas ref={canvasRef} className={cn('absolute inset-0 h-full w-full touch-none', sakuraShowroom && 'invisible')} />

      <Hud
        hud={hud}
        minimap={minimap}
        popups={popups}
        onSteer={steer}
        onHandbrake={handbrake}
        onGas={gas}
        onReset={resetToTrack}
        onBoost={boost}
        onPause={() => togglePause(true)}
        onToggleMute={toggleMute}
        onCycleCamera={cycleCamera}
        onCycleEngine={cycleEngine}
        muted={muted}
        isTouch={isTouchDevice}
        layout={mobileUI ? 'mobile' : 'pc'}
      />

      {/* Mobile landscape mode: ask to rotate while in portrait */}
      {mobileUI && portrait && (
        <div className="eb-hud fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-[#07090f]/92 text-center text-white backdrop-blur-md">
          <div className="eb-rotate-icon" aria-hidden>
            <span className="eb-rotate-phone" />
          </div>
          <div className="eb-num text-3xl">PUTAR HP KAMU</div>
          <div className="eb-label !text-xs text-white/70">Mode mobile landscape — mainkan dengan layar mendatar</div>
          <button type="button" onClick={cycleDisplayMode} className="eb-chip mt-2 cursor-pointer">
            Ganti ke mode PC
          </button>
        </div>
      )}

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
          onOpenBMWAdjust={() => setShowBMWAdjust(true)}
          isTouch={isTouchDevice}
          backdrop={sakuraShowroom ? 'scenic' : menuBackdrop}
          onToggleBackdrop={sakuraShowroom ? undefined : toggleBackdrop}
          onPlaySakuraEbisu={onPlaySakuraEbisu}
          venue={venue}
          onChangeVenue={onChangeVenue}
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
          onOpenBMWAdjust={() => setShowBMWAdjust(true)}
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
          onSakuraTuning={applySakuraTuning}
          onRace={applyRace}
          onClose={() => setPanel('none')}
          inRace={phase !== 'menu'}
        />
      )}

      {panel === 'visual' && (
        <VisualPanel prefs={prefs} onCamera={applyCamera} onCarStyle={applyCarStyle} onLighting={applyLighting} onFx={applyFx} onSmoke={applySmoke} onClose={() => setPanel('none')} />
      )}

      {/* Floating Top Buttons: PILIH GAME & ADJUST BODY BMW */}
      <div className={cn('eb-hud fixed top-3 left-3 z-50 flex items-center gap-1.5 sm:left-5 sm:top-4', mobileUI && 'eb-hud--mobile eb-chips-mobile')}>
        {onSwitchGame && (
          <button
            onClick={() => {
              if (gameRef.current) {
                gameRef.current.setPaused(true);
              }
              onSwitchGame();
            }}
            className="eb-chip eb-chip--ghost cursor-pointer"
            title="Buka mode lain: Haruna (a.zip / b.zip), Pro Drift 3D, Sakura RC Pro"
          >
            <span>🎮</span>
            <span>Mode Lain</span>
          </button>
        )}

        <button
          onClick={() => setShowBMWAdjust(true)}
          className="eb-chip eb-chip--ghost eb-chip--accent cursor-pointer"
          title="Atur panjang, lebar, tinggi dan letak ketinggian (offset Y) body BMW GLB"
        >
          <span>Body BMW</span>
        </button>

        <button
          onClick={cycleDisplayMode}
          className={cn('eb-chip eb-chip--ghost cursor-pointer', mobileUI && 'eb-chip--cyan')}
          title="Mode tampilan: Auto / PC / Mobile Landscape"
        >
          <span>{displayMode === 'auto' ? (mobileUI ? '📱' : '🖥') : displayMode === 'pc' ? '🖥' : '📱'}</span>
          <span>{displayMode === 'auto' ? `Auto · ${mobileUI ? 'Mobile' : 'PC'}` : displayMode === 'pc' ? 'PC' : 'Mobile'}</span>
        </button>
      </div>

      {/* BMW GLB Dimensions & Ride Height Adjustment Modal */}
      <BMWAdjustmentModal
        mode={sakuraShowroom ? 'sakura_rc' : 'ebisu'}
        isOpen={showBMWAdjust}
        onClose={() => setShowBMWAdjust(false)}
      />
    </div>
  );
}
