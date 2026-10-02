import * as THREE from 'three'

export const TRACK_WIDTH = 7.5
export const CURB_WIDTH = 0.7
export const GRAVEL_WIDTH = 2.6
export const BARRIER_OFFSET = TRACK_WIDTH / 2 + CURB_WIDTH + GRAVEL_WIDTH
export const SAMPLES = 800
export const TRACK_SCALE = 1.3

// Titik kontrol sirkuit (x, z) - arah balapan mengikuti urutan
const CONTROL: [number, number][] = [
  [-30, -42],
  [-5, -44],
  [22, -42],
  [46, -30],
  [56, -6],
  [46, 14],
  [54, 34],
  [42, 54],
  [20, 52],
  [8, 34],
  [-8, 24],
  [-28, 36],
  [-52, 24],
  [-58, -4],
  [-50, -28],
]

export interface TrackSample {
  x: number
  z: number
  tx: number
  tz: number
  rx: number // right-normal x
  rz: number // right-normal z
}

export interface ClipPoint {
  idx: number
  x: number
  z: number
  side: number
}

export const curve = new THREE.CatmullRomCurve3(
  CONTROL.map(([x, z]) => new THREE.Vector3(x * TRACK_SCALE, 0, z * TRACK_SCALE)),
  true,
  'catmullrom',
  0.6,
)

export const samples: TrackSample[] = []
for (let i = 0; i < SAMPLES; i++) {
  const t = i / SAMPLES
  const p = curve.getPointAt(t)
  const tan = curve.getTangentAt(t).normalize()
  samples.push({ x: p.x, z: p.z, tx: tan.x, tz: tan.z, rx: -tan.z, rz: tan.x })
}

export function headingFromTangent(tx: number, tz: number) {
  // forward vector f = (-sin h, -cos h)
  return Math.atan2(-tx, -tz)
}

