import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Track, WALL_DIST } from './track';
import type { DriftZone } from './zones';

/* ============================================================
   PRO BARRIERS — W-beam Armco with reflectors, TecPro-style
   corner blocks, hyper-visual traffic cones
   ============================================================ */

const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

const circDist = (a: number, b: number, n: number) => {
  const d = Math.abs(a - b) % n;
  return Math.min(d, n - d);
};

/** Extrudes a lateral/vertical profile along the whole loop at `side` of the track. */
function buildProfileStrip(track: Track, side: 1 | -1, baseOff: number, profile: [number, number][], vScale: number): THREE.BufferGeometry {
  const n = track.count;
  const s = track.samples;
  const cols = profile.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k <= n; k++) {
    const i = k % n;
    const sm = s[i];
    const v = (k === n ? track.length : sm.dist) / vScale;
    for (let c = 0; c < cols; c++) {
      const [d, y] = profile[c];
      const off = (baseOff + d) * side;
      pos.push(sm.x + sm.rx * off, y, sm.z + sm.rz * off);
      uv.push(c / (cols - 1), v);
    }
  }
  for (let k = 0; k < n; k++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = k * cols + c;
      const b = a + cols;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Galvanised-steel texture with subtle streaks + bolt heads. */
function makeGalvTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c9ced4';
  ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 256;
    const w = 2 + Math.random() * 12;
    ctx.fillStyle = `rgba(${90 + Math.random() * 60},${95 + Math.random() * 60},${100 + Math.random() * 60},${0.08 + Math.random() * 0.12})`;
    ctx.fillRect(x, 0, w, 128);
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.1})`;
    ctx.fillRect(Math.random() * 256, 0, 1 + Math.random() * 3, 128);
  }
  // bolt heads (two per panel: v tiles every 4 m)
  ctx.fillStyle = '#6d7278';
  for (const y of [40, 88]) {
    ctx.beginPath();
    ctx.arc(128, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface BarrierOptions {
  groundY: number;
  aniso: number;
  rand: () => number;
}

/** Continuous W-beam Armco on both sides: real profile, galvanised finish, dark posts, red/white reflectors. */
export function buildGuardrails(scene: THREE.Scene, track: Track, o: BarrierOptions): void {
  const n = track.count;
  const s = track.samples;
  const Y = o.groundY;
  const galv = makeGalvTexture();
  galv.anisotropy = o.aniso;
  const railMat = new THREE.MeshStandardMaterial({ map: galv, color: '#eef1f4', metalness: 0.78, roughness: 0.32, side: THREE.DoubleSide, envMapIntensity: 1.1 });
  // W-beam cross section (lateral bulge toward the track, height 0.31 m) — values are (dOff, y)
  const profile: [number, number][] = [
    [-0.02, Y + 0.42],
    [-0.09, Y + 0.48],
    [-0.02, Y + 0.55],
    [-0.09, Y + 0.62],
    [-0.02, Y + 0.7],
    [-0.05, Y + 0.73],
  ];
  for (const side of [1, -1] as const) {
    const beam = new THREE.Mesh(buildProfileStrip(track, side, WALL_DIST + 0.4, profile, 4), railMat);
    beam.receiveShadow = true;
    beam.castShadow = true;
    scene.add(beam);
    // lower rub rail (keeps cars from going under)
    const rub = new THREE.Mesh(buildProfileStrip(track, side, WALL_DIST + 0.4, [[-0.03, Y + 0.22], [-0.06, Y + 0.26], [-0.03, Y + 0.3]], 4), railMat);
    scene.add(rub);
  }
  // posts (dark steel sigma posts) every 4 samples + block-outs
  const postSpots: { x: number; z: number; a: number; side: number; idx: number }[] = [];
  for (let i = 0; i < n; i += 4) {
    const sm = s[i];
    for (const side of [1, -1] as const) {
      postSpots.push({ x: sm.x + sm.rx * (WALL_DIST + 0.52) * side, z: sm.z + sm.rz * (WALL_DIST + 0.52) * side, a: sm.angle, side, idx: i });
    }
  }
  const postMat = new THREE.MeshStandardMaterial({ color: '#5f656c', metalness: 0.6, roughness: 0.5 });
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.95, 0.18), postMat, postSpots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  postSpots.forEach((ps, i) => {
    q.setFromAxisAngle(UP, ps.a);
    m4.compose(p.set(ps.x, Y + 0.475, ps.z), q, ONE);
    posts.setMatrixAt(i, m4);
  });
  posts.castShadow = true;
  scene.add(posts);
  // reflectors on every other post: red on the right-hand barrier, white on the left (driver's view)
  const reflSpots = postSpots.filter((_, i) => i % 4 < 2);
  const reflGeo = new THREE.BoxGeometry(0.03, 0.12, 0.08);
  const reflRed = new THREE.InstancedMesh(reflGeo, new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff1c1c', emissiveIntensity: 0.9, roughness: 0.3 }), reflSpots.length);
  const reflWhite = new THREE.InstancedMesh(reflGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.7, roughness: 0.3 }), reflSpots.length);
  let nr = 0;
  let nw = 0;
  reflSpots.forEach((ps) => {
    q.setFromAxisAngle(UP, ps.a);
    // sits on the beam face, toward the track
    const sm = s[ps.idx];
    m4.compose(p.set(sm.x + sm.rx * (WALL_DIST + 0.33) * ps.side, Y + 0.84, sm.z + sm.rz * (WALL_DIST + 0.33) * ps.side), q, ONE);
    if (ps.side === -1) reflRed.setMatrixAt(nr++, m4);
    else reflWhite.setMatrixAt(nw++, m4);
  });
  reflRed.count = nr;
  reflWhite.count = nw;
  scene.add(reflRed, reflWhite);
}

/** TecPro-style energy-absorbing blocks on the outside of every corner (red/white, dark rubber cap, straps). */
export function buildCornerBlocks(scene: THREE.Scene, track: Track, zones: DriftZone[], o: BarrierOptions): void {
  const n = track.count;
  const s = track.samples;
  const spots: { x: number; z: number; a: number; red: boolean }[] = [];
  let count = 0;
  for (let i = 0; i < n; i += 4) {
    const sm = s[i];
    if (Math.abs(sm.curv) < 0.011) continue;
    if (zones.some((z) => circDist(i, z.apex, n) <= 7)) continue;
    const side = -Math.sign(sm.curv);
    const off = (WALL_DIST + 1.15) * side;
    spots.push({ x: sm.x + sm.rx * off, z: sm.z + sm.rz * off, a: sm.angle, red: count % 2 === 0 });
    count++;
  }
  if (!spots.length) return;
  const blockGeo = new RoundedBoxGeometry(0.72, 1.0, 1.95, 3, 0.1);
  const blocks = new THREE.InstancedMesh(blockGeo, new THREE.MeshStandardMaterial({ roughness: 0.55 }), spots.length);
  const capGeo = new THREE.BoxGeometry(0.76, 0.08, 2.0);
  const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: '#15161a', roughness: 0.9 }), spots.length);
  const strapGeo = new THREE.BoxGeometry(0.78, 0.9, 0.08);
  const straps = new THREE.InstancedMesh(strapGeo, new THREE.MeshStandardMaterial({ color: '#2a2c31', roughness: 0.8 }), spots.length * 2);
  const red = new THREE.Color('#e5202e');
  const white = new THREE.Color('#f6f6f4');
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  spots.forEach((b, i) => {
    q.setFromAxisAngle(UP, b.a);
    m4.compose(p.set(b.x, o.groundY + 0.5, b.z), q, ONE);
    blocks.setMatrixAt(i, m4);
    blocks.setColorAt(i, b.red ? red : white);
    m4.compose(p.set(b.x, o.groundY + 1.02, b.z), q, ONE);
    caps.setMatrixAt(i, m4);
    const fx = Math.sin(b.a);
    const fz = Math.cos(b.a);
    for (let k = 0; k < 2; k++) {
      const d = k === 0 ? -0.6 : 0.6;
      m4.compose(p.set(b.x + fx * d, o.groundY + 0.5, b.z + fz * d), q, ONE);
      straps.setMatrixAt(i * 2 + k, m4);
    }
  });
  blocks.castShadow = blocks.receiveShadow = true;
  scene.add(blocks, caps, straps);
}

/** Hyper-visual traffic cone: glossy orange body, glowing retro-reflective bands, rubber base. */
export function makeTrafficCone(): { geometry: THREE.BufferGeometry; materials: THREE.Material[] } {
  const parts: THREE.BufferGeometry[] = [];
  const toNI = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
  const base = toNI(new RoundedBoxGeometry(0.44, 0.05, 0.44, 2, 0.015));
  base.translate(0, 0.025, 0);
  parts.push(base); // group 0 → rubber
  const H0 = 0.05;
  const H1 = 0.8;
  const rAt = (y: number) => 0.175 - (y - H0) * ((0.175 - 0.028) / (H1 - H0));
  const seg = (y0: number, y1: number, bulge: number, closedTop: boolean) => {
    const g = new THREE.CylinderGeometry(rAt(y1) + bulge, rAt(y0) + bulge, y1 - y0, 18, 1, !closedTop);
    g.translate(0, (y0 + y1) / 2, 0);
    return toNI(g);
  };
  // orange body pieces (group 1)
  const orange = mergeGeometries([seg(H0, 0.22, 0, false), seg(0.33, 0.47, 0, false), seg(0.58, H1, 0, true)], false)!;
  parts.push(orange);
  // reflective bands (group 2)
  const bands = mergeGeometries([seg(0.22, 0.33, 0.008, false), seg(0.47, 0.58, 0.008, false)], false)!;
  parts.push(bands);
  const geometry = mergeGeometries(parts, true)!;
  const materials = [
    new THREE.MeshStandardMaterial({ color: '#111216', roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: '#ff6a00', emissive: '#ff3d00', emissiveIntensity: 0.22, roughness: 0.3, metalness: 0.05, envMapIntensity: 1.0 }),
    new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.3, envMapIntensity: 1.4 }),
  ];
  return { geometry, materials };
}
