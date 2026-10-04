import * as THREE from 'three';
import { Track, HALF_WIDTH, CURB_WIDTH, WALL_DIST, TRACK_WIDTH } from './track';
import type { DriftZone } from './zones';
import { makeGridNumber } from './proVenue';

/* ============================================================
   PRO CIRCUIT SURFACE — iRacing-style track dressing
   - 1024² procedural aggregate asphalt (colour + normal + roughness; cool neutral grey)
   - crisp white edge lines as geometry (not baked in the texture)
   - raised FIA red/white kerbs only through the corners (2 m segments)
   - green/white exit kerbs on corner exits
   - run-off: tarmac strip + gravel traps on the outside of corners, grass elsewhere
   - start/finish: grid boxes, pole marker; sector lines S1/S2
   - braking boards 150/100/50 m before every drift-zone corner
   - marshal posts with flags at the corner apexes
   ============================================================ */


function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ */
/*  Textures                                                           */
/* ------------------------------------------------------------------ */

/**
 * Realistic racing asphalt (1024², tiles every 3.5 m): dark cool-grey bitumen binder with
 * embedded aggregate stones of varied grey, a fine sand fraction, very gentle large-scale
 * tone variation (never blotchy) and a matching normal + roughness map so stones catch
 * the sun while the binder stays matte. Colour is deliberately slightly blue-grey so it
 * reads neutral next to the saturated green grass (a pure grey looks brown by contrast).
 */
