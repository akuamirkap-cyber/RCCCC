import * as THREE from 'three';
import { Track, HALF_WIDTH, CURB_WIDTH, WALL_DIST } from './track';
import { buildWorld, SUN_OFFSET, type WorldRefs } from './world';
import { createCar, disposeCar, setBrakeLights, type CarModel } from './car';
import { SkidMarks, Smoke, type WheelAnchor } from './effects';
import { GameAudio } from './audio';
import {
  DEFAULT_ENGINE,
  DEFAULT_RACE,
  DEFAULT_SLIP,
  DEFAULT_TUNING,
  DIFFICULTY_MUL,
  KMH,
  SLIP_KMH,
  engineAccel,
  type CarTuning,
  type EngineKind,
  type RaceSettings,
  type SlipTuning,
} from './tuning';
import { computeDriftZones, nextZoneDistances, zoneLookup, zoneStars, type DriftZone } from './zones';
import { DEFAULT_PREFS, type CameraMode, type CarStyle, type SmokeSettings, type VisualPrefs } from './prefs';
import {
  RAD2DEG,
  botInput,
  collideVehicles,
  createBotBrain,
  createVehicle,
  resetVehicleOnTrack,
  stepVehicle,
  type BotBrain,
  type TrackBounds,
  type VehicleState,
} from './slipEngine';

export type Phase = 'menu' | 'countdown' | 'racing' | 'finished';
export type PopupKind = 'good' | 'great' | 'epic' | 'bad' | 'info' | 'boost' | 'zone';

export interface MiniCar {
  x: number;
  z: number;
  color: string;
  player: boolean;
}

export interface ZoneHud {
  name: string;
  mult: number;
  score: number;
  progress: number; // 0..1 through the zone
  stars: number;
  par: number;
  full: boolean; // drifting nearly the whole zone so far
}

export interface ZoneAheadHud {
  name: string;
  mult: number;
  dist: number; // world units
}

export interface HudState {
  phase: Phase;
  countdown: number; // 3,2,1 ; 0 = GO ; -1 = hidden
  speed: number; // km/h
  lap: number;
  totalLaps: number;
  position: number;
  totalCars: number;
  raceTime: number;
  lapTime: number;
  bestLap: number | null;
  driftScore: number;
  driftChips: number; // raw points of the current drift (before multiplier)
  driftCurrent: number; // chips × combo
  driftTime: number;
  combo: number;
  isDrifting: boolean;
  boost: number; // 0..1 — remaining boost while boosting, else stored meter
  boosting: boolean;
  boostReady: boolean; // stored meter is enough to fire a manual boost
  driftBoost: number; // 0..1 — boost charge this drift will bank when it ends
  offTrack: boolean;
  wrongWay: boolean;
  topSpeed: number; // km/h incl. boost (for the speed bar)
  paused: boolean;
  camera: CameraMode;
  engine: EngineKind;
  slipDeg: number; // current slip angle (slip engine only)
  zone: ZoneHud | null;
  zoneAhead: ZoneAheadHud | null;
  cars: MiniCar[];
}

export interface RaceResult {
  position: number;
  totalCars: number;
  totalTime: number;
  bestLap: number;
  driftScore: number;
  lapTimes: number[];
}

export interface GameCallbacks {
  onHud: (h: HudState) => void;
  onPopup: (text: string, kind: PopupKind) => void;
  onPhase: (phase: Phase, result?: RaceResult) => void;
}

export interface InputState {
  left: boolean;
  right: boolean;
  handbrake: boolean;
  brake: boolean;
  boost: boolean; // manual boost trigger (SHIFT / boost button)
}

/** Fixed constants. Everything speed/handling related lives in the tunings (see tuning.ts). */
const CFG = {
  drag: 0.12, // classic: coasting drag (no throttle)
  turn: 1.35, // classic: base steering rates, multiplied by tuning.handling
  turnDrift: 1.6,
  turnHand: 1.95,
  handGripFactor: 0.55, // classic: handbrake grip = driftGrip × factor
  driftEnter: 5,
  driftExit: 1.8,
  scrub: 0.25,
  grassSpeed: 20, // m/s ≈ 72 km/h — matches the slip engine's 0.4 × top grass cap
  chipsRate: 12, // classic: points per unit of lateral speed per second
  slipChipsRate: 0.16, // slip: points per (degree of slip × unit of speed) per second
  boostMaxTime: 2.6, // seconds of boost at a full meter
  boostMinMeter: 0.2, // minimum stored charge needed to fire a manual boost
  collideRadius: 1.15,
  playerColor: 0xff5a1f,
  aiColors: [0x2f80ff, 0x27c26a, 0xb455f5],
  aiRatios: [0.8, 0.735, 0.67], // rival base speed relative to the player's top speed
};

const BOUNDS: TrackBounds = { halfWidth: HALF_WIDTH + CURB_WIDTH * 0.7, wall: WALL_DIST };

/** Robust handling used by the bots in the slip engine (top speed / accel follow the player's setup). */
const BOT_SLIP_HANDLING = { turnRate: 3.0, gripNormal: 7, gripDrift: 1.5, driftBoost: 1.6, handbrake: 1.4, align: 3.0 };

interface PlayerState {
  x: number;
  z: number;
  angle: number;
  vx: number;
  vz: number;
  vf: number;
  vl: number;
  speed: number;
  steer: number;
  yawRate: number;
  roll: number;
  drifting: boolean;
  driftTime: number;
  driftPoints: number;
  driftRate: number; // points per second while drifting (engine specific)
  smokeIntensity: number;
  combo: number;
  boostTime: number;
  boostMax: number;
  boostMeter: number; // 0..1 stored charge, filled by drifts, spent by manual boost
  boostWasDown: boolean; // previous frame's boost input (rising-edge trigger)
  lastIdx: number;
  progress: number;
  lapsDone: number;
  offTrack: boolean;
  wrongWayTime: number;
  finished: boolean;
  finishOrder: number;
  lapStart: number;
  lapTimes: number[];
  smokeAcc: number;
  zoneIdx: number;
  zoneScore: number;
  zoneTime: number;
  zoneDriftTime: number;
  veh: VehicleState; // slip engine state
}

interface AICar {
  model: CarModel;
  color: number;
  progress: number;
  speed: number;
  base: number;
  lane: number;
  laneTarget: number;
  laneTimer: number;
  x: number;
  z: number;
  angle: number;
  lean: number;
  curv: number;
  finished: boolean;
  finishOrder: number;
  smokeAcc: number;
  drifting: boolean;
  braking: boolean;
  // slip engine
  veh: VehicleState;
  brain: BotBrain;
  lastIdx: number;
  stuck: number;
  wrongDir: number;
}

function hex(c: number) {
  return '#' + c.toString(16).padStart(6, '0');
}

