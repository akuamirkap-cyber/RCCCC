import * as THREE from 'three';

/** Continuous tire marks drawn as quads into a ring buffer geometry. */
export class SkidMarks {
  readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly attr: THREE.BufferAttribute;
  private readonly geom: THREE.BufferGeometry;
  private cursor = 0;
  private used = 0;
  private last = new Map<string, { x: number; z: number }>();

  constructor(private readonly max = 2400) {
    this.geom = new THREE.BufferGeometry();
    this.positions = new Float32Array(max * 4 * 3);
    this.attr = new THREE.BufferAttribute(this.positions, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    this.geom.setAttribute('position', this.attr);
    const index = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      const b = i * 4;
      index.set([b, b + 2, b + 1, b, b + 3, b + 2], i * 6);
    }
    this.geom.setIndex(new THREE.BufferAttribute(index, 1));
    this.geom.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x15151a,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.Mesh(this.geom, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  update(id: string, x: number, z: number, active: boolean, width = 0.36) {
    if (!active) {
      this.last.delete(id);
      return;
    }
    const prev = this.last.get(id);
    if (!prev) {
      this.last.set(id, { x, z });
      return;
    }
    const dx = x - prev.x;
    const dz = z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) return;
    if (len > 6) {
      this.last.set(id, { x, z });
      return;
    }
    const px = (dz / len) * width * 0.5;
    const pz = (-dx / len) * width * 0.5;
    const y = 0.035;
    const i = this.cursor * 12;
    const p = this.positions;
    p[i] = prev.x - px; p[i + 1] = y; p[i + 2] = prev.z - pz;
    p[i + 3] = prev.x + px; p[i + 4] = y; p[i + 5] = prev.z + pz;
    p[i + 6] = x + px; p[i + 7] = y; p[i + 8] = z + pz;
    p[i + 9] = x - px; p[i + 10] = y; p[i + 11] = z - pz;
    this.cursor = (this.cursor + 1) % this.max;
    this.used = Math.min(this.used + 1, this.max);
    this.attr.needsUpdate = true;
    this.geom.setDrawRange(0, this.used * 6);
    this.last.set(id, { x, z });
  }

  reset() {
    this.cursor = 0;
    this.used = 0;
    this.last.clear();
    this.geom.setDrawRange(0, 0);
  }
}

let softCircleCache: THREE.CanvasTexture | null = null;

/** Shared radial-gradient sprite texture (smoke puffs, light glows). */
export function softCircleTexture(): THREE.CanvasTexture {
  if (!softCircleCache) softCircleCache = makeSoftCircle();
  return softCircleCache;
}

function makeSoftCircle(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fluffy multi-lobe smoke puff texture. */
function makeSmokePuff(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const lobes: [number, number, number, number][] = [
    [64, 64, 40, 1],
    [44, 54, 28, 0.85],
    [84, 52, 26, 0.85],
    [56, 84, 26, 0.8],
    [80, 80, 24, 0.75],
    [64, 40, 22, 0.7],
  ];
  for (const [x, y, r, a] of lobes) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(255,255,255,${a * 0.45})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Particle {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  spin: number;
  alpha: number;
  from: THREE.Color;
  to: THREE.Color;
  // swirl mode: orbit around a (moving) wheel axle while young
  swirl: number; // 0 = none, otherwise angular speed (rad/s)
  swirlR: number;
  swirlA: number;
  swirlT: number; // seconds left of swirling
  anchor: WheelAnchor | null;
}

/** Live wheel position shared with the game (updated every frame) so swirling smoke follows the wheel. */
export interface WheelAnchor {
  x: number; // axle center
  y: number;
  z: number;
  axX: number; // axle direction (car right vector)
  axZ: number;
}

export interface SmokeTuning {
  size: number;
  duration: number;
  opacity: number;
  tint: number;
}

/** Pooled smoke puffs used for drifting / spinning tires. */
export class Smoke {
  readonly group = new THREE.Group();
  private pool: Particle[] = [];
  private next = 0;
  private tuning: SmokeTuning = { size: 1, duration: 1, opacity: 0.9, tint: 0.2 };
  private white = { from: new THREE.Color(0xc4c8cf), to: new THREE.Color(0xf7f8fb) };
  private burnt = { from: new THREE.Color(0x8f847e), to: new THREE.Color(0xd9d3ce) };

  constructor(count = 640) {
    const tex = makeSmokePuff();
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 5;
      this.group.add(sprite);
      this.pool.push({
        sprite,
        mat,
        life: 0,
        maxLife: 1,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 1,
        spin: 0,
        alpha: 1,
        from: new THREE.Color(),
        to: new THREE.Color(),
        swirl: 0,
        swirlR: 0,
        swirlA: 0,
        swirlT: 0,
        anchor: null,
      });
    }
  }

  setTuning(t: SmokeTuning) {
    this.tuning = { ...t };
  }

  private spawn(strength: number): Particle {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    const tn = this.tuning;
    p.maxLife = (1.1 + Math.random() * 0.9) * tn.duration;
    p.life = p.maxLife;
    p.size = (1.1 + strength * 1.1 + Math.random() * 0.5) * tn.size;
    p.alpha = (0.55 + Math.min(1, strength) * 0.35) * tn.opacity;
    p.spin = (Math.random() - 0.5) * 2.4;
    p.from.lerpColors(this.white.from, this.burnt.from, tn.tint);
    p.to.lerpColors(this.white.to, this.burnt.to, tn.tint);
    p.sprite.visible = true;
    p.mat.rotation = Math.random() * Math.PI * 2;
    p.mat.color.copy(p.from);
    p.swirl = 0;
    return p;
  }

  /** Free-floating puff (slide smoke thrown sideways / backwards). */
  emit(x: number, y: number, z: number, vx: number, vz: number, strength = 1) {
    const p = this.spawn(strength);
    p.vx = vx * 0.35 + (Math.random() - 0.5) * 2.4;
    p.vy = 1.2 + Math.random() * 1.6;
    p.vz = vz * 0.35 + (Math.random() - 0.5) * 2.4;
    p.sprite.position.set(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5);
  }

  /**
   * Puff that first orbits a spinning wheel (live `anchor`, radius r, angular speed omega —
   * negative = forward-rolling wheel: contact patch → behind → over the top) and then detaches.
   */
  emitSwirl(anchor: WheelAnchor, r: number, omega: number, bx: number, bz: number, strength = 1) {
    const p = this.spawn(strength * 0.75);
    p.size *= 0.42; // small puffs so the orbit around the tire stays readable
    p.swirl = omega;
    p.swirlR = r * (1.05 + Math.random() * 0.35);
    p.swirlA = -Math.PI * 0.5 - Math.random() * 0.7; // start at the contact patch, slightly behind
    p.swirlT = 0.16 + Math.random() * 0.2;
    p.anchor = anchor;
    p.vx = bx * 0.5 + (Math.random() - 0.5) * 1.5;
    p.vy = 1.6 + Math.random() * 1.4;
    p.vz = bz * 0.5 + (Math.random() - 0.5) * 1.5;
    this.placeSwirl(p);
  }

  private placeSwirl(p: Particle) {
    const a = p.anchor!;
    // orbit in the wheel plane: forward = perpendicular to the axle in the ground plane
    const fx = -a.axZ;
    const fz = a.axX;
    const c = Math.cos(p.swirlA);
    const s = Math.sin(p.swirlA);
    const side = (Math.random() - 0.5) * 0.2;
    p.sprite.position.set(a.x + fx * c * p.swirlR + a.axX * side, Math.max(0.12, a.y + s * p.swirlR), a.z + fz * c * p.swirlR + a.axZ * side);
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        p.mat.opacity = 0;
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      const grow = 1 - Math.pow(1 - t, 2.2); // fast initial expansion, then slow
      const s = (0.6 + grow * 3.4) * p.size;
      p.sprite.scale.set(s, s, 1);
      const fadeIn = Math.min(1, t * 8);
      p.mat.opacity = fadeIn * Math.pow(1 - t, 1.3) * p.alpha;
      p.mat.color.lerpColors(p.from, p.to, Math.min(1, t * 1.6));
      p.mat.rotation += p.spin * dt;

      if (p.swirl !== 0 && p.swirlT > 0 && p.anchor) {
        p.swirlT -= dt;
        p.swirlA += p.swirl * dt;
        p.swirlR += dt * 0.9; // spiral outward
        this.placeSwirl(p);
        if (p.swirlT <= 0) {
          // detach: fling along the current tangential direction, then float
          const a = p.anchor;
          const fx = -a.axZ;
          const fz = a.axX;
          const tx = -Math.sin(p.swirlA) * fx;
          const tz = -Math.sin(p.swirlA) * fz;
          const sp = Math.min(5, Math.abs(p.swirl) * p.swirlR * 0.25);
          p.vx += tx * sp * Math.sign(p.swirl);
          p.vz += tz * sp * Math.sign(p.swirl);
          p.vy += Math.max(0, -Math.cos(p.swirlA) * Math.sign(p.swirl)) * 1.2;
          p.swirl = 0;
          p.anchor = null;
        }
        continue;
      }

      const damp = Math.exp(-dt * 1.4);
      p.vx *= damp;
      p.vz *= damp;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      p.vy = Math.max(0.5, p.vy - dt * 0.9);
    }
  }

  reset() {
    for (const p of this.pool) {
      p.sprite.visible = false;
      p.life = 0;
    }
  }
}
