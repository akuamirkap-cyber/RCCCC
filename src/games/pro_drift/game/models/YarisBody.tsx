import type { BodyProps } from './types'
import { useMaterials, TailLightMat, BrakeGlow } from './types'

// Toyota GR Yaris low-poly hot hatch — menghadap ke -Z lokal
// Lebih pendek (±2.3), lebih tinggi (atap ±1.06), overhang pendek
export function YarisBody({ color, registerBrake }: BodyProps) {
  const { paint, black, glass, chrome, carbon } = useMaterials(color)
  const isDark = ['#141416', '#2f6e4f'].includes(color)
  const accent = isDark ? '#f3f3f0' : '#141416'

  return (
    <group>
      {/* ===== BODY ===== */}
      {/* Lower body */}
      <mesh position={[0, 0.42, 0.02]} castShadow>
        <boxGeometry args={[1.1, 0.3, 2.22]} />
        {paint}
      </mesh>
      {/* Fender depan melebar (box flare) */}
      <mesh position={[0, 0.56, -0.62]} castShadow>
        <boxGeometry args={[1.24, 0.24, 0.72]} />
        {paint}
      </mesh>
      {/* Fender belakang melebar — ciri GR Yaris */}
      <mesh position={[0, 0.58, 0.68]} castShadow>
        <boxGeometry args={[1.28, 0.28, 0.72]} />
        {paint}
      </mesh>
      {/* Panel pintu */}
      <mesh position={[0, 0.58, 0.03]} castShadow>
        <boxGeometry args={[1.12, 0.26, 0.7]} />
        {paint}
      </mesh>
      {/* Kap mesin pendek, menurun ke depan */}
      <mesh position={[0, 0.7, -0.66]} rotation-x={0.13} castShadow>
        <boxGeometry args={[1.04, 0.05, 0.72]} />
        {paint}
      </mesh>
      {/* Bulge kap tengah */}
      <mesh position={[0, 0.735, -0.58]} rotation-x={0.13}>
        <boxGeometry args={[0.44, 0.03, 0.5]} />
        {paint}
      </mesh>

      {/* ===== KABIN (tinggi, atap melandai ke belakang) ===== */}
      {/* Kaca samping + pilar */}
      <mesh position={[0, 0.88, 0.1]} castShadow>
        <boxGeometry args={[0.98, 0.32, 1.1]} />
        {glass}
      </mesh>
      {/* Kaca depan — rake curam khas hatch */}
      <mesh position={[0, 0.88, -0.5]} rotation-x={-0.7}>
        <boxGeometry args={[1.0, 0.46, 0.06]} />
        {glass}
      </mesh>
      {/* Kaca belakang / hatch miring */}
      <mesh position={[0, 0.9, 0.78]} rotation-x={0.55}>
        <boxGeometry args={[1.02, 0.42, 0.06]} />
        {glass}
      </mesh>
      {/* Atap (carbon roof — fitur GR Yaris) dengan taper ke belakang */}
      <mesh position={[0, 1.045, 0.02]} rotation-x={0.05} castShadow>
        <boxGeometry args={[0.96, 0.04, 1.06]} />
        {carbon}
      </mesh>
      {/* Pilar C tebal (warna body) */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.5, 0.86, 0.62]} rotation-x={0.4}>
          <boxGeometry args={[0.05, 0.36, 0.22]} />
          {paint}
        </mesh>
      ))}
      {/* Pilar A */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.5, 0.86, -0.46]} rotation-x={-0.7}>
          <boxGeometry args={[0.04, 0.44, 0.05]} />
          {paint}
        </mesh>
      ))}
      {/* Spion */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.64, 0.82, -0.28]}>
          <boxGeometry args={[0.14, 0.08, 0.1]} />
          {black}
        </mesh>
      ))}

      {/* ===== SPOILER ATAP ===== */}
      <mesh position={[0, 1.08, 0.66]} rotation-x={-0.1} castShadow>
        <boxGeometry args={[1.02, 0.04, 0.3]} />
        {paint}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.5, 1.03, 0.7]}>
          <boxGeometry args={[0.03, 0.12, 0.2]} />
          {black}
        </mesh>
      ))}

      {/* ===== DEPAN ===== */}
      {/* Bumper depan */}
      <mesh position={[0, 0.44, -1.12]} castShadow>
        <boxGeometry args={[1.18, 0.34, 0.14]} />
        {paint}
      </mesh>
      {/* Grill heksagonal besar (functional matrix) */}
      <mesh position={[0, 0.42, -1.19]} rotation-z={Math.PI / 6}>
        <cylinderGeometry args={[0.36, 0.36, 0.02, 6]} />
        {black}
      </mesh>
      <mesh position={[0, 0.42, -1.2]} rotation-z={Math.PI / 6}>
        <cylinderGeometry args={[0.36, 0.36, 0.01, 6]} />
        <meshStandardMaterial color="#0a0a0a" roughness={1} />
      </mesh>
      {/* Emblem Toyota */}
      <mesh position={[0, 0.66, -1.06]} rotation-x={Math.PI / 2 - 0.13}>
        <torusGeometry args={[0.045, 0.012, 6, 16]} />
        {chrome}
      </mesh>
      {/* Grill atas tipis */}
      <mesh position={[0, 0.63, -1.15]}>
        <boxGeometry args={[0.7, 0.05, 0.02]} />
        {black}
      </mesh>
      {/* Splitter */}
      <mesh position={[0, 0.28, -1.16]}>
        <boxGeometry args={[1.2, 0.05, 0.16]} />
        {black}
      </mesh>
      {/* Lampu depan LED sipit */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 0.44, 0.62, -1.15]} rotation-y={s * 0.25}>
            <boxGeometry args={[0.3, 0.09, 0.04]} />
            <meshStandardMaterial color="#e8f4ff" emissive="#dbeeff" emissiveIntensity={1.6} />
          </mesh>
          <mesh position={[s * 0.44, 0.665, -1.15]} rotation-y={s * 0.25}>
            <boxGeometry args={[0.3, 0.015, 0.045]} />
            <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2.5} />
          </mesh>
          {/* Intake samping bumper */}
          <mesh position={[s * 0.48, 0.36, -1.19]}>
            <boxGeometry args={[0.18, 0.14, 0.02]} />
            {black}
          </mesh>
          {/* Canard kecil */}
          <mesh position={[s * 0.6, 0.34, -1.14]} rotation-y={s * 0.3}>
            <boxGeometry args={[0.1, 0.02, 0.12]} />
            {black}
          </mesh>
        </group>
      ))}

      {/* ===== BELAKANG ===== */}
      {/* Bumper belakang */}
      <mesh position={[0, 0.44, 1.12]} castShadow>
        <boxGeometry args={[1.2, 0.34, 0.14]} />
        {paint}
      </mesh>
      {/* Panel hatch */}
      <mesh position={[0, 0.66, 1.1]} castShadow>
        <boxGeometry args={[1.08, 0.14, 0.08]} />
        {paint}
      </mesh>
      {/* Lampu belakang horizontal kiri-kanan */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.38, 0.66, 1.15]}>
          <boxGeometry args={[0.34, 0.08, 0.03]} />
          <TailLightMat register={registerBrake} />
        </mesh>
      ))}
      <BrakeGlow register={registerBrake} position={[-0.38, 0.66, 1.2]} size={[0.44, 0.2]} />
      <BrakeGlow register={registerBrake} position={[0.38, 0.66, 1.2]} size={[0.44, 0.2]} />
      {/* Light bar tipis penghubung */}
      <mesh position={[0, 0.66, 1.145]}>
        <boxGeometry args={[0.44, 0.02, 0.02]} />
        <meshStandardMaterial color="#ff4444" emissive="#ff0000" emissiveIntensity={0.9} />
      </mesh>
      {/* Emblem GR */}
      <mesh position={[0, 0.52, 1.195]}>
        <boxGeometry args={[0.12, 0.05, 0.01]} />
        {chrome}
      </mesh>
      {/* Diffuser + knalpot ganda tengah */}
      <mesh position={[0, 0.3, 1.14]}>
        <boxGeometry args={[1.0, 0.1, 0.16]} />
        {black}
      </mesh>
      {[-0.13, 0.13].map((x) => (
        <mesh key={x} position={[x, 0.31, 1.22]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.055, 0.055, 0.1, 12]} />
          {chrome}
        </mesh>
      ))}
      {/* Fog belakang */}
      <mesh position={[0, 0.4, 1.195]}>
        <boxGeometry args={[0.1, 0.04, 0.01]} />
        <meshStandardMaterial color="#ff5555" emissive="#ff2222" emissiveIntensity={0.6} />
      </mesh>

      {/* ===== DETAIL SAMPING ===== */}
      {/* Side skirt */}
      <mesh position={[0, 0.29, 0.02]}>
        <boxGeometry args={[1.2, 0.08, 1.5]} />
        {black}
      </mesh>
      {/* Garis pintu (3 pintu: 1 pintu panjang per sisi) */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.565, 0.56, -0.02]}>
          <boxGeometry args={[0.01, 0.02, 0.6]} />
          {black}
        </mesh>
      ))}
      {/* Nomor start */}
      {[-1, 1].map((s) => (
        <mesh key={`n${s}`} position={[s * 0.57, 0.58, 0.02]} rotation-y={(s * Math.PI) / 2}>
          <circleGeometry args={[0.13, 20]} />
          <meshStandardMaterial color="#fff" />
        </mesh>
      ))}
      {/* Livery GR: strip tiga warna di sisi bawah pintu (merah-hitam-putih ala Gazoo Racing) */}
      {[-1, 1].map((s) => (
        <group key={`l${s}`}>
          <mesh position={[s * 0.565, 0.47, -0.02]}>
            <boxGeometry args={[0.01, 0.05, 0.62]} />
            <meshStandardMaterial color="#c8102e" />
          </mesh>
          <mesh position={[s * 0.565, 0.505, -0.02]}>
            <boxGeometry args={[0.01, 0.02, 0.62]} />
            <meshStandardMaterial color={accent} />
          </mesh>
        </group>
      ))}
      {/* Strip kap ala rally */}
      {[-0.26, 0.26].map((x) => (
        <mesh key={x} position={[x, 0.75, -0.62]} rotation-x={0.13}>
          <boxGeometry args={[0.06, 0.005, 0.66]} />
          <meshStandardMaterial color={accent} opacity={0.85} transparent />
        </mesh>
      ))}
      {/* Hood pins */}
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.74, -0.9]}>
          <cylinderGeometry args={[0.02, 0.02, 0.02, 8]} />
          {chrome}
        </mesh>
      ))}
    </group>
  )
}
