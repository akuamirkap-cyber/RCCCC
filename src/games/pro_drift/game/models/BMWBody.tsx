import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { BodyProps } from './types'
import { TailLightMat } from './types'
import {
  getBMWGeometryData,
  BMW_NATIVE_WIDTH,
  BMW_NATIVE_HEIGHT,
  BMW_NATIVE_LENGTH,
  loadBMWAdjustment,
  subscribeBMWAdjustment,
} from '@/utils/bmwCar'

export function BMWBody({ color, registerBrake }: BodyProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null)
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  const [adj, setAdj] = useState(() => loadBMWAdjustment('pro_drift'))

  useEffect(() => {
    let mounted = true
    getBMWGeometryData().then((data) => {
      if (!mounted) return
      setGeo(data.geometry)
      setTex(data.texture)
    })
    const unsub = subscribeBMWAdjustment('pro_drift', (newAdj) => {
      if (mounted) setAdj(newAdj)
    })
    return () => {
      mounted = false
      unsub()
    }
  }, [])

  const scaleX = adj.width / BMW_NATIVE_WIDTH
  const scaleY = adj.height / BMW_NATIVE_HEIGHT
  const scaleZ = adj.length / BMW_NATIVE_LENGTH

  // Dynamic taillight placement based on adjusted dimensions
  const tailX = (adj.width / 2) * 0.68
  const tailY = adj.offsetY + adj.height * 0.52
  const tailZ = (adj.length / 2) * 0.98

  return (
    <group>
      {/* BMW GLB Body: faces -Z (rotated Math.PI around Y), live adjusted */}
      <mesh
        ref={meshRef}
        geometry={geo ?? undefined}
        scale={[scaleX, scaleY, scaleZ]}
        rotation-y={Math.PI}
        position={[0, adj.offsetY, 0]}
        castShadow
        receiveShadow
      >
        {!geo && <boxGeometry args={[BMW_NATIVE_WIDTH, BMW_NATIVE_HEIGHT, BMW_NATIVE_LENGTH]} />}
        <meshStandardMaterial
          map={tex ?? undefined}
          color={color}
          roughness={0.25}
          metalness={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Dynamic LED Taillights matching adjusted width, length, and height */}
      <mesh position={[-tailX, tailY, tailZ]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.08, 0.08, 0.03, 16]} />
        <TailLightMat register={registerBrake} />
      </mesh>
      <mesh position={[tailX, tailY, tailZ]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.08, 0.08, 0.03, 16]} />
        <TailLightMat register={registerBrake} />
      </mesh>
    </group>
  )
}
