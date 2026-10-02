import * as THREE from 'three'
import { TrackData, TrackIndex, TrackSample } from '../track/haruna'
import { PAL } from './palette'

// ---------- noise sederhana ----------
function hash(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}
function fbm(x: number, y: number) {
  let s = 0
  let a = 0.5
  let f = 1
  for (let i = 0; i < 4; i++) {
    s += a * vnoise(x * f, y * f)
    a *= 0.5
    f *= 2.07
  }
  return s * 2 - 1
}

/** Aspal diangkat jelas di atas terrain yang dipahat di bawahnya,
 *  supaya jalan utama TIDAK PERNAH tertutup tanah. */
export const ROAD_LIFT = 0.5

function smoothCurv(s: TrackSample[], i: number) {
  let acc = 0
  let w = 0
  for (let k = -4; k <= 4; k++) {
    const j = Math.min(s.length - 1, Math.max(0, i + k))
    const wk = 5 - Math.abs(k)
    acc += s[j].curvature * wk
    w += wk
  }
  return acc / w
}

/** Banking sangat lembut (±10 cm). Banking besar bikin tepi aspal nyungsep ke lereng. */
function bankAmount(curv: number) {
  return THREE.MathUtils.clamp(-curv * 2.4, -0.1, 0.1)
}

function rightOf(p: TrackSample) {
  return { x: Math.cos(p.heading), z: -Math.sin(p.heading) }
}

function smoothstep(a: number, b: number, x: number) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

export class Terrain {
  lake = { x: 0, z: 0, y: 0, r: 230 }
  /** hash kasar (80 m) untuk rata-rata elevasi yang mulus */
  private coarse = new Map<string, number[]>()
  private s: TrackSample[]

  constructor(private index: TrackIndex) {
    this.s = index.track.samples
    for (let i = 0; i < this.s.length; i++) {
      const p = this.s[i]
      const k = `${Math.floor(p.x / 80)},${Math.floor(p.z / 80)}`
      const a = this.coarse.get(k)
      if (a) a.push(i)
      else this.coarse.set(k, [i])
    }
    const s0 = this.s[0]
    const hx = Math.sin(s0.heading)
    const hz = Math.cos(s0.heading)
    this.lake = { x: s0.x - hx * 250, z: s0.z - hz * 250, y: s0.y + 1.5, r: 230 }
  }

  road(x: number, z: number) {
    return this.index.nearest(x, z)
  }

  /**
   * Rata-rata elevasi jalan berbobot jarak — KONTINU di mana-mana.
   * Di antara dua leg hairpin, kedua leg ikut menimbang sehingga terbentuk
   * sadel/tanggul alami, bukan dinding patahan.
   */
  private avgY(x: number, z: number, radius: number, sigma: number): number | null {
    const c = 80
    const r = Math.ceil(radius / c)
    const cx = Math.floor(x / c)
    const cz = Math.floor(z / c)
    let ws = 0
    let ys = 0
    const r2 = radius * radius
    const s2 = sigma * sigma
    for (let i = cx - r; i <= cx + r; i++) {
      for (let j = cz - r; j <= cz + r; j++) {
        const arr = this.coarse.get(`${i},${j}`)
        if (!arr) continue
        for (const k of arr) {
          const p = this.s[k]
          const dx = p.x - x
          const dz = p.z - z
          const d2 = dx * dx + dz * dz
          if (d2 > r2) continue
          const w = 1 / (1 + d2 / s2)
          ws += w
          ys += p.y * w
        }
      }
    }
    return ws > 1e-6 ? ys / ws : null
  }

  lakeDist(x: number, z: number) {
    return Math.hypot(x - this.lake.x, z - this.lake.z)
  }

  /** Cekungan danau: dasar di bawah air, pantai pasir di tepi. */
  private applyLake(h: number, x: number, z: number) {
    const d = this.lakeDist(x, z)
    const t = smoothstep(this.lake.r - 14, this.lake.r + 30, d)
    if (t >= 1) return h
    const bed = this.lake.y - 4 + fbm(x * 0.02, z * 0.02) * 0.6
    return bed * (1 - t) + h * t
  }

  naturalFrom(
    _n: { sample: TrackSample; d: number; side: number },
    x: number,
    z: number,
  ): number {
    return this.naturalAt(x, z)
  }

  /**
   * Lembah sempurna: dekat jalan menempel elevasi blend (mulus antar hairpin),
   * menjauh berubah jadi bukit bergulung + pegunungan jauh. Tanpa flip sisi,
   * jadi tidak ada lagi dinding "barbar".
   */
  naturalAt(x: number, z: number): number {
    const n = this.road(x, z)
    const d = n.d
    const hw = this.index.track.halfWidth
    const hills = (amp: number) => fbm(x * 0.0011 + 7.3, z * 0.0011 - 2.1) * amp
    let h: number
    if (d < 150) {
      const yN = this.avgY(x, z, 80, 26) ?? n.sample.y
      // tanggul SANGAT rendah — jalan duduk di lembah dangkal, tidak tenggelam.
      const emb = Math.min(1.0, Math.max(0, d - 6.5) * 0.12)
      const det =
        fbm(x * 0.004, z * 0.004) * Math.min(1, d / 30) * 2.2 +
        fbm(x * 0.02, z * 0.02) * Math.min(1, d / 22) * 0.35
      h = yN - 0.5 + emb + det
      if (d > 48) {
        const yF = this.avgY(x, z, 340, 130) ?? n.sample.y
        const far = yF + smoothstep(120, 520, d) * 120 + hills(14 + Math.min(30, d * 0.06))
        const t = smoothstep(48, 135, d)
        h = h * (1 - t) + far * t
      }
      h = this.applyLake(h, x, z)
    } else {
      const yF = this.avgY(x, z, 420, 160) ?? n.sample.y
      h = yF + smoothstep(120, 520, d) * 120 + hills(14 + Math.min(30, d * 0.06))
      h = this.applyLake(h, x, z)
    }
    // JAMINAN KERAS: dalam 22 m dari sumbu jalan, tanah TIDAK BOLEH
    // lebih tinggi dari permukaan aspal. Di bawah 12 m ia dipaksa di
    // bawah aspal; 12–22 m boleh naik perlahan (aman, jauh dari tepi).
    if (d < 22) {
      const surf = n.sample.y + ROAD_LIFT
      const cap = surf - 0.75 + Math.max(0, d - (hw + 5)) * 0.4
      if (h > cap) h = cap
    }
    return h
  }

