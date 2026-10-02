import type { Track } from './track';

/** A stretch of the circuit where drifting pays extra ("drift zone"). */
export interface DriftZone {
  id: number;
  name: string;
  mult: number; // score multiplier inside the zone
  start: number; // first sample index (may wrap)
  len: number; // number of samples
  end: number; // last sample index inside the zone
  apex: number; // sample index with the highest curvature
  dir: 1 | -1; // 1 = left-hand corner (heading increases), -1 = right-hand
  length: number; // world units
  color: string;
  par: number; // score for a 3-star run
}

export const ZONE_COLOR: Record<string, string> = { '3': '#ffb703', '2': '#c77dff', '1.5': '#4cc9f0' };

interface CornerGroup {
  a: number;
  b: number;
  turn: number; // total turned angle (rad)
  parts: number;
}

/** Finds the most significant corners of the track and turns them into drift zones. */
export function computeDriftZones(track: Track, maxZones = 4): DriftZone[] {
  const n = track.count;
  const s = track.samples;
  const TH = 0.012;
  const PAD = 8;

  // start scanning on a straight so that no corner is split by the wrap-around
  let startAt = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(s[i].curv) < TH) {
      startAt = i;
      break;
    }
  }

  const groups: CornerGroup[] = [];
  let cur: CornerGroup | null = null;
  for (let k = 0; k < n; k++) {
    const i = (startAt + k) % n;
    const c = Math.abs(s[i].curv);
    if (c > TH) {
      if (!cur) cur = { a: i, b: i, turn: 0, parts: 1 };
      cur.b = i;
      cur.turn += c * track.spacing;
    } else if (cur) {
      groups.push(cur);
      cur = null;
    }
  }
  if (cur) groups.push(cur);

  // merge corners that follow each other closely (S-curves, double apex)
  const merged: CornerGroup[] = [];
  for (const g of groups) {
    const last = merged[merged.length - 1];
    if (last && (g.a - last.b + n) % n < PAD * 2 + 14) {
      last.b = g.b;
      last.turn += g.turn;
      last.parts++;
    } else {
      merged.push({ ...g });
    }
  }

  const picked = merged
    .filter((g) => g.turn > 0.55)
    .sort((x, y) => y.turn - x.turn)
    .slice(0, maxZones);
  const multByRank = [3, 2, 2, 1.5, 1.5];
  const ranked = picked.map((g, rank) => ({ g, mult: multByRank[Math.min(rank, multByRank.length - 1)] }));
  ranked.sort((x, y) => ((x.g.a - startAt + n) % n) - ((y.g.a - startAt + n) % n));

  const nameCount = new Map<string, number>();
  return ranked.map(({ g, mult }, id) => {
    const start = (g.a - PAD + n) % n;
    const len = Math.min(n, ((g.b - g.a + n) % n) + 1 + PAD * 2);
    const end = (start + len - 1) % n;
    let apex = start;
    let best = 0;
    let sum = 0;
    for (let k = 0; k < len; k++) {
      const i = (start + k) % n;
      const c = s[i].curv;
      sum += c;
      if (Math.abs(c) > best) {
        best = Math.abs(c);
        apex = i;
      }
    }
    const base = g.parts > 1 ? 'TOUGE ESSES' : g.turn > 2.3 ? 'MINAMI HAIRPIN' : g.turn > 1.15 ? 'NISHI SWEEPER' : 'KITA KINK';
    const count = (nameCount.get(base) ?? 0) + 1;
    nameCount.set(base, count);
    const name = count > 1 ? `${base} ${'I'.repeat(count)}` : base;
    const length = len * track.spacing;
    return {
      id,
      name,
      mult,
      start,
      len,
      end,
      apex,
      dir: sum >= 0 ? 1 : -1,
      length,
      color: ZONE_COLOR[String(mult)] ?? '#4cc9f0',
      par: Math.max(200, Math.round((length * mult * 5) / 50) * 50),
    };
  });
}

/** sample index → zone id (or -1) */
export function zoneLookup(track: Track, zones: DriftZone[]): Int16Array {
  const arr = new Int16Array(track.count).fill(-1);
  for (const z of zones) {
    for (let k = 0; k < z.len; k++) arr[(z.start + k) % track.count] = z.id;
  }
  return arr;
}

/** sample index → number of samples until the next zone starts (0 when inside a zone) */
export function nextZoneDistances(track: Track, lookup: Int16Array): Int16Array {
  const n = track.count;
  const d = new Int16Array(n).fill(32000);
  let run = 32000;
  for (let k = 2 * n - 1; k >= 0; k--) {
    const i = k % n;
    if (lookup[i] >= 0) run = 0;
    else run = Math.min(run + 1, 32000);
    d[i] = Math.min(d[i], run);
  }
  return d;
}

export function zoneStars(score: number, par: number): number {
  if (score >= par) return 3;
  if (score >= par * 0.55) return 2;
  if (score >= par * 0.25) return 1;
  return 0;
}