export function makeProAsphalt(): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const S = 1024;
  const rnd = mulberry32(90210);
  const h = new Float32Array(S * S); // height (0 = binder, up to 1 = stone crown)
  const col = new Float32Array(S * S * 3);
  const rough = new Float32Array(S * S).fill(0.97);

  // --- tileable value noise for the large-scale tone (very low amplitude) ---
  const G = 16;
  const grid = new Float32Array(G * G);
  for (let i = 0; i < G * G; i++) grid[i] = rnd();
  const noise = (x: number, y: number) => {
    const fx = (x / S) * G;
    const fy = (y / S) * G;
    const x0 = Math.floor(fx) % G;
    const y0 = Math.floor(fy) % G;
    const x1 = (x0 + 1) % G;
    const y1 = (y0 + 1) % G;
    const tx = smoothstep(0, 1, fx - Math.floor(fx));
    const ty = smoothstep(0, 1, fy - Math.floor(fy));
    const a = grid[y0 * G + x0] * (1 - tx) + grid[y0 * G + x1] * tx;
    const b = grid[y1 * G + x0] * (1 - tx) + grid[y1 * G + x1] * tx;
    return a * (1 - ty) + b * ty;
  };

  // --- binder base: cool dark grey, ±3 % slow variation, per-texel sand speckle ---
  const BASE = [0.235, 0.245, 0.265]; // sRGB-ish 60/62/68 → blue-grey bitumen
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const n = (noise(x, y) - 0.5) * 0.06 + (rnd() - 0.5) * 0.05;
      col[i * 3] = BASE[0] + n;
      col[i * 3 + 1] = BASE[1] + n;
      col[i * 3 + 2] = BASE[2] + n;
      h[i] = rnd() * 0.12;
    }
  }

  // --- aggregate stones: irregular discs with a bright crown and darker rim ---
  const putStone = (cx: number, cy: number, r: number, shade: number, cool: number) => {
    const R = Math.ceil(r + 1);
    const ex = 0.75 + rnd() * 0.5; // ellipse ratio
    const ang = rnd() * Math.PI;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const u = (dx * ca + dy * sa) / r;
        const v = (-dx * sa + dy * ca) / (r * ex);
        const d = Math.hypot(u, v);
        if (d > 1) continue;
        const x = (cx + dx + S) % S;
        const y = (cy + dy + S) % S;
        const i = y * S + x;
        const crown = 1 - d * d; // dome profile
        const hh = 0.25 + crown * 0.75;
        if (hh <= h[i]) continue;
        h[i] = hh;
        const lit = shade * (0.78 + crown * 0.3); // crown brighter than the rim
        col[i * 3] = lit - cool * 0.01;
        col[i * 3 + 1] = lit;
        col[i * 3 + 2] = lit + cool * 0.02;
        rough[i] = 0.72 + (1 - crown) * 0.2; // polished stone crowns reflect the sky a little
      }
    }
  };
  // size distribution: lots of fine chips, fewer coarse stones (texture spans 3.5 m → 1 px ≈ 3.4 mm)
  for (let i = 0; i < 26000; i++) putStone(rnd() * S, rnd() * S, 1.2 + rnd() * 1.2, 0.30 + rnd() * 0.16, rnd());
  for (let i = 0; i < 9000; i++) putStone(rnd() * S, rnd() * S, 2.2 + rnd() * 1.6, 0.32 + rnd() * 0.2, rnd());
  for (let i = 0; i < 1400; i++) putStone(rnd() * S, rnd() * S, 3.4 + rnd() * 1.8, 0.36 + rnd() * 0.22, rnd());
  // a few pale quartz / feldspar chips
  for (let i = 0; i < 350; i++) putStone(rnd() * S, rnd() * S, 1.4 + rnd() * 1.4, 0.58 + rnd() * 0.18, rnd());

  // --- colour map ---
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < S * S; i++) {
    d[i * 4] = clamp(col[i * 3] * 255, 0, 255);
    d[i * 4 + 1] = clamp(col[i * 3 + 1] * 255, 0, 255);
    d[i * 4 + 2] = clamp(col[i * 3 + 2] * 255, 0, 255);
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;

  // --- normal map from the height field (Sobel) ---
  const nc = document.createElement('canvas');
  nc.width = nc.height = S;
  const nctx = nc.getContext('2d')!;
  const nimg = nctx.createImageData(S, S);
  const nd = nimg.data;
  const Hs = (x: number, y: number) => h[((y + S) % S) * S + ((x + S) % S)];
  const strength = 2.2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (Hs(x + 1, y) - Hs(x - 1, y)) * strength;
      const dy = (Hs(x, y + 1) - Hs(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      nd[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nd[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      nd[i + 2] = (1 / len) * 255;
      nd[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  const normalMap = new THREE.CanvasTexture(nc);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

  // --- roughness map (green channel) ---
  const rc = document.createElement('canvas');
  rc.width = rc.height = S;
  const rctx = rc.getContext('2d')!;
  const rimg = rctx.createImageData(S, S);
  const rd = rimg.data;
  for (let i = 0; i < S * S; i++) {
    const v = clamp(rough[i] * 255, 0, 255);
    rd[i * 4] = v;
    rd[i * 4 + 1] = v;
    rd[i * 4 + 2] = v;
    rd[i * 4 + 3] = 255;
  }
  rctx.putImageData(rimg, 0, 0);
  const roughnessMap = new THREE.CanvasTexture(rc);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  return { map, normalMap, roughnessMap };
}

function makeBoardTexture(text: string, stripes: number, bg = '#ffd60a', fg = '#101114'): THREE.CanvasTexture {
  const W = 256;
  const H = 192;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = fg;
  ctx.fillRect(0, 0, W, 8);
  ctx.fillRect(0, H - 8, W, 8);
  // diagonal stripe marks (3 = 150, 2 = 100, 1 = 50)
  for (let i = 0; i < stripes; i++) {
    ctx.fillRect(16 + i * 22, 22, 12, 60);
  }
  ctx.font = 'bold 92px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W - 16, H / 2 + 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSmallTextTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = fg;
  ctx.font = 'bold 84px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeGridBoxTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 256);
  ctx.strokeStyle = '#f4f4f0';
  ctx.lineWidth = 10;
  // open-ended grid slot: two side bars + rear bar (FIA style)
  ctx.beginPath();
  ctx.moveTo(6, 6);
  ctx.lineTo(6, 250);
  ctx.lineTo(122, 250);
  ctx.lineTo(122, 6);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                   */
/* ------------------------------------------------------------------ */

type ColumnFn = (i: number) => { off: number; y: number; color?: THREE.Color }[];

/** Generic multi-column strip along the whole loop: columns given per sample (lateral offset, height, colour). */
function buildColumnsStrip(track: Track, cols: number, fn: ColumnFn, uvScale = 1, range?: { start: number; len: number }): THREE.BufferGeometry {
  const n = track.count;
  const s = track.samples;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const count = range ? range.len : n;
  const start = range ? range.start : 0;
  let hasColor = false;
  for (let k = 0; k <= count; k++) {
    const i = (start + k) % n;
    const sm = s[i];
    const cs = fn(i);
    const v = ((range ? k * track.spacing : k === n ? track.length : sm.dist) / uvScale);
    for (let c = 0; c < cols; c++) {
      const cc = cs[c];
      pos.push(sm.x + sm.rx * cc.off, cc.y, sm.z + sm.rz * cc.off);
      uv.push(c / (cols - 1), v);
      nor.push(0, 1, 0);
      if (cc.color) {
        hasColor = true;
        col.push(cc.color.r, cc.color.g, cc.color.b);
      } else col.push(1, 1, 1);
    }
  }
  for (let k = 0; k < count; k++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = k * cols + c;
      const b = a + cols;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (hasColor) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function windowAbsMax(track: Track, i: number, back: number, ahead: number): number {
  const n = track.count;
  let m = 0;
  for (let k = -back; k <= ahead; k++) m = Math.max(m, Math.abs(track.samples[(i + k + n) % n].curv));
  return m;
}

export interface ProCircuitOptions {
  aniso: number;
  groundY: number;
}

/** Builds the full pro track dressing. Returns the meshes it added (for disposal if ever needed). */
export function buildProCircuit(scene: THREE.Scene, track: Track, zones: DriftZone[], o: ProCircuitOptions): THREE.Object3D[] {
  const n = track.count;
  const s = track.samples;
  const out: THREE.Object3D[] = [];
  const add = (obj: THREE.Object3D) => {
    scene.add(obj);
    out.push(obj);
    return obj;
  };
  const Y0 = o.groundY;

  /* ---------- precomputed per-sample corner weights ---------- */
  const cornerW = new Float32Array(n); // 0 straight .. 1 full corner (kerbs)
  for (let i = 0; i < n; i++) {
    const cw = windowAbsMax(track, i, 6, 6);
    cornerW[i] = smoothstep(0.0055, 0.0095, cw);
  }

  /* ---------- asphalt ---------- */
  const tex = makeProAsphalt();
  tex.map.anisotropy = o.aniso;
  tex.normalMap.anisotropy = o.aniso;
  tex.roughnessMap.anisotropy = o.aniso;
  const roadGeo = buildColumnsStrip(track, 2, () => [
    { off: -HALF_WIDTH - 0.05, y: 0.01 },
    { off: HALF_WIDTH + 0.05, y: 0.01 },
  ], 7);
  // UV: u spans the width (14 m) once, v repeats every 7 m → tile 4×2 so one tile = 3.5 m (stones ≈ 5–15 mm)
  for (const m of [tex.map, tex.normalMap, tex.roughnessMap]) m.repeat.set(4, 2);
  const roadMat = new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughnessMap: tex.roughnessMap,
    roughness: 1.0,
    metalness: 0.0,
    color: '#ffffff', // the texture carries the (cool-neutral) colour untouched
    envMapIntensity: 0.4, // a touch of blue sky in the stone crowns — the real reason asphalt reads grey-blue outdoors
    side: THREE.DoubleSide,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  road.name = 'ProAsphalt';
  add(road);

  /* ---------- white edge lines (geometry) ---------- */
  const lineMat = new THREE.MeshStandardMaterial({ color: '#f3f1ea', roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (const side of [1, -1] as const) {
    const g = buildColumnsStrip(track, 2, () => [
      { off: (HALF_WIDTH - 0.22) * side, y: 0.018 },
      { off: (HALF_WIDTH - 0.02) * side, y: 0.018 },
    ]);
    const m = new THREE.Mesh(g, lineMat);
    m.receiveShadow = true;
    add(m);
  }

  /* ---------- raised FIA kerbs through the corners ---------- */
  const red = new THREE.Color('#d7263d');
  const white = new THREE.Color('#f4f4f2');
  const kerbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
  for (const side of [1, -1] as const) {
    // find contiguous corner ranges
    let i = 0;
    const ranges: { start: number; len: number }[] = [];
    // start on a straight
    let s0 = 0;
    while (s0 < n && cornerW[s0] > 0) s0++;
    let visited = 0;
    i = s0 % n;
    while (visited < n) {
      if (cornerW[i] > 0) {
        const st = i;
        let len = 0;
        while (visited < n && cornerW[i] > 0) {
          len++;
          visited++;
          i = (i + 1) % n;
        }
        ranges.push({ start: st, len });
      } else {
        visited++;
        i = (i + 1) % n;
      }
    }
    for (const r of ranges) {
      if (r.len < 6) continue;
      const g = buildColumnsStrip(
        track,
        4,
        (k) => {
          const w = cornerW[k];
          const sm = s[k];
          const seg = Math.floor(sm.dist / 2) % 2 === 0;
          const c = seg ? red : white;
          const h = 0.065 * w;
          return [
            { off: HALF_WIDTH * side, y: 0.012, color: c },
            { off: (HALF_WIDTH + 0.55) * side, y: 0.012 + h, color: c },
            { off: (HALF_WIDTH + 1.0) * side, y: 0.012 + h * 0.75, color: c },
            { off: (HALF_WIDTH + CURB_WIDTH) * side, y: 0.004, color: c },
          ];
        },
        1,
        r,
      );
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, kerbMat);
      m.receiveShadow = true;
      m.castShadow = false;
      add(m);
    }
  }

  // green/white exit kerbs (astroturf-style) on the outside after each apex
  const green = new THREE.Color('#2f9e44');
  const exitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  for (const z of zones) {
    const side = -z.dir;
    const start = (z.apex + 6) % n;
    const len = Math.min(26, z.len);
    const g = buildColumnsStrip(
      track,
      2,
      (k) => {
        const sm = s[k];
        const c = Math.floor(sm.dist / 1.5) % 2 === 0 ? green : white;
        return [
          { off: (HALF_WIDTH + CURB_WIDTH + 0.05) * side, y: 0.006, color: c },
          { off: (HALF_WIDTH + CURB_WIDTH + 1.6) * side, y: 0.006, color: c },
        ];
      },
      1,
      { start, len },
    );
    const m = new THREE.Mesh(g, exitMat);
    m.receiveShadow = true;
    add(m);
  }

  /* ---------- run-off: clean uniform grass (no gravel / apron strips) ---------- */
  const grassMat = new THREE.MeshStandardMaterial({ color: '#5da84f', roughness: 1, side: THREE.DoubleSide });
  for (const side of [1, -1] as const) {
    const g = buildColumnsStrip(track, 2, () => [
      { off: (HALF_WIDTH + CURB_WIDTH) * side, y: 0.0 },
      { off: WALL_DIST * side, y: 0.0 },
    ]);
    const m = new THREE.Mesh(g, grassMat);
    m.receiveShadow = true;
    add(m);
  }
  /* ---------- start / finish: grid boxes + pole marker ---------- */
  const gridTex = makeGridBoxTexture();
  const gridMat = new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const gridGeo = new THREE.PlaneGeometry(2.3, 4.8);
  gridGeo.rotateX(-Math.PI / 2);
  for (let k = 0; k < 8; k++) {
    const back = 7 + k * 7.5;
    const i = (n - Math.round(back / track.spacing) + n) % n;
    const sm = s[i];
    const off = (k % 2 === 0 ? 1 : -1) * HALF_WIDTH * 0.42;
    const gm = new THREE.Mesh(gridGeo, gridMat);
    gm.position.set(sm.x + sm.rx * off, 0.022, sm.z + sm.rz * off);
    gm.rotation.y = sm.angle;
    gm.renderOrder = 2;
    add(gm);
    const num = makeGridNumber(k + 1);
    const nOff = off + Math.sign(off) * 1.7;
    const back2 = back + 1.0;
    const i2 = (n - Math.round(back2 / track.spacing) + n) % n;
    const s2 = s[i2];
    num.position.set(s2.x + s2.rx * nOff, 0.023, s2.z + s2.rz * nOff);
    num.rotation.z = -sm.angle;
    add(num);
  }

  /* ---------- sector lines S1 / S2 ---------- */
  const sectorLineGeo = new THREE.PlaneGeometry(TRACK_WIDTH - 0.5, 0.3);
  sectorLineGeo.rotateX(-Math.PI / 2);
  const boardGeo = new THREE.PlaneGeometry(1.2, 0.6);
  const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.5, metalness: 0.4 });
  [Math.floor(n / 3), Math.floor((2 * n) / 3)].forEach((i, k) => {
    const sm = s[i];
    const ln = new THREE.Mesh(sectorLineGeo, new THREE.MeshBasicMaterial({ color: '#f4f4f0', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    ln.position.set(sm.x, 0.022, sm.z);
    ln.rotation.y = sm.angle;
    add(ln);
    const bt = makeSmallTextTexture(`S${k + 1}`, '#1d4ed8', '#ffffff');
    const off = -(WALL_DIST - 1.2);
    const bx = sm.x + sm.rx * off;
    const bz = sm.z + sm.rz * off;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(bx, Y0 + 0.7, bz);
    add(pole);
    const board = new THREE.Mesh(boardGeo, new THREE.MeshStandardMaterial({ map: bt, roughness: 0.8, side: THREE.DoubleSide }));
    board.position.set(bx, Y0 + 1.5, bz);
    board.rotation.y = sm.angle + Math.PI;
    add(board);
  });

  /* ---------- braking boards 150 / 100 / 50 before each zone ---------- */
  const brakeBoardGeo = new THREE.PlaneGeometry(1.5, 1.1);
  const brakePoleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6);
  const boardTex = [makeBoardTexture('150', 3), makeBoardTexture('100', 2), makeBoardTexture('50', 1)];
  for (const z of zones) {
    const side = -z.dir; // outside of the corner
    [150, 100, 50].forEach((dist, k) => {
      const i = (z.start - Math.round(dist / track.spacing) + 2 * n) % n;
      // skip if that spot is itself inside a corner (board would be off the straight)
      if (cornerW[i] > 0.5 && k === 0) return;
      const sm = s[i];
      const off = (WALL_DIST - 1.2) * side;
      const bx = sm.x + sm.rx * off;
      const bz = sm.z + sm.rz * off;
      const pole = new THREE.Mesh(brakePoleGeo, poleMat);
      pole.position.set(bx, Y0 + 1.0, bz);
      pole.castShadow = true;
      add(pole);
      const b = new THREE.Mesh(brakeBoardGeo, new THREE.MeshStandardMaterial({ map: boardTex[k], roughness: 0.75, side: THREE.DoubleSide }));
      b.position.set(bx, Y0 + 2.3, bz);
      b.rotation.y = sm.angle + Math.PI; // faces oncoming cars
      b.castShadow = true;
      add(b);
    });
  }

  return out;
}