  /** Permukaan yang diinjak mobil: aspal di koridor, lalu menyatu ke lereng. */
  heightAt(x: number, z: number): number {
    const n = this.road(x, z)
    const top = n.sample.y + ROAD_LIFT
    const hw = this.index.track.halfWidth
    if (n.d <= hw) return top
    const natural = this.naturalAt(x, z)
    const reach = hw + 3.2
    if (n.d < reach) {
      const u = (n.d - hw) / (reach - hw)
      const s = u * u * (3 - 2 * u)
      return top * (1 - s) + natural * s
    }
    return natural
  }
}

const COL_GRASS = new THREE.Color(PAL.grass)
const COL_GRASS2 = new THREE.Color(PAL.grassDeep)
const COL_MEADOW = new THREE.Color(PAL.meadow)
const COL_FOREST = new THREE.Color(PAL.forest)
const COL_ROCK = new THREE.Color(PAL.rock)
const COL_DIRT = new THREE.Color(PAL.dirt)
const COL_DIRT2 = new THREE.Color(PAL.dirtDeep)
const COL_SAND = new THREE.Color(PAL.sand)

/**
 * Pewarnaan soft ala art of rally: sage tenang, bidang besar, transisi lembut.
 * Beige hangat HANYA menempel tipis di dekat aspal — bukan hamparan menyala.
 */
function slopeColor(
  y: number,
  slope: number,
  dRoad: number,
  dLake: number,
  lakeR: number,
  x: number,
  z: number,
) {
  const patch = fbm(x * 0.0009 + 3.1, z * 0.0009 - 1.7)
  const patch2 = fbm(x * 0.0045 - 5.2, z * 0.0045 + 9.4)
  // BASE sage — variasi sangat lembut (±12%), bukan belang mencolok
  const c = COL_GRASS.clone()
  c.lerp(COL_GRASS2, THREE.MathUtils.clamp(0.4 + patch * 0.22, 0, 1))
  c.lerp(COL_MEADOW, THREE.MathUtils.clamp(0.14 + patch2 * 0.14 - slope * 0.55, 0, 0.26))
  // rona hutan redup di ketinggian
  c.lerp(COL_FOREST, THREE.MathUtils.clamp((y - 900) / 320, 0, 1) * 0.38)
  // pita tanah tipis & pudar di dekat jalan (maks 9 m, blend lembut)
  if (dRoad < 9) {
    const t = 1 - dRoad / 9
    const dirt = COL_DIRT.clone().lerp(COL_DIRT2, THREE.MathUtils.clamp(0.45 + patch2 * 0.2, 0, 1))
    c.lerp(dirt, t * t * 0.6)
  }
  // singkapan batu di curam ekstrem, redup
  if (slope > 0.55) c.lerp(COL_ROCK, THREE.MathUtils.clamp((slope - 0.55) * 1.6, 0, 0.55))
  // gelang pasir pantai danau
  const shore = 1 - THREE.MathUtils.clamp((dLake - (lakeR - 8)) / 40, 0, 1)
  if (shore > 0) c.lerp(COL_SAND, shore * 0.85)
  return c
}

interface V {
  x: number
  y: number
  z: number
  d: number
  roadY: number
}

function lerpV(a: V, b: V, t: number, d: number): V {
  return {
    x: a.x + (b.x - a.x) * t,
    // tepi potongan SELALU 75 cm di bawah aspal — tidak ada tanah menyentuh jalan
    y: Math.min(a.y + (b.y - a.y) * t, a.roadY + (b.roadY - a.roadY) * t - 0.75),
    z: a.z + (b.z - a.z) * t,
    d,
    roadY: a.roadY + (b.roadY - a.roadY) * t,
  }
}

/** Buang bagian segitiga yang masuk koridor jalan. */
function clipOutside(poly: V[], limit: number): V[] {
  const out: V[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const aKeep = a.d >= limit
    const bKeep = b.d >= limit
    if (aKeep !== bKeep) {
      const denom = b.d - a.d
      const t = Math.abs(denom) < 1e-6 ? 0 : (limit - a.d) / denom
      out.push(lerpV(a, b, THREE.MathUtils.clamp(t, 0, 1), limit))
    }
    if (bKeep) out.push(b)
  }
  return out
}

