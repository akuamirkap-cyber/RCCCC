import * as THREE from 'three';
import { Track, projectLocal, ROAD_HALF, Proj } from './track';
import { World, TREE_CELL, tkey } from './world';
import { smoothstep } from './noise';
import { DriftMode, DriftTune, cloneTune } from './drift';

export interface CarInput {
  throttle: number;
  brake: number;
  steer: number; // -1 left .. +1 right
  handbrake: boolean;
}

const H = ROAD_HALF;
const TOP = 54; // m/s ≈ 195 km/h
export const GEARS = [0, 13, 22, 31, 40, 60];

// --- parameter rigid-body (AE86 ringan, CG sedikit ke depan) ---
const MASS = 1050;
const IZ = 1250;
const CG_FRONT = 1.1; // CG → as depan
const CG_REAR = 1.3; // CG → as belakang
const WHEELBASE = CG_FRONT + CG_REAR;
const GRAV = 9.81;
const CG_HEIGHT = 0.5;
const KICK_TIME = 0.3;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Kurva ban ala Pacejka: gaya = D·sin(C·atan(B·α)). B dipilih agar puncak jatuh di alphaPeak. */
function tireForce(alpha: number, fmax: number, alphaPeak: number, C: number) {
  const B = Math.tan(Math.PI / (2 * C)) / alphaPeak;
  return fmax * Math.sin(C * Math.atan(B * alpha));
}

function decalTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#111';
  g.font = 'bold 64px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('藤原とうふ店', 256, 56);
  g.font = 'bold 26px sans-serif';
  g.fillText('(自家用)', 256, 108);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Car {
  root = new THREE.Group();
  body = new THREE.Group();
  wheels: THREE.Group[] = [];
  frontPivots: THREE.Group[] = [];
  popups: THREE.Group[] = [];
  headLights: THREE.SpotLight[] = [];
  tailMat: THREE.MeshLambertMaterial;
  headMat: THREE.MeshLambertMaterial;

  x = 0;
  y = 0;
  z = 0;
  heading = 0;
  vx = 0;
  vz = 0;
  yawRate = 0;
  steerVis = 0;
  steerAngle = 0; // sudut roda depan sebenarnya (rad, + = kanan)
  vF = 0;
  vL = 0;
  aF = 0;
  aL = 0;
  hint = 0;
  proj: Proj = { i: 0, f: 0, lat: 0, d: 0, h: 0 };
  onRoad = true;
  impact = 0;
  gear = 1;
  rpm = 900;
  pitch = 0;
  roll = 0;
  lightsOn = false;
  popupAngle = 0;
  hf = 0;
  hb = 0;

  // --- drift ---
  driftMode: DriftMode = 'normal';
  tune: DriftTune = cloneTune('pas');
  thr = 0; // gas yang dihaluskan (rasa analog di keyboard)
  prevThr = 0;
  liftT = 0;
  kickT = 0;
  hbS = 0;
  axS = 0;
  slipBeta = 0; // sudut slip badan (+ = meluncur ke kanan)
  driftAngle = 0; // |slipBeta|
  drifting = false;
  rearSlide = 0; // 0..1 seberapa jenuh ban belakang

  // --- RC: turbo, BOV, backfire ---
  boost = 0; // 0..1 tekanan turbo
  fxBov = 0; // kekuatan BOV yang belum dimainkan (dibaca & di-nol-kan oleh Game)
  fxBackfire = 0; // jumlah letupan yang belum dimainkan
  private prevThrRaw = 0;
  private backfireCd = 0;

  constructor() {
    const white = new THREE.MeshLambertMaterial({ color: '#f6f3ea' });
    const black = new THREE.MeshLambertMaterial({ color: '#2a2a28' });
    const glass = new THREE.MeshLambertMaterial({ color: '#33414f' });
    const chrome = new THREE.MeshLambertMaterial({ color: '#b9bcb6' });
    this.tailMat = new THREE.MeshLambertMaterial({ color: '#8a1010', emissive: '#300000' });
    this.headMat = new THREE.MeshLambertMaterial({ color: '#fff6d0', emissive: '#000000' });

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent = this.body) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // lower black body (panda)
    add(new THREE.BoxGeometry(1.64, 0.36, 4.18), black, 0, 0.42, 0);
    // upper white body
    add(new THREE.BoxGeometry(1.64, 0.3, 4.12), white, 0, 0.75, -0.02);
    // hood (slightly lower slope, white)
    const hood = add(new THREE.BoxGeometry(1.56, 0.1, 1.35), white, 0, 0.92, 1.3);
    hood.rotation.x = 0.06;
    // cabin (tapered)
    const cab = new THREE.BoxGeometry(1.44, 0.52, 2.1);
    const p = cab.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) {
        p.setX(i, p.getX(i) * 0.86);
        p.setZ(i, p.getZ(i) * (p.getZ(i) > 0 ? 0.62 : 0.8));
      }
    }
    cab.computeVertexNormals();
    add(cab, glass, 0, 1.16, -0.38);
    add(new THREE.BoxGeometry(1.2, 0.05, 1.3), white, 0, 1.43, -0.48);
    // pillars white-ish (roof edges)
    add(new THREE.BoxGeometry(0.06, 0.06, 1.3), white, 0.6, 1.4, -0.48);
    add(new THREE.BoxGeometry(0.06, 0.06, 1.3), white, -0.6, 1.4, -0.48);
    // bumpers
    add(new THREE.BoxGeometry(1.68, 0.22, 0.2), black, 0, 0.42, 2.14);
    add(new THREE.BoxGeometry(1.68, 0.22, 0.2), black, 0, 0.42, -2.14);
    // grille/light bar
    add(new THREE.BoxGeometry(1.3, 0.1, 0.05), black, 0, 0.7, 2.08);
    // turn signals
    add(new THREE.BoxGeometry(0.3, 0.08, 0.05), new THREE.MeshLambertMaterial({ color: '#ff9f2a' }), 0.62, 0.58, 2.1);
    add(new THREE.BoxGeometry(0.3, 0.08, 0.05), new THREE.MeshLambertMaterial({ color: '#ff9f2a' }), -0.62, 0.58, 2.1);
    // tail lights
    add(new THREE.BoxGeometry(0.55, 0.16, 0.05), this.tailMat, 0.5, 0.78, -2.07);
    add(new THREE.BoxGeometry(0.55, 0.16, 0.05), this.tailMat, -0.5, 0.78, -2.07);
    // spoiler lip
    add(new THREE.BoxGeometry(1.4, 0.05, 0.25), black, 0, 1.0, -1.95);
    // mirrors
    add(new THREE.BoxGeometry(0.12, 0.1, 0.15), black, 0.86, 1.0, 0.55);
    add(new THREE.BoxGeometry(0.12, 0.1, 0.15), black, -0.86, 1.0, 0.55);
    // door decals
    const dec = new THREE.MeshBasicMaterial({ map: decalTexture() });
    const dgeo = new THREE.PlaneGeometry(1.0, 0.25);
    const d1 = new THREE.Mesh(dgeo, dec);
    d1.position.set(0.825, 0.76, -0.1);
    d1.rotation.y = Math.PI / 2;
    const d2 = new THREE.Mesh(dgeo, dec);
    d2.position.set(-0.825, 0.76, -0.1);
    d2.rotation.y = -Math.PI / 2;
    this.body.add(d1, d2);

    // pop-up headlights
    for (const sx of [0.52, -0.52]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx, 0.96, 1.72);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.34), white);
      lid.position.set(0, 0.0, 0.17);
      lid.castShadow = true;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.04), this.headMat);
      lamp.position.set(0, -0.1, 0.33);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.3), black);
      box.position.set(0, -0.1, 0.17);
      pivot.add(lid, box, lamp);
      this.body.add(pivot);
      this.popups.push(pivot);
      const sl = new THREE.SpotLight('#fff1c8', 0, 110, 0.5, 0.55, 1.1);
      sl.position.set(sx, 0.9, 2.0);
      sl.target.position.set(sx * 2, -1.5, 22);
      this.body.add(sl, sl.target);
      this.headLights.push(sl);
    }

    // wheels
    const tire = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12);
    tire.rotateZ(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(0.19, 0.19, 0.21, 8);
    rim.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshLambertMaterial({ color: '#1a1a1a' });
    const wpos: [number, number, boolean][] = [
      [0.72, 1.2, true],
      [-0.72, 1.2, true],
      [0.72, -1.2, false],
      [-0.72, -1.2, false],
    ];
    for (const [wx, wz, front] of wpos) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, 0.3, wz);
      const w = new THREE.Group();
      const t = new THREE.Mesh(tire, tireMat);
      t.castShadow = true;
      const r = new THREE.Mesh(rim, chrome);
      w.add(t, r);
      pivot.add(w);
      this.root.add(pivot);
      this.wheels.push(w);
      if (front) this.frontPivots.push(pivot);
    }
    this.root.add(this.body);
    this.root.rotation.order = 'YXZ';
  }

  place(track: Track, i: number) {
    this.x = track.x[i];
    this.z = track.z[i];
    this.y = track.y[i];
    this.heading = Math.atan2(track.tx[i], track.tz[i]);
    this.vx = this.vz = this.yawRate = 0;
    this.vF = this.vL = 0;
    this.hint = i;
    this.gear = 1;
    this.thr = this.prevThr = this.hbS = this.axS = 0;
    this.liftT = 0;
    this.kickT = 0;
    this.slipBeta = this.driftAngle = 0;
    this.drifting = false;
    this.rearSlide = 0;
    this.steerAngle = 0;
    this.boost = 0;
    this.fxBov = 0;
    this.fxBackfire = 0;
    this.prevThrRaw = 0;
  }

  setDrift(mode: DriftMode, tune?: DriftTune) {
    this.driftMode = mode;
    if (tune) this.tune = tune;
  }

  heightAt(track: Track, world: World, x: number, z: number) {
    const p = projectLocal(track, x, z, this.hint, 30);
    // bahu + bench jalan tetap datar; terrain baru berpengaruh di luarnya
    const a = Math.abs(p.lat);
    if (a <= H + 2.1) return p.h;
    const t = smoothstep(H + 2.1, H + 12, a); // 12 = TP.benchWidth
    return p.h * (1 - t) + world.terrainHeight(x, z) * t;
  }

  update(dt: number, inp: CarInput, track: Track, world: World) {
    this.impact = Math.max(0, this.impact - dt * 3);
    const drift = this.driftMode !== 'normal';
    // steering smoothing
    const steerSpeed = drift ? (inp.steer === 0 ? this.tune.steerRate * 1.25 : this.tune.steerRate) : inp.steer === 0 ? 6 : 4;
    this.steerVis += (inp.steer - this.steerVis) * Math.min(1, dt * steerSpeed);

    const proj = projectLocal(track, this.x, this.z, this.hint, 45);
    this.proj = proj;
    this.hint = proj.i;
    this.onRoad = Math.abs(proj.lat) < H + 0.4;
    const grip = this.onRoad ? 1 : 0.6;

    if (drift) this.dynamicsDrift(dt, inp, track, world, grip);
    else this.dynamicsNormal(dt, inp, track, world, grip);

    const vF = this.vF;
    const speed = Math.abs(vF);
    // sudut slip badan (dipakai HUD, skor drift, asap)
    this.slipBeta = speed > 3 ? Math.atan2(this.vL, speed) : 0;
    this.driftAngle = Math.abs(this.slipBeta);
    this.drifting = this.onRoad && speed > 6 && this.driftAngle > 0.17;

    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;

    // --- guardrail collisions ---
    const p2 = projectLocal(track, nx, nz, this.hint, 20);
    const lim = H + 1.15;
    const i2 = Math.min(track.n - 2, p2.i);
    const trx = track.rx[i2];
    const trz = track.rz[i2];
    const hitRail = (side: number) => {
      const excess = (Math.abs(p2.lat) - lim) * side;
      nx -= trx * excess;
      nz -= trz * excess;
      const vout = (this.vx * trx + this.vz * trz) * side;
      if (vout > 0) {
        this.vx -= trx * vout * side * 1.25;
        this.vz -= trz * vout * side * 1.25;
        this.vx *= 0.93;
        this.vz *= 0.93;
        this.impact = Math.max(this.impact, Math.min(1, vout / 12));
      }
    };
    if (p2.lat > lim && (world.railR[i2] || world.railR[i2 + 1])) hitRail(1);
    else if (p2.lat < -lim && (world.railL[i2] || world.railL[i2 + 1])) hitRail(-1);

    // --- tree collisions ---
    const cx = Math.floor(nx / TREE_CELL);
    const cz = Math.floor(nz / TREE_CELL);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = world.treeHash.get(tkey(cx + i, cz + j));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k += 3) {
          const dx = nx - arr[k];
          const dz = nz - arr[k + 1];
          const rr = arr[k + 2] + 1.0;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 0.01;
            const nnx = dx / d;
            const nnz = dz / d;
            nx = arr[k] + nnx * rr;
            nz = arr[k + 1] + nnz * rr;
            const vn = this.vx * nnx + this.vz * nnz;
            if (vn < 0) {
              this.vx -= nnx * vn * 1.35;
              this.vz -= nnz * vn * 1.35;
              this.vx *= 0.55;
              this.vz *= 0.55;
              this.yawRate += (Math.random() - 0.5) * Math.min(3, -vn * 0.2);
              this.impact = Math.max(this.impact, Math.min(1, -vn / 10));
            }
          }
        }
      }
    }
    const b = world.bounds;
    nx = Math.min(b.maxX - 20, Math.max(b.minX + 20, nx));
    nz = Math.min(b.maxZ - 20, Math.max(b.minZ + 20, nz));
    this.x = nx;
    this.z = nz;

    // --- height & body attitude ---
    const rx = -Math.cos(this.heading);
    const rz = Math.sin(this.heading);
    const ty = this.heightAt(track, world, nx, nz);
    this.y += (ty - this.y) * Math.min(1, dt * 25);
    if (Math.abs(ty - this.y) > 3) this.y = ty;
    const hl = this.heightAt(track, world, nx - rx * 0.8, nz - rz * 0.8);
    const hr = this.heightAt(track, world, nx + rx * 0.8, nz + rz * 0.8);
    const rs = drift ? this.tune.rollVis : 1; // spring lunak → bodi lebih miring
    const tPitch = -Math.atan2(this.hf - this.hb, 2.4) - THREE.MathUtils.clamp(this.aF, -15, 10) * 0.005 * rs;
    const tRoll =
      Math.atan2(hl - hr, 1.6) +
      rs * (-THREE.MathUtils.clamp(-this.aL, -20, 20) * 0.004 - this.yawRate * vF * 0.0022);
    this.pitch += (tPitch - this.pitch) * Math.min(1, dt * 8);
    this.roll += (tRoll - this.roll) * Math.min(1, dt * 8);

    // --- gearbox (for HUD + audio) ---
    const sp = Math.abs(vF);
    if (this.gear < 5 && sp > GEARS[this.gear] + 1.5) this.gear++;
    if (this.gear > 1 && sp < GEARS[this.gear - 1] - 2) this.gear--;
    const lo = this.gear === 1 ? 0 : GEARS[this.gear - 1] * 0.55;
    const hi = GEARS[this.gear];
    const targetRpm = 1100 + 6900 * THREE.MathUtils.clamp((sp - lo) / (hi - lo), 0, 1.05);
    const slipAngle = Math.atan2(Math.abs(this.vL), Math.max(2, sp));
    const rev = inp.throttle > 0 && (slipAngle > 0.3 || inp.handbrake || this.kickT > 0 || this.rearSlide > 0.85) ? 800 : 0;
    this.rpm += (targetRpm + rev - this.rpm) * Math.min(1, dt * 10);

    this.syncVisual(dt);
  }

  // ===================================================================================
  //  ENGINE LAMA (arcade) — tidak diubah
  // ===================================================================================
  private dynamicsNormal(dt: number, inp: CarInput, track: Track, world: World, grip: number) {
    let fx = Math.sin(this.heading);
    let fz = Math.cos(this.heading);
    let rx = -fz;
    let rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    const speed = Math.abs(vF);
    const throttleResponse = THREE.MathUtils.clamp(this.tune.throttleResponse, 0.5, 1.5);
    const handlingAssist = THREE.MathUtils.clamp(this.tune.handlingAssist, 0, 1);
    const driftResponse = THREE.MathUtils.clamp(this.tune.driftResponse, 0, 1);
    this.thr += (inp.throttle - this.thr) * Math.min(1, dt * 3.6 * throttleResponse);
    const gas = this.thr;

    // --- yaw ---
    // AE86 steering should stay light at speed; the old curve lost too much lock
    // on the downhill straights and made the car feel like a heavy simulator.
    const maxSteer =
      (0.68 - 0.38 * Math.min(1, speed / 42)) *
      (1 + handlingAssist * 0.1);
    const steerAng = this.steerVis * maxSteer;
    this.steerAngle = this.steerVis * 0.55;
    let yawTarget = (-vF * Math.tan(steerAng)) / 2.4;
    const slipAngle = Math.atan2(Math.abs(this.vL), Math.max(2, speed));
    if (inp.handbrake && speed > 3) yawTarget *= 1.5;
    if (gas > 0 && speed > 8 && slipAngle > 0.12) {
      yawTarget *= 1.18 + driftResponse * 0.12; // RWD power oversteer
    }
    yawTarget *= 1 + handlingAssist * 0.08;
    const yawResp = (this.onRoad ? 7 : 4) * (inp.handbrake ? 0.8 : 1);
    this.yawRate += (yawTarget - this.yawRate) * Math.min(1, dt * yawResp);
    this.heading += this.yawRate * dt;

    fx = Math.sin(this.heading);
    fz = Math.cos(this.heading);
    rx = -fz;
    rz = fx;
    vF = this.vx * fx + this.vz * fz;
    let vL = this.vx * rx + this.vz * rz;

    // --- longitudinal ---
    let a = 0;
    const engine =
      7.8 * this.tune.acceleration * Math.max(0, 1 - (vF / TOP) ** 2) * (this.onRoad ? 1 : 0.72);
    if (gas > 0) a += engine * gas;
    if (inp.brake > 0) {
      if (vF > 0.6) a -= 13 * inp.brake * grip;
      else a -= 4.5 * inp.brake * (vF > -9 ? 1 : 0);
    }
    if (inp.handbrake) a -= Math.sign(vF) * 3.5;
    a -= 0.0011 * vF * Math.abs(vF) * (this.onRoad ? 1 : 1.8);
    a -= Math.sign(vF) * (this.onRoad ? 0.25 : 1.6);
    // slope gravity
    this.hf = this.heightAt(track, world, this.x + fx * 1.2, this.z + fz * 1.2);
    this.hb = this.heightAt(track, world, this.x - fx * 1.2, this.z - fz * 1.2);
    const slope = (this.hf - this.hb) / 2.4;
    a -= 9.81 * slope * 0.92;
    if (inp.throttle === 0 && inp.brake === 0 && Math.abs(vF) < 0.3 && Math.abs(slope) < 0.2) {
      vF *= 0.9;
      a = 0;
    }
    const prevVF = vF;
    vF += a * dt;
    this.aF = (vF - prevVF) / Math.max(dt, 1e-4);

    // --- lateral ---
    let latGrip =
      5.6 * grip * (1 + handlingAssist * 0.18) * Math.max(0.65, 1 - (driftResponse - 0.55) * 0.18);
    if (inp.handbrake) latGrip *= 0.28;
    if (slipAngle > 0.22) latGrip *= 0.72;
    const newVL = vL * Math.exp(-latGrip * dt);
    const lost = Math.abs(vL) - Math.abs(newVL);
    if (vF > 2) vF += lost * 0.22;
    this.aL = (newVL - vL) / Math.max(dt, 1e-4);
    vL = newVL;

    this.vx = fx * vF + rx * vL;
    this.vz = fz * vF + rz * vL;
    this.vF = vF;
    this.vL = vL;
    this.rearSlide = 0;
    this.kickT = 0;
    this.boost = 0;
  }

  // ===================================================================================
  //  ENGINE DRIFT — rigid-body 2D + ban Pacejka + friction circle + weight transfer
  //  (+ gyro, expo, ESC turbo, BOV/backfire untuk mode RC)
  // ===================================================================================
  private dynamicsDrift(dt: number, inp: CarInput, track: Track, world: World, surface: number) {
    const T = this.tune;
    const rc = this.driftMode === 'rc';
    const throttleResponse = THREE.MathUtils.clamp(T.throttleResponse, 0.5, 1.5);
    const handlingAssist = THREE.MathUtils.clamp(T.handlingAssist, 0, 1);
    const driftResponse = THREE.MathUtils.clamp(T.driftResponse, 0, 1);
    const driftLimit = T.maxAngle * (0.9 + driftResponse * 0.2);

    // kemiringan jalan (gravitasi) — dihitung sekali per pemanggilan
    const f0x = Math.sin(this.heading);
    const f0z = Math.cos(this.heading);
    this.hf = this.heightAt(track, world, this.x + f0x * 1.2, this.z + f0z * 1.2);
    this.hb = this.heightAt(track, world, this.x - f0x * 1.2, this.z - f0z * 1.2);
    const slope = (this.hf - this.hb) / 2.4;

    // --- inisiasi: clutch kick = angkat gas lalu tekan lagi sambil menyetir di kecepatan cukup ---
    const u0 = this.vx * f0x + this.vz * f0z;
    if (inp.throttle < 0.1) this.liftT = Math.min(1.5, this.liftT + dt);
    else {
      if (this.prevThr < 0.1 && this.liftT > 0.08 && Math.abs(u0) > 9 && Math.abs(this.steerVis) > 0.25) this.kickT = KICK_TIME;
      this.liftT = 0;
    }
    this.prevThr = inp.throttle;

    // --- RC: BOV saat gas dilepas dengan boost tinggi, backfire saat deselerasi di RPM tinggi ---
    if (rc) {
      if (this.prevThrRaw > 0.55 && inp.throttle < 0.15 && this.boost > 0.35) {
        this.fxBov = Math.max(this.fxBov, this.boost);
        this.boost *= 0.2; // tekanan dibuang lewat BOV
      }
      const rpmN0 = clamp((this.rpm - 1100) / 6900, 0, 1.05);
      if (inp.throttle < 0.1 && rpmN0 > 0.5 && Math.abs(u0) > 8 && this.liftT < 2) {
        this.backfireCd -= dt;
        if (this.backfireCd <= 0 && Math.random() < dt * 5) {
          this.fxBackfire++;
          this.backfireCd = 0.15 + Math.random() * 0.25;
        }
      } else this.backfireCd = Math.max(this.backfireCd, 0.05);
    } else this.boost = 0;
    this.prevThrRaw = inp.throttle;

    const n = Math.max(1, Math.ceil(dt / 0.006));
    const h = dt / n;
    let lastFy = 0;
    let lastFx = 0;

    for (let s = 0; s < n; s++) {
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      const rx = -fz;
      const rz = fx;
      const u = this.vx * fx + this.vz * fz; // kecepatan maju
      let v = this.vx * rx + this.vz * rz; // kecepatan samping (+ = kanan)
      let r = this.yawRate; // + = belok kiri
      const au = Math.abs(u);
      const den = Math.max(au, 3.5);
      const sgn = u >= 0 ? 1 : -1;
      const sf = smoothstep(0.3, 4.0, au); // gaya ban membesar bertahap (tidak berputar di tempat)

      // --- gas dihaluskan (keyboard → terasa analog), kick, handbrake ---
      const tgt = inp.throttle;
      this.thr +=
        (tgt - this.thr) *
        Math.min(1, h * (tgt > this.thr ? 4.8 * throttleResponse : 11));
      this.kickT = Math.max(0, this.kickT - h);
      this.hbS += ((inp.handbrake ? 1 : 0) - this.hbS) * Math.min(1, h * 14);

      // --- turbo spool (RC): naik bila gas dalam di RPM menengah-tinggi ---
      if (rc) {
        const rpmN = clamp((this.rpm - 1100) / 6900, 0, 1.05);
        const tgtB = this.thr * smoothstep(0.25, 0.8, rpmN);
        this.boost += (tgtB - this.boost) * Math.min(1, h * (tgtB > this.boost ? 1.6 : 3.2));
      }

      // --- setir: input pemain (expo) + gyro + bantuan counter-steer ---
      const fade = smoothstep(8, 45, au);
      const maxEff = T.maxSteer * (1 - T.speedFade * fade);
      const beta = Math.atan2(v, Math.max(au, 0.5));
      const vfLat = v - CG_FRONT * r; // kecepatan lateral as depan
      const dStar = clamp(Math.atan2(vfLat, Math.max(au, 3)), -maxEff, maxEff); // roda searah gerak = tanpa slip depan
      const counterAssist = clamp(T.counterSteer + handlingAssist * 0.28, 0, 1);
      const w = u > 3 ? counterAssist * smoothstep(0.06, 0.3, Math.abs(beta)) * smoothstep(3, 9, u) : 0;
      const us = Math.sign(this.steerVis) * Math.pow(Math.abs(this.steerVis), T.expo);
      // gyro: membaca yaw rate dan memberi counter-steer proporsional (yaw + = kiri → setir + = kanan)
      const gyroAdd = T.gyro > 0 ? T.gyro * 0.45 * r * smoothstep(2, 8, au) : 0;
      const delta = clamp(us * maxEff * (1 - 0.75 * w) + dStar * w + gyroAdd, -maxEff * 1.05, maxEff * 1.05);
      this.steerAngle = delta;

      // --- perpindahan beban longitudinal (besar: spring lunak; laju: oli damper) ---
      const dN = (MASS * this.axS * CG_HEIGHT * T.wtGain) / WHEELBASE;
      const Nf = clamp((MASS * GRAV * CG_REAR) / WHEELBASE - dN, 0.25 * MASS * GRAV, 0.85 * MASS * GRAV);
      const Nr = clamp((MASS * GRAV * CG_FRONT) / WHEELBASE + dN, 0.25 * MASS * GRAV, 0.85 * MASS * GRAV);

      // --- grip (anti-spin: grip belakang pulih bila sudut melewati batas) ---
      const assist =
        u > 3
          ? 1 +
            (T.angleAssist + handlingAssist * 0.45) *
              1.1 *
              smoothstep(driftLimit, driftLimit + 0.4, Math.abs(beta))
          : 1;
      const muF = T.frontGrip * surface;
      // Respons drift tinggi sedikit mengurangi rear bite agar ekor lebih mudah keluar.
      const rearResponseGrip = 1 - (driftResponse - 0.55) * 0.32;
      const muR = T.rearGrip * rearResponseGrip * surface * assist;
      const capF = muF * Nf;
      const capR = muR * Nr;

      // --- gaya longitudinal (ESC turbo menambah tenaga sebanding boost) ---
      // Beri dorongan awal yang cukup supaya AE86 tidak terasa berat saat keluar hairpin.
      const launch = 0.76 + 0.24 * smoothstep(0, 10, au);
      const Fe =
        MASS *
        7.0 *
        T.power *
        T.acceleration *
        (1 + T.turbo * 0.7 * this.boost) *
        Math.max(0, 1 - (u / TOP) ** 2) *
        (surface < 1 ? 0.75 : 1) *
        launch;
      const kickAdd = T.kick * 0.9 * (this.kickT / KICK_TIME);
      let FxDrive = Fe * (this.thr + kickAdd);
      let FxBrakeF = 0;
      let FxBrakeR = 0;
      if (inp.brake > 0) {
        if (u > 0.6) {
          const Fb = MASS * 13 * inp.brake;
          FxBrakeF = -Fb * 0.62;
          FxBrakeR = -Fb * 0.38;
        } else if (u > -9) FxDrive -= MASS * 4.5 * inp.brake;
      }
      const FxHB = au > 0.5 ? -sgn * 0.85 * capR * this.hbS : 0;
      const FxRc = clamp(FxDrive + FxBrakeR + FxHB, -capR, capR);
      const FxFc = clamp(FxBrakeF, -capF, capF);

      // --- lingkaran gesek: makin besar gaya memanjang, makin kecil sisa grip samping ---
      const qR = capR > 1 ? Math.abs(FxRc) / capR : 0;
      const qF = capF > 1 ? Math.abs(FxFc) / capF : 0;
      const latR = capR * Math.sqrt(Math.max(0.05, 1 - 0.85 * qR * qR)) * (1 - 0.6 * this.hbS);
      const latF = capF * Math.sqrt(Math.max(0.05, 1 - 0.85 * qF * qF));
      this.rearSlide = clamp(qR * 0.6 + Math.abs(Math.atan2(v + CG_REAR * r, den)) / 0.3, 0, 1);

      // --- sudut slip ban & gaya samping ---
      const aF = Math.atan2(vfLat, den) - sgn * delta;
      const aR = Math.atan2(v + CG_REAR * r, den);
      const Fyf = -tireForce(aF, latF, 0.12, 1.3) * sf; // gaya pada roda depan (frame roda)
      const Fyr = -tireForce(aR, latR, 0.14, T.falloff) * sf;
      const cd = Math.cos(delta);
      const sd = Math.sin(delta);

      // --- resultan pada badan ---
      const Fy = Fyf * cd + Fyr;
      const dragAir = MASS * (0.0011 * u * Math.abs(u) * (surface < 1 ? 1.8 : 1) + sgn * (surface < 1 ? 1.6 : 0.25));
      const Fgrav = -MASS * GRAV * slope * 0.92;
      const Fxb = FxRc + FxFc - Fyf * sd - dragAir + Fgrav;
      let torque = -CG_FRONT * Fyf * cd + CG_REAR * Fyr;
      // peredam yaw anti-spin pada sudut ekstrem
      if (u > 3) {
        torque -=
          IZ *
          r *
          (T.angleAssist + handlingAssist * 0.42) *
          5 *
          smoothstep(driftLimit * 0.9, driftLimit * 0.9 + 0.45, Math.abs(beta));
      }

      // --- integrasi ---
      this.vx += (fx * (Fxb / MASS) + rx * (Fy / MASS)) * h;
      this.vz += (fz * (Fxb / MASS) + rz * (Fy / MASS)) * h;
      r += (torque / IZ) * h;

      // kecepatan rendah: arah mengikuti kinematika setir (tidak berputar liar), gerak samping diredam
      const low = 1 - smoothstep(2, 7, au);
      if (low > 0) {
        const rKin = (-u * Math.tan(delta)) / WHEELBASE;
        r += (rKin - r) * Math.min(1, h * 9 * low);
        const kill = 1 - Math.exp(-h * 5 * low);
        const vl = this.vx * rx + this.vz * rz;
        this.vx -= rx * vl * kill;
        this.vz -= rz * vl * kill;
      }
      r = clamp(r, -3.4, 3.4);
      this.yawRate = r;
      this.heading += r * h;
      v = 0;

      this.axS += ((FxRc + FxFc) / MASS - this.axS) * Math.min(1, h * T.wtRate);
      lastFy = Fy;
      lastFx = Fxb;
    }

    // --- keluaran ke sistem lain ---
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    if (!Number.isFinite(this.vx) || !Number.isFinite(this.vz) || !Number.isFinite(this.yawRate)) {
      this.vx = this.vz = this.yawRate = 0;
    }
    this.vF = this.vx * fx + this.vz * fz;
    this.vL = this.vx * -fz + this.vz * fx;
    this.aF = lastFx / MASS;
    this.aL = lastFy / MASS;
  }

  syncVisual(dt: number) {
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.heading;
    this.body.rotation.x = this.pitch;
    this.body.rotation.z = this.roll;
    this.body.position.y = 0.02;
    for (const p of this.frontPivots) p.rotation.y = -this.steerAngle;
    for (const w of this.wheels) w.rotation.x += (this.vF * dt) / 0.3;
    const target = this.lightsOn ? -1.0 : 0;
    this.popupAngle += (target - this.popupAngle) * Math.min(1, dt * 5);
    for (const p of this.popups) p.rotation.x = this.popupAngle;
    for (const l of this.headLights) l.intensity = this.lightsOn ? 90 : 0;
    this.headMat.emissive.set(this.lightsOn ? '#fff1b0' : '#000000');
  }

  rearWheelWorld(out: THREE.Vector3[], track: Track, world: World) {
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const rx = -fz;
    const rz = fx;
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -0.72 : 0.72;
      const x = this.x - fx * 1.2 + rx * side;
      const z = this.z - fz * 1.2 + rz * side;
      out[s].set(x, this.heightAt(track, world, x, z), z);
    }
  }
}
