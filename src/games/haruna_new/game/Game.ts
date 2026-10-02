import * as THREE from 'three';
import { buildTrack, Track, ALT_OFFSET, ROAD_HALF, Corner } from './track';
import { buildWorld, World } from './world';
import { Car, CarInput } from './car';
import { CarAudio } from './audio';
import { Sky } from './sky';
import {
  DriftMode,
  DriftTune,
  DRIFT_ORDER,
  DRIFT_STORE_KEY,
  DEFAULT_RC,
  HARUNA_PRESETS,
  cloneTune,
  type HarunaPresetId,
  type HarunaSliderKey,
  type SliderKey,
  type RcSetup,
} from './drift';

export type Phase = 'menu' | 'countdown' | 'racing' | 'finished';
export type TimeOfDay = 'siang' | 'pagi' | 'sore' | 'malam';
export type CamMode = 'rally' | 'chase' | 'top';

export interface Note {
  text: string;
  dir: 'LEFT' | 'RIGHT';
  grade: string;
  dist: number;
  hairpinNo?: number;
}

export interface Split {
  name: string;
  time: number | null;
  delta: number | null;
}

export interface HudData {
  phase: Phase;
  speed: number;
  gear: number;
  rpm: number;
  time: number;
  countdown: number;
  progress: number;
  distLeft: number;
  alt: number;
  note: Note | null;
  nextNote: Note | null;
  hairpinZone: boolean;
  splits: Split[];
  finishTime: number | null;
  best: number | null;
  resets: number;
  penalty: number;
  onRoad: boolean;
  cam: CamMode;
  tod: TimeOfDay;
  muted: boolean;
  impact: number;
  cut: boolean;
  drift: DriftHud;
}

export interface DriftHud {
  mode: DriftMode;
  angle: number; // derajat, absolut
  signed: number; // derajat, + = ekor keluar ke kanan
  active: boolean;
  score: number; // skor yang sudah "dibank"
  chain: number; // skor rantai yang sedang berjalan
  combo: number; // pengali 1..5
  best: number; // rantai terbaik
  rear: number; // 0..1 kejenuhan ban belakang
  boost: number; // 0..1 tekanan turbo (mode RC)
  rc: RcSetup; // setelan sasis RC saat ini
  tune: DriftTune;
}

// Palet Art of Rally: warna langit = warna kabut (objek jauh melebur ke langit),
// matahari rendah & hangat, cahaya langit kuat sehingga bayangan lembut kebiruan.
// bg = fog = horizon langit → objek jauh melebur mulus ke cakrawala.
// mid/zen = gradien langit; sky/ground = gradien cahaya hemisphere (atas dingin, bawah hangat).
const TOD = {
  siang: {
    bg: '#e6eeeb', fog: '#e6eeeb', mid: '#bddcec', zen: '#7db6df', glow: 0.9, cloud: '#ffffff', cloudE: '#6a7d8e',
    sun: '#fff4de', sunI: 2.25, sunDir: [-0.42, 0.8, 0.38],
    fill: '#bdd7f0', fillI: 0.36, sky: '#d6e8f5', ground: '#9c9970', hemiI: 1.05,
    water: '#7fbfca', near: 280, far: 1100,
  },
  pagi: {
    bg: '#f1dfc6', fog: '#f1dfc6', mid: '#cfdde8', zen: '#92b5d9', glow: 1.2, cloud: '#fff0e0', cloudE: '#6a727c',
    sun: '#ffe3ba', sunI: 1.95, sunDir: [-0.8, 0.36, 0.42],
    fill: '#c6d6ee', fillI: 0.34, sky: '#eaeff0', ground: '#c7b592', hemiI: 1.15,
    water: '#a9c9c6', near: 205, far: 880,
  },
  sore: {
    bg: '#f4d3aa', fog: '#f4d3aa', mid: '#ebc3ae', zen: '#9facd0', glow: 1.4, cloud: '#ffe6d0', cloudE: '#6e5a62',
    sun: '#ffd3a0', sunI: 1.8, sunDir: [0.85, 0.34, -0.4],
    fill: '#c4cfe8', fillI: 0.3, sky: '#fae0c0', ground: '#bca684', hemiI: 1.15,
    water: '#d3b498', near: 190, far: 800,
  },
  malam: {
    bg: '#323c54', fog: '#323c54', mid: '#2a3450', zen: '#161d36', glow: 0.5, cloud: '#8f9bb8', cloudE: '#1c2236',
    sun: '#9fb0da', sunI: 0.55, sunDir: [-0.35, 0.78, 0.32],
    fill: '#5f6f96', fillI: 0.4, sky: '#5c6c92', ground: '#40454f', hemiI: 0.85,
    water: '#45566f', near: 80, far: 440,
  },
} as const;