export function buildTerrainMesh(track: TrackData, terrain: Terrain) {
  const margin = 200
  const { minX, maxX, minZ, maxZ } = track.bbox
  const x0 = minX - margin
  const x1 = maxX + margin
  const z0 = minZ - margin
  const z1 = maxZ + margin
  const cell = 6
  const nx = Math.ceil((x1 - x0) / cell)
  const nz = Math.ceil((z1 - z0) / cell)
  const hw = track.halfWidth

  const grid: V[] = new Array((nx + 1) * (nz + 1))
  const stride = nx + 1
  // PAHAT koridor jalan: slot dalam tepat di bawah aspal (tertutup jalan +
  // bahu, tak terlihat), selebihnya memakai naturalAt yang SUDAH dijamin
  // di bawah permukaan jalan dalam radius 22 m.
  const carve = (d: number, roadY: number, natural: number) => {
    if (d < hw + 1.5) return roadY - 2.0
    return natural
  }
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * cell
      const z = z0 + j * cell
      const n = terrain.road(x, z)
      const y = carve(n.d, n.sample.y, terrain.naturalAt(x, z))
      grid[j * stride + i] = { x, y, z, d: n.d, roadY: n.sample.y }
    }
  }

  // kemiringan per-vertex (beda hingga) untuk pewarnaan yang mulus
  const slopeAt = (i: number, j: number) => {
    const l = grid[j * stride + Math.max(0, i - 1)]
    const r = grid[j * stride + Math.min(nx, i + 1)]
    const dn = grid[Math.max(0, j - 1) * stride + i]
    const u = grid[Math.min(nz, j + 1) * stride + i]
    const dx = (r.y - l.y) / ((r.x - l.x) || cell)
    const dz = (u.y - dn.y) / ((u.z - dn.z) || cell)
    return 1 - 1 / Math.sqrt(dx * dx + dz * dz + 1)
  }

  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  // lubang terrain pas di luar aspal — bahu menutup sisanya, tidak ada celah
  const clipAt = hw + 1.1
  const lakeR = terrain.lake.r

  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const v = grid[j * stride + i]
      positions.push(v.x, v.y, v.z)
      const col = slopeColor(v.y, slopeAt(i, j), v.d, terrain.lakeDist(v.x, v.z), lakeR, v.x, v.z)
      colors.push(col.r, col.g, col.b)
    }
  }

  const pushLoose = (v: V) => {
    const id = positions.length / 3
    positions.push(v.x, v.y, v.z)
    const col = slopeColor(v.y, 0.1, v.d, terrain.lakeDist(v.x, v.z), lakeR, v.x, v.z)
    colors.push(col.r, col.g, col.b)
    return id
  }

  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const ia = j * stride + i
      const ib = ia + 1
      const ic = ia + stride
      const id = ic + 1
      const a = grid[ia]
      const b = grid[ib]
      const c = grid[ic]
      const d = grid[id]
      if (a.d >= clipAt && b.d >= clipAt && c.d >= clipAt && d.d >= clipAt) {
        indices.push(ia, ic, ib, ib, ic, id)
        continue
      }
      for (const poly of [
        [a, c, b],
        [b, c, d],
      ]) {
        const kept = clipOutside(poly, clipAt)
        if (kept.length < 3) continue
        const ids = kept.map(pushLoose)
        for (let k = 1; k < ids.length - 1; k++) indices.push(ids[0], ids[k], ids[k + 1])
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  mesh.renderOrder = 0
  return mesh
}

/** Kubah langit gradien. Dipasang sebagai anak kamera supaya selalu mengelilingi pandangan. */
export function buildSky() {
  const group = new THREE.Group()
  const geo = new THREE.SphereGeometry(2400, 32, 20)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const zenith = new THREE.Color(PAL.skyZenith)
  const mid = new THREE.Color(PAL.skyMid)
  const horizon = new THREE.Color(PAL.skyHorizon)
  const haze = new THREE.Color(PAL.fog)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 2400
    if (y < 0) {
      c.copy(haze)
    } else if (y < 0.16) {
      // pita hangat di horizon — dunia melebur tanpa garis
      const t = y / 0.16
      const s = t * t * (3 - 2 * t)
      c.copy(haze).lerp(horizon, s)
    } else if (y < 0.5) {
      const t = (y - 0.16) / 0.34
      const s = t * t * (3 - 2 * t)
      c.copy(horizon).lerp(mid, s)
    } else {
      const t = THREE.MathUtils.clamp((y - 0.5) / 0.5, 0, 1)
      const s = Math.pow(t, 0.75)
      c.copy(mid).lerp(zenith, s)
    }
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const dome = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  )
  dome.frustumCulled = false
  dome.renderOrder = -10
  group.add(dome)

  // --- piringan matahari + glow siang ---
  const sunDir = new THREE.Vector3(0.42, 0.62, 0.2).normalize()
  const sunPos = sunDir.clone().multiplyScalar(2150)
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(70, 32),
    new THREE.MeshBasicMaterial({ color: PAL.sunCore, fog: false, transparent: true, opacity: 0.98, depthWrite: false }),
  )
  core.position.copy(sunPos)
  core.lookAt(0, 0, 0)
  core.renderOrder = -9
  group.add(core)
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(190, 32),
    new THREE.MeshBasicMaterial({ color: PAL.sunGlow, fog: false, transparent: true, opacity: 0.35, depthWrite: false }),
  )
  glow.position.copy(sunDir.clone().multiplyScalar(2140))
  glow.lookAt(0, 0, 0)
  glow.renderOrder = -9
  group.add(glow)
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(360, 32),
    new THREE.MeshBasicMaterial({ color: PAL.sunGlow, fog: false, transparent: true, opacity: 0.14, depthWrite: false }),
  )
  halo.position.copy(sunDir.clone().multiplyScalar(2130))
  halo.lookAt(0, 0, 0)
  halo.renderOrder = -9
  group.add(halo)
  return group
}

/** Balik tiap segitiga yang normalnya menghadap ke bawah, supaya bahu kiri & kanan sama-sama kena cahaya. */
function ensureUp(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position')
  const idx = geo.index
  if (!idx) {
    geo.computeVertexNormals()
    return geo
  }
  const av = new THREE.Vector3()
  const bv = new THREE.Vector3()
  const cv = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  for (let i = 0; i < idx.count; i += 3) {
    const i0 = idx.getX(i)
    const i1 = idx.getX(i + 1)
    const i2 = idx.getX(i + 2)
    av.fromBufferAttribute(pos, i0)
    bv.fromBufferAttribute(pos, i1)
    cv.fromBufferAttribute(pos, i2)
    ab.subVectors(bv, av)
    ac.subVectors(cv, av)
    if (ab.cross(ac).y < 0) {
      idx.setX(i + 1, i2)
      idx.setX(i + 2, i1)
    }
  }
  geo.computeVertexNormals()
  return geo
}

