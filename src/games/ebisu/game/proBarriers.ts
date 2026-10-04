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
  const reflRed = new THREE.InstancedMesh(reflGeo, new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff1c1c', emissiveIntensity: 2.6, roughness: 0.3 }), reflSpots.length);
  const reflWhite = new THREE.InstancedMesh(reflGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 2.2, roughness: 0.3 }), reflSpots.length);
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

/** Hypercasual traffic cone: chunky, rounded (no sharp tip), glossy orange, glowing bands, fat rubber base. */
export function makeTrafficCone(): { geometry: THREE.BufferGeometry; materials: THREE.Material[] } {
  const parts: THREE.BufferGeometry[] = [];
  const toNI = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
  const base = toNI(new RoundedBoxGeometry(0.56, 0.08, 0.56, 3, 0.035));
  base.translate(0, 0.04, 0);
  parts.push(base); // group 0 → rubber
  const H0 = 0.08;
  const H1 = 0.66;
  const R0 = 0.21;
  const R1 = 0.1;
  const rAt = (y: number) => R0 - (y - H0) * ((R0 - R1) / (H1 - H0));
  const seg = (y0: number, y1: number, bulge: number) => {
    const g = new THREE.CylinderGeometry(rAt(y1) + bulge, rAt(y0) + bulge, y1 - y0, 22, 1, true);
    g.translate(0, (y0 + y1) / 2, 0);
    return toNI(g);
  };
  // rounded dome on top instead of a point
  const dome = new THREE.SphereGeometry(R1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.translate(0, H1, 0);
  const orange = mergeGeometries([seg(H0, 0.24, 0), seg(0.34, 0.46, 0), seg(0.56, H1, 0), toNI(dome)], false)!;
  parts.push(orange); // group 1 → orange
  const bands = mergeGeometries([seg(0.24, 0.34, 0.012), seg(0.46, 0.56, 0.012)], false)!;
  parts.push(bands); // group 2 → reflective
  const geometry = mergeGeometries(parts, true)!;
  const materials = [
    new THREE.MeshStandardMaterial({ color: '#111216', roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff4a00', emissiveIntensity: 0.3, roughness: 0.28, metalness: 0.0, envMapIntensity: 1.0 }),
    new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.3, envMapIntensity: 1.4 }),
  ];
  return { geometry, materials };
}

/* ------------------------------------------------------------------ */
/*  Sponsor hoardings                                                  */
/* ------------------------------------------------------------------ */

const SPONSOR_FONT = '"Barlow Condensed", "Arial Narrow", Impact, Arial, sans-serif';

/** One 8 m panel per brand — drift / tuning industry names, each with its own livery. */
const BRANDS: [string, string, string][] = [
  ['TOYO TIRES', '#c8102e', '#ffffff'],
  ['HKS', '#111318', '#ffffff'],
  ['ADVAN', '#e30613', '#ffffff'],
  ['GReddy', '#ffffff', '#1d4ed8'],
  ['D1 GRAND PRIX', '#0b0d12', '#ffb703'],
  ['WORK WHEELS', '#ffffff', '#111318'],
  ['TEIN', '#009b3a', '#ffffff'],
  ['FALKEN', '#1d4ed8', '#5ee6ff'],
  ['BRIDE', '#111318', '#ff6a00'],
  ['EBISU CIRCUIT', '#ff5a1f', '#ffffff'],
  ['NANKANG', '#ffd60a', '#111318'],
  ['TOMEI', '#7f1d1d', '#ffffff'],
];

/** Long strip texture: `count` consecutive brand panels starting at `offset` (so different walls show different brands). */
export function makeSponsorStrip(offset = 0, count = 6): THREE.CanvasTexture {
  const pw = 512;
  const ph = 128;
  const c = document.createElement('canvas');
  c.width = pw * count;
  c.height = ph;
  const ctx = c.getContext('2d')!;
  for (let k = 0; k < count; k++) {
    const [name, bg, fg] = BRANDS[(offset + k) % BRANDS.length];
    const x0 = k * pw;
    ctx.fillStyle = bg;
    ctx.fillRect(x0, 0, pw, ph);
    // frame + subtle gloss
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x0, 0, pw, 6);
    ctx.fillRect(x0, ph - 6, pw, 6);
    ctx.fillRect(x0, 0, 3, ph);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x0, 8, pw, ph * 0.3);
    ctx.font = `800 ${name.length > 10 ? 60 : 76}px ${SPONSOR_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    ctx.fillText(name, x0 + pw / 2, ph / 2 + 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Vertical wall following the track over a sample range (double-sided, u = metres / uScale). */
function buildRangeWall(track: Track, start: number, len: number, offset: number, y0: number, y1: number, uScale: number): THREE.BufferGeometry {
  const n = track.count;
  const s = track.samples;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k <= len; k++) {
    const sm = s[(start + k) % n];
    const x = sm.x + sm.rx * offset;
    const z = sm.z + sm.rz * offset;
    const u = (k * track.spacing) / uScale;
    pos.push(x, y0, z, x, y1, z);
    uv.push(u, 0, u, 1);
  }
  for (let k = 0; k < len; k++) {
    const a = k * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface SponsorOptions extends BarrierOptions {
  /** sample ranges to skip (start straight: grandstand + pit wall handle their own branding) */
  skipStart?: number;
  skipEnd?: number;
}

/**
 * Places sponsor hoardings where a real circuit sells them:
 *  - continuous boards along every straight, BOTH sides, just behind the Armco
 *  - "TV corner" boards on the outside of every drift zone (fence line, under the crowd's eye-line)
 *  - framed by a dark top rail + posts so they read as real signage panels
 */
export function buildSponsorBoards(scene: THREE.Scene, track: Track, zones: DriftZone[], o: SponsorOptions): void {
  const n = track.count;
  const s = track.samples;
  const Y = o.groundY;
  const inZone = new Uint8Array(n);
  for (const z of zones) for (let k = 0; k < z.len; k++) inZone[(z.start + k) % n] = 1;

  const railMat = new THREE.MeshStandardMaterial({ color: '#1b1e25', roughness: 0.6, metalness: 0.4 });
  const postGeo = new THREE.BoxGeometry(0.14, 2.5, 0.14);
  const postSpots: { x: number; z: number; y: number }[] = [];
  let brandOffset = 0;

  const placeWall = (start: number, len: number, offset: number, y0: number, y1: number) => {
    const tex = makeSponsorStrip(brandOffset, 6);
    tex.anisotropy = o.aniso;
    brandOffset += 5;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(buildRangeWall(track, start, len, offset, y0, y1, 16), mat);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    // top rail
    const rail = new THREE.Mesh(buildRangeWall(track, start, len, offset, y1, y1 + 0.1, 16), railMat);
    scene.add(rail);
    for (let k = 0; k <= len; k += 13) {
      const sm = s[(start + k) % n];
      postSpots.push({ x: sm.x + sm.rx * offset, z: sm.z + sm.rz * offset, y: (y0 + y1) / 2 });
    }
  };

  // straights
  const skipA = o.skipStart ?? 0;
  const skipB = o.skipEnd ?? n;
  let runStart = -1;
  for (let i = 0; i <= n; i++) {
    const straight = i < n && Math.abs(s[i].curv) < 0.006 && !inZone[i] && !(i < skipA || i > skipB);
    if (straight && runStart < 0) runStart = i;
    if (!straight && runStart >= 0) {
      const len = i - runStart;
      if (len >= 20) {
        for (const side of [1, -1] as const) placeWall(runStart + 2, len - 4, (WALL_DIST + 1.3) * side, Y + 0.05, Y + 2.55);
      }
      runStart = -1;
    }
  }
  // corner boards on the outside of every zone (fence line)
  for (const z of zones) {
    const side = -z.dir;
    placeWall(z.start, z.len, (WALL_DIST + 1.95) * side, Y, Y + 2.2);
  }

  if (postSpots.length) {
    const posts = new THREE.InstancedMesh(postGeo, railMat, postSpots.length);
    const m4 = new THREE.Matrix4();
    postSpots.forEach((ps, i) => {
      m4.makeTranslation(ps.x, ps.y, ps.z);
      posts.setMatrixAt(i, m4);
    });
    scene.add(posts);
  }
}
