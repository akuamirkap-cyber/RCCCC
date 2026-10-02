import { Canvas } from '@react-three/fiber'
import { Track } from './Track'
import { Car, Bots } from './Car'
import { SkidMarks, Smoke } from './Effects'
import { CameraRig } from './CameraRig'
import { GameLoop } from './GameLoop'

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ fov: 62, near: 0.1, far: 2000, position: [0, 4, 8] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#9fd3ff']} />
      <fog attach="fog" args={['#cfe6f7', 120, 520]} />
      <hemisphereLight args={['#e8f4ff', '#4a7a35', 0.75]} />
      <ambientLight intensity={0.15} color="#ffe9c9" />
      <directionalLight
        position={[60, 90, 30]}
        color="#fff4e0"
        intensity={2.0}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-bias={-0.0005}
      />
      <Track />
      <SkidMarks />
      <Smoke />
      <Car />
      <Bots />
      <CameraRig />
      <GameLoop />
    </Canvas>
  )
}
