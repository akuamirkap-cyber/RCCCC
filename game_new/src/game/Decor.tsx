import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { samples, SAMPLES, TRACK_WIDTH, BARRIER_OFFSET, stands, outerZones, driftSectors, headingFromTangent, clipPoints } from './track'
import { sim } from './sim'

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CROWD_COLORS = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#f97316', '#a855f7', '#ffffff', '#ec4899', '#14b8a6', '#111827']

/** Tribun bertingkat + penonton instanced yang melompat-lompat */
function Grandstands() {
  const crowd = useRef<THREE.InstancedMesh>(null)
  const heads = useRef<THREE.InstancedMesh>(null)
  const seats = useMemo(() => {
    const rnd = mulberry32(2024)
    const out: { x: number; y: number; z: number; rot: number; phase: number; amp: number; color: THREE.Color }[] = []
    for (const st of stands) {
      const dirX = -Math.sin(st.rot) // arah sepanjang lintasan
      const dirZ = -Math.cos(st.rot)
      const inX = -Math.cos(st.rot) * st.side // arah menuju lintasan
      const inZ = Math.sin(st.rot) * st.side
      const perRow = Math.floor(st.len / 0.9)
      for (let r = 0; r < st.rows; r++) {
        for (let i = 0; i < perRow; i++) {
          if (rnd() < 0.12) continue // kursi kosong
          const along = (i - perRow / 2) * 0.9 + (rnd() - 0.5) * 0.3
          const back = r * 1.1 + 0.6
          const y = 0.9 + r * 0.7
          out.push({
            x: st.x + dirX * along - inX * back,
            z: st.z + dirZ * along - inZ * back,
            y,
            rot: st.rot - (st.side * Math.PI) / 2,
            phase: rnd() * Math.PI * 2,
            amp: 0.05 + rnd() * 0.2,
            color: new THREE.Color(CROWD_COLORS[Math.floor(rnd() * CROWD_COLORS.length)]),
          })
        }
      }
    }
    return out
  }, [])

  useEffect(() => {
    const m = crowd.current
    const h = heads.current
    if (!m || !h) return
    const skin = [new THREE.Color('#f1c9a5'), new THREE.Color('#c68642'), new THREE.Color('#8d5524'), new THREE.Color('#ffdbac')]
    seats.forEach((s, i) => {
      m.setColorAt(i, s.color)
      h.setColorAt(i, skin[i % skin.length])
    })
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    if (h.instanceColor) h.instanceColor.needsUpdate = true
  }, [seats])

  const mat = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const p = useMemo(() => new THREE.Vector3(), [])
  const sc = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  useFrame(({ clock }) => {
    const m = crowd.current
    const h = heads.current
    if (!m || !h) return
    const t = clock.getElapsedTime()
    // penonton makin heboh kalau pemain drift dekat
    const excite = 1 + sim.smokeIntensity * 1.5
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i]
      const near = Math.hypot(s.x - sim.x, s.z - sim.z) < 40 ? excite : 1
      const bounce = Math.max(0, Math.sin(t * (3 + s.amp * 6) * near + s.phase)) * s.amp * near
      e.set(0, s.rot, 0)
      q.setFromEuler(e)
      p.set(s.x, s.y + bounce, s.z)
      mat.compose(p, q, sc)
      m.setMatrixAt(i, mat)
      p.y += 0.42
      mat.compose(p, q, sc)
      h.setMatrixAt(i, mat)
    }
    m.instanceMatrix.needsUpdate = true
    h.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      {/* struktur tribun */}
      {stands.map((st, k) => (
        <group key={k} position={[st.x, 0, st.z]} rotation-y={st.rot - (st.side * Math.PI) / 2}>
          <StandSteps rows={st.rows} len={st.len} />
          {/* atap */}
          <mesh position={[0, 0.9 + st.rows * 0.7 + 1.6, -(st.rows * 1.1) / 2 - 0.4]} castShadow>
            <boxGeometry args={[st.len + 1.5, 0.15, st.rows * 1.1 + 2]} />
            <meshStandardMaterial color="#e5e7eb" />
          </mesh>
          {[-1, 1].map((sd) => (
            <mesh key={sd} position={[(sd * st.len) / 2, (0.9 + st.rows * 0.7 + 1.6) / 2, -(st.rows * 1.1) - 0.6]}>
              <cylinderGeometry args={[0.12, 0.12, 0.9 + st.rows * 0.7 + 1.6, 8]} />
              <meshStandardMaterial color="#9ca3af" />
            </mesh>
          ))}
          {/* pagar + spanduk depan tribun */}
          <mesh position={[0, 0.5, 0.45]}>
            <boxGeometry args={[st.len, 0.7, 0.06]} />
            <meshStandardMaterial color={k % 2 ? '#e11d48' : '#2563eb'} />
          </mesh>
          <mesh position={[0, 0.5, 0.49]}>
            <planeGeometry args={[st.len * 0.7, 0.4]} />
            <meshBasicMaterial map={bannerTexture(k % 2 ? 'RC DRIFT SERIES' : 'GAZOO × NISMO')} transparent />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={crowd} args={[undefined, undefined, seats.length]} frustumCulled={false} castShadow>
        <boxGeometry args={[0.42, 0.62, 0.3]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, seats.length]} frustumCulled={false}>
        <sphereGeometry args={[0.16, 8, 6]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </group>
  )
}

function StandSteps({ rows, len }: { rows: number; len: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <mesh key={r} position={[0, (0.6 + r * 0.7) / 2, -(r * 1.1 + 0.6)]} castShadow receiveShadow>
          <boxGeometry args={[len + 1, 0.6 + r * 0.7, 1.1]} />
          <meshStandardMaterial color={r % 2 ? '#6b7280' : '#7c8494'} />
        </mesh>
      ))}
    </>
  )
}

