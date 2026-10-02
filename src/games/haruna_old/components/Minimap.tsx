import { useEffect, useRef } from 'react'
import type { TrackData } from '../track/haruna'

export default function Minimap({
  track,
  carX,
  carZ,
  progress,
}: {
  track: TrackData | null
  carX: number
  carZ: number
  progress: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv || !track) return
    const ctx = cv.getContext('2d')!
    const W = cv.width
    const H = cv.height
    const { minX, maxX, minZ, maxZ } = track.bbox
    const pad = 14
    const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ))
    const ox = (W - (maxX - minX) * sc) / 2 - minX * sc
    const oz = (H - (maxZ - minZ) * sc) / 2 - minZ * sc
    const px = (x: number) => ox + x * sc
    const pz = (z: number) => H - (oz + z * sc) + 0 // flip supaya utara ke atas

    ctx.clearRect(0, 0, W, H)
    // jejak lintasan
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 5
    ctx.beginPath()
    track.samples.forEach((s, i) => (i ? ctx.lineTo(px(s.x), pz(s.z)) : ctx.moveTo(px(s.x), pz(s.z))))
    ctx.stroke()

    // bagian yang sudah dilalui
    const upto = Math.floor(progress * (track.samples.length - 1))
    ctx.strokeStyle = '#ffd34d'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let i = 0; i <= upto; i++) {
      const s = track.samples[i]
      i ? ctx.lineTo(px(s.x), pz(s.z)) : ctx.moveTo(px(s.x), pz(s.z))
    }
    ctx.stroke()

    // start & finish
    const a = track.samples[0]
    const b = track.samples[track.samples.length - 1]
    ctx.fillStyle = '#e74c3c'
    ctx.beginPath()
    ctx.arc(px(a.x), pz(a.z), 3.5, 0, 7)
    ctx.fill()
    ctx.fillStyle = '#2ecc71'
    ctx.beginPath()
    ctx.arc(px(b.x), pz(b.z), 3.5, 0, 7)
    ctx.fill()

    // mobil
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(px(carX), pz(carZ), 4.2, 0, 7)
    ctx.fill()
    ctx.stroke()
  }, [track, carX, carZ, progress])

  return <canvas ref={ref} width={230} height={230} className="block" />
}
