import * as THREE from 'three';

/* ============================================================
   AULA HALL BUILDER — Gedung 256x168x26 adaptif bounds sirkuit
   - Semua tekstur = canvas 2D prosedural (tanpa file gambar)
   - Objek banyak = InstancedMesh (1 draw call)
   - Posisi acak = seeded RNG (hasil sama tiap load)
   ============================================================ */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HallFrame {
  width: number;
  depth: number;
  height: number;
  cx: number;
  cz: number;
}

export interface AvoidRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Kotak aula 256x168 tinggi 26 — posisinya mengikuti center bounds sirkuit */
export function computeHallFrame(controlPoints: [number, number][]): HallFrame {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of controlPoints) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return {
    width: 256,
    depth: 168,
    height: 26,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
  };
}

/* ---------- 6. Environment HDR prosedural (equirect float 1024x512) ---------- */
export function buildProceduralHDREnv(
  pmrem: THREE.PMREMGenerator
): THREE.WebGLRenderTarget {
  const W = 1024;
  const H = 512;
  const data = new Float32Array(W * H * 4);
  const rng = mulberry32(1337);

  // Base gelap
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = 0.07;
    data[i * 4 + 1] = 0.07;
    data[i * 4 + 2] = 0.09;
    data[i * 4 + 3] = 1;
  }
  const setRect = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r: number,
    g: number,
    b: number
  ) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
        const i = (y * W + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    }
  };

  // Grid panel high-bay 10x7 di area plafon (radiansi > 1 = HDR beneran)
  const cols = 10;
  const rows = 7;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const px = 40 + gx * 96;
      const py = 392 + gy * 15;
      const v = 4.4 + rng() * 1.4;
      setRect(px, py, px + 62, py + 9, v, v * 0.94, v * 0.86);
    }
  }
  // Pita skylight hangat
  setRect(0, 352, W, 366, 2.1, 1.9, 1.7);
  for (let x = 0; x < W; x += 64) setRect(x, 352, x + 5, 366, 0.1, 0.1, 0.12);
  // Jendela daylight dingin di pita dinding
  for (let k = 0; k < 12; k++) {
    const px = 20 + k * 84;
    setRect(px, 236, px + 44, 300, 2.6, 2.9, 3.4);
  }
  // Pantulan lantai hangat redup
  for (let y = 0; y < 120; y++) {
    const f = 1 - y / 120;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      data[i] = 0.16 * f + 0.05;
      data[i + 1] = 0.12 * f + 0.04;
      data[i + 2] = 0.11 * f + 0.04;
    }
  }

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  const rt = pmrem.fromEquirectangular(tex);
  tex.dispose();
  return rt;
}

