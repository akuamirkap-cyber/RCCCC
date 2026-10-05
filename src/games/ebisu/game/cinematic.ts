import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/* ============================================================
   CINEMATIC FX
   - UnrealBloom (high threshold: LED boards, reflectors, cones, sun)
   - Sun shafts / god rays: screen-space radial blur of the bright
     sky around the sun at quarter resolution, composited additively.
     Trees, stands and gantries occlude the sky → visible light beams.
   - Sakura petals drifting around the player
   ============================================================ */

/* ------------------------------------------------------------------ */
/*  Sun shafts pass                                                    */
/* ------------------------------------------------------------------ */

const thresholdShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    threshold: { value: 5.0 }, // linear HDR: only the sun disc itself (>10) qualifies — sunlit white walls/cars (~3-4) never do
    sunPos: { value: new THREE.Vector2(0.5, 0.5) },
    sunRadius: { value: 0.42 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float threshold; uniform vec2 sunPos; uniform float sunRadius;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float m = smoothstep(threshold, threshold + 4.0, l);
      // only the sky region around the sun contributes
      float d = distance(vUv, sunPos);
      m *= 1.0 - smoothstep(sunRadius * 0.5, sunRadius, d);
      gl_FragColor = vec4(c * m, 1.0);
    }`,
};

const radialShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    sunPos: { value: new THREE.Vector2(0.5, 0.5) },
    density: { value: 0.3 },
    decay: { value: 0.93 },
  },
  vertexShader: thresholdShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 sunPos; uniform float density; uniform float decay;
    varying vec2 vUv;
    const int TAPS = 24;
    void main() {
      vec2 delta = (sunPos - vUv) * density / float(TAPS);
      vec2 uv = vUv;
      float w = 1.0;
      vec3 acc = vec3(0.0);
      float total = 0.0;
      for (int i = 0; i < TAPS; i++) {
        acc += texture2D(tDiffuse, uv).rgb * w;
        total += w;
        w *= decay;
        uv += delta;
      }
      gl_FragColor = vec4(acc / total, 1.0);
    }`,
};

const compositeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tShafts: { value: null as THREE.Texture | null },
    intensity: { value: 0.35 },
    tint: { value: new THREE.Color('#fffaf3') }, // near-neutral: no colour cast on asphalt
  },
  vertexShader: thresholdShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform sampler2D tShafts; uniform float intensity; uniform vec3 tint;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 s = texture2D(tShafts, vUv).rgb;
      // soft-light style add: rays stay visible against sky, barely touch mid/dark tones
      float lum = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
      float protect = 1.0 - smoothstep(0.0, 0.6, lum) * 0.5;
      gl_FragColor = vec4(base.rgb + s * tint * intensity * protect, base.a);
    }`,
};

export class SunShaftsPass extends Pass {
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private thresholdMat: THREE.ShaderMaterial;
  private radialMat: THREE.ShaderMaterial;
  private compositeMat: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  /** 0..1 — how much of the effect to show (fades when the sun leaves the screen) */
  strength = 0;
  readonly sunScreen = new THREE.Vector2(0.5, 0.5);

  constructor(width: number, height: number) {
    super();
    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(Math.max(1, width >> 2), Math.max(1, height >> 2), opts);
    this.rtB = new THREE.WebGLRenderTarget(Math.max(1, width >> 2), Math.max(1, height >> 2), opts);
    this.thresholdMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(thresholdShader.uniforms), vertexShader: thresholdShader.vertexShader, fragmentShader: thresholdShader.fragmentShader, depthTest: false, depthWrite: false });
    this.radialMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(radialShader.uniforms), vertexShader: radialShader.vertexShader, fragmentShader: radialShader.fragmentShader, depthTest: false, depthWrite: false });
    this.compositeMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(compositeShader.uniforms), vertexShader: compositeShader.vertexShader, fragmentShader: compositeShader.fragmentShader, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.thresholdMat);
    this.needsSwap = true;
  }

  setSize(width: number, height: number) {
    this.rtA.setSize(Math.max(1, width >> 2), Math.max(1, height >> 2));
    this.rtB.setSize(Math.max(1, width >> 2), Math.max(1, height >> 2));
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    if (this.strength <= 0.001) {
      // pass-through
      this.compositeMat.uniforms.tDiffuse.value = readBuffer.texture;
      this.compositeMat.uniforms.tShafts.value = this.rtB.texture;
      this.compositeMat.uniforms.intensity.value = 0;
      this.quad.material = this.compositeMat;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      this.quad.render(renderer);
      renderer.autoClear = prevAuto;
      return;
    }
    // 1. threshold + downsample
    this.thresholdMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.thresholdMat.uniforms.sunPos.value.copy(this.sunScreen);
    this.quad.material = this.thresholdMat;
    renderer.setRenderTarget(this.rtA);
    renderer.clear();
    this.quad.render(renderer);
    // 2. radial blur, three growing passes (24 taps each → long smooth rays)
    this.quad.material = this.radialMat;
    this.radialMat.uniforms.sunPos.value.copy(this.sunScreen);
    const densities = [0.1, 0.25, 0.5];
    let src = this.rtA;
    let dst = this.rtB;
    for (const d of densities) {
      this.radialMat.uniforms.tDiffuse.value = src.texture;
      this.radialMat.uniforms.density.value = d;
      renderer.setRenderTarget(dst);
      renderer.clear();
      this.quad.render(renderer);
      const tmp = src;
      src = dst;
      dst = tmp;
    }
    // 3. composite
    this.compositeMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMat.uniforms.tShafts.value = src.texture;
    this.compositeMat.uniforms.intensity.value = 0.18 * this.strength;
    this.quad.material = this.compositeMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
    renderer.autoClear = prevAuto;
  }

  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.thresholdMat.dispose();
    this.radialMat.dispose();
    this.compositeMat.dispose();
    this.quad.dispose();
  }
}

/* ------------------------------------------------------------------ */
/*  Composer wrapper                                                   */
/* ------------------------------------------------------------------ */

export class CinematicFx {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly shafts: SunShaftsPass;
  enabled = true;
  private sunDir = new THREE.Vector3();
  private ndc = new THREE.Vector3();

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, private camera: THREE.PerspectiveCamera, width: number, height: number) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.shafts = new SunShaftsPass(width, height);
    this.composer.addPass(this.shafts);
    // gentle: only true emitters (LEDs, reflectors, sun) bloom; the scene itself stays untouched
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.07, 0.22, 3.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.setSize(width, height);
  }

  setSize(width: number, height: number) {
    const pr = this.renderer.getPixelRatio();
    this.composer.setSize(width, height);
    this.shafts.setSize(Math.floor(width * pr), Math.floor(height * pr));
  }

  /** Project the sun and fade the shafts in/out as it enters / leaves the frame. */
  updateSun(sunWorldOffset: THREE.Vector3) {
    this.sunDir.copy(sunWorldOffset).normalize();
    // a point far away in the sun's direction
    this.ndc.copy(this.camera.position).addScaledVector(this.sunDir, 2000).project(this.camera);
    const behind = this.ndc.z > 1;
    const sx = this.ndc.x * 0.5 + 0.5;
    const sy = this.ndc.y * 0.5 + 0.5;
    this.shafts.sunScreen.set(sx, sy);
    // strength: 1 inside the frame, fading to 0 at ~35% outside
    const margin = 0.35;
    const fx = 1 - THREE.MathUtils.smoothstep(Math.max(-sx, sx - 1, 0), 0, margin);
    const fy = 1 - THREE.MathUtils.smoothstep(Math.max(-sy, sy - 1, 0), 0, margin);
    const target = behind ? 0 : fx * fy;
    this.shafts.strength += (target - this.shafts.strength) * 0.15;
  }

  render() {
    this.composer.render();
  }

  dispose() {
    this.shafts.dispose();
    this.bloom.dispose();
    this.composer.dispose();
  }
}

/* ------------------------------------------------------------------ */
/*  Sakura petals                                                      */
/* ------------------------------------------------------------------ */

export class SakuraPetals {
  readonly mesh: THREE.InstancedMesh;
  private count: number;
  private pos: Float32Array;
  private phase: Float32Array;
  private spin: Float32Array;
  private fall: Float32Array;
  private box = new THREE.Vector3(70, 18, 70);
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private t = 0;
  private center = new THREE.Vector3();
  private windDir = new THREE.Vector2(0.7, 0.4).normalize();

  constructor(count = 420) {
    this.count = count;
    const geo = new THREE.PlaneGeometry(0.16, 0.11);
    // slight curl so petals catch light differently
    const pa = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.abs(pa.getX(i)) * 0.25);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffc4d6', emissive: '#ff9fbf', emissiveIntensity: 0.18, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.pos = new Float32Array(count * 3);
    this.phase = new Float32Array(count);
    this.spin = new Float32Array(count);
    this.fall = new Float32Array(count);
    const cols = ['#ffc4d6', '#ffd4e1', '#ffaec9', '#fff0f5'].map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.box.x;
      this.pos[i * 3 + 1] = Math.random() * this.box.y;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.box.z;
      this.phase[i] = Math.random() * Math.PI * 2;
      this.spin[i] = (Math.random() - 0.5) * 4;
      this.fall[i] = 0.55 + Math.random() * 0.6;
      this.mesh.setColorAt(i, cols[Math.floor(Math.random() * cols.length)]);
    }
  }

  /** Petals live in a box that follows the player; they wrap around its edges so the air is never empty. */
  update(dt: number, cx: number, cz: number, groundY: number) {
    this.t += dt;
    this.center.set(cx, 0, cz);
    const hx = this.box.x / 2;
    const hz = this.box.z / 2;
    const gust = 0.6 + 0.4 * Math.sin(this.t * 0.37);
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const ph = this.phase[i];
      // drift with the wind + flutter
      this.pos[i3] += (this.windDir.x * 1.6 * gust + Math.sin(this.t * 1.7 + ph) * 0.9) * dt;
      this.pos[i3 + 2] += (this.windDir.y * 1.6 * gust + Math.cos(this.t * 1.3 + ph * 1.3) * 0.9) * dt;
      this.pos[i3 + 1] -= this.fall[i] * dt * (0.8 + 0.4 * Math.sin(this.t * 2.1 + ph));
      // wrap inside the box around the player
      let rx = this.pos[i3] - cx;
      let rz = this.pos[i3 + 2] - cz;
      if (rx > hx) rx -= this.box.x;
      else if (rx < -hx) rx += this.box.x;
      if (rz > hz) rz -= this.box.z;
      else if (rz < -hz) rz += this.box.z;
      this.pos[i3] = cx + rx;
      this.pos[i3 + 2] = cz + rz;
      if (this.pos[i3 + 1] < groundY + 0.02) {
        this.pos[i3 + 1] = groundY + this.box.y * (0.7 + Math.random() * 0.3);
        this.pos[i3] = cx + (Math.random() - 0.5) * this.box.x;
        this.pos[i3 + 2] = cz + (Math.random() - 0.5) * this.box.z;
      }
      this.e.set(this.t * this.spin[i] + ph, this.t * 0.8 + ph * 2, Math.sin(this.t * 2 + ph) * 0.8);
      this.q.setFromEuler(this.e);
      this.p.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      const sc = 0.8 + 0.4 * ((i * 7919) % 13) / 13;
      this.s.set(sc, sc, sc);
      this.m4.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