export function buildRoad(track: TrackData) {
  const g = new THREE.Group()
  const hw = track.halfWidth

  const asphalt = new THREE.Mesh(
    ensureUp(buildDeck(track, -hw, hw, 0)),
    new THREE.MeshLambertMaterial({
      color: PAL.road,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  )
  asphalt.receiveShadow = true
  asphalt.renderOrder = 2
  g.add(asphalt)

  // rok beton — muka sedikit miring keluar, nutup celah di bawah tepi aspal
  const skirtMat = new THREE.MeshLambertMaterial({ color: PAL.skirt, side: THREE.DoubleSide })
  for (const sgn of [-1, 1]) {
    const m = new THREE.Mesh(skirtGeo(track, sgn), skirtMat)
    m.receiveShadow = true
    m.castShadow = true
    m.renderOrder = 2
    g.add(m)
  }

  g.add(buildMarkings(track))
  return g
}

/** Deck aspal: tepi kiri/kanan ikut banking, keduanya di ROAD_LIFT. */
function buildDeck(track: TrackData, offA: number, offB: number, drop: number) {
  const s = track.samples
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i < s.length; i++) {
    const p = s[i]
    const r = rightOf(p)
    const bank = bankAmount(smoothCurv(s, i))
    const yA = p.y + ROAD_LIFT + bank * Math.sign(offA || 1) + drop
    const yB = p.y + ROAD_LIFT + bank * Math.sign(offB || 1) + drop
    pos.push(p.x + r.x * offA, yA, p.z + r.z * offA)
    pos.push(p.x + r.x * offB, yB, p.z + r.z * offB)
    const v = p.dist / 10
    uv.push(0, v, 1, v)
    if (i > 0) {
      const a = (i - 1) * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  return geo
}

function skirtGeo(track: TrackData, sgn: number) {
  const s = track.samples
  const hw = track.halfWidth
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i < s.length; i++) {
    const p = s[i]
    const r = rightOf(p)
    const bank = bankAmount(smoothCurv(s, i))
    const top = p.y + ROAD_LIFT + bank * sgn
    const x = p.x + r.x * sgn * hw
    const z = p.z + r.z * sgn * hw
    const ox = r.x * sgn * 0.16
    const oz = r.z * sgn * 0.16
    pos.push(x, top - 0.01, z)
    pos.push(x + ox, top - 0.46, z + oz)
    if (i > 0) {
      const a = (i - 1) * 2
      // normal menghadap keluar + sedikit ke atas, supaya rok kena cahaya
      if (sgn > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

function buildMarkings(track: TrackData) {
  const g = new THREE.Group()
  const hw = track.halfWidth
  const paint = new THREE.MeshBasicMaterial({
    color: PAL.line,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
  })
  const yLine = (p: TrackSample, i: number, side: number) =>
    p.y + ROAD_LIFT + bankAmount(smoothCurv(track.samples, i)) * side + 0.025

  // garis tepi kiri & kanan — duduk di aspal, bukan di luar badan jalan
  for (const sgn of [-1, 1]) {
    const off = sgn * (hw - 0.46)
    const geo = ensureUp(
      (() => {
        const s = track.samples
        const pos: number[] = []
        const idx: number[] = []
        const half = 0.12
        for (let i = 0; i < s.length; i++) {
          const p = s[i]
          const r = rightOf(p)
          const y = yLine(p, i, sgn)
          pos.push(p.x + r.x * (off - half), y, p.z + r.z * (off - half))
          pos.push(p.x + r.x * (off + half), y, p.z + r.z * (off + half))
          if (i > 0) {
            const a = (i - 1) * 2
            idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
          }
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        geo.setIndex(idx)
        return geo
      })(),
    )
    const m = new THREE.Mesh(geo, paint)
    m.renderOrder = 3
    g.add(m)
  }

  // garis tengah putus-putus — hanya di tikungan landai & lurusan
  const s = track.samples
  const pos: number[] = []
  const idx: number[] = []
  let vert = 0
  const period = 16
  const dash = 6
  for (let i = 1; i < s.length; i++) {
    const p = s[i]
    const q = s[i - 1]
    const phase = p.dist % period
    if (phase > dash) continue
    if (Math.abs(smoothCurv(s, i)) > 1 / 22) continue
    const r = rightOf(p)
    const rq = rightOf(q)
    const half = 0.08
    const y = p.y + ROAD_LIFT + 0.03
    const yq = q.y + ROAD_LIFT + 0.03
    pos.push(q.x - rq.x * half, yq, q.z - rq.z * half)
    pos.push(q.x + rq.x * half, yq, q.z + rq.z * half)
    pos.push(p.x - r.x * half, y, p.z - r.z * half)
    pos.push(p.x + r.x * half, y, p.z + r.z * half)
    const a = vert
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    vert += 4
  }
  if (vert > 0) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setIndex(idx)
    ensureUp(geo)
    const m = new THREE.Mesh(geo, paint)
    m.renderOrder = 3
    g.add(m)
  }
  return g
}

/**
 * Bahu jalan — DUA pita terpisah (kiri & kanan).
 * Versi lama menyambung kiri-luar ke kanan-luar, jadi lembaran tanah
 * memotong aspal. Sekarang tiap pita mulai TEPAT di tepi aspal dan
 * menjauh dari jalan; tidak pernah melintasi badan jalan.
 */
export function buildShoulder(track: TrackData, terrain: Terrain) {
  const s = track.samples
  const hw = track.halfWidth
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  // beberapa pita lateral supaya lereng timbunan tidak jadi satu bidang raksasa.
  // Pita pertama diselipkan TEPAT di bawah tepi aspal (tidak ada celah intip).
  const bands = [0.05, 1.7, 3.5, 5.6, 7.8]

  for (const sgn of [-1, 1] as const) {
    const valley = sgn > 0
    const base = pos.length / 3
    const cols = bands.length
    for (let i = 0; i < s.length; i++) {
      const p = s[i]
      const r = rightOf(p)
      const bank = bankAmount(smoothCurv(s, i))
      const edge = p.y + ROAD_LIFT + bank * sgn
      const outerX = p.x + r.x * sgn * (hw + bands[bands.length - 1])
      const outerZ = p.z + r.z * sgn * (hw + bands[bands.length - 1])
      let outerY = terrain.naturalAt(outerX, outerZ)
      // Bahu tidak pernah naik di atas tepi aspal (itu yang bikin tanah nembus jalan).
      // Tebing yang lebih tinggi diserahkan ke terrain di luar bahu.
      if (outerY > edge - 0.05) outerY = edge - 0.05
      for (let b = 0; b < cols; b++) {
        const u = b / (cols - 1)
        const eased = valley ? u * u : u * u * (3 - 2 * u)
        const off = hw + bands[b]
        const px = p.x + r.x * sgn * off
        const pz = p.z + r.z * sgn * off
        // profil bahu: turun lembut dari tepi aspal, SELALU di bawah aspal.
        // edge-0.10 awal → tidak ada titik bahu yang bisa naik menutup jalan.
        let y = edge - 0.1 + (outerY - (edge - 0.1)) * eased
        if (b === 0) y = edge - 0.1
        // JEPIT GANDA: bahu tidak boleh di atas aspal, dan tidak boleh di bawah
        // terrain yang sudah dipahat (+12 cm di atasnya supaya tidak z-fight).
        // Ini yang mencegah bahu menusuk jalan maupun ditembus tanah.
        const terrH = terrain.naturalAt(px, pz)
        const carveAllow = -2.2 + Math.max(0, off - (hw + 1.0)) * 0.5
        const carved = Math.min(terrH, p.y + carveAllow)
        y = Math.min(y, edge - 0.08)
        y = Math.max(y, carved + 0.12)
        pos.push(px, y, pz)
        // bahu beige redup → menyatu lembut ke sage (bukan oker menyala)
        const dirt = u < 0.24 ? 1 : THREE.MathUtils.clamp(1 - (u - 0.24) / 0.42, 0, 1)
        const c = COL_DIRT.clone().lerp(COL_GRASS, 1 - dirt)
        if (dirt < 0.55) c.lerp(COL_GRASS2, (0.55 - dirt) * 0.6)
        // redam saturasi bahu supaya tidak mengalahkan jalan
        c.lerp(COL_SAND, 0.22)
        col.push(c.r, c.g, c.b)
      }
    }
    const rows = s.length
    for (let i = 1; i < rows; i++) {
      for (let b = 0; b < cols - 1; b++) {
        const a = base + (i - 1) * cols + b
        idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  ensureUp(geo)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  )
  mesh.receiveShadow = true
  mesh.renderOrder = 1
  return mesh
}

/**
 * Guardrail khas touge Jepang:
 *  - sisi jurang (kanan): W-beam galvanis perak + tiang + reflektor merah
 *  - sisi tebing (kiri): tembok beton rendah + patok delineator putih/merah
 *  - hairpin: papan chevron merah-putih di sisi luar tikungan
 */
function chevronTexture(dir: 'L' | 'R') {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#f5f2ea'
  g.fillRect(0, 0, 256, 64)
  g.fillStyle = '#d63a2c'
  // 4 panah chevron
  for (let k = 0; k < 4; k++) {
    const x0 = 14 + k * 62
    g.beginPath()
    if (dir === 'R') {
      g.moveTo(x0, 8)
      g.lineTo(x0 + 30, 32)
      g.lineTo(x0, 56)
      g.lineTo(x0 + 18, 56)
      g.lineTo(x0 + 48, 32)
      g.lineTo(x0 + 18, 8)
    } else {
      g.moveTo(x0 + 30, 8)
      g.lineTo(x0, 32)
      g.lineTo(x0 + 30, 56)
      g.lineTo(x0 + 48, 56)
      g.lineTo(x0 + 18, 32)
      g.lineTo(x0 + 48, 8)
    }
    g.closePath()
    g.fill()
  }
  g.strokeStyle = '#2b2b2b'
  g.lineWidth = 5
  g.strokeRect(2, 2, 252, 60)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function buildGuardrails(track: TrackData) {
  const g = new THREE.Group()
  const s = track.samples
  const hw = track.halfWidth
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const one = new THREE.Vector3(1, 1, 1)

  // ---------- SISI JURANG: W-beam galvanis ----------
  {
    const off = hw + 0.95
    const railMat = new THREE.MeshLambertMaterial({ color: PAL.rail, side: THREE.DoubleSide })
    const railDark = new THREE.MeshLambertMaterial({ color: PAL.railShadow, side: THREE.DoubleSide })
    const pos: number[] = []
    const idx: number[] = []
    for (let i = 0; i < s.length; i++) {
      const p = s[i]
      const r = rightOf(p)
      const bank = bankAmount(smoothCurv(s, i))
      const baseY = p.y + ROAD_LIFT + bank
      const x = p.x + r.x * off
      const z = p.z + r.z * off
      const ox = r.x * 0.09
      const oz = r.z * 0.09
      // profil W: 3 lipatan (atas-menonjol, tengah-cekung, bawah-menonjol)
      const yT = baseY + 0.68
      const yM = baseY + 0.57
      const yB = baseY + 0.46
      pos.push(
        x, yT, z,
        x + ox, yT, z + oz,
        x + ox * 0.4, yM, z + oz * 0.4,
        x, yB, z,
        x + ox, yB, z + oz,
      )
      if (i > 0) {
        const a = (i - 1) * 5
        const b = i * 5
        // strip atas + strip bawah (menghadap jalan)
        idx.push(a, b, a + 1, a + 1, b, b + 1)
        idx.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2)
        idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3)
        idx.push(a + 3, b + 3, a + 4, a + 4, b + 3, b + 4)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    const rail = new THREE.Mesh(geo, railMat)
    rail.castShadow = true
    rail.renderOrder = 3
    g.add(rail)
    void railDark

    // tiang galvanis + reflektor merah tiap 6 m
    const postSpots: { x: number; y: number; z: number; h: number }[] = []
    for (let i = 4; i < s.length - 4; i += 2) {
      const p = s[i]
      const r = rightOf(p)
      const bank = bankAmount(smoothCurv(s, i))
      postSpots.push({ x: p.x + r.x * (off + 0.1), y: p.y + ROAD_LIFT + bank, z: p.z + r.z * (off + 0.1), h: p.heading })
    }
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.72, 0.13), new THREE.MeshLambertMaterial({ color: '#c9ced4' }), postSpots.length)
    const refs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.1, 0.11, 0.04),
      new THREE.MeshLambertMaterial({ color: PAL.reflector, emissive: PAL.reflector, emissiveIntensity: 0.55 }),
      postSpots.length,
    )
    postSpots.forEach((sp, i) => {
      e.set(0, sp.h, 0)
      q.setFromEuler(e)
      m.compose(new THREE.Vector3(sp.x, sp.y + 0.26, sp.z), q, one)
      posts.setMatrixAt(i, m)
      // reflektor menghadap jalan (geser ke arah aspal)
      const ix = Math.cos(sp.h)
      const iz = -Math.sin(sp.h)
      m.compose(new THREE.Vector3(sp.x - ix * 0.09, sp.y + 0.56, sp.z - iz * 0.09), q, one)
      refs.setMatrixAt(i, m)
    })
    posts.castShadow = true
    g.add(posts, refs)
  }

  // ---------- SISI TEBING: tembok beton + delineator ----------
  {
    const pos: number[] = []
    const idx: number[] = []
    for (let i = 0; i < s.length; i++) {
      const p = s[i]
      const r = rightOf(p)
      const bank = bankAmount(smoothCurv(s, i))
      const baseY = p.y + ROAD_LIFT - bank
      const x0 = p.x - r.x * (hw + 0.55)
      const z0 = p.z - r.z * (hw + 0.55)
      const x1 = p.x - r.x * (hw + 0.85)
      const z1 = p.z - r.z * (hw + 0.85)
      const yT = baseY + 0.5
      const yB = baseY - 0.15
      pos.push(x0, yT, z0, x1, yT, z1, x0, yB, z0, x1, yB, z1)
      if (i > 0) {
        const a = (i - 1) * 4
        const b = i * 4
        idx.push(a, a + 2, b, b, a + 2, b + 2) // sisi jalan
        idx.push(a, b, a + 1, a + 1, b, b + 1) // atas
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    const wall = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: PAL.concrete }))
    wall.castShadow = true
    wall.receiveShadow = true
    wall.renderOrder = 2
    g.add(wall)

    // patok delineator putih + pita merah tiap 12 m
    const spots: { x: number; y: number; z: number; h: number }[] = []
    for (let i = 6; i < s.length - 6; i += 4) {
      const p = s[i]
      const r = rightOf(p)
      const bank = bankAmount(smoothCurv(s, i))
      spots.push({ x: p.x - r.x * (hw + 0.7), y: p.y + ROAD_LIFT - bank, z: p.z - r.z * (hw + 0.7), h: p.heading })
    }
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 0.95, 6), new THREE.MeshLambertMaterial({ color: PAL.delineator }), spots.length)
    const bands = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.062, 0.062, 0.14, 6), new THREE.MeshLambertMaterial({ color: PAL.reflector, emissive: PAL.reflector, emissiveIntensity: 0.4 }), spots.length)
    spots.forEach((sp, i) => {
      e.set(0, sp.h, 0)
      q.setFromEuler(e)
      m.compose(new THREE.Vector3(sp.x, sp.y + 0.95, sp.z), q, one)
      poles.setMatrixAt(i, m)
      m.compose(new THREE.Vector3(sp.x, sp.y + 1.28, sp.z), q, one)
      bands.setMatrixAt(i, m)
    })
    poles.castShadow = true
    g.add(poles, bands)
  }

  // ---------- PAPAN CHEVRON di hairpin ----------
  {
    const texR = chevronTexture('R')
    const texL = chevronTexture('L')
    const boards: { x: number; y: number; z: number; h: number; dir: 'L' | 'R' }[] = []
    for (const c of track.corners) {
      if (c.radius > 17) continue
      // sisi luar tikungan
      const sgn = c.dir === 'R' ? -1 : 1
      const idx = Math.round((c.dist / track.length) * (s.length - 1))
      for (const off of [-14, 0, 14]) {
        const si = Math.min(s.length - 1, Math.max(0, idx + Math.round(off / 3)))
        const p = s[si]
        const r = rightOf(p)
        boards.push({
          x: p.x + r.x * sgn * (hw + 2.2),
          y: p.y + ROAD_LIFT + 1.05,
          z: p.z + r.z * sgn * (hw + 2.2),
          h: p.heading + Math.PI + sgn * 0.25,
          dir: c.dir,
        })
      }
    }
    const boardGeo = new THREE.PlaneGeometry(2.6, 0.65)
    const matR = new THREE.MeshBasicMaterial({ map: texR, side: THREE.DoubleSide })
    const matL = new THREE.MeshBasicMaterial({ map: texL, side: THREE.DoubleSide })
    const legGeo = new THREE.BoxGeometry(0.09, 1.1, 0.09)
    const legMat = new THREE.MeshLambertMaterial({ color: '#6b6f75' })
    const legs = new THREE.InstancedMesh(legGeo, legMat, Math.max(1, boards.length * 2))
    let li = 0
    boards.forEach((b) => {
      const board = new THREE.Mesh(boardGeo, b.dir === 'R' ? matR : matL)
      board.position.set(b.x, b.y, b.z)
      board.rotation.y = b.h
      g.add(board)
      for (const dx of [-1.05, 1.05]) {
        e.set(0, b.h, 0)
        q.setFromEuler(e)
        const ox = Math.cos(b.h) * dx
        m.compose(new THREE.Vector3(b.x + ox, b.y - 0.85, b.z - Math.sin(b.h) * dx * 0 + 0), q, one)
        // kaki tepat di bawah papan (abaikan offset lateral papan)
        m.compose(new THREE.Vector3(b.x + Math.sin(b.h + Math.PI / 2) * dx * 0 + Math.cos(b.h) * dx, b.y - 0.85, b.z), q, one)
        if (li < legs.count) legs.setMatrixAt(li++, m)
      }
    })
    legs.count = li
    g.add(legs)
  }
  return g
}