/* ---------- 2. Lantai: ubin + speckle, repeat ratusan kali, satin ---------- */
function createSportFloorTexture(seed: number): THREE.CanvasTexture {
  const rng = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#333A47';
  ctx.fillRect(0, 0, 512, 512);
  // Grid ubin 4x4
  ctx.strokeStyle = '#232833';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  // Speckle acak (seeded)
  for (let i = 0; i < 1600; i++) {
    const v = rng();
    ctx.fillStyle =
      v > 0.6
        ? 'rgba(255,255,255,0.06)'
        : v > 0.3
        ? 'rgba(0,0,0,0.10)'
        : 'rgba(249,115,22,0.05)';
    ctx.fillRect(rng() * 512, rng() * 512, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(110, 72);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- 3. Dinding: canvas vertikal 32px ---------- */
function createSportWallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  // Trim gelap atas (0-90)
  ctx.fillStyle = '#141A26';
  ctx.fillRect(0, 0, 32, 90);
  // Strip oranye sport + pinstripe putih (90-150)
  ctx.fillStyle = '#F97316';
  ctx.fillRect(0, 90, 32, 60);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 90, 32, 5);
  ctx.fillRect(0, 145, 32, 5);
  // Wainscot abu bawah (150-512)
  const g = ctx.createLinearGradient(0, 150, 0, 512);
  g.addColorStop(0, '#6B7280');
  g.addColorStop(1, '#4B5563');
  ctx.fillStyle = g;
  ctx.fillRect(0, 150, 32, 362);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(48, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- 13. Generator spanduk sponsor: teks -> canvas -> texture ---------- */
export function makeSponsorBannerTexture(
  title: string,
  subtitle: string,
  bgHex: string,
  accentHex: string
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 1008, 240);
  ctx.fillStyle = accentHex;
  ctx.fillRect(24, 24, 16, 208);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'italic 900 64px "Chakra Petch", sans-serif';
  ctx.fillText(title, 64, 116);
  ctx.fillStyle = accentHex;
  ctx.font = '700 34px "JetBrains Mono", monospace';
  ctx.fillText(subtitle, 64, 186);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export interface AulaBuilt {
  aulaGroup: THREE.Group;
  rostrumRect: AvoidRect;
  tribunRect: AvoidRect;
  pitRect: AvoidRect;
  judgeTowerPos: THREE.Vector3;
}

/* ---------- 1-5, 7, 10-15. Struktur + isi aula ---------- */
export function buildAulaHall(
  scene: THREE.Scene,
  accentColor: string,
  frame: HallFrame
): AulaBuilt {
  const { width: W, depth: D, height: H, cx, cz } = frame;
  const rng = mulberry32(20240);
  const aulaGroup = new THREE.Group();
  scene.add(aulaGroup);

  const dummy = new THREE.Object3D();

  // --- Lantai ---
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({
      map: createSportFloorTexture(77),
      roughness: 0.55,
      metalness: 0.06,
      envMapIntensity: 0.5,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  aulaGroup.add(floor);

  // --- 4 dinding ---
  const wallMat = new THREE.MeshStandardMaterial({
    map: createSportWallTexture(),
    roughness: 0.6,
    metalness: 0.08,
  });
  const mkWall = (w: number, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat);
    m.position.set(x, H / 2, z);
    m.rotation.y = ry;
    aulaGroup.add(m);
  };
  mkWall(W, cx, cz - D / 2, 0);
  mkWall(W, cx, cz + D / 2, Math.PI);
  mkWall(D, cx + W / 2, cz, -Math.PI / 2);
  mkWall(D, cx - W / 2, cz, Math.PI / 2);

  // --- Plafon abu gelap ---
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: '#23262E', roughness: 0.92, metalness: 0.04 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(cx, H, cz);
  aulaGroup.add(ceiling);

  // --- Truss box bersilangan 7x10 (InstancedMesh) ---
  {
    const trussMat = new THREE.MeshStandardMaterial({
      color: '#3A4152',
      roughness: 0.5,
      metalness: 0.6,
    });
    const alongX = new THREE.InstancedMesh(new THREE.BoxGeometry(W, 0.9, 0.9), trussMat, 7);
    for (let i = 0; i < 7; i++) {
      dummy.position.set(cx, H - 1.2, cz - D / 2 + ((i + 0.5) / 7) * D);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      alongX.setMatrixAt(i, dummy.matrix);
    }
    const alongZ = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.9, D), trussMat, 10);
    for (let i = 0; i < 10; i++) {
      dummy.position.set(cx - W / 2 + ((i + 0.5) / 10) * W, H - 2.2, cz);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      alongZ.setMatrixAt(i, dummy.matrix);
    }
    alongX.instanceMatrix.needsUpdate = true;
    alongZ.instanceMatrix.needsUpdate = true;
    aulaGroup.add(alongX, alongZ);
  }

  // --- Kolom box 1.6 m tiap ±32 m di keempat dinding (InstancedMesh) ---
  {
    const spots: [number, number][] = [];
    for (let x = -112; x <= 112; x += 32) {
      spots.push([cx + x, cz - D / 2 + 1.2]);
      spots.push([cx + x, cz + D / 2 - 1.2]);
    }
    for (let z = -64; z <= 64; z += 32) {
      spots.push([cx - W / 2 + 1.2, cz + z]);
      spots.push([cx + W / 2 - 1.2, cz + z]);
    }
    const colMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.6, H, 1.6),
      new THREE.MeshStandardMaterial({ color: '#2B3346', roughness: 0.55, metalness: 0.4 }),
      spots.length
    );
    spots.forEach(([x, z], i) => {
      dummy.position.set(x, H / 2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      colMesh.setMatrixAt(i, dummy.matrix);
    });
    colMesh.instanceMatrix.needsUpdate = true;
    colMesh.castShadow = true;
    aulaGroup.add(colMesh);
  }

  // --- 7. 70 lampu plafon emissive (InstancedMesh, grid 10x7 samakan pola HDR) ---
  {
    const lampMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(4.6, 0.3, 1.7),
      new THREE.MeshBasicMaterial({ color: '#F2EAD8' }),
      70
    );
    let li = 0;
    for (let r = 0; r < 7; r++) {
      for (let cIdx = 0; cIdx < 10; cIdx++) {
        dummy.position.set(
          cx - 100 + cIdx * (200 / 9),
          H - 0.6,
          cz - 63 + r * (126 / 6)
        );
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        lampMesh.setMatrixAt(li++, dummy.matrix);
      }
    }
    lampMesh.instanceMatrix.needsUpdate = true;
    aulaGroup.add(lampMesh);
  }

  // --- 10. Tribun 6 undakan (sisi utara) ---
  const TRIB_W = 150;
  const tribZ0 = cz - D / 2 + 9;
  const stepMat = new THREE.MeshStandardMaterial({
    color: '#2B3346',
    roughness: 0.7,
    metalness: 0.1,
  });
  const noseMat = new THREE.MeshStandardMaterial({
    color: '#F97316',
    roughness: 0.5,
    metalness: 0.2,
  });
  for (let i = 0; i < 6; i++) {
    const h = 0.85 * (i + 1);
    const step = new THREE.Mesh(new THREE.BoxGeometry(TRIB_W, h, 2.0), stepMat);
    step.position.set(cx, h / 2, tribZ0 + i * 2.0);
    step.castShadow = true;
    step.receiveShadow = true;
    aulaGroup.add(step);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(TRIB_W, 0.1, 0.14), noseMat);
    nose.position.set(cx, h + 0.02, tribZ0 + i * 2.0 - 0.95);
    aulaGroup.add(nose);
  }
  const tribunRect: AvoidRect = {
    minX: cx - TRIB_W / 2 - 3,
    maxX: cx + TRIB_W / 2 + 3,
    minZ: tribZ0 - 4,
    maxZ: tribZ0 + 6 * 2.0 + 3,
  };

  // --- 10b. ±300 penonton InstancedMesh, 72% kursi terisi, warna seeded ---
  {
    const seats: { x: number; y: number; z: number }[] = [];
    for (let r = 0; r < 6; r++) {
      const topY = 0.85 * (r + 1);
      for (let x = cx - 58; x <= cx + 58; x += 1.6) {
        seats.push({ x, y: topY, z: tribZ0 + r * 2.0 + 0.3 });
      }
    }
    // Acak seeded lalu ambil 72%
    for (let i = seats.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [seats[i], seats[j]] = [seats[j], seats[i]];
    }
    const filled = seats.slice(0, Math.floor(seats.length * 0.72));
    const shirtPalette = [
      '#EF4444', '#F97316', '#FACC15', '#22C55E', '#06B6D4',
      '#3B82F6', '#A855F7', '#EC4899', '#F8FAFC', '#1F2937',
    ];
    const skinPalette = ['#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#FFDBAC'];
    const bodyMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.3, 0.38, 0.95, 8),
      new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 }),
      filled.length
    );
    const headMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.24, 10, 8),
      new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.0 }),
      filled.length
    );
    const tmpColor = new THREE.Color();
    filled.forEach((s, i) => {
      const sc = 0.9 + rng() * 0.2;
      dummy.position.set(s.x, s.y + 0.48 * sc, s.z);
      dummy.scale.setScalar(sc);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bodyMesh.setMatrixAt(i, dummy.matrix);
      bodyMesh.setColorAt(i, tmpColor.set(shirtPalette[Math.floor(rng() * shirtPalette.length)]));
      dummy.position.set(s.x, s.y + (0.95 + 0.22) * sc, s.z);
      dummy.updateMatrix();
      headMesh.setMatrixAt(i, dummy.matrix);
      headMesh.setColorAt(i, tmpColor.set(skinPalette[Math.floor(rng() * skinPalette.length)]));
    });
    dummy.scale.setScalar(1);
    bodyMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
    aulaGroup.add(bodyMesh, headMesh);
  }

  // --- 11. Rostrum driver stand 48 m (sisi selatan) ---
  const rostrumZ = cz + D / 2 - 12;
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(48, 3.6, 4.5),
    new THREE.MeshStandardMaterial({ color: '#232B40', roughness: 0.6, metalness: 0.3 })
  );
  platform.position.set(cx, 1.8, rostrumZ);
  platform.castShadow = true;
  platform.receiveShadow = true;
  aulaGroup.add(platform);
  // Railing pipa: 2 horizontal + tiang tiap 4 m
  const pipeMat = new THREE.MeshStandardMaterial({
    color: '#9AA5B8',
    roughness: 0.3,
    metalness: 0.85,
  });
  for (const ry of [4.75, 4.25]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 48, 8), pipeMat);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(cx, ry, rostrumZ - 2.15);
    aulaGroup.add(rail);
  }
  for (let x = -24; x <= 24; x += 4) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.25, 8), pipeMat);
    post.position.set(cx + x, 4.2, rostrumZ - 2.15);
    aulaGroup.add(post);
  }
  // Tangga di ujung timur (turun ke arah luar)
  const stairMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.7 });
  for (let s = 0; s < 6; s++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 3), stairMat);
    st.position.set(cx + 25.2 + s * 0.9, 3.3 - s * 0.6, rostrumZ);
    st.castShadow = true;
    aulaGroup.add(st);
  }
  // Spanduk rostrum
  {
    const tex = makeSponsorBannerTexture(
      'DRIVER STAND • ROSTRUM',
      '1:10 RWD • FUTABA / SANWA READY',
      '#0F172A',
      accentColor
    );
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 2.2),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    m.position.set(cx, 1.9, rostrumZ - 2.28);
    m.rotation.y = Math.PI;
    aulaGroup.add(m);
  }
  // 7 orang + transmitter RC berantena
  {
    const shirtCols = ['#EF4444', '#3B82F6', '#22C55E', '#FACC15', '#A855F7', '#F8FAFC', '#F97316'];
    const boxMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.6 });
    const antMat = new THREE.MeshStandardMaterial({ color: '#CBD5E1', roughness: 0.4, metalness: 0.7 });
    for (let p = 0; p < 7; p++) {
      const px = cx - 18 + p * 6;
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.36, 1.25, 8),
        new THREE.MeshStandardMaterial({ color: shirtCols[p], roughness: 0.85 })
      );
      body.position.y = 0.62;
      body.castShadow = true;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.23, 10, 8),
        new THREE.MeshStandardMaterial({ color: '#E8B88A', roughness: 0.7 })
      );
      head.position.y = 1.45;
      const tx = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.16), boxMat);
      tx.position.set(0, 0.95, -0.42);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 6), antMat);
      ant.position.set(0.12, 1.35, -0.42);
      ant.rotation.x = -0.25;
      g.add(body, head, tx, ant);
      g.position.set(px, 3.6, rostrumZ - 1.0);
      aulaGroup.add(g);
    }
  }
  const rostrumRect: AvoidRect = {
    minX: cx - 28,
    maxX: cx + 30,
    minZ: rostrumZ - 5,
    maxZ: rostrumZ + 5,
  };

  // --- Menara juri (sisi timur, dihindari sakura) ---
  const judgeTowerPos = new THREE.Vector3(cx + W / 2 - 12, 0, cz);
  {
    const jx = judgeTowerPos.x;
    const jz = judgeTowerPos.z;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(7, 4, 7),
      new THREE.MeshStandardMaterial({ color: '#2B3346', roughness: 0.7 })
    );
    base.position.set(jx, 2, jz);
    base.castShadow = true;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(6, 3, 6),
      new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.6 })
    );
    cabin.position.set(jx, 5.5, jz);
    cabin.castShadow = true;
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 2.0),
      new THREE.MeshStandardMaterial({
        color: '#0E2A4A',
        roughness: 0.15,
        metalness: 0.8,
      })
    );
    glass.position.set(jx - 3.02, 5.6, jz);
    glass.rotation.y = -Math.PI / 2;
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 0.4, 7.4),
      new THREE.MeshStandardMaterial({ color: '#F97316', roughness: 0.5 })
    );
    roof.position.set(jx, 7.2, jz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), pipeMat);
    pole.position.set(jx + 2.5, 8.8, jz + 2.5);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#FF3B5C' })
    );
    beacon.position.set(jx + 2.5, 10.4, jz + 2.5);
    aulaGroup.add(base, cabin, glass, roof, pole, beacon);
  }

  // --- 12. Layar LED besar ---
  {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 384;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#05070D';
    ctx.fillRect(0, 0, 1024, 384);
    ctx.fillStyle = '#FF2A85';
    ctx.font = '900 92px "Chakra Petch", sans-serif';
    ctx.fillText('RC DRIFT ARENA', 60, 150);
    ctx.fillStyle = '#00F0FF';
    ctx.font = '900 120px "Chakra Petch", sans-serif';
    ctx.fillText('• LIVE', 60, 290);
    ctx.fillStyle = '#F9A8D4';
    ctx.font = '700 40px "JetBrains Mono", monospace';
    ctx.fillText('TSUISO TANDEM  |  桜ドリフト祭り', 62, 344);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 0; y < 384; y += 4) ctx.fillRect(0, y, 1024, 1);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const led = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 11.25),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    led.position.set(cx, 17.5, cz - D / 2 + 0.6);
    aulaGroup.add(led);
    const ledFrame = new THREE.Mesh(
      new THREE.BoxGeometry(31.5, 12.5, 0.5),
      new THREE.MeshStandardMaterial({ color: '#0B0D13', roughness: 0.6 })
    );
    ledFrame.position.set(cx, 17.5, cz - D / 2 + 0.2);
    aulaGroup.add(ledFrame);
  }

  // --- 13. 4 spanduk sponsor di dinding ---
  {
    const variants: [string, string, string, string][] = [
      ['YOKOMO', 'YD-2ZX • MD2.0 PRO SPEC', '#0B132B', '#00F0FF'],
      ['REVE D', 'RDX • R-TUNE SUSPENSION', '#101828', '#CCFF00'],
      ['OVERDOSE', 'GALM • HG SPEC-3 IFS', '#1A0B2E', '#FF2A85'],
      ['AXON // SHIBATA', 'REVOSHOCK II • GRK WEIGHT-SHIFT', '#23160B', '#F59E0B'],
    ];
    const spots: { x: number; z: number; ry: number; w: number; h: number }[] = [
      { x: cx - 78, z: cz + D / 2 - 0.4, ry: Math.PI, w: 30, h: 6 },
      { x: cx + 78, z: cz + D / 2 - 0.4, ry: Math.PI, w: 30, h: 6 },
      { x: cx + W / 2 - 0.4, z: cz - 42, ry: -Math.PI / 2, w: 26, h: 5.2 },
      { x: cx - W / 2 + 0.4, z: cz + 42, ry: Math.PI / 2, w: 26, h: 5.2 },
    ];
    variants.forEach(([t, s, bg, ac], i) => {
      const tex = makeSponsorBannerTexture(t, s, bg, ac);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(spots[i].w, spots[i].h),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      m.position.set(spots[i].x, 14, spots[i].z);
      m.rotation.y = spots[i].ry;
      aulaGroup.add(m);
    });
  }

  // --- 14. Pit area: 7 meja + toolbox merah/biru + laptop (sisi barat) ---
  const pitX = cx - W / 2 + 9;
  {
    const tableMat = new THREE.MeshStandardMaterial({ color: '#1F2937', roughness: 0.6 });
    const redBox = new THREE.MeshStandardMaterial({ color: '#DC2626', roughness: 0.4, metalness: 0.3 });
    const blueBox = new THREE.MeshStandardMaterial({ color: '#2563EB', roughness: 0.4, metalness: 0.3 });
    const lapBase = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.5 });
    const lapScreen = new THREE.MeshBasicMaterial({ color: '#9FD8FF' });
    for (let i = 0; i < 7; i++) {
      const pz = cz - 30 + i * 10;
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 4.2), tableMat);
      top.position.set(pitX, 1.0, pz);
      top.castShadow = true;
      top.receiveShadow = true;
      aulaGroup.add(top);
      for (const [lx, lz] of [[-0.9, -1.9], [0.9, -1.9], [-0.9, 1.9], [0.9, 1.9]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), tableMat);
        leg.position.set(pitX + lx, 0.5, pz + lz);
        aulaGroup.add(leg);
      }
      const tb = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.5, 0.55),
        i % 2 === 0 ? redBox : blueBox
      );
      tb.position.set(pitX - 0.4, 1.32, pz - 1.2);
      tb.castShadow = true;
      aulaGroup.add(tb);
      const lb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.5), lapBase);
      lb.position.set(pitX + 0.4, 1.1, pz + 0.9);
      const ls = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), lapScreen);
      ls.position.set(pitX + 0.4, 1.35, pz + 1.12);
      ls.rotation.x = -0.28;
      aulaGroup.add(lb, ls);
    }
  }
  const pitRect: AvoidRect = {
    minX: pitX - 5,
    maxX: pitX + 5,
    minZ: cz - 38,
    maxZ: cz + 38,
  };

  // --- 15. Pintu EXIT gelap + lampu hijau emissive di 2 sisi ---
  {
    const exitCanvas = () => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 80;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#052E16';
      ctx.fillRect(0, 0, 256, 80);
      ctx.fillStyle = '#22FF88';
      ctx.font = '900 52px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', 128, 58);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const exitTex = exitCanvas();
    const doorMat = new THREE.MeshStandardMaterial({ color: '#0A0E16', roughness: 0.8 });
    const mkExit = (x: number, z: number, ry: number) => {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.4), doorMat);
      door.position.set(x, 2.2, z);
      door.rotation.y = ry;
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.65, 0.28),
        new THREE.MeshBasicMaterial({ color: '#22FF88' })
      );
      lamp.position.set(x, 5.1, z);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 0.56),
        new THREE.MeshBasicMaterial({ map: exitTex, transparent: true })
      );
      label.position.set(x, 5.1, z);
      label.rotation.y = ry;
      // Geser sedikit ke arah dalam ruangan sesuai orientasi
      const nx = Math.sin(ry);
      const nz = Math.cos(ry);
      lamp.position.x += nx * 0.2;
      lamp.position.z += nz * 0.2;
      label.position.x += nx * 0.36;
      label.position.z += nz * 0.36;
      aulaGroup.add(door, lamp, label);
    };
    mkExit(cx + W / 2 - 0.3, cz - 40, -Math.PI / 2);
    mkExit(cx - W / 2 + 0.3, cz + 40, Math.PI / 2);
  }

  return { aulaGroup, rostrumRect, tribunRect, pitRect, judgeTowerPos };
}

