import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { samples, SAMPLES, TRACK_WIDTH, CURB_WIDTH, GRAVEL_WIDTH, BARRIER_OFFSET, clipPoints, trees, headingFromTangent } from './track'
import { sim } from './sim'
import { Environment } from './Environment'
import { Decor } from './Decor'

function ribbon(inner: number, outer: number, y: number, colorFn?: (i: number) => THREE.Color) {
  const pos: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const idx: number[] = []
  for (let i = 0; i < SAMPLES; i++) {
    const s = samples[i]
    pos.push(s.x + s.rx * inner, y, s.z + s.rz * inner)
    pos.push(s.x + s.rx * outer, y, s.z + s.rz * outer)
    uv.push(0, i / 8, 1, i / 8)
    if (colorFn) {
      const c = colorFn(i)
      col.push(c.r, c.g, c.b, c.r, c.g, c.b)
    }
    const a = i * 2
    const b = ((i + 1) % SAMPLES) * 2
    idx.push(a, a + 1, b, a + 1, b + 1, b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  if (colorFn) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function makeCheckerTexture() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 16
  const ctx = c.getContext('2d')!
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#111' : '#f5f5f5'
      ctx.fillRect(x * 8, y * 8, 8, 8)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter
  return t
}

function makeAsphaltTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#3b3b40'
  ctx.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 2500; i++) {
    const v = 45 + Math.random() * 40
    ctx.fillStyle = `rgb(${v},${v},${v + 4})`
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 1)
  return t
}

export function Track() {
  const half = TRACK_WIDTH / 2
  const road = useMemo(() => ribbon(-half, half, 0.01), [half])
  const asphalt = useMemo(() => makeAsphaltTexture(), [])
  const red = useMemo(() => new THREE.Color('#d92e2e'), [])
  const white = useMemo(() => new THREE.Color('#f4f4f4'), [])
  const curbL = useMemo(() => ribbon(-half - CURB_WIDTH, -half, 0.02, (i) => (Math.floor(i / 5) % 2 ? red : white)), [half, red, white])
  const curbR = useMemo(() => ribbon(half, half + CURB_WIDTH, 0.02, (i) => (Math.floor(i / 5) % 2 ? red : white)), [half, red, white])
  const gravelL = useMemo(() => ribbon(-half - CURB_WIDTH - GRAVEL_WIDTH, -half - CURB_WIDTH, 0.005), [half])
  const gravelR = useMemo(() => ribbon(half + CURB_WIDTH, half + CURB_WIDTH + GRAVEL_WIDTH, 0.005), [half])
  const checker = useMemo(() => makeCheckerTexture(), [])

  // Start line transform
  const s0 = samples[0]
  const startRot = headingFromTangent(s0.tx, s0.tz)

  return (
    <group>
      {/* Road */}
      <mesh geometry={road} receiveShadow>
        <meshStandardMaterial map={asphalt} roughness={0.95} />
      </mesh>
      {/* Curbs */}
      <mesh geometry={curbL} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.8} />
      </mesh>
      <mesh geometry={curbR} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.8} />
      </mesh>
      {/* Gravel */}
      <mesh geometry={gravelL} receiveShadow>
        <meshStandardMaterial color="#c9b58a" roughness={1} />
      </mesh>
      <mesh geometry={gravelR} receiveShadow>
        <meshStandardMaterial color="#c9b58a" roughness={1} />
      </mesh>
      {/* Start / finish line */}
      <group position={[s0.x, 0.03, s0.z]} rotation-y={startRot}>
        <mesh rotation-x={-Math.PI / 2}>
          <planeGeometry args={[TRACK_WIDTH, 1.6]} />
          <meshStandardMaterial map={checker} roughness={0.9} />
        </mesh>
      </group>
      <StartGate x={s0.x} z={s0.z} rot={startRot} />
      <Barriers />
      <Trees />
      <ClipCones />
      <Environment />
      <Decor />
    </group>
  )
}

