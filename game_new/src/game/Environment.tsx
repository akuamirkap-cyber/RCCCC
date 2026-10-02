import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Kubah langit gradien (vertex color) + matahari */
function SkyDome() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(900, 32, 16)
    const pos = g.attributes.position
    const col = new Float32Array(pos.count * 3)
    const top = new THREE.Color('#3d8be6')
    const mid = new THREE.Color('#9fd3ff')
    const hor = new THREE.Color('#ffe6c4')
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 900 // -1..1
      const t = Math.max(0, y)
      if (t < 0.18) c.copy(hor).lerp(mid, t / 0.18)
      else c.copy(mid).lerp(top, Math.min(1, (t - 0.18) / 0.6))
      if (y < 0) c.copy(hor)
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [])
  return (
    <>
      <mesh geometry={geo}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>
      {/* Matahari */}
      <mesh position={[380, 420, 180]}>
        <sphereGeometry args={[26, 16, 16]} />
        <meshBasicMaterial color="#fff6d0" fog={false} />
      </mesh>
      <mesh position={[380, 420, 180]}>
        <sphereGeometry args={[60, 16, 16]} />
        <meshBasicMaterial color="#fff1b8" transparent opacity={0.18} fog={false} depthWrite={false} />
      </mesh>
    </>
  )
}

/** Cincin pegunungan low-poly di kejauhan (2 lapis) */
function Mountains() {
  const geo = useMemo(() => {
    const rnd = mulberry32(42)
    const g = new THREE.BufferGeometry()
    const pos: number[] = []
    const col: number[] = []
    const far = new THREE.Color('#7fa7d6')
    const near = new THREE.Color('#5f8fb9')
    const snow = new THREE.Color('#eef4fb')
    const layer = (radius: number, count: number, hMin: number, hMax: number, base: THREE.Color) => {
      for (let i = 0; i < count; i++) {
        const a0 = (i / count) * Math.PI * 2
        const a1 = ((i + 1) / count) * Math.PI * 2
        const am = (a0 + a1) / 2
        const h = hMin + rnd() * (hMax - hMin)
        const x0 = Math.cos(a0) * radius
        const z0 = Math.sin(a0) * radius
        const x1 = Math.cos(a1) * radius
        const z1 = Math.sin(a1) * radius
        const xm = Math.cos(am) * (radius - 20 + rnd() * 40)
        const zm = Math.sin(am) * (radius - 20 + rnd() * 40)
        pos.push(x0, -5, z0, x1, -5, z1, xm, h, zm)
        const peak = h > (hMin + hMax) * 0.55 ? snow : base
        col.push(base.r, base.g, base.b, base.r, base.g, base.b, peak.r, peak.g, peak.b)
      }
    }
    layer(560, 40, 60, 150, far)
    layer(420, 34, 30, 95, near)
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <mesh geometry={geo}>
      <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  )
}

/** Bukit hijau lembut di sekitar sirkuit */
function Hills() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const data = useMemo(() => {
    const rnd = mulberry32(7)
    const out: { x: number; z: number; r: number; h: number; c: THREE.Color }[] = []
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2
      const d = 150 + rnd() * 140
      out.push({
        x: Math.cos(a) * d,
        z: Math.sin(a) * d,
        r: 30 + rnd() * 50,
        h: 10 + rnd() * 22,
        c: new THREE.Color().setHSL(0.27 + rnd() * 0.05, 0.45, 0.32 + rnd() * 0.12),
      })
    }
    return out
  }, [])
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const mat = new THREE.Matrix4()
    data.forEach((d, i) => {
      mat.compose(new THREE.Vector3(d.x, -d.r * 0.55 + d.h * 0.5, d.z), new THREE.Quaternion(), new THREE.Vector3(d.r, d.h, d.r))
      m.setMatrixAt(i, mat)
      m.setColorAt(i, d.c)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [data])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, data.length]} receiveShadow>
      <sphereGeometry args={[1, 18, 12]} />
      <meshStandardMaterial roughness={1} />
    </instancedMesh>
  )
}

/** Awan bergerak pelan (instanced sphere gepeng) */
function Clouds() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const data = useMemo(() => {
    const rnd = mulberry32(99)
    const out: { x: number; y: number; z: number; sx: number; sy: number; sz: number; speed: number }[] = []
    for (let i = 0; i < 70; i++) {
      const cx = (rnd() - 0.5) * 700
      const cz = (rnd() - 0.5) * 700
      const cy = 90 + rnd() * 50
      const puffs = 3 + Math.floor(rnd() * 4)
      for (let p = 0; p < puffs; p++) {
        out.push({
          x: cx + (rnd() - 0.5) * 30,
          y: cy + (rnd() - 0.5) * 6,
          z: cz + (rnd() - 0.5) * 14,
          sx: 10 + rnd() * 16,
          sy: 5 + rnd() * 5,
          sz: 8 + rnd() * 10,
          speed: 1.2 + rnd() * 1.2,
        })
      }
    }
    return out
  }, [])
  const mat = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  useFrame((_, dt) => {
    const m = ref.current
    if (!m) return
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      d.x += d.speed * dt
      if (d.x > 380) d.x -= 760
      mat.compose(new THREE.Vector3(d.x, d.y, d.z), q, new THREE.Vector3(d.sx, d.sy, d.sz))
      m.setMatrixAt(i, mat)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, data.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshStandardMaterial color="#ffffff" roughness={1} transparent opacity={0.92} />
    </instancedMesh>
  )
}

/** Tanah: gradien radial hijau + bercak */
function Ground() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 256
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#5c9e47'
    ctx.fillRect(0, 0, 256, 256)
    const rnd = mulberry32(3)
    for (let i = 0; i < 1800; i++) {
      const g = 130 + rnd() * 50
      ctx.fillStyle = `rgba(${60 + rnd() * 40},${g},${50 + rnd() * 30},0.5)`
      const r = 2 + rnd() * 9
      ctx.beginPath()
      ctx.arc(rnd() * 256, rnd() * 256, r, 0, Math.PI * 2)
      ctx.fill()
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(40, 40)
    return t
  }, [])
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial map={tex} roughness={1} />
      </mesh>
      {/* danau kecil dekorasi */}
      <mesh rotation-x={-Math.PI / 2} position={[-150, 0.0, 120]}>
        <circleGeometry args={[38, 40]} />
        <meshStandardMaterial color="#4fb3e6" roughness={0.15} metalness={0.2} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[-150, 0.01, 120]}>
        <ringGeometry args={[36, 41, 40]} />
        <meshStandardMaterial color="#d9c48f" roughness={1} />
      </mesh>
    </>
  )
}

export function Environment() {
  return (
    <group>
      <SkyDome />
      <Mountains />
      <Hills />
      <Clouds />
      <Ground />
    </group>
  )
}