/* ---------- Spanduk gantung di atas straight garis start ---------- */
export function buildHangingStartBanners(
  scene: THREE.Scene,
  trackCurve: THREE.CatmullRomCurve3,
  hallHeight: number
) {
  const startPt = trackCurve.getPointAt(0);
  const startTan = trackCurve.getTangentAt(0).normalize();
  const tangentAngle = Math.atan2(startTan.x, startTan.z);
  const cableMat = new THREE.MeshStandardMaterial({ color: '#4B5563', roughness: 0.6 });
  const variants: [string, string, string, string][] = [
    ['START / FINISH', 'RC DRIFT ARENA • 桜', '#0B132B', '#00F0FF'],
    ['TSUISO BATTLE', 'DOOR TO DOOR • 追走', '#1A0B2E', '#FF2A85'],
  ];
  [-12, 12].forEach((along, i) => {
    const px = startPt.x + startTan.x * along;
    const pz = startPt.z + startTan.z * along;
    const tex = makeSponsorBannerTexture(...variants[i]);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 3.2),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    m.position.set(px, 11.5, pz);
    m.rotation.y = tangentAngle;
    scene.add(m);
    for (const side of [-6.5, 6.5]) {
      const nx = -startTan.z;
      const nz = startTan.x;
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 12.5, 6), cableMat);
      cable.position.set(px + nx * side, 19, pz + nz * side);
      scene.add(cable);
    }
  });
  void hallHeight;
}

