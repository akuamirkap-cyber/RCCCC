import * as THREE from 'three';

/* ============================================================
   MENU DIORAMA — Poster rally 3D: mobil di jalan, sakura pink,
   langit sunset. Dirender di Canvas yang SAMA dengan arena tapi
   di koordinat sangat jauh (x=800, z=200) — kamera cukup
   diarahkan ke sana saat phase menu. Mount hanya saat menu.
   - Semua tekstur = canvas 2D prosedural (tanpa file gambar)
   - Objek banyak = InstancedMesh; material pohon di-share
   - Semua keacakan = seeded RNG (LCG 16807), identik tiap load
   ============================================================ */

export const DIORAMA = { x: 800, z: 200 };
export const DIORAMA_CAR = { x: DIORAMA.x + 0.4, z: DIORAMA.z + 2 };

/** Seeded RNG deterministik (LCG 16807 / Park-Miller) */
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeSkyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#6d3fd4');
  g.addColorStop(0.2, '#a44fd0');
  g.addColorStop(0.4, '#e56ab8');
  g.addColorStop(0.6, '#ff8fae');
  g.addColorStop(0.8, '#ffc09b');
  g.addColorStop(1.0, '#ffd7ae');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);

  // 42 awan streak: ellipse tipis, lebih terang di bawah
  const rand = rng(4242);
  for (let i = 0; i < 42; i++) {
    const y = rand() * 512;
    const w = 60 + rand() * 160;
    const h = 4 + rand() * 10;
    const x = rand() * 512;
    const alpha = 0.1 + (y / 512) * 0.3;
    ctx.fillStyle = `rgba(255, 205, 228, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSunTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  g.addColorStop(0, 'rgba(255, 244, 224, 1)');
  g.addColorStop(0.25, 'rgba(255, 226, 188, 0.85)');
  g.addColorStop(0.55, 'rgba(255, 190, 150, 0.28)');
  g.addColorStop(1, 'rgba(255, 170, 140, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface SakuraTreeOptions {
  planter?: boolean;
}

/** Pohon sakura low-poly — dipakai di diorama (bisa dipakai ulang di arena) */
export function createDioramaSakuraTree(
  seed: number,
  sharedBlossomMats: THREE.Material[],
  opts: SakuraTreeOptions = {}
): THREE.Group {
  const rand = rng(seed);
  const g = new THREE.Group();

  const trunkMat = new THREE.MeshStandardMaterial({
    color: '#6b4226',
    roughness: 0.95,
    metalness: 0,
  });
  const trunkH = 3.4;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.44, trunkH, 6),
    trunkMat
  );
  trunk.position.y = trunkH / 2;
  trunk.rotation.z = (rand() - 0.5) * 0.14;
  trunk.rotation.x = (rand() - 0.5) * 0.14;
  trunk.castShadow = true;
  g.add(trunk);

  const branchCount = 2 + Math.floor(rand() * 2);
  for (let b = 0; b < branchCount; b++) {
    const br = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.16, 1.5, 6),
      trunkMat
    );
    const a = (b / branchCount) * Math.PI * 2 + rand() * 0.8;
    br.position.set(Math.cos(a) * 0.45, 2.5 + rand() * 0.7, Math.sin(a) * 0.45);
    br.rotation.z = 0.5 + rand() * 0.5;
    br.rotation.y = a;
    br.castShadow = true;
    g.add(br);
  }

  const blobCount = 6 + Math.floor(rand() * 3);
  for (let i = 0; i < blobCount; i++) {
    const r = 0.9 + rand() * 0.9;
    const a = rand() * Math.PI * 2;
    const rr = rand() * 1.6;
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 0),
      sharedBlossomMats[Math.floor(rand() * sharedBlossomMats.length)]
    );
    m.position.set(Math.cos(a) * rr, 3.2 + rand() * 2.2, Math.sin(a) * rr * 0.9);
    m.scale.y = 0.75 + rand() * 0.2;
    m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    m.castShadow = true;
    g.add(m);
  }

  if (opts.planter) {
    const pot = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.55, 1.7),
      new THREE.MeshStandardMaterial({ color: '#241c14', roughness: 0.85 })
    );
    pot.position.y = 0.27;
    pot.castShadow = true;
    pot.receiveShadow = true;
    const soil = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.12, 1.5),
      new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 1 })
    );
    soil.position.y = 0.56;
    g.add(pot, soil);
  }
  return g;
}

export interface DioramaBuilt {
  group: THREE.Group;
}

export function buildMenuDiorama(scene: THREE.Scene): DioramaBuilt {
  const group = new THREE.Group();
  group.position.set(DIORAMA.x, 0, DIORAMA.z);
  scene.add(group);

  // --- Langit: sphere BackSide + sunset canvas (toneMapped & fog MATI) ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(290, 32, 24),
    new THREE.MeshBasicMaterial({
      map: makeSkyTexture(),
      side: THREE.BackSide,
      toneMapped: false,
      fog: false,
    })
  );
  group.add(sky);

  // --- Matahari: 1 sprite radial ---
  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeSunTexture(),
      transparent: true,
      toneMapped: false,
      fog: false,
      depthWrite: false,
    })
  );
  sun.scale.set(130, 130, 1);
  sun.position.set(-110, 26, -180);
  group.add(sun);

  // --- Tanah + 7 bukit ---
  const grassGreen = new THREE.MeshStandardMaterial({
    color: '#3f8f3f',
    roughness: 1,
    metalness: 0,
    flatShading: true,
    envMapIntensity: 0.25,
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(190, 48), grassGreen);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const hillRand = rng(777);
  const hillMat = new THREE.MeshStandardMaterial({
    color: '#357a37',
    roughness: 1,
    flatShading: true,
    envMapIntensity: 0.2,
  });
  for (let i = 0; i < 7; i++) {
    const hr = 18 + hillRand() * 16;
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(hr, 1), hillMat);
    const a = (i / 7) * Math.PI * 2 + hillRand() * 0.5;
    const dist = 110 + hillRand() * 55;
    hill.position.set(Math.cos(a) * dist, 0, Math.sin(a) * dist);
    hill.scale.y = 0.14 + hillRand() * 0.12;
    hill.rotation.y = hillRand() * Math.PI;
    group.add(hill);
  }

  // --- Jalan aspal 7.4 x 190 memanjang sumbu Z ---
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(7.4, 190),
    new THREE.MeshStandardMaterial({ color: '#3d4046', roughness: 0.9, envMapIntensity: 0.2 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  road.receiveShadow = true;
  group.add(road);

  // --- Marka: 30 dash tengah + 2 garis tepi ---
  const dashMat = new THREE.MeshBasicMaterial({ color: '#F5EFDF' });
  const dashGeo = new THREE.PlaneGeometry(0.22, 2.6);
  for (let i = 0; i < 30; i++) {
    const dash = new THREE.Mesh(dashGeo, dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.035, -87 + i * 6);
    group.add(dash);
  }
  const edgeGeo = new THREE.PlaneGeometry(0.15, 190);
  for (const ex of [-3.5, 3.5]) {
    const edge = new THREE.Mesh(edgeGeo, dashMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(ex, 0.033, 0);
    group.add(edge);
  }

  // --- 3 patok rally merah-putih selang-seling ---
  const redMat = new THREE.MeshStandardMaterial({ color: '#D62828', roughness: 0.6 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#F5F5F5', roughness: 0.6 });
  const postSpots: [number, number][] = [
    [4.2, -8],
    [-4.2, 2],
    [4.2, 12],
  ];
  postSpots.forEach(([px, pz]) => {
    for (let s = 0; s < 3; s++) {
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.35, 0.28),
        s % 2 === 0 ? redMat : whiteMat
      );
      seg.position.set(px, 0.18 + s * 0.35, pz);
      seg.castShadow = true;
      group.add(seg);
    }
  });

  // --- 4 batu putih low-poly ---
  const rockMat = new THREE.MeshStandardMaterial({
    color: '#E8ECF2',
    roughness: 0.9,
    flatShading: true,
    envMapIntensity: 0.25,
  });
  const rockRand = rng(99);
  for (let i = 0; i < 4; i++) {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + rockRand() * 0.6, 0), rockMat);
    const side = rockRand() < 0.5 ? -1 : 1;
    rock.position.set(side * (5 + rockRand() * 9), 0.3, -20 + rockRand() * 40);
    rock.scale.y = 0.6;
    rock.rotation.set(rockRand() * 3, rockRand() * 3, 0);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }

  // --- 170 rumpun rumput InstancedMesh, hanya di pinggir jalan ---
  {
    const gRand = rng(2024);
    const blade = new THREE.ConeGeometry(0.09, 0.8, 5);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: '#2f6b2f',
      roughness: 1,
      envMapIntensity: 0.15,
    });
    const grass = new THREE.InstancedMesh(blade, bladeMat, 170);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 170; i++) {
      const side = gRand() < 0.5 ? -1 : 1;
      const sc = 0.7 + gRand() * 0.7;
      dummy.position.set(side * (4.2 + gRand() * 3.2), 0.35 * sc, -95 + gRand() * 190);
      dummy.scale.setScalar(sc);
      dummy.rotation.set(0, gRand() * Math.PI * 2, 0);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
    }
    grass.instanceMatrix.needsUpdate = true;
    group.add(grass);
  }

  // --- 18 SakuraTree, 5 material pink di-share global ---
  {
    const blossomMats = ['#f8a8cb', '#f28ab8', '#e970a5', '#ffc3da', '#f49ec4'].map(
      (col) =>
        new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.85,
          metalness: 0,
          flatShading: true,
          envMapIntensity: 0.3,
        })
    );
    const tRand = rng(555);
    let planted = 0;
    let guard = 0;
    while (planted < 18 && guard++ < 300) {
      const side = planted % 2 === 0 ? -1 : 1;
      const tx = side * (6.5 + tRand() * 33.5);
      const tz = -60 + tRand() * 130;
      // Skip area dekat mobil (lokal 0.4, 2)
      if (Math.abs(tx) < 7 && Math.abs(tz - 2) < 8) continue;
      const tree = createDioramaSakuraTree(1000 + planted * 17, blossomMats, {});
      tree.position.set(tx, 0, tz);
      tree.rotation.y = tRand() * Math.PI * 2;
      const s = 1.15 + tRand() * 1.15;
      tree.scale.setScalar(s);
      group.add(tree);
      planted++;
    }
  }

  // --- Pencahayaan sunset lokal ---
  const hemi = new THREE.HemisphereLight('#ffb6d9', '#2f6b3a', 0.75);
  hemi.position.set(0, 30, 0);
  group.add(hemi);

  const sunLight = new THREE.DirectionalLight('#ffc09a', 1.5);
  sunLight.position.set(-60, 40, -90);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.left = -45;
  sunLight.shadow.camera.right = 45;
  sunLight.shadow.camera.top = 45;
  sunLight.shadow.camera.bottom = -45;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 300;
  sunLight.shadow.bias = -0.0004;
  sunLight.target.position.set(0, 0, 0);
  group.add(sunLight, sunLight.target);

  const rim = new THREE.DirectionalLight('#ff9ec0', 0.5);
  rim.position.set(40, 18, 80);
  rim.target.position.set(0, 0, 0);
  group.add(rim, rim.target);

  return { group };
}
