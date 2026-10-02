// =============================================================
//  MT. HARUNA DOWNHILL  (Gunma Pref. Route 33 / "Akina" Downhill)
//  Rekonstruksi geometri jalan berdasarkan karakter asli:
//  Start : Danau Haruna (~1.084 m dpl)
//  Finish: area Kuil Haruna (~ 760 m dpl)
//  Ciri  : 5 hairpin beruntun, seksi S panjang, "gutter" hairpin,
//          rata-rata gradien -7%, lebar jalan ~ 7,5 m
// =============================================================

export type Seg =
  | { t: 's'; len: number; grade?: number; name?: string }
  | {
      t: 'c'
      angle: number // derajat, + = kanan, - = kiri
      radius: number
      grade?: number
      name?: string
      note?: string
    }

// Urutan tikungan mengikuti karakter turunan Haruna dari danau ke kuil.
export const SEGMENTS: Seg[] = [
  { t: 's', len: 190, grade: 0.02, name: 'Start / Danau Haruna' },
  { t: 'c', angle: -90, radius: 42, grade: 0.045, name: 'Lakeside Left', note: 'Kiri 4' },
  { t: 's', len: 120, grade: 0.06 },
  { t: 'c', angle: 170, radius: 13, grade: 0.09, name: 'Hairpin #1', note: 'Hairpin kanan 1' },
  { t: 's', len: 72, grade: 0.09 },
  { t: 'c', angle: -166, radius: 13.5, grade: 0.09, name: 'Hairpin #2', note: 'Hairpin kiri 2' },
  { t: 's', len: 62, grade: 0.095 },
  { t: 'c', angle: 172, radius: 12, grade: 0.1, name: 'Hairpin #3', note: 'Hairpin kanan 3' },
  { t: 's', len: 66, grade: 0.095 },
  { t: 'c', angle: -160, radius: 13.5, grade: 0.09, name: 'Hairpin #4', note: 'Hairpin kiri 4' },
  { t: 's', len: 78, grade: 0.09 },
  { t: 'c', angle: 175, radius: 12.5, grade: 0.09, name: 'Hairpin #5', note: 'Hairpin kanan 5' },
  { t: 's', len: 225, grade: 0.07, name: 'Straight 1' },
  { t: 'c', angle: 60, radius: 70, grade: 0.06, note: 'Kanan 5' },
  { t: 'c', angle: -80, radius: 50, grade: 0.06, note: 'Kiri 4' },
  { t: 's', len: 155, grade: 0.07 },
  { t: 'c', angle: 100, radius: 35, grade: 0.075, name: 'Cut Bank Right', note: 'Kanan 3 rapat' },
  { t: 's', len: 88, grade: 0.07 },
  { t: 'c', angle: -122, radius: 28, grade: 0.08, name: 'Rock Wall Left', note: 'Kiri 2 panjang' },
  { t: 's', len: 70, grade: 0.07 },
  { t: 'c', angle: 70, radius: 45, grade: 0.06, note: 'Kanan 4' },
  { t: 'c', angle: -55, radius: 62, grade: 0.055, note: 'Kiri 5' },
  { t: 's', len: 265, grade: 0.05, name: 'Long Straight' },
  { t: 'c', angle: -150, radius: 15, grade: 0.085, name: 'Gutter Hairpin', note: 'Hairpin kiri — gutter!' },
  { t: 's', len: 110, grade: 0.08 },
  { t: 'c', angle: 90, radius: 38, grade: 0.07, note: 'Kanan 4' },
  { t: 'c', angle: -95, radius: 33, grade: 0.07, name: 'S-Complex', note: 'Kiri 3 ke kanan' },
  { t: 's', len: 140, grade: 0.07 },
  { t: 'c', angle: 140, radius: 20, grade: 0.085, name: 'Blind Right', note: 'Kanan 2 buta' },
  { t: 's', len: 82, grade: 0.075 },
  { t: 'c', angle: -100, radius: 30, grade: 0.075, note: 'Kiri 3' },
  { t: 'c', angle: 75, radius: 44, grade: 0.06, note: 'Kanan 4' },
  { t: 's', len: 295, grade: 0.05, name: 'Cedar Straight' },
  { t: 'c', angle: 160, radius: 14, grade: 0.09, name: 'Hairpin #6', note: 'Hairpin kanan' },
  { t: 's', len: 92, grade: 0.08 },
  { t: 'c', angle: -85, radius: 40, grade: 0.07, note: 'Kiri 4' },
  { t: 's', len: 120, grade: 0.07 },
  { t: 'c', angle: 110, radius: 26, grade: 0.08, note: 'Kanan 3' },
  { t: 'c', angle: -130, radius: 22, grade: 0.085, name: 'Double Apex Left', note: 'Kiri 2 ganda' },
  { t: 's', len: 105, grade: 0.07 },
  { t: 'c', angle: 65, radius: 55, grade: 0.055, note: 'Kanan 5' },
  { t: 's', len: 185, grade: 0.05 },
  { t: 'c', angle: -95, radius: 34, grade: 0.07, name: 'Shrine Left', note: 'Kiri 3' },
  { t: 's', len: 150, grade: 0.05 },
  { t: 'c', angle: 80, radius: 46, grade: 0.045, note: 'Kanan 4' },
  { t: 's', len: 250, grade: 0.03, name: 'Finish / Kuil Haruna' },
]

