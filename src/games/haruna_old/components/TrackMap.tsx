import { useEffect, useMemo, useRef, useState } from 'react'
import { SEGMENTS, type TrackData, type Corner } from '../track/haruna'

const TABS = ['Layout', 'Elevasi', 'Tikungan', 'Sektor'] as const
type Tab = (typeof TABS)[number]

/* ---------- util tampilan (samakan dengan MakingOf) ---------- */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400 font-mono text-sm font-bold text-black">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="font-semibold text-white">{title}</h4>
        <div className="mt-1 space-y-3 text-sm leading-relaxed text-white/65">{children}</div>
      </div>
    </div>
  )
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{k}</div>
      <div className="font-mono text-sm text-white/85">{v}</div>
      {sub && <div className="text-[10px] text-white/35">{sub}</div>}
    </div>
  )
}

/* ---------- klasifikasi tikungan ala pace note ---------- */
export function gearRating(r: number) {
  if (r <= 16) return 1
  if (r <= 28) return 2
  if (r <= 38) return 3
  if (r <= 50) return 4
  if (r <= 70) return 5
  return 6
}
const RATING_COLOR = ['#ff4d4d', '#ff4d4d', '#ff9838', '#ffd34d', '#9ade4e', '#4ed6a8', '#4ea8ff']

/* ============================================================
   PETA LAYOUT (canvas, top-down, interaktif)
   ============================================================ */