/** Hutan sugi (cedar) khas Haruna — pohon berlapis 3-tier + semak.
 *  Siluet ramping khas Jepang: batang lurus tinggi, tajuk susun mengerucut. */
export function buildForest(track: TrackData, terrain: Terrain, index: TrackIndex) {
  const grp = new THREE.Group()
  const items: { x: number; y: number; z: number; s: number; r: number; lean: number; tint: number }[] = []
  const { minX, maxX, minZ, maxZ } = track.bbox
  const margin = 170
  const target = 3600
  let guard = 0
  while (items.length < target && guard < target * 16) {
    guard++
    const x = minX - margin + Math.random() * (maxX - minX + margin * 2)
    const z = minZ - margin + Math.random() * (maxZ - minZ + margin * 2)
    const n = index.nearest(x, z)
    if (n.d < 13 || n.d > 190) continue
    // rumpun alami — bukan sebaran seragam
    const clump = fbm(x * 0.006 + 11, z * 0.006 - 4)
    if (Math.random() > 0.3 + clump * 0.55) continue
    // jangan di dalam danau
    if (terrain.lakeDist(x, z) < terrain.lake.r + 12) continue
    const y = terrain.naturalAt(x, z)
    items.push({
      x, y, z,
      s: 0.75 + Math.random() * 0.85,
      r: Math.random() * Math.PI * 2,
      lean: (Math.random() - 0.5) * 0.07,
      tint: Math.random(),
    })
  }

  const N = items.length
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 4.6, 6)
  const lowGeo = new THREE.ConeGeometry(2.5, 5.2, 8)
  const midGeo = new THREE.ConeGeometry(1.9, 4.4, 8)
  const topGeo = new THREE.ConeGeometry(1.25, 3.6, 7)
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true })
  const leafMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true })
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N)
  const low = new THREE.InstancedMesh(lowGeo, leafMat, N)
  const mid = new THREE.InstancedMesh(midGeo, leafMat.clone(), N)
  const top = new THREE.InstancedMesh(topGeo, leafMat.clone(), N)

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const sc = new THREE.Vector3()
  const pv = new THREE.Vector3()
  const deep = new THREE.Color(PAL.foliage[0])
  const midC = new THREE.Color(PAL.foliage[1])
  const fresh = new THREE.Color(PAL.foliage[2])
  const sun = new THREE.Color(PAL.foliageSun)
  const woodA = new THREE.Color(PAL.trunk)
  const woodB = new THREE.Color(PAL.trunkDeep)
  const cc = new THREE.Color()

  items.forEach((it, i) => {
    e.set(it.lean, it.r, 0)
    q.setFromEuler(e)
    // batang
    sc.set(it.s, it.s, it.s)
    pv.set(it.x, it.y + 2.1 * it.s, it.z)
    m.compose(pv, q, sc)
    trunks.setMatrixAt(i, m)
    trunks.setColorAt(i, it.tint > 0.5 ? woodA : woodB)
    // tier bawah — lebar & gelap
    pv.set(it.x, it.y + (4.2 + 2.4) * it.s, it.z)
    m.compose(pv, q, sc)
    low.setMatrixAt(i, m)
    cc.copy(deep).lerp(midC, it.tint)
    low.setColorAt(i, cc)
    // tier tengah
    pv.set(it.x, it.y + (4.2 + 4.6) * it.s, it.z)
    m.compose(pv, q, sc)
    mid.setMatrixAt(i, m)
    cc.copy(midC).lerp(fresh, it.tint)
    mid.setColorAt(i, cc)
    // pucuk — terang kena matahari
    pv.set(it.x, it.y + (4.2 + 6.6) * it.s, it.z)
    m.compose(pv, q, sc)
    top.setMatrixAt(i, m)
    cc.copy(fresh).lerp(sun, 0.25 + it.tint * 0.45)
    top.setColorAt(i, cc)
  })
  for (const im of [trunks, low, mid, top]) {
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.castShadow = true
    grp.add(im)
  }

  // --- semak bawah (undergrowth) di dekat jalan ---
  const bushGeo = new THREE.IcosahedronGeometry(1.1, 0)
  const bushMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true })
  const bushes: { x: number; y: number; z: number; s: number }[] = []
  let g2 = 0
  while (bushes.length < 900 && g2 < 14000) {
    g2++
    const x = minX - margin + Math.random() * (maxX - minX + margin * 2)
    const z = minZ - margin + Math.random() * (maxZ - minZ + margin * 2)
    const n = index.nearest(x, z)
    if (n.d < 9.5 || n.d > 60) continue
    if (terrain.lakeDist(x, z) < terrain.lake.r + 8) continue
    bushes.push({ x, y: terrain.naturalAt(x, z), z, s: 0.5 + Math.random() * 1.1 })
  }
  const bush = new THREE.InstancedMesh(bushGeo, bushMat, Math.max(1, bushes.length))
  const bq = new THREE.Quaternion()
  const be = new THREE.Euler()
  bushes.forEach((b, i) => {
    be.set(0, Math.random() * Math.PI, 0)
    bq.setFromEuler(be)
    m.compose(new THREE.Vector3(b.x, b.y + b.s * 0.45, b.z), bq, new THREE.Vector3(b.s * 1.25, b.s * 0.75, b.s * 1.25))
    bush.setMatrixAt(i, m)
    cc.copy(midC).lerp(fresh, Math.random()).lerp(sun, Math.random() * 0.25)
    bush.setColorAt(i, cc)
  })
  if (bush.instanceColor) bush.instanceColor.needsUpdate = true
  bush.castShadow = true
  grp.add(bush)
  return grp
}

