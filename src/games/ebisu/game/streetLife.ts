import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Track, WALL_DIST } from './track';
import type { Crowd } from './world';

/**
 * Street life for the Long Beach venue: the boulevard that rings the circuit (Shoreline Drive), moving traffic,
 * parked cars, street lamps, pedestrians on the sidewalks and a vendor village in the gaps between grandstands.
 * Everything heavy is instanced: ~1000 cars are three draw calls.
 */

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export const CAR_COLORS = ['#f4f4f2', '#d7d9dc', '#a7abb1', '#2b2d33', '#15161a', '#c62828', '#1e63d6', '#1f4f8a', '#2e6b4f', '#e2d4b2', '#f59e0b', '#7a1f2b', '#6b7280', '#f4f4f2', '#2b2d33'].map(
  (c) => new THREE.Color(c),
);

/** Low-poly hatchback/sedan: body + roof (instance colour), dark glass cabin, four wheels. Local +z = forward. */
export class CarPool {
  private spots: { x: number; z: number; yaw: number; color: THREE.Color }[] = [];
  private meshes: THREE.InstancedMesh[] = [];

  add(x: number, z: number, yaw: number, color: THREE.Color) {
    this.spots.push({ x, z, yaw, color });
    return this.spots.length - 1;
  }

  get count() {
    return this.spots.length;
  }

  build(scene: THREE.Scene, groundY: number) {
    const N = this.spots.length;
    if (!N) return;
    const body = new THREE.BoxGeometry(1.8, 0.55, 4.3).translate(0, 0.62, 0);
    const roof = new THREE.BoxGeometry(1.62, 0.07, 2.15).translate(0, 1.4, -0.2);
    const bodyGeo = mergeGeometries([body, roof])!;
    const glassGeo = new THREE.BoxGeometry(1.6, 0.5, 2.1).translate(0, 1.12, -0.2);
    const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10).rotateZ(Math.PI / 2);
    const wheels = mergeGeometries([
      wheel.clone().translate(-0.86, 0.34, 1.4),
      wheel.clone().translate(0.86, 0.34, 1.4),
      wheel.clone().translate(-0.86, 0.34, -1.4),
      wheel.clone().translate(0.86, 0.34, -1.4),
    ])!;
    const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.45 }), N);
    const glass = new THREE.InstancedMesh(glassGeo, new THREE.MeshStandardMaterial({ color: '#1b2330', roughness: 0.15, metalness: 0.6 }), N);
    const wh = new THREE.InstancedMesh(wheels, new THREE.MeshStandardMaterial({ color: '#15161a', roughness: 0.9 }), N);
    this.meshes = [bodies, glass, wh];
    this.spots.forEach((c, i) => {
      _q.setFromAxisAngle(UP, c.yaw);
      _m.compose(_p.set(c.x, groundY, c.z), _q, _s);
      for (const m of this.meshes) m.setMatrixAt(i, _m);
      bodies.setColorAt(i, c.color);
    });
    bodies.castShadow = true;
    for (const m of this.meshes) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.groundY = groundY;
  }
  private groundY = 0;

  /** Move one instance (used for the boulevard traffic). */
  setPose(i: number, x: number, z: number, yaw: number) {
    _q.setFromAxisAngle(UP, yaw);
    _m.compose(_p.set(x, this.groundY, z), _q, _s);
    for (const m of this.meshes) {
      m.setMatrixAt(i, _m);
      m.instanceMatrix.needsUpdate = true;
    }
  }
}

/** Street lamp: pole + arm + head, merged, instanced. Arm points to local +x. */
export class LampPool {
  private spots: { x: number; z: number; yaw: number }[] = [];
  add(x: number, z: number, yaw: number) {
    this.spots.push({ x, z, yaw });
  }
  build(scene: THREE.Scene, groundY: number) {
    const N = this.spots.length;
    if (!N) return;
    const pole = new THREE.CylinderGeometry(0.1, 0.14, 8, 7).translate(0, 4, 0);
    const arm = new THREE.BoxGeometry(2.4, 0.14, 0.14).translate(1.1, 8, 0);
    const head = new THREE.BoxGeometry(1.1, 0.22, 0.4).translate(2.1, 7.95, 0);
    const geo = mergeGeometries([pole, arm, head])!;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#8d939b', roughness: 0.55, metalness: 0.5 }), N);
    this.spots.forEach((l, i) => {
      _q.setFromAxisAngle(UP, l.yaw);
      _m.compose(_p.set(l.x, groundY, l.z), _q, _s);
      mesh.setMatrixAt(i, _m);
    });
    mesh.castShadow = true;
    scene.add(mesh);
  }
}

