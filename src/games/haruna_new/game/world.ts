import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, mulberry32, smoothstep } from './noise';
import { Track, roadField, ROAD_HALF, LAKE, HARUNA_FUJI, CELL, cellKey } from './track';
import { TERRAIN_PARAMS } from '../track/haruna';
import { buildGuardrails } from './guardrail';
import { makeCedar, makeFir, makeBroadleaf, makeBush } from './treeGeo';

export interface World {
  group: THREE.Group;
  terrainHeight: (x: number, z: number) => number;
  treeHash: Map<number, number[]>;
  railL: Uint8Array;
  railR: Uint8Array;
  upSide: Int8Array;
  water: THREE.Mesh;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  treeCount: number;
}

export const TREE_CELL = 8;
export const tkey = (cx: number, cz: number) => (cx + 2000) * 8000 + (cz + 2000);

function colorGeo(g: THREE.BufferGeometry, c: THREE.Color) {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function makeRoadTexture() {
  // Palet Art of Rally: aspal pucat hangat, marka krem tipis, gutter nyaris senada.
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512; // 1 tile = 12 m panjang jalan
  const g = c.getContext('2d')!;
  g.fillStyle = '#aeada6';
  g.fillRect(0, 0, 128, 512);
  const r = mulberry32(3);
  for (let i = 0; i < 3600; i++) {
    const v = 186 + r() * 14;
    g.fillStyle = `rgba(${v},${v},${v - 3},0.26)`;
    g.fillRect(r() * 128, r() * 512, 1, 1 + r() * 2);
  }
  // bekas ban / racing line, sangat halus
  for (let i = 0; i < 7; i++) {
    g.fillStyle = `rgba(174,172,163,${0.07 + r() * 0.08})`;
    g.fillRect(16 + r() * 90, r() * 512, 16 + r() * 36, 40 + r() * 80);
  }
  // gutter beton — hanya sedikit lebih terang dari aspal
  g.fillStyle = '#cac6b8';
  g.fillRect(0, 0, 13, 512);
  g.fillRect(115, 0, 13, 512);
  g.fillStyle = 'rgba(170,167,157,0.5)';
  for (let y = 0; y < 512; y += 64) {
    g.fillRect(0, y, 13, 2);
    g.fillRect(115, y, 13, 2);
  }
  // garis tepi krem
  g.fillStyle = 'rgba(250,247,238,0.8)';
  g.fillRect(17, 0, 3, 512);
  g.fillRect(108, 0, 3, 512);
  // garis tengah putus-putus
  g.fillStyle = 'rgba(250,247,238,0.5)';
  for (let y = 0; y < 512; y += 256) g.fillRect(62, y, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeChevronTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2c2a22';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#e5c06a';
  g.beginPath();
  g.moveTo(30, 14);
  g.lineTo(70, 14);
  g.lineTo(108, 64);
  g.lineTo(70, 114);
  g.lineTo(30, 114);
  g.lineTo(68, 64);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeBannerTexture(text: string, sub: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 1024, 160);
  g.fillStyle = '#111';
  g.fillRect(0, 0, 1024, 16);
  g.fillRect(0, 144, 1024, 16);
  for (let x = 0; x < 1024; x += 64) {
    g.fillStyle = (x / 64) % 2 ? '#fff' : '#111';
    g.fillRect(x, 0, 32, 16);
    g.fillRect(x + 32, 144, 32, 16);
  }
  g.fillStyle = '#fff';
  g.font = 'bold 76px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 512, 72);
  g.font = 'bold 26px sans-serif';
  g.fillText(sub, 512, 124);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(
  track: Track,
  onProgress?: (p: string) => void,
  roadHalfWidth = ROAD_HALF,
  includeRoadSurface = true
): World {
  // Sakura RC can request the same 10.4 m road width as Tokyo Grand Aula
  // while the standalone Haruna game keeps its original 8.4 m road by default.
  const H = roadHalfWidth;
  const group = new THREE.Group();
  const rng = mulberry32(42);

  // ------------------------------------------------------------------ TERRAIN
  onProgress?.('Membentuk kaldera Haruna...');
  const TP = TERRAIN_PARAMS;
  const STEP = TP.gridStep;
  const tb = track.bounds;
  const minX = Math.floor(Math.min(tb.minX - TP.margin, LAKE.x - LAKE.rx * 2.4));
  const minZ = Math.floor(Math.min(tb.minZ - TP.margin, LAKE.z - LAKE.rz * 2.4));
  const NX = Math.ceil((tb.maxX + TP.margin - minX) / STEP);
  const NZ = Math.ceil((tb.maxZ + TP.margin - minZ) / STEP);
  const W = NX + 1;
  const maxX = minX + NX * STEP;
  const maxZ = minZ + NZ * STEP;
  const corridorGrid = new Float32Array(W * (NZ + 1)).fill(1e9); // tinggi aspal terdekat
  const heights = new Float32Array(W * (NZ + 1));
  const dminGrid = new Float32Array(W * (NZ + 1));
  const n0 = track.n;

  // (a) titik jalan kasar (tiap 10 sample ≈ 30 m) untuk IDW lereng regional
  const cx: number[] = [];
  const cz: number[] = [];
  const ch: number[] = [];
  for (let i = 0; i < n0; i += 10) {
    cx.push(track.x[i]);
    cz.push(track.z[i]);
    ch.push(track.y[i]);
  }
  const CN = cx.length;
  let idwH = 0;
  let idwD = 0;
  const idw = (x: number, z: number) => {
    let sw = 0;
    let sh = 0;
    let dC = Infinity;
    for (let k = 0; k < CN; k++) {
      const dx = cx[k] - x;
      const dz = cz[k] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < dC) dC = d2;
      const w = 1 / (d2 + 900);
      const w2 = w * w;
      sw += w2;
      sh += w2 * ch[k];
    }
    idwH = sh / sw;
    idwD = Math.sqrt(dC);
  };

  // (b) sisi tebing vs jurang per sample: bandingkan lereng regional 100 m ke kiri/kanan
  //     + bias "makin dekat kaldera = makin tinggi", lalu dihaluskan ±8 sample.
  const score = new Float32Array(n0);
  for (let i = 0; i < n0; i++) {
    const xl = track.x[i] - track.rx[i] * 100;
    const zl = track.z[i] - track.rz[i] * 100;
    const xr = track.x[i] + track.rx[i] * 100;
    const zr = track.z[i] + track.rz[i] * 100;
    idw(xl, zl);
    const hL = idwH;
    idw(xr, zr);
    const hR = idwH;
    const lakeL = Math.hypot(xl - LAKE.x, zl - LAKE.z);
    const lakeR = Math.hypot(xr - LAKE.x, zr - LAKE.z);
    score[i] = hR - hL + 0.05 * (lakeL - lakeR);
  }
  const upSide = new Int8Array(n0); // +1 = sisi kanan menanjak (tebing), −1 = kanan jurang
  for (let i = 0; i < n0; i++) {
    let s = 0;
    for (let k = -8; k <= 8; k++) s += score[Math.min(n0 - 1, Math.max(0, i + k))];
    upSide[i] = s >= 0 ? 1 : -1;
  }

  // (c) near-field cut & fill: tiap sample jalan dalam radius 90 m "mengusulkan" tinggi,
  //     dicampur dengan bobot gaussian relatif terhadap sample terdekat.
  const candD = new Float32Array(8192);
  const candK = new Int32Array(8192);
  const candS = new Float32Array(8192);
  let nfH = 0;
  let nfD = Infinity;
  let nfCorridor = Infinity;
  const sig2 = TP.sigma * TP.sigma;
  const nearField = (px: number, pz: number) => {
    const ccx = Math.floor(px / CELL);
    const ccz = Math.floor(pz / CELL);
    const rc = Math.ceil(TP.radius / CELL);
    let count = 0;
    let dmin2 = Infinity;
    for (let a = -rc; a <= rc; a++) {
      for (let b = -rc; b <= rc; b++) {
        const arr = track.hash.get(cellKey(ccx + a, ccz + b));
        if (!arr) continue;
        for (const k of arr) {
          if (count >= 8192) break;
          const dx = px - track.x[k];
          const dz = pz - track.z[k];
          const d2 = dx * dx + dz * dz;
          if (d2 > TP.radius * TP.radius) continue;
          candD[count] = d2;
          candK[count] = k;
          candS[count] = dx * track.rx[k] + dz * track.rz[k];
          if (d2 < dmin2) dmin2 = d2;
          count++;
        }
      }
    }
    nfCorridor = Infinity;
    if (!count) {
      nfD = Infinity;
      return false;
    }
    const rampFrom = H + TP.flatExtra;
    // aspal terendah dalam jangkauan segitiga (zona jaminan + 1 sel grid)
    const corrReach = H + TP.corridorClamp + STEP;
    let sw = 0;
    let sh = 0;
    let corridor = Infinity;
    for (let c = 0; c < count; c++) {
      const k = candK[c];
      const d = Math.sqrt(candD[c]);
      if (d < corrReach) corridor = Math.min(corridor, track.y[k]);
      const w = Math.exp(-(candD[c] - dmin2) / sig2);
      if (w < 1e-4) continue;
      const t = Math.max(0, d - rampFrom);
      const ramp = smoothstep(0, TP.shoulderRamp, t); // 0 di tepi bahu → 1 di lereng
      const uphill = candS[c] * upSide[k] > 0;
      const off = uphill
        ? Math.min(Math.pow(t, TP.cliffExp) * TP.cliffK, TP.cliffMax) * ramp
        : -Math.min(Math.pow(t, TP.dropExp) * TP.dropK, TP.dropMax) * ramp;
      sh += w * (track.y[k] - 0.28 + off);
      sw += w;
    }
    nfH = sh / sw;
    nfCorridor = corridor; // ← sebelumnya tidak pernah diisi, sehingga penjepit tidak aktif
    nfD = Math.sqrt(dmin2);
    return true;
  };

  for (let j = 0; j <= NZ; j++) {
    const z = minZ + j * STEP;
    for (let i = 0; i <= NX; i++) {
      const x = minX + i * STEP;
      idw(x, z);
      const dC = idwD;
      // far field: lereng regional + bukit fBm
      const hFar =
        idwH +
        18 +
        22 * smoothstep(80, 500, dC) +
        // bukit besar & landai: hanya 2 oktaf, tanpa detail kasar
        fbm(x * 0.0021 + 11, z * 0.0021 - 7, 2) * (6 + 50 * smoothstep(60, 420, dC));
      let h = hFar;
      let dmin = dC;
      let corridorH = Infinity;
      if (dC < 150 && nearField(x, z)) {
        dmin = nfD;
        corridorH = nfCorridor;
        const rw = 1 - smoothstep(TP.blendFrom, TP.blendTo, dmin);
        const amp = TP.noiseAmp * smoothstep(H + TP.benchWidth, 70, dmin); // noise nol di bench
        const hn = nfH + fbm(x * 0.0045, z * 0.0045, 2) * amp;
        h = hn * rw + hFar * (1 - rw);
      }

      // kunci: di dalam zona jaminan terrain dijepit di bawah aspal terendah di sekitarnya
      const inZone = dmin < H + TP.corridorClamp && corridorH < Infinity;
      if (inZone) h = Math.min(h, corridorH - TP.corridorDepth);

      // fitur vulkanik Haruna — tidak menyentuh badan jalan
      const free = smoothstep(H + TP.benchWidth, H + TP.benchWidth + 45, dmin);
      const dl = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
      h += free * 48 * Math.exp(-((dl - 1.95) ** 2) / 0.14); // bibir kaldera
      const df = Math.hypot(x - HARUNA_FUJI.x, z - HARUNA_FUJI.z) / HARUNA_FUJI.r;
      if (df < 1) h += free * HARUNA_FUJI.h * Math.pow(1 - df, 1.35) * smoothstep(0, 0.12, 1 - df * 0.95);
      if (dl < 1.3) {
        const bed = LAKE.level - 1.5 - 12 * (1 - Math.min(1, dl) ** 2);
        const tt = smoothstep(0.93, 1.3, dl);
        const shore = Math.max(h, LAKE.level + 0.8 + (dl - 1) * 20);
        h = bed * (1 - tt) + shore * tt;
      }
      heights[j * W + i] = h;
      dminGrid[j * W + i] = dmin;
      corridorGrid[j * W + i] = inZone ? corridorH : 1e9;
    }
  }

  // --- PENGHALUSAN: blur separable, lalu koridor jalan di-clamp ulang ---------
  // Hasilnya lereng jadi landai (tidak ada puncak acak), tetapi aspal dijamin
  // tidak pernah tertimbus karena clamp diterapkan kembali setelah tiap blur.
  const line = new Float32Array(Math.max(NX, NZ) + 1);
  const blurPass = (arr: Float32Array, r: number) => {
    for (let j = 0; j <= NZ; j++) {
      for (let i = 0; i <= NX; i++) line[i] = arr[j * W + i];
      for (let i = 0; i <= NX; i++) {
        let s = 0;
        let c = 0;
        for (let k = -r; k <= r; k++) {
          const q = Math.min(NX, Math.max(0, i + k));
          s += line[q];
          c++;
        }
        arr[j * W + i] = s / c;
      }
    }
    for (let i = 0; i <= NX; i++) {
      for (let j = 0; j <= NZ; j++) line[j] = arr[j * W + i];
      for (let j = 0; j <= NZ; j++) {
        let s = 0;
        let c = 0;
        for (let k = -r; k <= r; k++) {
          const q = Math.min(NZ, Math.max(0, j + k));
          s += line[q];
          c++;
        }
        arr[j * W + i] = s / c;
      }
    }
  };
  const clampCorridor = () => {
    for (let idx = 0; idx < heights.length; idx++) {
      if (corridorGrid[idx] < 1e8) heights[idx] = Math.min(heights[idx], corridorGrid[idx] - TP.corridorDepth);
    }
  };
  // blur adaptif: dekat jalan (bentuk cut & fill) bobot kecil, jauh dari jalan bobot besar
  const soft = heights.slice();
  blurPass(soft, TP.smoothRadius + 1);
  blurPass(soft, TP.smoothRadius + 1);
  blurPass(soft, TP.smoothRadius);
  for (let idx = 0; idx < heights.length; idx++) {
    const wgt = 0.3 + 0.7 * smoothstep(18, 90, dminGrid[idx]);
    heights[idx] = heights[idx] * (1 - wgt) + soft[idx] * wgt;
  }
  clampCorridor();
  // polesan akhir: satu blur halus lalu clamp lagi (membuang sisa "gerigi" grid)
  blurPass(heights, 1);
  clampCorridor();

  // PENGAMAN PASTI: periksa langsung titik-titik di permukaan aspal. Sel grid mana pun yang
  // menyentuh badan jalan dan masih lebih tinggi dari aspal, keempat vertex-nya diturunkan paksa.
  {
    const cap = (vi: number, vj: number, yLimit: number) => {
      if (vi < 0 || vj < 0 || vi > NX || vj > NZ) return;
      const id = vj * W + vi;
      if (heights[id] > yLimit) heights[id] = yLimit;
    };
    for (let i = 0; i < n0; i++) {
      const lim = track.y[i] - TP.corridorDepth;
      for (let l = -H - 0.6; l <= H + 0.6; l += 1.2) {
        const px = track.x[i] + track.rx[i] * l;
        const pz = track.z[i] + track.rz[i] * l;
        const ci = Math.floor((px - minX) / STEP);
        const cj = Math.floor((pz - minZ) / STEP);
        cap(ci, cj, lim);
        cap(ci + 1, cj, lim);
        cap(ci, cj + 1, lim);
        cap(ci + 1, cj + 1, lim);
      }
    }
  }

  const sampleGrid = (arr: Float32Array, x: number, z: number) => {
    const fx = Math.min(NX - 0.001, Math.max(0, (x - minX) / STEP));
    const fz = Math.min(NZ - 0.001, Math.max(0, (z - minZ) / STEP));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const a = arr[j * W + i];
    const b = arr[j * W + i + 1];
    const c = arr[(j + 1) * W + i];
    const d = arr[(j + 1) * W + i + 1];
    // match triangulation (a,c,b) & (b,c,d)
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  const terrainHeight = (x: number, z: number) => sampleGrid(heights, x, z);

  // mesh
  const pos = new Float32Array(W * (NZ + 1) * 3);
  const col = new Float32Array(W * (NZ + 1) * 3);
  // palet jenuh-lembut: hijau segar, kuning-hijau, emas kering — tetap flat & tenang, tapi tidak pucat
  // palet sage-olive kalem: hijau keabu-abuan hangat, tanah tan lembut (bukan oranye), kontras rendah
  const cGrass1 = new THREE.Color('#94a873');
  const cGrass2 = new THREE.Color('#b3b77f');
  const cForest = new THREE.Color('#7b9367');
  const cHigh = new THREE.Color('#bfaf7d'); // punggungan / kaldera: rumput kering keemasan
  const cDirt = new THREE.Color('#b7a27f');
  const cRock = new THREE.Color('#9d9689');
  const cGravel = new THREE.Color('#c6bca3');
  const cSand = new THREE.Color('#e1d5b1');
  const cShade = new THREE.Color('#69825e'); // warna lembah (AO)
  const cLit = new THREE.Color('#bdc589'); // warna punggungan
  const tc = new THREE.Color();
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const idx = j * W + i;
      const x = minX + i * STEP;
      const z = minZ + j * STEP;
      const h = heights[idx];
      pos[idx * 3] = x;
      pos[idx * 3 + 1] = h;
      pos[idx * 3 + 2] = z;
      const hx = heights[j * W + Math.min(NX, i + 1)] - heights[j * W + Math.max(0, i - 1)];
      const hz = heights[Math.min(NZ, j + 1) * W + i] - heights[Math.max(0, j - 1) * W + i];
      const slope = Math.hypot(hx, hz) / (2 * STEP);
      const dmin = dminGrid[idx];
      const dl = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
      // noda warna berskala besar → permukaan tenang, tanpa bintik
      const n1 = fbm(x * 0.0045, z * 0.0045, 2) * 0.5 + 0.5;
      const dens = fbm(x * 0.0038 + 3, z * 0.0038 + 9, 2);
      tc.lerpColors(cGrass1, cGrass2, n1 * 0.9);
      // pita ketinggian: makin tinggi makin kering/keemasan (kaldera, punggungan)
      tc.lerp(cHigh, smoothstep(930, 1120, h) * 0.6);
      if (dens > -0.2) tc.lerp(cForest, smoothstep(-0.2, 0.3, dens) * 0.5);
      if (slope > 0.85) tc.lerp(cDirt, smoothstep(0.85, 1.4, slope) * 0.5);
      if (slope > 1.3) tc.lerp(cRock, smoothstep(1.3, 1.9, slope) * 0.55);
      // bahu jalan: kerikil lembut yang memudar ke rumput
      if (dmin < H + 5.5) tc.lerp(cGravel, (1 - smoothstep(H + 0.8, H + 5.5, dmin)) * 0.55);
      if (dl < 1.14) tc.lerp(cSand, (1 - smoothstep(1.0, 1.14, dl)) * 0.9);
      // AO terbakar: bandingkan tinggi vertex dengan rata-rata tetangga 3 sel (±21 m)
      let avg = 0;
      let cnt = 0;
      for (let dj = -3; dj <= 3; dj += 3) {
        for (let di = -3; di <= 3; di += 3) {
          if (!di && !dj) continue;
          avg += heights[Math.min(NZ, Math.max(0, j + dj)) * W + Math.min(NX, Math.max(0, i + di))];
          cnt++;
        }
      }
      const curv = (avg / cnt - h) / 12; // + = cekungan (lembah), − = cembung (punggungan)
      const ao = Math.max(-1, Math.min(1, curv));
      if (ao > 0) tc.lerp(cShade, ao * 0.5);
      else tc.lerp(cLit, -ao * 0.32);
      const jit = 0.992 + rng() * 0.016;
      col[idx * 3] = tc.r * jit;
      col[idx * 3 + 1] = tc.g * jit;
      col[idx * 3 + 2] = tc.b * jit;
    }
  }
  const idxArr = new Uint32Array(NX * NZ * 6);
  let p = 0;
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * W + i;
      const b = a + 1;
      const c = a + W;
      const d = c + 1;
      idxArr[p++] = a;
      idxArr[p++] = c;
      idxArr[p++] = b;
      idxArr[p++] = b;
      idxArr[p++] = c;
      idxArr[p++] = d;
    }
  }
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tgeo.setIndex(new THREE.BufferAttribute(idxArr, 1));
  tgeo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    tgeo,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false })
  );
  terrain.receiveShadow = true;
  group.add(terrain);

  // ------------------------------------------------------------------ WATER
  const waterGeo = new THREE.CircleGeometry(1, 64);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshPhongMaterial({
      color: '#a6c9cb',
      shininess: 38,
      specular: '#eaf4f0',
      transparent: true,
      opacity: 0.9,
    })
  );
  water.scale.set(LAKE.rx * 1.32, 1, LAKE.rz * 1.32);
  water.position.set(LAKE.x, LAKE.level, LAKE.z);
  water.receiveShadow = true;
  group.add(water);

  // ------------------------------------------------------------------ ROAD
  const n = track.n;
  if (includeRoadSurface) {
    onProgress?.('Mengaspal Route 33...');
  const rpos = new Float32Array(n * 2 * 3);
  const ruv = new Float32Array(n * 2 * 2);
  for (let i = 0; i < n; i++) {
    const x = track.x[i];
    const y = track.y[i] + 0.03;
    const z = track.z[i];
    const rx = track.rx[i];
    const rz = track.rz[i];
    rpos.set([x - rx * H, y, z - rz * H, x + rx * H, y, z + rz * H], i * 6);
    const v = track.dist[i] / 12;
    ruv.set([0, v, 1, v], i * 4);
  }
  const rind: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const L0 = i * 2;
    const R0 = L0 + 1;
    const L1 = L0 + 2;
    const R1 = L0 + 3;
    rind.push(L0, R0, L1, R0, R1, L1);
  }
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
  rgeo.setAttribute('uv', new THREE.BufferAttribute(ruv, 2));
  rgeo.setIndex(rind);
  rgeo.computeVertexNormals();
  const road = new THREE.Mesh(
    rgeo,
    new THREE.MeshLambertMaterial({
      map: makeRoadTexture(),
      // aspal selalu menang depth-test terhadap terrain & bench (tidak ada kedip/tertutup)
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  road.renderOrder = 1;
  road.receiveShadow = true;
  group.add(road);
  }
  // --- BENCH: pita tanah rata yang menempel pada aspal -----------------------
  // Menutupi seluruh koridor jalan (aspal + bahu + saluran) dan mengikuti kontur
  // terrain di tepi luarnya. Karena dibangun dari sample jalan, permukaan ini
  // dijamin tidak pernah menembus aspal walau grid terrain kasar.
  const BW = TP.benchWidth;
  const benchRings = 4; // tepi aspal, bahu dalam, tepi bench, skirt bawah
  const benchPos: number[] = [];
  const benchCol: number[] = [];
  const cSoil = new THREE.Color('#bdb08d');
  const tmpC = new THREE.Color();
  // warna bench = warna terrain terdekat (tanpa sambungan), dengan tepi aspal sedikit lebih ke tanah
  const terrainCol = (px: number, pz: number, out: THREE.Color) => {
    const ci = Math.min(NX, Math.max(0, Math.round((px - minX) / STEP)));
    const cj = Math.min(NZ, Math.max(0, Math.round((pz - minZ) / STEP)));
    const o = (cj * W + ci) * 3;
    return out.setRGB(col[o], col[o + 1], col[o + 2]);
  };
  for (let i = 0; i < n; i++) {
    const x = track.x[i];
    const y = track.y[i];
    const z = track.z[i];
    const rx = track.rx[i];
    const rz = track.rz[i];
    // kelengkungan lokal (dirata-ratakan ±4 sample) → batas lebar di sisi DALAM tikungan
    let kk = 0;
    for (let q = -4; q <= 4; q++) kk += track.curv[Math.min(n - 1, Math.max(0, i + q))];
    kk /= 9;
    for (const side of [-1, 1]) {
      // curv + = belok kiri → sisi dalam = kiri (side −1)
      const inner = (kk > 0 && side < 0) || (kk < 0 && side > 0);
      // pita tidak boleh melewati pusat lengkungan: maks 0,72 × radius di sisi dalam
      const outerLat = inner && Math.abs(kk) > 1e-4 ? Math.min(H + BW, Math.max(H + 3.0, 0.72 / Math.abs(kk))) : H + BW;
      const lats = [H + 0.02, Math.min(H + 2.1, outerLat - 1.0), outerLat, outerLat];
      for (let r = 0; r < benchRings; r++) {
        const lat = lats[r] * side;
        const px = x + rx * lat;
        const pz = z + rz * lat;
        let by: number;
        const ht = terrainHeight(px, pz);
        if (r === 0) by = y - 0.02;
        else if (r === 1) by = Math.min(Math.max(ht, y - 0.35), y + 0.12); // bahu: tidak boleh lebih tinggi dari aspal+12 cm
        else if (r === 2) {
          const cut = ht > y + 0.2;
          by = cut ? Math.min(Math.max(ht - 0.15, y + 0.1), y + 2.5) : Math.min(ht, y - 0.7);
        } else by = Math.min(ht, y - 0.7) - 2.5; // skirt: turun 2,5 m menutup celah ke terrain
        benchPos.push(px, by, pz);
        terrainCol(px, pz, tmpC);
        if (r === 0) tmpC.lerp(cSoil, 0.3);
        tmpC.multiplyScalar(0.97 + rng() * 0.06);
        benchCol.push(tmpC.r, tmpC.g, tmpC.b);
      }
    }
  }
  const benchIdx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (const side of [0, 1]) {
      const o0 = (i * 2 + side) * benchRings;
      const o1 = ((i + 1) * 2 + side) * benchRings;
      for (let r = 0; r < benchRings - 1; r++) {
        const a = o0 + r;
        const b = o0 + r + 1;
        const c = o1 + r;
        const d = o1 + r + 1;
        benchIdx.push(a, c, b, b, c, d);
      }
    }
  }
  const benchGeo = new THREE.BufferGeometry();
  benchGeo.setAttribute('position', new THREE.Float32BufferAttribute(benchPos, 3));
  benchGeo.setAttribute('color', new THREE.Float32BufferAttribute(benchCol, 3));
  benchGeo.setIndex(benchIdx);
  benchGeo.computeVertexNormals();
  const bench = new THREE.Mesh(
    benchGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false, side: THREE.DoubleSide })
  );
  bench.receiveShadow = true;
  group.add(bench);

  // ------------------------------------------------------------------ GUARDRAILS
  onProgress?.('Memasang guardrail W-beam khas touge...');
  const guard = buildGuardrails(track, terrainHeight, upSide, H, BW);
  const { railL, railR } = guard;
  group.add(guard.group);

  const dummy = new THREE.Object3D();

  // chevron boards at hairpins & grade-1 corners
  const chevTex = makeChevronTexture();
  const chevTexFlip = chevTex.clone();
  chevTexFlip.wrapS = THREE.RepeatWrapping;
  chevTexFlip.repeat.x = -1;
  chevTexFlip.offset.x = 1;
  chevTexFlip.needsUpdate = true;
  const chevGeo = new THREE.PlaneGeometry(1.1, 0.8);
  const chevMatA = new THREE.MeshLambertMaterial({ map: chevTex, side: THREE.DoubleSide });
  const chevMatB = new THREE.MeshLambertMaterial({ map: chevTexFlip, side: THREE.DoubleSide });
  const chevA: THREE.Matrix4[] = [];
  const chevB: THREE.Matrix4[] = [];
  const basis = new THREE.Matrix4();
  for (const c of track.corners) {
    if (!(c.grade === 'HAIRPIN' || c.grade === '1' || c.grade === '2' || c.grade === '3')) continue;
    const side = c.dir === 'LEFT' ? 1 : -1; // outside of the turn
    for (let i = c.start; i <= c.end; i += 3) {
      const off = H + 2.0;
      const x = track.x[i] + track.rx[i] * off * side;
      const z = track.z[i] + track.rz[i] * off * side;
      const y = Math.min(Math.max(terrainHeight(x, z), track.y[i] - 0.05), track.y[i] + 0.3) + 0.85;
      const f = new THREE.Vector3(track.tx[i], 0, track.tz[i]);
      const r = new THREE.Vector3(track.rx[i], 0, track.rz[i]);
      const up = new THREE.Vector3(0, 1, 0);
      if (side < 0) {
        // left side board, normal points right (inward)
        basis.makeBasis(f, up, r);
        basis.setPosition(x, y, z);
        chevA.push(basis.clone());
      } else {
        basis.makeBasis(f.clone().negate(), up, r.clone().negate());
        basis.setPosition(x, y, z);
        chevB.push(basis.clone());
      }
    }
  }
  const addInst = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[]) => {
    if (!mats.length) return;
    const m = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((mm, i) => m.setMatrixAt(i, mm));
    m.castShadow = true;
    group.add(m);
  };
  addInst(chevGeo, chevMatA, chevA);
  addInst(chevGeo, chevMatB, chevB);

  // ------------------------------------------------------------------ EXCLUSION ZONES
  const exclusions: [number, number, number][] = [];

  // Lakeside shops & parking near the start (north / left side)
  onProgress?.('Membangun toko di tepi Danau Haruna...');
  const bGroup = new THREE.Group();
  const wallMat = new THREE.MeshLambertMaterial({ color: '#e8dfcc' });
  const wallMat2 = new THREE.MeshLambertMaterial({ color: '#c9b79a' });
  const roofMat = new THREE.MeshLambertMaterial({ color: '#4d5a66', flatShading: true });
  const roofMat2 = new THREE.MeshLambertMaterial({ color: '#8a3b2e', flatShading: true });
  const spots = [
    { i: 22, lat: -24, w: 12, d: 9 },
    { i: 38, lat: -26, w: 16, d: 10 },
    { i: 55, lat: -22, w: 10, d: 8 },
    { i: 70, lat: 24, w: 14, d: 10 },
    { i: 90, lat: -25, w: 12, d: 12 },
  ];
  spots.forEach((s, k) => {
    const i = s.i;
    const x = track.x[i] + track.rx[i] * s.lat;
    const z = track.z[i] + track.rz[i] * s.lat;
    const y = terrainHeight(x, z);
    const hgt = 4 + (k % 2) * 2.5;
    const box = new THREE.Mesh(new THREE.BoxGeometry(s.w, hgt, s.d), k % 2 ? wallMat2 : wallMat);
    box.position.set(x, y + hgt / 2 - 0.5, z);
    const roofGeo = new THREE.ConeGeometry(Math.max(s.w, s.d) * 0.78, 3, 4, 1);
    roofGeo.rotateY(Math.PI / 4);
    roofGeo.scale(s.w / Math.max(s.w, s.d), 1, s.d / Math.max(s.w, s.d));
    const roof = new THREE.Mesh(roofGeo, k % 3 ? roofMat : roofMat2);
    roof.position.set(x, y + hgt + 1.0, z);
    const yaw = Math.atan2(track.tx[i], track.tz[i]);
    box.rotation.y = yaw;
    roof.rotation.y = yaw;
    box.castShadow = roof.castShadow = true;
    box.receiveShadow = true;
    bGroup.add(box, roof);
    exclusions.push([x, z, Math.max(s.w, s.d) + 4]);
  });
  group.add(bGroup);

  // Spectators at the hairpins and tight corners
  onProgress?.('Mengundang penonton...');
  const specMats: THREE.Matrix4[] = [];
  const specCols: THREE.Color[] = [];
  const shirt = ['#d64541', '#2e6fd8', '#f2c230', '#ffffff', '#1d1d1d', '#e67e22', '#27ae60', '#8e44ad'];
  for (const c of track.corners) {
    if (!(c.grade === 'HAIRPIN' || c.grade === '1' || c.grade === '2' || c.grade === '3')) continue;
    const inside = c.dir === 'LEFT' ? -1 : 1;
    const count = c.grade === 'HAIRPIN' ? 14 : 6;
    for (let k = 0; k < count; k++) {
      const i = Math.min(n - 1, Math.max(0, c.apex + Math.round((rng() - 0.5) * 22)));
      const lat = (H + 5 + rng() * 6) * inside;
      const x = track.x[i] + track.rx[i] * lat + (rng() - 0.5) * 2;
      const z = track.z[i] + track.rz[i] * lat + (rng() - 0.5) * 2;
      const rf = roadField(track, x, z, 30);
      if (rf.dmin < H + 4) continue;
      const y = Math.min(Math.max(terrainHeight(x, z), track.y[i] - 0.05), track.y[i] + 0.3);
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, Math.atan2(track.x[i] - x, track.z[i] - z), 0);
      const s = 0.9 + rng() * 0.2;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      specMats.push(dummy.matrix.clone());
      specCols.push(new THREE.Color(shirt[Math.floor(rng() * shirt.length)]));
      exclusions.push([x, z, 2.5]);
    }
  }
  dummy.scale.set(1, 1, 1);
  if (specMats.length) {
    const body = colorGeo(new THREE.CylinderGeometry(0.22, 0.28, 1.15, 6), new THREE.Color(1, 1, 1));
    body.translate(0, 0.58, 0);
    const head = colorGeo(new THREE.SphereGeometry(0.19, 6, 4), new THREE.Color('#f0c8a0'));
    head.translate(0, 1.35, 0);
    const legs = colorGeo(new THREE.CylinderGeometry(0.2, 0.18, 0.1, 6), new THREE.Color('#333'));
    const geo = mergeGeometries([body, head, legs])!;
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), specMats.length);
    specMats.forEach((mm, i) => {
      m.setMatrixAt(i, mm);
      m.setColorAt(i, specCols[i]);
    });
    m.castShadow = true;
    group.add(m);
  }

  // ------------------------------------------------------------------ GATES
  const addGate = (i: number, text: string, sub: string, color: string) => {
    const x = track.x[i];
    const z = track.z[i];
    const y = track.y[i];
    const yaw = Math.atan2(track.tx[i], track.tz[i]);
    const g = new THREE.Group();
    const poleMat = new THREE.MeshLambertMaterial({ color: '#222' });
    const pole = new THREE.BoxGeometry(0.4, 6.5, 0.4);
    const p1 = new THREE.Mesh(pole, poleMat);
    const p2 = new THREE.Mesh(pole, poleMat);
    p1.position.set(H + 1.2, 3.25, 0);
    p2.position.set(-H - 1.2, 3.25, 0);
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry((H + 1.4) * 2, 1.5, 0.2),
      [
        poleMat,
        poleMat,
        poleMat,
        poleMat,
        new THREE.MeshLambertMaterial({ map: makeBannerTexture(text, sub, color) }),
        new THREE.MeshLambertMaterial({ map: makeBannerTexture(text, sub, color) }),
      ]
    );
    banner.position.set(0, 5.9, 0);
    g.add(p1, p2, banner);
    g.children.forEach((c) => (c.castShadow = true));
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    group.add(g);
    exclusions.push([x, z, 12]);
  };
  addGate(8, 'START', '榛名山 · MT. HARUNA DOWNHILL · ROUTE 33', '#c0392b');
  addGate(n - 12, 'FINISH', '伊香保 · IKAHO · SHIBUKAWA', '#1f6fb2');

  // ------------------------------------------------------------------ TREES
  onProgress?.('Menanam hutan sugi & daun lebar...');
  const treeHash = new Map<number, number[]>();
  const CH = 300;
  // tipe: 0 = sugi (cedar), 1 = cemara lebar, 2 = daun lebar, 3 = semak
  type TreeRec = { x: number; y: number; z: number; s: number; sy: number; r: number; tx: number; tz: number; c: THREE.Color };
  const chunks = new Map<number, TreeRec[][]>();
  const palettes: THREE.Color[][] = [
    ['#7a9678', '#86a083', '#719074', '#91ab8d', '#7d9a7b'], // sugi: sage-teal kalem
    ['#86a283', '#7a987c', '#94ae90', '#769479'], // cemara lebar
    ['#b9c283', '#d2b977', '#d9a97b', '#c5cc94', '#a5bd7f', '#dccb93', '#d39a7d', '#b2c58a'], // daun lebar: olive, emas, peach, terakota lembut
    ['#a6b98a', '#b7c498', '#9bb084', '#c4c79c'], // semak
  ].map((a) => a.map((c) => new THREE.Color(c)));
  const collideR = [0.42, 0.55, 0.5, 0]; // radius tabrakan dasar per tipe (semak tidak ditabrak)
  let treeCount = 0;
  const tryTree = (x: number, z: number) => {
    if (x < minX + 10 || x > maxX - 10 || z < minZ + 10 || z > maxZ - 10) return;
    const dmin = sampleGrid(dminGrid, x, z);
    if (dmin < H + BW + 2 + rng() * 3) return; // jangan di atas bench jalan
    if (dmin > 420) return;
    const dl = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
    if (dl < 1.1) return;
    const dens = fbm(x * 0.006 + 3, z * 0.006 + 9, 3);
    const accept = smoothstep(-0.45, 0.05, dens) * (dmin < 100 ? 1 : dmin < 220 ? 0.65 : 0.4);
    if (rng() > accept) return;
    for (const e of exclusions) if ((x - e[0]) ** 2 + (z - e[1]) ** 2 < e[2] * e[2]) return;
    // slope check
    const h0 = terrainHeight(x, z);
    const sl = Math.hypot(terrainHeight(x + 2, z) - h0, terrainHeight(x, z + 2) - h0) / 2;
    if (sl > 1.4) return;
    // zonasi hutan: sisi lereng tertentu hutan sugi rapat, lainnya daun lebar / campuran
    const kind = fbm(x * 0.0042 + 50, z * 0.0042 - 30, 2);
    const roll = rng();
    let type: number;
    if (roll < 0.13) type = 3;
    else if (kind > 0.12) type = roll < 0.72 ? 0 : 1;
    else if (kind < -0.18) type = roll < 0.75 ? 2 : roll < 0.88 ? 0 : 1;
    else type = roll < 0.4 ? 0 : roll < 0.52 ? 1 : 2;
    const w = type === 0 ? 0.85 + rng() * 0.5 : type === 1 ? 0.85 + rng() * 0.45 : type === 2 ? 0.8 + rng() * 0.55 : 0.7 + rng() * 0.9;
    const sy = type === 0 ? w * (0.95 + rng() * 0.35) : type === 2 ? w * (0.85 + rng() * 0.25) : w * (0.92 + rng() * 0.2);
    // warna berbercak: pohon bertetangga cenderung satu rona (rumpun emas, rumpun hijau)
    const pal = palettes[type];
    const patch = fbm(x * 0.011 + 7, z * 0.011 + 2, 2) * 0.5 + 0.5;
    const pi = Math.min(pal.length - 1, Math.floor((patch * 0.72 + rng() * 0.28) * pal.length));
    const rec: TreeRec = {
      x,
      y: h0 - 0.3,
      z,
      s: w,
      sy,
      r: rng() * Math.PI * 2,
      tx: (rng() - 0.5) * 0.07,
      tz: (rng() - 0.5) * 0.07,
      c: pal[pi].clone().multiplyScalar(0.94 + rng() * 0.12),
    };
    const ck = Math.floor(x / CH) * 1000 + Math.floor(z / CH);
    let ch = chunks.get(ck);
    if (!ch) chunks.set(ck, (ch = [[], [], [], []]));
    ch[type].push(rec);
    if (collideR[type] > 0) {
      const hk = tkey(Math.floor(x / TREE_CELL), Math.floor(z / TREE_CELL));
      let arr = treeHash.get(hk);
      if (!arr) treeHash.set(hk, (arr = []));
      arr.push(x, z, collideR[type] * w + 0.25);
    }
    treeCount++;
  };
  // near-road dense pass
  for (let k = 0; k < 52000; k++) {
    const i = Math.floor(rng() * n);
    const side = rng() < 0.5 ? -1 : 1;
    const lat = (H + 4 + Math.pow(rng(), 1.3) * 90) * side;
    tryTree(
      track.x[i] + track.rx[i] * lat + (rng() - 0.5) * 6,
      track.z[i] + track.rz[i] * lat + (rng() - 0.5) * 6
    );
  }
  // uniform pass
  for (let k = 0; k < 70000; k++) {
    tryTree(minX + rng() * (maxX - minX), minZ + rng() * (maxZ - minZ));
  }

  // geometri pohon (gradasi vertikal sudah di-bake di vertex color)
  const treeGeos = [makeCedar(), makeFir(), makeBroadleaf(), makeBush()];
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const treeGroup = new THREE.Group();
  const buildInst = (geo: THREE.BufferGeometry, list: TreeRec[], castShadow: boolean) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, treeMat, list.length);
    list.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(t.tx, t.r, t.tz);
      dummy.scale.set(t.s, t.sy, t.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, t.c);
    });
    m.castShadow = castShadow;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    treeGroup.add(m);
  };
  chunks.forEach((lists) => {
    lists.forEach((list, type) => buildInst(treeGeos[type], list, type !== 3));
  });
  dummy.scale.set(1, 1, 1);
  group.add(treeGroup);

  return {
    group,
    terrainHeight,
    treeHash,
    railL,
    railR,
    water,
    bounds: { minX, maxX, minZ, maxZ },
    treeCount,
    upSide,
  };
}