/** batu hanya di tebing potong, cukup jauh dari aspal */
export function buildRocks(track: TrackData, terrain: Terrain) {
  const geo = new THREE.DodecahedronGeometry(1.4, 0)
  const mat = new THREE.MeshLambertMaterial({ color: COL_ROCK, flatShading: true })
  const s = track.samples
  const list: THREE.Matrix4[] = []
  const m = new THREE.Matrix4()
  for (let i = 0; i < s.length; i += 8) {
    if (Math.random() > 0.55) continue
    const p = s[i]
    const r = rightOf(p)
    const off = -(track.halfWidth + 8 + Math.random() * 7)
    const x = p.x + r.x * off
    const z = p.z + r.z * off
    const y = terrain.naturalAt(x, z)
    if (y < p.y + 0.6) continue
    const sc = 0.45 + Math.random() * 1.05
    m.compose(
      new THREE.Vector3(x, y + sc * 0.35, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random() * 6, Math.random())),
      new THREE.Vector3(sc, sc * 0.75, sc),
    )
    list.push(m.clone())
  }
  const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length))
  list.forEach((mm, i) => inst.setMatrixAt(i, mm))
  if (list.length === 0) inst.count = 0
  inst.castShadow = true
  return inst
}

/** gapura start & finish */
export function buildBanners(track: TrackData) {
  const g = new THREE.Group()
  const make = (idx: number, color: string, label: 'START' | 'FINISH') => {
    const p = track.samples[idx]
    const r = rightOf(p)
    const postMat = new THREE.MeshLambertMaterial({ color: PAL.skirt })
    const w = track.halfWidth + 1.5
    const base = p.y + ROAD_LIFT
    for (const sgn of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 4.6, 8), postMat)
      post.position.set(p.x + r.x * w * sgn, base + 2.3, p.z + r.z * w * sgn)
      post.castShadow = true
      g.add(post)
    }
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 96
    const ctx = c.getContext('2d')!
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 512, 96)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 52px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label === 'START' ? 'HARUNA DOWNHILL' : 'FINISH — 榛名神社', 256, 50)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 2, 1.35),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
    )
    banner.position.set(p.x, base + 4.35, p.z)
    banner.rotation.y = p.heading
    g.add(banner)

    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(track.halfWidth * 2 - 0.3, 0.9),
      new THREE.MeshBasicMaterial({
        color: PAL.line,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -8,
        polygonOffsetUnits: -8,
      }),
    )
    line.rotation.set(-Math.PI / 2, 0, -p.heading)
    line.position.set(p.x, base + 0.04, p.z)
    line.renderOrder = 4
    g.add(line)
  }
  make(2, PAL.car, 'START')
  make(track.samples.length - 3, PAL.forest, 'FINISH')
  return g
}