function StartGate({ x, z, rot }: { x: number; z: number; rot: number }) {
  const w = BARRIER_OFFSET * 2 + 1
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <mesh position={[-w / 2, 2.5, 0]} castShadow>
        <boxGeometry args={[0.4, 5, 0.4]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[w / 2, 2.5, 0]} castShadow>
        <boxGeometry args={[0.4, 5, 0.4]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[0, 5, 0]} castShadow>
        <boxGeometry args={[w + 0.4, 1.2, 0.5]} />
        <meshStandardMaterial color="#e23b3b" />
      </mesh>
      <mesh position={[0, 5, -0.27]}>
        <boxGeometry args={[w * 0.6, 0.6, 0.02]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

function Barriers() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const step = 4
  const count = Math.ceil(SAMPLES / step) * 2
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const mat = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const sc = new THREE.Vector3(1, 1, 1)
    const p = new THREE.Vector3()
    const colA = new THREE.Color('#e5e7eb')
    const colB = new THREE.Color('#d92e2e')
    const colC = new THREE.Color('#1f2937')
    let k = 0
    for (let i = 0; i < SAMPLES; i += step) {
      const s = samples[i]
      for (const side of [-1, 1]) {
        p.set(s.x + s.rx * side * BARRIER_OFFSET, 0.3, s.z + s.rz * side * BARRIER_OFFSET)
        mat.compose(p, q, sc)
        m.setMatrixAt(k, mat)
        const seg = Math.floor(i / (step * 3)) % 3
        m.setColorAt(k, seg === 0 ? colA : seg === 1 ? colB : colC)
        k++
      }
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow receiveShadow>
      <cylinderGeometry args={[0.55, 0.55, 0.6, 12]} />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  )
}

function Trees() {
  const trunk = useRef<THREE.InstancedMesh>(null)
  const leaf = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const mat = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const sc = new THREE.Vector3()
    const c = new THREE.Color()
    trees.forEach((t, i) => {
      p.set(t.x, 1.0 * t.s, t.z)
      sc.set(t.s, t.s, t.s)
      mat.compose(p, q, sc)
      trunk.current!.setMatrixAt(i, mat)
      p.set(t.x, 3.6 * t.s, t.z)
      mat.compose(p, q, sc)
      leaf.current!.setMatrixAt(i, mat)
      c.setHSL(0.24 + (i % 7) * 0.02, 0.5 + (i % 2) * 0.15, 0.26 + (i % 4) * 0.05)
      leaf.current!.setColorAt(i, c)
    })
    trunk.current!.instanceMatrix.needsUpdate = true
    leaf.current!.instanceMatrix.needsUpdate = true
    if (leaf.current!.instanceColor) leaf.current!.instanceColor.needsUpdate = true
  }, [])
  return (
    <>
      <instancedMesh ref={trunk} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.25, 0.35, 2, 6]} />
        <meshStandardMaterial color="#6b4b2a" />
      </instancedMesh>
      <instancedMesh ref={leaf} args={[undefined, undefined, trees.length]} castShadow>
        <coneGeometry args={[1.8, 4, 7]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </>
  )
}

function ClipCones() {
  const rings = useRef<(THREE.Mesh | null)[]>([])
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    clipPoints.forEach((cp, i) => {
      const m = rings.current[i]
      if (!m) return
      const collected = sim.clipsCollected.has(cp.idx)
      const mat = m.material as THREE.MeshBasicMaterial
      mat.color.set(collected ? '#4ade80' : '#fbbf24')
      const pulse = collected ? 1 : 1 + Math.sin(t * 4 + i) * 0.08
      m.scale.set(pulse, pulse, 1)
      mat.opacity = collected ? 0.25 : 0.55
    })
  })
  return (
    <group>
      {clipPoints.map((cp, i) => (
        <group key={cp.idx} position={[cp.x, 0, cp.z]}>
          <mesh position-y={0.35} castShadow>
            <coneGeometry args={[0.28, 0.7, 10]} />
            <meshStandardMaterial color="#ff7a1a" emissive="#ff5500" emissiveIntensity={0.3} />
          </mesh>
          <mesh position-y={0.2}>
            <cylinderGeometry args={[0.32, 0.32, 0.08, 10]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh
            ref={(el) => {
              rings.current[i] = el
            }}
            rotation-x={-Math.PI / 2}
            position-y={0.04}
          >
            <ringGeometry args={[2.6, 3.2, 40]} />
            <meshBasicMaterial color="#fbbf24" transparent opacity={0.55} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
