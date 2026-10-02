import type * as THREE from 'three'

export interface BodyProps {
  color: string
  registerBrake: (m: THREE.MeshStandardMaterial | null) => void | (() => void)
}

export function useMaterials(color: string) {
  return {
    paint: <meshStandardMaterial color={color} metalness={0.55} roughness={0.28} />,
    black: <meshStandardMaterial color="#121214" roughness={0.6} />,
    glass: <meshStandardMaterial color="#0f1420" metalness={0.8} roughness={0.1} />,
    chrome: <meshStandardMaterial color="#cfd3d8" metalness={0.95} roughness={0.2} />,
    carbon: <meshStandardMaterial color="#1c1f24" metalness={0.4} roughness={0.35} />,
  }
}

export function TailLightMat({ register }: { register: BodyProps['registerBrake'] }) {
  return <meshStandardMaterial ref={register} color="#ff1a1a" emissive="#ff1010" emissiveIntensity={0.9} toneMapped={false} />
}

/** Panel glow transparan di belakang lampu, ikut menyala saat mengerem */
export function BrakeGlow({ register, position, size }: { register: BodyProps['registerBrake']; position: [number, number, number]; size: [number, number] }) {
  return (
    <mesh position={position}>
      <planeGeometry args={size} />
      <meshStandardMaterial ref={register} color="#ff0000" emissive="#ff2020" emissiveIntensity={0.9} transparent opacity={0.35} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