function LayoutMap({
  track,
  carX,
  carZ,
  progress,
  selected,
  onSelect,
}: {
  track: TrackData
  carX: number
  carZ: number
  progress: number
  selected: number | null
  onSelect: (i: number | null) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<{ i: number; sx: number; sy: number } | null>(null)
  const [showGrad, setShowGrad] = useState(true)
  const [showNames, setShowNames] = useState(true)

  const W = 900
  const H = 620

  const proj = useMemo(() => {
    const { minX, maxX, minZ, maxZ } = track.bbox
    const pad = 70
    const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ))
    const ox = (W - (maxX - minX) * sc) / 2 - minX * sc
    const oz = (H - (maxZ - minZ) * sc) / 2 - minZ * sc
    return {
      sc,
      px: (x: number) => ox + x * sc,
      py: (z: number) => H - (oz + z * sc),
    }
  }, [track])

  // posisi layar tiap corner
  const cornerPts = useMemo(
    () =>
      track.corners.map((c) => {
        const idx = Math.min(
          track.samples.length - 1,
          Math.round((c.dist / track.length) * (track.samples.length - 1)),
        )
        const s = track.samples[idx]
        return { c, s, x: proj.px(s.x), y: proj.py(s.z) }
      }),
    [track, proj],
  )

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const g = cv.getContext('2d')!
    const { px, py, sc } = proj
    g.clearRect(0, 0, W, H)

    /* grid topografi ringan */
    g.strokeStyle = 'rgba(255,255,255,0.045)'
    g.lineWidth = 1
    for (let x = 0; x < W; x += 40) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, H)
      g.stroke()
    }
    for (let y = 0; y < H; y += 40) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(W, y)
      g.stroke()
    }

    const S = track.samples

    /* bayangan jalan (glow) */
    g.lineJoin = g.lineCap = 'round'
    g.strokeStyle = 'rgba(0,0,0,0.5)'
    g.lineWidth = Math.max(9, track.halfWidth * 2 * sc + 7)
    g.beginPath()
    S.forEach((s, i) => (i ? g.lineTo(px(s.x), py(s.z)) : g.moveTo(px(s.x), py(s.z))))
    g.stroke()

    /* badan jalan: warnai per-segmen sesuai gradien atau abu-abu */
    const lw = Math.max(4.5, track.halfWidth * 2 * sc)
    for (let i = 1; i < S.length; i++) {
      const a = S[i - 1]
      const b = S[i]
      if (showGrad) {
        const dy = a.y - b.y
        const dd = Math.hypot(b.x - a.x, b.z - a.z) || 1
        const gr = Math.min(0.11, Math.max(0, dy / dd))
        const t = gr / 0.11
        // hijau (landai) → kuning → merah (curam)
        const r = Math.round(90 + 165 * t)
        const gn = Math.round(200 - 110 * t)
        const bl = Math.round(120 - 70 * t)
        g.strokeStyle = `rgb(${r},${gn},${bl})`
      } else {
        g.strokeStyle = '#6a6a78'
      }
      g.lineWidth = lw
      g.beginPath()
      g.moveTo(px(a.x), py(a.z))
      g.lineTo(px(b.x), py(b.z))
      g.stroke()
    }

    /* bagian yang sudah dilalui */
    const upto = Math.floor(progress * (S.length - 1))
    if (upto > 1) {
      g.strokeStyle = 'rgba(255,255,255,0.55)'
      g.lineWidth = 1.6
      g.setLineDash([5, 4])
      g.beginPath()
      for (let i = 0; i <= upto; i++) {
        const s = S[i]
        i ? g.lineTo(px(s.x), py(s.z)) : g.moveTo(px(s.x), py(s.z))
      }
      g.stroke()
      g.setLineDash([])
    }

    /* penanda tiap 500 m */
    let nextKm = 500
    for (let i = 1; i < S.length; i++) {
      if (S[i].dist >= nextKm) {
        const s = S[i]
        const nx = Math.cos(s.heading)
        const nz = -Math.sin(s.heading)
        const off = 13
        const x0 = px(s.x - nx * 6)
        const y0 = py(s.z - nz * 6)
        const x1 = px(s.x + nx * 6)
        const y1 = py(s.z + nz * 6)
        g.strokeStyle = 'rgba(255,255,255,0.75)'
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(x0, y0)
        g.lineTo(x1, y1)
        g.stroke()
        g.fillStyle = 'rgba(255,255,255,0.7)'
        g.font = '10px ui-monospace, monospace'
        g.textAlign = 'center'
        g.fillText(`${(nextKm / 1000).toFixed(1)}k`, px(s.x) + nx * off * 2, py(s.z) - 8)
        nextKm += 500
      }
    }

    /* titik tikungan */
    cornerPts.forEach(({ c, x, y }, i) => {
      const rate = gearRating(c.radius)
      const isSel = selected === i
      const isHov = hover?.i === i
      const rad = c.radius <= 16 ? 6.5 : 4.5
      g.beginPath()
      g.arc(x, y, isSel || isHov ? rad + 3 : rad, 0, 7)
      g.fillStyle = RATING_COLOR[rate]
      g.fill()
      g.lineWidth = 1.6
      g.strokeStyle = isSel ? '#fff' : 'rgba(0,0,0,0.65)'
      g.stroke()
      if (c.radius <= 16) {
        g.fillStyle = '#000'
        g.font = 'bold 8px ui-monospace, monospace'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText('H', x, y + 0.5)
      }
      if (showNames && (c.name.includes('Hairpin') || c.name.includes('Gutter') || isSel || isHov)) {
        g.font = '10px ui-sans-serif, system-ui'
        g.textAlign = 'left'
        g.textBaseline = 'middle'
        const label = c.name
        const tw = g.measureText(label).width
        g.fillStyle = 'rgba(0,0,0,0.7)'
        g.fillRect(x + 9, y - 7, tw + 8, 14)
        g.fillStyle = '#ffe9a8'
        g.fillText(label, x + 13, y + 0.5)
      }
    })

    /* start & finish */
    const a = S[0]
    const b = S[S.length - 1]
    const flag = (sx: number, sy: number, col: string, txt: string) => {
      g.beginPath()
      g.arc(sx, sy, 8, 0, 7)
      g.fillStyle = col
      g.fill()
      g.lineWidth = 2
      g.strokeStyle = '#fff'
      g.stroke()
      g.fillStyle = '#fff'
      g.font = 'bold 10px ui-sans-serif, system-ui'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(txt, sx, sy + 20)
    }
    flag(px(a.x), py(a.z), '#e74c3c', 'START · 1084 m')
    flag(px(b.x), py(b.z), '#2ecc71', 'FINISH · 760 m')

    /* mobil */
    if (carX || carZ) {
      const s = S[Math.min(S.length - 1, upto)]
      const cx = px(carX)
      const cy = py(carZ)
      g.save()
      g.translate(cx, cy)
      g.rotate(-s.heading)
      g.beginPath()
      g.moveTo(0, -8)
      g.lineTo(6, 7)
      g.lineTo(0, 4)
      g.lineTo(-6, 7)
      g.closePath()
      g.fillStyle = '#fff'
      g.fill()
      g.strokeStyle = '#000'
      g.lineWidth = 1.2
      g.stroke()
      g.restore()
    }

    /* kompas */
    g.save()
    g.translate(W - 46, 46)
    g.strokeStyle = 'rgba(255,255,255,0.6)'
    g.fillStyle = 'rgba(255,255,255,0.85)'
    g.lineWidth = 1.5
    g.beginPath()
    g.moveTo(0, -18)
    g.lineTo(6, 8)
    g.lineTo(0, 3)
    g.lineTo(-6, 8)
    g.closePath()
    g.fill()
    g.font = 'bold 11px ui-sans-serif, system-ui'
    g.textAlign = 'center'
    g.fillText('N', 0, -24)
    g.restore()

    /* skala */
    const scaleM = 500
    const pxLen = scaleM * sc
    g.strokeStyle = 'rgba(255,255,255,0.75)'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(24, H - 26)
    g.lineTo(24 + pxLen, H - 26)
    g.moveTo(24, H - 31)
    g.lineTo(24, H - 21)
    g.moveTo(24 + pxLen, H - 31)
    g.lineTo(24 + pxLen, H - 21)
    g.stroke()
    g.fillStyle = 'rgba(255,255,255,0.75)'
    g.font = '10px ui-monospace, monospace'
    g.textAlign = 'left'
    g.fillText('500 m', 24, H - 34)
  }, [track, proj, cornerPts, progress, carX, carZ, selected, hover, showGrad, showNames])

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const mx = ((e.clientX - r.left) / r.width) * W
    const my = ((e.clientY - r.top) / r.height) * H
    let best: { i: number; sx: number; sy: number } | null = null
    let bd = 16 * 16
    cornerPts.forEach((p, i) => {
      const d = (p.x - mx) ** 2 + (p.y - my) ** 2
      if (d < bd) {
        bd = d
        best = { i, sx: p.x / W, sy: p.y / H }
      }
    })
    setHover(best)
  }

  const hc = hover ? track.corners[hover.i] : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <button
          onClick={() => setShowGrad((v) => !v)}
          className={`rounded-lg px-3 py-1.5 ring-1 transition ${
            showGrad ? 'bg-amber-400 font-semibold text-black ring-amber-300' : 'bg-white/5 text-white/60 ring-white/15'
          }`}
        >
          Warna gradien
        </button>
        <button
          onClick={() => setShowNames((v) => !v)}
          className={`rounded-lg px-3 py-1.5 ring-1 transition ${
            showNames ? 'bg-amber-400 font-semibold text-black ring-amber-300' : 'bg-white/5 text-white/60 ring-white/15'
          }`}
        >
          Label tikungan
        </button>
        <div className="ml-auto flex items-center gap-2 text-white/45">
          <span>Landai</span>
          <span className="h-2 w-24 rounded-full bg-[linear-gradient(90deg,#5ac878,#ffb43a,#ff3232)]" />
          <span>Curam −11%</span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-[#0b1218] ring-1 ring-white/10">
        <canvas
          ref={ref}
          width={W}
          height={H}
          className="block w-full cursor-crosshair"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onClick={() => onSelect(hover ? hover.i : null)}
        />
        {hover && hc && (
          <div
            className="pointer-events-none absolute z-10 w-48 -translate-x-1/2 -translate-y-full rounded-lg bg-black/90 p-2 text-[11px] ring-1 ring-white/20"
            style={{ left: `${hover.sx * 100}%`, top: `${hover.sy * 100 - 2}%` }}
          >
            <div className="font-semibold text-sand-lite">{hc.name}</div>
            <div className="mt-0.5 flex justify-between text-white/60">
              <span>Arah</span>
              <span className="font-mono">{hc.dir === 'L' ? 'Kiri ◀' : 'Kanan ▶'}</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Radius</span>
              <span className="font-mono">{hc.radius.toFixed(1)} m</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Rating</span>
              <span className="font-mono" style={{ color: RATING_COLOR[gearRating(hc.radius)] }}>
                {gearRating(hc.radius)}
              </span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>KM</span>
              <span className="font-mono">{(hc.dist / 1000).toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] text-white/50">
        {[1, 2, 3, 4, 5].map((r) => (
          <span key={r} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: RATING_COLOR[r] }} />
            Rating {r} {r === 1 && '(hairpin)'}
          </span>
        ))}
        <span className="ml-auto">Klik tikungan untuk mengunci · titik “H” = hairpin</span>
      </div>
    </div>
  )
}