const bannerCache = new Map<string, THREE.CanvasTexture>()
function bannerTexture(text: string) {
  let t = bannerCache.get(text)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 64
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, 512, 64)
  ctx.fillStyle = '#fff'
  ctx.font = 'italic 900 40px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 34)
  t = new THREE.CanvasTexture(c)
  bannerCache.set(text, t)
  return t
}

/** Bendera warna-warni berkibar di sepanjang barrier */
function Flags() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const data = useMemo(() => {
    const out: { x: number; z: number; rot: number; color: THREE.Color; phase: number }[] = []
    const cols = ['#ef4444', '#facc15', '#3b82f6', '#ffffff', '#22c55e']
    for (let i = 0; i < SAMPLES; i += 20) {
      const s = samples[i]
      const side = (i / 20) % 2 === 0 ? 1 : -1
      const off = BARRIER_OFFSET + 1.6
      out.push({ x: s.x + s.rx * side * off, z: s.z + s.rz * side * off, rot: headingFromTangent(s.tx, s.tz), color: new THREE.Color(cols[(i / 20) % cols.length]), phase: i * 0.3 })
    }
    return out
  }, [])
  useEffect(() => {
    const m = ref.current
    if (!m) return
    data.forEach((d, i) => m.setColorAt(i, d.color))
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [data])
  const mat = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    const t = clock.getElapsedTime()
    data.forEach((d, i) => {
      const wave = Math.sin(t * 3 + d.phase) * 0.25
      e.set(0, d.rot + wave, Math.sin(t * 5 + d.phase) * 0.08)
      q.setFromEuler(e)
      mat.compose(new THREE.Vector3(d.x, 3.1, d.z), q, new THREE.Vector3(1, 1, 1))
      m.setMatrixAt(i, mat)
    })
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, data.length]} frustumCulled={false}>
        <boxGeometry args={[0.06, 1.2, 1.6]} />
        <meshStandardMaterial side={THREE.DoubleSide} />
      </instancedMesh>
      <Poles data={data} />
    </group>
  )
}

