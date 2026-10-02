import * as THREE from 'three'
import { buildTrack, TrackData, TrackIndex } from '../track/haruna'
import {
  Terrain,
  buildTerrainMesh,
  buildRoad,
  buildShoulder,
  buildGuardrails,
  buildForest,
  buildRocks,
  buildBanners,
  buildSky,
  buildRidges,
  buildClouds,
} from './world'
import { Car, buildCarMesh } from './car'
import { PAL } from './palette'
import { DRIFT_ORDER, loadRcSetup, type DriftModeId, type RcSetup } from './drift'
import { RCSoundBox } from './rcSound'
import confetti from 'canvas-confetti'

export interface HudState {
  speed: number
  time: number
  progress: number
  altitude: number
  gradePct: number
  note: string
  noteDist: number
  finished: boolean
  started: boolean
  splits: number[]
  best: number | null
  drift: number
  driftAngle: number
  drifting: boolean
  driftScore: number
  driftMode: DriftModeId
  onRoad: boolean
  carX: number
  carZ: number
  gyro: number
  turbo: number
  rpm: number
  rc: RcSetup
  soundOn: boolean
}

export type Camera3Mode = 'chase' | 'far' | 'hood'

export class Game {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  track: TrackData
  index: TrackIndex
  terrain: Terrain
  car: Car
  carMesh: THREE.Group
  sun: THREE.DirectionalLight
  fill!: THREE.DirectionalLight
  keys: Record<string, boolean> = {}
  raf = 0
  clock = new THREE.Clock()
  progressIdx = 0
  time = 0
  started = false
  finished = false
  splits: number[] = []
  best: number | null = null
  camMode: Camera3Mode = 'chase'
  camPos = new THREE.Vector3()
  camLook = new THREE.Vector3()
  driftMode: DriftModeId = (localStorage.getItem('haruna_drift') as DriftModeId) || 'pas'
  driftScore = 0
  rc: RcSetup = loadRcSetup()
  sound = new RCSoundBox()
  soundOn = localStorage.getItem('sakura_sound') !== 'off'
  private confettiDone = false
  onHud: (s: HudState) => void = () => {}
  private hudT = 0
  private dust!: THREE.Points
  private dustData: { life: number; vx: number; vy: number; vz: number }[] = []
  private dustPtr = 0
  private disposed = false

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.98
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(34, container.clientWidth / container.clientHeight, 1, 4000)

    this.track = buildTrack()
    this.index = new TrackIndex(this.track)
    this.terrain = new Terrain(this.index)
    this.car = new Car(this.terrain)
    if (!DRIFT_ORDER.includes(this.driftMode)) this.driftMode = 'pas'
    this.car.setTune(this.driftMode)
    this.car.setRc(this.rc)
    this.sound.setEnabled(this.soundOn)
    this.carMesh = buildCarMesh()

    this.sun = new THREE.DirectionalLight('#ffedd0', 1.35)
    this.buildScene()

    const s = this.track.samples[3]
    this.car.reset(s.x, s.y, s.z, s.heading)
    this.best = Number(localStorage.getItem('haruna_best')) || null

