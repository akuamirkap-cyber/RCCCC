import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import type { LightingMode } from './prefs';

/* ============================================================
   LIGHTING MODES
   - stylized : the original golden-hour painted sky + warm key light
   - hdri     : realistic image-based lighting. A physically based
                atmosphere (Preetham sky) is rendered into a PMREM env map
                instantly; in the background a real 1k HDRI (Poly Haven,
                CC0) is streamed and, once loaded, becomes the sky +
                environment. The sun light is re-aimed to the HDRI sun so
                shadows, sky and reflections agree. Adds a lens flare,
                warm haze fog and lower exposure.
   ============================================================ */

export const HDRI_URL = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr';

export interface LightingRig {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
  /** painted sky dome of the stylized look */
  sky: THREE.Mesh;
  stylizedEnv: THREE.Texture;
  stylizedFog: THREE.Fog;
  sunOffset: THREE.Vector3; // default sun offset (stylized)
  center: THREE.Vector3;
}

const STYLIZED = {
  hemiSky: 0xbcd9ff,
  hemiGround: 0x5f9248,
  hemiI: 0.9,
  sunColor: 0xffdfb0,
  sunI: 2.4,
  fillI: 0.5,
  exposure: 1.22,
  envI: 0.5,
};

const REAL = {
  hemiSky: 0xe3efff,
  hemiGround: 0x6f7f66, // muted grass bounce (desaturated so it never tints shadows olive/brown)
  hemiI: 0.55,
  sunColor: 0xffffff, // pure white midday sun — no warm cast on neutral surfaces
  sunI: 3.3,
  fillI: 0.18,
  exposure: 1.2,
  envI: 1.15,
  fogColor: '#e8f0fa', // light, airy daylight haze
  fogNear: 220,
  fogFar: 1100,
  elevationDeg: 50, // high sun = short neutral shadows, bright ground
};

