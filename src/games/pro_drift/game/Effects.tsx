import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from './sim'
import { bots } from './bots'
import { forwardOf, rightOf, type Vehicle } from './physics'

const SKID_COUNT = 3600
const SMOKE_COUNT = 260

const tmpM = new THREE.Matrix4()
const tmpP = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()
const tmpS = new THREE.Vector3()
const tmpE = new THREE.Euler()
const zero = new THREE.Matrix4().makeScale(0, 0, 0)

function allVehicles(): Vehicle[] {
  return [sim, ...bots]
}

export function SkidMarks() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const idx = useRef(0)
  const last = useRef<Map<Vehicle, { x: number; z: number }>>(new Map())
  const seenReset = useRef(sim.resetCount)

  useEffect(() => {
    const m = ref.current
    if (!m) return
    for (let i = 0; i < SKID_COUNT; i++) m.setMatrixAt(i, zero)
    m.instanceMatrix.needsUpdate = true
  }, [])

  useFrame(() => {
    const m = ref.current
    if (!m) return
    if (seenReset.current !== sim.resetCount) {
      seenReset.current = sim.resetCount
      for (let i = 0; i < SKID_COUNT; i++) m.setMatrixAt(i, zero)
      m.instanceMatrix.needsUpdate = true
      idx.current = 0
      last.current.clear()
    }
    let dirty = false
    for (const v of allVehicles()) {
      const marking = v.drifting && v.speed > 4 && !v.onGrass && Math.abs(v.slip) > 0.12
      if (!marking) {
        last.current.delete(v)
        continue
      }
      const l = last.current.get(v)
      if (l && Math.hypot(v.x - l.x, v.z - l.z) < 0.32) continue
      last.current.set(v, { x: v.x, z: v.z })
      const f = forwardOf(v)
      const r = rightOf(v)
      const vAng = Math.atan2(-v.vx, -v.vz)
      const spdLen = Math.max(0.4, Math.min(0.8, v.speed * 0.03))
      for (const side of [-0.56, 0.56]) {
        tmpP.set(v.x + r.x * side - f.x * 0.72, 0.025, v.z + r.z * side - f.z * 0.72)
        tmpE.set(-Math.PI / 2, vAng, 0, 'YXZ')
        tmpQ.setFromEuler(tmpE)
        tmpS.set(0.26, spdLen, 1)
        tmpM.compose(tmpP, tmpQ, tmpS)
        m.setMatrixAt(idx.current, tmpM)
        idx.current = (idx.current + 1) % SKID_COUNT
      }
      dirty = true
    }
    if (dirty) m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, SKID_COUNT]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#0a0a0a" transparent opacity={0.42} depthWrite={false} />
    </instancedMesh>
  )
}

interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
  life: number
  rot: number
}

export function Smoke() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const parts = useMemo<Particle[]>(
    () => Array.from({ length: SMOKE_COUNT }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 1, rot: 0 })),
    [],
  )
  const spawnAcc = useRef<Map<Vehicle, number>>(new Map())
  const cursor = useRef(0)

  useFrame((_, dt) => {
    const m = ref.current
    if (!m) return
    for (const v of allVehicles()) {
      const intensity = v.smokeIntensity
      if (!(intensity > 0.05 && v.speed > 5)) continue
      const isPlayer = v === sim
      let acc = (spawnAcc.current.get(v) ?? 0) + dt * (10 + intensity * (isPlayer ? 55 : 35))
      const f = forwardOf(v)
      const r = rightOf(v)
      while (acc >= 1) {
        acc -= 1
        const side = Math.random() < 0.5 ? -0.56 : 0.56
        const p = parts[cursor.current]
        cursor.current = (cursor.current + 1) % SMOKE_COUNT
        p.x = v.x + r.x * side - f.x * 0.75 + (Math.random() - 0.5) * 0.3
        p.z = v.z + r.z * side - f.z * 0.75 + (Math.random() - 0.5) * 0.3
        p.y = 0.2
        p.vx = v.vx * 0.15 + (Math.random() - 0.5) * 1.5 + r.x * side * 1.2
        p.vz = v.vz * 0.15 + (Math.random() - 0.5) * 1.5 + r.z * side * 1.2
        p.vy = 1 + Math.random() * 1.2
        p.age = 0
        p.life = 0.7 + Math.random() * 0.6
        p.rot = Math.random() * Math.PI
      }
      spawnAcc.current.set(v, acc)
    }
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const p = parts[i]
      if (p.age >= p.life) {
        m.setMatrixAt(i, zero)
        continue
      }
      p.age += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.vx *= 1 - dt * 1.5
      p.vz *= 1 - dt * 1.5
      const t = p.age / p.life
      const s = 0.35 + t * 1.6
      tmpP.set(p.x, p.y, p.z)
      tmpE.set(p.rot + t, p.rot, 0)
      tmpQ.setFromEuler(tmpE)
      tmpS.set(s, s, s)
      tmpM.compose(tmpP, tmpQ, tmpS)
      m.setMatrixAt(i, tmpM)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, SMOKE_COUNT]} frustumCulled={false}>
      <dodecahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color="#e8e8e8" transparent opacity={0.28} depthWrite={false} roughness={1} />
    </instancedMesh>
  )
}