export interface TrackSample {
  x: number
  y: number
  z: number
  dist: number
  heading: number // radian, 0 = +Z
  curvature: number // 1/radius, + kanan
}

export interface Corner {
  name: string
  note: string
  dist: number
  dir: 'L' | 'R'
  radius: number
}

export interface TrackData {
  samples: TrackSample[]
  corners: Corner[]
  length: number
  startY: number
  endY: number
  bbox: { minX: number; maxX: number; minZ: number; maxZ: number }
  halfWidth: number
}

const STEP = 3 // meter per sample

export function buildTrack(): TrackData {
  const samples: TrackSample[] = []
  const corners: Corner[] = []

  let x = 0
  let z = 0
  let y = 1084
  let heading = 0
  let dist = 0

  const push = (curvature: number) => {
    samples.push({ x, y, z, dist, heading, curvature })
  }

  push(0)

  for (const seg of SEGMENTS) {
    const grade = seg.grade ?? 0.06
    if (seg.t === 's') {
      const n = Math.max(1, Math.round(seg.len / STEP))
      const d = seg.len / n
      for (let i = 0; i < n; i++) {
        x += Math.sin(heading) * d
        z += Math.cos(heading) * d
        y -= grade * d
        dist += d
        push(0)
      }
    } else {
      const rad = (seg.angle * Math.PI) / 180
      const arcLen = Math.abs(rad) * seg.radius
      const n = Math.max(3, Math.round(arcLen / STEP))
      const d = arcLen / n
      const dh = rad / n
      const curv = Math.sign(rad) / seg.radius
      corners.push({
        name: seg.name ?? (rad > 0 ? 'Right' : 'Left'),
        note: seg.note ?? '',
        dist,
        dir: rad > 0 ? 'R' : 'L',
        radius: seg.radius,
      })
      for (let i = 0; i < n; i++) {
        heading += dh
        x += Math.sin(heading) * d
        z += Math.cos(heading) * d
        y -= grade * d
        dist += d
        push(curv)
      }
    }
  }

  // Haluskan elevasi supaya sambungan antar segmen tidak patah (kink)
  // yang bikin aspal "melipat" dan nembus lereng. Ujung start/finish dikunci.
  const y0 = samples[0].y
  const y1 = samples[samples.length - 1].y
  const rawY = samples.map((s) => s.y)
  const R = 5
  for (let i = 1; i < samples.length - 1; i++) {
    let acc = 0
    let w = 0
    for (let k = -R; k <= R; k++) {
      const j = Math.min(samples.length - 1, Math.max(0, i + k))
      const wk = R + 1 - Math.abs(k)
      acc += rawY[j] * wk
      w += wk
    }
    const edge = Math.min(i, samples.length - 1 - i) / R
    const blend = Math.min(1, edge)
    samples[i].y = rawY[i] * (1 - blend) + (acc / w) * blend
  }
  samples[0].y = y0
  samples[samples.length - 1].y = y1

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const s of samples) {
    if (s.x < minX) minX = s.x
    if (s.x > maxX) maxX = s.x
    if (s.z < minZ) minZ = s.z
    if (s.z > maxZ) maxZ = s.z
  }

  return {
    samples,
    corners,
    length: dist,
    startY: samples[0].y,
    endY: samples[samples.length - 1].y,
    bbox: { minX, maxX, minZ, maxZ },
    halfWidth: 3.9,
  }
}

// ---- Pencarian titik terdekat (spatial hash) -----------------
export class TrackIndex {
  private cell = 24
  private grid = new Map<string, number[]>()
  constructor(public track: TrackData) {
    track.samples.forEach((s, i) => {
      const key = this.key(s.x, s.z)
      const arr = this.grid.get(key)
      if (arr) arr.push(i)
      else this.grid.set(key, [i])
    })
  }
  private key(x: number, z: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`
  }
  nearest(x: number, z: number): { sample: TrackSample; d: number; side: number; index: number } {
    let best = -1
    let bestD = Infinity
    const cx = Math.floor(x / this.cell)
    const cz = Math.floor(z / this.cell)
    for (let r = 1; r <= 6 && best < 0; r++) {
      for (let i = cx - r; i <= cx + r; i++) {
        for (let j = cz - r; j <= cz + r; j++) {
          const arr = this.grid.get(`${i},${j}`)
          if (!arr) continue
          for (const idx of arr) {
            const s = this.track.samples[idx]
            const dd = (s.x - x) ** 2 + (s.z - z) ** 2
            if (dd < bestD) {
              bestD = dd
              best = idx
            }
          }
        }
      }
    }
    if (best < 0) {
      // fallback linear
      this.track.samples.forEach((s, idx) => {
        const dd = (s.x - x) ** 2 + (s.z - z) ** 2
        if (dd < bestD) {
          bestD = dd
          best = idx
        }
      })
    }
    const s = this.track.samples[best]
    // sisi: + = kanan arah jalan (sisi jurang), - = kiri (tebing)
    const tx = Math.sin(s.heading)
    const tz = Math.cos(s.heading)
    const side = (x - s.x) * tz - (z - s.z) * tx
    return { sample: s, d: Math.sqrt(bestD), side: Math.sign(side) || 1, index: best }
  }
}