function flareTexture(kind: 'glow' | 'ring'): THREE.CanvasTexture {
  const S = kind === 'glow' ? 512 : 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  if (kind === 'glow') {
    g.addColorStop(0, 'rgba(255,252,245,1)');
    g.addColorStop(0.12, 'rgba(255,245,225,0.7)');
    g.addColorStop(0.35, 'rgba(240,235,220,0.18)');
    g.addColorStop(1, 'rgba(230,230,230,0)');
  } else {
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.62, 'rgba(255,220,180,0.05)');
    g.addColorStop(0.8, 'rgba(255,200,150,0.35)');
    g.addColorStop(0.9, 'rgba(255,180,120,0.12)');
    g.addColorStop(1, 'rgba(255,170,90,0)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- shared caches: the HDRI is downloaded/analysed once per page, PMREMs once per GL context ---------- */
let hdrShared: Promise<THREE.DataTexture> | null = null;
let hdrAnalysis: { sunDir: THREE.Vector3; fog: THREE.Color } | null = null;
const hdrEnvByRenderer = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();
const physEnvByRenderer = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

export class LightingController {
  /** Current sun offset relative to the player (Game positions the light each frame). */
  readonly sunOffset: THREE.Vector3;
  mode: LightingMode = 'stylized';
  private physSky?: THREE.Mesh;
  private physEnv?: THREE.Texture;
  private hdrTex?: THREE.DataTexture;
  private hdrEnv?: THREE.Texture;
  private hdrSunDir?: THREE.Vector3;
  private hdrFog?: THREE.Color;
  private flare?: Lensflare;
  private hdrState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private disposed = false;

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer, private rig: LightingRig) {
    this.sunOffset = rig.sunOffset.clone();
  }

  setMode(mode: LightingMode) {
    this.mode = mode;
    if (mode === 'hdri') this.applyReal();
    else this.applyStylized();
  }

  /* ---------------- stylized ---------------- */
  private applyStylized() {
    const { sun, hemi, fill, sky } = this.rig;
    sky.visible = true;
    if (this.physSky) this.physSky.visible = false;
    if (this.flare) this.flare.visible = false;
    this.scene.background = null;
    this.scene.environment = this.rig.stylizedEnv;
    this.scene.environmentIntensity = STYLIZED.envI;
    this.scene.fog = this.rig.stylizedFog;
    hemi.color.setHex(STYLIZED.hemiSky);
    hemi.groundColor.setHex(STYLIZED.hemiGround);
    hemi.intensity = STYLIZED.hemiI;
    sun.color.setHex(STYLIZED.sunColor);
    sun.intensity = STYLIZED.sunI;
    fill.intensity = STYLIZED.fillI;
    this.renderer.toneMappingExposure = STYLIZED.exposure;
    this.sunOffset.copy(this.rig.sunOffset);
  }

  /* ---------------- realistic ---------------- */
  private applyReal() {
    const { sun, hemi, fill, sky } = this.rig;
    sky.visible = false;
    hemi.color.setHex(REAL.hemiSky);
    hemi.groundColor.setHex(REAL.hemiGround);
    hemi.intensity = REAL.hemiI;
    sun.color.setHex(REAL.sunColor);
    sun.intensity = REAL.sunI;
    fill.intensity = REAL.fillI;
    this.renderer.toneMappingExposure = REAL.exposure;
    this.ensureFlare().visible = true;

    if (this.hdrState === 'ready' && this.hdrTex && this.hdrEnv) {
      this.useHdr();
      return;
    }
    // instant physically-based atmosphere while the HDRI streams in
    this.usePhysicalSky();
    if (this.hdrState === 'idle') this.loadHdr();
  }

  private sunDirFor(elevationDeg: number): THREE.Vector3 {
    const base = this.rig.sunOffset;
    const az = Math.atan2(base.z, base.x);
    const el = THREE.MathUtils.degToRad(elevationDeg);
    return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  }

  /** Clear-blue physically based sky dome (+ its PMREM env). Created once per controller; env cached per renderer. */
  private ensurePhysSky(sunDir: THREE.Vector3): THREE.Mesh {
    if (!this.physSky) {
      const sky = new Sky();
      const u = sky.material.uniforms;
      u.turbidity.value = 2.0; // crisp clear day
      u.rayleigh.value = 1.5; // saturated blue zenith
      u.mieCoefficient.value = 0.003;
      u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(sunDir);
      // visible dome: a sphere sharing the Sky shader (its vertex shader pins depth to the far plane)
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), sky.material);
      dome.position.copy(this.rig.center);
      dome.frustumCulled = false;
      dome.renderOrder = -1;
      this.scene.add(dome);
      this.physSky = dome;
      // environment from the same atmosphere
      const cachedEnv = physEnvByRenderer.get(this.renderer);
      if (cachedEnv) {
        this.physEnv = cachedEnv;
      } else {
        const envScene = new THREE.Scene();
        sky.scale.setScalar(2000);
        envScene.add(sky);
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const rt = pmrem.fromScene(envScene, 0.02);
        this.physEnv = rt.texture;
        pmrem.dispose();
        envScene.remove(sky);
        physEnvByRenderer.set(this.renderer, this.physEnv);
      }
    }
    (this.physSky.material as THREE.ShaderMaterial).uniforms.sunPosition.value.copy(sunDir);
    return this.physSky;
  }

  private usePhysicalSky() {
    const sunDir = this.sunDirFor(REAL.elevationDeg);
    this.ensurePhysSky(sunDir);
    this.physSky!.visible = true;
    this.scene.background = null;
    this.scene.environment = this.physEnv!;
    this.scene.environmentIntensity = REAL.envI * 0.9;
    this.scene.fog = new THREE.Fog(REAL.fogColor, REAL.fogNear, REAL.fogFar);
    this.sunOffset.copy(sunDir).multiplyScalar(this.rig.sunOffset.length());
  }

  private useHdr() {
    // The HDRI drives reflections / ambient light only. The visible sky is always the clear-blue midday
    // atmosphere: the photographed sky read as hazy-overcast once tone-mapped, which is not the sunny
    // Long Beach / Ebisu look this game wants.
    const dir = this.hdrSunDir ?? this.sunDirFor(REAL.elevationDeg);
    this.ensurePhysSky(dir).visible = true;
    this.scene.background = null;
    this.scene.environment = this.hdrEnv!;
    this.scene.environmentIntensity = REAL.envI;
    this.scene.fog = new THREE.Fog(REAL.fogColor, REAL.fogNear, REAL.fogFar);
    this.sunOffset.copy(dir).multiplyScalar(this.rig.sunOffset.length());
  }

  private loadHdr() {
    this.hdrState = 'loading';
    if (!hdrShared) {
      hdrShared = new Promise<THREE.DataTexture>((resolve, reject) => {
        const loader = new RGBELoader();
        loader.setDataType(THREE.FloatType);
        const timeout = window.setTimeout(() => reject(new Error('hdr timeout')), 20000);
        loader.load(
          HDRI_URL,
          (tex) => {
            window.clearTimeout(timeout);
            tex.mapping = THREE.EquirectangularReflectionMapping;
            resolve(tex);
          },
          undefined,
          (e) => {
            window.clearTimeout(timeout);
            reject(e);
          },
        );
      });
      hdrShared.catch(() => {
        hdrShared = null; // allow a retry on the next controller
      });
    }
    hdrShared.then(
      (tex) => {
        if (this.disposed) return;
        if (!hdrAnalysis) {
          this.analyseHdr(tex);
          if (this.hdrSunDir && this.hdrFog) hdrAnalysis = { sunDir: this.hdrSunDir.clone(), fog: this.hdrFog.clone() };
        } else {
          this.hdrSunDir = hdrAnalysis.sunDir.clone();
          this.hdrFog = hdrAnalysis.fog.clone();
        }
        let env = hdrEnvByRenderer.get(this.renderer);
        if (!env) {
          const pmrem = new THREE.PMREMGenerator(this.renderer);
          env = pmrem.fromEquirectangular(tex).texture;
          pmrem.dispose();
          hdrEnvByRenderer.set(this.renderer, env);
        }
        this.hdrEnv = env;
        this.hdrTex = tex;
        this.hdrState = 'ready';
        if (this.mode === 'hdri') this.useHdr();
      },
      () => {
        this.hdrState = 'failed';
      },
    );
  }

  /** Finds the sun (brightest texel) and the average horizon colour of an equirectangular HDR. */
  private analyseHdr(tex: THREE.DataTexture) {
    const img = tex.image as { data: Float32Array | Uint16Array; width: number; height: number };
    const data = img.data;
    if (!(data instanceof Float32Array)) return;
    const W = img.width;
    const H = img.height;
    let best = -1;
    let bx = 0;
    let by = 0;
    // weigh neighbourhoods so a single hot texel does not win over the true solar disc
    const stride = 2;
    for (let y = 0; y < H / 2; y += stride) {
      for (let x = 0; x < W; x += stride) {
        const i = (y * W + x) * 4;
        const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
        if (l > best) {
          best = l;
          bx = x;
          by = y;
        }
      }
    }
    // RGBE rows are stored top-down and the texture is flipped on upload, so row 0 = zenith
    const u = (bx + 0.5) / W;
    const v = 1 - (by + 0.5) / H;
    const theta = (u - 0.5) * Math.PI * 2;
    let el = (v - 0.5) * Math.PI;
    el = THREE.MathUtils.clamp(Math.abs(el), THREE.MathUtils.degToRad(25), THREE.MathUtils.degToRad(65));
    this.hdrSunDir = new THREE.Vector3(Math.cos(theta) * Math.cos(el), Math.sin(el), Math.sin(theta) * Math.cos(el));
    // horizon colour (a touch above the horizon line)
    const row = Math.floor(H * 0.47);
    const acc = new THREE.Color(0, 0, 0);
    let cnt = 0;
    for (let x = 0; x < W; x += 4) {
      const i = (row * W + x) * 4;
      acc.r += data[i];
      acc.g += data[i + 1];
      acc.b += data[i + 2];
      cnt++;
    }
    acc.multiplyScalar(1 / cnt);
    const m = Math.max(acc.r, acc.g, acc.b, 1e-3);
    // normalise toward a bright haze tint, keep the hue
    acc.multiplyScalar(0.92 / m);
    acc.lerp(new THREE.Color(REAL.fogColor), 0.7); // mostly the neutral daylight haze — HDRI horizons are often tan
    this.hdrFog = acc;
  }

  private ensureFlare(): Lensflare {
    if (this.flare) return this.flare;
    const flare = new Lensflare();
    const glow = flareTexture('glow');
    const ring = flareTexture('ring');
    flare.addElement(new LensflareElement(glow, 520, 0, new THREE.Color('#fff7ea')));
    flare.addElement(new LensflareElement(ring, 60, 0.55, new THREE.Color('#dfe9ff')));
    flare.addElement(new LensflareElement(ring, 100, 0.72, new THREE.Color('#cfe3ff')));
    flare.addElement(new LensflareElement(ring, 50, 0.86, new THREE.Color('#fff0dc')));
    flare.addElement(new LensflareElement(ring, 140, 1.0, new THREE.Color('#d8e6ff')));
    this.rig.sun.add(flare);
    this.flare = flare;
    return flare;
  }

  dispose() {
    this.disposed = true;
    // HDR texture / env maps are shared across controllers (cached per page / per GL context) — keep them
    this.flare?.dispose();
    if (this.physSky) {
      this.physSky.parent?.remove(this.physSky);
      this.physSky.geometry.dispose();
    }
  }
}
