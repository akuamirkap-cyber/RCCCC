import * as THREE from 'three';
import { softCircleTexture } from './effects';
import type { CarStyle } from './prefs';
import { createBMWCarMesh } from '@/utils/bmwCar';

export interface CarDims {
  halfWidth: number; // wheel x offset
  wheelBase: number; // wheel z offset (± from center)
  wheelRadius: number;
  length: number;
  eyeY: number; // cockpit camera height
  eyeZ: number; // cockpit camera z (positive = forward)
  rearZ: number; // z of the rear bumper
}

export const CAR_DIMS: Record<CarStyle, CarDims> = {
  standard: { halfWidth: 0.98, wheelBase: 1.35, wheelRadius: 0.4, length: 4.2, eyeY: 1.25, eyeZ: -0.35, rearZ: -2.14 },
  toon: { halfWidth: 1.05, wheelBase: 1.0, wheelRadius: 0.5, length: 3.1, eyeY: 1.55, eyeZ: -0.5, rearZ: -1.6 },
};

export interface CarModel {
  style: CarStyle;
  dims: CarDims;
  group: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Group[]; // fl, fr, rl, rr
  frontWheels: THREE.Group[];
  flames: THREE.Mesh[];
  brakeMat: THREE.MeshStandardMaterial;
  brakeGlows: THREE.Sprite[];
  glowMat: THREE.SpriteMaterial;
  /** Windshield, roof and cabin glass — hidden in the cockpit view for an unobstructed look. */
  cockpitHidden: THREE.Object3D[];
  /** Interior (dash, steering wheel, seats) — only shown in the cockpit view; hidden otherwise
   *  so nothing pokes through the BMW GLB shell. */
  cockpitOnly: THREE.Object3D[];
  steeringWheel: THREE.Group;
}

const tireMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.32, metalness: 0.75, envMapIntensity: 1.1 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1f1f24, roughness: 0.8 });
const interiorMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.95 });
const dashMat = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.9 });
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa62b, transparent: true, opacity: 0.9 });

function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  return m;
}

function addWheels(group: THREE.Group, dims: CarDims, width: number): { wheels: THREE.Group[]; front: THREE.Group[] } {
  const wheels: THREE.Group[] = [];
  const front: THREE.Group[] = [];
  const r = dims.wheelRadius;
  const tireGeo = new THREE.CylinderGeometry(r, r, width, 16);
  const rimGeo = new THREE.CylinderGeometry(r * 0.6, r * 0.6, width + 0.02, 8);
  const hubGeo = new THREE.CylinderGeometry(r * 0.22, r * 0.22, width + 0.06, 8);
  const positions: [number, number, boolean][] = [
    [-dims.halfWidth, dims.wheelBase, true],
    [dims.halfWidth, dims.wheelBase, true],
    [-dims.halfWidth, -dims.wheelBase, false],
    [dims.halfWidth, -dims.wheelBase, false],
  ];
  for (const [x, z, isFront] of positions) {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    pivot.rotation.order = 'YXZ';
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(hubGeo, darkMat);
    hub.rotation.z = Math.PI / 2;
    pivot.add(tire, rim, hub);
    group.add(pivot);
    wheels.push(pivot);
    if (isFront) front.push(pivot);
  }
  return { wheels, front };
}

/** Underside of the car: flat dark chassis tray, sills, axles, exhaust — the only non-GLB body part kept visible. */
function addUnderbody(group: THREE.Group, dims: CarDims) {
  const under = new THREE.Group();
  under.name = 'Underbody';
  const r = dims.wheelRadius;
  const w = dims.halfWidth * 2 - 0.32;
  const len = dims.length - 0.5;
  const trayY = r * 0.62;
  const tray = box(w, 0.1, len, darkMat, 0, trayY, 0);
  tray.castShadow = false;
  under.add(tray);
  // side sills
  for (const sx of [-1, 1]) under.add(box(0.16, 0.14, len * 0.55, darkMat, sx * (w / 2 - 0.02), trayY + 0.06, 0, false));
  // axles + diff
  const axleGeo = new THREE.CylinderGeometry(0.05, 0.05, dims.halfWidth * 2 - 0.1, 8);
  for (const z of [dims.wheelBase, -dims.wheelBase]) {
    const axle = new THREE.Mesh(axleGeo, rimMat);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, r, z);
    under.add(axle);
  }
  const diff = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), darkMat);
  diff.position.set(0, r, -dims.wheelBase);
  under.add(diff);
  // drive shaft + exhaust
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, dims.wheelBase * 1.6, 8), rimMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.set(0, r * 0.75, 0);
  under.add(shaft);
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len * 0.55, 8), rimMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.5, r * 0.45, -len * 0.2);
  under.add(exhaust);
  group.add(under);
}