/* ============================================================
   PROFIL ELEVASI
   ============================================================ */
function ElevationProfile({ track, progress }: { track: TrackData; progress: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const W = 900
  const H = 300

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const g = cv.getContext('2d')!
    g.clearRect(0, 0, W, H)
    const S = track.samples
    const pad = { l: 52, r: 18, t: 18, b: 34 }
    const yMin = track.endY - 25
    const yMax = track.startY + 25
    const px = (d: number) => pad.l + (d / track.length) * (W - pad.l - pad.r)
    const py = (y: number) => H - pad.b - ((y - yMin) / (yMax - yMin)) * (H - pad.t - pad.b)

    // grid + label elevasi
    g.font = '10px ui-monospace, monospace'
    for (let y = Math.ceil(yMin / 100) * 100; y <= yMax; y += 100) {
      g.strokeStyle = 'rgba(255,255,255,0.08)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(pad.l, py(y))
      g.lineTo(W - pad.r, py(y))
      g.stroke()
      g.fillStyle = 'rgba(255,255,255,0.4)'
      g.textAlign = 'right'
      g.fillText(`${y} m`, pad.l - 8, py(y) + 3)
    }
    for (let d = 0; d <= track.length; d += 500) {
      g.strokeStyle = 'rgba(255,255,255,0.06)'
      g.beginPath()
      g.moveTo(px(d), pad.t)
      g.lineTo(px(d), H - pad.b)
      g.stroke()
      g.fillStyle = 'rgba(255,255,255,0.4)'
      g.textAlign = 'center'
      g.fillText(`${(d / 1000).toFixed(1)} km`, px(d), H - pad.b + 16)
    }

    // area terisi
    g.beginPath()
    g.moveTo(px(0), H - pad.b)
    S.forEach((s) => g.lineTo(px(s.dist), py(s.y)))
    g.lineTo(px(track.length), H - pad.b)
    g.closePath()
    const grd = g.createLinearGradient(0, pad.t, 0, H - pad.b)
    grd.addColorStop(0, 'rgba(255,211,77,0.35)')
    grd.addColorStop(1, 'rgba(255,211,77,0.02)')
    g.fillStyle = grd
    g.fill()

    // garis profil
    g.strokeStyle = '#ffd34d'
    g.lineWidth = 2
    g.beginPath()
    S.forEach((s, i) => (i ? g.lineTo(px(s.dist), py(s.y)) : g.moveTo(px(s.dist), py(s.y))))
    g.stroke()

    // hairpin sebagai tick
    track.corners
      .filter((c) => c.radius <= 16)
      .forEach((c) => {
        const idx = Math.round((c.dist / track.length) * (S.length - 1))
        const s = S[Math.min(S.length - 1, idx)]
        g.strokeStyle = 'rgba(255,77,77,0.85)'
        g.lineWidth = 1.5
        g.beginPath()
        g.moveTo(px(c.dist), py(s.y) - 6)
        g.lineTo(px(c.dist), py(s.y) - 20)
        g.stroke()
        g.fillStyle = '#ff7b7b'
        g.font = 'bold 9px ui-monospace, monospace'
        g.textAlign = 'center'
        g.fillText('H', px(c.dist), py(s.y) - 23)
      })

    // posisi pemain
    const pi = Math.floor(progress * (S.length - 1))
    if (pi > 0) {
      const s = S[pi]
      g.strokeStyle = 'rgba(255,255,255,0.8)'
      g.lineWidth = 1.5
      g.setLineDash([3, 3])
      g.beginPath()
      g.moveTo(px(s.dist), pad.t)
      g.lineTo(px(s.dist), H - pad.b)
      g.stroke()
      g.setLineDash([])
      g.beginPath()
      g.arc(px(s.dist), py(s.y), 4.5, 0, 7)
      g.fillStyle = '#fff'
      g.fill()
    }
  }, [track, progress])

  return <canvas ref={ref} width={W} height={H} className="block w-full rounded-xl bg-[#0b1218] ring-1 ring-white/10" />
}

