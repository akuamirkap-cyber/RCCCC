import * as THREE from 'three';
import { softCircleTexture } from './effects';
import type { CarStyle } from './prefs';

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
  steeringWheel: THREE.Group;
}

const tireMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.32, metalness: 0.75, envMapIntensity: 1.1 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.06, metalness: 0.9, envMapIntensity: 1.6 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xfff2a8, emissiveIntensity: 1.6 });
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

/** Interior visible from the cockpit camera: dash, wheel, seats, pillars. */
function addInterior(body: THREE.Group, s: { dashY: number; dashZ: number; width: number; wheelZ: number; seatZ: number }): THREE.Group {
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

export function createCar(color: number, style: CarStyle = 'standard'): CarModel {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const dims = CAR_DIMS[style];
  const paint = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.28,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.4,
  });
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
  let steeringWheel: THREE.Group;

  if (style === 'standard') {
    // chassis (front = +z)
    body.add(box(1.9, 0.5, 4.2, paint, 0, 0.62, 0));
    body.add(box(1.95, 0.22, 4.3, darkMat, 0, 0.36, 0));
    body.add(box(1.7, 0.16, 0.9, paint, 0, 0.95, 1.45)); // hood
    body.add(box(2.0, 0.26, 0.35, darkMat, 0, 0.42, 2.1)); // splitter
    body.add(box(2.0, 0.26, 0.3, darkMat, 0, 0.42, -2.12)); // diffuser
    // cabin: separate windshield, side/rear glass, roof
    const windshield = box(1.56, 0.5, 0.06, glassMat, 0, 1.1, 0.72, false);
    windshield.rotation.x = -0.35;
    const glass = box(1.6, 0.5, 1.6, glassMat, 0, 1.1, -0.4); // side + rear glass block
    const roof = box(1.5, 0.08, 1.7, paint, 0, 1.38, -0.2);
    body.add(windshield, glass, roof);
    cockpitHidden.push(windshield, glass, roof);
    body.add(box(0.08, 0.5, 0.1, paint, -0.78, 1.1, 0.6)); // A pillars
    body.add(box(0.08, 0.5, 0.1, paint, 0.78, 1.1, 0.6));
    steeringWheel = addInterior(body, { dashY: 0.98, dashZ: 0.52, width: 1.5, wheelZ: 0.25, seatZ: -0.35 });
    // spoiler
    body.add(box(0.1, 0.36, 0.12, darkMat, 0.7, 0.98, -1.95));
    body.add(box(0.1, 0.36, 0.12, darkMat, -0.7, 0.98, -1.95));
    body.add(box(2.0, 0.08, 0.55, paint, 0, 1.18, -2.0));
    // lights
    body.add(box(0.45, 0.16, 0.08, headMat, 0.62, 0.72, 2.13, false));
    body.add(box(0.45, 0.16, 0.08, headMat, -0.62, 0.72, 2.13, false));
    body.add(box(0.62, 0.22, 0.1, brakeMat, 0.6, 0.74, -2.14, false));
    body.add(box(0.62, 0.22, 0.1, brakeMat, -0.6, 0.74, -2.14, false));
    body.add(box(0.6, 0.07, 0.08, brakeMat, 0, 0.74, -2.13, false));
    body.add(box(0.5, 0.06, 0.06, brakeMat, 0, 1.22, -2.26, false));
    for (const sx of [-0.6, 0.6]) {
      const g = new THREE.Sprite(glowMat);
      g.position.set(sx, 0.74, -2.3);
      g.scale.set(1.3, 0.8, 1);
      g.visible = false;
      body.add(g);
      brakeGlows.push(g);
    }
    for (const sx of [-0.5, 0.5]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), flameMat);
      f.rotation.x = Math.PI / 2;
      f.position.set(sx, 0.42, -2.55);
      f.visible = false;
      body.add(f);
      flames.push(f);
    }
  } else {
    // ---- TOON: short, tall, chunky ----
    const bodyGeo = new THREE.BoxGeometry(2.0, 0.8, 3.0, 2, 2, 2);
    const main = new THREE.Mesh(bodyGeo, paint);
    main.position.set(0, 0.85, 0);
    main.castShadow = true;
    body.add(main);
    body.add(box(2.06, 0.3, 3.06, darkMat, 0, 0.5, 0)); // chunky sills / bumpers
    body.add(box(2.14, 0.36, 0.4, darkMat, 0, 0.55, 1.45)); // front bumper
    body.add(box(2.14, 0.36, 0.4, darkMat, 0, 0.55, -1.45)); // rear bumper
    body.add(box(1.7, 0.12, 0.9, paint, 0, 1.3, 0.95)); // hood bulge
    body.add(box(0.5, 0.16, 0.5, darkMat, -0.45, 1.36, 1.05, false)); // hood scoop
    // big cabin
    const windshield = box(1.66, 0.75, 0.06, glassMat, 0, 1.68, 0.5, false);
    windshield.rotation.x = -0.28;
    const glass = box(1.7, 0.75, 1.35, glassMat, 0, 1.68, -0.35); // side + rear glass
    const roof = box(1.8, 0.14, 1.75, paint, 0, 2.1, -0.15);
    body.add(windshield, glass, roof);
    cockpitHidden.push(windshield, glass, roof);
    body.add(box(0.1, 0.75, 0.12, paint, -0.84, 1.68, 0.38)); // A pillars
    body.add(box(0.1, 0.75, 0.12, paint, 0.84, 1.68, 0.38));
    steeringWheel = addInterior(body, { dashY: 1.25, dashZ: 0.3, width: 1.6, wheelZ: 0.05, seatZ: -0.45 });
    // stubby spoiler + roof rack light
    body.add(box(0.12, 0.3, 0.14, darkMat, 0.75, 1.4, -1.3));
    body.add(box(0.12, 0.3, 0.14, darkMat, -0.75, 1.4, -1.3));
    body.add(box(2.1, 0.1, 0.5, paint, 0, 1.58, -1.38));
    // big round headlights
    const eyeGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.1, 14);
    for (const sx of [-0.6, 0.6]) {
      const eye = new THREE.Mesh(eyeGeo, headMat);
      eye.rotation.x = Math.PI / 2;
      eye.position.set(sx, 1.0, 1.52);
      body.add(eye);
    }
    // tail lights
    body.add(box(0.5, 0.3, 0.1, brakeMat, 0.65, 1.0, -1.52, false));
    body.add(box(0.5, 0.3, 0.1, brakeMat, -0.65, 1.0, -1.52, false));
    body.add(box(0.7, 0.08, 0.08, brakeMat, 0, 1.0, -1.52, false));
    body.add(box(0.6, 0.07, 0.07, brakeMat, 0, 1.62, -1.64, false));
    for (const sx of [-0.65, 0.65]) {
      const g = new THREE.Sprite(glowMat);
      g.position.set(sx, 1.0, -1.7);
      g.scale.set(1.3, 0.9, 1);
      g.visible = false;
      body.add(g);
      brakeGlows.push(g);
    }
    // exhaust flames
    for (const sx of [-0.45, 0.45]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 8), rimMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(sx, 0.5, -1.62);
      body.add(pipe);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 6), flameMat);
      f.rotation.x = Math.PI / 2;
      f.position.set(sx, 0.5, -2.05);
      f.visible = false;
      body.add(f);
      flames.push(f);
    }
  }

  const { wheels, front } = addWheels(group, dims, style === 'toon' ? 0.46 : 0.32);
  return { style, dims, group, body, wheels, frontWheels: front, flames, brakeMat, brakeGlows, glowMat, cockpitHidden, steeringWheel };
}

/** Lights up the tail lights (emissive + additive glow) while braking / using the handbrake. */
export function setBrakeLights(model: CarModel, on: boolean, time: number) {
  model.brakeMat.emissiveIntensity = on ? 5 : 0.45;
  const glow = on ? 0.8 + Math.sin(time * 28) * 0.12 : 0;
  model.glowMat.opacity = glow;
  for (const g of model.brakeGlows) {
    g.visible = on;
    if (on) {
      const s = 1.25 + Math.sin(time * 22) * 0.12;
      g.scale.set(s * 1.1, s * 0.7, 1);
    }
  }
}

/** Removes a car model from the scene and frees its GPU resources. */
export function disposeCar(model: CarModel) {
  model.group.parent?.remove(model.group);
  model.group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}