    addEventListener('keydown', this.onKeyDown)
    addEventListener('keyup', this.onKeyUp)
    addEventListener('resize', this.onResize)
    this.loop()
  }

  private buildScene() {
    this.scene.background = new THREE.Color(PAL.fog)
    this.scene.fog = new THREE.Fog(PAL.fog, 320, 1650)
    this.scene.add(buildRidges(this.track))
    this.scene.add(buildClouds(this.track))

    const sky = buildSky()
    this.camera.add(sky)
    this.scene.add(this.camera)

    // siang lembut art of rally: tidak overexpose, bayangan tetap terbaca
    const hemi = new THREE.HemisphereLight('#b8d2e8', '#cfc09e', 0.85)
    this.scene.add(hemi)
    this.scene.add(new THREE.AmbientLight('#fff4e0', 0.22))
    this.fill = new THREE.DirectionalLight('#b9cff0', 0.5)
    this.scene.add(this.fill)
    this.scene.add(this.fill.target)

    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const c = this.sun.shadow.camera as THREE.OrthographicCamera
    c.left = -70
    c.right = 70
    c.top = 70
    c.bottom = -70
    c.near = 1
    c.far = 500
    this.sun.shadow.bias = -0.0002
    this.sun.shadow.normalBias = 0.05
    this.sun.shadow.radius = 4
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.scene.add(buildTerrainMesh(this.track, this.terrain))
    this.scene.add(buildShoulder(this.track, this.terrain))
    this.scene.add(buildRoad(this.track))
    this.scene.add(buildGuardrails(this.track))
    this.scene.add(buildRocks(this.track, this.terrain))
    this.scene.add(buildForest(this.track, this.terrain, this.index))
    this.scene.add(buildBanners(this.track))
    this.scene.add(this.carMesh)

    // danau Haruna di belakang garis start
    const s0 = this.track.samples[0]
    const lake = new THREE.Mesh(
      new THREE.CircleGeometry(230, 40),
      new THREE.MeshLambertMaterial({ color: PAL.water }),
    )
    lake.rotation.x = -Math.PI / 2
    lake.position.set(s0.x - Math.sin(s0.heading) * 250, s0.y + 1.5, s0.z - Math.cos(s0.heading) * 250)
    this.scene.add(lake)

    // debu / asap ban
    const N = 260
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3)
    const size = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      pos[i * 3 + 1] = -9999
      size[i] = 1
      this.dustData.push({ life: 0, vx: 0, vy: 0, vz: 0 })
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('size', new THREE.BufferAttribute(size, 1))
    const mat = new THREE.PointsMaterial({
      color: PAL.dust,
      size: 2.4,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      sizeAttenuation: true,
    })
    this.dust = new THREE.Points(g, mat)
    this.dust.frustumCulled = false
    this.scene.add(this.dust)
  }

  setDriftMode(id: DriftModeId) {
    this.driftMode = id
    this.car.setTune(id)
    try {
      localStorage.setItem('haruna_drift', id)
    } catch {
      /* abaikan */
    }
  }

  cycleDriftMode() {
    const i = DRIFT_ORDER.indexOf(this.driftMode)
    this.setDriftMode(DRIFT_ORDER[(i + 1) % DRIFT_ORDER.length])
  }

  setRcSetup(patch: Partial<RcSetup>) {
    this.rc = { ...this.rc, ...patch }
    this.car.setRc(this.rc)
    try {
      localStorage.setItem('sakura_rc_setup', JSON.stringify(this.rc))
    } catch {
      /* abaikan */
    }
  }

  setSoundEnabled(on: boolean) {
    this.soundOn = on
    this.sound.setEnabled(on)
    try {
      localStorage.setItem('sakura_sound', on ? 'on' : 'off')
    } catch {
      /* abaikan */
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true
    this.sound.ensure()
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
    if (e.code === 'KeyR') this.restart()
    if (e.code === 'KeyC') this.camMode = this.camMode === 'chase' ? 'far' : this.camMode === 'far' ? 'hood' : 'chase'
    if (e.code === 'KeyV') this.cycleDriftMode()
    if (e.code === 'Digit1') this.setDriftMode('normal')
    if (e.code === 'Digit2') this.setDriftMode('sedang')
    if (e.code === 'Digit3') this.setDriftMode('pas')
    if (e.code === 'Digit4') this.setDriftMode('best')
    if (e.code === 'Digit5') this.setDriftMode('sakura')
    if (e.code === 'KeyM') this.setSoundEnabled(!this.soundOn)
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false
  }
  private onResize = () => {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  restart() {
    const s = this.track.samples[3]
    this.car.reset(s.x, s.y, s.z, s.heading)
    this.time = 0
    this.started = false
    this.finished = false
    this.splits = []
    this.progressIdx = 3
    this.driftScore = 0
  }

  respawn() {
    const i = this.progressIdx
    const s = this.track.samples[Math.max(0, i - 2)]
    this.car.reset(s.x, s.y + 0.3, s.z, s.heading)
  }

  setInputFromTouch(v: Partial<Record<'up' | 'down' | 'left' | 'right' | 'hb', boolean>>) {
    if (v.up !== undefined) this.keys['ArrowUp'] = v.up
    if (v.down !== undefined) this.keys['ArrowDown'] = v.down
    if (v.left !== undefined) this.keys['ArrowLeft'] = v.left
    if (v.right !== undefined) this.keys['ArrowRight'] = v.right
    if (v.hb !== undefined) this.keys['Space'] = v.hb
  }

  private updateProgress() {
    const s = this.track.samples
    let best = this.progressIdx
    let bd = Infinity
    const from = Math.max(0, this.progressIdx - 40)
    const to = Math.min(s.length - 1, this.progressIdx + 220)
    for (let i = from; i <= to; i++) {
      const d = (s[i].x - this.car.pos.x) ** 2 + (s[i].z - this.car.pos.z) ** 2
      if (d < bd) {
        bd = d
        best = i
      }
    }
    this.progressIdx = best
  }

  private emitDust(dt: number, amount: number) {
    const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute
    const n = Math.min(4, Math.floor(amount * 40 * dt + Math.random()))
    for (let k = 0; k < n; k++) {
      const i = this.dustPtr = (this.dustPtr + 1) % this.dustData.length
      const back = 1.6
      const side = (Math.random() - 0.5) * 1.6
      const fx = Math.sin(this.car.heading)
      const fz = Math.cos(this.car.heading)
      pos.setXYZ(
        i,
        this.car.pos.x - fx * back + Math.cos(this.car.heading) * side,
        this.car.pos.y + 0.25,
        this.car.pos.z - fz * back - Math.sin(this.car.heading) * side,
      )
      this.dustData[i] = {
        life: 0.9,
        vx: -fx * 2 + (Math.random() - 0.5) * 3,
        vy: 1.2 + Math.random(),
        vz: -fz * 2 + (Math.random() - 0.5) * 3,
      }
    }
    for (let i = 0; i < this.dustData.length; i++) {
      const d = this.dustData[i]
      if (d.life <= 0) continue
      d.life -= dt
      pos.setXYZ(i, pos.getX(i) + d.vx * dt, pos.getY(i) + d.vy * dt, pos.getZ(i) + d.vz * dt)
      d.vx *= 0.96
      d.vz *= 0.96
      d.vy *= 0.94
      if (d.life <= 0) pos.setXYZ(i, 0, -9999, 0)
    }
    pos.needsUpdate = true
  }

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.033, this.clock.getDelta())

    const k = this.keys
    const throttle = k['ArrowUp'] || k['KeyW'] ? 1 : 0
    const brake = k['ArrowDown'] || k['KeyS'] ? 1 : 0
    const steer = (k['ArrowLeft'] || k['KeyA'] ? -1 : 0) + (k['ArrowRight'] || k['KeyD'] ? 1 : 0)
    const hb = !!k['Space']

    if (!this.finished) {
      if (!this.started && (throttle || brake)) this.started = true
      this.car.update(dt, { throttle, brake, steer, handbrake: hb })
      if (this.started) this.time += dt
    } else {
      this.car.update(dt, { throttle: 0, brake: 0.6, steer: 0, handbrake: false })
    }

    this.updateProgress()

    // split tiap sepertiga lintasan
    const total = this.track.length
    const d = this.track.samples[this.progressIdx].dist
    const thirds = [total / 3, (total * 2) / 3]
    thirds.forEach((t, i) => {
      if (this.splits.length === i && d >= t) this.splits.push(this.time)
    })
    if (!this.finished && this.progressIdx >= this.track.samples.length - 6) {
      this.finished = true
      if (this.best === null || this.time < this.best) {
        this.best = this.time
        localStorage.setItem('haruna_best', String(this.time))
      }
      if (!this.confettiDone) {
        this.confettiDone = true
        try {
          const big = this.driftScore > 25000
          confetti({ particleCount: big ? 220 : 120, spread: big ? 100 : 70, origin: { y: 0.6 }, colors: ['#ff7ad9', '#ffd34d', '#ffffff', '#7cc7e8'] })
          setTimeout(() => confetti({ particleCount: 90, angle: 60, spread: 60, origin: { x: 0 } }), 250)
          setTimeout(() => confetti({ particleCount: 90, angle: 120, spread: 60, origin: { x: 1 } }), 400)
        } catch { /* abaikan */ }
      }
    }

    // mesh mobil
    this.carMesh.position.copy(this.car.pos)
    this.carMesh.rotation.set(0, this.car.heading, 0)
    this.carMesh.rotateX(-this.car.pitch * 0.9)
    this.carMesh.rotateZ(this.car.roll)
    const wheels = (this.carMesh as any).wheels as THREE.Mesh[]
    const spin = this.car.speed * dt * 2.9
    wheels.forEach((w, i) => {
      w.rotation.x -= spin
      if (i < 2) w.rotation.y = -this.car.steerVis * 0.5
    })

    // skor drift: sudut x kecepatan, hanya saat ngesot beneran di aspal
    if (!this.finished && this.started && this.car.drifting) {
      this.driftScore += this.car.driftAngle * Math.abs(this.car.speed) * 3.6 * dt * 0.12
    }

    if (Math.abs(this.car.speed) > 4 && (this.car.slip > 0.22 || !this.car.onRoad || hb)) {
      this.emitDust(dt, Math.max(this.car.slip, this.car.driftAngle / 45, this.car.onRoad ? 0 : 0.6))
    } else {
      this.emitDust(dt, 0)
    }

    // soundbox RC: hidup setelah input pertama
    if (this.started || throttle > 0) this.sound.ensure()
    const tuneMax = this.driftMode === 'sakura' ? this.car.tune.maxSpeed : this.car.tune.maxSpeed
    this.sound.update(
      {
        speed: Math.abs(this.car.speed),
        maxSpeed: tuneMax,
        throttle: this.finished ? 0 : throttle,
        brake,
        drifting: this.car.drifting,
        driftAngle: this.car.driftAngle,
        escTurbo: this.driftMode === 'sakura' ? this.rc.escTurbo : 40,
      },
      dt,
    )

    this.updateCamera(dt)

    this.sun.position.set(this.car.pos.x + 105, this.car.pos.y + 165, this.car.pos.z + 50)
    this.sun.target.position.copy(this.car.pos)
    this.sun.target.updateMatrixWorld()
    this.fill.position.set(this.car.pos.x - 90, this.car.pos.y + 70, this.car.pos.z - 36)
    this.fill.target.position.copy(this.car.pos)
    this.fill.target.updateMatrixWorld()

    this.renderer.render(this.scene, this.camera)

    this.hudT += dt
    if (this.hudT > 0.05) {
      this.hudT = 0
      const s = this.track.samples[this.progressIdx]
      const next = this.track.corners.find((c) => c.dist > s.dist)
      this.onHud({
        speed: Math.abs(this.car.speed) * 3.6,
        time: this.time,
        progress: s.dist / total,
        altitude: this.car.pos.y,
        gradePct: -Math.tan(this.car.pitch) * 100,
        note: next ? next.note || next.name : 'Finish',
        noteDist: next ? next.dist - s.dist : 0,
        finished: this.finished,
        started: this.started,
        splits: [...this.splits],
        best: this.best,
        drift: this.car.slip,
        driftAngle: this.car.driftAngle,
        drifting: this.car.drifting,
        driftScore: this.driftScore,
        driftMode: this.driftMode,
        onRoad: this.car.onRoad,
        carX: this.car.pos.x,
        carZ: this.car.pos.z,
        gyro: this.car.gyroOut,
        turbo: this.car.turboBoost,
        rpm: Math.abs(this.car.speed) / Math.max(1, this.car.tune.maxSpeed),
        rc: { ...this.rc },
        soundOn: this.soundOn,
      })
    }
  }

  private updateCamera(dt: number) {
    const car = this.car
    const fx = Math.sin(car.heading)
    const fz = Math.cos(car.heading)
    const sp = Math.abs(car.speed)
    let target: THREE.Vector3
    let look: THREE.Vector3
    if (this.camMode === 'hood') {
      target = new THREE.Vector3(car.pos.x - fx * 6.5, car.pos.y + 2.6, car.pos.z - fz * 6.5)
      look = new THREE.Vector3(car.pos.x + fx * 14, car.pos.y + 1.4, car.pos.z + fz * 14)
    } else {
      const dist = this.camMode === 'far' ? 46 : 24 + sp * 0.28
      const hgt = this.camMode === 'far' ? 40 : 13 + sp * 0.16
      target = new THREE.Vector3(car.pos.x - fx * dist, car.pos.y + hgt, car.pos.z - fz * dist)
      look = new THREE.Vector3(car.pos.x + fx * (6 + sp * 0.25), car.pos.y + 1.5, car.pos.z + fz * (6 + sp * 0.25))
    }
    const lerp = this.camMode === 'hood' ? 1 : Math.min(1, dt * (this.camMode === 'far' ? 2.2 : 3.4))
    if (this.camPos.lengthSq() === 0) {
      this.camPos.copy(target)
      this.camLook.copy(look)
    }
    this.camPos.lerp(target, lerp)
    this.camLook.lerp(look, Math.min(1, dt * 6))
    // jangan tembus tanah
    const minY = this.terrain.heightAt(this.camPos.x, this.camPos.z) + 3
    this.camera.position.set(this.camPos.x, Math.max(this.camPos.y, minY), this.camPos.z)
    this.camera.lookAt(this.camLook)
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.camMode === 'hood' ? 62 : 34 + sp * 0.18, 0.05)
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    removeEventListener('keydown', this.onKeyDown)
    removeEventListener('keyup', this.onKeyUp)
    removeEventListener('resize', this.onResize)
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container)
      this.container.removeChild(this.renderer.domElement)
  }
}
