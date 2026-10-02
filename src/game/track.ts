import * as THREE from 'three';

export const TRACK_WIDTH = 14;
export const HALF_WIDTH = TRACK_WIDTH / 2;
export const CURB_WIDTH = 1.4;
export const RUNOFF = 8;
export const WALL_DIST = HALF_WIDTH + CURB_WIDTH + RUNOFF;
export const SAMPLE_COUNT = 600;

// Ebisu-inspired technical drift layout in the XZ plane (closed loop). Start/finish is at the first point.
// Start straight → fast T1 sweeper → tight hairpin → esses → back hairpin → final banked sweeper.
const CONTROL_POINTS: [number, number][] = [
  [0, 0],
  [55, 0],
  [95, 6],
  [118, 30],
  [112, 62],
  [82, 72],
  [62, 88],
  [68, 115],
  [95, 128],
  [88, 155],
  [55, 168],
  [15, 160],
  [-25, 170],
  [-60, 155],
  [-72, 120],
  [-95, 95],
  [-88, 55],
  [-60, 30],
  [-25, 12],
];

export interface TrackSample {
  x: number;
  z: number;
  tx: number; // tangent (unit)
  tz: number;
  rx: number; // right normal (unit)
  rz: number;
  curv: number; // signed smoothed curvature (positive = heading increases = LEFT turn, counter-clockwise from above)
  aheadCurv: number; // max |curvature| over the next stretch
  dist: number; // cumulative distance along track
  angle: number; // heading angle: atan2(tx, tz)
}

export class Track {
  readonly samples: TrackSample[] = [];
  readonly length: number;
  readonly spacing: number;
  readonly count = SAMPLE_COUNT;
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  readonly center: { x: number; z: number };
  readonly curve: THREE.CatmullRomCurve3;

  constructor() {
    const pts = CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    const n = SAMPLE_COUNT;
    const spaced = this.curve.getSpacedPoints(n);
    const raw = spaced.slice(0, n);

    // cumulative distances
    let dist = 0;
    const dists: number[] = [];
    for (let i = 0; i < n; i++) {
      dists.push(dist);
      dist += raw[i].distanceTo(raw[(i + 1) % n]);
    }
    this.length = dist;
    this.spacing = dist / n;

    // tangents
    const tangents: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const prev = raw[(i - 1 + n) % n];
      const next = raw[(i + 1) % n];
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      tangents.push([tx, tz]);
    }

    // curvature (signed)
    const curvRaw: number[] = [];
    for (let i = 0; i < n; i++) {
      const [tx, tz] = tangents[i];
      const [nx, nz] = tangents[(i + 1) % n];
      const cross = tz * nx - tx * nz;
      const dot = tx * nx + tz * nz;
      curvRaw.push(Math.atan2(cross, dot) / this.spacing);
    }
    const W = 6;
    const curv: number[] = [];
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -W; k <= W; k++) s += curvRaw[(i + k + n) % n];
      curv.push(s / (2 * W + 1));
    }
    const LOOK = 36;
    const ahead: number[] = [];
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let k = 0; k < LOOK; k++) m = Math.max(m, Math.abs(curv[(i + k) % n]));
      ahead.push(m);
    }

    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = raw[i];
      const [tx, tz] = tangents[i];
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
      this.samples.push({
        x: p.x,
        z: p.z,
        tx,
        tz,
        rx: tz,
        rz: -tx,
        curv: curv[i],
        aheadCurv: ahead[i],
        dist: dists[i],
        angle: Math.atan2(tx, tz),
      });
    }
    this.bounds = { minX, maxX, minZ, maxZ };
    this.center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  }

  /** Nearest sample index. With a hint, only a local window is searched. */
  nearestIndex(x: number, z: number, hint = -1, window = 30): number {
    const n = this.count;
    let best = 0;
    let bestD = Infinity;
    if (hint < 0) {
      for (let i = 0; i < n; i++) {
        const s = this.samples[i];
        const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    } else {
      for (let k = -window; k <= window; k++) {
        const i = (((hint + k) % n) + n) % n;
        const s = this.samples[i];
        const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    return best;
  }

  /** Minimum distance from a point to the track centerline (coarse). */
  distanceToTrack(x: number, z: number, step = 3): number {
    let best = Infinity;
    for (let i = 0; i < this.count; i += step) {
      const s = this.samples[i];
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < best) best = d;
    }
    return best;
  }

  /** Open SVG path for a sample range (used to highlight drift zones on the minimap). */
  svgPathRange(start: number, len: number, step = 2): string {
    let d = '';
    for (let k = 0; k <= len; k += step) {
      const s = this.samples[(start + Math.min(k, len - 1)) % this.count];
      d += (k === 0 ? 'M' : 'L') + s.x.toFixed(1) + ' ' + s.z.toFixed(1) + ' ';
    }
    return d;
  }

  /** SVG path string of the centerline (for the minimap). */
  svgPath(step = 3): string {
    let d = '';
    for (let i = 0; i < this.count; i += step) {
      const s = this.samples[i];
      d += (i === 0 ? 'M' : 'L') + s.x.toFixed(1) + ' ' + s.z.toFixed(1) + ' ';
    }
    return d + 'Z';
  }
}