const BEST_KEY = 'haruna_akina_best_v1';

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  track: Track;
  world: World;
  car = new Car();
  audio = new CarAudio();
  sun: THREE.DirectionalLight;
  fill!: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  container: HTMLElement;
  minimap: HTMLCanvasElement | null;
  mapBg: HTMLCanvasElement | null = null;
  mapXf = { s: 1, ox: 0, oz: 0 };
  onHud: (h: HudData) => void;

  phase: Phase = 'menu';
  tod: TimeOfDay = 'siang';
  sky!: Sky;
  cam: CamMode = 'rally';
  keys = new Set<string>();
  touch = { up: false, down: false, left: false, right: false, hb: false };
  raf = 0;
  last = performance.now();
  time = 0;
  countdown = 0;
  maxProgress = 0;
  finishTime: number | null = null;
  splits: Split[] = [];
  checkpoints: { name: string; idx: number }[] = [];
  best: { total: number; splits: number[] } | null = null;
  resets = 0;
  penalty = 0;
  hudTimer = 0;
  frame = 0;
  flyT = 0;
  camYaw = 0;
  camPos = new THREE.Vector3();
  camLook = new THREE.Vector3();
  shake = 0;

  // drift
  driftScore = 0;
  driftChain = 0;
  driftCombo = 1;
  driftGap = 0; // detik sejak terakhir drift
  driftHold = 0; // detik drift berkelanjutan
  driftBest = 0;
  rc: RcSetup = { ...DEFAULT_RC }; // setelan sasis RC (Pit Bench)

  // fx
  smoke: THREE.InstancedMesh;
  smokeData: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number }[] = [];
  smokeIdx = 0;
  skidGeo: THREE.BufferGeometry;
  skidPos: Float32Array;
  skidCount = 0;
  SKID_MAX = 3000;
  lastWheel: (THREE.Vector3 | null)[] = [null, null];
  wheelTmp = [new THREE.Vector3(), new THREE.Vector3()];
  dummy = new THREE.Object3D();

  constructor(container: HTMLElement, minimap: HTMLCanvasElement | null, onHud: (h: HudData) => void) {
    this.container = container;
    this.minimap = minimap;
    this.onHud = onHud;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // tone mapping filmic: highlight tak pernah "pecah", warna jadi creamy
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(36, container.clientWidth / container.clientHeight, 0.5, 2500);

    this.track = buildTrack();
    this.world = buildWorld(this.track);
    this.scene.add(this.world.group);
    this.scene.add(this.car.root);
    this.sky = new Sky(this.world.bounds);
    this.scene.add(this.sky.dome, this.sky.clouds);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    this.scene.add(this.hemi);
    // cahaya pengisi dingin dari arah berlawanan → bayangan biru lembut, bukan hitam
    this.fill = new THREE.DirectionalLight('#cfe0f2', 0.32);
    this.fill.castShadow = false;
    this.scene.add(this.fill, this.fill.target);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 70;
    sc.bottom = -70;
    sc.near = 1;
    sc.far = 500;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 4; // bayangan lebih lembut (PCFSoft)
    this.scene.add(this.sun, this.sun.target);
    this.scene.fog = new THREE.Fog('#ffffff', 100, 600);

    // smoke
    const sg = new THREE.IcosahedronGeometry(0.6, 2);
    this.smoke = new THREE.InstancedMesh(
      sg,
      new THREE.MeshLambertMaterial({ color: '#f7f3e9', transparent: true, opacity: 0.32, depthWrite: false, flatShading: false }),
      180
    );
    this.smoke.frustumCulled = false;
    for (let i = 0; i < 180; i++) {
      this.smokeData.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 1, max: 1, size: 0 });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.smoke.setMatrixAt(i, this.dummy.matrix);
      this.smoke.setColorAt(i, new THREE.Color('#ffffff'));
    }
    this.scene.add(this.smoke);

    // skid marks
    this.skidPos = new Float32Array(this.SKID_MAX * 18);
    this.skidGeo = new THREE.BufferGeometry();
    this.skidGeo.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.skidGeo.setDrawRange(0, 0);
    const skid = new THREE.Mesh(
      this.skidGeo,
      new THREE.MeshBasicMaterial({
        color: '#4a4942', transparent: true, opacity: 0.3, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
      })
    );
    skid.frustumCulled = false;
    this.scene.add(skid);

    // checkpoints
    const t = this.track;
    let lakeIdx = 0;
    while (lakeIdx < t.n - 1 && t.dist[lakeIdx] < 1150) lakeIdx++;
    let midIdx = t.hairpinEnd;
    while (midIdx < t.n - 1 && t.dist[midIdx] < t.dist[t.hairpinEnd] + 1100) midIdx++;
    this.checkpoints = [
      { name: 'Tepi Danau', idx: lakeIdx },
      { name: 'Masuk 5 Hairpin', idx: t.hairpinStart },
      { name: 'Keluar 5 Hairpin', idx: t.hairpinEnd },
      { name: 'Turunan Ikaho', idx: midIdx },
      { name: 'Finish', idx: t.n - 12 },
    ];
    try {
      const b = localStorage.getItem(BEST_KEY);
      if (b) this.best = JSON.parse(b);
    } catch {
      /* ignore */
    }
    this.resetSplits();

    this.car.place(t, 4);
    this.car.syncVisual(0);
    this.loadDrift();
    this.setTimeOfDay('siang');
    this.buildMinimap();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    this.loop();
  }

  // ------------------------------------------------------------ public API
  get stats() {
    return {
      length: this.track.length,
      drop: this.track.y[0] - this.track.y[this.track.n - 1],
      corners: this.track.corners.length,
      hairpins: this.track.corners.filter((c) => c.grade === 'HAIRPIN').length,
      trees: this.world.treeCount,
    };
  }

  profile(samples = 120) {
    const t = this.track;
    const out: { d: number; alt: number }[] = [];
    for (let k = 0; k < samples; k++) {
      const i = Math.round((k / (samples - 1)) * (t.n - 1));
      out.push({ d: t.dist[i], alt: t.y[i] + ALT_OFFSET });
    }
    return out;
  }

  startRace() {
    this.audio.start();
    this.car.place(this.track, 4);
    this.maxProgress = 4;
    this.time = 0;
    this.countdown = 3.2;
    this.finishTime = null;
    this.resets = 0;
    this.penalty = 0;
    this.driftScore = 0;
    this.driftChain = 0;
    this.driftCombo = 1;
    this.driftGap = 0;
    this.driftHold = 0;
    this.driftBest = 0;
    this.phase = 'countdown';
    this.resetSplits();
    this.skidCount = 0;
    this.skidGeo.setDrawRange(0, 0);
    this.camYaw = this.car.heading;
    this.snapCamera();
  }

  toMenu() {
    this.phase = 'menu';
    this.audio.silence();
  }

  setTimeOfDay(t: TimeOfDay) {
    this.tod = t;
    const p = TOD[t];
    this.scene.background = new THREE.Color(p.bg);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(p.fog);
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunI;
    this.fill.color.set(p.fill);
    this.fill.intensity = p.fillI;
    this.sky.apply(
      { horizon: p.bg, mid: p.mid, zenith: p.zen, sun: p.sun, glow: p.glow, cloud: p.cloud, cloudE: p.cloudE },
      p.sunDir
    );
    this.hemi.color.set(p.sky);
    this.hemi.groundColor.set(p.ground);
    this.hemi.intensity = p.hemiI;
    (this.world.water.material as THREE.MeshPhongMaterial).color.set(p.water);
    this.car.lightsOn = t === 'malam';
    this.car.tailMat.emissive.set(t === 'malam' ? '#aa0000' : '#300000');
    this.applyFog();
  }

  setCam(c: CamMode) {
    this.cam = c;
    this.applyFog();
    this.snapCamera();
  }

  cycleCam() {
    const order: CamMode[] = ['rally', 'chase', 'top'];
    this.setCam(order[(order.indexOf(this.cam) + 1) % order.length]);
  }

  // ------------------------------------------------------------ drift API
  get driftMode(): DriftMode {
    return this.car.driftMode;
  }

  setDriftMode(mode: DriftMode) {
    // tiap mode membawa tuning bawaannya; slider menimpa setelahnya
    this.car.setDrift(mode, cloneTune(mode, this.rc));
    this.saveDrift();
  }

  cycleDrift() {
    const i = DRIFT_ORDER.indexOf(this.car.driftMode);
    this.setDriftMode(DRIFT_ORDER[(i + 1) % DRIFT_ORDER.length]);
  }

  setDriftParam(key: SliderKey, value: number) {
    this.car.tune[key] = value;
    this.saveDrift();
  }

  setHarunaParam(key: HarunaSliderKey, value: number) {
    this.car.tune[key] = value;
    this.saveDrift();
  }

  applyHarunaPreset(id: HarunaPresetId) {
    const preset = HARUNA_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    this.car.setDrift(preset.mode, { ...preset.setup });
    this.saveDrift();
  }

  resetDriftTune() {
    this.car.tune = cloneTune(this.car.driftMode, this.rc);
    this.saveDrift();
  }

  private saveDrift() {
    try {
      localStorage.setItem(DRIFT_STORE_KEY, JSON.stringify({ mode: this.car.driftMode, tune: this.car.tune, rc: this.rc }));
    } catch {
      /* ignore */
    }
  }

  private loadDrift() {
    let mode: DriftMode = 'normal'; // bawaan: engine lama — pilih Sedang / Pas / Best di menu atau tekan G
    let tune = cloneTune('normal');
    try {
      const raw = localStorage.getItem(DRIFT_STORE_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (DRIFT_ORDER.includes(o.mode)) {
          mode = o.mode;
          if (o.rc) this.rc = { ...DEFAULT_RC, ...o.rc };
          tune = mode === 'rc' ? cloneTune('rc', this.rc) : { ...cloneTune(mode), ...o.tune };
        }
      }
    } catch {
      /* ignore */
    }
    this.car.setDrift(mode, tune);
  }

  /** Pit Bench: ubah setelan sasis RC. Bila mode RC aktif, fisika langsung ikut berubah. */
  setRc(patch: Partial<RcSetup>) {
    this.rc = { ...this.rc, ...patch };
    if (this.car.driftMode === 'rc') this.car.tune = cloneTune('rc', this.rc);
    this.saveDrift();
  }

  resetRc() {
    this.setRc({ ...DEFAULT_RC });
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
  }

  setTouch(k: keyof Game['touch'], v: boolean) {
    this.touch[k] = v;
  }

  resetCar() {
    if (this.phase !== 'racing') return;
    const i = Math.max(2, this.maxProgress - 3);
    this.car.place(this.track, i);
    this.resets++;
    this.penalty += 5;
    this.lastWheel = [null, null];
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    this.audio.silence();
    this.audio.ctx?.close();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------ internals
  private applyFog() {
    const p = TOD[this.tod];
    const fog = this.scene.fog as THREE.Fog;
    const mul = this.cam === 'chase' ? 1.0 : this.cam === 'top' ? 1.4 : 1.15;
    fog.near = p.near * mul;
    fog.far = p.far * mul;
  }

  private resetSplits() {
    this.splits = this.checkpoints.map((c) => ({ name: c.name, time: null, delta: null }));
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    if (k === 'r') this.resetCar();
    if (k === 'c') this.cycleCam();
    if (k === 'm') this.toggleMute();
    if (k === 'g') this.cycleDrift();
    if (k === 't') {
      const o: TimeOfDay[] = ['siang', 'pagi', 'sore', 'malam'];
      this.setTimeOfDay(o[(o.indexOf(this.tod) + 1) % o.length]);
    }
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private input(): CarInput {
    const k = this.keys;
    const t = this.touch;
    const up = k.has('arrowup') || k.has('w') || t.up;
    const down = k.has('arrowdown') || k.has('s') || t.down;
    const left = k.has('arrowleft') || k.has('a') || t.left;
    const right = k.has('arrowright') || k.has('d') || t.right;
    const hb = k.has(' ') || t.hb;
    return { throttle: up ? 1 : 0, brake: down ? 1 : 0, steer: (right ? 1 : 0) - (left ? 1 : 0), handbrake: hb };
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.sky.follow(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    this.frame++;
    const car = this.car;
    const track = this.track;

    if (this.phase === 'menu') {
      this.flyover(dt);
      this.updateSmoke(dt);
      this.emitHud(dt);
      return;
    }

    let inp: CarInput = this.input();
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const rev = inp.throttle;
      // tahan di garis start dengan rem tangan (rem kaki dari keadaan diam akan dibaca sebagai gigi mundur)
      inp = { throttle: 0, brake: 0, steer: inp.steer, handbrake: true };
      car.rpm += ((rev ? 6500 : 1000) - car.rpm) * Math.min(1, dt * 6);
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.time = 0;
      }
    } else if (this.phase === 'finished') {
      // mengerem sampai berhenti, lalu lepas rem supaya tidak mundur
      inp = { throttle: 0, brake: Math.abs(car.vF) > 1 ? 0.6 : 0, steer: 0, handbrake: false };
    } else {
      this.time += dt;
    }

    const steps = 3;
    for (let s = 0; s < steps; s++) car.update(dt / steps, inp, track, this.world);
    if (this.phase === 'countdown') car.rpm = Math.max(car.rpm, 900);
    this.updateDriftScore(dt);

    // progress (no shortcuts: must advance sequentially)
    const pi = car.proj.i;
    if (car.proj.d < ROAD_HALF + 18 && pi > this.maxProgress && pi - this.maxProgress < 25) this.maxProgress = pi;

    if (this.phase === 'racing') {
      const total = this.time + this.penalty;
      this.checkpoints.forEach((c, k) => {
        if (this.splits[k].time === null && this.maxProgress >= c.idx) {
          const b = this.best?.splits?.[k];
          this.splits[k] = { name: c.name, time: total, delta: b != null ? total - b : null };
        }
      });
      if (this.maxProgress >= track.n - 12) {
        this.phase = 'finished';
        this.finishTime = total;
        if (!this.best || total < this.best.total) {
          this.best = { total, splits: this.splits.map((s) => s.time ?? 0) };
          try {
            localStorage.setItem(BEST_KEY, JSON.stringify(this.best));
          } catch {
            /* ignore */
          }
        }
      }
    }

    // fx
    const slip = Math.abs(car.vL);
    const sp = Math.abs(car.vF);
    const driftMode = car.driftMode !== 'normal';
    const spinning = driftMode && inp.throttle > 0.3 && car.rearSlide > 0.75 && sp > 5; // wheelspin saat power-over / clutch kick
    const sliding =
      (slip > 3 && sp > 4) ||
      (inp.handbrake && sp > 6) ||
      (inp.brake > 0 && sp > 25 && this.frame % 2 === 0) ||
      spinning ||
      (driftMode && car.drifting);
    car.rearWheelWorld(this.wheelTmp, track, this.world);
    if (sliding || (!car.onRoad && sp > 6)) {
      for (let w = 0; w < 2; w++) {
        const p = this.wheelTmp[w];
        if (Math.random() < (car.onRoad ? 0.55 : 0.8)) {
          this.spawnSmoke(p.x, p.y + 0.3, p.z, car.onRoad ? '#f6f2e8' : '#d0c1a2', car.onRoad ? 0.9 : 1.3);
        }
      }
    }
    if (sliding && car.onRoad) {
      for (let w = 0; w < 2; w++) {
        const p = this.wheelTmp[w];
        const lw = this.lastWheel[w];
        if (lw && lw.distanceToSquared(p) > 0.25) {
          this.addSkid(lw, p);
          lw.copy(p);
        } else if (!lw) this.lastWheel[w] = p.clone();
      }
    } else this.lastWheel = [null, null];
    if (car.impact > 0.3) this.shake = Math.max(this.shake, car.impact);
    this.updateSmoke(dt);

    this.audio.setRc(car.driftMode === 'rc');
    this.audio.update(car.rpm, inp.throttle, slip, car.onRoad, car.boost);
    if (car.fxBov > 0) {
      this.audio.bov(car.fxBov);
      car.fxBov = 0;
    }
    // backfire: letupan + kilatan api di knalpot (maks 2 per frame)
    for (let k = 0; k < Math.min(2, car.fxBackfire); k++) {
      this.audio.backfire();
      const wp = this.wheelTmp[k % 2];
      this.spawnSmoke(wp.x, wp.y + 0.35, wp.z, '#ffb25e', 0.55);
    }
    car.fxBackfire = 0;
    this.updateCamera(dt);
    this.updateSun(car.x, car.y, car.z);
    if (this.frame % 2 === 0) this.drawMinimap(car.x, car.z, car.heading);
    this.emitHud(dt);
  }

  private flyover(dt: number) {
    const t = this.track;
    this.flyT += dt * 38;
    if (this.flyT > t.length - 50) this.flyT = 0;
    let i = 0;
    // binary search dist
    let lo = 0;
    let hi = t.n - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (t.dist[m] < this.flyT) lo = m + 1;
      else hi = m;
    }
    i = lo;
    const j = Math.min(t.n - 1, i + 25);
    const tx = t.x[j];
    const tz = t.z[j];
    const ty = t.y[j];
    const ang = this.flyT * 0.0012;
    const target = new THREE.Vector3(tx + Math.sin(ang) * 90, ty + 85, tz + Math.cos(ang) * 90);
    if (this.camPos.lengthSq() === 0) this.camPos.copy(target);
    this.camPos.lerp(target, Math.min(1, dt * 1.2));
    this.camLook.lerp(new THREE.Vector3(t.x[i], t.y[i], t.z[i]), Math.min(1, dt * 1.5));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.fov = 45;
    this.camera.updateProjectionMatrix();
    this.updateSun(this.camLook.x, this.camLook.y, this.camLook.z);
    this.car.rpm = 900;
    if (this.frame % 3 === 0) this.drawMinimap(this.camLook.x, this.camLook.z, 0);
  }

  private camOffset() {
    const car = this.car;
    const speed = Math.hypot(car.vx, car.vz);
    const velYaw = speed > 4 ? Math.atan2(car.vx, car.vz) : car.heading;
    let fov = 36;
    let back = 30;
    let up = 30;
    let ahead = 5 + Math.min(speed, 40) * 0.18;
    let yawTarget = velYaw;
    if (this.cam === 'chase') {
      back = 8.5;
      up = 3.2;
      ahead = 4;
      fov = 62 + Math.min(speed, 50) * 0.18;
      yawTarget = car.heading * 0.6 + velYaw * 0.4;
    } else if (this.cam === 'top') {
      back = 8;
      up = 75;
      ahead = 6 + Math.min(speed, 40) * 0.3;
      fov = 40;
    }
    return { back, up, ahead, fov, yawTarget };
  }

  private snapCamera() {
    const o = this.camOffset();
    this.camYaw = o.yawTarget;
    const car = this.car;
    this.camPos.set(car.x - Math.sin(this.camYaw) * o.back, car.y + o.up, car.z - Math.cos(this.camYaw) * o.back);
    this.camLook.set(car.x, car.y, car.z);
  }

  private updateCamera(dt: number) {
    const car = this.car;
    const o = this.camOffset();
    let d = o.yawTarget - this.camYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const yawSpeed = this.cam === 'chase' ? 4 : this.cam === 'top' ? 0.8 : 1.3;
    this.camYaw += d * Math.min(1, dt * yawSpeed);
    const sx = Math.sin(this.camYaw);
    const sz = Math.cos(this.camYaw);
    const target = new THREE.Vector3(car.x - sx * o.back, car.y + o.up, car.z - sz * o.back);
    const look = new THREE.Vector3(car.x + sx * o.ahead, car.y + (this.cam === 'chase' ? 1.2 : 0), car.z + sz * o.ahead);
    // keep above terrain for chase cam
    if (this.cam === 'chase') {
      const th = this.world.terrainHeight(target.x, target.z);
      target.y = Math.max(target.y, th + 1.5);
    }
    const posLerp = this.cam === 'chase' ? 10 : 4;
    this.camPos.lerp(target, Math.min(1, dt * posLerp));
    this.camLook.lerp(look, Math.min(1, dt * (this.cam === 'chase' ? 14 : 5)));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.8;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.8;
      this.shake *= Math.exp(-dt * 6);
    }
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - o.fov) > 0.05) {
      this.camera.fov += (o.fov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }

  private updateSun(x: number, y: number, z: number) {
    const p = TOD[this.tod];
    this.sun.target.position.set(x, y, z);
    this.sun.position.set(x + p.sunDir[0] * 220, y + p.sunDir[1] * 220, z + p.sunDir[2] * 220);
    this.sun.target.updateMatrixWorld();
    // cahaya pengisi datang dari sisi berlawanan dan lebih rendah
    this.fill.target.position.set(x, y, z);
    this.fill.position.set(x - p.sunDir[0] * 160, y + 55, z - p.sunDir[2] * 160);
    this.fill.target.updateMatrixWorld();
  }

  private spawnSmoke(x: number, y: number, z: number, color: string, size: number) {
    const p = this.smokeData[this.smokeIdx];
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = this.car.vx * 0.15 + (Math.random() - 0.5) * 1.2;
    p.vy = 0.6 + Math.random() * 0.8;
    p.vz = this.car.vz * 0.15 + (Math.random() - 0.5) * 1.2;
    p.life = 0;
    p.max = 1.2 + Math.random() * 1.0;
    p.size = size * (0.7 + Math.random() * 0.6);
    this.smoke.setColorAt(this.smokeIdx, new THREE.Color(color));
    if (this.smoke.instanceColor) this.smoke.instanceColor.needsUpdate = true;
    this.smokeIdx = (this.smokeIdx + 1) % this.smokeData.length;
  }

  private updateSmoke(dt: number) {
    for (let i = 0; i < this.smokeData.length; i++) {
      const p = this.smokeData[i];
      if (p.life >= p.max) {
        if (p.size !== 0) {
          p.size = 0;
          this.dummy.position.set(0, -999, 0);
          this.dummy.scale.set(0, 0, 0);
          this.dummy.updateMatrix();
          this.smoke.setMatrixAt(i, this.dummy.matrix);
        }
        continue;
      }
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.96;
      p.vz *= 0.96;
      const t = p.life / p.max;
      const s = p.size * (0.5 + t * 2.4) * (1 - t * t);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(t * 2, t * 3, 0);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      this.smoke.setMatrixAt(i, this.dummy.matrix);
    }
    this.smoke.instanceMatrix.needsUpdate = true;
  }

  private addSkid(a: THREE.Vector3, b: THREE.Vector3) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * 0.11;
    const nz = (dx / l) * 0.11;
    const i = (this.skidCount % this.SKID_MAX) * 18;
    const y1 = a.y + 0.05;
    const y2 = b.y + 0.05;
    this.skidPos.set(
      [
        a.x - nx, y1, a.z - nz, a.x + nx, y1, a.z + nz, b.x - nx, y2, b.z - nz,
        a.x + nx, y1, a.z + nz, b.x + nx, y2, b.z + nz, b.x - nx, y2, b.z - nz,
      ],
      i
    );
    this.skidCount++;
    this.skidGeo.setDrawRange(0, Math.min(this.skidCount, this.SKID_MAX) * 6);
    (this.skidGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private buildMinimap() {
    if (!this.minimap) return;
    const t = this.track;
    const S = 220;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d')!;
    const b = t.bounds;
    const pad = 14;
    const s = Math.min((S - pad * 2) / (b.maxX - b.minX), (S - pad * 2) / (b.maxZ - b.minZ));
    const ox = pad + ((S - pad * 2) - (b.maxX - b.minX) * s) / 2 - b.minX * s;
    const oz = pad + ((S - pad * 2) - (b.maxZ - b.minZ) * s) / 2 - b.minZ * s;
    this.mapXf = { s, ox, oz };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 6;
    g.beginPath();
    for (let i = 0; i < t.n; i += 2) {
      const x = t.x[i] * s + ox;
      const y = t.z[i] * s + oz;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.strokeStyle = '#f5efe0';
    g.lineWidth = 2.5;
    g.stroke();
    // hairpin zone highlight
    g.strokeStyle = '#f0b98a';
    g.lineWidth = 3;
    g.beginPath();
    for (let i = t.hairpinStart; i <= t.hairpinEnd; i += 1) {
      const x = t.x[i] * s + ox;
      const y = t.z[i] * s + oz;
      if (i === t.hairpinStart) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    // start / finish
    const dot = (i: number, col: string) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(t.x[i] * s + ox, t.z[i] * s + oz, 4, 0, Math.PI * 2);
      g.fill();
    };
    dot(0, '#2ecc71');
    dot(t.n - 1, '#e74c3c');
    this.mapBg = c;
    this.minimap.width = S;
    this.minimap.height = S;
  }

  private drawMinimap(x: number, z: number, heading: number) {
    if (!this.minimap || !this.mapBg) return;
    const g = this.minimap.getContext('2d')!;
    g.clearRect(0, 0, this.minimap.width, this.minimap.height);
    g.drawImage(this.mapBg, 0, 0);
    const { s, ox, oz } = this.mapXf;
    const px = x * s + ox;
    const py = z * s + oz;
    g.save();
    g.translate(px, py);
    g.rotate(-heading);
    g.fillStyle = '#ffd23f';
    g.strokeStyle = '#111';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, 7);
    g.lineTo(5, -5);
    g.lineTo(-5, -5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  private noteFor(c: Corner, dist: number): Note {
    let text = c.grade === 'HAIRPIN' ? `HAIRPIN ${c.dir === 'LEFT' ? 'KIRI' : 'KANAN'}` : `${c.grade} ${c.dir === 'LEFT' ? 'KIRI' : 'KANAN'}`;
    if (c.long && c.grade !== 'HAIRPIN') text = 'PANJANG ' + text;
    return { text, dir: c.dir, grade: c.grade, dist, hairpinNo: c.hairpinNo };
  }

  /** Skor = kecepatan × sudut × combo. Rantai dibank bila drift berhenti >1,1 dtk; hangus bila menabrak / keluar aspal. */
  private updateDriftScore(dt: number) {
    if (this.phase !== 'racing') return;
    const car = this.car;
    const kmh = Math.abs(car.vF) * 3.6;
    const crashed = car.impact > 0.5 || (!car.onRoad && this.driftChain > 0);
    if (car.drifting && !crashed) {
      this.driftGap = 0;
      this.driftHold += dt;
      this.driftCombo = Math.min(5, 1 + Math.floor(this.driftHold / 2.5));
      const deg = (car.driftAngle * 180) / Math.PI;
      this.driftChain += kmh * deg * 0.012 * this.driftCombo * dt;
      return;
    }
    this.driftGap += dt;
    if (crashed) {
      this.driftChain = 0; // hangus
      this.driftHold = 0;
      this.driftCombo = 1;
    } else if (this.driftGap > 1.1) {
      if (this.driftChain > 0) {
        this.driftScore += this.driftChain;
        this.driftBest = Math.max(this.driftBest, this.driftChain);
      }
      this.driftChain = 0;
      this.driftHold = 0;
      this.driftCombo = 1;
    }
  }

  private emitHud(dt: number) {
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.08;
    const t = this.track;
    const car = this.car;
    const idx = this.phase === 'menu' ? 0 : car.proj.i;
    let note: Note | null = null;
    let nextNote: Note | null = null;
    if (this.phase !== 'menu') {
      const curD = t.dist[idx];
      const cs = t.corners;
      for (let k = 0; k < cs.length; k++) {
        const c = cs[k];
        if (c.end < idx) continue;
        const d = Math.max(0, t.dist[c.start] - curD);
        if (d < 160) {
          note = this.noteFor(c, d);
          const nx = cs[k + 1];
          if (nx && t.dist[nx.start] - t.dist[c.end] < 40) nextNote = this.noteFor(nx, t.dist[nx.start] - curD);
        }
        break;
      }
    }
    const hz = idx >= t.hairpinStart && idx <= t.hairpinEnd;
    const alt = (this.phase === 'menu' ? t.y[0] : car.y) + ALT_OFFSET;
    this.onHud({
      phase: this.phase,
      speed: Math.abs(car.vF) * 3.6,
      gear: car.gear,
      rpm: car.rpm,
      time: this.time + this.penalty,
      countdown: this.countdown,
      progress: t.dist[this.maxProgress] / t.length,
      distLeft: t.length - t.dist[this.maxProgress],
      alt,
      note,
      nextNote,
      hairpinZone: hz && this.phase !== 'menu',
      splits: this.splits.map((s) => ({ ...s })),
      finishTime: this.finishTime,
      best: this.best?.total ?? null,
      resets: this.resets,
      penalty: this.penalty,
      onRoad: car.onRoad,
      cam: this.cam,
      tod: this.tod,
      muted: this.audio.muted,
      impact: car.impact,
      cut: this.phase === 'racing' && car.proj.i - this.maxProgress >= 25,
      drift: {
        mode: car.driftMode,
        angle: (car.driftAngle * 180) / Math.PI,
        signed: (car.slipBeta * 180) / Math.PI,
        active: car.drifting,
        score: this.driftScore,
        chain: this.driftChain,
        combo: this.driftCombo,
        best: this.driftBest,
        rear: car.rearSlide,
        boost: car.boost,
        rc: { ...this.rc },
        tune: { ...car.tune },
      },
    });
  }
}