export function nearestSample(x: number, z: number, hint?: number) {
  let best = -1
  let bestD = Infinity
  if (hint === undefined) {
    for (let i = 0; i < SAMPLES; i++) {
      const s = samples[i]
      const d = (s.x - x) ** 2 + (s.z - z) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
  } else {
    for (let k = -50; k <= 50; k++) {
      const i = (hint + k + SAMPLES) % SAMPLES
      const s = samples[i]
      const d = (s.x - x) ** 2 + (s.z - z) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
  }
  const s = samples[best]
  const lateral = (x - s.x) * s.rx + (z - s.z) * s.rz
  return { idx: best, lateral, dist: Math.sqrt(bestD) }
}

// Clipping points: apex tikungan (kurvatur maksimum lokal)
export const curvature: number[] = []
export const curvSign: number[] = []
function computeClipPoints(): ClipPoint[] {
  const curv = curvature
  const signs = curvSign
  for (let i = 0; i < SAMPLES; i++) {
    const a = samples[(i - 10 + SAMPLES) % SAMPLES]
    const b = samples[(i + 10) % SAMPLES]
    const cross = a.tx * b.tz - a.tz * b.tx
    const dot = a.tx * b.tx + a.tz * b.tz
    curv.push(Math.abs(Math.atan2(cross, dot)))
    signs.push(cross < 0 ? -1 : 1)
  }
  const candidates = samples
    .map((_, i) => i)
    .filter((i) => {
      const c = curv[i]
      if (c < 0.12) return false
      for (let k = -15; k <= 15; k++) {
        if (curv[(i + k + SAMPLES) % SAMPLES] > c) return false
      }
      return true
    })
    .sort((a, b) => curv[b] - curv[a])
  const chosen: number[] = []
  for (const i of candidates) {
    if (chosen.every((c) => Math.min(Math.abs(c - i), SAMPLES - Math.abs(c - i)) > 60)) {
      chosen.push(i)
    }
    if (chosen.length >= 7) break
  }
  chosen.sort((a, b) => a - b)
  return chosen.map((idx) => {
    const s = samples[idx]
    const side = signs[idx]
    const off = TRACK_WIDTH / 2 + 0.35
    return { idx, x: s.x + s.rx * side * off, z: s.z + s.rz * side * off, side }
  })
}

export const clipPoints = computeClipPoints()

// Posisi pohon acak di luar sirkuit (deterministik)
function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}


// ===== Zona bonus ala dunia drifting =====
export interface OuterZone {
  idx: number // pusat zona (exit tikungan)
  from: number
  to: number
  side: number // sisi luar (-1/1) relatif right-normal
  x: number
  z: number
}
export interface DriftSector {
  id: number
  from: number
  to: number
  name: string
}

// Outer zone: sisi LUAR di exit tikungan (setelah apex)
export const outerZones: OuterZone[] = clipPoints.map((cp) => {
  const idx = (cp.idx + 22) % SAMPLES
  const s = samples[idx]
  const side = -cp.side
  const off = TRACK_WIDTH / 2 - 0.9
  return { idx, from: (idx - 10 + SAMPLES) % SAMPLES, to: (idx + 12) % SAMPLES, side, x: s.x + s.rx * side * off, z: s.z + s.rz * side * off }
})

// Drift sector: rangkaian tikungan; dinilai persentase waktu drift di dalamnya
export const driftSectors: DriftSector[] = (() => {
  const out: DriftSector[] = []
  const names = ['SEKTOR A', 'SEKTOR B', 'SEKTOR C', 'SEKTOR D']
  // gabungkan clip yang berdekatan menjadi satu sektor
  let group: number[] = []
  const flush = () => {
    if (!group.length) return
    const from = (group[0] - 30 + SAMPLES) % SAMPLES
    const to = (group[group.length - 1] + 34) % SAMPLES
    out.push({ id: out.length, from, to, name: names[out.length % names.length] })
    group = []
  }
  const idxs = clipPoints.map((c) => c.idx)
  for (let i = 0; i < idxs.length; i++) {
    if (group.length && idxs[i] - group[group.length - 1] > 110) flush()
    group.push(idxs[i])
  }
  flush()
  return out.slice(0, 4)
})()

export function inRange(idx: number, from: number, to: number) {
  return from <= to ? idx >= from && idx <= to : idx >= from || idx <= to
}

// ===== Tribun penonton (posisi & orientasi) =====
export interface Stand {
  x: number
  z: number
  rot: number
  len: number
  rows: number
  side: number
  idx: number
}
export const stands: Stand[] = (() => {
  const defs = [
    { idx: 12, side: 1, len: 26, rows: 5 }, // start straight
    { idx: 12, side: -1, len: 20, rows: 4 },
    ...clipPoints.slice(0, 4).map((cp, i) => ({ idx: (cp.idx + 6) % SAMPLES, side: -cp.side, len: 16 + (i % 2) * 6, rows: 4 })),
  ]
  return defs.map((d) => {
    const s = samples[d.idx]
    const off = BARRIER_OFFSET + 4.5
    return { x: s.x + s.rx * d.side * off, z: s.z + s.rz * d.side * off, rot: headingFromTangent(s.tx, s.tz), len: d.len, rows: d.rows, side: d.side, idx: d.idx }
  })
})()

function inGrandstand(x: number, z: number) {
  return stands.some((st) => Math.hypot(st.x - x, st.z - z) < st.len / 2 + 6)
}

export const trees: { x: number; z: number; s: number }[] = (() => {
  const rnd = mulberry32(1337)
  const out: { x: number; z: number; s: number }[] = []
  let tries = 0
  while (out.length < 160 && tries < 8000) {
    tries++
    const x = (rnd() - 0.5) * 260
    const z = (rnd() - 0.5) * 250
    const n = nearestSample(x, z)
    if (n.dist < BARRIER_OFFSET + 7) continue
    if (n.dist > 70) continue
    if (inGrandstand(x, z)) continue
    out.push({ x, z, s: 0.8 + rnd() * 0.8 })
  }
  return out
})()
