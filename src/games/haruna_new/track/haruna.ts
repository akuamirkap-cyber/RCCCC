/**
 * Mt. Haruna (Akina) downhill — Gunma Prefectural Route 33, Danau Haruna → Ikaho.
 *
 * Trek disimpan sebagai MINI-DSL: daftar lurusan ('s') dan busur ('c').
 * Bukan hasil sampling GPS — ini rekonstruksi karakter jalan dari besaran yang
 * bisa diverifikasi (elevasi danau ≈1.084 m, 5 hairpin beruntun dengan lurusan
 * pendek antara #4 dan #5, lurusan panjang sebelum hairpin, gradien 6–10%).
 *
 * Konvensi:  angle  + = belok KANAN, − = belok KIRI (derajat)
 *            radius  meter (garis tengah jalan)
 *            grade   0.09 = turun 9%. Jika tidak ditulis, diwarisi dari segmen sebelumnya.
 *  Koordinat dunia: 1 unit = 1 m, x = timur, z = selatan, y = altitude (m dpl).
 */

export type Seg =
  | { t: 's'; len: number; grade?: number; name?: string; note?: string }
  | { t: 'c'; angle: number; radius: number; grade?: number; name?: string; note?: string };

export const START_ALT = 1090; // badan jalan di tepi Danau Haruna (muka danau ≈ 1.084 m)
export const ROAD_WIDTH = 8.4; // 7,5 m aspal + 2 × gutter beton

/** Parameter pembentukan terrain dari jalan (dipakai world.ts & panel Making Of). */
export const TERRAIN_PARAMS = {
  gridStep: 7, // m per vertex (kebersihan koridor dijamin pita bench, bukan grid)
  margin: 380, // m di luar bounding box trek
  radius: 90, // radius query sample jalan
  sigma: 10, // bobot gaussian antar-sample
  flatExtra: 8.5, // m datar setelah tepi aspal (bahu + parit) — lereng baru mulai setelah ini
  shoulderRamp: 7, // m transisi sebelum lereng diberlakukan (0 → full)
  cliffExp: 1.3,
  cliffK: 0.5,
  cliffMax: 26, // tebing tidak boleh lebih tinggi dari ini (mencegah menimbus jalan bawah)
  dropExp: 1.35,
  dropK: 0.4,
  dropMax: 18,
  noiseAmp: 6.5,
  smoothRadius: 2, // blur height-field (menghaluskan lereng, ~14 m radius)
  blendFrom: 45, // mulai campur ke lereng regional
  blendTo: 110,
  benchWidth: 12, // pita "bench" rata yang menempel pada aspal (m dari sumbu)
  // Zona jaminan: semua vertex terrain dalam (H + nilai ini) dari sumbu jalan DIJEPIT di bawah aspal.
  // Harus ≥ 1,5 × gridStep + margin, supaya tidak ada segitiga terrain yang menyentuh badan jalan
  // dengan vertex tinggi (interpolasi segitiga). 7 × 1,5 + 1 ≈ 11,5.
  corridorClamp: 11.5,
  corridorDepth: 0.45, // m di bawah aspal terendah di sekitarnya
};
export const SAMPLE_STEP = 3; // meter per sample

