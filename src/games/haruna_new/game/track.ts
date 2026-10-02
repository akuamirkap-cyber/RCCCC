import { buildTrackData, TrackData, START_ALT, SAMPLE_STEP as STEP } from '../track/haruna';

/**
 * Runtime track: TrackData (hasil integrasi DSL) dikonversi ke typed arrays
 * + spatial hash, dipakai oleh terrain, fisika, pace note, minimap.
 */

export const ROAD_HALF = 4.2; // 7,5 m aspal + gutter beton ≈ 8,4 m
export const ALT_OFFSET = 0; // y dunia = altitude sungguhan
export const SAMPLE_STEP = STEP;
export const TOP_Y = START_ALT;

export const LAKE = { x: -300, z: -260, rx: 300, rz: 230, level: START_ALT - 5 };
export const HARUNA_FUJI = { x: -290, z: 170, r: 240, h: 240 };

export interface Corner {
  start: number;
  end: number;
  apex: number;
  dir: 'LEFT' | 'RIGHT';
  grade: string;
  long: boolean;
  radius: number;
  angle: number;
  name?: string;
  hairpinNo?: number;
}

export interface Track {
  data: TrackData;
  n: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  tx: Float32Array;
  tz: Float32Array;
  rx: Float32Array;
  rz: Float32Array;
  dist: Float32Array;
  curv: Float32Array; // ±1/r, + = kiri
  length: number;
  corners: Corner[];
  hairpinStart: number;
  hairpinEnd: number;
  hash: Map<number, number[]>;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export const CELL = 24;
export const cellKey = (cx: number, cz: number) => (cx + 1000) * 4000 + (cz + 1000);

export function buildTrack(): Track {
  const data = buildTrackData();
  const s = data.samples;
  const n = s.length;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const tx = new Float32Array(n);
  const tz = new Float32Array(n);
  const rx = new Float32Array(n);
  const rz = new Float32Array(n);
  const dist = new Float32Array(n);
  const curv = new Float32Array(n);
  const hash = new Map<number, number[]>();
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };

  for (let i = 0; i < n; i++) {
    const p = s[i];
    x[i] = p.x;
    y[i] = p.y;
    z[i] = p.z;
    dist[i] = p.dist;
    curv[i] = p.curvature;
    // heading rata-rata di sekitar sample → tangent halus
    const a = s[Math.max(0, i - 1)];
    const b = s[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    tx[i] = dx;
    tz[i] = dz;
    rx[i] = -dz; // vektor kanan
    rz[i] = dx;
    const k = cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    let arr = hash.get(k);
    if (!arr) hash.set(k, (arr = []));
    arr.push(i);
    bounds.minX = Math.min(bounds.minX, p.x);
    bounds.maxX = Math.max(bounds.maxX, p.x);
    bounds.minZ = Math.min(bounds.minZ, p.z);
    bounds.maxZ = Math.max(bounds.maxZ, p.z);
  }

  const corners: Corner[] = data.corners.map((c) => ({
    start: c.start,
    end: c.end,
    apex: c.apex,
    dir: c.dir,
    grade: c.grade,
    long: c.long,
    radius: c.radius,
    angle: c.angle,
    name: c.name,
    hairpinNo: c.hairpinNo,
  }));

  return {
    data,
    n,
    x,
    y,
    z,
    tx,
    tz,
    rx,
    rz,
    dist,
    curv,
    length: data.length,
    corners,
    hairpinStart: data.hairpinStart,
    hairpinEnd: data.hairpinEnd,
    hash,
    bounds,
  };
}

/** Query spatial hash: jarak ke sumbu jalan + tinggi jalan (bobot relatif, stabil numerik). */
export function roadField(t: Track, px: number, pz: number, radius = 60) {
  const cx = Math.floor(px / CELL);
  const cz = Math.floor(pz / CELL);
  const rc = Math.ceil(radius / CELL);
  let dmin2 = Infinity;
  let kmin = -1;
  for (let i = -rc; i <= rc; i++) {
    for (let j = -rc; j <= rc; j++) {
      const arr = t.hash.get(cellKey(cx + i, cz + j));
      if (!arr) continue;
      for (const k of arr) {
        const dx = t.x[k] - px;
        const dz = t.z[k] - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 < dmin2) {
          dmin2 = d2;
          kmin = k;
        }
      }
    }
  }
  if (kmin < 0) return { dmin: Infinity, h: NaN, k: -1, side: 0 };
  const side = (px - t.x[kmin]) * t.rx[kmin] + (pz - t.z[kmin]) * t.rz[kmin];
  return { dmin: Math.sqrt(dmin2), h: t.y[kmin], k: kmin, side };
}

export interface Proj {
  i: number;
  f: number;
  lat: number; // + = kanan
  d: number;
  h: number;
}

function projSeg(t: Track, k: number, px: number, pz: number, out: Proj) {
  const ax = t.x[k];
  const az = t.z[k];
  const sx = t.x[k + 1] - ax;
  const sz = t.z[k + 1] - az;
  const l2 = sx * sx + sz * sz || 1;
  let f = ((px - ax) * sx + (pz - az) * sz) / l2;
  f = Math.max(0, Math.min(1, f));
  const dx = px - (ax + sx * f);
  const dz = pz - (az + sz * f);
  const rxv = t.rx[k] * (1 - f) + t.rx[k + 1] * f;
  const rzv = t.rz[k] * (1 - f) + t.rz[k + 1] * f;
  out.i = k;
  out.f = f;
  out.d = Math.hypot(dx, dz);
  out.lat = dx * rxv + dz * rzv;
  out.h = t.y[k] * (1 - f) + t.y[k + 1] * f;
}

const tmp: Proj = { i: 0, f: 0, lat: 0, d: 0, h: 0 };

export function projectLocal(t: Track, px: number, pz: number, hint: number, win = 45): Proj {
  const best: Proj = { i: 0, f: 0, lat: 0, d: Infinity, h: 0 };
  const a = Math.max(0, hint - win);
  const b = Math.min(t.n - 2, hint + win);
  for (let k = a; k <= b; k++) {
    projSeg(t, k, px, pz, tmp);
    if (tmp.d < best.d) Object.assign(best, tmp);
  }
  if (best.d > 40) return projectGlobal(t, px, pz);
  return best;
}

export function projectGlobal(t: Track, px: number, pz: number): Proj {
  const best: Proj = { i: 0, f: 0, lat: 0, d: Infinity, h: 0 };
  for (let k = 0; k < t.n - 1; k++) {
    projSeg(t, k, px, pz, tmp);
    if (tmp.d < best.d) Object.assign(best, tmp);
  }
  return best;
}