/** Pegunungan jauh berlapis kabut — siluet lembut mengelilingi stage. */
export function buildRidges(track: TrackData) {
  const { minX, maxX, minZ, maxZ } = track.bbox
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const baseY = (track.startY + track.endY) / 2
  const geo = new THREE.ConeGeometry(1, 1, 7)
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true })
  const N = 18
  const inst = new THREE.InstancedMesh(geo, mat, N)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const fog = new THREE.Color(PAL.fog)
  const green = new THREE.Color('#6f8f74')
  const blue = new THREE.Color('#7ba0b8')
  const c = new THREE.Color()
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (hash(i, 7) - 0.5) * 0.35
    const dist = 850 + hash(i, 3) * 500
    const x = cx + Math.cos(a) * dist
    const z = cz + Math.sin(a) * dist
    const r = 240 + hash(i, 11) * 240
    const h = 190 + hash(i, 5) * 190
    q.setFromEuler(new THREE.Euler(0, hash(i, 9) * Math.PI, 0))
    m.compose(new THREE.Vector3(x, baseY - 46 + h * 0.28, z), q, new THREE.Vector3(r, h, r * (0.75 + hash(i, 13) * 0.5)))
    inst.setMatrixAt(i, m)
    // selang-seling hijau–biru, kabut yang menyeragamkan
    c.copy(i % 2 ? green : blue).lerp(fog, 0.25 + hash(i, 17) * 0.2)
    inst.setColorAt(i, c)
  }
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true
  return inst
}

