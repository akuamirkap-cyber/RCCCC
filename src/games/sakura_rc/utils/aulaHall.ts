import * as THREE from 'three';
import { buildStaticStumbleFans } from './stumbleFans';

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
  // Default hall is 256 x 168; larger layouts (e.g. the Ebisu circuit, 215 x 172 m) grow the hall so the
  // track + run-off never touches the walls. Keep at least 36 m of apron on each side.
  const MARGIN = 36;
  return {
    width: Math.max(256, maxX - minX + MARGIN * 2),
    depth: Math.max(168, maxZ - minZ + MARGIN * 2),
    height: 26,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
  };
}

/* ---------- 6. Environment HDR prosedural HD (equirect float 2048x1024) ----------
   Meniru HDRI aula olahraga modern yang di-capture: 
   - 70 panel high-bay LED (grid 10x7) sebagai disc gaussian lembut radiansi 9–14 (HDR asli)
   - 2 pita skylight polikarbonat hangat + 12 jendela daylight dingin di dinding atas
   - Gradien dinding (atas gelap -> wainscot abu) + bounce lantai hangat
   Hasil PMREM dipakai sebagai scene.environment -> pantulan bodi mobil & lantai jadi jelas. */
export function buildProceduralHDREnv(
  pmrem: THREE.PMREMGenerator
): THREE.WebGLRenderTarget {
  const W = 2048;
  const H = 1024;
  const data = new Float32Array(W * H * 4);
  const rng = mulberry32(1337);

  // Base: gradien vertikal (plafon gelap kebiruan -> dinding abu -> lantai hangat)
  for (let y = 0; y < H; y++) {
    const v = y / H; // 0 = bawah (nadir), 1 = atas (zenith)
    let r: number, g: number, b: number;
    if (v < 0.5) {
      // Lantai -> horizon: bounce hangat memudar
      const f = v / 0.5;
      r = 0.15 * (1 - f) + 0.13 * f;
      g = 0.12 * (1 - f) + 0.125 * f;
      b = 0.105 * (1 - f) + 0.14 * f;
    } else {
      // Horizon -> plafon: dinding abu ke deck gelap
      const f = (v - 0.5) / 0.5;
      r = 0.13 * (1 - f) + 0.055 * f;
      g = 0.125 * (1 - f) + 0.06 * f;
      b = 0.14 * (1 - f) + 0.075 * f;
    }
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 1;
    }
  }

  const addRectSoft = (
    cxp: number,
    cyp: number,
    hw: number,
    hh: number,
    feather: number,
    r: number,
    g: number,
    b: number
  ) => {
    const x0 = Math.max(0, Math.floor(cxp - hw - feather));
    const x1 = Math.min(W - 1, Math.ceil(cxp + hw + feather));
    const y0 = Math.max(0, Math.floor(cyp - hh - feather));
    const y1 = Math.min(H - 1, Math.ceil(cyp + hh + feather));
    for (let y = y0; y <= y1; y++) {
      const dy = Math.max(0, Math.abs(y - cyp) - hh);
      for (let x = x0; x <= x1; x++) {
        const dx = Math.max(0, Math.abs(x - cxp) - hw);
        const d = Math.sqrt(dx * dx + dy * dy) / feather;
        if (d >= 1) continue;
        const w = 1 - d * d * (3 - 2 * d); // smoothstep falloff
        const i = (y * W + x) * 4;
        data[i] += r * w;
        data[i + 1] += g * w;
        data[i + 2] += b * w;
      }
    }
  };
  const addDisc = (cxp: number, cyp: number, rad: number, r: number, g: number, b: number) =>
    addRectSoft(cxp, cyp, 0, 0, rad, r, g, b);

  // Pilar dinding gelap tipis setiap 32 m (memberi variasi pantulan horizontal)
  for (let k = 0; k < 16; k++) {
    const px = Math.floor((k + 0.5) * (W / 16));
    for (let y = Math.floor(H * 0.5); y < Math.floor(H * 0.78); y++) {
      for (let x = px - 4; x <= px + 4; x++) {
        const i = (y * W + ((x + W) % W)) * 4;
        data[i] *= 0.7;
        data[i + 1] *= 0.7;
        data[i + 2] *= 0.72;
      }
    }
  }

  // Strip aksen sport (oranye) di dinding tengah
  addRectSoft(W / 2, H * 0.6, W, 5, 3, 0.35, 0.14, 0.03);

  // 12 jendela daylight dingin (pita atas dinding) — lembut, biru-putih
  for (let k = 0; k < 12; k++) {
    const px = 60 + k * (W / 12);
    addRectSoft(px, H * 0.715, 44, 30, 14, 2.2, 2.5, 3.0);
    // silhouette kusen
    for (let y = Math.floor(H * 0.715 - 30); y < H * 0.715 + 30; y++) {
      const i = (y * W + Math.floor(px)) * 4;
      data[i] *= 0.35;
      data[i + 1] *= 0.35;
      data[i + 2] *= 0.35;
    }
  }

  // 2 pita skylight polikarbonat (hangat, difus) di plafon
  for (const sy of [H * 0.84, H * 0.92]) {
    addRectSoft(W / 2, sy, W, 7, 12, 1.1, 1.02, 0.9);
    for (let x = 0; x < W; x += 64) {
      for (let y = Math.floor(sy - 9); y < sy + 9; y++) {
        for (let xx = x; xx < x + 4; xx++) {
          const i = (y * W + xx) * 4;
          data[i] *= 0.4;
          data[i + 1] *= 0.4;
          data[i + 2] *= 0.42;
        }
      }
    }
  }

  // 70 lampu high-bay LED grid 10x7: inti panel terang + halo lembut
  const cols = 10;
  const rows = 7;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const px = 100 + gx * ((W - 200) / (cols - 1));
      const py = H * 0.8 + gy * ((H * 0.185) / (rows - 1));
      const v = 7.5 + rng() * 3;
      addDisc(px, py, 20, v * 0.22, v * 0.215, v * 0.2); // halo
      addRectSoft(px, py, 16, 5, 5, v, v * 0.96, v * 0.9); // panel
    }
  }

  // Pantulan lampu di lantai (sport floor satin) — bayangan cermin yang kabur
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const px = 100 + gx * ((W - 200) / (cols - 1));
      const py = H * 0.2 - gy * ((H * 0.17) / (rows - 1));
      addDisc(px, py, 34, 0.3, 0.27, 0.23);
    }
  }

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  const rt = pmrem.fromEquirectangular(tex);
  tex.dispose();
  return rt;
}

