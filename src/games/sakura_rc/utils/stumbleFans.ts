import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/* ============================================================
   STUMBLE GUYS-STYLE FANS (statis, untuk tribun aula)
   Kepala kubus-bulat besar (lebih besar dari badan), 2 titik mata vertikal,
   tanpa mulut, badan pendek gempal, kaki pendek + sepatu, tangan bulat,
   outfit acak: topi cap hijau, bucket hat + kacamata di atas, rambut jambul + kacamata.
   ============================================================ */

export interface FanSeat {
  x: number;
  y: number;
  z: number;
  yaw: number;
  sc?: number;
}

export function buildStaticStumbleFans(seats: FanSeat[], rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const N = seats.length;
  if (!N) return group;

  const col = (arr: string[]) => arr.map((c) => new THREE.Color(c));
  const shirts = col(['#EF4444', '#F97316', '#FACC15', '#22C55E', '#06B6D4', '#3B82F6', '#A855F7', '#EC4899', '#F8FAFC', '#59c3f0', '#ff3d7f', '#9ef01a']);
  const pants = col(['#2f80ff', '#1d4ed8', '#f2a541', '#ffffff', '#3b3b46', '#5dade2', '#c0392b']);
  const shoesC = col(['#1a1a1f', '#2b2b33', '#c62828', '#ffffff']);
  const skins = col(['#f6c9a0', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']);
  const hats = col(['#5cb85c', '#43a047', '#ff6f3c', '#2f80ff', '#ffd166', '#e63946', '#ffffff']);
  const hairs = col(['#1b1b1f', '#3a2418', '#6b3e26', '#111118']);
  const white = new THREE.Color('#f7f7f7');
  const dark = new THREE.Color('#15151a');

  const headGeo = new RoundedBoxGeometry(0.54, 0.5, 0.5, 4, 0.19);
  const torsoGeo = new RoundedBoxGeometry(0.46, 0.4, 0.36, 3, 0.13);
  const eyeGeo = new RoundedBoxGeometry(0.055, 0.12, 0.04, 2, 0.02);
  const armGeo = new THREE.CapsuleGeometry(0.07, 0.17, 2, 7);
  const handGeo = new THREE.SphereGeometry(0.08, 8, 6);
  const legGeo = new THREE.CapsuleGeometry(0.085, 0.1, 2, 7);
  const shoeGeo = new RoundedBoxGeometry(0.17, 0.11, 0.27, 2, 0.045);
  const capDomeGeo = new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  capDomeGeo.scale(1, 0.62, 1);
  const capVisorGeo = new RoundedBoxGeometry(0.32, 0.04, 0.24, 2, 0.015);
  const bucketTopGeo = new THREE.CylinderGeometry(0.26, 0.31, 0.2, 14);
  const bucketBrimGeo = new THREE.CylinderGeometry(0.38, 0.4, 0.035, 16);
  const glassesGeo = new RoundedBoxGeometry(0.44, 0.1, 0.05, 2, 0.02);
  const pompGeo = new RoundedBoxGeometry(0.5, 0.2, 0.46, 3, 0.07);

  const mat = (rough = 0.7, color?: THREE.Color) =>
    new THREE.MeshStandardMaterial({ roughness: rough, metalness: 0, color: color ?? 0xffffff });

  const outfit = new Uint8Array(N);
  let nCap = 0;
  let nBucket = 0;
  let nPomp = 0;
  for (let i = 0; i < N; i++) {
    const v = rng();
    outfit[i] = v < 0.3 ? 0 : v < 0.56 ? 1 : v < 0.78 ? 2 : 3;
    if (outfit[i] === 1) nCap++;
    else if (outfit[i] === 2) nBucket++;
    else if (outfit[i] === 3) nPomp++;
  }

  const heads = new THREE.InstancedMesh(headGeo, mat(0.6), N);
  const torsos = new THREE.InstancedMesh(torsoGeo, mat(), N);
  const eyes = new THREE.InstancedMesh(eyeGeo, mat(0.35, dark), N * 2);
  const arms = new THREE.InstancedMesh(armGeo, mat(), N * 2);
  const hands = new THREE.InstancedMesh(handGeo, mat(0.6), N * 2);
  const legs = new THREE.InstancedMesh(legGeo, mat(), N * 2);
  const shoes = new THREE.InstancedMesh(shoeGeo, mat(0.5), N * 2);
  const capDomes = new THREE.InstancedMesh(capDomeGeo, mat(), Math.max(1, nCap));
  const capVisors = new THREE.InstancedMesh(capVisorGeo, mat(), Math.max(1, nCap));
  const bucketTops = new THREE.InstancedMesh(bucketTopGeo, mat(0.85), Math.max(1, nBucket));
  const bucketBrims = new THREE.InstancedMesh(bucketBrimGeo, mat(0.85), Math.max(1, nBucket));
  const bucketShades = new THREE.InstancedMesh(glassesGeo, mat(0.25, dark), Math.max(1, nBucket));
  const pomps = new THREE.InstancedMesh(pompGeo, mat(0.55), Math.max(1, nPomp));
  const faceShades = new THREE.InstancedMesh(glassesGeo, mat(0.25, dark), Math.max(1, nPomp));
  capDomes.count = capVisors.count = nCap;
  bucketTops.count = bucketBrims.count = bucketShades.count = nBucket;
  pomps.count = faceShades.count = nPomp;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qExtra = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const place = (
    mesh: THREE.InstancedMesh,
    k: number,
    seat: FanSeat,
    fwd: number,
    side: number,
    y: number,
    extra?: THREE.Quaternion
  ) => {
    const s = seat.sc ?? 1;
    const a = seat.yaw;
    const fx = Math.sin(a);
    const fz = Math.cos(a);
    const rx = Math.cos(a);
    const rz = -Math.sin(a);
    q.setFromAxisAngle(UP, a);
    if (extra) q.multiply(extra);
    p.set(seat.x + (fx * fwd + rx * side) * s, seat.y + y * s, seat.z + (fz * fwd + rz * side) * s);
    m4.compose(p, q, sc.set(s, s, s));
    mesh.setMatrixAt(k, m4);
  };

  const legTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.08);
  let kCap = 0;
  let kBucket = 0;
  let kPomp = 0;
  seats.forEach((seat, i) => {
    const shirt = shirts[Math.floor(rng() * shirts.length)];
    const skin = skins[Math.floor(rng() * skins.length)];
    const pant = pants[Math.floor(rng() * pants.length)];
    const shoe = shoesC[Math.floor(rng() * shoesC.length)];
    const cheer = rng() < 0.3; // tangan ke atas
    for (const side of [-1, 1]) {
      const k = i * 2 + (side + 1) / 2;
      place(legs, k, seat, side * 0.03, side * 0.115, 0.21, legTilt);
      legs.setColorAt(k, pant);
      place(shoes, k, seat, side * 0.03 + 0.03, side * 0.115, 0.055);
      shoes.setColorAt(k, shoe);
      // lengan: menggantung di samping, atau terangkat ke atas (bersorak)
      if (cheer) {
        qExtra.setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * -0.35);
        place(arms, k, seat, 0.02, side * 0.33, 0.8, qExtra);
        place(hands, k, seat, 0.02, side * 0.38, 0.98);
      } else {
        qExtra.setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * 0.12);
        place(arms, k, seat, 0.02, side * 0.29, 0.48, qExtra);
        place(hands, k, seat, 0.02, side * 0.31, 0.3);
      }
      arms.setColorAt(k, shirt);
      hands.setColorAt(k, skin);
      place(eyes, k, seat, 0.245, side * 0.095, 1.0);
    }
    place(torsos, i, seat, 0, 0, 0.52);
    torsos.setColorAt(i, shirt);
    place(heads, i, seat, 0, 0, 0.98);
    heads.setColorAt(i, skin);

    if (outfit[i] === 1) {
      const hc = hats[Math.floor(rng() * hats.length)];
      place(capDomes, kCap, seat, -0.01, 0, 1.19);
      capDomes.setColorAt(kCap, hc);
      place(capVisors, kCap, seat, 0.3, 0, 1.2);
      capVisors.setColorAt(kCap, hc);
      kCap++;
    } else if (outfit[i] === 2) {
      const hc = rng() < 0.6 ? white : hats[Math.floor(rng() * hats.length)];
      place(bucketTops, kBucket, seat, 0, 0, 1.3);
      bucketTops.setColorAt(kBucket, hc);
      place(bucketBrims, kBucket, seat, 0, 0, 1.21);
      bucketBrims.setColorAt(kBucket, hc);
      place(bucketShades, kBucket, seat, 0.22, 0, 1.33);
      kBucket++;
    } else if (outfit[i] === 3) {
      pomps.setColorAt(kPomp, hairs[Math.floor(rng() * hairs.length)]);
      place(pomps, kPomp, seat, 0.04, 0, 1.3);
      place(faceShades, kPomp, seat, 0.255, 0, 1.01);
      kPomp++;
    }
  });

  const all = [heads, torsos, eyes, arms, hands, legs, shoes, capDomes, capVisors, bucketTops, bucketBrims, bucketShades, pomps, faceShades];
  for (const im of all) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
  }
  heads.castShadow = torsos.castShadow = true;
  group.add(...all);
  return group;
}