/** Interior visible from the cockpit camera: dash, wheel, seats, pillars. */
function addInterior(parent: THREE.Group, s: { dashY: number; dashZ: number; width: number; wheelZ: number; seatZ: number }): THREE.Group {
  // Everything goes into one `interior` group so the game can toggle it for the cockpit camera
  const body = new THREE.Group();
  body.name = 'Interior';
  body.visible = false;
  parent.add(body);
  body.add(box(s.width, 0.16, 0.55, dashMat, 0, s.dashY, s.dashZ, false));
  body.add(box(s.width, 0.5, 0.12, dashMat, 0, s.dashY - 0.3, s.dashZ + 0.2, false));
  const steering = new THREE.Group();
  steering.position.set(-0.42, s.dashY + 0.02, s.wheelZ);
  steering.rotation.x = -0.35;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 8, 20), darkMat);
  const spokeA = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.03), darkMat);
  const spokeB = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.19, 0.03), darkMat);
  spokeB.position.y = -0.09;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), rimMat);
  hub.rotation.x = Math.PI / 2;
  steering.add(ring, spokeA, spokeB, hub);
  body.add(steering);
  // seats
  for (const sx of [-0.42, 0.42]) {
    body.add(box(0.6, 0.25, 0.6, interiorMat, sx, s.dashY - 0.45, s.seatZ, false));
    body.add(box(0.6, 0.7, 0.18, interiorMat, sx, s.dashY - 0.1, s.seatZ - 0.35, false));
  }
  return steering;
}

export interface CreateCarOptions {
  /** Keep the GLB's original paint/texture (no tint). Used for the player's car. */
  nativePaint?: boolean;
}

export function createCar(color: number, style: CarStyle = 'standard', opts: CreateCarOptions = {}): CarModel {
  const bodyTint = opts.nativePaint ? undefined : color;
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const dims = CAR_DIMS[style];
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x6b0d0d, emissive: 0xff2a2a, emissiveIntensity: 0.45 });
  const glowMat = new THREE.SpriteMaterial({
    map: softCircleTexture(),
    color: 0xff3020,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const brakeGlows: THREE.Sprite[] = [];
  const flames: THREE.Mesh[] = [];
  const cockpitHidden: THREE.Object3D[] = [];
  const cockpitOnly: THREE.Object3D[] = [];
  let steeringWheel: THREE.Group;

  if (style === 'standard') {
    // BMW GLB body shell: exact width (1.95m) and length (4.2m) of standard chassis
    const bmwRig = createBMWCarMesh({
      width: 1.95,
      length: 4.2,
      height: 1.08,
      rotY: 0,
      offsetY: 0.35,
      offsetZ: 0.0,
      color: bodyTint,
      roughness: 0.28,
      metalness: 0.2,
      mode: 'ebisu',
    });
    body.add(bmwRig.group);
    cockpitHidden.push(bmwRig.mesh);
    steeringWheel = addInterior(body, { dashY: 0.98, dashZ: 0.52, width: 1.5, wheelZ: 0.25, seatZ: -0.35 });
    cockpitOnly.push(steeringWheel.parent!);
    // Body kotak prosedural (lampu depan/belakang, glow) DIHILANGKAN — hanya shell BMW GLB,
    // roda dan bagian bawah mobil yang tampil.
    for (const sx of [-0.5, 0.5]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), flameMat);
      f.rotation.x = Math.PI / 2;
      f.position.set(sx, 0.42, -2.55);
      f.visible = false;
      body.add(f);
      flames.push(f);
    }
  } else {
    // ---- TOON: short, tall, chunky BMW GLB ----
    const bmwRig = createBMWCarMesh({
      width: 2.06,
      length: 3.1,
      height: 1.25,
      rotY: 0,
      offsetY: 0.42,
      offsetZ: 0.0,
      color: bodyTint,
      roughness: 0.28,
      metalness: 0.2,
      mode: 'ebisu',
    });
    body.add(bmwRig.group);
    cockpitHidden.push(bmwRig.mesh);
    steeringWheel = addInterior(body, { dashY: 1.25, dashZ: 0.3, width: 1.6, wheelZ: 0.05, seatZ: -0.45 });
    cockpitOnly.push(steeringWheel.parent!);
    // (lampu kotak prosedural dihilangkan — hanya GLB + roda + bawah mobil)
    // exhaust flames
    for (const sx of [-0.45, 0.45]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 6), flameMat);
      f.rotation.x = Math.PI / 2;
      f.position.set(sx, 0.5, -2.05);
      f.visible = false;
      body.add(f);
      flames.push(f);
    }
  }

  const { wheels, front } = addWheels(group, dims, style === 'toon' ? 0.46 : 0.32);
  addUnderbody(group, dims);
  return { style, dims, group, body, wheels, frontWheels: front, flames, brakeMat, brakeGlows, glowMat, cockpitHidden, cockpitOnly, steeringWheel };
}

/** Lights up the tail lights (emissive + additive glow) while braking / using the handbrake. */
export function setBrakeLights(model: CarModel, on: boolean, time: number) {
  model.brakeMat.emissiveIntensity = on ? 5 : 0.45;
  // Hanya emissive pada lampu rem (tanpa sprite lingkaran glow)
  model.glowMat.opacity = 0;
  for (const g of model.brakeGlows) g.visible = false;
  void time;
}

/** Removes a car model from the scene and frees its GPU resources. */
export function disposeCar(model: CarModel) {
  model.group.parent?.remove(model.group);
  model.group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}
