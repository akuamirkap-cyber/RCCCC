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

const UP = new THREE.Vector3(0, 1, 0);

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
export function makeProAsphalt(): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
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
    const k = (v - 0.5) * 70;
    d[i * 4] = clamp(d[i * 4] + k, 0, 255);
    d[i * 4 + 1] = clamp(d[i * 4 + 1] + k, 0, 255);
    d[i * 4 + 2] = clamp(d[i * 4 + 2] + k + 2, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
  // bright quartz chips
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(205,205,210,${0.12 + rnd() * 0.3})`;
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

  // roughness: slightly glossier in the polished (dark) patches
  const rc = document.createElement('canvas');
  rc.width = rc.height = 256;
  const rctx = rc.getContext('2d')!;
  rctx.fillStyle = '#c4c4c4';
  rctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 30; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const r = 30 + rnd() * 70;
    const g = rctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(150,150,150,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    rctx.fillStyle = g;
    rctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
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

/** Signed curvature averaged over a sample window [i-back, i+ahead]. */
function windowCurv(track: Track, i: number, back: number, ahead: number): number {
  const n = track.count;
  let sum = 0;
  let w = 0;
  for (let k = -back; k <= ahead; k++) {
    const wt = 1 - Math.abs(k) / (Math.max(back, ahead) + 1);
    sum += track.samples[(i + k + n) % n].curv * wt;
    w += wt;
  }
  return sum / w;
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
  const rand = mulberry32(777);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const Y0 = o.groundY;

  /* ---------- precomputed per-sample corner weights ---------- */
  const cornerW = new Float32Array(n); // 0 straight .. 1 full corner (kerbs)
  const outsideSide = new Int8Array(n); // which lateral side is the OUTSIDE of the corner
  const gravelW = new Float32Array(n);
  const tarmacW = new Float32Array(n);
  const lineOff = new Float32Array(n); // rubbered racing line lateral offset
  for (let i = 0; i < n; i++) {
    const cw = windowAbsMax(track, i, 6, 6);
    cornerW[i] = smoothstep(0.0055, 0.0095, cw);
    const wc = windowCurv(track, i, 8, 8);
    outsideSide[i] = wc >= 0 ? -1 : 1; // same convention as the tyre walls: outside = -sign(curv)
    gravelW[i] = smoothstep(0.011, 0.02, windowAbsMax(track, i, 10, 4));
    tarmacW[i] = smoothstep(0.004, 0.011, windowAbsMax(track, i, 2, 30)) * (1 - gravelW[i] * 0.35);
    // racing line: inside at the apex, drifting back out on exit (window biased behind)
    const lc = windowCurv(track, i, 26, 14);
    lineOff[i] = clamp(lc / 0.016, -1, 1) * (HALF_WIDTH - 2.6); // inside = +sign(curv)
  }
  // smooth the racing line offset a little more (no kinks)
  for (let pass = 0; pass < 3; pass++) {
    const copy = Float32Array.from(lineOff);
    for (let i = 0; i < n; i++) lineOff[i] = (copy[(i - 1 + n) % n] + copy[i] * 2 + copy[(i + 1) % n]) / 4;
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
  tex.roughnessMap.repeat.set(2, 1);
  const roadMat = new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: tex.roughnessMap,
    roughness: 0.82,
    metalness: 0.04,
    color: '#cfd0d4',
    envMapIntensity: 0.6,
    side: THREE.DoubleSide,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  road.name = 'ProAsphalt';
  add(road);

  /* ---------- rubbered racing line (multiply overlay) ---------- */
  const rubberGeo = buildColumnsStrip(track, 3, (i) => {
    const c = Math.abs(windowCurv(track, i, 6, 6));
    const dark = 0.1 + 0.3 * smoothstep(0.003, 0.02, c);
    const w = 1.8 + 1.0 * smoothstep(0.004, 0.02, c);
    const center = clamp(lineOff[i], -HALF_WIDTH + w + 0.4, HALF_WIDTH - w - 0.4);
    const white = new THREE.Color(1, 1, 1);
    const grey = new THREE.Color(1 - dark, 1 - dark, 1 - dark);
    return [
      { off: center - w, y: 0.021, color: white },
      { off: center, y: 0.021, color: grey },
      { off: center + w, y: 0.021, color: white },
    ];
  });
  const rubber = new THREE.Mesh(
    rubberGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.MultiplyBlending, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  rubber.renderOrder = 1;
  add(rubber);

  // corner-exit tyre marks: short dark streaks fanning to the outside after each apex
  const streakGeo = new THREE.PlaneGeometry(0.32, 1);
  streakGeo.rotateX(-Math.PI / 2);
  const streakSpots: { x: number; z: number; a: number; len: number; alpha: number }[] = [];
  for (const z of zones) {
    const side = -z.dir; // outside
    for (let k = 2; k < 26; k += 2) {
      const i = (z.apex + k) % n;
      const sm = s[i];
      for (let j = 0; j < 2; j++) {
        const off = lineOff[i] + side * (0.6 + j * 0.9 + k * 0.08) * (rand() * 0.4 + 0.8);
        if (Math.abs(off) > HALF_WIDTH - 0.6) continue;
        streakSpots.push({ x: sm.x + sm.rx * off, z: sm.z + sm.rz * off, a: sm.angle + side * 0.06, len: 2 + rand() * 2, alpha: 0.35 - k * 0.011 });
      }
    }
  }
  if (streakSpots.length) {
    const streaks = new THREE.InstancedMesh(
      streakGeo,
      new THREE.MeshBasicMaterial({ color: '#121216', transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      streakSpots.length,
    );
    streakSpots.forEach((st, i) => {
      q.setFromAxisAngle(UP, st.a);
      m4.compose(p.set(st.x, 0.02, st.z), q, new THREE.Vector3(1, 1, st.len));
      streaks.setMatrixAt(i, m4);
    });
    streaks.renderOrder = 2;
    add(streaks);
  }

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

  /* ---------- run-off: grass / tarmac strip / gravel traps ---------- */
  const grassA = new THREE.Color('#5ea64c');
  const grassB = new THREE.Color('#4f9440');
  const tarmac = new THREE.Color('#5a5c62');
  const gravel = new THREE.Color('#cdbd9a');
  const gravelB = new THREE.Color('#bda985');
  const runMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  for (const side of [1, -1] as const) {
    const g = buildColumnsStrip(track, 4, (i) => {
      const isOutside = outsideSide[i] === side;
      const tw = isOutside ? tarmacW[i] : tarmacW[i] * 0.15;
      const gw = isOutside ? gravelW[i] : 0;
      const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const grass = tmpA.copy(grassA).lerp(grassB, Math.abs(noise));
      const near = grass.clone().lerp(tarmac, tw);
      const far = grass.clone().lerp(tmpB.copy(gravel).lerp(gravelB, Math.abs(noise)), gw);
      const edge = (HALF_WIDTH + CURB_WIDTH) * side;
      return [
        { off: edge, y: 0.0, color: near },
        { off: edge + 2.6 * side, y: 0.0, color: near },
        { off: edge + 3.4 * side, y: 0.0, color: far },
        { off: WALL_DIST * side, y: 0.0, color: far },
      ];
    });
    const m = new THREE.Mesh(g, runMat);
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
    const off = -(WALL_DIST + 0.9);
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
      const off = (WALL_DIST + 0.9) * side;
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

  /* ---------- marshal posts with flags at the apexes ---------- */
  const hutMat = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#ff6a00', roughness: 0.7 });
  const flagMat = new THREE.MeshStandardMaterial({ color: '#ffd60a', roughness: 0.9, side: THREE.DoubleSide });
  zones.forEach((z) => {
    const side = -z.dir;
    const i = (z.apex + 10) % n;
    const sm = s[i];
    const off = (WALL_DIST + 4.2) * side;
    const hx = sm.x + sm.rx * off;
    const hz = sm.z + sm.rz * off;
    const g = new THREE.Group();
    g.position.set(hx, Y0, hz);
    g.rotation.y = sm.angle;
    const hut = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 1.9), hutMat);
    hut.position.y = 0.75 + 0.35;
    hut.castShadow = true;
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 2.4), new THREE.MeshStandardMaterial({ color: '#7c7f86', roughness: 0.9 }));
    base.position.y = 0.175;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 2.2), roofMat);
    roof.position.y = 1.5 + 0.35 + 0.07;
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), poleMat);
    flagPole.position.set(0.8, 1.5 + 0.35 + 1.1, -0.8);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), flagMat);
    flag.position.set(0.8 + 0.4, 1.5 + 0.35 + 1.95, -0.8);
    g.add(base, hut, roof, flagPole, flag);
    add(g);
  });

  return out;
}
