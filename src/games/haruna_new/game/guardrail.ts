import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Track } from './track';

/**
 * Perlengkapan jalan khas TOUGE Jepang:
 *  1. Guardrail baja W-beam putih (profil bergelombang) di atas tiang pipa bulat tiap 2 m,
 *     dengan ujung yang melandai ke tanah dan reflektor amber tiap 4 m.
 *  2. Guide-post (ガイドポスト) putih berkepala oranye tiap ±18 m di sisi tebing yang tak berpagar.
 *  3. Cermin tikungan (カーブミラー) oranye di sisi luar hairpin & tikungan tajam.
 */

export interface Guardrails {
  group: THREE.Group;
  railL: Uint8Array;
  railR: Uint8Array;
}

// Profil W-beam: [geser ke arah jalan (m, negatif = menonjol ke jalan), tinggi (m)]
const W_PROFILE: [number, number][] = [
  [0.0, 0.46],
  [-0.05, 0.505],
  [-0.05, 0.56],
  [0.0, 0.615],
  [-0.05, 0.67],
  [-0.05, 0.725],
  [0.0, 0.77],
];

function colored(g: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export function buildGuardrails(
  track: Track,
  terrainHeight: (x: number, z: number) => number,
  upSide: Int8Array,
  H: number,
  BW: number
): Guardrails {
  const n = track.n;
  const group = new THREE.Group();
  const railL = new Uint8Array(n);
  const railR = new Uint8Array(n);

  // ---- di mana pagar dipasang ------------------------------------------------
  for (let i = 0; i < n; i++) {
    const k = track.curv[i];
    const y = track.y[i];
    // sisi jurang selalu berpagar
    if (upSide[i] < 0) railR[i] = 1;
    else railL[i] = 1;
    // sisi luar tikungan tajam
    if (Math.abs(k) > 1 / 95) {
      if (k > 0) railR[i] = 1;
      else railL[i] = 1;
    }
    // sisi mana pun yang tanahnya turun curam
    const far = H + BW + 6;
    if (terrainHeight(track.x[i] - track.rx[i] * far, track.z[i] - track.rz[i] * far) < y - 4) railL[i] = 1;
    if (terrainHeight(track.x[i] + track.rx[i] * far, track.z[i] + track.rz[i] * far) < y - 4) railR[i] = 1;
    if (i < 14 || i > n - 14) {
      railL[i] = 0;
      railR[i] = 0;
    }
  }
  const cleanRuns = (arr: Uint8Array) => {
    let last = -100;
    for (let i = 0; i < n; i++) {
      if (arr[i]) {
        if (i - last > 1 && i - last < 7) for (let k = last; k < i; k++) arr[k] = 1; // tambal celah
        last = i;
      }
    }
    let s = -1;
    for (let i = 0; i <= n; i++) {
      if (i < n && arr[i]) {
        if (s < 0) s = i;
      } else if (s >= 0) {
        if (i - s < 6) for (let k = s; k < i; k++) arr[k] = 0; // buang potongan pendek
        s = -1;
      }
    }
  };
  cleanRuns(railL);
  cleanRuns(railR);

  const runsOf = (arr: Uint8Array) => {
    const runs: [number, number][] = [];
    let s = -1;
    for (let i = 0; i <= n; i++) {
      if (i < n && arr[i]) {
        if (s < 0) s = i;
      } else if (s >= 0) {
        runs.push([s, i - 1]);
        s = -1;
      }
    }
    return runs;
  };

  const groundAt = (x: number, z: number, y: number) =>
    Math.min(Math.max(terrainHeight(x, z), y - 0.05), y + 0.3);

  // ---- W-beam + tiang + reflektor ------------------------------------------
  const OFF = H + 1.5;
  const beamPos: number[] = [];
  const beamIdx: number[] = [];
  const postM: THREE.Matrix4[] = [];
  const reflM: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  const P = W_PROFILE.length;

  const buildSide = (arr: Uint8Array, side: number) => {
    for (const [a, b] of runsOf(arr)) {
      const m = b - a + 1;
      if (m < 3) continue;
      const pts: { x: number; z: number; gy: number; nx: number; nz: number }[] = [];
      for (let i = a; i <= b; i++) {
        const nx = track.rx[i] * side;
        const nz = track.rz[i] * side;
        const x = track.x[i] + nx * OFF;
        const z = track.z[i] + nz * OFF;
        pts.push({ x, z, gy: groundAt(x, z, track.y[i]), nx, nz });
      }
      // haluskan tinggi dasar sepanjang pagar (tidak bergerigi)
      for (let pass = 0; pass < 2; pass++) {
        const g0 = pts.map((p) => p.gy);
        for (let i = 1; i < m - 1; i++) pts[i].gy = g0[i - 1] * 0.25 + g0[i] * 0.5 + g0[i + 1] * 0.25;
      }
      // beam
      const base = beamPos.length / 3;
      for (let i = 0; i < m; i++) {
        const p = pts[i];
        // ujung pagar melandai ke tanah (terminal end)
        const lift = i === 0 || i === m - 1 ? 0.35 : i === 1 || i === m - 2 ? 0.7 : 1;
        for (const [du, v] of W_PROFILE) {
          const o = du - 0.06;
          beamPos.push(p.x + p.nx * o, p.gy + v * lift, p.z + p.nz * o);
        }
      }
      for (let i = 0; i < m - 1; i++) {
        for (let j = 0; j < P - 1; j++) {
          const a0 = base + i * P + j;
          const a1 = a0 + 1;
          const b0 = a0 + P;
          const b1 = b0 + 1;
          beamIdx.push(a0, b0, a1, a1, b0, b1);
        }
      }
      // tiang tiap 2 m (hasil resample sepanjang polyline)
      let next = 0;
      let acc = 0;
      let count = 0;
      const place = (p0: (typeof pts)[number], p1: (typeof pts)[number], t: number, endZone: boolean) => {
        const x = p0.x + (p1.x - p0.x) * t;
        const z = p0.z + (p1.z - p0.z) * t;
        const gy = p0.gy + (p1.gy - p0.gy) * t;
        const nx = p0.nx + (p1.nx - p0.nx) * t;
        const nz = p0.nz + (p1.nz - p0.nz) * t;
        dummy.position.set(x, gy, z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        postM.push(dummy.matrix.clone());
        if (count % 2 === 0 && !endZone) {
          const l = Math.hypot(nx, nz) || 1;
          dummy.position.set(x - (nx / l) * 0.125, gy + 0.7, z - (nz / l) * 0.125);
          dummy.rotation.set(0, Math.atan2(-nx, -nz), 0);
          dummy.updateMatrix();
          reflM.push(dummy.matrix.clone());
        }
        count++;
      };
      for (let i = 0; i < m - 1; i++) {
        const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) || 0.001;
        while (next <= acc + L) {
          const endZone = i < 2 || i > m - 4;
          place(pts[i], pts[i + 1], (next - acc) / L, endZone);
          next += 2;
        }
        acc += L;
      }
      place(pts[m - 2], pts[m - 1], 1, true);
    }
  };
  buildSide(railL, -1);
  buildSide(railR, 1);

  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(beamPos, 3));
  beamGeo.setIndex(beamIdx);
  beamGeo.computeVertexNormals();
  const beam = new THREE.Mesh(
    beamGeo,
    new THREE.MeshLambertMaterial({ color: '#f8f5ec', flatShading: true, side: THREE.DoubleSide })
  );
  beam.castShadow = true;
  beam.receiveShadow = true;
  group.add(beam);

  if (postM.length) {
    const postGeo = new THREE.CylinderGeometry(0.055, 0.06, 1.1, 8);
    postGeo.translate(0, 0.3, 0); // -0.25 (terkubur) … +0.85
    const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: '#e4e0d3' }), postM.length);
    postM.forEach((mm, i) => posts.setMatrixAt(i, mm));
    posts.castShadow = true;
    group.add(posts);
  }
  if (reflM.length) {
    const rg = new THREE.BoxGeometry(0.17, 0.09, 0.02);
    const refl = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: '#ffb23d' }), reflM.length);
    reflM.forEach((mm, i) => refl.setMatrixAt(i, mm));
    group.add(refl);
  }

  // ---- guide-post di sisi tanpa pagar ----------------------------------------
  const gpM: THREE.Matrix4[] = [];
  for (const side of [-1, 1]) {
    const arr = side < 0 ? railL : railR;
    for (let i = 16; i < n - 16; i += 6) {
      if (arr[i]) continue;
      const x = track.x[i] + track.rx[i] * side * (H + 1.7);
      const z = track.z[i] + track.rz[i] * side * (H + 1.7);
      dummy.position.set(x, groundAt(x, z, track.y[i]), z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      gpM.push(dummy.matrix.clone());
    }
  }
  if (gpM.length) {
    const pole = colored(new THREE.CylinderGeometry(0.035, 0.04, 1.15, 6), '#f4f1e6');
    pole.translate(0, 0.52, 0);
    const cap = colored(new THREE.CylinderGeometry(0.048, 0.048, 0.22, 6), '#f29a2e');
    cap.translate(0, 1.0, 0);
    const gp = new THREE.InstancedMesh(
      mergeGeometries([pole, cap])!,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
      gpM.length
    );
    gpM.forEach((mm, i) => gp.setMatrixAt(i, mm));
    gp.castShadow = true;
    group.add(gp);
  }

  // ---- cermin tikungan (カーブミラー) ------------------------------------------
  const orange = new THREE.MeshLambertMaterial({ color: '#ec7d3c', side: THREE.DoubleSide });
  const glass = new THREE.MeshLambertMaterial({ color: '#c3e2ee', emissive: '#3e5c6b' });
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.065, 3.0, 8);
  poleGeo.translate(0, 1.5, 0);
  const armGeo = new THREE.BoxGeometry(0.06, 0.06, 0.34);
  const frameGeo = new THREE.CircleGeometry(0.5, 24);
  const glassGeo = new THREE.CircleGeometry(0.42, 24);
  for (const c of track.corners) {
    if (!(c.grade === 'HAIRPIN' || c.grade === '1' || c.grade === '2')) continue;
    const i = c.apex;
    const side = c.dir === 'LEFT' ? 1 : -1; // sisi luar tikungan
    const x = track.x[i] + track.rx[i] * side * (H + 3.0);
    const z = track.z[i] + track.rz[i] * side * (H + 3.0);
    const g = new THREE.Group();
    g.position.set(x, groundAt(x, z, track.y[i]), z);
    g.rotation.y = Math.atan2(-track.rx[i] * side, -track.rz[i] * side); // +z lokal → menghadap jalan
    const pole = new THREE.Mesh(poleGeo, orange);
    const arm = new THREE.Mesh(armGeo, orange);
    arm.position.set(0, 2.75, 0.17);
    const disc = new THREE.Group();
    disc.position.set(0, 2.75, 0.34);
    disc.rotation.x = 0.12; // sedikit menunduk
    const frame = new THREE.Mesh(frameGeo, orange);
    const face = new THREE.Mesh(glassGeo, glass);
    face.position.z = 0.012;
    disc.add(frame, face);
    g.add(pole, arm, disc);
    pole.castShadow = true;
    group.add(g);
  }

  return { group, railL, railR };
}