/* ------------------------------------------------------------------ */

export interface StreetLifeOptions {
  rand: () => number;
  groundY: number;
  crowd: Crowd;
  animated: ((dt: number) => void)[];
  cars: CarPool;
  lamps: LampPool;
  /** Stretches (metres along the track, outside side) already taken by grandstands. */
  occupied: { from: number; to: number }[];
  /** Vendor tent builder (striped canopy) from the venue. */
  tent: (x: number, z: number, rot: number) => void;
  /** Extra palm spot collector. */
  palm: (x: number, z: number) => void;
  /** Points to keep clear (e.g. the harbour). */
  blocked?: (x: number, z: number) => boolean;
}

type Pt = { x: number; z: number; tx: number; tz: number; d: number };

/** Offset polyline of the circuit with folds (concave corners tighter than the offset) removed. */
function offsetLoop(track: Track, off: number): Pt[] {
  const S = track.samples;
  const n = track.count;
  const raw: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const s = S[i];
    raw.push({ x: s.x + s.rx * off, z: s.z + s.rz * off });
  }
  // drop points whose local direction reverses against the track tangent (= inside a fold)
  const keep: boolean[] = new Array(n).fill(true);
  for (let i = 0; i < n; i++) {
    const a = raw[(i - 1 + n) % n];
    const b = raw[(i + 1) % n];
    const s = S[i];
    if ((b.x - a.x) * s.tx + (b.z - a.z) * s.tz < 0.3) keep[i] = false;
  }
  // also drop points that are closer to the centreline than the offset says (the fold's overlapping tails)
  for (let i = 0; i < n; i++) if (keep[i] && track.distanceToTrack(raw[i].x, raw[i].z) < Math.abs(off) - 4) keep[i] = false;
  const pts: Pt[] = [];
  let d = 0;
  let prev: { x: number; z: number } | null = null;
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    const p = raw[i];
    if (prev) d += Math.hypot(p.x - prev.x, p.z - prev.z);
    pts.push({ x: p.x, z: p.z, tx: 0, tz: 0, d });
    prev = p;
  }
  // tangents from neighbours (closed loop)
  const m = pts.length;
  for (let i = 0; i < m; i++) {
    const a = pts[(i - 1 + m) % m];
    const b = pts[(i + 1) % m];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    pts[i].tx = (b.x - a.x) / l;
    pts[i].tz = (b.z - a.z) / l;
  }
  return pts;
}

class Loop {
  readonly length: number;
  constructor(readonly pts: Pt[]) {
    const last = pts[pts.length - 1];
    const first = pts[0];
    this.length = last.d + Math.hypot(first.x - last.x, first.z - last.z);
  }
  /** Position + tangent at arc length d (wraps). */
  at(d: number, lateral = 0, out: { x: number; z: number; tx: number; tz: number }) {
    const L = this.length;
    d = ((d % L) + L) % L;
    const pts = this.pts;
    // binary search
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pts[mid].d <= d) lo = mid;
      else hi = mid - 1;
    }
    const a = pts[lo];
    const b = pts[(lo + 1) % pts.length];
    const segLen = lo === pts.length - 1 ? L - a.d : b.d - a.d;
    const t = segLen > 0 ? (d - a.d) / segLen : 0;
    const tx = a.tx + (b.tx - a.tx) * t;
    const tz = a.tz + (b.tz - a.tz) * t;
    const tl = Math.hypot(tx, tz) || 1;
    out.tx = tx / tl;
    out.tz = tz / tl;
    // right normal of the loop direction
    const rx = out.tz;
    const rz = -out.tx;
    out.x = a.x + (b.x - a.x) * t + rx * lateral;
    out.z = a.z + (b.z - a.z) * t + rz * lateral;
    return out;
  }
}

