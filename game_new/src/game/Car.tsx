import { useCallback, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from './sim'
import { useGame } from './store'
import { CARS, type CarId } from './cars'
import type { Vehicle } from './physics'
import { GTRBody } from './models/GTRBody'
import { YarisBody } from './models/YarisBody'
import { bots, BOT_COUNT, botDef } from './bots'

interface VehicleMeshProps {
  vehicle: () => Vehicle | undefined
  model: CarId
  color: string
  label?: string
}

// Rig bersama: posisi, body roll, roda berputar/berbelok, lampu rem.
export function VehicleMesh({ vehicle, model, color, label }: VehicleMeshProps) {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const fl = useRef<THREE.Group>(null)
  const fr = useRef<THREE.Group>(null)
  const wheels = useRef<THREE.Mesh[]>([])
  const brakeMats = useRef<THREE.MeshStandardMaterial[]>([])
  const brakeLight = useRef<THREE.PointLight>(null)
  const spec = CARS[model]

  const registerBrake = useCallback((m: THREE.MeshStandardMaterial | null) => {
    if (!m) return
    brakeMats.current.push(m)
    return () => {
      brakeMats.current = brakeMats.current.filter((x) => x !== m)
    }
  }, [])

  const registerWheel = useCallback((el: THREE.Mesh | null) => {
    if (!el) return
    wheels.current.push(el)
    return () => {
      wheels.current = wheels.current.filter((x) => x !== el)
    }
  }, [])

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const v = vehicle()
    if (!v) {
      g.visible = false
      return
    }
    g.visible = true
    g.position.set(v.x, 0, v.z)
    g.rotation.y = v.heading
    const b = body.current!
    const rollTarget = THREE.MathUtils.clamp(v.lateralAccel * 0.004 + v.lateralSpeed * 0.012, -0.14, 0.14)
    const pitchTarget = THREE.MathUtils.clamp(-(v.throttle > 0 ? 0.02 : 0) + (v.handbrake ? 0.03 : 0), -0.05, 0.05)
    b.rotation.z += (rollTarget - b.rotation.z) * Math.min(1, dt * 8)
    b.rotation.x += (pitchTarget - b.rotation.x) * Math.min(1, dt * 8)
    const steerAng = -v.steerVisual * 0.55
    if (fl.current) fl.current.rotation.y = steerAng
    if (fr.current) fr.current.rotation.y = steerAng
    for (const w of wheels.current) if (w) w.rotation.x = -v.wheelSpin * spec.spinScale
    const braking = v.braking
    for (const m of brakeMats.current) {
      if (!m) continue
      const target = braking ? 6 : 0.9
      m.emissiveIntensity += (target - m.emissiveIntensity) * Math.min(1, dt * 25)
    }
    if (brakeLight.current) {
      brakeLight.current.intensity += ((braking ? 6 : 0) - brakeLight.current.intensity) * Math.min(1, dt * 25)
    }
  })

  const Wheel = ({ x, z, front }: { x: number; z: number; front?: boolean }) => (
    <group ref={front ? (x < 0 ? fl : fr) : undefined} position={[x, spec.wheelRadius, z]}>
      <mesh ref={registerWheel} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[spec.wheelRadius, spec.wheelRadius, 0.3, 18]} />
        <meshStandardMaterial color="#141414" roughness={0.9} />
      </mesh>
      <mesh rotation-z={Math.PI / 2} position-x={x < 0 ? -0.15 : 0.15}>
        <cylinderGeometry args={[spec.wheelRadius * 0.7, spec.wheelRadius * 0.7, 0.02, 12]} />
        <meshStandardMaterial color={model === 'yaris' ? '#2a2c30' : '#b8bcc4'} metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh rotation-z={Math.PI / 2} position-x={x < 0 ? -0.16 : 0.16}>
        <cylinderGeometry args={[0.07, 0.07, 0.02, 8]} />
        <meshStandardMaterial color="#e23b3b" />
      </mesh>
    </group>
  )

  return (
    <group ref={group}>
      <group ref={body} key={model}>
        {model === 'yaris' ? (
          <YarisBody color={color} registerBrake={registerBrake} />
        ) : (
          <GTRBody color={color} registerBrake={registerBrake} />
        )}
      </group>
      <Wheel x={-spec.wheelX} z={spec.wheelFrontZ} front />
      <Wheel x={spec.wheelX} z={spec.wheelFrontZ} front />
      <Wheel x={-spec.wheelX} z={spec.wheelRearZ} />
      <Wheel x={spec.wheelX} z={spec.wheelRearZ} />
      {/* cahaya merah lampu rem ke aspal */}
      <pointLight ref={brakeLight} position={[0, 0.5, spec.wheelRearZ + 0.7]} color="#ff2a2a" intensity={0} distance={5} decay={2} />
      {label && <NameTag text={label} color={color} />}
    </group>
  )
}

function NameTag({ text, color }: { text: string; color: string }) {
  const tex = useRef<THREE.CanvasTexture | null>(null)
  if (!tex.current) {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 64
    const ctx = c.getContext('2d')!
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    ctx.roundRect(8, 8, 240, 48, 16)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(36, 32, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 30px system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 60, 33)
    tex.current = new THREE.CanvasTexture(c)
  }
  return (
    <sprite position={[0, 1.7, 0]} scale={[1.8, 0.45, 1]}>
      <spriteMaterial map={tex.current} transparent depthWrite={false} />
    </sprite>
  )
}

export function Car() {
  const color = useGame((s) => s.carColor)
  const model = useGame((s) => s.carModel)
  return <VehicleMesh vehicle={() => sim} model={model} color={color} />
}

export function Bots() {
  // definisi bot (model/warna/nama) tetap per indeks walau objek state di-reset
  return (
    <group>
      {Array.from({ length: BOT_COUNT }, (_, i) => {
        const def = botDef(i)
        return <VehicleMesh key={i} vehicle={() => bots[i]} model={def.model} color={def.color} label={def.name} />
      })}
    </group>
  )
}
