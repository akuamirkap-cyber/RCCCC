import type { BodyProps } from './types'
import { useMaterials, TailLightMat, BrakeGlow } from './types'

// Nissan Skyline GT-R (R34) low-poly — menghadap ke -Z lokal
export function GTRBody({ color, registerBrake }: BodyProps) {
  const { paint, black, glass, chrome } = useMaterials(color)
  const TailLight = ({ x }: { x: number }) => (
    <mesh position={[x, 0.53, 1.31]} rotation-x={Math.PI / 2}>
      <cylinderGeometry args={[0.1, 0.1, 0.04, 16]} />
      <TailLightMat register={registerBrake} />
    </mesh>
  )
  return (
    <group>
      {/* ===== BODY UTAMA ===== */}
      {/* Lantai / lower body */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[1.14, 0.26, 2.56]} />
        {paint}
      </mesh>
      {/* Fender lebar (ciri GT-R) */}
      <mesh position={[0, 0.52, -0.78]} castShadow>
        <boxGeometry args={[1.26, 0.2, 0.9]} />
        {paint}
      </mesh>
      <mesh position={[0, 0.52, 0.78]} castShadow>
        <boxGeometry args={[1.26, 0.2, 0.9]} />
        {paint}
      </mesh>
      {/* Bagian tengah (pintu) */}
      <mesh position={[0, 0.52, 0]} castShadow>
        <boxGeometry args={[1.16, 0.2, 0.8]} />
        {paint}
      </mesh>
      {/* Kap mesin */}
      <mesh position={[0, 0.635, -0.72]} rotation-x={0.04} castShadow>
        <boxGeometry args={[1.08, 0.05, 0.95]} />
        {paint}
      </mesh>
      {/* Hood scoop / vent NACA */}
      <mesh position={[0, 0.665, -0.6]}>
        <boxGeometry args={[0.36, 0.03, 0.34]} />
        {black}
      </mesh>
      <mesh position={[-0.36, 0.662, -0.9]}>
        <boxGeometry args={[0.16, 0.02, 0.22]} />
        {black}
      </mesh>
      <mesh position={[0.36, 0.662, -0.9]}>
        <boxGeometry args={[0.16, 0.02, 0.22]} />
        {black}
      </mesh>
      {/* Bagasi */}
      <mesh position={[0, 0.65, 0.98]} castShadow>
        <boxGeometry args={[1.08, 0.08, 0.6]} />
        {paint}
      </mesh>

      {/* ===== KABIN ===== */}
      {/* Pilar & kaca samping */}
      <mesh position={[0, 0.8, 0.12]} castShadow>
        <boxGeometry args={[0.96, 0.3, 1.02]} />
        {glass}
      </mesh>
      {/* Kaca depan (rake) */}
      <mesh position={[0, 0.79, -0.46]} rotation-x={-0.62}>
        <boxGeometry args={[0.98, 0.4, 0.06]} />
        {glass}
      </mesh>
      {/* Kaca belakang */}
      <mesh position={[0, 0.8, 0.74]} rotation-x={0.75}>
        <boxGeometry args={[0.98, 0.38, 0.06]} />
        {glass}
      </mesh>
      {/* Atap */}
      <mesh position={[0, 0.965, 0.12]} castShadow>
        <boxGeometry args={[0.94, 0.04, 0.98]} />
        {paint}
      </mesh>
      {/* Pilar-B & frame pintu (warna body) */}
      <mesh position={[-0.485, 0.8, 0.12]}>
        <boxGeometry args={[0.02, 0.3, 0.06]} />
        {black}
      </mesh>
      <mesh position={[0.485, 0.8, 0.12]}>
        <boxGeometry args={[0.02, 0.3, 0.06]} />
        {black}
      </mesh>
      {/* Spion */}
      <mesh position={[-0.64, 0.74, -0.3]}>
        <boxGeometry args={[0.14, 0.08, 0.1]} />
        {paint}
      </mesh>
      <mesh position={[0.64, 0.74, -0.3]}>
        <boxGeometry args={[0.14, 0.08, 0.1]} />
        {paint}
      </mesh>

      {/* ===== DEPAN ===== */}
      {/* Bumper depan */}
      <mesh position={[0, 0.42, -1.3]} castShadow>
        <boxGeometry args={[1.2, 0.3, 0.12]} />
        {paint}
      </mesh>
      {/* Intake besar bawah */}
      <mesh position={[0, 0.36, -1.365]}>
        <boxGeometry args={[0.8, 0.16, 0.02]} />
        {black}
      </mesh>
      {/* Grill atas + emblem */}
      <mesh position={[0, 0.58, -1.32]}>
        <boxGeometry args={[0.5, 0.07, 0.02]} />
        {black}
      </mesh>
      <mesh position={[0, 0.58, -1.335]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.04, 0.04, 0.01, 12]} />
        {chrome}
      </mesh>
      {/* Splitter */}
      <mesh position={[0, 0.27, -1.34]}>
        <boxGeometry args={[1.24, 0.05, 0.16]} />
        {black}
      </mesh>
      {/* Lampu depan angular R34 */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 0.42, 0.56, -1.325]} rotation-y={s * 0.12}>
            <boxGeometry args={[0.3, 0.12, 0.04]} />
            <meshStandardMaterial color="#e8f4ff" emissive="#dbeeff" emissiveIntensity={1.6} />
          </mesh>
          <mesh position={[s * 0.34, 0.56, -1.34]}>
            <boxGeometry args={[0.08, 0.1, 0.02]} />
            <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2.5} />
          </mesh>
          {/* Fog lamp */}
          <mesh position={[s * 0.5, 0.36, -1.37]}>
            <boxGeometry args={[0.1, 0.06, 0.02]} />
            <meshStandardMaterial color="#ffe9a8" emissive="#ffd970" emissiveIntensity={1.2} />
          </mesh>
          {/* Side vent depan */}
          <mesh position={[s * 0.6, 0.4, -1.28]}>
            <boxGeometry args={[0.04, 0.14, 0.12]} />
            {black}
          </mesh>
        </group>
      ))}

      {/* ===== BELAKANG ===== */}
      {/* Bumper belakang */}
      <mesh position={[0, 0.42, 1.3]} castShadow>
        <boxGeometry args={[1.2, 0.3, 0.12]} />
        {paint}
      </mesh>
      {/* Panel lampu belakang hitam */}
      <mesh position={[0, 0.53, 1.3]}>
        <boxGeometry args={[1.1, 0.24, 0.04]} />
        {black}
      </mesh>
      {/* 4 lampu bulat ikonik */}
      <TailLight x={-0.44} />
      <TailLight x={-0.22} />
      <TailLight x={0.22} />
      <TailLight x={0.44} />
      <BrakeGlow register={registerBrake} position={[-0.33, 0.53, 1.36]} size={[0.5, 0.26]} />
      <BrakeGlow register={registerBrake} position={[0.33, 0.53, 1.36]} size={[0.5, 0.26]} />
      {/* Emblem GT-R belakang */}
      <mesh position={[0, 0.53, 1.325]}>
        <boxGeometry args={[0.14, 0.05, 0.01]} />
        {chrome}
      </mesh>
      {/* Diffuser */}
      <mesh position={[0, 0.29, 1.32]}>
        <boxGeometry args={[1.1, 0.08, 0.14]} />
        {black}
      </mesh>
      {/* Knalpot ganda */}
      <mesh position={[-0.35, 0.29, 1.4]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.06, 0.06, 0.1, 12]} />
        {chrome}
      </mesh>
      <mesh position={[0.35, 0.29, 1.4]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.06, 0.06, 0.1, 12]} />
        {chrome}
      </mesh>

      {/* ===== SAYAP BELAKANG GT-R ===== */}
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.82, 1.08]} castShadow>
          <boxGeometry args={[0.06, 0.28, 0.22]} />
          {paint}
        </mesh>
      ))}
      <mesh position={[0, 0.98, 1.08]} rotation-x={-0.12} castShadow>
        <boxGeometry args={[1.2, 0.045, 0.32]} />
        {paint}
      </mesh>
      {/* Endplate sayap */}
      <mesh position={[-0.6, 0.98, 1.08]}>
        <boxGeometry args={[0.03, 0.16, 0.36]} />
        {black}
      </mesh>
      <mesh position={[0.6, 0.98, 1.08]}>
        <boxGeometry args={[0.03, 0.16, 0.36]} />
        {black}
      </mesh>
      {/* Gurney flap */}
      <mesh position={[0, 1.01, 1.23]}>
        <boxGeometry args={[1.18, 0.05, 0.02]} />
        {black}
      </mesh>

      {/* ===== DETAIL SAMPING ===== */}
      {/* Side skirt */}
      <mesh position={[0, 0.29, 0]}>
        <boxGeometry args={[1.22, 0.08, 1.7]} />
        {black}
      </mesh>
      {/* Garis pintu */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.585, 0.5, -0.05]}>
          <boxGeometry args={[0.01, 0.02, 0.85]} />
          {black}
        </mesh>
      ))}
      {/* Nomor start di pintu */}
      {[-1, 1].map((s) => (
        <mesh key={`n${s}`} position={[s * 0.59, 0.52, 0.05]} rotation-y={(s * Math.PI) / 2}>
          <circleGeometry args={[0.13, 20]} />
          <meshStandardMaterial color="#fff" />
        </mesh>
      ))}
      {/* Strip livery di atap-kap */}
      <mesh position={[0, 0.99, 0.12]}>
        <boxGeometry args={[0.22, 0.005, 0.98]} />
        <meshStandardMaterial color="#ffffff" opacity={0.8} transparent />
      </mesh>
    </group>
  )
}