function Poles({ data }: { data: { x: number; z: number }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const mat = new THREE.Matrix4()
    data.forEach((d, i) => {
      mat.makeTranslation(d.x, 1.9, d.z)
      m.setMatrixAt(i, mat)
    })
    m.instanceMatrix.needsUpdate = true
  }, [data])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, data.length]}>
      <cylinderGeometry args={[0.05, 0.05, 3.8, 6]} />
      <meshStandardMaterial color="#d1d5db" />
    </instancedMesh>
  )
}

/** Spanduk sponsor rendah di atas barrier ban di tikungan */
function Boards() {
  const boards = useMemo(() => {
    const texts = ['DRIFT', 'TURBO', 'NITTO', 'GAZOO', 'NISMO', 'RC PRO', 'SIDEWAYS', 'APEX']
    const colors = ['#111827', '#dc2626', '#1d4ed8', '#f59e0b', '#059669']
    return clipPoints.map((cp, i) => {
      const s = samples[(cp.idx + 8) % SAMPLES]
      const side = -cp.side
      const off = BARRIER_OFFSET + 0.9
      return {
        x: s.x + s.rx * side * off,
        z: s.z + s.rz * side * off,
        rot: headingFromTangent(s.tx, s.tz),
        text: texts[i % texts.length],
        color: colors[i % colors.length],
      }
    })
  }, [])
  return (
    <group>
      {boards.map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]} rotation-y={b.rot}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <boxGeometry args={[9, 1.1, 0.12]} />
            <meshStandardMaterial color={b.color} />
          </mesh>
          {[1, -1].map((f) => (
            <mesh key={f} position={[0, 0.9, f * 0.07]} rotation-y={f > 0 ? 0 : Math.PI}>
              <planeGeometry args={[7, 0.7]} />
              <meshBasicMaterial map={bannerTexture(b.text)} transparent />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/** Tiang lampu sorot & tenda pit */
function Facilities() {
  const spots = useMemo(() => [60, 260, 460, 660].map((i) => {
    const s = samples[i % SAMPLES]
    const off = BARRIER_OFFSET + 9
    return { x: s.x - s.rx * off, z: s.z - s.rz * off }
  }), [])
  const s0 = samples[30]
  const pitRot = headingFromTangent(s0.tx, s0.tz)
  const pitOff = BARRIER_OFFSET + 12
  return (
    <group>
      {spots.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, 7, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.28, 14, 8]} />
            <meshStandardMaterial color="#9ca3af" />
          </mesh>
          <mesh position={[0, 14.2, 0]}>
            <boxGeometry args={[2.6, 0.5, 0.9]} />
            <meshStandardMaterial color="#374151" />
          </mesh>
          {[-0.8, 0, 0.8].map((x) => (
            <mesh key={x} position={[x, 14, 0.5]}>
              <boxGeometry args={[0.6, 0.3, 0.1]} />
              <meshStandardMaterial color="#fff" emissive="#fff7cc" emissiveIntensity={1.2} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Pit building */}
      <group position={[s0.x - s0.rx * pitOff, 0, s0.z - s0.rz * pitOff]} rotation-y={pitRot}>
        <mesh position={[0, 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[30, 4, 8]} />
          <meshStandardMaterial color="#f3f4f6" />
        </mesh>
        <mesh position={[0, 4.15, 0]}>
          <boxGeometry args={[31, 0.3, 9]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
        {[-10, -5, 0, 5, 10].map((x) => (
          <mesh key={x} position={[x, 1.4, 4.02]}>
            <planeGeometry args={[3.6, 2.8]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        ))}
        <mesh position={[0, 3.4, 4.05]}>
          <planeGeometry args={[20, 0.9]} />
          <meshBasicMaterial map={bannerTexture('RC DRIFT CIRCUIT')} transparent />
        </mesh>
        {/* tenda-tenda tim */}
        {[-20, 20].map((x, i) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 1.4, 0]}>
              <boxGeometry args={[5, 2.8, 5]} />
              <meshStandardMaterial color={i ? '#dc2626' : '#2563eb'} transparent opacity={0.9} />
            </mesh>
            <mesh position={[0, 3.4, 0]}>
              <coneGeometry args={[4, 1.4, 4]} />
              <meshStandardMaterial color="#f9fafb" />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

/** Zona bonus di aspal: outer zone (biru) & gerbang sektor */
function BonusZones() {
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const zoneGeo = useMemo(() => {
    return outerZones.map((oz) => {
      const pos: number[] = []
      const idx: number[] = []
      let k = 0
      for (let i = oz.from; ; i = (i + 1) % SAMPLES) {
        const s = samples[i]
        const inner = oz.side * (TRACK_WIDTH / 2 - 1.7)
        const outer = oz.side * (TRACK_WIDTH / 2)
        pos.push(s.x + s.rx * inner, 0.03, s.z + s.rz * inner, s.x + s.rx * outer, 0.03, s.z + s.rz * outer)
        if (k > 0) {
          const a = (k - 1) * 2
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
        }
        k++
        if (i === oz.to) break
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setIndex(idx)
      return g
    })
  }, [])
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    rings.current.forEach((m, i) => {
      if (!m) return
      const mat = m.material as THREE.MeshBasicMaterial
      mat.opacity = 0.35 + Math.sin(t * 3 + i) * 0.15
    })
  })
  return (
    <group>
      {zoneGeo.map((g, i) => (
        <mesh
          key={i}
          geometry={g}
          ref={(el) => {
            rings.current[i] = el
          }}
        >
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.4} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* label OUTER di tepi */}
      {outerZones.map((oz, i) => {
        const s = samples[oz.idx]
        const off = BARRIER_OFFSET - 1.2
        return (
          <group key={`l${i}`} position={[s.x + s.rx * oz.side * off, 0, s.z + s.rz * oz.side * off]} rotation-y={headingFromTangent(s.tx, s.tz)}>
            <mesh position={[0, 0.6, 0]}>
              <boxGeometry args={[1.6, 0.5, 0.08]} />
              <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={0.4} />
            </mesh>
            <mesh position={[0, 0.6, oz.side > 0 ? -0.05 : 0.05]} rotation-y={oz.side > 0 ? Math.PI : 0}>
              <planeGeometry args={[1.4, 0.35]} />
              <meshBasicMaterial map={bannerTexture('OUTER ZONE')} transparent />
            </mesh>
          </group>
        )
      })}
      {/* gerbang sektor drift */}
      {driftSectors.map((sec) => (
        <SectorGate key={sec.id} idx={sec.from} label={sec.name} color="#a855f7" />
      ))}
      {driftSectors.map((sec) => (
        <SectorGate key={`e${sec.id}`} idx={sec.to} label="END" color="#6b7280" small />
      ))}
    </group>
  )
}

function SectorGate({ idx, label, color, small }: { idx: number; label: string; color: string; small?: boolean }) {
  const s = samples[idx]
  const w = TRACK_WIDTH + 2.4
  const h = small ? 2.4 : 3.6
  return (
    <group position={[s.x, 0, s.z]} rotation-y={headingFromTangent(s.tx, s.tz)}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * w) / 2, h / 2, 0]} castShadow>
          <boxGeometry args={[0.25, h, 0.25]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      <mesh position={[0, h, 0]} castShadow>
        <boxGeometry args={[w + 0.25, small ? 0.4 : 0.8, 0.3]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      {[1, -1].map((f) => (
        <mesh key={f} position={[0, h, f * 0.16]} rotation-y={f > 0 ? 0 : Math.PI}>
          <planeGeometry args={[w * 0.7, small ? 0.3 : 0.6]} />
          <meshBasicMaterial map={bannerTexture(small ? label : `DRIFT ${label}`)} transparent />
        </mesh>
      ))}
      {/* garis di aspal */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
        <planeGeometry args={[TRACK_WIDTH, 0.5]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function Decor() {
  return (
    <group>
      <Grandstands />
      <Flags />
      <Boards />
      <Facilities />
      <BonusZones />
    </group>
  )
}