/* ---------- Helper noise canvas ---------- */
function fillNoise(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
  count: number,
  alphaMax: number,
  dark = false,
  dotSize = 2
) {
  for (let i = 0; i < count; i++) {
    const a = rng() * alphaMax;
    ctx.fillStyle = dark ? `rgba(0,0,0,${a.toFixed(3)})` : `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.fillRect(rng() * size, rng() * size, dotSize, dotSize);
  }
}

export type HallTheme = 'parquet_aula' | 'epoxy_hall' | 'carpet_convention';

interface FloorMaps {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

/* ---------- 2b. Lantai HD per tema: albedo 1024 + roughness map + bump map ---------- */
function createHDFloorMaps(theme: HallTheme, seed: number, repeatX: number, repeatY: number): FloorMaps {
  const S = 1024;
  const rng = mulberry32(seed);
  const albedo = document.createElement('canvas');
  albedo.width = S;
  albedo.height = S;
  const a = albedo.getContext('2d')!;
  const rough = document.createElement('canvas');
  rough.width = S;
  rough.height = S;
  const r = rough.getContext('2d')!;
  const bump = document.createElement('canvas');
  bump.width = S;
  bump.height = S;
  const b = bump.getContext('2d')!;

  // Default roughness (abu 0.5) & bump datar
  r.fillStyle = '#808080';
  r.fillRect(0, 0, S, S);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, S, S);

  if (theme === 'parquet_aula') {
    // Lantai kayu maple lapangan basket: papan 1024/8 lebar, panjang acak, pernis glossy
    const plankW = S / 8;
    const woods = ['#C99A5B', '#D4A868', '#BF8E52', '#CDA062', '#B9864B', '#D9B072'];
    for (let col = 0; col < 8; col++) {
      let y = -Math.floor(rng() * 200);
      while (y < S) {
        const len = 180 + Math.floor(rng() * 220);
        a.fillStyle = woods[Math.floor(rng() * woods.length)];
        a.fillRect(col * plankW, y, plankW, len);
        // serat kayu
        const grain = 10 + Math.floor(rng() * 8);
        for (let g = 0; g < grain; g++) {
          a.strokeStyle = `rgba(90,55,20,${(0.06 + rng() * 0.1).toFixed(3)})`;
          a.lineWidth = 1 + rng() * 1.5;
          const gx = col * plankW + rng() * plankW;
          a.beginPath();
          a.moveTo(gx, y);
          a.bezierCurveTo(gx + (rng() - 0.5) * 12, y + len * 0.3, gx + (rng() - 0.5) * 12, y + len * 0.7, gx + (rng() - 0.5) * 6, y + len);
          a.stroke();
        }
        // sambungan papan
        a.fillStyle = 'rgba(60,35,15,0.55)';
        a.fillRect(col * plankW, y + len - 2, plankW, 2);
        b.fillStyle = '#6a6a6a';
        b.fillRect(col * plankW, y + len - 2, plankW, 2);
        // variasi roughness per papan (pernis tidak merata)
        r.fillStyle = `rgb(${Math.floor(60 + rng() * 40)},${Math.floor(60 + rng() * 40)},${Math.floor(60 + rng() * 40)})`;
        r.fillRect(col * plankW, y, plankW, len);
        y += len;
      }
      a.fillStyle = 'rgba(50,30,10,0.5)';
      a.fillRect(col * plankW - 1, 0, 2, S);
      b.fillStyle = '#666';
      b.fillRect(col * plankW - 1, 0, 2, S);
    }
    fillNoise(a, S, rng, 2600, 0.05);
    fillNoise(a, S, rng, 2600, 0.07, true);
    // goresan sepatu/ban: bekas glossy
    for (let i = 0; i < 40; i++) {
      r.strokeStyle = `rgba(0,0,0,${(0.08 + rng() * 0.15).toFixed(3)})`;
      r.lineWidth = 2 + rng() * 6;
      r.beginPath();
      const x0 = rng() * S, y0 = rng() * S;
      r.moveTo(x0, y0);
      r.quadraticCurveTo(x0 + (rng() - 0.5) * 300, y0 + (rng() - 0.5) * 300, x0 + (rng() - 0.5) * 500, y0 + (rng() - 0.5) * 500);
      r.stroke();
    }
  } else if (theme === 'epoxy_hall') {
    // Epoxy abu-biru mengkilap dengan nat 4x4 & flake metalik
    a.fillStyle = '#394457';
    a.fillRect(0, 0, S, S);
    const tile = S / 4;
    for (let ty = 0; ty < 4; ty++) {
      for (let tx = 0; tx < 4; tx++) {
        const shade = 0.92 + rng() * 0.16;
        a.fillStyle = `rgb(${Math.floor(57 * shade)},${Math.floor(68 * shade)},${Math.floor(87 * shade)})`;
        a.fillRect(tx * tile + 2, ty * tile + 2, tile - 4, tile - 4);
      }
    }
    a.strokeStyle = '#1F2633';
    a.lineWidth = 4;
    b.strokeStyle = '#5a5a5a';
    b.lineWidth = 5;
    for (let i = 0; i <= S; i += tile) {
      a.beginPath(); a.moveTo(i, 0); a.lineTo(i, S); a.stroke();
      a.beginPath(); a.moveTo(0, i); a.lineTo(S, i); a.stroke();
      b.beginPath(); b.moveTo(i, 0); b.lineTo(i, S); b.stroke();
      b.beginPath(); b.moveTo(0, i); b.lineTo(S, i); b.stroke();
    }
    fillNoise(a, S, rng, 5000, 0.12, false, 1);
    fillNoise(a, S, rng, 3000, 0.12, true, 1);
    r.fillStyle = '#5c5c5c';
    r.fillRect(0, 0, S, S);
    fillNoise(r, S, rng, 2500, 0.2, true, 3);
    fillNoise(b, S, rng, 2500, 0.1, false, 1);
  } else {
    // Karpet / P-tile convention: ubin 2x2 abu dengan speckle & tekstur anyaman halus
    a.fillStyle = '#4A5160';
    a.fillRect(0, 0, S, S);
    const tile = S / 4;
    for (let ty = 0; ty < 4; ty++) {
      for (let tx = 0; tx < 4; tx++) {
        const shade = 0.9 + rng() * 0.2;
        a.fillStyle = `rgb(${Math.floor(74 * shade)},${Math.floor(81 * shade)},${Math.floor(96 * shade)})`;
        a.fillRect(tx * tile + 2, ty * tile + 2, tile - 4, tile - 4);
      }
    }
    a.strokeStyle = '#2A2F3A';
    a.lineWidth = 3;
    b.strokeStyle = '#606060';
    b.lineWidth = 4;
    for (let i = 0; i <= S; i += tile) {
      a.beginPath(); a.moveTo(i, 0); a.lineTo(i, S); a.stroke();
      a.beginPath(); a.moveTo(0, i); a.lineTo(S, i); a.stroke();
      b.beginPath(); b.moveTo(i, 0); b.lineTo(i, S); b.stroke();
      b.beginPath(); b.moveTo(0, i); b.lineTo(S, i); b.stroke();
    }
    // anyaman P-tile halus
    for (let y = 0; y < S; y += 4) {
      a.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.035)';
      a.fillRect(0, y, S, 2);
    }
    fillNoise(a, S, rng, 4500, 0.08);
    fillNoise(a, S, rng, 3500, 0.12, true);
    fillNoise(a, S, rng, 500, 0.05, false, 3);
    r.fillStyle = '#9a9a9a';
    r.fillRect(0, 0, S, S);
    fillNoise(r, S, rng, 3000, 0.25, true, 3);
    fillNoise(b, S, rng, 6000, 0.12, false, 1);
    fillNoise(b, S, rng, 6000, 0.12, true, 1);
  }

  const mk = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: mk(albedo, true), roughnessMap: mk(rough, false), bumpMap: mk(bump, false) };
}

/* ---------- 3b. Dinding HD: panel beton precast + jendela + strip sport + wainscot akustik ---------- */
function createHDWallMaps(accentHex: string): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const Wc = 1024;
  const Hc = 1024;
  const rng = mulberry32(9090);
  const c = document.createElement('canvas');
  c.width = Wc;
  c.height = Hc;
  const ctx = c.getContext('2d')!;
  const bc = document.createElement('canvas');
  bc.width = Wc;
  bc.height = Hc;
  const bctx = bc.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, Wc, Hc);

  // Skala: 1024 px = 26 m tinggi -> ~39 px/m. Tekstur di-repeat horizontal tiap 32 m (1 kolom bay).
  // Zona (dari atas): 0–120 deck/trim gelap, 120–330 panel beton atas + jendela, 330–600 panel beton,
  // 600–660 strip sport, 660–940 wainscot akustik, 940–1024 baseboard.
  ctx.fillStyle = '#1B2130';
  ctx.fillRect(0, 0, Wc, 120);
  // Panel beton precast dengan gradasi & noda
  const grad = ctx.createLinearGradient(0, 120, 0, 600);
  grad.addColorStop(0, '#8B9099');
  grad.addColorStop(1, '#A1A6AE');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 120, Wc, 480);
  fillNoise(ctx, Wc, rng, 7000, 0.05, true, 2);
  fillNoise(ctx, Wc, rng, 7000, 0.05, false, 2);
  // sambungan panel (vertikal tiap 256 px = 8 m, horizontal tiap 160 px)
  ctx.strokeStyle = 'rgba(30,35,45,0.75)';
  ctx.lineWidth = 4;
  bctx.strokeStyle = '#505050';
  bctx.lineWidth = 5;
  for (let x = 0; x <= Wc; x += 256) {
    ctx.beginPath(); ctx.moveTo(x, 120); ctx.lineTo(x, 600); ctx.stroke();
    bctx.beginPath(); bctx.moveTo(x, 120); bctx.lineTo(x, 600); bctx.stroke();
  }
  for (let y = 120; y <= 600; y += 160) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(Wc, y); ctx.stroke();
    bctx.beginPath(); bctx.moveTo(0, y); bctx.lineTo(Wc, y); bctx.stroke();
  }
  // Jendela clerestory kaca biru dengan kusen aluminium (2 per bay)
  for (const wx of [96, 608]) {
    const ww = 320, wh = 150, wy = 150;
    const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0, '#DCEBFA');
    g.addColorStop(1, '#9CC3E8');
    ctx.fillStyle = g;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.strokeStyle = '#D5D9DF';
    ctx.lineWidth = 8;
    ctx.strokeRect(wx, wy, ww, wh);
    ctx.fillStyle = '#D5D9DF';
    ctx.fillRect(wx + ww / 2 - 4, wy, 8, wh);
    ctx.fillRect(wx + ww / 4 - 3, wy, 6, wh);
    ctx.fillRect(wx + (3 * ww) / 4 - 3, wy, 6, wh);
    ctx.fillRect(wx, wy + wh / 2 - 3, ww, 6);
    bctx.fillStyle = '#3a3a3a';
    bctx.fillRect(wx, wy, ww, wh);
    bctx.fillStyle = '#a0a0a0';
    bctx.fillRect(wx - 4, wy - 4, ww + 8, 8);
    bctx.fillRect(wx - 4, wy + wh - 4, ww + 8, 8);
  }
  // Strip sport oranye + pinstripe putih + aksen sirkuit
  ctx.fillStyle = '#F97316';
  ctx.fillRect(0, 600, Wc, 60);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 600, Wc, 6);
  ctx.fillRect(0, 654, Wc, 6);
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 626, Wc, 8);
  // Wainscot panel akustik (kain abu) dengan kisi 128 px
  const wg = ctx.createLinearGradient(0, 660, 0, 940);
  wg.addColorStop(0, '#5B6371');
  wg.addColorStop(1, '#4A515E');
  ctx.fillStyle = wg;
  ctx.fillRect(0, 660, Wc, 280);
  for (let x = 0; x < Wc; x += 128) {
    for (let y = 660; y < 940; y += 140) {
      ctx.fillStyle = `rgba(255,255,255,${(0.02 + rng() * 0.04).toFixed(3)})`;
      ctx.fillRect(x + 6, y + 6, 116, 128);
      ctx.strokeStyle = 'rgba(20,24,32,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 6, y + 6, 116, 128);
      bctx.strokeStyle = '#5a5a5a';
      bctx.lineWidth = 4;
      bctx.strokeRect(x + 6, y + 6, 116, 128);
    }
  }
  // tekstur kain
  for (let y = 660; y < 940; y += 3) {
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, y, Wc, 1);
  }
  // Baseboard karet hitam + garis kuning safety
  ctx.fillStyle = '#15181F';
  ctx.fillRect(0, 940, Wc, 84);
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(0, 944, Wc, 6);
  bctx.fillStyle = '#9a9a9a';
  bctx.fillRect(0, 940, Wc, 84);

  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = 16;
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bc);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;
  bumpMap.anisotropy = 8;
  return { map, bumpMap };
}

/* ---------- Plafon: metal deck bergelombang (bump) ---------- */
function createCeilingDeckMaps(): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const bc = document.createElement('canvas');
  bc.width = S;
  bc.height = S;
  const bctx = bc.getContext('2d')!;
  ctx.fillStyle = '#2A2F3A';
  ctx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 32) {
    const g = ctx.createLinearGradient(x, 0, x + 32, 0);
    g.addColorStop(0, '#232833');
    g.addColorStop(0.5, '#343A47');
    g.addColorStop(1, '#232833');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 32, S);
    const bg = bctx.createLinearGradient(x, 0, x + 32, 0);
    bg.addColorStop(0, '#404040');
    bg.addColorStop(0.5, '#c0c0c0');
    bg.addColorStop(1, '#404040');
    bctx.fillStyle = bg;
    bctx.fillRect(x, 0, 32, S);
  }
  const mk = (cv: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(128, 84);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: mk(c, true), bumpMap: mk(bc, false) };
}

/* ---------- Glow sprite radial untuk lampu ---------- */
function createGlowTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,248,230,0.85)');
  g.addColorStop(0.25, 'rgba(255,244,220,0.35)');
  g.addColorStop(0.6, 'rgba(255,240,210,0.08)');
  g.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  frame: HallFrame,
  hallTheme: HallTheme = 'carpet_convention'
): AulaBuilt {
  const { width: W, depth: D, height: H, cx, cz } = frame;
  const rng = mulberry32(20240);
  const aulaGroup = new THREE.Group();
  scene.add(aulaGroup);

  const dummy = new THREE.Object3D();

  // --- Lantai HD: albedo + roughness map + bump, clearcoat ala pernis/epoxy ---
  // 1 repeat tekstur = 4 ubin (atau 8 papan) ≈ 4.6 m
  const floorMaps = createHDFloorMaps(hallTheme, 77, W / 4.6, D / 4.6);
  const floorPhys: Record<HallTheme, { rough: number; cc: number; ccr: number; env: number; bump: number }> = {
    parquet_aula: { rough: 0.38, cc: 0.85, ccr: 0.18, env: 1.1, bump: 0.012 },
    epoxy_hall: { rough: 0.3, cc: 0.9, ccr: 0.12, env: 1.2, bump: 0.008 },
    carpet_convention: { rough: 0.55, cc: 0.45, ccr: 0.35, env: 0.85, bump: 0.015 },
  };
  const fp = floorPhys[hallTheme];
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshPhysicalMaterial({
      map: floorMaps.map,
      roughnessMap: floorMaps.roughnessMap,
      bumpMap: floorMaps.bumpMap,
      bumpScale: fp.bump,
      roughness: fp.rough,
      metalness: 0.0,
      clearcoat: fp.cc,
      clearcoatRoughness: fp.ccr,
      envMapIntensity: fp.env,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  aulaGroup.add(floor);

  // --- 4 dinding HD (panel beton + clerestory + strip sport + wainscot akustik) ---
  const wallMaps = createHDWallMaps(accentColor);
  const mkWall = (w: number, x: number, z: number, ry: number) => {
    const map = wallMaps.map.clone();
    map.repeat.set(w / 32, 1);
    map.needsUpdate = true;
    const bumpMap = wallMaps.bumpMap.clone();
    bumpMap.repeat.set(w / 32, 1);
    bumpMap.needsUpdate = true;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, H, 1, 1),
      new THREE.MeshStandardMaterial({
        map,
        bumpMap,
        bumpScale: 0.06,
        roughness: 0.78,
        metalness: 0.0,
        envMapIntensity: 0.6,
      })
    );
    m.position.set(x, H / 2, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    aulaGroup.add(m);
  };
  mkWall(W, cx, cz - D / 2, 0);
  mkWall(W, cx, cz + D / 2, Math.PI);
  mkWall(D, cx + W / 2, cz, -Math.PI / 2);
  mkWall(D, cx - W / 2, cz, Math.PI / 2);

  // --- Plafon metal deck bergelombang ---
  const deck = createCeilingDeckMaps();
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({
      map: deck.map,
      bumpMap: deck.bumpMap,
      bumpScale: 0.05,
      roughness: 0.6,
      metalness: 0.55,
      envMapIntensity: 0.5,
    })
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

  // --- 7. 70 armatur high-bay LED HD digantung 7 m di bawah plafon (terlihat dari chase cam):
  //        housing + panel emissive HDR + halo glow + kerucut cahaya volumetrik + 8 SpotLight nyata ---
  {
    const cols = 10;
    const rows = 7;
    const HANG = 7.0; // panjang gantungan dari plafon
    const lampY = H - HANG;
    const lampPos: [number, number][] = [];
    for (let r = 0; r < rows; r++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        lampPos.push([cx - 100 + cIdx * (200 / 9), cz - 63 + r * (126 / 6)]);
      }
    }
    // Housing aluminium gelap (reflektor) + rangka gantung
    const housing = new THREE.InstancedMesh(
      new THREE.BoxGeometry(5.2, 0.5, 2.1),
      new THREE.MeshStandardMaterial({ color: '#2E333D', roughness: 0.45, metalness: 0.8 }),
      lampPos.length
    );
    // Panel difuser emissive — intensitas > 1 agar terbaca HDR oleh tone mapping
    const panel = new THREE.InstancedMesh(
      new THREE.BoxGeometry(4.6, 0.12, 1.6),
      new THREE.MeshStandardMaterial({
        color: '#FFFFFF',
        emissive: '#FFF4E2',
        emissiveIntensity: 6.5,
        roughness: 0.35,
        metalness: 0.0,
      }),
      lampPos.length
    );
    // Halo glow additive (plane horizontal di bawah panel)
    const glow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(14, 8),
      new THREE.MeshBasicMaterial({
        map: createGlowTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        opacity: 0.6,
      }),
      lampPos.length
    );
    // Kerucut cahaya volumetrik: cone terbuka dengan vertex color terang di atas -> hitam di bawah
    const coneH = 15;
    const coneGeo = new THREE.CylinderGeometry(2.3, 7.5, coneH, 24, 1, true);
    {
      const pos = coneGeo.attributes.position;
      const colArr = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) + coneH / 2) / coneH; // 1 = atas (dekat lampu)
        const v = Math.pow(t, 1.6);
        colArr[i * 3] = v;
        colArr[i * 3 + 1] = v * 0.97;
        colArr[i * 3 + 2] = v * 0.9;
      }
      coneGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    }
    const cone = new THREE.InstancedMesh(
      coneGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.075,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
      lampPos.length
    );
    // Kabel gantung panjang
    const cable = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.035, 0.035, HANG - 0.3, 6),
      new THREE.MeshStandardMaterial({ color: '#4B5563', roughness: 0.6, metalness: 0.5 }),
      lampPos.length * 2
    );
    lampPos.forEach(([x, z], i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.position.set(x, lampY + 0.3, z);
      dummy.updateMatrix();
      housing.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, lampY, z);
      dummy.updateMatrix();
      panel.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, lampY - 0.25, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      glow.setMatrixAt(i, dummy.matrix);
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(x, lampY - 0.3 - coneH / 2, z);
      dummy.updateMatrix();
      cone.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x - 2.2, lampY + 0.55 + (HANG - 0.3) / 2, z);
      dummy.updateMatrix();
      cable.setMatrixAt(i * 2, dummy.matrix);
      dummy.position.set(x + 2.2, lampY + 0.55 + (HANG - 0.3) / 2, z);
      dummy.updateMatrix();
      cable.setMatrixAt(i * 2 + 1, dummy.matrix);
    });
    housing.instanceMatrix.needsUpdate = true;
    panel.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
    cone.instanceMatrix.needsUpdate = true;
    cable.instanceMatrix.needsUpdate = true;
    glow.renderOrder = 5;
    cone.renderOrder = 4;
    aulaGroup.add(housing, panel, glow, cone, cable);

    // 8 SpotLight nyata (grid 4x2, tanpa shadow) dari ketinggian lampu -> kolam cahaya jelas di lantai
    for (let r = 0; r < 2; r++) {
      for (let cIdx = 0; cIdx < 4; cIdx++) {
        const lx = cx - 75 + cIdx * 50;
        const lz = cz - 31.5 + r * 63;
        const spot = new THREE.SpotLight('#FFF3E0', 330, 0, 1.0, 0.7, 1.7);
        spot.position.set(lx, lampY - 0.2, lz);
        spot.target.position.set(lx, 0, lz);
        spot.castShadow = false;
        aulaGroup.add(spot, spot.target);
      }
    }

    // 2 pita skylight polikarbonat di plafon (emissive hangat, sejajar HDR)
    const skyMat = new THREE.MeshStandardMaterial({
      color: '#FFFFFF',
      emissive: '#FFF1DC',
      emissiveIntensity: 1.6,
      roughness: 0.9,
    });
    for (const sz of [cz - D / 6, cz + D / 6]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(W - 20, 3.2), skyMat);
      strip.rotation.x = Math.PI / 2;
      strip.position.set(cx, H - 0.05, sz);
      aulaGroup.add(strip);
      // bingkai rangka skylight
      const frame = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.16, 0.2, 3.4),
        new THREE.MeshStandardMaterial({ color: '#1F242E', roughness: 0.6, metalness: 0.6 }),
        Math.floor((W - 20) / 4)
      );
      for (let i = 0; i < frame.count; i++) {
        dummy.rotation.set(0, 0, 0);
        dummy.position.set(cx - (W - 20) / 2 + i * 4 + 2, H - 0.12, sz);
        dummy.updateMatrix();
        frame.setMatrixAt(i, dummy.matrix);
      }
      frame.instanceMatrix.needsUpdate = true;
      aulaGroup.add(frame);
    }

    // Wall-pack LED flood di tiap kolom (tinggi 9 m) menghadap ke dalam: badan + lensa emissive + glow
    const packSpots: { x: number; z: number; ry: number }[] = [];
    for (let x = -96; x <= 96; x += 32) {
      packSpots.push({ x: cx + x, z: cz - D / 2 + 2.3, ry: 0 });
      packSpots.push({ x: cx + x, z: cz + D / 2 - 2.3, ry: Math.PI });
    }
    for (let z = -64; z <= 64; z += 32) {
      packSpots.push({ x: cx - W / 2 + 2.3, z: cz + z, ry: Math.PI / 2 });
      packSpots.push({ x: cx + W / 2 - 2.3, z: cz + z, ry: -Math.PI / 2 });
    }
    const packBody = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.4, 0.7, 0.5),
      new THREE.MeshStandardMaterial({ color: '#262B35', roughness: 0.5, metalness: 0.7 }),
      packSpots.length
    );
    const packLens = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.2, 0.5),
      new THREE.MeshStandardMaterial({
        color: '#FFFFFF',
        emissive: '#FFF6E8',
        emissiveIntensity: 5,
        roughness: 0.3,
      }),
      packSpots.length
    );
    const packGlow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({
        map: createGlowTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        opacity: 0.5,
        fog: false,
      }),
      packSpots.length
    );
    packSpots.forEach((pk, i) => {
      const nx = Math.sin(pk.ry);
      const nz = Math.cos(pk.ry);
      dummy.position.set(pk.x, 9, pk.z);
      dummy.rotation.set(0, pk.ry, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      packBody.setMatrixAt(i, dummy.matrix);
      dummy.position.set(pk.x + nx * 0.27, 8.9, pk.z + nz * 0.27);
      dummy.rotation.set(-0.35, pk.ry, 0, 'YXZ');
      dummy.updateMatrix();
      packLens.setMatrixAt(i, dummy.matrix);
      dummy.position.set(pk.x + nx * 0.6, 8.8, pk.z + nz * 0.6);
      dummy.rotation.set(0, pk.ry, 0);
      dummy.updateMatrix();
      packGlow.setMatrixAt(i, dummy.matrix);
    });
    packBody.instanceMatrix.needsUpdate = true;
    packLens.instanceMatrix.needsUpdate = true;
    packGlow.instanceMatrix.needsUpdate = true;
    packGlow.renderOrder = 5;
    aulaGroup.add(packBody, packLens, packGlow);
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
    // Penonton gaya Stumble Guys (kepala kotak-bulat besar, mata titik, badan gempal, topi acak),
    // semuanya menghadap ke tengah lintasan.
    const fans = buildStaticStumbleFans(
      filled.map((st) => ({
        x: st.x,
        y: st.y,
        z: st.z,
        yaw: Math.atan2(cx - st.x, cz - st.z) + (rng() - 0.5) * 0.4,
        sc: 0.95 + rng() * 0.2,
      })),
      rng
    );
    aulaGroup.add(fans);
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