export class Game {
  readonly input: InputState = { left: false, right: false, handbrake: false, brake: false, boost: false };
  readonly track: Track;
  readonly zones: DriftZone[];
  readonly audio = new GameAudio();

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private world: WorldRefs;
  private playerModel: CarModel;
  private player!: PlayerState;
  private ais: AICar[] = [];
  private skid = new SkidMarks();
  private smoke = new Smoke();
  private clock = new THREE.Clock();
  private raf = 0;
  private time = 0;
  private raceTime = 0;
  private phase: Phase = 'menu';
  private countdownT = 0;
  private lastCountdownShown = 99;
  private driftScore = 0;
  private finishCounter = 0;
  private hudAcc = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shake = 0;
  private lastWrongWayPopup = -10;
  private resizeObs: ResizeObserver | null = null;
  private disposed = false;
  private engine: EngineKind = DEFAULT_ENGINE;
  private tuning: CarTuning = { ...DEFAULT_TUNING };
  private slipTuning: SlipTuning = { ...DEFAULT_SLIP };
  private race: RaceSettings = { ...DEFAULT_RACE };
  private paused = false;
  private zoneOf: Int16Array;
  private nextZone: Int16Array;
  private prefs: VisualPrefs = { ...DEFAULT_PREFS, smoke: { ...DEFAULT_PREFS.smoke } };
  private camRallyYaw = 0;
  private camFov = 62;
  private wheelSmokeAcc = 0;
  /** Live rear-wheel positions (left, right) used by the swirling wheel-spin smoke. */
  private rearAnchors: [WheelAnchor, WheelAnchor] = [
    { x: 0, y: 0.4, z: 0, axX: 1, axZ: 0 },
    { x: 0, y: 0.4, z: 0, axX: 1, axZ: 0 },
  ];

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: GameCallbacks,
    initialPrefs?: VisualPrefs,
  ) {
    if (initialPrefs) this.prefs = { ...initialPrefs, smoke: { ...initialPrefs.smoke } };
    this.track = new Track();
    this.zones = computeDriftZones(this.track, 4);
    this.zoneOf = zoneLookup(this.track, this.zones);
    this.nextZone = nextZoneDistances(this.track, this.zoneOf);

    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.6 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.5, 2000);
    this.world = buildWorld(this.scene, this.track, this.renderer, this.zones);
    this.sun = this.world.sun;
    if (isMobile) {
      this.sun.shadow.mapSize.set(1024, 1024);
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    }
    this.scene.add(this.skid.mesh);
    this.scene.add(this.smoke.group);

    this.playerModel = createCar(CFG.playerColor, this.prefs.carStyle);
    this.scene.add(this.playerModel.group);
    this.smoke.setTuning(this.prefs.smoke);
    CFG.aiColors.forEach((color) => {
      const model = createCar(color, this.prefs.carStyle);
      this.scene.add(model.group);
      this.ais.push({
        model,
        color,
        progress: 0,
        speed: 0,
        base: 0,
        lane: 0,
        laneTarget: 0,
        laneTimer: 2,
        x: 0,
        z: 0,
        angle: 0,
        lean: 0,
        curv: 0,
        finished: false,
        finishOrder: 0,
        smokeAcc: 0,
        drifting: false,
        braking: false,
        veh: createVehicle(0, 0, 0, 0),
        brain: createBotBrain(),
        lastIdx: 0,
        stuck: 0,
        wrongDir: 0,
      });
    });

    this.applyAiSpeeds();
    this.resetGrid();
    this.phase = 'menu';
    this.handleResize();
    this.resizeObs = new ResizeObserver(() => this.handleResize());
    this.resizeObs.observe(canvas.parentElement ?? canvas);

    const p = this.player;
    this.camPos.set(p.x + 10, 4, p.z + 6);
    this.camLook.set(p.x, 0.8, p.z);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.clock.start();
    this.raf = requestAnimationFrame(this.tick);
  }

  getMinimap() {
    const b = this.track.bounds;
    return {
      path: this.track.svgPath(3),
      minX: b.minX,
      minZ: b.minZ,
      w: b.maxX - b.minX,
      h: b.maxZ - b.minZ,
      zones: this.zones.map((z) => ({ path: this.track.svgPathRange(z.start, z.len, 2), color: z.color })),
    };
  }

  setMuted(m: boolean) {
    this.audio.setMuted(m);
  }

  // ---------------- Engine / tuning / settings / pause ----------------

  getEngine(): EngineKind {
    return this.engine;
  }

  /** Switches the physics engine — works mid-race, cars keep their position & momentum. */
  setEngine(kind: EngineKind) {
    if (this.engine === kind) return;
    this.engine = kind;
    this.syncEngineSwitch();
    this.applyAiSpeeds();
    this.emitHud(true);
  }

  getTuning(): CarTuning {
    return { ...this.tuning };
  }

  /** Applies new classic-engine parameters immediately (also mid-race). */
  setTuning(t: CarTuning) {
    this.tuning = { ...t };
    this.applyAiSpeeds();
    this.emitHud(true);
  }

  getSlipTuning(): SlipTuning {
    return { ...this.slipTuning };
  }

  setSlipTuning(t: SlipTuning) {
    this.slipTuning = { ...t };
    this.applyAiSpeeds();
    this.emitHud(true);
  }

  getRaceSettings(): RaceSettings {
    return { ...this.race };
  }

  setRaceSettings(s: RaceSettings) {
    this.race = { ...s };
    this.applyAiSpeeds();
    this.emitHud(true);
  }

  get isPaused() {
    return this.paused;
  }

  setPaused(v: boolean) {
    if (v && this.phase !== 'racing' && this.phase !== 'countdown') return;
    if (this.paused === v) return;
    this.paused = v;
    if (v) {
      this.input.left = this.input.right = this.input.handbrake = this.input.brake = this.input.boost = false;
      this.audio.setEngine(0, 0, false);
      this.audio.setDrift(0);
    }
    this.clock.getDelta();
    this.emitHud(true);
  }

  // ---------------- Visual prefs: camera / smoke / car style ----------------

  getPrefs(): VisualPrefs {
    return { ...this.prefs, smoke: { ...this.prefs.smoke } };
  }

  setCamera(mode: CameraMode) {
    if (this.prefs.camera === mode) return;
    this.prefs.camera = mode;
    this.camRallyYaw = this.player.angle;
    this.updateCockpitVisibility();
    this.emitHud(true);
  }

  cycleCamera(): CameraMode {
    const order: CameraMode[] = ['rally', 'chase', 'cockpit', 'far'];
    const next = order[(order.indexOf(this.prefs.camera) + 1) % order.length];
    this.setCamera(next);
    return next;
  }

  setSmoke(s: SmokeSettings) {
    this.prefs.smoke = { ...s };
    this.smoke.setTuning(s);
  }

  /** Rebuilds every car with the new proportions (safe mid-race: positions are re-applied each frame). */
  setCarStyle(style: CarStyle) {
    if (this.prefs.carStyle === style) return;
    this.prefs.carStyle = style;
    const p = this.player;
    disposeCar(this.playerModel);
    this.playerModel = createCar(CFG.playerColor, style);
    this.playerModel.group.position.set(p.x, 0, p.z);
    this.playerModel.group.rotation.y = p.angle;
    this.scene.add(this.playerModel.group);
    for (const ai of this.ais) {
      disposeCar(ai.model);
      ai.model = createCar(ai.color, style);
      ai.model.group.position.set(ai.x, 0, ai.z);
      ai.model.group.rotation.y = ai.angle;
      this.scene.add(ai.model.group);
    }
    this.updateCockpitVisibility();
  }

  private updateCockpitVisibility() {
    const cockpit = this.prefs.camera === 'cockpit' && this.phase !== 'menu';
    for (const o of this.playerModel.cockpitHidden) o.visible = !cockpit;
    const near = cockpit ? 0.2 : 0.5;
    if (this.camera.near !== near) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
  }

  // ---------------- Engine-aware helpers ----------------

  /** Internal speed unit → km/h for the active engine. */
  private get kmh() {
    return this.engine === 'slip' ? SLIP_KMH : KMH;
  }

  private get activeTop(): { maxSpeed: number; boostPower: number } {
    return this.engine === 'slip' ? this.slipTuning : this.tuning;
  }

  /** Player top speed in internal units. */
  private get vmax() {
    return this.activeTop.maxSpeed / this.kmh;
  }

  /** Rival pace scales with the player's top speed and the chosen difficulty. */
  private applyAiSpeeds() {
    const mul = DIFFICULTY_MUL[this.race.difficulty];
    this.ais.forEach((ai, i) => {
      ai.base = this.vmax * CFG.aiRatios[i] * mul;
    });
  }

  /** Bot tuning for the slip engine: player's speed & power, robust handling. */
  private botSlipTuning(): SlipTuning {
    return { ...this.slipTuning, ...BOT_SLIP_HANDLING };
  }

  /** Carries positions and momentum across an engine switch (rails ⇄ physics). */
  private syncEngineSwitch() {
    const p = this.player;
    if (this.engine === 'slip') {
      const v = p.veh;
      v.x = p.x;
      v.z = p.z;
      v.heading = p.angle;
      v.vx = p.vx;
      v.vz = p.vz;
      v.angVel = p.yawRate;
      v.steer = p.steer;
      v.drifting = p.drifting;
      v.onGrass = p.offTrack;
      v.slip = 0;
      v.hitCooldown = 0;
      v.idx = this.track.nearestIndex(p.x, p.z, -1);
      for (const ai of this.ais) {
        const av = ai.veh;
        av.x = ai.x;
        av.z = ai.z;
        av.heading = ai.angle;
        av.vx = Math.sin(ai.angle) * ai.speed;
        av.vz = Math.cos(ai.angle) * ai.speed;
        av.angVel = 0;
        av.steer = 0;
        av.drifting = false;
        av.onGrass = false;
        av.slip = 0;
        av.hitCooldown = 0;
        av.idx = this.track.nearestIndex(ai.x, ai.z, -1);
        ai.lastIdx = av.idx;
        ai.brain = createBotBrain();
        ai.stuck = 0;
        ai.wrongDir = 0;
      }
    } else {
      for (const ai of this.ais) {
        ai.lane = THREE.MathUtils.clamp(ai.veh.lateralOffset, -3.6, 3.6);
        ai.laneTarget = ai.lane;
        ai.speed = Math.max(0, ai.veh.fwd);
        ai.lean = 0;
      }
    }
  }

  private handleResize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private gridSlot(slot: number) {
    const n = this.track.count;
    const idx = n - 6 - slot * 5;
    const s = this.track.samples[idx];
    const lane = slot % 2 === 0 ? -3.2 : 3.2;
    return { idx, x: s.x + s.rx * lane, z: s.z + s.rz * lane, angle: s.angle, lane, progress: idx - n };
  }

  private resetGrid() {
    const n = this.track.count;
    this.ais.forEach((ai, i) => {
      const g = this.gridSlot(i);
      ai.progress = g.progress;
      ai.speed = 0;
      ai.lane = g.lane;
      ai.laneTarget = g.lane;
      ai.laneTimer = 3 + i * 2;
      ai.x = g.x;
      ai.z = g.z;
      ai.angle = g.angle;
      ai.lean = 0;
      ai.curv = 0;
      ai.finished = false;
      ai.finishOrder = 0;
      ai.smokeAcc = 0;
      ai.drifting = false;
      ai.braking = false;
      ai.veh = createVehicle(g.x, g.z, g.angle, g.idx);
      ai.brain = createBotBrain();
      ai.lastIdx = g.idx;
      ai.stuck = 0;
      ai.wrongDir = 0;
      ai.model.group.position.set(g.x, 0, g.z);
      ai.model.group.rotation.y = g.angle;
      setBrakeLights(ai.model, false, 0);
    });
    const g = this.gridSlot(3);
    this.player = {
      x: g.x,
      z: g.z,
      angle: g.angle,
      vx: 0,
      vz: 0,
      vf: 0,
      vl: 0,
      speed: 0,
      steer: 0,
      yawRate: 0,
      roll: 0,
      drifting: false,
      driftTime: 0,
      driftPoints: 0,
      driftRate: 0,
      smokeIntensity: 0,
      combo: 1,
      boostTime: 0,
      boostMax: 1,
      boostMeter: 0,
      boostWasDown: false,
      lastIdx: g.idx,
      progress: g.idx - n,
      lapsDone: 0,
      offTrack: false,
      wrongWayTime: 0,
      finished: false,
      finishOrder: 0,
      lapStart: 0,
      lapTimes: [],
      smokeAcc: 0,
      zoneIdx: -1,
      zoneScore: 0,
      zoneTime: 0,
      zoneDriftTime: 0,
      veh: createVehicle(g.x, g.z, g.angle, g.idx),
    };
    this.playerModel.group.position.set(g.x, 0, g.z);
    this.playerModel.group.rotation.y = g.angle;
    this.playerModel.body.rotation.set(0, 0, 0);
    this.playerModel.flames.forEach((f) => (f.visible = false));
    setBrakeLights(this.playerModel, false, 0);
    this.driftScore = 0;
    this.raceTime = 0;
    this.finishCounter = 0;
    this.skid.reset();
    this.smoke.reset();
  }

  startRace() {
    this.audio.init();
    this.paused = false;
    this.resetGrid();
    this.phase = 'countdown';
    this.countdownT = 3.0;
    this.lastCountdownShown = 99;
    this.camRallyYaw = this.player.angle;
    this.updateCockpitVisibility();
    this.cb.onPhase('countdown');
    this.emitHud(true);
  }

  backToMenu() {
    this.paused = false;
    this.resetGrid();
    this.phase = 'menu';
    this.updateCockpitVisibility();
    this.cb.onPhase('menu');
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.audio.dispose();
    this.renderer.dispose();
  }

  private tick = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.033, this.clock.getDelta());
    if (!this.paused) {
      this.time += dt;
      this.update(dt);
    }
    this.world.update(dt); // ambient scenery keeps moving even while paused
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    if (this.phase === 'countdown') {
      this.countdownT -= dt;
      const shown = this.countdownT > 0 ? Math.ceil(this.countdownT) : 0;
      if (shown !== this.lastCountdownShown) {
        this.lastCountdownShown = shown;
        if (shown <= 3) this.audio.beep(shown === 0);
      }
      if (this.countdownT <= 0) {
        this.phase = 'racing';
        this.raceTime = 0;
        this.player.lapStart = 0;
        this.cb.onPhase('racing');
      }
    } else if (this.phase === 'racing') {
      this.raceTime += dt;
    }

    if (this.phase !== 'menu') {
      if (this.phase === 'countdown') {
        this.updatePlayerVisuals(dt);
      } else {
        if (this.engine === 'slip') this.stepPlayerSlip(dt);
        else this.stepPlayerClassic(dt);
        this.ais.forEach((ai, i) => (this.engine === 'slip' ? this.stepAISlip(ai, i, dt) : this.stepAIClassic(ai, i, dt)));
        this.handleCollisions();
        this.updatePlayerProgress(dt);
        this.updatePlayerVisuals(dt);
        this.ais.forEach((ai, i) => this.updateAIVisuals(ai, i, dt));
      }
    }

    this.smoke.update(dt);
    this.updateCamera(dt);
    this.updateAudio();

    const p = this.player;
    this.sun.position.set(p.x + SUN_OFFSET.x, SUN_OFFSET.y, p.z + SUN_OFFSET.z);
    this.sun.target.position.set(p.x, 0, p.z);
    this.sun.target.updateMatrixWorld();

    this.hudAcc += dt;
    if (this.hudAcc >= 0.05) {
      this.hudAcc = 0;
      this.emitHud();
    }
  }

  // ---------------- Drift scoring ----------------

  private endDrift(lost: boolean) {
    const p = this.player;
    if (!p.drifting) return;
    p.drifting = false;
    const combo = lost ? 1 : p.combo;
    const banked = Math.round(p.driftPoints * combo);
    if (this.phase === 'racing' && banked >= 40) {
      this.driftScore += banked;
      let label = `+${banked}`;
      let kind: PopupKind = 'good';
      if (!lost) {
        if (p.driftTime > 2.6) {
          label = `PERFECT DRIFT  +${banked}`;
          kind = 'epic';
        } else if (p.driftTime > 1.5) {
          label = `GREAT DRIFT  +${banked}`;
          kind = 'great';
        } else if (p.driftTime > 0.8) {
          label = `NICE  +${banked}`;
        }
      }
      this.cb.onPopup(label, kind);
      this.audio.score(combo);
      if (!lost && p.driftTime > 0.8) {
        // manual boost: a finished drift charges the meter, it never fires by itself
        const gain = Math.min(CFG.boostMaxTime, p.driftTime * 0.7) / CFG.boostMaxTime;
        const wasFull = p.boostMeter >= 1;
        p.boostMeter = Math.min(1, p.boostMeter + gain);
        if (p.boostMeter >= 1 && !wasFull) {
          this.cb.onPopup('BOOST READY!', 'boost');
          this.audio.boostReady();
        } else {
          this.cb.onPopup(`BOOST +${Math.round(gain * 100)}%`, 'boost');
        }
      }
    }
    p.driftPoints = 0;
    p.driftTime = 0;
    p.combo = 1;
  }

  private enterZone(zi: number) {
    const p = this.player;
    const z = this.zones[zi];
    p.zoneIdx = zi;
    p.zoneScore = 0;
    p.zoneTime = 0;
    p.zoneDriftTime = 0;
    this.cb.onPopup(`${z.name}  ×${z.mult}`, 'zone');
    this.audio.zoneEnter();
  }

  private zoneFull(p: PlayerState) {
    return p.zoneTime > 0.3 && p.zoneDriftTime / p.zoneTime >= 0.8;
  }

  private exitZone() {
    const p = this.player;
    if (p.zoneIdx < 0) return;
    const z = this.zones[p.zoneIdx];
    p.zoneIdx = -1;
    const banked = Math.round(p.zoneScore);
    if (banked < 25) {
      if (this.phase === 'racing') this.cb.onPopup('ZONE MISSED', 'bad');
      return;
    }
    const stars = zoneStars(banked, z.par);
    const full = this.zoneFull(p);
    this.driftScore += banked;
    this.cb.onPopup(`${z.name} ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}  +${banked}`, stars === 3 ? 'epic' : 'zone');
    if (full && stars >= 2) {
      const bonus = Math.round(banked * 0.25);
      this.driftScore += bonus;
      this.cb.onPopup(`FULL DRIFT  +${bonus}`, 'epic');
    }
    this.audio.zoneClear(stars);
  }

  // ---------------- Manual boost (SHIFT / boost button) ----------------

  /**
   * Manual boost: drifts only charge the meter — boost fires solely on a fresh
   * press of the boost input, and only while racing with enough stored charge.
   * Returns whether boost is currently active (after draining this frame).
   */
  private updateBoost(dt: number): boolean {
    const p = this.player;
    const racing = this.phase === 'racing' && !p.finished;
    const down = racing && this.input.boost;
    const pressed = down && !p.boostWasDown;
    p.boostWasDown = down;
    if (p.boostTime > 0) {
      p.boostTime = Math.max(0, p.boostTime - dt);
      return p.boostTime > 0;
    }
    if (pressed && p.boostMeter >= CFG.boostMinMeter) {
      p.boostTime = Math.max(0.6, p.boostMeter * CFG.boostMaxTime);
      p.boostMax = p.boostTime;
      p.boostMeter = 0;
      this.audio.boost();
      this.cb.onPopup('BOOST!', 'boost');
      return true;
    }
    return false;
  }

  // ---------------- Player: classic engine ----------------

  private stepPlayerClassic(dt: number) {
    const p = this.player;
    const inp = this.input;
    const tune = this.tuning;
    const racing = this.phase === 'racing';
    const steerTarget = racing ? (inp.right ? 1 : 0) - (inp.left ? 1 : 0) : 0;
    p.steer += (steerTarget - p.steer) * Math.min(1, dt * 9);
    const hand = racing && inp.handbrake;
    const brake = racing && inp.brake;

    let fx = Math.sin(p.angle);
    let fz = Math.cos(p.angle);
    let rx = Math.cos(p.angle);
    let rz = -Math.sin(p.angle);
    let vf = p.vx * fx + p.vz * fz;
    let vl = p.vx * rx + p.vz * rz;
    const speed = Math.hypot(p.vx, p.vz);

    const boosting = this.updateBoost(dt);

    // drift state machine
    const absVl = Math.abs(vl);
    if (!p.drifting) {
      if (racing && !p.offTrack && (absVl > CFG.driftEnter || (hand && speed > 6))) {
        p.drifting = true;
        p.driftTime = 0;
        p.driftPoints = 0;
        p.combo = 1;
      }
    } else if ((absVl < CFG.driftExit && !hand) || !racing || speed < 4) {
      this.endDrift(false);
    } else if (p.offTrack) {
      this.endDrift(true);
    }

    // yaw — in a y-up right-handed world a positive heading change turns the car LEFT,
    // so steering right (+1) must DECREASE the heading.
    const speedFactor = Math.min(1, Math.abs(vf) / 10) * (vf < -0.5 ? -1 : 1);
    const turnRate = (hand ? CFG.turnHand : p.drifting ? CFG.turnDrift : CFG.turn) * tune.handling;
    const yaw = -p.steer * turnRate * speedFactor;
    p.angle += yaw * dt;
    p.yawRate = yaw;
    fx = Math.sin(p.angle);
    fz = Math.cos(p.angle);
    rx = Math.cos(p.angle);
    rz = -Math.sin(p.angle);
    vf = p.vx * fx + p.vz * fz;
    vl = p.vx * rx + p.vz * rz;

    // engine / brakes — the tuned top speed is really reached (drag only applies off-throttle)
    const vmax = this.vmax;
    const maxSpeed = boosting ? vmax + tune.boostPower / KMH : vmax;
    if (racing && !brake) {
      if (vf < maxSpeed) {
        vf = Math.min(maxSpeed, vf + engineAccel(vf, boosting ? tune.accel * 1.5 : tune.accel, maxSpeed) * dt);
      } else {
        vf -= (vf - maxSpeed) * 1.2 * dt;
      }
    } else {
      vf -= vf * CFG.drag * dt;
    }
    if (brake) {
      if (vf > 0.3) vf -= tune.brake * dt;
      else vf = Math.max(-7, vf - 6 * dt);
    }
    if (hand) vf -= vf * 0.9 * dt;
    if (!racing) vf -= vf * 0.6 * dt;
    if (p.offTrack) {
      vf -= vf * 1.6 * dt;
      if (vf > CFG.grassSpeed) vf -= (vf - CFG.grassSpeed) * 4 * dt;
    }

    // lateral grip
    let grip = hand ? tune.driftGrip * CFG.handGripFactor : p.drifting ? tune.driftGrip + (1 - Math.abs(p.steer)) * 2.5 : tune.grip;
    if (p.offTrack) grip *= 0.6;
    vl *= Math.exp(-grip * dt);
    if (p.drifting) vf -= Math.abs(vl) * CFG.scrub * dt;

    p.vx = fx * vf + rx * vl;
    p.vz = fz * vf + rz * vl;
    p.x += p.vx * dt;
    p.z += p.vz * dt;

    // track constraints
    const idx = this.track.nearestIndex(p.x, p.z, p.lastIdx);
    const s = this.track.samples[idx];
    const lat = (p.x - s.x) * s.rx + (p.z - s.z) * s.rz;
    const absLat = Math.abs(lat);
    p.offTrack = absLat > BOUNDS.halfWidth;
    if (absLat > WALL_DIST) {
      const over = absLat - WALL_DIST;
      const sg = Math.sign(lat);
      p.x -= s.rx * over * sg;
      p.z -= s.rz * over * sg;
      const vn = p.vx * s.rx + p.vz * s.rz;
      if (vn * sg > 0) {
        p.vx -= s.rx * vn * 1.4;
        p.vz -= s.rz * vn * 1.4;
        p.vx *= 0.7;
        p.vz *= 0.7;
        this.onHit(Math.abs(vn));
      }
    }

    p.speed = Math.hypot(p.vx, p.vz);
    p.vf = vf;
    p.vl = vl;
    p.driftRate = Math.abs(vl) * CFG.chipsRate;
    p.smokeIntensity = Math.min(1, Math.abs(vl) / 14);
  }

  // ---------------- Player: slip engine ----------------

  private stepPlayerSlip(dt: number) {
    const p = this.player;
    const v = p.veh;
    const inp = this.input;
    const racing = this.phase === 'racing';
    const boosting = this.updateBoost(dt);
    const base = this.slipTuning;
    const tune: SlipTuning = boosting ? { ...base, maxSpeed: base.maxSpeed + base.boostPower, accel: base.accel * 1.5 } : base;
    const res = stepVehicle(
      v,
      {
        steerTarget: racing ? (inp.right ? 1 : 0) - (inp.left ? 1 : 0) : 0,
        throttle: inp.brake ? -0.6 : 1,
        handbrake: inp.handbrake,
        active: racing,
      },
      tune,
      this.track,
      BOUNDS,
      dt,
    );
    // scoring drift state follows the engine's hysteresis (never on grass)
    const wantDrift = racing && v.drifting && !v.onGrass && v.speed > 4;
    if (wantDrift && !p.drifting) {
      p.drifting = true;
      p.driftTime = 0;
      p.driftPoints = 0;
      p.combo = 1;
    } else if (!wantDrift && p.drifting) {
      this.endDrift(v.onGrass && v.drifting);
    }
    this.syncPlayerFromVehicle();
    p.driftRate = Math.abs(v.slip) * RAD2DEG * v.speed * CFG.slipChipsRate;
    p.smokeIntensity = v.smokeIntensity;
    if (res.hit > 0) this.onHit(res.hit);
  }

  private syncPlayerFromVehicle() {
    const p = this.player;
    const v = p.veh;
    p.x = v.x;
    p.z = v.z;
    p.angle = v.heading;
    p.vx = v.vx;
    p.vz = v.vz;
    p.vf = v.fwd;
    p.vl = -v.lat; // legacy convention: lateral speed along the car's left vector
    p.speed = v.speed;
    p.steer = v.steer;
    p.yawRate = v.angVel;
    p.offTrack = v.onGrass;
  }

  // ---------------- Shared: progress, laps, zones, drift points ----------------

  private updatePlayerProgress(dt: number) {
    const p = this.player;
    const racing = this.phase === 'racing';
    const n = this.track.count;
    const idx = this.track.nearestIndex(p.x, p.z, p.lastIdx, 50);
    const s = this.track.samples[idx];
    let d = idx - p.lastIdx;
    if (d > n / 2) d -= n;
    else if (d < -n / 2) d += n;
    p.progress += d;
    p.lastIdx = idx;

    if (racing) {
      const along = p.vx * s.tx + p.vz * s.tz;
      if (along < -3) p.wrongWayTime += dt;
      else if (along > 1) p.wrongWayTime = 0;
      if (p.wrongWayTime > 1.2 && this.time - this.lastWrongWayPopup > 2.5) {
        this.lastWrongWayPopup = this.time;
        this.cb.onPopup('WRONG WAY!', 'bad');
      }
      const lapsNow = Math.floor(p.progress / n);
      if (lapsNow > p.lapsDone && lapsNow >= 1) {
        p.lapsDone = lapsNow;
        const lapTime = this.raceTime - p.lapStart;
        p.lapTimes.push(lapTime);
        p.lapStart = this.raceTime;
        if (p.lapsDone >= this.race.laps) {
          this.finishRace();
        } else {
          this.audio.lap();
          this.cb.onPopup(p.lapsDone === this.race.laps - 1 ? 'FINAL LAP!' : `LAP ${p.lapsDone + 1}`, 'info');
        }
      }
    }

    // drift points (chips × combo)
    if (p.drifting && racing) {
      p.driftTime += dt;
      p.driftPoints += p.driftRate * dt;
      p.combo = Math.min(5, 1 + Math.floor(p.driftTime / 1.2));
    }

    // drift zones
    if (racing && !p.finished) {
      const zi = this.zoneOf[idx];
      if (zi !== p.zoneIdx) {
        if (p.zoneIdx >= 0) this.exitZone();
        if (zi >= 0) this.enterZone(zi);
      }
      if (p.zoneIdx >= 0) {
        p.zoneTime += dt;
        if (p.drifting) {
          p.zoneScore += p.driftRate * dt * this.zones[p.zoneIdx].mult;
          p.zoneDriftTime += dt;
        }
      }
    }
  }

  private updatePlayerVisuals(dt: number) {
    const p = this.player;
    const m = this.playerModel;
    m.group.position.set(p.x, 0, p.z);
    m.group.rotation.y = p.angle;
    const rollTarget = THREE.MathUtils.clamp(p.yawRate * p.vf * 0.012 - p.vl * 0.008, -0.16, 0.16);
    p.roll += (rollTarget - p.roll) * Math.min(1, dt * 8);
    m.body.rotation.z = p.roll;
    m.body.rotation.x = p.boostTime > 0 ? -0.025 : 0;
    const dims = m.dims;
    const racingNow = this.phase === 'racing';
    // rear wheels spin faster while sliding / boosting (wheel-spin), front wheels roll with the road
    const wheelSpinRate = racingNow && (p.drifting || p.boostTime > 0) ? p.vf / dims.wheelRadius + 12 : p.vf / dims.wheelRadius;
    m.wheels.forEach((w, i) => (w.rotation.x += (i < 2 ? p.vf / dims.wheelRadius : wheelSpinRate) * dt));
    // positive rotation.y points a wheel to the car's left, so mirror the steer input
    m.frontWheels.forEach((w) => (w.rotation.y = -p.steer * 0.45));
    m.steeringWheel.rotation.z = -p.steer * 1.4;
    const boosting = p.boostTime > 0;
    m.flames.forEach((f, i) => {
      f.visible = boosting;
      if (boosting) {
        const s = 0.7 + Math.random() * 0.6;
        f.scale.set(s, 0.8 + Math.random() * 0.8, s);
        f.rotation.z = Math.random() * 0.3 * (i ? 1 : -1);
      }
    });
    const braking = racingNow && (this.input.brake || this.input.handbrake);
    setBrakeLights(m, braking, this.time);

    // tire marks & smoke
    const fx = Math.sin(p.angle), fz = Math.cos(p.angle);
    const rx = Math.cos(p.angle), rz = -Math.sin(p.angle);
    const marking = p.drifting && !p.offTrack && racingNow;
    const wheelsLocal: [number, number][] = [
      [-dims.halfWidth, -dims.wheelBase],
      [dims.halfWidth, -dims.wheelBase],
    ];
    wheelsLocal.forEach(([lx, lz], i) => {
      const wx = p.x + rx * lx + fx * lz;
      const wz = p.z + rz * lx + fz * lz;
      this.skid.update(`p${i}`, wx, wz, marking, dims.wheelRadius * 0.9);
      const an = this.rearAnchors[i];
      an.x = wx;
      an.y = dims.wheelRadius;
      an.z = wz;
      an.axX = rx;
      an.axZ = rz;
    });
    const smokeAmount = this.prefs.smoke.amount;
    if (smokeAmount > 0 && (marking || (p.offTrack && p.speed > 8))) {
      const intensity = Math.min(1.3, p.smokeIntensity + (p.offTrack ? 0.3 : 0));
      // 1) slide smoke, thrown sideways (against the slide) and backwards
      p.smokeAcc += dt * (34 + intensity * 46) * smokeAmount;
      const slideDir = Math.sign(p.vl) || 1;
      const sx = -rx * slideDir * 3 - fx * 2.5;
      const sz = -rz * slideDir * 3 - fz * 2.5;
      while (p.smokeAcc >= 1) {
        p.smokeAcc -= 1;
        const [lx, lz] = wheelsLocal[Math.random() < 0.5 ? 0 : 1];
        const wx = p.x + rx * lx + fx * lz;
        const wz = p.z + rz * lx + fz * lz;
        this.smoke.emit(wx, 0.25, wz, sx, sz, 0.6 + intensity * 0.7);
      }
      // 2) wheel-spin smoke swirling around the spinning rear tires (follows the live wheel anchors)
      if (this.prefs.smoke.wheelSpin && marking) {
        this.wheelSmokeAcc += dt * (22 + intensity * 26) * smokeAmount;
        const omega = -Math.min(18, Math.abs(wheelSpinRate) * 0.4);
        while (this.wheelSmokeAcc >= 1) {
          this.wheelSmokeAcc -= 1;
          const anchor = this.rearAnchors[Math.random() < 0.5 ? 0 : 1];
          this.smoke.emitSwirl(anchor, dims.wheelRadius, omega, -fx * 4 - rx * slideDir * 1.5, -fz * 4 - rz * slideDir * 1.5, 0.5 + intensity * 0.6);
        }
      }
    }
  }

  private onHit(strength: number, wall = true) {
    this.shake = Math.min(1, this.shake + strength * 0.04 + 0.15);
    this.audio.hit(strength);
    const p = this.player;
    if (wall && p.drifting) this.endDrift(true);
    if (wall && p.zoneIdx >= 0 && p.zoneScore > 50) {
      p.zoneScore *= 0.5;
      p.zoneDriftTime = 0;
      this.cb.onPopup('CRASH!  ZONE -50%', 'bad');
    }
  }

  // ---------------- AI ----------------

  /** Lane wandering + simple avoidance between the bots (shared by both engines). */
  private updateAILane(ai: AICar, dt: number) {
    const n = this.track.count;
    const wrap = (i: number) => ((i % n) + n) % n;
    ai.laneTimer -= dt;
    if (ai.laneTimer <= 0) {
      ai.laneTimer = 4 + Math.random() * 5;
      ai.laneTarget = (Math.random() * 2 - 1) * 3.6;
    }
    for (const other of this.ais) {
      if (other === ai) continue;
      const da = wrap(Math.round(other.progress - ai.progress));
      if (da < 9 && Math.abs(other.lane - ai.lane) < 2.6) ai.laneTarget = other.lane > 0 ? -3.6 : 3.6;
    }
    ai.lane += (ai.laneTarget - ai.lane) * Math.min(1, dt * 0.9);
  }

  /** Classic engine: bots ride the spline on a lane (no physics). */
  private stepAIClassic(ai: AICar, k: number, dt: number) {
    const n = this.track.count;
    const samples = this.track.samples;
    const wrap = (i: number) => ((i % n) + n) % n;
    const idx = wrap(Math.floor(ai.progress));
    const s = samples[idx];

    let target = ai.base * Math.max(0.62, 1 - s.aheadCurv * 9);
    const gap = this.player.progress - ai.progress;
    if (!this.player.finished) {
      if (gap > 110) target *= 1.16;
      else if (gap < -170) target *= 0.86;
    }
    if (this.raceTime < 0.05 + k * 0.08) target = 0; // staggered launch
    ai.braking = ai.speed > 6 && target < ai.speed - 1.2;
    const response = this.raceTime < 4 ? 2.2 : 1.3;
    ai.speed += (target - ai.speed) * Math.min(1, dt * response);
    ai.progress += (ai.speed * dt) / this.track.spacing;

    this.updateAILane(ai, dt);

    const i0 = wrap(Math.floor(ai.progress));
    const i1 = wrap(i0 + 1);
    const f = ai.progress - Math.floor(ai.progress);
    const a = samples[i0];
    const b = samples[i1];
    const cx = a.x + (b.x - a.x) * f;
    const cz = a.z + (b.z - a.z) * f;
    ai.x = cx + a.rx * ai.lane;
    ai.z = cz + a.rz * ai.lane;
    const leanTarget = a.curv * ai.speed * 0.55;
    ai.lean += (leanTarget - ai.lean) * Math.min(1, dt * 3);
    ai.angle = a.angle + ai.lean;
    ai.curv = a.curv;
    ai.drifting = Math.abs(ai.lean) > 0.16 && ai.speed > 10;
  }

  /** Slip engine: bots are fully simulated with the same stepVehicle as the player. */
  private stepAISlip(ai: AICar, k: number, dt: number) {
    const v = ai.veh;
    const n = this.track.count;
    const samples = this.track.samples;
    const launched = this.raceTime >= 0.05 + k * 0.08;

    this.updateAILane(ai, dt);

    // rubber banding ±16% of the base speed by progress gap to the player
    let rubber = 1;
    if (!this.player.finished) rubber = 1 + THREE.MathUtils.clamp((this.player.progress - ai.progress) / 400, -0.16, 0.16);
    const s = samples[v.idx];
    const targetSpeed = ai.base * rubber * Math.max(0.62, 1 - s.aheadCurv * 9);

    const input = botInput(v, ai.brain, this.track, ai.lane, targetSpeed, dt);
    if (!launched) {
      input.throttle = 0;
      input.handbrake = false;
    }
    stepVehicle(v, input, this.botSlipTuning(), this.track, BOUNDS, dt);

    // progress
    let d = v.idx - ai.lastIdx;
    if (d > n / 2) d -= n;
    else if (d < -n / 2) d += n;
    ai.progress += d;
    ai.lastIdx = v.idx;

    // recovery: stuck against a wall or facing the wrong way for a while → back onto the lane
    if (launched) {
      const s2 = samples[v.idx];
      const along = v.vx * s2.tx + v.vz * s2.tz;
      ai.stuck = v.speed < 2.5 ? ai.stuck + dt : 0;
      ai.wrongDir = along < -1.5 ? ai.wrongDir + dt : 0;
      if (ai.stuck > 2 || ai.wrongDir > 2.5) {
        resetVehicleOnTrack(v, this.track, ai.lane * 0.5, 6);
        ai.lastIdx = v.idx;
        ai.stuck = 0;
        ai.wrongDir = 0;
        ai.brain = createBotBrain();
      }
    }

    ai.x = v.x;
    ai.z = v.z;
    ai.angle = v.heading;
    ai.speed = v.speed;
    ai.curv = s.curv;
    ai.drifting = v.drifting && !v.onGrass && v.speed > 6;
    ai.braking = v.braking;
  }

  private updateAIVisuals(ai: AICar, k: number, dt: number) {
    const m = ai.model;
    const dims = m.dims;
    const slipMode = this.engine === 'slip';
    m.group.position.set(ai.x, 0, ai.z);
    m.group.rotation.y = ai.angle;
    m.body.rotation.z = slipMode
      ? THREE.MathUtils.clamp(ai.veh.angVel * ai.veh.fwd * 0.012 + ai.veh.lat * 0.008, -0.14, 0.14)
      : THREE.MathUtils.clamp(ai.curv * ai.speed * 0.15, -0.12, 0.12);
    const fwdSpeed = slipMode ? ai.veh.fwd : ai.speed;
    m.wheels.forEach((w) => (w.rotation.x += (fwdSpeed / dims.wheelRadius) * dt));
    const steerVis = slipMode ? -ai.veh.steer * 0.45 : THREE.MathUtils.clamp(ai.curv * 20, -0.4, 0.4);
    m.frontWheels.forEach((w) => (w.rotation.y = steerVis));
    m.steeringWheel.rotation.z = slipMode ? -ai.veh.steer * 1.4 : THREE.MathUtils.clamp(ai.curv * 60, -1.2, 1.2);
    setBrakeLights(m, ai.braking, this.time);

    const fx = Math.sin(ai.angle), fz = Math.cos(ai.angle);
    const rx = Math.cos(ai.angle), rz = -Math.sin(ai.angle);
    [-dims.halfWidth, dims.halfWidth].forEach((lx, i) => {
      const wx = ai.x + rx * lx + fx * -dims.wheelBase;
      const wz = ai.z + rz * lx + fz * -dims.wheelBase;
      this.skid.update(`a${k}${i}`, wx, wz, ai.drifting, dims.wheelRadius * 0.8);
    });
    if (ai.drifting && this.prefs.smoke.amount > 0) {
      const strength = slipMode ? 0.4 + ai.veh.smokeIntensity * 0.5 : 0.5;
      ai.smokeAcc += dt * (12 + strength * 12) * this.prefs.smoke.amount;
      while (ai.smokeAcc >= 1) {
        ai.smokeAcc -= 1;
        const lx = Math.random() < 0.5 ? -dims.halfWidth : dims.halfWidth;
        this.smoke.emit(ai.x + rx * lx + fx * -dims.wheelBase, 0.25, ai.z + rz * lx + fz * -dims.wheelBase, -fx * 2, -fz * 2, strength);
      }
    }

    if (!ai.finished && Math.floor(ai.progress / this.track.count) >= this.race.laps) {
      ai.finished = true;
      ai.finishOrder = ++this.finishCounter;
    }
  }

  private handleCollisions() {
    const p = this.player;
    if (this.engine === 'slip') {
      const vehicles = [p.veh, ...this.ais.map((a) => a.veh)];
      for (let i = 0; i < vehicles.length; i++) {
        for (let j = i + 1; j < vehicles.length; j++) {
          const vn = collideVehicles(vehicles[i], vehicles[j], CFG.collideRadius);
          if (vn > 1.5 && (i === 0 || j === 0)) this.onHit(vn * 0.6, false);
        }
      }
      this.syncPlayerFromVehicle();
      for (const ai of this.ais) {
        ai.x = ai.veh.x;
        ai.z = ai.veh.z;
        ai.angle = ai.veh.heading;
      }
      return;
    }
    for (const ai of this.ais) {
      const dx = p.x - ai.x;
      const dz = p.z - ai.z;
      const dist = Math.hypot(dx, dz);
      const minDist = 2.6;
      if (dist < minDist && dist > 0.001) {
        const nx = dx / dist;
        const nz = dz / dist;
        const push = minDist - dist;
        p.x += nx * push;
        p.z += nz * push;
        const vn = p.vx * nx + p.vz * nz;
        if (vn < 0) {
          p.vx -= nx * vn * 1.3;
          p.vz -= nz * vn * 1.3;
          p.vx *= 0.85;
          p.vz *= 0.85;
          this.onHit(Math.abs(vn) * 0.6, false);
        }
        ai.laneTarget = THREE.MathUtils.clamp(ai.lane + (Math.random() - 0.5) * 2, -3.6, 3.6);
      }
    }
  }

  // ---------------- Race flow ----------------

  private currentPosition(): number {
    const p = this.player;
    let pos = 1;
    for (const ai of this.ais) if (ai.progress > p.progress) pos++;
    return pos;
  }

  private finishRace() {
    const p = this.player;
    if (p.finished) return;
    this.endDrift(false);
    if (p.zoneIdx >= 0) this.exitZone();
    p.finished = true;
    p.finishOrder = ++this.finishCounter;
    this.phase = 'finished';
    const position = 1 + this.ais.filter((a) => a.finished && a.finishOrder < p.finishOrder).length;
    const result: RaceResult = {
      position,
      totalCars: this.ais.length + 1,
      totalTime: this.raceTime,
      bestLap: p.lapTimes.length ? Math.min(...p.lapTimes) : 0,
      driftScore: this.driftScore,
      lapTimes: [...p.lapTimes],
    };
    this.audio.finish(position === 1);
    this.cb.onPopup(position === 1 ? 'YOU WIN!' : 'FINISH!', position === 1 ? 'epic' : 'info');
    this.cb.onPhase('finished', result);
  }

  // ---------------- Camera / audio / hud ----------------

  private updateCamera(dt: number) {
    const p = this.player;
    const cam = this.camera;
    if (this.phase === 'menu') {
      const t = this.time * 0.35;
      const target = new THREE.Vector3(p.x + Math.sin(t) * 10.5, 3.6 + Math.sin(t * 0.7) * 0.6, p.z + Math.cos(t) * 10.5);
      this.camPos.lerp(target, 1 - Math.exp(-dt * 2.5));
      this.camLook.lerp(new THREE.Vector3(p.x, 0.7, p.z), 1 - Math.exp(-dt * 4));
      cam.up.set(0, 1, 0);
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      this.camFov += (50 - this.camFov) * Math.min(1, dt * 3);
      cam.fov = this.camFov;
      cam.updateProjectionMatrix();
      return;
    }
    const speed = p.speed;
    const ratio = THREE.MathUtils.clamp(speed / this.vmax, 0, 1.3);
    const boosting = p.boostTime > 0;
    const mode = this.prefs.camera;
    const stiff = this.phase === 'countdown' ? 3 : 5.5;

    // heading blended with the velocity direction so the camera swings with the drift
    let dx = Math.sin(p.angle);
    let dz = Math.cos(p.angle);
    if (speed > 4 && p.vf > 0) {
      const b = 0.45;
      dx = dx * (1 - b) + (p.vx / speed) * b;
      dz = dz * (1 - b) + (p.vz / speed) * b;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
    }

    let fovTarget = 60;
    let shakeMul = 1;
    if (mode === 'cockpit') {
      const fx = Math.sin(p.angle);
      const fz = Math.cos(p.angle);
      const rx = Math.cos(p.angle);
      const rz = -Math.sin(p.angle);
      const d = this.playerModel.dims;
      const seatX = -0.42;
      const eye = new THREE.Vector3(p.x + fx * d.eyeZ + rx * seatX, d.eyeY, p.z + fz * d.eyeZ + rz * seatX);
      eye.y += Math.sin(this.time * 18) * 0.004 * ratio;
      this.camPos.lerp(eye, 1 - Math.exp(-dt * 30));
      const lookYaw = p.angle + THREE.MathUtils.clamp(p.vl * 0.02, -0.35, 0.35);
      const look = new THREE.Vector3(this.camPos.x + Math.sin(lookYaw) * 20, d.eyeY - 0.3 + p.roll * 0.5, this.camPos.z + Math.cos(lookYaw) * 20);
      this.camLook.lerp(look, 1 - Math.exp(-dt * 14));
      cam.position.copy(this.camPos);
      cam.up.set(Math.sin(p.roll * 0.6) * -rx, 1, Math.sin(p.roll * 0.6) * -rz).normalize();
      fovTarget = 74 + ratio * 16 + (boosting ? 10 : 0);
      shakeMul = 0.5;
    } else if (mode === 'rally') {
      cam.up.set(0, 1, 0);
      const target = p.angle;
      let diff = target - this.camRallyYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.camRallyYaw += diff * Math.min(1, dt * 1.1);
      const yx = Math.sin(this.camRallyYaw);
      const yz = Math.cos(this.camRallyYaw);
      const back = 13 + ratio * 3;
      const height = 15 + ratio * 3;
      const lead = 6 + ratio * 8;
      const target3 = new THREE.Vector3(p.x - yx * back, height, p.z - yz * back);
      this.camPos.lerp(target3, 1 - Math.exp(-dt * 6));
      this.camLook.lerp(new THREE.Vector3(p.x + dx * lead, 0.5, p.z + dz * lead), 1 - Math.exp(-dt * 6));
      cam.position.copy(this.camPos);
      fovTarget = 48 + ratio * 6 + (boosting ? 4 : 0);
      shakeMul = 0.6;
    } else {
      cam.up.set(0, 1, 0);
      const far = mode === 'far';
      // close & low chase so 180 km/h really feels like 180 km/h
      const dist = far ? 12.5 + ratio * 3.5 : 6.6 + ratio * 2.0;
      const h = far ? 6.8 + ratio * 1.4 : 2.9 + ratio * 0.7;
      const lead = far ? 9 : 5.5;
      const target = new THREE.Vector3(p.x - dx * dist, h, p.z - dz * dist);
      this.camPos.lerp(target, 1 - Math.exp(-dt * (far ? 4 : stiff)));
      this.camLook.lerp(new THREE.Vector3(p.x + dx * lead, far ? 1.2 : 0.9, p.z + dz * lead), 1 - Math.exp(-dt * 9));
      cam.position.copy(this.camPos);
      fovTarget = (far ? 55 : 64) + ratio * (far ? 10 : 18) + (boosting ? 10 : 0);
    }

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.6 * shakeMul;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.4 * shakeMul;
      cam.position.z += (Math.random() - 0.5) * this.shake * 0.6 * shakeMul;
    }
    // subtle speed vibration above ~60% of top speed — sells the velocity
    if (ratio > 0.6 && this.phase === 'racing') {
      const vibe = (ratio - 0.6) * 0.12 * shakeMul;
      cam.position.x += (Math.random() - 0.5) * vibe;
      cam.position.y += (Math.random() - 0.5) * vibe * 0.7;
    }
    cam.lookAt(this.camLook);
    this.camFov += (fovTarget - this.camFov) * Math.min(1, dt * 4);
    cam.fov = this.camFov;
    cam.updateProjectionMatrix();
  }

  private updateAudio() {
    if (!this.audio.ready) return;
    const p = this.player;
    const running = this.phase === 'racing' || this.phase === 'finished';
    this.audio.setEngine(p.speed / this.vmax, this.phase === 'racing' ? 1 : 0, running);
    const driftI = p.drifting ? Math.min(1, this.engine === 'slip' ? p.smokeIntensity : Math.abs(p.vl) / 12) : p.offTrack && p.speed > 6 ? 0.25 : 0;
    this.audio.setDrift(driftI);
  }

  private emitHud(force = false) {
    const p = this.player;
    const n = this.track.count;
    const countdown =
      this.phase === 'countdown'
        ? Math.min(3, Math.max(1, Math.ceil(this.countdownT)))
        : this.phase === 'racing' && this.raceTime < 0.9
          ? 0
          : -1;
    const bestLap = p.lapTimes.length ? Math.min(...p.lapTimes) : null;
    const boosting = p.boostTime > 0;
    // bottom bar: remaining boost while firing, otherwise the stored meter
    const boost = boosting ? THREE.MathUtils.clamp(p.boostTime / p.boostMax, 0, 1) : THREE.MathUtils.clamp(p.boostMeter, 0, 1);
    const boostReady = !boosting && p.boostMeter >= CFG.boostMinMeter;
    // drift meter preview: charge this drift will bank when it ends
    const driftBoost = p.drifting ? THREE.MathUtils.clamp((p.driftTime * 0.7) / CFG.boostMaxTime, 0, 1) : 0;

    let zone: ZoneHud | null = null;
    let zoneAhead: ZoneAheadHud | null = null;
    if (p.zoneIdx >= 0) {
      const z = this.zones[p.zoneIdx];
      const score = Math.round(p.zoneScore);
      zone = {
        name: z.name,
        mult: z.mult,
        score,
        progress: THREE.MathUtils.clamp(((p.lastIdx - z.start + n) % n) / z.len, 0, 1),
        stars: zoneStars(score, z.par),
        par: z.par,
        full: this.zoneFull(p),
      };
    } else if (this.phase === 'racing' && this.zones.length) {
      const d = this.nextZone[p.lastIdx];
      if (d > 0 && d < 75) {
        const z = this.zones[this.zoneOf[(p.lastIdx + d) % n]];
        if (z) zoneAhead = { name: z.name, mult: z.mult, dist: Math.round(d * this.track.spacing) };
      }
    }

    const top = this.activeTop;
    const hud: HudState = {
      phase: this.phase,
      countdown,
      speed: Math.round(p.speed * this.kmh),
      lap: Math.min(this.race.laps, p.lapsDone + 1),
      totalLaps: this.race.laps,
      position: this.currentPosition(),
      totalCars: this.ais.length + 1,
      raceTime: this.raceTime,
      lapTime: this.raceTime - p.lapStart,
      bestLap,
      driftScore: this.driftScore,
      driftChips: Math.round(p.driftPoints),
      driftCurrent: Math.round(p.driftPoints * p.combo),
      driftTime: p.driftTime,
      combo: p.combo,
      isDrifting: p.drifting,
      boost,
      boosting,
      boostReady,
      driftBoost,
      offTrack: p.offTrack,
      wrongWay: p.wrongWayTime > 1.2,
      topSpeed: Math.round(top.maxSpeed + top.boostPower),
      paused: this.paused,
      camera: this.prefs.camera,
      engine: this.engine,
      slipDeg: this.engine === 'slip' ? Math.round(Math.abs(p.veh.slip) * RAD2DEG) : 0,
      zone,
      zoneAhead,
      cars: [
        ...this.ais.map((a) => ({ x: a.x, z: a.z, color: hex(a.color), player: false })),
        { x: p.x, z: p.z, color: hex(CFG.playerColor), player: true },
      ],
    };
    if (force) this.hudAcc = 0;
    this.cb.onHud(hud);
  }
}
