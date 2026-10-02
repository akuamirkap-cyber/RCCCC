import * as THREE from 'three';
import { Track, HALF_WIDTH, CURB_WIDTH, WALL_DIST, TRACK_WIDTH } from './track';
import { zoneLookup, type DriftZone } from './zones';

export interface WorldRefs {
  sun: THREE.DirectionalLight;
  /** Ambient animation: crowd, clouds, balloons, windmill. */
  update: (dt: number) => void;
}

/** Sun position relative to the player (also drives the sun disc in the sky). Lower + warmer = golden-hour look. */
export const SUN_OFFSET = new THREE.Vector3(65, 58, 38);
const SUN_DIR = SUN_OFFSET.clone().normalize();
const FOG_COLOR = '#d9e1f2';
const GROUND_Y = -0.08;
const TERRAIN_SIZE = 2400;
const TERRAIN_SEGS = 200;
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const FONT = '"Fredoka", "Arial Black", Impact, sans-serif';

/** Lake in the infield (rotated ellipse). */
const LAKE = { x: 0, z: 68, rx: 20, rz: 13, rot: 0.35 };

/* ------------------------------------------------------------------ */
/*  Deterministic random & noise                                       */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
}

function fbm(x: number, z: number, octaves = 4): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    s += amp * valueNoise(x * f, z * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.07;
  }
  return s / norm;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
const circDist = (a: number, b: number, n: number) => {
  const d = Math.abs(a - b) % n;
  return Math.min(d, n - d);
};

/* ------------------------------------------------------------------ */
/*  Textures                                                           */
/* ------------------------------------------------------------------ */

/** Warm mid-grey asphalt with aggregate speckle, subtle patches, faint cracks and crisp edge lines. */
function makeRoadTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const rnd = mulberry32(4242);
  ctx.fillStyle = '#484b52';
  ctx.fillRect(0, 0, W, H);
  // large soft patches (repaved areas / wear)
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 40 + rnd() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() < 0.5;
    g.addColorStop(0, light ? 'rgba(120,120,126,0.22)' : 'rgba(58,58,64,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fine aggregate speckle
  for (let i = 0; i < 26000; i++) {
    const v = 70 + rnd() * 70;
    ctx.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + rnd() * 0.4})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  // occasional bright stones
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(190,190,196,${0.15 + rnd() * 0.3})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1, 1);
  }
  // darker worn tire lines at ~1/4 and ~3/4 of the width
  for (const cxLine of [W * 0.27, W * 0.73]) {
    const g = ctx.createLinearGradient(cxLine - 60, 0, cxLine + 60, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.13)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cxLine - 60, 0, 120, H);
  }
  // faint cracks
  ctx.strokeStyle = 'rgba(30,30,34,0.45)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    let x = rnd() * W;
    let y = rnd() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (rnd() - 0.5) * 30;
      y += (rnd() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // thick white edge lines, no center line (drift-course style)
  ctx.fillStyle = '#f2f0e9';
  ctx.fillRect(0, 0, 15, H);
  ctx.fillRect(W - 15, 0, 15, H);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeCheckerTexture(cols: number, rows: number, a = '#111111', b = '#f4f4f4'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = cols * 8;
  c.height = rows * 8;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? a : b;
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeGrassDetailTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.1})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface TextOpts {
  w?: number;
  h?: number;
  bg?: string;
  fg?: string;
  size?: number;
  checker?: boolean;
}

