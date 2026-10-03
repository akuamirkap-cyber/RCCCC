import * as THREE from 'three';
import { Track, HALF_WIDTH, CURB_WIDTH, WALL_DIST, TRACK_WIDTH } from './track';
import type { DriftZone } from './zones';

/* ============================================================
   PRO CIRCUIT SURFACE — iRacing-style track dressing
   - 1024² asphalt with aggregate normal map (sun glint on the grain)
   - crisp white edge lines as geometry (not baked in the texture)
   - rubbered-in racing line + corner-exit tyre marks (multiply overlay)
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

/** Dark neutral racing asphalt (1024²) + matching normal map generated from the same grain. */
export function makeProAsphalt(): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const rnd = mulberry32(90210);
  ctx.fillStyle = '#3a3c42';
  ctx.fillRect(0, 0, S, S);
  // large tonal patches (repaved sections, wear)
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 90 + rnd() * 220;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() < 0.5;
    g.addColorStop(0, light ? 'rgba(110,112,118,0.16)' : 'rgba(30,31,36,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // height field for the grain (also used for the normal map)
  const h = new Float32Array(S * S);
  for (let i = 0; i < 160000; i++) {
    const x = Math.floor(rnd() * S);
    const y = Math.floor(rnd() * S);
    const v = rnd();
    const size = rnd() < 0.15 ? 2 : 1;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) h[((y + dy) % S) * S + ((x + dx) % S)] = v;
  }
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < S * S; i++) {
    const v = h[i];
    if (v === 0) continue;
    const k = (v - 0.5) * 44;
    d[i * 4] = clamp(d[i * 4] + k, 0, 255);
    d[i * 4 + 1] = clamp(d[i * 4 + 1] + k, 0, 255);
    d[i * 4 + 2] = clamp(d[i * 4 + 2] + k + 2, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
  // bright quartz chips
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(190,190,195,${0.08 + rnd() * 0.18})`;
    ctx.fillRect(rnd() * S, rnd() * S, 1, 1);
  }
  // hairline cracks + sealed crack lines (darker)
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 14; i++) {
    let x = rnd() * S;
    let y = rnd() * S;
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(20,20,24,0.55)' : 'rgba(16,16,18,0.8)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 12; k++) {
      x += (rnd() - 0.5) * 50;
      y += (rnd() - 0.5) * 50;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;

  // normal map from the grain height field (Sobel)
  const nc = document.createElement('canvas');
  nc.width = nc.height = S;
  const nctx = nc.getContext('2d')!;
  const nimg = nctx.createImageData(S, S);
  const nd = nimg.data;
  const H = (x: number, y: number) => h[((y + S) % S) * S + ((x + S) % S)];
  const strength = 2.2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
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

  return { map, normalMap };
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
  const roadGeo = buildColumnsStrip(track, 2, () => [
    { off: -HALF_WIDTH - 0.05, y: 0.01 },
    { off: HALF_WIDTH + 0.05, y: 0.01 },
  ], 7);
  // UV: u spans the width once, v repeats every 7 m → tile the texture 2x across the width
  tex.map.repeat.set(2, 1);
  tex.normalMap.repeat.set(2, 1);
  const roadMat = new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.96,
    metalness: 0.0,
    color: '#c9cacd',
    envMapIntensity: 0.12,
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

  /* ---------- run-off: clean grass + crisp tarmac apron / gravel trap on the outside of each zone ---------- */
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
  const apronMat = new THREE.MeshStandardMaterial({ color: '#63666d', roughness: 0.9, side: THREE.DoubleSide });
  const gravelMat = new THREE.MeshStandardMaterial({ color: '#d8ccb0', roughness: 1, side: THREE.DoubleSide });
  const borderMat = new THREE.MeshStandardMaterial({ color: '#b9bbc0', roughness: 0.8, side: THREE.DoubleSide });
  const flatCols = (a: number, b: number, y: number) => () => [
    { off: a, y },
    { off: b, y },
  ];
  for (const z of zones) {
    const side = -z.dir; // outside of the corner
    const edge = (HALF_WIDTH + CURB_WIDTH) * side;
    // tarmac apron: from well before the braking point to the exit
    const apronStart = (z.start - 18 + n) % n;
    const apronLen = Math.min(n - 1, z.len + 26);
    const apron = new THREE.Mesh(buildColumnsStrip(track, 2, flatCols(edge, edge + 2.4 * side, 0.004), 1, { start: apronStart, len: apronLen }), apronMat);
    apron.receiveShadow = true;
    add(apron);
    // gravel trap with a light concrete border, only through the corner itself
    const trapStart = (z.start + 2) % n;
    const trapLen = Math.max(6, z.len + 6);
    const border = new THREE.Mesh(buildColumnsStrip(track, 2, flatCols(edge + 2.4 * side, edge + 2.7 * side, 0.004), 1, { start: trapStart, len: trapLen }), borderMat);
    add(border);
    const trap = new THREE.Mesh(buildColumnsStrip(track, 2, flatCols(edge + 2.7 * side, (WALL_DIST - 0.6) * side, 0.004), 1, { start: trapStart, len: trapLen }), gravelMat);
    trap.receiveShadow = true;
    add(trap);
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