/* ============================================================
   KOMPONEN UTAMA
   ============================================================ */
export default function TrackMap({
  track,
  carX = 0,
  carZ = 0,
  progress = 0,
  onClose,
}: {
  track: TrackData | null
  carX?: number
  carZ?: number
  progress?: number
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('Layout')
  const [selected, setSelected] = useState<number | null>(null)

  const stats = useMemo(() => {
    if (!track) return null
    const hairpins = track.corners.filter((c) => c.radius <= 16)
    const left = track.corners.filter((c) => c.dir === 'L').length
    const right = track.corners.length - left
    let maxGrade = 0
    for (let i = 1; i < track.samples.length; i++) {
      const a = track.samples[i - 1]
      const b = track.samples[i]
      const dd = Math.hypot(b.x - a.x, b.z - a.z) || 1
      maxGrade = Math.max(maxGrade, (a.y - b.y) / dd)
    }
    const straights = SEGMENTS.filter((s) => s.t === 's') as { len: number }[]
    const longest = Math.max(...straights.map((s) => s.len))
    const avgGrade = ((track.startY - track.endY) / track.length) * 100
    const tightest = Math.min(...track.corners.map((c) => c.radius))
    return { hairpins, left, right, maxGrade: maxGrade * 100, longest, avgGrade, tightest }
  }, [track])

  if (!track || !stats) return null

  const sectorSize = track.length / 3
  const sectors = [0, 1, 2].map((i) => {
    const from = i * sectorSize
    const to = (i + 1) * sectorSize
    const cs = track.corners.filter((c) => c.dist >= from && c.dist < to)
    const sFrom = track.samples.find((s) => s.dist >= from)!
    const sTo = track.samples.filter((s) => s.dist < to).pop()!
    return {
      i,
      from,
      to,
      corners: cs,
      hairpins: cs.filter((c) => c.radius <= 16).length,
      drop: sFrom.y - sTo.y,
      name: ['Hairpin Cascade', 'Forest S & Gutter', 'Shrine Run'][i],
      desc: [
        'Turun paling teknis: lima hairpin beruntun tepat setelah Danau Haruna. Gradien menembus −10%, rem panas, ideal untuk left-foot braking.',
        'Ritme cepat di antara pohon cedar, dipotong “Gutter Hairpin” kiri yang menuntut penempatan roda dalam tepat di parit drainase.',
        'Lurusan panjang dan tikungan rating 4–5 yang mengalir menuju kawasan Kuil Haruna. Sektor kecepatan tertinggi di seluruh stage.',
      ][i],
    }
  })

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[#111a22] ring-1 ring-white/15">
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6 pb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300">Track Map</div>
            <h2 className="text-2xl font-bold">Peta Stage Mt. Haruna Downhill</h2>
            <p className="mt-1 text-xs text-white/50">
              Layout top-down · profil elevasi · katalog {track.corners.length} tikungan · analisis 3 sektor
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/15 hover:bg-white/20"
          >
            Tutup ✕
          </button>
        </div>

        {/* tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-4 py-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition ${
                tab === t ? 'bg-amber-400 font-semibold text-black' : 'text-white/60 hover:bg-white/10'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          {tab === 'Layout' && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                <Stat k="Panjang" v={`${(track.length / 1000).toFixed(2)} km`} />
                <Stat k="Total turun" v={`${(track.startY - track.endY).toFixed(0)} m`} sub="1084 → 760" />
                <Stat k="Gradien rata²" v={`−${stats.avgGrade.toFixed(1)}%`} sub={`maks −${stats.maxGrade.toFixed(1)}%`} />
                <Stat k="Tikungan" v={`${track.corners.length}`} sub={`${stats.left} kiri / ${stats.right} kanan`} />
                <Stat k="Hairpin" v={`${stats.hairpins.length}`} sub={`terketat r=${stats.tightest} m`} />
                <Stat k="Lurusan" v={`${stats.longest} m`} sub="terpanjang" />
              </div>
              <LayoutMap
                track={track}
                carX={carX}
                carZ={carZ}
                progress={progress}
                selected={selected}
                onSelect={setSelected}
              />
            </>
          )}

          {tab === 'Elevasi' && (
            <>
              <Step n={1} title="Profil ketinggian sepanjang 4,3 km">
                <p>
                  Sumbu-Y adalah elevasi hasil integrasi <code className="rounded bg-white/10 px-1">grade</code> tiap
                  segmen. Tanda <b className="text-red-300">H</b> menunjukkan posisi hairpin — perhatikan bagaimana
                  mereka menumpuk di kilometer pertama, tempat lereng paling curam.
                </p>
              </Step>
              <ElevationProfile track={track} progress={progress} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat k="Start" v={`${track.startY.toFixed(0)} m`} sub="Danau Haruna" />
                <Stat k="Finish" v={`${track.endY.toFixed(0)} m`} sub="Kuil Haruna" />
                <Stat k="Gradien maks" v={`−${stats.maxGrade.toFixed(1)}%`} />
                <Stat k="Rata-rata" v={`−${stats.avgGrade.toFixed(1)}%`} />
              </div>
            </>
          )}

          {tab === 'Tikungan' && (
            <>
              <Step n={2} title={`Katalog ${track.corners.length} tikungan`}>
                <p>
                  Dibangkitkan otomatis dari DSL segmen. Rating mengikuti konvensi pace note reli: makin kecil
                  radius, makin rendah rating, makin rendah gigi.
                </p>
              </Step>
              <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/45">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">KM</th>
                      <th className="px-3 py-2">Arah</th>
                      <th className="px-3 py-2">Radius</th>
                      <th className="px-3 py-2">Rating</th>
                      <th className="px-3 py-2">Nama / Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {track.corners.map((c: Corner, i) => {
                      const rate = gearRating(c.radius)
                      return (
                        <tr
                          key={i}
                          onClick={() => setSelected(i)}
                          className={`cursor-pointer transition hover:bg-white/5 ${
                            selected === i ? 'bg-amber-400/10' : ''
                          }`}
                        >
                          <td className="px-3 py-1.5 font-mono text-white/40">{i + 1}</td>
                          <td className="px-3 py-1.5 font-mono text-white/70">{(c.dist / 1000).toFixed(2)}</td>
                          <td className="px-3 py-1.5">
                            <span className={c.dir === 'L' ? 'text-sky-300' : 'text-orange-300'}>
                              {c.dir === 'L' ? '◀ Kiri' : 'Kanan ▶'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-white/70">{c.radius.toFixed(1)} m</td>
                          <td className="px-3 py-1.5">
                            <span
                              className="inline-flex h-5 w-5 items-center justify-center rounded font-mono text-[10px] font-bold text-black"
                              style={{ background: RATING_COLOR[rate] }}
                            >
                              {rate}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-white/60">
                            {c.name}
                            {c.note && c.note !== c.name && (
                              <span className="ml-2 text-white/35">— {c.note}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'Sektor' && (
            <>
              <Step n={3} title="Tiga sektor waktu">
                <p>
                  Stage dibagi rata per sepertiga panjang. Split S1 dan S2 di HUD memakai batas yang sama persis.
                </p>
              </Step>
              {sectors.map((s) => (
                <div key={s.i} className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="font-semibold text-white">
                      <span className="mr-2 rounded bg-amber-400 px-1.5 py-0.5 font-mono text-[10px] text-black">
                        S{s.i + 1}
                      </span>
                      {s.name}
                    </h4>
                    <span className="font-mono text-[11px] text-white/45">
                      {(s.from / 1000).toFixed(2)} – {(s.to / 1000).toFixed(2)} km
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{s.desc}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat k="Tikungan" v={`${s.corners.length}`} />
                    <Stat k="Hairpin" v={`${s.hairpins}`} />
                    <Stat k="Turun" v={`${s.drop.toFixed(0)} m`} />
                    <Stat k="Gradien" v={`−${((s.drop / sectorSize) * 100).toFixed(1)}%`} />
                  </div>
                  <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
                    {s.corners.map((c, i) => (
                      <div
                        key={i}
                        className="flex-1"
                        style={{ background: RATING_COLOR[gearRating(c.radius)] }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