/* ---------- 16. Taman sakura otomatis + rumput + kelopak ---------- */
export interface PetalItem {
  mesh: THREE.Mesh;
  vy: number;
  swayPhase: number;
  swaySpeed: number;
  rotSpeed: number;
}

export interface SakuraGarden {
  swayGroups: THREE.Group[];
  spots: [number, number, number][];
  petals: PetalItem[];
}

const SAKURA_PALETTE = ['#F9A8D4', '#F472B6', '#FBCFE8', '#FB7185', '#FDA4AF'];

function createSakuraTree(scale: number, seed: number): THREE.Group {
  const rng = mulberry32(seed * 7919 + 11);
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5B3A29', roughness: 0.9 });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26 * scale, 0.44 * scale, 3.4 * scale, 7),
    trunkMat
  );
  trunk.position.y = 1.7 * scale;
  trunk.castShadow = true;
  g.add(trunk);
  const branch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12 * scale, 0.2 * scale, 1.6 * scale, 6),
    trunkMat
  );
  branch.position.set(0.5 * scale, 2.9 * scale, 0.2 * scale);
  branch.rotation.z = -0.6;
  g.add(branch);
  const blobs: [number, number, number, number][] = [
    [0, 4.0, 0, 1.85],
    [1.25, 3.3, 0.4, 1.2],
    [-1.15, 3.4, -0.35, 1.25],
    [0.35, 4.8, -0.55, 1.1],
    [-0.45, 4.7, 0.6, 1.0],
    [0, 3.1, 0.9, 0.85],
  ];
  blobs.forEach(([bx, by, bz, br], bi) => {
    const col = SAKURA_PALETTE[Math.floor(rng() * SAKURA_PALETTE.length) + bi * 0] as string;
    const pick = SAKURA_PALETTE[(seed + bi * 2) % SAKURA_PALETTE.length];
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(br * scale, 1),
      new THREE.MeshStandardMaterial({
        color: rng() > 0.85 ? col : pick,
        roughness: 0.85,
        metalness: 0.0,
        flatShading: true,
      })
    );
    m.position.set(bx * scale, by * scale, bz * scale);
    m.castShadow = true;
    g.add(m);
  });
  const planter = new THREE.Mesh(
    new THREE.BoxGeometry(1.7 * scale, 0.55 * scale, 1.7 * scale),
    new THREE.MeshStandardMaterial({ color: '#3A2A1E', roughness: 0.8 })
  );
  planter.position.y = 0.27 * scale;
  planter.castShadow = true;
  planter.receiveShadow = true;
  g.add(planter);
  return g;
}

