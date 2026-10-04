import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { softCircleTexture } from './effects';
import type { CarStyle } from './prefs';
import { createBMWCarMesh, loadBMWAdjustment } from '@/utils/bmwCar';

export interface CarDims {
  halfWidth: number; // wheel x offset
  wheelBase: number; // wheel z offset (± from center)
  wheelRadius: number;
  length: number;
  eyeY: number; // cockpit camera height
  eyeZ: number; // cockpit camera z (positive = forward)
  rearZ: number; // z of the rear bumper
  tyreWidth?: number; // visual tyre width (defaults per style)
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

/* ------------------------------------------------------------------ */
/*  Wheels — CarX-style detail: treaded tyre with branded sidewall,     */
/*  deep-dish 6-spoke forged rim, lip, lug nuts, brake rotor + caliper   */
/* ------------------------------------------------------------------ */

let treadTex: THREE.CanvasTexture | null = null;
let sidewallTex: THREE.CanvasTexture | null = null;

/** Tread: three circumferential grooves + angled sipes (u = around the tyre, v = across the width). */
function getTreadTexture(): THREE.CanvasTexture {
  if (treadTex) return treadTex;
  const W = 256;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1b1c1e';
  ctx.fillRect(0, 0, W, H);
  // fine rubber grain
  for (let i = 0; i < 2600; i++) {
    const v = 20 + Math.random() * 18;
    ctx.fillStyle = `rgb(${v},${v},${v + 1})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 1);
  }
  // circumferential grooves (constant v)
  ctx.fillStyle = '#0a0a0b';
  for (const y of [0.3, 0.5, 0.7]) ctx.fillRect(0, y * H - 4, W, 8);
  // shoulder blocks: angled sipes
  ctx.strokeStyle = '#0c0c0d';
  ctx.lineWidth = 4;
  for (let x = 0; x < W; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 14, H * 0.28);
    ctx.moveTo(x + 16, H * 0.72);
    ctx.lineTo(x + 30, H);
    ctx.stroke();
  }
  // subtle highlight edge on each block for a moulded look
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x + 4, 0);
    ctx.lineTo(x + 18, H * 0.28);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  treadTex = tex;
  return tex;
}

/** Sidewall: rubber disc with moulded rim-protector ring and brand lettering around the bead. */
function getSidewallTexture(): THREE.CanvasTexture {
  if (sidewallTex) return sidewallTex;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const cx = S / 2;
  ctx.fillStyle = '#1a1b1d';
  ctx.fillRect(0, 0, S, S);
  // tread shoulder shading at the very edge
  const g = ctx.createRadialGradient(cx, cx, S * 0.42, cx, cx, S * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // raised rim-protector rings
  ctx.strokeStyle = '#242527';
  ctx.lineWidth = 6;
  for (const rr of [0.455, 0.36]) {
    ctx.beginPath();
    ctx.arc(cx, cx, S * rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#111214';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cx, S * 0.445, 0, Math.PI * 2);
  ctx.stroke();
  // brand lettering along the sidewall (twice, opposite sides) + white-letter accent
  const word = 'TOYO TIRES  PROXES R888R  ';
  ctx.font = 'bold 30px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const radius = S * 0.405;
  const total = word.length * 2;
  for (let i = 0; i < total; i++) {
    const ch = word[i % word.length];
    const a = (i / total) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * radius, cx + Math.sin(a) * radius);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = i % word.length < 10 ? '#e8e8e6' : '#3a3b3e'; // "TOYO TIRES" in white letters, rest moulded grey
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  sidewallTex = tex;
  return tex;
}

const rimSilverMat = new THREE.MeshStandardMaterial({ color: 0xdfe1e4, roughness: 0.22, metalness: 0.9, envMapIntensity: 1.3, side: THREE.DoubleSide });
const rimDarkMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2f, roughness: 0.45, metalness: 0.8, side: THREE.DoubleSide });
const rotorMat = new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.4, metalness: 0.95 });
const caliperMat = new THREE.MeshStandardMaterial({ color: 0xd4172a, roughness: 0.35, metalness: 0.3, emissive: 0x3a0308, emissiveIntensity: 0.4 });

const rimGeoCache = new Map<string, { silver: THREE.BufferGeometry; dark: THREE.BufferGeometry }>();

/**
 * Forged 6-spoke rim in cylinder-local space (axis = +Y, outer face at +w/2).
 * Deep dish: the spoke plate sits ~35 % of the width inside the barrel, spokes are concave.
 */
function getRimGeometry(r: number, w: number) {
  const key = `${r.toFixed(3)}:${w.toFixed(3)}`;
  const hit = rimGeoCache.get(key);
  if (hit) return hit;
  const silver: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const push = (arr: THREE.BufferGeometry[], g: THREE.BufferGeometry, mat?: THREE.Matrix4) => {
    const ng = g.toNonIndexed();
    if (mat) ng.applyMatrix4(mat);
    arr.push(ng);
    g.dispose();
  };
  const R = r * 0.64; // rim outer radius (bead seat)
  // barrel (open tube, visible from both sides through the spokes)
  push(silver, new THREE.CylinderGeometry(R, R, w * 0.96, 28, 1, true));
  // outer lip ring + inner bead ring
  push(silver, new THREE.TorusGeometry(R - r * 0.02, r * 0.03, 8, 36), m.makeRotationX(Math.PI / 2).setPosition(0, w * 0.48, 0));
  push(silver, new THREE.TorusGeometry(R - r * 0.02, r * 0.025, 6, 36), m.makeRotationX(Math.PI / 2).setPosition(0, -w * 0.48, 0));
  // polished step ring just inside the lip (the "dish" edge)
  push(silver, new THREE.CylinderGeometry(R - r * 0.03, R - r * 0.03, w * 0.08, 28, 1, true), m.identity().setPosition(0, w * 0.4, 0));
  // 6 concave spokes
  const yIn = w * 0.02; // hub face depth
  const yOut = w * 0.36; // spoke outer end (near the lip)
  const rIn = r * 0.15;
  const rOut = R - r * 0.03;
  const len = Math.hypot(rOut - rIn, yOut - yIn);
  const tilt = Math.atan2(yOut - yIn, rOut - rIn);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const spoke = new THREE.BoxGeometry(len, w * 0.16, r * 0.12);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt));
    const rc = (rIn + rOut) / 2;
    const pos = new THREE.Vector3(Math.cos(a) * rc, (yIn + yOut) / 2, Math.sin(a) * rc);
    push(silver, spoke, new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)));
  }
  // hub plate + centre cap
  push(silver, new THREE.CylinderGeometry(r * 0.2, r * 0.2, w * 0.1, 18), m.identity().setPosition(0, yIn + w * 0.02, 0));
  push(dark, new THREE.CylinderGeometry(r * 0.07, r * 0.07, w * 0.12, 12), m.identity().setPosition(0, yIn + w * 0.06, 0));
  // 5 lug nuts
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    push(dark, new THREE.CylinderGeometry(r * 0.025, r * 0.025, w * 0.14, 6), m.identity().setPosition(Math.cos(a) * r * 0.125, yIn + w * 0.06, Math.sin(a) * r * 0.125));
  }
  const out = { silver: mergeGeometries(silver)!, dark: mergeGeometries(dark)! };
  for (const g of [...silver, ...dark]) g.dispose();
  rimGeoCache.set(key, out);
  return out;
}

function addWheels(group: THREE.Group, dims: CarDims, width: number): { wheels: THREE.Group[]; front: THREE.Group[] } {
  const wheels: THREE.Group[] = [];
  const front: THREE.Group[] = [];
  const r = dims.wheelRadius;
  const w = width;
  // tyre: tread on the side wall of the cylinder, branded sidewall on both caps
  const tireGeo = new THREE.CylinderGeometry(r, r, w, 32, 1, false);
  const treadMat = new THREE.MeshStandardMaterial({ map: getTreadTexture(), color: 0xffffff, roughness: 0.92, metalness: 0 });
  const wallMat = new THREE.MeshStandardMaterial({ map: getSidewallTexture(), color: 0xffffff, roughness: 0.85, metalness: 0 });
  const tireMats = [treadMat, wallMat, wallMat];
  // rounded shoulders so the tyre is not a sharp-edged drum
  const shoulderGeo = new THREE.TorusGeometry(r - r * 0.05, r * 0.05, 8, 32);
  const rim = getRimGeometry(r, w);
  const rotorGeo = new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.025, 28);
  const rotorHatGeo = new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.05, 16);
  const caliperGeo = new THREE.BoxGeometry(w * 0.42, r * 0.32, r * 0.22);
  const positions: [number, number, boolean][] = [
    [-dims.halfWidth, dims.wheelBase, true],
    [dims.halfWidth, dims.wheelBase, true],
    [-dims.halfWidth, -dims.wheelBase, false],
    [dims.halfWidth, -dims.wheelBase, false],
  ];
  for (const [x, z, isFront] of positions) {
    const side = x < 0 ? 1 : -1; // outer face of the wheel points away from the car
    const pivot = new THREE.Group(); // steers (rotation.y)
    pivot.position.set(x, r, z);
    pivot.rotation.order = 'YXZ';
    const spin = new THREE.Group(); // rolls (rotation.x)
    const face = new THREE.Group(); // cylinder-local → car-local (axis Y → ±X)
    face.rotation.z = (Math.PI / 2) * side;
    const tire = new THREE.Mesh(tireGeo, tireMats);
    tire.castShadow = true;
    const shoulderA = new THREE.Mesh(shoulderGeo, treadMat);
    shoulderA.rotation.x = Math.PI / 2;
    shoulderA.position.y = w / 2 - r * 0.03;
    const shoulderB = shoulderA.clone();
    shoulderB.position.y = -w / 2 + r * 0.03;
    const rimSilver = new THREE.Mesh(rim.silver, rimSilverMat);
    rimSilver.castShadow = true;
    const rimDark = new THREE.Mesh(rim.dark, rimDarkMat);
    face.add(tire, shoulderA, shoulderB, rimSilver, rimDark);
    spin.add(face);
    // brake rotor + caliper: steer with the hub but do not spin
    const brake = new THREE.Group();
    brake.rotation.z = (Math.PI / 2) * side;
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.position.y = -w * 0.3;
    const hat = new THREE.Mesh(rotorHatGeo, rimDarkMat);
    hat.position.y = -w * 0.3;
    brake.add(rotor, hat);
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(side * w * 0.22, r * 0.12, isFront ? -r * 0.42 : r * 0.42); // inboard, trailing the hub
    pivot.add(spin, brake, caliper);
    group.add(pivot);
    wheels.push(spin);
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

/**
 * Wheel/stance dimensions for the BMW GLB follow the user's Ebisu body tune (length / width),
 * so the wheels sit flush with the (wide-body) fenders instead of being buried inside the shell.
 */
function standardDimsFromTune(): CarDims {
  const base = CAR_DIMS.standard;
  const adj = loadBMWAdjustment('ebisu');
  const width = THREE.MathUtils.clamp(adj.width, 1.5, 3.6);
  const length = THREE.MathUtils.clamp(adj.length, 3.2, 7.6);
  const tyreW = THREE.MathUtils.clamp(0.3 + (width - 1.95) * 0.18, 0.32, 0.46);
  return {
    ...base,
    tyreWidth: tyreW,
    halfWidth: width / 2 - tyreW / 2 + 0.04, // tyre face pokes 4 cm past the fender — wide-body stance
    wheelBase: length * 0.32,
    wheelRadius: THREE.MathUtils.clamp(0.4 * (length / 4.2), 0.38, 0.5),
    length,
    rearZ: -length / 2 - 0.04,
  };
}

export function createCar(color: number, style: CarStyle = 'standard', opts: CreateCarOptions = {}): CarModel {
  const bodyTint = opts.nativePaint ? undefined : color;
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const dims = style === 'standard' ? standardDimsFromTune() : CAR_DIMS[style];
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

  const { wheels, front } = addWheels(group, dims, dims.tyreWidth ?? (style === 'toon' ? 0.46 : 0.36));
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