export const SEGMENTS: Seg[] = [
  // ── 1. Tepi Danau Haruna ───────────────────────────────────────────
  { t: 's', len: 190, grade: 0.01, name: 'Start — tepi Danau Haruna' },
  { t: 'c', angle: -25, radius: 120 },
  { t: 's', len: 140, grade: 0.015 },
  { t: 'c', angle: 35, radius: 90 },
  { t: 's', len: 120, grade: 0.02 },
  { t: 'c', angle: -20, radius: 150 },
  { t: 's', len: 160, grade: 0.03, name: 'Keluar kaldera' },

  // ── 2. Turunan cepat ──────────────────────────────────────────────
  { t: 'c', angle: 40, radius: 70, grade: 0.05, name: 'Turunan cepat' },
  { t: 's', len: 110, grade: 0.06 },
  { t: 'c', angle: -55, radius: 60, grade: 0.065 },
  { t: 's', len: 90 },
  { t: 'c', angle: 70, radius: 55, grade: 0.07 },
  { t: 's', len: 150 },
  { t: 'c', angle: -45, radius: 80 },
  { t: 's', len: 130 },
  { t: 'c', angle: 60, radius: 48, grade: 0.075 },
  { t: 's', len: 80 },
  { t: 'c', angle: -40, radius: 65 },
  { t: 's', len: 170, grade: 0.07 },

  // ── 3. Seksi teknis ───────────────────────────────────────────────
  { t: 'c', angle: 85, radius: 32, grade: 0.08, name: 'Seksi teknis' },
  { t: 's', len: 45 },
  { t: 'c', angle: -95, radius: 30 },
  { t: 's', len: 60 },
  { t: 'c', angle: 70, radius: 38 },
  { t: 's', len: 50, grade: 0.075 },
  { t: 'c', angle: -80, radius: 35 },

  // ── 4. Lurusan panjang sebelum hairpin ─────────────────────────────
  { t: 's', len: 420, grade: 0.06, name: 'Lurusan panjang' },

  // ── 5. 五連続ヘアピン — lima hairpin beruntun ──────────────────────
  { t: 'c', angle: 178, radius: 13, grade: 0.09, name: 'Hairpin #1' },
  { t: 's', len: 75 },
  { t: 'c', angle: -175, radius: 13.5, name: 'Hairpin #2' },
  { t: 's', len: 70, grade: 0.095 },
  { t: 'c', angle: 178, radius: 12, grade: 0.1, name: 'Hairpin #3' },
  { t: 's', len: 75, grade: 0.095 },
  { t: 'c', angle: -176, radius: 13.5, name: 'Hairpin #4' },
  { t: 's', len: 38, grade: 0.09, note: 'lurusan pendek #4 → #5' },
  { t: 'c', angle: 178, radius: 12.5, name: 'Hairpin #5' },

  // ── 6. Turunan ke Ikaho ───────────────────────────────────────────
  { t: 's', len: 110, grade: 0.08, name: 'Keluar hairpin' },
  { t: 'c', angle: -80, radius: 45 },
  { t: 's', len: 140, grade: 0.075 },
  { t: 'c', angle: 60, radius: 60 },
  { t: 's', len: 100 },
  { t: 'c', angle: -95, radius: 40, grade: 0.08 },
  { t: 's', len: 150, grade: 0.07 },
  { t: 'c', angle: 75, radius: 50 },
  { t: 's', len: 120 },
  { t: 'c', angle: -70, radius: 55 },
  { t: 's', len: 265, grade: 0.065, name: 'Lurusan 265 m' },
  { t: 'c', angle: -165, radius: 16, grade: 0.085, name: 'Gutter hairpin kiri' },
  { t: 's', len: 90, grade: 0.08 },
  { t: 'c', angle: 170, radius: 18, name: 'Hairpin kanan' },
  { t: 's', len: 200, grade: 0.07, name: 'S-bend Ikaho' },
  { t: 'c', angle: 50, radius: 70 },
  { t: 's', len: 130 },
  { t: 'c', angle: -65, radius: 55 },
  { t: 's', len: 160, grade: 0.065 },
  { t: 'c', angle: 40, radius: 90 },
  { t: 's', len: 120 },
  { t: 'c', angle: -30, radius: 120, grade: 0.06 },
  { t: 's', len: 150 },
  { t: 'c', angle: 55, radius: 60 },
  { t: 's', len: 140 },
  { t: 'c', angle: -80, radius: 42 },
  { t: 's', len: 120, grade: 0.05 },
  { t: 'c', angle: 45, radius: 80 },
  { t: 's', len: 180, grade: 0.04, name: 'Finish — Ikaho' },
  { t: 's', len: 40, grade: 0.02, note: 'run-out' },
];

export interface Sample {
  x: number;
  y: number;
  z: number;
  dist: number;
  heading: number; // rad, atan2(dx, dz)
  curvature: number; // ±1/radius, + = kiri
  seg: number;
}

export interface TrackCorner {
  seg: number;
  start: number;
  end: number;
  apex: number;
  dir: 'LEFT' | 'RIGHT';
  angle: number;
  radius: number;
  grade: string; // 'HAIRPIN' | '1'..'6'
  long: boolean;
  name?: string;
  hairpinNo?: number;
}

export interface TrackData {
  samples: Sample[];
  length: number;
  startY: number;
  endY: number;
  corners: TrackCorner[];
  segRange: [number, number][];
  hairpinStart: number;
  hairpinEnd: number;
  avgGrade: number;
  maxGrade: number;
}

/** Radius → "gear rating" pace note (1 = paling tajam). */
export function cornerGrade(angle: number, radius: number): string {
  if (Math.abs(angle) >= 150 && radius <= 20) return 'HAIRPIN';
  if (radius <= 18) return '1';
  if (radius <= 29) return '2';
  if (radius <= 39) return '3';
  if (radius <= 52) return '4';
  if (radius <= 75) return '5';
  return '6';
}