/** Bold outlined text on a colored background (banners, gates, signs). */
function makeTextTexture(text: string, o: TextOpts = {}): THREE.CanvasTexture {
  const w = o.w ?? 1024;
  const h = o.h ?? 96;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = o.bg ?? '#15181f';
  ctx.fillRect(0, 0, w, h);
  if (o.checker) {
    const sq = h / 2;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#15181f' : '#f4f4f4';
        ctx.fillRect(i * sq, j * sq, sq, sq);
        ctx.fillRect(w - (i + 1) * sq, j * sq, sq, sq);
      }
    }
  }
  const size = o.size ?? Math.round(h * 0.6);
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.13);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeText(text, w / 2, h / 2 + size * 0.05);
  ctx.fillStyle = o.fg ?? '#ffffff';
  ctx.fillText(text, w / 2, h / 2 + size * 0.05);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSponsorTexture(): THREE.CanvasTexture {
  const panels: [string, string, string, number][] = [
    ['エビスサーキット', '#c8102e', '#ffffff', 58],
    ['DRIFT 天国', '#15181f', '#ffd166', 64],
    ['FUJI TIRE 富士', '#0a3d91', '#ffffff', 54],
    ['APEX 山', '#ffd23f', '#15181f', 72],
  ];
  const pw = 512;
  const ph = 128;
  const c = document.createElement('canvas');
  c.width = pw * panels.length;
  c.height = ph;
  const ctx = c.getContext('2d')!;
  panels.forEach(([text, bg, fg, size], i) => {
    const x0 = i * pw;
    ctx.fillStyle = bg;
    ctx.fillRect(x0, 0, pw, ph);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x0, ph - 14, pw, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x0 + pw - 4, 0, 4, ph);
    ctx.font = `700 ${size}px ${FONT}, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeText(text, x0 + pw / 2, ph / 2 + 2);
    ctx.fillStyle = fg;
    ctx.fillText(text, x0 + pw / 2, ph / 2 + 2);
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeGarageTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 192;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d7dde6';
  ctx.fillRect(0, 0, 1024, 192);
  ctx.fillStyle = '#ff5a1f';
  ctx.fillRect(0, 0, 1024, 16);
  ctx.fillStyle = '#2b2f3a';
  ctx.fillRect(0, 180, 1024, 12);
  for (let i = 0; i < 6; i++) {
    const x = 36 + i * 162;
    ctx.fillStyle = '#3a4250';
    ctx.fillRect(x, 60, 120, 122);
    ctx.fillStyle = '#2b3040';
    for (let y = 72; y < 182; y += 16) ctx.fillRect(x, y, 120, 3);
    ctx.fillStyle = '#15181f';
    ctx.fillRect(x + 34, 22, 52, 32);
    ctx.font = `700 28px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd166';
    ctx.fillText(String(i + 1), x + 60, 39);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeScreenTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 288;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, 512, 288);
  ctx.fillStyle = '#c8102e';
  ctx.fillRect(0, 0, 512, 46);
  ctx.font = `700 28px ${FONT}, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('EBISU エビス', 18, 24);
  ctx.fillStyle = '#ff2a2a';
  ctx.beginPath();
  ctx.arc(430, 23, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText('LIVE', 446, 24);
  const rows: [string, string][] = [
    ['#ff5a1f', 'YOU'],
    ['#2f80ff', 'BLAZE'],
    ['#27c26a', 'VIPER'],
    ['#b455f5', 'NOVA'],
  ];
  rows.forEach(([col, name], i) => {
    const y = 70 + i * 44;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(14, y - 16, 484, 36);
    ctx.fillStyle = col;
    ctx.fillRect(22, y - 9, 22, 22);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(`P${i + 1}  ${name}`, 56, y + 2);
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'right';
    ctx.fillText(i === 0 ? 'DRIFT ×3' : `+${(i * 1.7).toFixed(1)}s`, 490, y + 2);
    ctx.textAlign = 'left';
  });
  ctx.fillStyle = '#c77dff';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText('★ DRIFT ZONES ACTIVE ★', 18, 262);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeFenceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(225,229,236,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 32);
  ctx.lineTo(32, 0);
  ctx.lineTo(64, 32);
  ctx.lineTo(32, 64);
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.lineTo(64, 3);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Vertical Japanese banner (nobori): colored cloth with top-to-bottom text. */
function makeNoboriTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 512);
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(64, 52, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bg;
  ctx.font = '700 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('走', 64, 54);
  ctx.fillStyle = fg;
  ctx.font = '700 72px sans-serif';
  const chars = [...text];
  const step = Math.min(88, 380 / Math.max(1, chars.length));
  const y0 = 130 + step / 2;
  chars.forEach((ch, i) => ctx.fillText(ch, 64, y0 + i * step));
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, 10, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/*  Track-following geometry                                           */
/* ------------------------------------------------------------------ */

/** Flat strip between two lateral offsets along the whole track. */
function buildStrip(track: Track, from: number, to: number, y: number, uvScale: number): THREE.BufferGeometry {
  const n = track.count;
  const s = track.samples;
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    const sm = s[k];
    const v = (i === n ? track.length : sm.dist) / uvScale;
    pos.push(sm.x + sm.rx * from, y, sm.z + sm.rz * from, sm.x + sm.rx * to, y, sm.z + sm.rz * to);
    uv.push(0, v, 1, v);
    nor.push(0, 1, 0, 0, 1, 0);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Flat strip for a sample range, optionally with alternating color bands. */
function buildRangeStrip(
  track: Track,
  start: number,
  len: number,
  from: number,
  to: number,
  y: number,
  bands?: { len: number; a: THREE.Color; b: THREE.Color },
): THREE.BufferGeometry {
  const n = track.count;
  const s = track.samples;
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k <= len; k++) {
    const sm = s[(start + k) % n];
    pos.push(sm.x + sm.rx * from, y, sm.z + sm.rz * from, sm.x + sm.rx * to, y, sm.z + sm.rz * to);
    nor.push(0, 1, 0, 0, 1, 0);
    if (bands) {
      const c = Math.floor((k * track.spacing) / bands.len) % 2 === 0 ? bands.a : bands.b;
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
  }
  for (let k = 0; k < len; k++) {
    const a = k * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (bands) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** Vertical wall / fence / billboard following a sample range at a lateral offset. */
function buildWallStrip(track: Track, start: number, len: number, offset: number, y0: number, y1: number, uScale: number): THREE.BufferGeometry {
  const n = track.count;
  const s = track.samples;
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const sg = Math.sign(offset) || 1;
  for (let k = 0; k <= len; k++) {
    const sm = s[(start + k) % n];
    const x = sm.x + sm.rx * offset;
    const z = sm.z + sm.rz * offset;
    pos.push(x, y0, z, x, y1, z);
    const u = (k * track.spacing) / uScale;
    uv.push(u, 0, u, 1);
    nor.push(-sm.rx * sg, 0, -sm.rz * sg, -sm.rx * sg, 0, -sm.rz * sg);
  }
  for (let k = 0; k < len; k++) {
    const a = k * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Curb strip with alternating red/white segments via vertex colors. */
function buildCurb(track: Track, side: 1 | -1): THREE.BufferGeometry {
  const n = track.count;
  const s = track.samples;
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const red = new THREE.Color('#e63946');
  const white = new THREE.Color('#f5f5f5');
  const y = 0.02;
  const inner = HALF_WIDTH * side;
  const outer = (HALF_WIDTH + CURB_WIDTH) * side;
  for (let i = 0; i < n; i++) {
    const a = s[i];
    const b = s[(i + 1) % n];
    const c = Math.floor(a.dist / 3) % 2 === 0 ? red : white;
    const ai = [a.x + a.rx * inner, y, a.z + a.rz * inner];
    const ao = [a.x + a.rx * outer, y, a.z + a.rz * outer];
    const bi = [b.x + b.rx * inner, y, b.z + b.rz * inner];
    const bo = [b.x + b.rx * outer, y, b.z + b.rz * outer];
    pos.push(...ai, ...bi, ...ao, ...ao, ...bi, ...bo);
    for (let k = 0; k < 6; k++) {
      col.push(c.r, c.g, c.b);
      nor.push(0, 1, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/* ------------------------------------------------------------------ */
/*  Terrain (rolling hills near, mountains far, flat around the track) */
/* ------------------------------------------------------------------ */

interface Terrain {
  mesh: THREE.Mesh;
  heightAt: (x: number, z: number) => number;
  slopeAt: (x: number, z: number) => number;
  distToTrack: (x: number, z: number) => number;
}

function buildTerrain(track: Track, aniso: number): Terrain {
  const cx = track.center.x;
  const cz = track.center.z;
  const b = track.bounds;
  const box = { minX: b.minX - 170, maxX: b.maxX + 170, minZ: b.minZ - 170, maxZ: b.maxZ + 170 };
  const distToTrack = (x: number, z: number) =>
    x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ ? 999 : track.distanceToTrack(x, z, 6);

  // Ebisu-style valley: forested hills rise close to the track, big ranges loom beyond.
  const heightFn = (x: number, z: number) => {
    let h = GROUND_Y;
    const d = distToTrack(x, z);
    const open = smoothstep(46, 118, d);
    if (open > 0) {
      const n1 = fbm(x * 0.0065 + 17.3, z * 0.0065 + 4.7, 4);
      const n2 = fbm(x * 0.021 + 3.1, z * 0.021 + 8.9, 3);
      h += ((n1 - 0.34) * 66 + (n2 - 0.5) * 12) * open;
    }
    const mf = smoothstep(300, 520, Math.hypot(x - cx, z - cz));
    if (mf > 0) {
      const m = fbm(x * 0.0026 + 9.2, z * 0.0026 + 1.4, 5);
      h += Math.pow(m, 1.7) * 400 * mf;
    }
    return h;
  };

  const n = TERRAIN_SEGS + 1;
  const step = TERRAIN_SIZE / TERRAIN_SEGS;
  const x0 = cx - TERRAIN_SIZE / 2;
  const z0 = cz - TERRAIN_SIZE / 2;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) heights[j * n + i] = heightFn(x0 + i * step, z0 + j * step);
  }

  const heightAt = (x: number, z: number) => {
    const fx = clamp((x - x0) / step, 0, n - 1.001);
    const fz = clamp((z - z0) / step, 0, n - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const h00 = heights[j * n + i];
    const h10 = heights[j * n + i + 1];
    const h01 = heights[(j + 1) * n + i];
    const h11 = heights[(j + 1) * n + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  };
  const slopeAt = (x: number, z: number) => {
    const e = 5;
    return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  };

  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  const cGrassA = new THREE.Color('#55b04e');
  const cGrassB = new THREE.Color('#357a32');
  const cMeadow = new THREE.Color('#8fc25a');
  const cDark = new THREE.Color('#265e2e');
  const cRock = new THREE.Color('#7d7466');
  const cSnow = new THREE.Color('#f4f7fc');
  const col = new THREE.Color();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = x0 + i * step;
      const z = z0 + j * step;
      const h = heights[k];
      const hl = heights[j * n + Math.max(i - 1, 0)];
      const hr = heights[j * n + Math.min(i + 1, n - 1)];
      const hd = heights[Math.max(j - 1, 0) * n + i];
      const hu = heights[Math.min(j + 1, n - 1) * n + i];
      const slope = Math.hypot(hr - hl, hu - hd) / (2 * step);
      const nn = fbm(x * 0.03 + 1.1, z * 0.03 + 2.2, 3);
      col.copy(cGrassA).lerp(cGrassB, nn);
      if (nn > 0.58) col.lerp(cMeadow, smoothstep(0.58, 0.78, nn));
      const hh = h - GROUND_Y;
      col.lerp(cDark, smoothstep(10, 50, hh) * 0.8);
      col.lerp(cRock, Math.max(smoothstep(0.45, 0.8, slope), smoothstep(90, 170, hh)));
      col.lerp(cSnow, smoothstep(300, 360, hh) * (1 - 0.5 * smoothstep(0.75, 1.1, slope)));
      positions[k * 3] = x;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = z;
      colors[k * 3] = col.r;
      colors[k * 3 + 1] = col.g;
      colors[k * 3 + 2] = col.b;
      uvs[k * 2] = x / 9;
      uvs[k * 2 + 1] = z / 9;
    }
  }
  const indices = new Uint32Array(TERRAIN_SEGS * TERRAIN_SEGS * 6);
  let p = 0;
  for (let j = 0; j < TERRAIN_SEGS; j++) {
    for (let i = 0; i < TERRAIN_SEGS; i++) {
      const a = j * n + i;
      const bIdx = a + 1;
      const c = a + n;
      const d = c + 1;
      indices[p++] = a;
      indices[p++] = c;
      indices[p++] = bIdx;
      indices[p++] = bIdx;
      indices[p++] = c;
      indices[p++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  const detail = makeGrassDetailTexture();
  detail.anisotropy = aniso;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 1, flatShading: true, envMapIntensity: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return { mesh, heightAt, slopeAt, distToTrack };
}

function inLake(x: number, z: number, margin = 0) {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const c = Math.cos(LAKE.rot);
  const s = Math.sin(LAKE.rot);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const a = LAKE.rx + margin;
  const b = LAKE.rz + margin;
  return (lx * lx) / (a * a) + (lz * lz) / (b * b) < 1;
}

/* ------------------------------------------------------------------ */
/*  Crowd (instanced, animated: Mexican wave + jumping fans)           */
/* ------------------------------------------------------------------ */

interface CrowdSpot {
  x: number;
  y: number;
  z: number;
  sc: number;
  amp: number; // jump amplitude (0 = static)
  phase: number;
  wave: number; // coordinate along a grandstand for the wave (NaN = none)
  flag: boolean;
}

class Crowd {
  readonly spots: CrowdSpot[] = [];
  constructor(private rand: () => number) {}

  add(x: number, y: number, z: number, o: { wave?: number; jumpChance?: number; flagChance?: number } = {}) {
    const r = this.rand;
    this.spots.push({
      x,
      y,
      z,
      sc: 0.85 + r() * 0.3,
      amp: r() < (o.jumpChance ?? 0.35) ? 0.12 + r() * 0.22 : 0,
      phase: r() * Math.PI * 2,
      wave: o.wave ?? NaN,
      flag: r() < (o.flagChance ?? 0.1),
    });
  }

  /** Cute chubby "bean" fans: round body, oversized head with a face, stubby arms that wave. */
  build(scene: THREE.Scene, facing: (x: number, z: number) => number): (dt: number) => void {
    const spots = this.spots;
    const N = spots.length;
    if (!N) return () => {};
    const r = this.rand;
    const shirts = ['#ff5a1f', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#ffffff', '#b455f5', '#2f80ff', '#f4a261', '#ff8fab', '#e9c46a', '#8ecae6', '#00b4d8', '#9ef01a'].map(
      (c) => new THREE.Color(c),
    );
    const skins = ['#ffd6b8', '#f1c9a5', '#e0ac7e', '#c68642', '#8d5524', '#ffe0c2', '#a0522d', '#ffc9a3'].map((c) => new THREE.Color(c));
    const flagColors = ['#ff5a1f', '#ffd166', '#ffffff', '#2f80ff', '#06d6a0'].map((c) => new THREE.Color(c));
    const eyeBase = new THREE.Color('#1c1c22');
    const cheekBase = new THREE.Color('#ff7f9f');

    const bodyGeo = new THREE.SphereGeometry(0.3, 10, 8);
    bodyGeo.scale(1, 1.1, 0.9);
    const headGeo = new THREE.SphereGeometry(0.27, 10, 8);
    const armGeo = new THREE.CapsuleGeometry(0.07, 0.24, 2, 6);
    const eyeGeo = new THREE.SphereGeometry(0.045, 6, 5);
    const cheekGeo = new THREE.SphereGeometry(0.05, 6, 4);
    cheekGeo.scale(1, 0.7, 0.5);
    const mat = () => new THREE.MeshStandardMaterial({ roughness: 0.75 });
    const bodies = new THREE.InstancedMesh(bodyGeo, mat(), N);
    const heads = new THREE.InstancedMesh(headGeo, mat(), N);
    const armsL = new THREE.InstancedMesh(armGeo, mat(), N);
    const armsR = new THREE.InstancedMesh(armGeo, mat(), N);
    const eyes = new THREE.InstancedMesh(eyeGeo, new THREE.MeshStandardMaterial({ roughness: 0.3, color: eyeBase }), N * 2);
    const cheeks = new THREE.InstancedMesh(cheekGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, color: cheekBase }), N * 2);
    const flagIdx: number[] = [];
    spots.forEach((s, i) => s.flag && flagIdx.push(i));
    const flags = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.4, 0.05), mat(), Math.max(1, flagIdx.length));
    flags.count = flagIdx.length;

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qArm = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const yaw = new Float32Array(N);
    const baseY = new Float32Array(N);
    const raise = new Float32Array(N); // 1 = arms permanently up (cheering)
    const armSide = new Float32Array(N); // which arm waves (±1)
    const baseFlag = new Float32Array(flagIdx.length);

    const setArm = (mesh: THREE.InstancedMesh, i: number, s: CrowdSpot, side: number, lift: number, y: number) => {
      // arm pivots at the shoulder; lift 0 = hanging down, 1 = straight up
      const a = yaw[i];
      const fx = Math.sin(a);
      const fz = Math.cos(a);
      const rx = Math.cos(a);
      const rz = -Math.sin(a);
      const shoulderX = s.x + rx * side * 0.3 * s.sc;
      const shoulderZ = s.z + rz * side * 0.3 * s.sc;
      const shoulderY = y + 0.58 * s.sc;
      const ang = lift * Math.PI * 0.95; // rotate around the forward axis
      e.set(0, a, side * (Math.PI - ang) * -1, 'YXZ');
      qArm.setFromEuler(e);
      // offset the arm center from the shoulder along its own direction
      const dirY = -Math.cos(ang);
      const lateral = Math.sin(ang) * side;
      const half = 0.19 * s.sc;
      p.set(shoulderX + rx * lateral * half + fx * 0.02, shoulderY + dirY * half, shoulderZ + rz * lateral * half + fz * 0.02);
      m4.compose(p, qArm, sc.set(s.sc, s.sc, s.sc));
      mesh.setMatrixAt(i, m4);
    };

    spots.forEach((s, i) => {
      yaw[i] = facing(s.x, s.z) + (r() - 0.5) * 0.5;
      baseY[i] = s.y;
      raise[i] = r() < 0.3 ? 1 : 0;
      armSide[i] = r() < 0.5 ? -1 : 1;
      const shirt = shirts[Math.floor(r() * shirts.length)];
      const skin = skins[Math.floor(r() * skins.length)];
      q.setFromAxisAngle(UP, yaw[i]);
      sc.set(s.sc, s.sc, s.sc);
      m4.compose(p.set(s.x, s.y + 0.36 * s.sc, s.z), q, sc);
      bodies.setMatrixAt(i, m4);
      bodies.setColorAt(i, shirt);
      m4.compose(p.set(s.x, s.y + 0.92 * s.sc, s.z), q, sc);
      heads.setMatrixAt(i, m4);
      heads.setColorAt(i, skin);
      armsL.setColorAt(i, shirt);
      armsR.setColorAt(i, shirt);
      setArm(armsL, i, s, -1, raise[i], s.y);
      setArm(armsR, i, s, 1, raise[i], s.y);
      // face: two eyes + two cheeks on the front of the head
      const fx = Math.sin(yaw[i]);
      const fz = Math.cos(yaw[i]);
      const rx = Math.cos(yaw[i]);
      const rz = -Math.sin(yaw[i]);
      for (const side of [-1, 1]) {
        const k = i * 2 + (side + 1) / 2;
        m4.compose(p.set(s.x + fx * 0.24 * s.sc + rx * side * 0.1 * s.sc, s.y + 0.97 * s.sc, s.z + fz * 0.24 * s.sc + rz * side * 0.1 * s.sc), q, sc);
        eyes.setMatrixAt(k, m4);
        m4.compose(p.set(s.x + fx * 0.19 * s.sc + rx * side * 0.19 * s.sc, s.y + 0.87 * s.sc, s.z + fz * 0.19 * s.sc + rz * side * 0.19 * s.sc), q, sc);
        cheeks.setMatrixAt(k, m4);
      }
    });
    flagIdx.forEach((si, f) => {
      const s = spots[si];
      q.setFromAxisAngle(UP, yaw[si]);
      baseFlag[f] = s.y + 1.45 * s.sc;
      m4.compose(p.set(s.x, baseFlag[f], s.z), q, sc.set(s.sc, s.sc, s.sc));
      flags.setMatrixAt(f, m4);
      flags.setColorAt(f, flagColors[Math.floor(r() * flagColors.length)]);
    });
    bodies.castShadow = heads.castShadow = true;
    for (const im of [bodies, heads, armsL, armsR, eyes, cheeks, flags]) im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(bodies, heads, armsL, armsR, eyes, cheeks, flags);

    const bArr = bodies.instanceMatrix.array as Float32Array;
    const hArr = heads.instanceMatrix.array as Float32Array;
    const eArr = eyes.instanceMatrix.array as Float32Array;
    const cArr = cheeks.instanceMatrix.array as Float32Array;
    const fArr = flags.instanceMatrix.array as Float32Array;
    const bodyBase = new Float32Array(N);
    const headBase = new Float32Array(N);
    const eyeBaseY = new Float32Array(N * 2);
    const cheekBaseY = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      bodyBase[i] = bArr[i * 16 + 13];
      headBase[i] = hArr[i * 16 + 13];
      eyeBaseY[i * 2] = eArr[i * 32 + 13];
      eyeBaseY[i * 2 + 1] = eArr[i * 32 + 29];
      cheekBaseY[i * 2] = cArr[i * 32 + 13];
      cheekBaseY[i * 2 + 1] = cArr[i * 32 + 29];
    }
    const offs = new Float32Array(N);
    let t = 0;
    let armTick = 0;
    return (dt: number) => {
      t += dt;
      armTick += dt;
      const doArms = armTick > 0.05; // arms update at 20 Hz — plenty for a wave
      if (doArms) armTick = 0;
      for (let i = 0; i < N; i++) {
        const s = spots[i];
        let off = 0;
        let waveLift = 0;
        if (s.wave === s.wave) {
          const w = Math.sin(t * 1.7 - s.wave * 0.16);
          if (w > 0) {
            off = w * w * w * 0.5;
            waveLift = w;
          }
        }
        if (s.amp > 0) off += s.amp * Math.abs(Math.sin(t * 3.6 + s.phase));
        offs[i] = off;
        bArr[i * 16 + 13] = bodyBase[i] + off;
        hArr[i * 16 + 13] = headBase[i] + off;
        eArr[i * 32 + 13] = eyeBaseY[i * 2] + off;
        eArr[i * 32 + 29] = eyeBaseY[i * 2 + 1] + off;
        cArr[i * 32 + 13] = cheekBaseY[i * 2] + off;
        cArr[i * 32 + 29] = cheekBaseY[i * 2 + 1] + off;
        if (doArms) {
          const y = baseY[i] + off;
          const swing = 0.5 + 0.5 * Math.sin(t * 5 + s.phase);
          const liftL = Math.max(waveLift, raise[i] ? 0.85 + 0.15 * swing : armSide[i] < 0 && s.amp > 0 ? swing : 0.05);
          const liftR = Math.max(waveLift, raise[i] ? 0.85 + 0.15 * (1 - swing) : armSide[i] > 0 && s.amp > 0 ? swing : 0.05);
          setArm(armsL, i, s, -1, liftL, y);
          setArm(armsR, i, s, 1, liftR, y);
        }
      }
      for (let f = 0; f < flagIdx.length; f++) fArr[f * 16 + 13] = baseFlag[f] + offs[flagIdx[f]] * 1.3;
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
      eyes.instanceMatrix.needsUpdate = true;
      cheeks.instanceMatrix.needsUpdate = true;
      if (doArms) {
        armsL.instanceMatrix.needsUpdate = true;
        armsR.instanceMatrix.needsUpdate = true;
      }
      if (flagIdx.length) flags.instanceMatrix.needsUpdate = true;
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Structures                                                         */
/* ------------------------------------------------------------------ */

const poleMat = new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.5, metalness: 0.4 });
const woodMat = new THREE.MeshStandardMaterial({ color: '#8a6540', roughness: 0.9 });

/** Tiered grandstand. Tiers climb toward local -x; seats are returned in local space. */
function buildStand(length: number, tiers: number, colors: string[], roof: boolean, rand: () => number) {
  const group = new THREE.Group();
  const seats: [number, number, number][] = [];
  for (let k = 0; k < tiers; k++) {
    const tier = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, length), new THREE.MeshStandardMaterial({ color: colors[k % colors.length], roughness: 0.8 }));
    tier.position.set(-k * 2.4, 0.6 + k * 1.2, 0);
    tier.castShadow = true;
    tier.receiveShadow = true;
    group.add(tier);
    for (let z = -length / 2 + 0.6; z < length / 2 - 0.4; z += 1.05) {
      if (rand() < 0.88) seats.push([-k * 2.4 + 0.15 + (rand() - 0.5) * 0.4, 1.2 + k * 1.2, z + (rand() - 0.5) * 0.3]);
    }
  }
  const depth = tiers * 2.4;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, tiers * 1.2 + 0.6, length), new THREE.MeshStandardMaterial({ color: '#3a4250' }));
  back.position.set(-depth + 1.0, (tiers * 1.2 + 0.6) / 2, 0);
  group.add(back);
  if (roof) {
    const roofH = tiers * 1.2 + 2.4;
    const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(depth + 3, 0.35, length + 2), new THREE.MeshStandardMaterial({ color: '#e9eef5' }));
    roofMesh.position.set(-depth / 2 + 0.6, roofH, 0);
    roofMesh.castShadow = true;
    group.add(roofMesh);
    for (const z of [-length / 2 + 1, 0, length / 2 - 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, roofH, 8), poleMat);
      post.position.set(-depth + 0.9, roofH / 2, z);
      group.add(post);
    }
  }
  return { group, seats };
}

/** Overhead gate with a banner (used for drift-zone entries / exits). */
function buildGate(track: Track, idx: number, tex: THREE.Texture, color: string, small: boolean): THREE.Group {
  const s = track.samples[idx];
  const g = new THREE.Group();
  g.position.set(s.x, 0, s.z);
  g.rotation.y = s.angle;
  const poleX = HALF_WIDTH + CURB_WIDTH + 1.0;
  const h = small ? 5.2 : 6.6;
  const postMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  for (const sx of [-poleX, poleX]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, h, 8), postMat);
    post.position.set(sx, h / 2, 0);
    post.castShadow = true;
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(poleX * 2 + 0.5, 0.35, 0.4), poleMat);
  beam.position.set(0, h, 0);
  beam.castShadow = true;
  g.add(beam);
  const bannerH = small ? 0.95 : 1.4;
  const texMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(poleX * 2, bannerH, 0.1), [poleMat, poleMat, poleMat, poleMat, texMat, texMat]);
  banner.position.set(0, h - bannerH / 2 - 0.25, 0);
  banner.castShadow = true;
  g.add(banner);
  return g;
}

/* ------------------------------------------------------------------ */
/*  Image-based lighting                                               */
/* ------------------------------------------------------------------ */

/** Bakes a tiny gradient env map (sky + hot sun + green ground) so paint/glass/water get pretty reflections. */
function applyEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(60, 16, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color('#2f6fe0') },
      horizon: { value: new THREE.Color('#ffe0b8') },
      ground: { value: new THREE.Color('#4c8a44') },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 ground;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0
          ? mix(horizon, top, pow(min(h * 1.6, 1.0), 0.6))
          : mix(horizon, ground, min(-h * 3.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  env.add(new THREE.Mesh(skyGeo, skyMat));
  const sunGeo = new THREE.SphereGeometry(5, 12, 8);
  const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1d0').multiplyScalar(5) });
  const sunBall = new THREE.Mesh(sunGeo, sunMat);
  sunBall.position.copy(SUN_DIR).multiplyScalar(45);
  env.add(sunBall);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.05);
  scene.environment = rt.texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
  skyGeo.dispose();
  skyMat.dispose();
  sunGeo.dispose();
  sunMat.dispose();
}

/* ------------------------------------------------------------------ */
/*  World                                                              */
/* ------------------------------------------------------------------ */

export function buildWorld(scene: THREE.Scene, track: Track, renderer: THREE.WebGLRenderer, zones: DriftZone[]): WorldRefs {
  const rand = mulberry32(1337);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const n = track.count;
  const samples = track.samples;
  const cx = track.center.x;
  const cz = track.center.z;
  const zoneOf = zoneLookup(track, zones);
  const animated: ((dt: number) => void)[] = [];
  const crowd = new Crowd(rand);
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpV = new THREE.Vector3();

  /* ---------- Sky with sun (golden-hour grade) ---------- */
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color('#2563d8') },
      midColor: { value: new THREE.Color('#7fa8ec') },
      horizonColor: { value: new THREE.Color(FOG_COLOR) },
      bottomColor: { value: new THREE.Color('#b9c7dc') },
      warmColor: { value: new THREE.Color('#ffcf9a') },
      sunDir: { value: SUN_DIR },
      sunColor: { value: new THREE.Color('#fff3d8') },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor; uniform vec3 midColor; uniform vec3 horizonColor; uniform vec3 bottomColor;
      uniform vec3 warmColor; uniform vec3 sunDir; uniform vec3 sunColor;
      varying vec3 vWorldPosition;
      void main() {
        vec3 dir = normalize(vWorldPosition - cameraPosition);
        float h = dir.y;
        // three-stop vertical gradient: horizon -> mid -> zenith
        vec3 c = h > 0.0
          ? mix(mix(horizonColor, midColor, smoothstep(0.0, 0.28, h)), topColor, smoothstep(0.22, 0.85, h))
          : mix(horizonColor, bottomColor, min(-h * 5.0, 1.0));
        // warm haze hugging the horizon on the sun side
        vec2 flatDir = normalize(dir.xz + vec2(1e-5));
        vec2 flatSun = normalize(sunDir.xz);
        float sunSide = max(dot(flatDir, flatSun), 0.0);
        float hazeBand = exp(-abs(h) * 7.0);
        c = mix(c, warmColor, pow(sunSide, 2.5) * hazeBand * 0.6);
        c = mix(c, warmColor * 0.5 + horizonColor * 0.5, hazeBand * 0.12);
        // layered sun glow + crisp disc
        float s = max(dot(dir, sunDir), 0.0);
        vec3 glowCol = mix(sunColor, warmColor, 0.45);
        c += glowCol * (pow(s, 6.0) * 0.16 + pow(s, 24.0) * 0.32 + pow(s, 180.0) * 0.55);
        c += sunColor * smoothstep(0.99935, 0.99965, s) * 1.4;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        // dither in display space to kill gradient banding
        float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        gl_FragColor.rgb += (n - 0.5) * 0.012;
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
  sky.position.set(cx, 0, cz);
  sky.frustumCulled = false;
  scene.add(sky);
  scene.fog = new THREE.Fog(FOG_COLOR, 200, 1050);

  /* ---------- Lights: warm key + cool fill + sky bounce ---------- */
  scene.add(new THREE.HemisphereLight(0xbcd9ff, 0x5f9248, 0.9));
  const sun = new THREE.DirectionalLight(0xffdfb0, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 260;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun);
  scene.add(sun.target);
  // cool blue fill from the opposite side (no shadows) — teal & orange contrast
  const fill = new THREE.DirectionalLight(0x9db8ff, 0.5);
  fill.position.set(cx - 80, 60, cz - 50);
  fill.target.position.set(cx, 0, cz);
  scene.add(fill);
  scene.add(fill.target);

  /* ---------- Image-based lighting: tiny custom env map for glossy reflections ---------- */
  applyEnvironment(scene, renderer);

  /* ---------- Terrain ---------- */
  const terrain = buildTerrain(track, aniso);
  scene.add(terrain.mesh);

  /* ---------- Runoff, road, curbs ---------- */
  const runoffMat = new THREE.MeshStandardMaterial({ color: '#5da84f', roughness: 1, side: THREE.DoubleSide });
  for (const side of [1, -1] as const) {
    const from = (HALF_WIDTH + CURB_WIDTH) * side;
    const to = WALL_DIST * side;
    const m = new THREE.Mesh(buildStrip(track, Math.min(from, to), Math.max(from, to), 0.0, 10), runoffMat);
    m.receiveShadow = true;
    scene.add(m);
  }
  const roadTex = makeRoadTexture();
  roadTex.anisotropy = aniso;
  const road = new THREE.Mesh(
    buildStrip(track, -HALF_WIDTH, HALF_WIDTH, 0.01, 9),
    new THREE.MeshStandardMaterial({ map: roadTex, color: '#d9d9dc', roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide, envMapIntensity: 0.5 }),
  );
  road.receiveShadow = true;
  scene.add(road);
  const curbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  for (const side of [1, -1] as const) {
    const m = new THREE.Mesh(buildCurb(track, side), curbMat);
    m.receiveShadow = true;
    scene.add(m);
  }

  /* ---------- Drift zones: painted road, gates, cones ---------- */
  const coneSpots: { x: number; z: number; color: THREE.Color }[] = [];
  for (const z of zones) {
    const base = new THREE.Color(z.color);
    const dark = base.clone().multiplyScalar(0.45);
    const paint = new THREE.Mesh(
      buildRangeStrip(track, z.start, z.len, -HALF_WIDTH + 0.3, HALF_WIDTH - 0.3, 0.018, { len: 3, a: base, b: dark }),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.24, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    paint.renderOrder = 1;
    scene.add(paint);
    const lineMat = new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const lineIn = new THREE.Mesh(buildRangeStrip(track, z.start, 2, -HALF_WIDTH + 0.3, HALF_WIDTH - 0.3, 0.02), lineMat);
    const lineOut = new THREE.Mesh(buildRangeStrip(track, (z.start + z.len - 2 + n) % n, 2, -HALF_WIDTH + 0.3, HALF_WIDTH - 0.3, 0.02), lineMat);
    lineIn.renderOrder = lineOut.renderOrder = 1;
    scene.add(lineIn, lineOut);

    const darkText = z.mult !== 2;
    const entryTex = makeTextTexture(`DRIFT ZONE  ×${z.mult}   ${z.name}`, { bg: z.color, fg: darkText ? '#15181f' : '#ffffff', h: 96, size: 54 });
    entryTex.anisotropy = aniso;
    scene.add(buildGate(track, z.start, entryTex, z.color, false));
    const exitTex = makeTextTexture('ZONE END', { bg: '#15181f', fg: z.color, h: 96, size: 56, checker: true });
    exitTex.anisotropy = aniso;
    scene.add(buildGate(track, z.end, exitTex, z.color, true));

    for (let k = 3; k < z.len - 2; k += 4) {
      const s = samples[(z.start + k) % n];
      for (const side of [1, -1] as const) {
        const off = (HALF_WIDTH + CURB_WIDTH + 0.5) * side;
        coneSpots.push({ x: s.x + s.rx * off, z: s.z + s.rz * off, color: base });
      }
    }
  }
  if (coneSpots.length) {
    const cones = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.32, 0.85, 8),
      new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.12 }),
      coneSpots.length,
    );
    coneSpots.forEach((c, i) => {
      m4.compose(tmpPos.set(c.x, GROUND_Y + 0.43, c.z), quat.identity(), ONE);
      cones.setMatrixAt(i, m4);
      cones.setColorAt(i, c.color);
    });
    cones.castShadow = true;
    scene.add(cones);
  }

  /* ---------- Start / finish line + gantry ---------- */
  const s0 = samples[0];
  const startGroup = new THREE.Group();
  startGroup.position.set(s0.x, 0, s0.z);
  startGroup.rotation.y = s0.angle;
  scene.add(startGroup);
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_WIDTH, 2.4),
    new THREE.MeshStandardMaterial({ map: makeCheckerTexture(12, 2), roughness: 0.8 }),
  );
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.03;
  line.receiveShadow = true;
  startGroup.add(line);
  const poleX = HALF_WIDTH + CURB_WIDTH + 1.0;
  for (const sx of [-poleX, poleX]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 7.5, 10), poleMat);
    pole.position.set(sx, 3.75, 0);
    pole.castShadow = true;
    startGroup.add(pole);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(poleX * 2 + 0.6, 0.5, 0.6), poleMat);
  beam.position.set(0, 7.5, 0);
  beam.castShadow = true;
  startGroup.add(beam);
  const gantryTex = makeTextTexture('DRIFT KING CIRCUIT', { bg: '#ff5a1f', fg: '#ffffff', h: 96, size: 60, checker: true });
  gantryTex.anisotropy = aniso;
  const gantryMat = new THREE.MeshStandardMaterial({ map: gantryTex, roughness: 0.9 });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(poleX * 2, 1.5, 0.12), [poleMat, poleMat, poleMat, poleMat, gantryMat, gantryMat]);
  banner.position.set(0, 6.5, 0);
  banner.castShadow = true;
  startGroup.add(banner);
  // start lights on the gantry
  for (let i = -2; i <= 2; i++) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff2a2a', emissiveIntensity: 0.9 }));
    lamp.position.set(i * 0.8, 7.5, 0.5);
    startGroup.add(lamp);
  }

  /* ---------- Main grandstand (start straight) ---------- */
  const gs = samples[34];
  const mainStand = buildStand(46, 6, ['#c8102e', '#f5f5f5', '#c8102e', '#f5f5f5', '#c8102e', '#f5f5f5'], true, rand);
  const standOffset = -(WALL_DIST + 5);
  mainStand.group.position.set(gs.x + gs.rx * standOffset, 0, gs.z + gs.rz * standOffset);
  mainStand.group.rotation.y = gs.angle;
  scene.add(mainStand.group);
  mainStand.group.updateMatrixWorld(true);
  for (const [lx, ly, lz] of mainStand.seats) {
    mainStand.group.localToWorld(tmpV.set(lx, ly, lz));
    crowd.add(tmpV.x, tmpV.y, tmpV.z, { wave: lz + 23, jumpChance: 0.25, flagChance: 0.14 });
  }
  const standX = mainStand.group.position.x;
  const standZ = mainStand.group.position.z;

  /* ---------- Pit building, pit wall, big screen (opposite the grandstand) ---------- */
  const ps = samples[32];
  const pit = new THREE.Group();
  pit.position.set(ps.x + ps.rx * (WALL_DIST + 0.6), 0, ps.z + ps.rz * (WALL_DIST + 0.6));
  pit.rotation.y = ps.angle;
  scene.add(pit);
  const pitWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 72), new THREE.MeshStandardMaterial({ color: '#dfe3ea', roughness: 0.8 }));
  pitWall.position.set(0, 0.45, 0);
  pitWall.castShadow = true;
  pitWall.receiveShadow = true;
  pit.add(pitWall);
  const garageTex = makeGarageTexture();
  garageTex.anisotropy = aniso;
  const wallMat = new THREE.MeshStandardMaterial({ color: '#d7dde6', roughness: 0.9 });
  const building = new THREE.Mesh(new THREE.BoxGeometry(9, 5.5, 64), [
    wallMat,
    new THREE.MeshStandardMaterial({ map: garageTex, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#3a4250', roughness: 0.9 }),
    wallMat,
    wallMat,
    wallMat,
  ]);
  building.position.set(9.5, 2.75, 0);
  building.castShadow = true;
  building.receiveShadow = true;
  pit.add(building);
  const pitSignTex = makeTextTexture('EBISU PIT エビス', { bg: '#15181f', fg: '#ffd166', w: 1024, h: 96, size: 56 });
  pitSignTex.anisotropy = aniso;
  const pitSign = new THREE.Mesh(new THREE.PlaneGeometry(20, 1.7), new THREE.MeshStandardMaterial({ map: pitSignTex, roughness: 0.85 }));
  pitSign.rotation.y = -Math.PI / 2;
  pitSign.position.set(4.92, 4.6, 0);
  pit.add(pitSign);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 64), new THREE.MeshStandardMaterial({ color: '#e9eef5' }));
  rail.position.set(5.1, 6.0, 0);
  pit.add(rail);
  const screenTex = makeScreenTexture();
  screenTex.anisotropy = aniso;
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.4, 9.6), [
    poleMat,
    new THREE.MeshStandardMaterial({ map: screenTex, emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 0.55, roughness: 0.4 }),
    poleMat,
    poleMat,
    poleMat,
    poleMat,
  ]);
  screen.position.set(9.5, 8.6, 0);
  screen.castShadow = true;
  pit.add(screen);
  for (const sz of [-4.2, 4.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), poleMat);
    leg.position.set(9.5, 5.8, sz);
    pit.add(leg);
  }
  pit.updateMatrixWorld(true);
  for (let lz = -30; lz <= 30; lz += 1.5) {
    for (const lx of [6.4, 7.6]) {
      if (rand() < 0.65) {
        pit.localToWorld(tmpV.set(lx + (rand() - 0.5) * 0.4, 5.5, lz + (rand() - 0.5) * 0.6));
        crowd.add(tmpV.x, tmpV.y, tmpV.z, { jumpChance: 0.2 });
      }
    }
  }
  const pitX = pit.position.x + ps.rx * 9;
  const pitZ = pit.position.z + ps.rz * 9;

  /* ---------- Tire stacks (pit boxes + corner apexes) ---------- */
  const tireSpots: { x: number; z: number; y: number; color: THREE.Color }[] = [];
  const tireBlack = new THREE.Color('#1c1c1f');
  const tireColors = ['#f5f5f5', '#e63946', '#2f80ff'].map((c) => new THREE.Color(c));
  for (let i = 0; i < 6; i++) {
    pit.localToWorld(tmpV.set(2.4, 0, -25 + i * 10));
    for (let lvl = 0; lvl < 2; lvl++) tireSpots.push({ x: tmpV.x, z: tmpV.z, y: GROUND_Y + 0.15 + lvl * 0.3, color: lvl ? tireColors[i % 3] : tireBlack });
  }
  zones.forEach((z, zi) => {
    const side = -z.dir;
    let stack = 0;
    for (let k = -6; k <= 6; k += 2) {
      const s = samples[(z.apex + k + n) % n];
      const off = (WALL_DIST + 1.0) * side;
      const x = s.x + s.rx * off;
      const zz = s.z + s.rz * off;
      for (let lvl = 0; lvl < 3; lvl++) {
        tireSpots.push({ x, z: zz, y: GROUND_Y + 0.15 + lvl * 0.3, color: lvl === 0 ? tireBlack : tireColors[(stack + zi) % 3] });
      }
      stack++;
    }
    // tire wall along the whole outside of the zone (behind the guardrail)
    for (let k = 0; k < z.len; k += 3) {
      const i = (z.start + k) % n;
      if (circDist(i, z.apex, n) <= 7) continue;
      const s = samples[i];
      const off = (WALL_DIST + 1.1) * side;
      for (let lvl = 0; lvl < 2; lvl++) {
        tireSpots.push({ x: s.x + s.rx * off, z: s.z + s.rz * off, y: GROUND_Y + 0.15 + lvl * 0.3, color: lvl === 0 ? tireBlack : tireColors[(k + zi) % 3] });
      }
    }
  });
  const tires = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10), new THREE.MeshStandardMaterial({ roughness: 0.95 }), tireSpots.length);
  tireSpots.forEach((t, i) => {
    quat.setFromAxisAngle(UP, rand() * Math.PI);
    m4.compose(tmpPos.set(t.x, t.y, t.z), quat, ONE);
    tires.setMatrixAt(i, m4);
    tires.setColorAt(i, t.color);
  });
  tires.castShadow = true;
  scene.add(tires);

  /* ---------- Corner barriers (skipping the apexes covered by tire stacks) ---------- */
  const barrierSpots: { x: number; z: number; angle: number; red: boolean }[] = [];
  let bCount = 0;
  for (let i = 0; i < n; i += 5) {
    const s = samples[i];
    if (Math.abs(s.curv) < 0.011) continue;
    if (zones.some((z) => circDist(i, z.apex, n) <= 7)) continue;
    const side = -Math.sign(s.curv);
    const off = (WALL_DIST + 1.0) * side;
    barrierSpots.push({ x: s.x + s.rx * off, z: s.z + s.rz * off, angle: s.angle, red: bCount % 2 === 0 });
    bCount++;
  }
  if (barrierSpots.length) {
    const barriers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.9, 2.2), new THREE.MeshStandardMaterial({ roughness: 0.6 }), barrierSpots.length);
    const cRed = new THREE.Color('#e63946');
    const cWhite = new THREE.Color('#f7f7f7');
    barrierSpots.forEach((b, i) => {
      quat.setFromAxisAngle(UP, b.angle);
      m4.compose(tmpPos.set(b.x, 0.45, b.z), quat, ONE);
      barriers.setMatrixAt(i, m4);
      barriers.setColorAt(i, b.red ? cRed : cWhite);
    });
    barriers.castShadow = true;
    barriers.receiveShadow = true;
    scene.add(barriers);
  }

  /* ---------- Guardrails: continuous silver W-beam + white posts, full loop ---------- */
  const railMat = new THREE.MeshStandardMaterial({ color: '#c8ccd2', metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide, envMapIntensity: 0.9 });
  for (const side of [1, -1] as const) {
    const rail = new THREE.Mesh(buildWallStrip(track, 0, n, (WALL_DIST + 0.4) * side, GROUND_Y + 0.35, GROUND_Y + 0.75, 1), railMat);
    rail.receiveShadow = true;
    scene.add(rail);
  }
  const postSpots: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i += 4) {
    const s = samples[i];
    for (const side of [1, -1] as const) {
      postSpots.push({ x: s.x + s.rx * (WALL_DIST + 0.4) * side, z: s.z + s.rz * (WALL_DIST + 0.4) * side });
    }
  }
  const railPosts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.85, 0.14), new THREE.MeshStandardMaterial({ color: '#e8eaee', roughness: 0.7 }), postSpots.length);
  postSpots.forEach((p, i) => {
    m4.compose(tmpPos.set(p.x, GROUND_Y + 0.42, p.z), quat.identity(), ONE);
    railPosts.setMatrixAt(i, m4);
  });
  railPosts.castShadow = true;
  scene.add(railPosts);

  /* ---------- Corner crowds, fences, umbrellas, mini grandstands ---------- */
  const fenceTex = makeFenceTexture();
  fenceTex.anisotropy = aniso;
  const fenceMat = new THREE.MeshStandardMaterial({ map: fenceTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 });
  const fencePostSpots: { x: number; z: number }[] = [];
  const umbrellaSpots: { x: number; z: number; color: THREE.Color }[] = [];
  const umbrellaColors = ['#ff5a1f', '#ffd166', '#06d6a0', '#ef476f', '#2f80ff', '#ffffff'].map((c) => new THREE.Color(c));
  const miniStandZones = [...zones].sort((a, b) => b.mult - a.mult).slice(0, 2);
  const miniStandCenters: { x: number; z: number }[] = [];

  for (const z of zones) {
    const side = -z.dir;
    const hasStand = miniStandZones.includes(z);
    const fence = new THREE.Mesh(buildWallStrip(track, z.start, z.len, (WALL_DIST + 2.0) * side, GROUND_Y, GROUND_Y + 1.2, 1.2), fenceMat);
    scene.add(fence);
    for (let k = 0; k <= z.len; k += 3) {
      const s = samples[(z.start + k) % n];
      fencePostSpots.push({ x: s.x + s.rx * (WALL_DIST + 2.0) * side, z: s.z + s.rz * (WALL_DIST + 2.0) * side });
    }
    for (let k = 0; k < z.len; k += 2) {
      const i = (z.start + k) % n;
      const s = samples[i];
      if (Math.abs(s.curv) < 0.008) continue;
      for (let row = 0; row < 3; row++) {
        if (rand() < 0.15) continue;
        const off = (WALL_DIST + 3.2 + row * 1.15 + (rand() - 0.5) * 0.5) * side;
        const along = (rand() - 0.5) * 1.6;
        crowd.add(s.x + s.rx * off + s.tx * along, GROUND_Y, s.z + s.rz * off + s.tz * along, { jumpChance: 0.4, flagChance: 0.12 });
      }
    }
    for (let k = 5; k < z.len - 4; k += 11) {
      const i = (z.start + k) % n;
      const s = samples[i];
      if (Math.abs(s.curv) < 0.008) continue;
      if (hasStand && circDist(i, z.apex, n) < 13) continue;
      const off = (WALL_DIST + 7.3) * side;
      umbrellaSpots.push({ x: s.x + s.rx * off, z: s.z + s.rz * off, color: umbrellaColors[Math.floor(rand() * umbrellaColors.length)] });
    }
    if (hasStand) {
      const s = samples[z.apex];
      const stand = buildStand(22, 3, ['#ff5a1f', '#ffd166', '#2f80ff'], false, rand);
      const off = (WALL_DIST + 9.0) * side;
      stand.group.position.set(s.x + s.rx * off, GROUND_Y, s.z + s.rz * off);
      stand.group.rotation.y = s.angle + (side === -1 ? 0 : Math.PI);
      scene.add(stand.group);
      stand.group.updateMatrixWorld(true);
      for (const [lx, ly, lz] of stand.seats) {
        stand.group.localToWorld(tmpV.set(lx, ly, lz));
        crowd.add(tmpV.x, tmpV.y, tmpV.z, { wave: lz + 11, jumpChance: 0.3, flagChance: 0.15 });
      }
      miniStandCenters.push({ x: stand.group.position.x, z: stand.group.position.z });
    }
  }

  /* ---------- Sponsor walls + crowds along the other straights ---------- */
  const sponsorTex = makeSponsorTexture();
  sponsorTex.anisotropy = aniso;
  const sponsorMat = new THREE.MeshStandardMaterial({ map: sponsorTex, roughness: 0.85, side: THREE.DoubleSide });
  const runs: { a: number; len: number }[] = [];
  let runStart = -1;
  for (let i = 0; i <= n; i++) {
    const straight = i < n && Math.abs(samples[i].curv) < 0.006 && zoneOf[i] < 0;
    if (straight && runStart < 0) runStart = i;
    if (!straight && runStart >= 0) {
      const len = i - runStart;
      if (len >= 22 && !(runStart < 66) && !(i > n - 30)) runs.push({ a: runStart, len });
      runStart = -1;
    }
  }
  runs.forEach((run, ri) => {
    const side = ri % 2 === 0 ? 1 : -1;
    const wall = new THREE.Mesh(buildWallStrip(track, run.a + 3, run.len - 6, (WALL_DIST + 0.3) * side, GROUND_Y, GROUND_Y + 1.1, 32), sponsorMat);
    wall.castShadow = true;
    scene.add(wall);
    for (let k = 3; k < run.len - 3; k += 3) {
      const s = samples[run.a + k];
      for (let row = 0; row < 2; row++) {
        if (rand() > 0.55) continue;
        const off = (WALL_DIST + 2.0 + row * 1.15 + (rand() - 0.5) * 0.5) * side;
        crowd.add(s.x + s.rx * off + s.tx * (rand() - 0.5) * 1.5, GROUND_Y, s.z + s.rz * off + s.tz * (rand() - 0.5) * 1.5, { jumpChance: 0.3 });
      }
    }
  });

  if (fencePostSpots.length) {
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.25, 5), poleMat, fencePostSpots.length);
    fencePostSpots.forEach((p, i) => {
      m4.compose(tmpPos.set(p.x, GROUND_Y + 0.62, p.z), quat.identity(), ONE);
      posts.setMatrixAt(i, m4);
    });
    scene.add(posts);
  }
  if (umbrellaSpots.length) {
    const tops = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 0.7, 8), new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }), umbrellaSpots.length);
    const sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), poleMat, umbrellaSpots.length);
    umbrellaSpots.forEach((u, i) => {
      m4.compose(tmpPos.set(u.x, GROUND_Y + 2.5, u.z), quat.identity(), ONE);
      tops.setMatrixAt(i, m4);
      tops.setColorAt(i, u.color);
      m4.compose(tmpPos.set(u.x, GROUND_Y + 1.2, u.z), quat.identity(), ONE);
      sticks.setMatrixAt(i, m4);
    });
    tops.castShadow = true;
    scene.add(tops, sticks);
  }

  /* ---------- Light poles ---------- */
  const lightSpots: { x: number; z: number; angle: number; side: number }[] = [];
  for (let i = 70, k = 0; i < n - 12; i += 45, k++) {
    const s = samples[i];
    const side = k % 2 === 0 ? 1 : -1;
    const off = (WALL_DIST + 5.5) * side;
    lightSpots.push({ x: s.x + s.rx * off, z: s.z + s.rz * off, angle: s.angle, side });
  }
  if (lightSpots.length) {
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 12, 8), poleMat, lightSpots.length);
    const headsMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.5, 0.3, 1.8),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', emissive: '#fff7d6', emissiveIntensity: 0.8 }),
      lightSpots.length,
    );
    lightSpots.forEach((l, i) => {
      m4.compose(tmpPos.set(l.x, GROUND_Y + 6, l.z), quat.identity(), ONE);
      poles.setMatrixAt(i, m4);
      quat.setFromAxisAngle(UP, l.angle + Math.PI / 2);
      // lamp head hangs toward the track (opposite of the pole's lateral side)
      const rx = Math.cos(l.angle);
      const rz = -Math.sin(l.angle);
      m4.compose(tmpPos.set(l.x - rx * 0.9 * l.side, GROUND_Y + 12, l.z - rz * 0.9 * l.side), quat, ONE);
      headsMesh.setMatrixAt(i, m4);
    });
    poles.castShadow = true;
    scene.add(poles, headsMesh);
  }

  /* ---------- Flag poles along the straights ---------- */
  const flagPalette = ['#ff5a1f', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#ffffff', '#b455f5'].map((c) => new THREE.Color(c));
  const flagSpots: { x: number; z: number; angle: number; color: THREE.Color }[] = [];
  let fk = 0;
  for (let i = 8; i < n - 8; i += 14) {
    const s = samples[i];
    if (Math.abs(s.curv) > 0.006 || zoneOf[i] >= 0 || i < 66) continue;
    for (const side of [1, -1] as const) {
      const off = (WALL_DIST + 4.2) * side;
      flagSpots.push({ x: s.x + s.rx * off, z: s.z + s.rz * off, angle: s.angle, color: flagPalette[fk++ % flagPalette.length] });
    }
  }
  if (flagSpots.length) {
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.11, 5.2, 6), poleMat, flagSpots.length);
    const flags = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.9, 1.5), new THREE.MeshStandardMaterial({ roughness: 0.85 }), flagSpots.length);
    flagSpots.forEach((f, i) => {
      quat.setFromAxisAngle(UP, f.angle);
      m4.compose(tmpPos.set(f.x, GROUND_Y + 2.6, f.z), quat, ONE);
      poles.setMatrixAt(i, m4);
      const fx = Math.sin(f.angle);
      const fz = Math.cos(f.angle);
      m4.compose(tmpPos.set(f.x + fx * 0.8, GROUND_Y + 4.6, f.z + fz * 0.8), quat, ONE);
      flags.setMatrixAt(i, m4);
      flags.setColorAt(i, f.color);
    });
    poles.castShadow = true;
    flags.castShadow = true;
    scene.add(poles, flags);
  }

  /* ---------- Nobori: vertical Japanese banners along the start straight & zone entries ---------- */
  const noboriDefs: [string, string, string][] = [
    ['ドリフト', '#c8102e', '#ffffff'],
    ['エビス', '#f5f5f5', '#c8102e'],
    ['全開', '#0a3d91', '#ffffff'],
  ];
  const noboriSpots: { x: number; z: number; yaw: number; v: number }[] = [];
  for (let i = 4; i <= 64; i += 8) {
    const s = samples[i];
    for (const side of [1, -1] as const) {
      const off = (WALL_DIST + 3.2) * side;
      noboriSpots.push({
        x: s.x + s.rx * off,
        z: s.z + s.rz * off,
        yaw: Math.atan2(-s.rx * side, -s.rz * side),
        v: noboriSpots.length % 3,
      });
    }
  }
  for (const z of zones) {
    for (let k = 0; k < 2; k++) {
      const s = samples[(z.start + k * 3 + n) % n];
      for (const side of [1, -1] as const) {
        const off = (WALL_DIST + 3.2) * side;
        noboriSpots.push({ x: s.x + s.rx * off, z: s.z + s.rz * off, yaw: Math.atan2(-s.rx * side, -s.rz * side), v: (k + (side > 0 ? 1 : 0)) % 3 });
      }
    }
  }
  if (noboriSpots.length) {
    const nPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 3.4, 6), poleMat, noboriSpots.length);
    noboriSpots.forEach((p, i) => {
      m4.compose(tmpPos.set(p.x, GROUND_Y + 1.7, p.z), quat.identity(), ONE);
      nPole.setMatrixAt(i, m4);
    });
    nPole.castShadow = true;
    scene.add(nPole);
    const clothGeo = new THREE.PlaneGeometry(0.8, 2.4);
    noboriDefs.forEach(([text, bg, fg], v) => {
      const list = noboriSpots.map((p, i) => ({ p, i })).filter(({ p }) => p.v === v);
      if (!list.length) return;
      const tex = makeNoboriTexture(text, bg, fg);
      tex.anisotropy = aniso;
      const cloth = new THREE.InstancedMesh(clothGeo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }), list.length);
      list.forEach(({ p }, j) => {
        quat.setFromAxisAngle(UP, p.yaw);
        m4.compose(tmpPos.set(p.x, GROUND_Y + 2.0, p.z), quat, ONE);
        cloth.setMatrixAt(j, m4);
      });
      cloth.castShadow = true;
      scene.add(cloth);
    });
  }

  /* ---------- Crowd meshes (everyone faces the nearest bit of track) ---------- */
  animated.push(
    crowd.build(scene, (x, z) => {
      const s = samples[track.nearestIndex(x, z)];
      return Math.atan2(s.x - x, s.z - z);
    }),
  );

  /* ---------- Ebisu paddock: asphalt lot, tents, service buildings ---------- */
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8d8f94', roughness: 0.95, flatShading: true });
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const paddock = new THREE.Group();
  paddock.position.set(LAKE.x, 0, LAKE.z);
  paddock.rotation.y = LAKE.rot;
  scene.add(paddock);
  const lot = new THREE.Mesh(new THREE.CircleGeometry(24, 48), new THREE.MeshStandardMaterial({ color: '#8f959c', roughness: 0.95 }));
  lot.rotation.x = -Math.PI / 2;
  lot.position.y = -0.02;
  lot.receiveShadow = true;
  paddock.add(lot);
  // painted parking bays
  const bayMat = new THREE.MeshBasicMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.7 });
  for (let i = 0; i < 8; i++) {
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 5), bayMat);
    bay.rotation.x = -Math.PI / 2;
    bay.position.set(-14 + i * 4, 0.0, 14);
    paddock.add(bay);
  }
  // team tents: poles + pyramid canopy
  const tentCols = ['#0a3d91', '#f5f5f5', '#c8102e', '#0a3d91', '#f5f5f5'];
  const tentPos: [number, number][] = [[-12, -8], [-4, -10], [4, -9], [12, -7], [0, -2]];
  tentPos.forEach(([tx, tz], ti) => {
    const tent = new THREE.Group();
    tent.position.set(tx, 0, tz);
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(3.1, 1.3, 4),
      new THREE.MeshStandardMaterial({ color: tentCols[ti % tentCols.length], roughness: 0.85, flatShading: true }),
    );
    canopy.rotation.y = Math.PI / 4;
    canopy.position.y = 2.8;
    canopy.castShadow = true;
    tent.add(canopy);
    for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 6), poleMat);
      leg.position.set(px, 1.15, pz);
      tent.add(leg);
    }
    // crate + barrel props under the canopy
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), woodMat);
    crate.position.set(-0.8, 0.45, 0.4);
    crate.castShadow = true;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 10), new THREE.MeshStandardMaterial({ color: '#2f80ff', roughness: 0.7 }));
    barrel.position.set(0.9, 0.45, -0.3);
    barrel.castShadow = true;
    tent.add(crate, barrel);
    paddock.add(tent);
  });
  // service buildings with dark hip roofs
  for (const [bx, bz, w, d2, ry] of [[-13, 6, 7, 4, 0.2], [13, 5, 6, 5, -0.15]] as [number, number, number, number, number][]) {
    const bld = new THREE.Group();
    bld.position.set(bx, 0, bz);
    bld.rotation.y = ry;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d2), new THREE.MeshStandardMaterial({ color: '#eef1f4', roughness: 0.9 }));
    walls.position.y = 1.5;
    walls.castShadow = true;
    walls.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d2) * 0.78, 1.6, 4), new THREE.MeshStandardMaterial({ color: '#4a3f35', roughness: 0.9, flatShading: true }));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 3.8;
    roof.castShadow = true;
    const winBand = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.9, 0.1), new THREE.MeshStandardMaterial({ color: '#232a35', roughness: 0.4 }));
    winBand.position.set(0, 1.9, d2 / 2 + 0.02);
    bld.add(walls, roof, winBand);
    paddock.add(bld);
  }

  /* ---------- Control tower near the start + marshal post at the hairpin ---------- */
  const towerS = samples[12];
  const tower = new THREE.Group();
  tower.position.set(towerS.x - towerS.rx * (WALL_DIST + 7), 0, towerS.z - towerS.rz * (WALL_DIST + 7));
  tower.rotation.y = towerS.angle;
  scene.add(tower);
  const towerBody = new THREE.Mesh(new THREE.BoxGeometry(4.5, 7, 4.5), new THREE.MeshStandardMaterial({ color: '#f2f3f5', roughness: 0.9 }));
  towerBody.position.y = 3.5;
  towerBody.castShadow = true;
  towerBody.receiveShadow = true;
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 1.8, 4), new THREE.MeshStandardMaterial({ color: '#6b4a33', roughness: 0.9, flatShading: true }));
  towerRoof.rotation.y = Math.PI / 4;
  towerRoof.position.y = 7.9;
  towerRoof.castShadow = true;
  const towerGlass = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.3, 4.6), new THREE.MeshStandardMaterial({ color: '#20262f', roughness: 0.3, metalness: 0.4 }));
  towerGlass.position.y = 5.6;
  const towerDoor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.1), woodMat);
  towerDoor.position.set(0, 1.05, 2.28);
  tower.add(towerBody, towerRoof, towerGlass, towerDoor);
  if (zones.length) {
    const mz = zones[0];
    const ms = samples[mz.apex];
    const hut = new THREE.Group();
    hut.position.set(ms.x + ms.rx * (WALL_DIST + 5) * mz.dir, 0, ms.z + ms.rz * (WALL_DIST + 5) * mz.dir);
    hut.rotation.y = ms.angle;
    scene.add(hut);
    const hutBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.5, 2.6), new THREE.MeshStandardMaterial({ color: '#f2f3f5', roughness: 0.9 }));
    hutBody.position.y = 1.25;
    hutBody.castShadow = true;
    const hutRoof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.1, 4), new THREE.MeshStandardMaterial({ color: '#6b4a33', roughness: 0.9, flatShading: true }));
    hutRoof.rotation.y = Math.PI / 4;
    hutRoof.position.y = 3.05;
    hutRoof.castShadow = true;
    hut.add(hutBody, hutRoof);
  }

  /* ---------- Hilltop shrine + torii gate overlooking the circuit ---------- */
  const WM = { x: track.bounds.maxX + 105, z: track.bounds.minZ - 45 };
  {
    const shrine = new THREE.Group();
    shrine.position.set(WM.x, terrain.heightAt(WM.x, WM.z) - 0.4, WM.z);
    shrine.rotation.y = Math.atan2(cx - WM.x, cz - WM.z);
    const vermilion = new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.7 });
    const darkWood = new THREE.MeshStandardMaterial({ color: '#3a2c22', roughness: 0.9 });
    const stone = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.95, flatShading: true });
    // stone platform
    const platform = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 8), stone);
    platform.position.y = 0.5;
    platform.receiveShadow = true;
    shrine.add(platform);
    // small shrine hall
    const hall = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.6, 3), darkWood);
    hall.position.set(0, 2.3, -1.2);
    hall.castShadow = true;
    const hallRoof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 4), vermilion);
    hallRoof.rotation.y = Math.PI / 4;
    hallRoof.position.set(0, 4.4, -1.2);
    hallRoof.castShadow = true;
    const offering = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.5), woodMat);
    offering.position.set(0, 1.45, 0.8);
    shrine.add(hall, hallRoof, offering);
    // torii gate in front
    const torii = new THREE.Group();
    torii.position.set(0, 1, 5.5);
    for (const sx of [-1.8, 1.8]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.4, 8), vermilion);
      pillar.position.set(sx, 2.2, 0);
      pillar.castShadow = true;
      torii.add(pillar);
    }
    const lintelTop = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.4, 0.5), vermilion);
    lintelTop.position.y = 4.5;
    lintelTop.castShadow = true;
    const lintelLow = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 0.35), vermilion);
    lintelLow.position.y = 3.6;
    torii.add(lintelTop, lintelLow);
    shrine.add(torii);
    // stone lanterns flanking the steps
    for (const sx of [-3.2, 3.2]) {
      const lan = new THREE.Group();
      lan.position.set(sx, 1, 3.2);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.5, 6), stone);
      base.position.y = 0.25;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 6), stone);
      shaft.position.y = 0.95;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), stone);
      box.position.y = 1.6;
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.3, 0.4),
        new THREE.MeshStandardMaterial({ color: '#ffe9b8', emissive: '#ffca7a', emissiveIntensity: 1.2 }),
      );
      glow.position.y = 1.6;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 4), stone);
      cap.rotation.y = Math.PI / 4;
      cap.position.y = 2.05;
      lan.add(base, shaft, box, glow, cap);
      shrine.add(lan);
    }
    scene.add(shrine);
  }

  const blocked = (x: number, z: number) =>
    Math.hypot(x - standX, z - standZ) < 36 ||
    Math.hypot(x - pitX, z - pitZ) < 42 ||
    inLake(x, z, 7) ||
    Math.hypot(x - WM.x, z - WM.z) < 10 ||
    miniStandCenters.some((c) => Math.hypot(x - c.x, z - c.z) < 18);

  /* ---------- Forest: dense Japanese cedar hillsides + broadleaf ---------- */
  const TREE_MAX = 1400;
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5d3f26', roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.38, 3, 6), trunkMat, TREE_MAX);
  const pines = new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 4.8, 7), leafMat, TREE_MAX);
  const rounds = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(2.1, 0), leafMat, TREE_MAX);
  const pineColors = ['#1f6b34', '#2a7a3a', '#1a5c2e', '#357a38'].map((c) => new THREE.Color(c));
  const roundColors = ['#3f8a3a', '#4f9a40', '#2f7a32', '#63a848'].map((c) => new THREE.Color(c));
  const autumnColors = ['#e0a03c', '#d8623a', '#f0b84a'].map((c) => new THREE.Color(c));
  let nT = 0;
  let nP = 0;
  let nR = 0;
  let attempts = 0;
  const spread = 420;
  while (nT < TREE_MAX && attempts < 22000) {
    attempts++;
    const x = cx - spread + rand() * spread * 2;
    const z = cz - spread + rand() * spread * 2;
    const d = terrain.distToTrack(x, z);
    if (d < WALL_DIST + 7 || blocked(x, z)) continue;
    const h = terrain.heightAt(x, z);
    if (h - GROUND_Y > 150 || terrain.slopeAt(x, z) > 0.7) continue;
    if (d < 55 && rand() > 0.3) continue;
    const sc = 0.75 + rand() * 0.75;
    quat.setFromAxisAngle(UP, rand() * Math.PI * 2);
    tmpScale.set(sc, sc, sc);
    m4.compose(tmpPos.set(x, h + 1.5 * sc - 0.6, z), quat, tmpScale);
    trunks.setMatrixAt(nT++, m4);
    if (rand() < 0.65) {
      m4.compose(tmpPos.set(x, h + 5.4 * sc - 0.6, z), quat, tmpScale);
      pines.setMatrixAt(nP, m4);
      pines.setColorAt(nP, pineColors[Math.floor(rand() * pineColors.length)]);
      nP++;
    } else {
      m4.compose(tmpPos.set(x, h + 4.6 * sc - 0.6, z), quat, tmpScale.set(sc, sc * 0.9, sc));
      rounds.setMatrixAt(nR, m4);
      const autumn = rand() < 0.08;
      rounds.setColorAt(nR, autumn ? autumnColors[Math.floor(rand() * autumnColors.length)] : roundColors[Math.floor(rand() * roundColors.length)]);
      nR++;
    }
  }
  trunks.count = nT;
  pines.count = nP;
  rounds.count = nR;
  trunks.castShadow = pines.castShadow = rounds.castShadow = true;
  scene.add(trunks, pines, rounds);

  /* ---------- Bushes & flowers near the track (outside zones / paddock) ---------- */
  const bushCount = 110;
  const bushes = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: '#3f9e3a', roughness: 1, flatShading: true }),
    bushCount,
  );
  let nB = 0;
  for (let i = 0; i < bushCount * 4 && nB < bushCount; i++) {
    const si = Math.floor(rand() * n);
    if (zoneOf[si] >= 0 || si < 66) continue;
    const s = samples[si];
    const side = rand() < 0.5 ? -1 : 1;
    const off = (WALL_DIST + 2 + rand() * 6) * side;
    const x = s.x + s.rx * off;
    const z = s.z + s.rz * off;
    if (blocked(x, z)) continue;
    const sc = 0.6 + rand() * 0.9;
    quat.setFromAxisAngle(UP, rand() * Math.PI);
    m4.compose(tmpPos.set(x, GROUND_Y + sc * 0.6, z), quat, tmpScale.set(sc * 1.3, sc, sc * 1.3));
    bushes.setMatrixAt(nB++, m4);
  }
  bushes.count = nB;
  bushes.castShadow = true;
  scene.add(bushes);

  const flowerCount = 260;
  const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 6, 5), new THREE.MeshStandardMaterial({ roughness: 0.8 }), flowerCount);
  const flowerColors = ['#ff6b9d', '#ffd23f', '#ffffff', '#b388ff', '#ff8c42'].map((c) => new THREE.Color(c));
  let nF = 0;
  for (let i = 0; i < flowerCount * 4 && nF < flowerCount; i++) {
    const si = Math.floor(rand() * n);
    if (zoneOf[si] >= 0 || si < 66) continue;
    const s = samples[si];
    const side = rand() < 0.5 ? -1 : 1;
    const off = (WALL_DIST + 1.5 + rand() * 8) * side;
    const x = s.x + s.rx * off;
    const z = s.z + s.rz * off;
    if (blocked(x, z)) continue;
    const sc = 0.7 + rand() * 0.7;
    m4.compose(tmpPos.set(x, GROUND_Y + 0.3 * sc, z), quat.identity(), tmpScale.set(sc, sc * 0.8, sc));
    flowers.setMatrixAt(nF, m4);
    flowers.setColorAt(nF, flowerColors[Math.floor(rand() * flowerColors.length)]);
    nF++;
  }
  flowers.count = nF;
  scene.add(flowers);

  /* ---------- Rocks on the hills ---------- */
  const rockCount = 70;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  let nRk = 0;
  for (let i = 0; i < rockCount * 6 && nRk < rockCount; i++) {
    const x = cx - spread + rand() * spread * 2;
    const z = cz - spread + rand() * spread * 2;
    const d = terrain.distToTrack(x, z);
    if (d < 65 || blocked(x, z)) continue;
    const h = terrain.heightAt(x, z);
    if (h - GROUND_Y < 2) continue;
    const sc = 1 + rand() * 3;
    quat.setFromAxisAngle(UP, rand() * Math.PI);
    m4.compose(tmpPos.set(x, h + sc * 0.2, z), quat, tmpScale.set(sc * 1.2, sc * 0.75, sc));
    rocks.setMatrixAt(nRk++, m4);
  }
  rocks.count = nRk;
  rocks.castShadow = true;
  scene.add(rocks);

  /* ---------- Drifting clouds ---------- */
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffe7cf', emissiveIntensity: 0.45, envMapIntensity: 0.4 });
  const cloudGeo = new THREE.SphereGeometry(1, 10, 7);
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 16; i++) {
    const cg = new THREE.Group();
    const a = rand() * Math.PI * 2;
    const r = 100 + rand() * 380;
    cg.position.set(cx + Math.cos(a) * r, 80 + rand() * 50, cz + Math.sin(a) * r);
    const puffs = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < puffs; k++) {
      const pMesh = new THREE.Mesh(cloudGeo, cloudMat);
      const sx = 8 + rand() * 9;
      pMesh.scale.set(sx, 3.2 + rand() * 2.8, 5.5 + rand() * 5.5);
      pMesh.position.set((k - puffs / 2) * 7.5 + rand() * 3, rand() * 2, rand() * 4);
      cg.add(pMesh);
    }
    scene.add(cg);
    clouds.push(cg);
  }
  animated.push((dt) => {
    for (const c of clouds) {
      c.position.x += dt * 1.6;
      if (c.position.x > cx + 520) c.position.x = cx - 520;
    }
  });

  /* ---------- Layered mountain silhouettes (iRacing-style backdrop) ---------- */
  const ridgeCols = ['#5d7090', '#6d80a0', '#7e92b0', '#8fa3c2'];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.25 + rand() * 0.3;
    const r = 760 + rand() * 190;
    const h = 130 + rand() * 110;
    const rad = 150 + rand() * 120;
    const ridge = new THREE.Mesh(
      new THREE.ConeGeometry(rad, h, 5),
      new THREE.MeshStandardMaterial({ color: ridgeCols[i % ridgeCols.length], roughness: 1, flatShading: true }),
    );
    ridge.position.set(cx + Math.cos(a) * r, h / 2 - 6, cz + Math.sin(a) * r);
    ridge.rotation.y = rand() * Math.PI;
    scene.add(ridge);
  }

  /* ---------- Valley mist bands drifting between the hills ---------- */
  const mists: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand() * 0.6;
    const r = 330 + rand() * 140;
    const mist = new THREE.Mesh(
      new THREE.PlaneGeometry(280 + rand() * 120, 42 + rand() * 18),
      new THREE.MeshBasicMaterial({ color: '#e8eef6', transparent: true, opacity: 0.1 + rand() * 0.07, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    );
    mist.position.set(cx + Math.cos(a) * r, 20 + rand() * 26, cz + Math.sin(a) * r);
    mist.rotation.y = a + Math.PI / 2 + (rand() - 0.5) * 0.5;
    mist.renderOrder = 6;
    scene.add(mist);
    mists.push(mist);
  }
  animated.push((dt) => {
    for (const m of mists) {
      m.position.x += dt * 1.1;
      if (m.position.x > cx + 520) m.position.x = cx - 520;
    }
  });

  return {
    sun,
    update: (dt) => {
      for (const f of animated) f(dt);
    },
  };
}