export function buildSakuraGardenAuto(
  scene: THREE.Scene,
  aulaGroup: THREE.Group,
  frame: HallFrame,
  trackSamples: THREE.Vector3[],
  halfWidth: number,
  avoids: { rostrum: AvoidRect; tribun: AvoidRect; pit: AvoidRect; judge: THREE.Vector3 }
): SakuraGarden {
  const rng = mulberry32(4242);
  const { width: W, depth: D, cx, cz } = frame;
  const inRect = (x: number, z: number, r: AvoidRect, pad = 0) =>
    x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;

  const spots: [number, number, number][] = [];
  let guard = 0;
  while (spots.length < 14 && guard++ < 800) {
    const x = cx - W / 2 + 10 + rng() * (W - 20);
    const z = cz - D / 2 + 10 + rng() * (D - 20);
    // > 10.5 m dari tepi trek
    let minD = Infinity;
    for (let i = 0; i < trackSamples.length; i += 2) {
      const dx = x - trackSamples[i].x;
      const dz = z - trackSamples[i].z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < minD) minD = d;
    }
    if (minD < 10.5 + halfWidth) continue;
    if (inRect(x, z, avoids.rostrum, 3)) continue;
    if (inRect(x, z, avoids.tribun, 3)) continue;
    if (inRect(x, z, avoids.pit, 2)) continue;
    const jdx = x - avoids.judge.x;
    const jdz = z - avoids.judge.z;
    if (Math.sqrt(jdx * jdx + jdz * jdz) < 9) continue;
    let ok = true;
    for (const [sx, sz] of spots) {
      const ddx = x - sx;
      const ddz = z - sz;
      if (Math.sqrt(ddx * ddx + ddz * ddz) < 7) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    spots.push([x, z, 1.0 + rng() * 0.5]);
  }

  const swayGroups: THREE.Group[] = [];
  spots.forEach(([sx, sz, ss], si) => {
    const tree = createSakuraTree(ss, si + 1);
    tree.position.set(sx, 0, sz);
    tree.rotation.y = rng() * Math.PI * 2;
    aulaGroup.add(tree);
    swayGroups.push(tree);
  });

  // Rumput hias + batu (seeded, validasi trek juga)
  const grassMat = new THREE.MeshStandardMaterial({ color: '#3FA34D', roughness: 0.9 });
  const rockMat = new THREE.MeshStandardMaterial({
    color: '#C9D2E0',
    roughness: 0.85,
    flatShading: true,
  });
  let placed = 0;
  guard = 0;
  while (placed < 40 && guard++ < 400) {
    const x = cx - W / 2 + 8 + rng() * (W - 16);
    const z = cz - D / 2 + 8 + rng() * (D - 16);
    let minD = Infinity;
    for (let i = 0; i < trackSamples.length; i += 4) {
      const dx = x - trackSamples[i].x;
      const dz = z - trackSamples[i].z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < minD) minD = d;
    }
    if (minD < 7 + halfWidth) continue;
    if (inRect(x, z, avoids.rostrum, 1) || inRect(x, z, avoids.tribun, 1) || inRect(x, z, avoids.pit, 1))
      continue;
    const tuft = new THREE.Group();
    for (let b = 0; b < 6; b++) {
      const blade = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.7 + rng() * 0.7, 5),
        grassMat
      );
      blade.position.set((rng() - 0.5) * 0.9, 0.35, (rng() - 0.5) * 0.9);
      blade.rotation.z = (rng() - 0.5) * 0.35;
      tuft.add(blade);
    }
    tuft.position.set(x, 0, z);
    aulaGroup.add(tuft);
    placed++;
  }
  for (let i = 0; i < 8; i++) {
    const x = cx - W / 2 + 14 + rng() * (W - 28);
    const z = cz - D / 2 + 14 + rng() * (D - 28);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + rng() * 0.6, 0), rockMat);
    rock.position.set(x, 0.35, z);
    rock.rotation.set(rng() * 3, rng() * 3, 0);
    rock.castShadow = true;
    aulaGroup.add(rock);
  }

  // Kelopak beterbangan — 70, spawn di sekitar pohon valid
  const petalGeo = new THREE.PlaneGeometry(0.22, 0.14);
  const petalMatA = new THREE.MeshBasicMaterial({
    color: '#FBCFE8',
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
  });
  const petalMatB = new THREE.MeshBasicMaterial({
    color: '#F9A8D4',
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const petals: PetalItem[] = [];
  const prng = mulberry32(99);
  for (let i = 0; i < 70; i++) {
    const mesh = new THREE.Mesh(petalGeo, i % 2 === 0 ? petalMatA : petalMatB);
    const spot = spots.length > 0 ? spots[i % spots.length] : [cx, cz, 1];
    mesh.position.set(
      spot[0] + (prng() - 0.5) * 10,
      1 + prng() * 6,
      spot[1] + (prng() - 0.5) * 8
    );
    mesh.rotation.set(prng() * 3, prng() * 3, prng() * 3);
    scene.add(mesh);
    petals.push({
      mesh,
      vy: 0.5 + prng() * 0.7,
      swayPhase: prng() * Math.PI * 2,
      swaySpeed: 0.8 + prng() * 1.2,
      rotSpeed: (prng() - 0.5) * 4,
    });
  }

  return { swayGroups, spots, petals };
}