/** Awan siang: gumpalan putih berlapis, terang di atas. */
export function buildClouds(track: TrackData) {
  const { minX, maxX, minZ, maxZ } = track.bbox
  const g = new THREE.Group()
  const puffGeo = new THREE.IcosahedronGeometry(1, 1)
  const topMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, transparent: true, opacity: 0.96 })
  const botMat = new THREE.MeshLambertMaterial({ color: '#dfe8ef', flatShading: true, transparent: true, opacity: 0.96 })
  const N = 9
  const tops = new THREE.InstancedMesh(puffGeo, topMat, N * 3)
  const bots = new THREE.InstancedMesh(puffGeo, botMat, N * 2)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  let ti = 0
  let bi = 0
  for (let i = 0; i < N; i++) {
    const cx = minX - 250 + hash(i, 21) * (maxX - minX + 500)
    const cz = minZ - 250 + hash(i, 29) * (maxZ - minZ + 500)
    const cy = track.startY + 170 + hash(i, 31) * 150
    const base = 60 + hash(i, 35) * 60
    // 3 puff atas putih
    for (let k = 0; k < 3; k++) {
      e.set(0, hash(i * 3 + k, 33) * Math.PI, 0)
      q.setFromEuler(e)
      m.compose(
        new THREE.Vector3(cx + (k - 1) * base * 0.55, cy + (k === 1 ? 10 : 0), cz + (hash(i, 40 + k) - 0.5) * 30),
        q,
        new THREE.Vector3(base * (0.55 - k * 0.06), base * 0.24, base * 0.38),
      )
      tops.setMatrixAt(ti++, m)
    }
    // 2 puff bawah kebiruan sebagai bayangan awan
    for (let k = 0; k < 2; k++) {
      e.set(0, hash(i * 2 + k, 43) * Math.PI, 0)
      q.setFromEuler(e)
      m.compose(
        new THREE.Vector3(cx + (k - 0.5) * base * 0.6, cy - base * 0.13, cz),
        q,
        new THREE.Vector3(base * 0.5, base * 0.18, base * 0.34),
      )
      bots.setMatrixAt(bi++, m)
    }
  }
  tops.count = ti
  bots.count = bi
  g.add(bots, tops)
  return g
}