/** Menjalankan DSL seperti turtle graphics → centerline 3D ter-sample tiap 3 m. */
export function buildTrackData(segs: Seg[] = SEGMENTS): TrackData {
  const samples: Sample[] = [];
  let x = 0;
  let z = 0;
  let y = START_ALT;
  let heading = Math.PI / 2; // menghadap timur
  let dist = 0;
  let grade = 0.02;
  let maxGrade = 0;
  samples.push({ x, y, z, dist, heading, curvature: 0, seg: 0 });
  const segRange: [number, number][] = [];

  segs.forEach((s, si) => {
    if (s.grade !== undefined) grade = s.grade;
    maxGrade = Math.max(maxGrade, grade);
    const startIdx = samples.length - 1;
    if (s.t === 's') {
      const steps = Math.max(1, Math.round(s.len / SAMPLE_STEP));
      const d = s.len / steps;
      for (let k = 0; k < steps; k++) {
        x += Math.sin(heading) * d;
        z += Math.cos(heading) * d;
        y -= grade * d;
        dist += d;
        samples.push({ x, y, z, dist, heading, curvature: 0, seg: si });
      }
    } else {
      const ang = (s.angle * Math.PI) / 180;
      const arc = Math.abs(ang) * s.radius;
      const steps = Math.max(2, Math.round(arc / SAMPLE_STEP));
      const d = arc / steps;
      const dth = ang / steps;
      const curv = -Math.sign(ang) / s.radius;
      for (let k = 0; k < steps; k++) {
        heading -= dth / 2; // integrasi titik-tengah
        x += Math.sin(heading) * d;
        z += Math.cos(heading) * d;
        heading -= dth / 2;
        y -= grade * d;
        dist += d;
        samples.push({ x, y, z, dist, heading, curvature: curv, seg: si });
      }
    }
    segRange.push([startIdx, samples.length - 1]);
  });

  // haluskan profil vertikal (perubahan gradien tidak patah)
  const n = samples.length;
  for (let pass = 0; pass < 2; pass++) {
    const ys = samples.map((s) => s.y);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let c = 0;
      for (let k = -5; k <= 5; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        sum += ys[j];
        c++;
      }
      samples[i].y = sum / c;
    }
  }

  const corners: TrackCorner[] = [];
  segs.forEach((s, si) => {
    if (s.t !== 'c') return;
    const [a, b] = segRange[si];
    const m = s.name?.match(/^Hairpin #(\d)/);
    corners.push({
      seg: si,
      start: a,
      end: b,
      apex: Math.round((a + b) / 2),
      dir: s.angle > 0 ? 'RIGHT' : 'LEFT',
      angle: s.angle,
      radius: s.radius,
      grade: cornerGrade(s.angle, s.radius),
      long: Math.abs((s.angle * Math.PI) / 180) * s.radius > 80,
      name: s.name,
      hairpinNo: m ? Number(m[1]) : undefined,
    });
  });

  const hp1 = segs.findIndex((s) => s.name === 'Hairpin #1');
  const hp5 = segs.findIndex((s) => s.name === 'Hairpin #5');
  const length = samples[n - 1].dist;
  const startY = samples[0].y;
  const endY = samples[n - 1].y;

  return {
    samples,
    length,
    startY,
    endY,
    corners,
    segRange,
    hairpinStart: Math.max(0, segRange[hp1][0] - 8),
    hairpinEnd: Math.min(n - 1, segRange[hp5][1] + 4),
    avgGrade: (startY - endY) / length,
    maxGrade,
  };
}

const DIR_ID = { LEFT: 'Kiri', RIGHT: 'Kanan' } as const;

/** Tulis ulang DSL sebagai pace note (bahasa reli). */
export function paceNotes(segs: Seg[] = SEGMENTS): string[] {
  const out: string[] = [];
  segs.forEach((s) => {
    if (s.t === 's') {
      out.push(`${s.name ? s.name + ' — ' : ''}lurus ${s.len} m${s.note ? ` (${s.note})` : ''}`);
    } else {
      const g = cornerGrade(s.angle, s.radius);
      const d = DIR_ID[s.angle > 0 ? 'RIGHT' : 'LEFT'];
      const label = g === 'HAIRPIN' ? `Hairpin ${d.toLowerCase()}` : `${d} ${g}`;
      out.push(
        `${s.name && !s.name.startsWith('Hairpin') ? s.name + ' — ' : ''}${label}${
          s.name?.startsWith('Hairpin #') ? ' ' + s.name.slice(9) : ''
        } (r≈${s.radius}, ${Math.abs(s.angle)}°)`
      );
    }
  });
  return out;
}
