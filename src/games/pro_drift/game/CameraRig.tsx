import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from './sim'
import { forwardOf } from './physics'
import { useGame } from './store'

const camPos = new THREE.Vector3()
const target = new THREE.Vector3()
const lookAt = new THREE.Vector3()
const curLook = new THREE.Vector3()

export function CameraRig() {
  const init = useRef(false)
  useFrame(({ camera }, dt) => {
    const phase = useGame.getState().phase
    const f = forwardOf(sim)
    if (phase === 'menu') {
      const t = performance.now() * 0.0004
      target.set(sim.x + Math.sin(t) * 7, 2.6, sim.z + Math.cos(t) * 7)
      lookAt.set(sim.x, 0.5, sim.z)
      camera.position.lerp(target, Math.min(1, dt * 3))
      curLook.lerp(lookAt, Math.min(1, dt * 3))
      camera.lookAt(curLook)
      init.current = false
      return
    }
    // blend heading with velocity direction for drift feel
    let dx = f.x
    let dz = f.z
    if (sim.speed > 3) {
      const vx = sim.vx / sim.speed
      const vz = sim.vz / sim.speed
      dx = f.x * 0.6 + vx * 0.4
      dz = f.z * 0.6 + vz * 0.4
      const l = Math.hypot(dx, dz) || 1
      dx /= l
      dz /= l
    }
    const dist = 7.2 + Math.min(sim.speed / 30, 1) * 2.2
    const height = 3.9 + Math.min(sim.speed / 30, 1) * 0.6
    target.set(sim.x - dx * dist, height, sim.z - dz * dist)
    lookAt.set(sim.x + f.x * 2.5, 0.7, sim.z + f.z * 2.5)
    if (!init.current) {
      camera.position.copy(target)
      curLook.copy(lookAt)
      init.current = true
    }
    const k = 1 - Math.exp(-dt * 5)
    camera.position.lerp(target, k)
    curLook.lerp(lookAt, 1 - Math.exp(-dt * 8))
    camPos.copy(camera.position)
    if (sim.shake > 0) {
      const s = sim.shake * 0.35
      camera.position.x += (Math.random() - 0.5) * s
      camera.position.y += (Math.random() - 0.5) * s
      camera.position.z += (Math.random() - 0.5) * s
    }
    camera.lookAt(curLook)
    camera.position.copy(camPos)
    // FOV melebar saat kencang -> sensasi kecepatan
    const cam = camera as THREE.PerspectiveCamera
    const targetFov = 62 + Math.min(1, sim.speed / 30) * 16 + (sim.drifting ? 3 : 0)
    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 4)
      cam.updateProjectionMatrix()
    }
  })
  return null
}