/** Flat quad strip along a loop between two lateral offsets. */
function loopStrip(loop: Loop, from: number, to: number, y: number, step = 4): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const o = { x: 0, z: 0, tx: 0, tz: 0 };
  const count = Math.ceil(loop.length / step);
  for (let k = 0; k <= count; k++) {
    const d = Math.min(loop.length, k * step);
    loop.at(d, from, o);
    pos.push(o.x, y, o.z);
    loop.at(d, to, o);
    pos.push(o.x, y, o.z);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(0, d / 8, 1, d / 8);
  }
  for (let k = 0; k < count; k++) {
    const a = k * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Short dashes along a loop (lane markings). */
function loopDashes(loop: Loop, lateral: number, y: number, dashLen: number, gapLen: number, width: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const nor: number[] = [];
  const o = { x: 0, z: 0, tx: 0, tz: 0 };
  let v = 0;
  for (let d = 0; d + dashLen < loop.length; d += dashLen + gapLen) {
    for (const dd of [d, d + dashLen]) {
      loop.at(dd, lateral - width / 2, o);
      pos.push(o.x, y, o.z);
      loop.at(dd, lateral + width / 2, o);
      pos.push(o.x, y, o.z);
      nor.push(0, 1, 0, 0, 1, 0);
    }
    idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Boulevard centre offset from the circuit centreline (outside of the loop = negative side). */
export const BOULEVARD_OFF = WALL_DIST + 43; // 59.4 m: behind the deepest grandstand, in front of the city blocks
export const BOULEVARD_HALF = 6;

export function buildStreetLife(scene: THREE.Scene, track: Track, o: StreetLifeOptions): void {
  const { rand, groundY, crowd, cars, lamps } = o;
  const S = track.samples;
  const n = track.count;
  const idxAt = (metres: number) => ((Math.round(metres / track.spacing) % n) + n) % n;
  const blocked = o.blocked ?? (() => false);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  /* ---------- the boulevard ring (asphalt, markings, sidewalks) ---------- */
  const loop = new Loop(offsetLoop(track, -BOULEVARD_OFF));
  const asphalt = new THREE.MeshStandardMaterial({ color: '#45484e', roughness: 1 });
  const paint = new THREE.MeshStandardMaterial({ color: '#e9e6d8', roughness: 0.8 });
  const walk = new THREE.MeshStandardMaterial({ color: '#cdd0d4', roughness: 1 });
  const road = new THREE.Mesh(loopStrip(loop, -BOULEVARD_HALF, BOULEVARD_HALF, groundY + 0.014), asphalt);
  road.receiveShadow = true;
  scene.add(road);
  scene.add(new THREE.Mesh(loopStrip(loop, -BOULEVARD_HALF - 3, -BOULEVARD_HALF, groundY + 0.02), walk));
  scene.add(new THREE.Mesh(loopStrip(loop, BOULEVARD_HALF, BOULEVARD_HALF + 3, groundY + 0.02), walk));
  const marks = mergeGeometries([
    loopDashes(loop, 0, groundY + 0.022, 3, 6, 0.22), // centre line dashes
    loopDashes(loop, -BOULEVARD_HALF + 0.3, groundY + 0.022, 40, 0.5, 0.16), // (almost) solid edge lines
    loopDashes(loop, BOULEVARD_HALF - 0.3, groundY + 0.022, 40, 0.5, 0.16),
  ])!;
  scene.add(new THREE.Mesh(marks, paint));

  const pose = { x: 0, z: 0, tx: 0, tz: 0 };
  const yawOf = (tx: number, tz: number) => Math.atan2(tx, tz);

  /* ---------- parked cars along both kerbs ---------- */
  for (const lat of [-BOULEVARD_HALF + 1.4, BOULEVARD_HALF - 1.4]) {
    for (let d = rand() * 7; d < loop.length - 5; d += 7) {
      if (rand() < 0.38) continue;
      loop.at(d, lat, pose);
      if (blocked(pose.x, pose.z)) continue;
      const fwd = lat > 0 ? 1 : -1; // park with the flow on each side
      cars.add(pose.x, pose.z, yawOf(pose.tx * fwd, pose.tz * fwd) + (rand() - 0.5) * 0.05, pick(CAR_COLORS));
    }
  }

  /* ---------- moving traffic (two lanes, opposite directions) ---------- */
  const movers: { i: number; d: number; v: number; lat: number; dir: 1 | -1 }[] = [];
  const perLane = 9;
  for (const dir of [1, -1] as const) {
    const lat = dir * 2.1;
    for (let k = 0; k < perLane; k++) {
      const d = (k / perLane) * loop.length + rand() * 20;
      loop.at(d, lat, pose);
      const i = cars.add(pose.x, pose.z, yawOf(pose.tx * dir, pose.tz * dir), pick(CAR_COLORS));
      movers.push({ i, d, v: 8 + rand() * 4, lat, dir });
    }
  }
  o.animated.push((dt) => {
    for (const mv of movers) {
      mv.d += mv.v * dt * mv.dir;
      loop.at(mv.d, mv.lat, pose);
      cars.setPose(mv.i, pose.x, pose.z, yawOf(pose.tx * mv.dir, pose.tz * mv.dir));
    }
  });

  /* ---------- lamps + palms + pedestrians on the sidewalks ---------- */
  for (let d = 0; d < loop.length - 10; d += 30) {
    for (const side of [-1, 1] as const) {
      const lat = side * (BOULEVARD_HALF + 1.6);
      loop.at(d + (side > 0 ? 15 : 0), lat, pose);
      if (blocked(pose.x, pose.z)) continue;
      // local +x (the arm) must point onto the road, i.e. against this side's normal
      const yawArm = yawOf(pose.tx, pose.tz) + (side > 0 ? Math.PI : 0);
      lamps.add(pose.x, pose.z, yawArm);
    }
  }
  for (let d = 12; d < loop.length - 10; d += 24) {
    loop.at(d, -(BOULEVARD_HALF + 2.3), pose); // circuit side of the boulevard
    if (!blocked(pose.x, pose.z)) o.palm(pose.x, pose.z);
  }
  for (let d = 0; d < loop.length; d += 5) {
    for (const side of [-1, 1] as const) {
      if (rand() < 0.55) continue;
      loop.at(d + rand() * 4, side * (BOULEVARD_HALF + 0.8 + rand() * 1.8), pose);
      if (blocked(pose.x, pose.z)) continue;
      crowd.add(pose.x, groundY, pose.z, { jumpChance: 0.02, flagChance: 0.03 });
    }
  }

  /* ---------- vendor village + parking rows in the gaps between grandstands (outside band) ---------- */
  const free = (m: number) => !o.occupied.some((r) => m > r.from && m < r.to);
  const truckMats = ['#e63946', '#f4a261', '#2a9d8f', '#ffd166', '#1e63d6', '#f1f1f1'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  const awningMat = new THREE.MeshStandardMaterial({ color: '#f7f9fc', roughness: 0.85, side: THREE.DoubleSide });
  const foodTruck = (x: number, z: number, yaw: number) => {
    const g = new THREE.Group();
    g.position.set(x, groundY, z);
    g.rotation.y = yaw;
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.6, 6.6), pick(truckMats));
    body.position.y = 1.3 + 0.35;
    body.castShadow = true;
    g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.9, 1.8), new THREE.MeshStandardMaterial({ color: '#f3f4f6', roughness: 0.5 }));
    cab.position.set(0, 1.3, 4.1);
    g.add(cab);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 4.4), awningMat);
    awning.position.set(2.2, 2.75, -0.3);
    awning.rotation.z = 0.35;
    g.add(awning);
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 3.6), new THREE.MeshStandardMaterial({ color: '#1b2330', roughness: 0.3, metalness: 0.4 }));
    hatch.position.set(1.26, 2.1, -0.3);
    g.add(hatch);
    for (const [wx, wz] of [
      [-1.0, 2.2],
      [1.0, 2.2],
      [-1.0, -2.2],
      [1.0, -2.2],
    ]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), new THREE.MeshStandardMaterial({ color: '#15161a', roughness: 0.9 }));
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.42, wz);
      g.add(w);
    }
    scene.add(g);
  };
  const outsideAt = (metres: number, dist: number) => {
    const s = S[idxAt(metres)];
    return { x: s.x - s.rx * dist, z: s.z - s.rz * dist, angle: s.angle, s };
  };
  const total = track.length;
  let m = 20;
  while (m < total - 20) {
    if (!free(m) || !free(m + 30)) {
      m += 8;
      continue;
    }
    // one cluster: tent, food truck, tent + a crowd queueing in front, then a parking row behind
    const a = outsideAt(m, WALL_DIST + 23);
    if (!blocked(a.x, a.z)) {
      o.tent(a.x, a.z, a.angle);
      for (let k = 0; k < 7; k++) {
        const q = outsideAt(m - 5 + rand() * 10, WALL_DIST + 15 + rand() * 4);
        crowd.add(q.x, groundY, q.z, { jumpChance: 0.05, flagChance: 0.02 });
      }
    }
    const t = outsideAt(m + 14, WALL_DIST + 24);
    if (!blocked(t.x, t.z)) {
      foodTruck(t.x, t.z, t.angle); // long axis along the track, hatch facing the circuit
      for (let k = 0; k < 6; k++) {
        const q = outsideAt(m + 10 + rand() * 8, WALL_DIST + 17 + rand() * 3);
        crowd.add(q.x, groundY, q.z, { jumpChance: 0.03, flagChance: 0.02 });
      }
    }
    const b = outsideAt(m + 28, WALL_DIST + 23);
    if (!blocked(b.x, b.z)) o.tent(b.x, b.z, b.angle);
    // angled parking row behind the vendors (nose toward the circuit)
    for (let k = -2; k < 34; k += 3.2) {
      if (rand() < 0.3) continue;
      const c = outsideAt(m + k, WALL_DIST + 30.5);
      if (blocked(c.x, c.z)) continue;
      cars.add(c.x, c.z, c.angle + Math.PI / 2 - 0.6, pick(CAR_COLORS));
    }
    m += 48 + rand() * 30;
  }
}
