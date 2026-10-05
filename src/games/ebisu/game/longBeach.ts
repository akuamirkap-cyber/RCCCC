import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Track, HALF_WIDTH, CURB_WIDTH, WALL_DIST } from './track';
import type { DriftZone } from './zones';
import type { Crowd } from './world';
import { buildProStand } from './proVenue';
import { makeSponsorStrip } from './proBarriers';
import { buildSkyline } from './skyline';
import { buildStreetLife, CarPool, LampPool, CAR_COLORS } from './streetLife';

/**
 * Long Beach street-circuit venue (Formula Drift Long Beach look): flat harbour-city ground, continuous concrete
 * K-rail walls with chain-link catch fences and sponsor banners, tyre stacks on the corners, aluminium bleachers
 * with blue/white striped canopies packed with fans, standing crowds along every fence, palm trees, a downtown
 * high-rise skyline, the waterfront with the aquarium dome and a Ferris wheel. The asphalt, kerbs, zones, gantry
 * and cars come from the shared pro-circuit builders — only the dressing differs from Ebisu.
 */

export interface LongBeachContext {
  rand: () => number;
  aniso: number;
  crowd: Crowd;
  animated: ((dt: number) => void)[];
  groundY: number;
  buildWallStrip: (track: Track, start: number, len: number, offset: number, y0: number, y1: number, uScale: number) => THREE.BufferGeometry;
  buildRangeStrip: (track: Track, start: number, len: number, from: number, to: number, y: number) => THREE.BufferGeometry;
  makeFenceTexture: () => THREE.CanvasTexture;
  makeTextTexture: (text: string, o?: { w?: number; h?: number; bg?: string; fg?: string; size?: number; checker?: boolean }) => THREE.CanvasTexture;
}

const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const FONT = '"Exo 2", "Arial Black", Impact, sans-serif';

/* ------------------------------------------------------------------ */
/*  Textures                                                           */
/* ------------------------------------------------------------------ */

function stripeTexture(a: string, b: string, stripes = 8): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  const w = 256 / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? b : a;
    ctx.fillRect(i * w, 0, w + 1, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function concreteTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#9b9c9f';
  ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 22;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n + 2;
  }
  ctx.putImageData(img, 0, 0);
  // faint expansion joints
  ctx.strokeStyle = 'rgba(60,60,64,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.lineTo(S, 0.5);
  ctx.moveTo(0.5, 0);
  ctx.lineTo(0.5, S);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bannerTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 128);
  ctx.font = `italic 900 76px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.fillText(text, 512, 68);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                   */
/* ------------------------------------------------------------------ */

/** One palm: tapered trunk + 9 drooping fronds + coconuts, merged (non-indexed) for instancing. */
function palmGeometries(): { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry } {
  const trunk = new THREE.CylinderGeometry(0.2, 0.34, 1, 7, 1);
  trunk.translate(0, 0.5, 0); // unit height, scaled per instance
  const parts: THREE.BufferGeometry[] = [];
  const frond = new THREE.BoxGeometry(0.55, 0.07, 4.4);
  frond.translate(0, 0, 2.2);
  for (let i = 0; i < 9; i++) {
    const f = frond.clone();
    const m = new THREE.Matrix4();
    const droop = -0.55 - (i % 3) * 0.18;
    m.makeRotationX(-droop);
    f.applyMatrix4(m);
    m.makeRotationY((i / 9) * Math.PI * 2 + (i % 2) * 0.2);
    f.applyMatrix4(m);
    parts.push(f);
  }
  const nut = new THREE.SphereGeometry(0.22, 6, 5);
  for (let i = 0; i < 4; i++) {
    const s = nut.clone();
    s.translate(Math.cos(i * 1.6) * 0.3, -0.25, Math.sin(i * 1.6) * 0.3);
    parts.push(s);
  }
  const crown = mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
  return { trunk, crown };
}

function circDist(a: number, b: number, n: number) {
  const d = Math.abs(a - b) % n;
  return Math.min(d, n - d);
}

/* ------------------------------------------------------------------ */
/*  Venue                                                              */
/* ------------------------------------------------------------------ */

export function buildLongBeachVenue(scene: THREE.Scene, track: Track, zones: DriftZone[], ctx: LongBeachContext): void {
  const { rand, aniso, crowd, animated, groundY } = ctx;
  const n = track.count;
  const S = track.samples;
  const cx = track.center.x;
  const cz = track.center.z;
  const b = track.bounds;
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const idxAt = (metres: number) => ((Math.round(metres / track.spacing) % n) + n) % n;
  const insideTrackBox = (x: number, z: number, margin: number) => x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin;

  /* ---------- Ground: flat harbour-city concrete + ocean to the south ---------- */
  const concTex = concreteTexture();
  concTex.anisotropy = aniso;
  concTex.repeat.set(220, 220);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: concTex, color: '#b9bbbf', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, groundY - 0.03, cz);
  ground.receiveShadow = true;
  scene.add(ground);
  // the asphalt "street" apron around the course (darker than the city concrete), kerb → wall → sidewalks
  const apronMat = new THREE.MeshStandardMaterial({ color: '#4b4e54', roughness: 1, side: THREE.DoubleSide });
  for (const side of [1, -1] as const) {
    const g = ctx.buildRangeStrip(track, 0, n, (HALF_WIDTH + CURB_WIDTH) * side, (WALL_DIST + 0.2) * side, groundY + 0.004);
    const m = new THREE.Mesh(g, apronMat);
    m.receiveShadow = true;
    scene.add(m);
    const walk = new THREE.Mesh(ctx.buildRangeStrip(track, 0, n, (WALL_DIST + 0.5) * side, (WALL_DIST + 12) * side, groundY + 0.002), new THREE.MeshStandardMaterial({ color: '#a7a9ad', roughness: 1, side: THREE.DoubleSide }));
    walk.receiveShadow = true;
    scene.add(walk);
  }
  // harbour behind the main grandstand (north, +z); downtown rises on the far side of the course (south, -z)
  const SHORE_Z = b.maxZ + 150;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2600, 900), new THREE.MeshStandardMaterial({ color: '#2f78c4', roughness: 0.25, metalness: 0.15 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(cx, groundY - 0.02, SHORE_Z + 450);
  scene.add(sea);
  const quay = new THREE.Mesh(new THREE.BoxGeometry(2600, 2.2, 6), new THREE.MeshStandardMaterial({ color: '#8e8f93', roughness: 0.95 }));
  quay.position.set(cx, groundY + 0.4, SHORE_Z - 3);
  scene.add(quay);

  /* ---------- Concrete K-rail walls + catch fences all the way round ---------- */
  const wallMat = new THREE.MeshStandardMaterial({ color: '#d8d8d4', roughness: 0.9 });
  const wallTopMat = new THREE.MeshStandardMaterial({ color: '#c9c9c5', roughness: 0.9, side: THREE.DoubleSide });
  const fenceTex = ctx.makeFenceTexture();
  fenceTex.anisotropy = aniso;
  fenceTex.repeat.set(1, 3);
  const fenceMat = new THREE.MeshStandardMaterial({ map: fenceTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4, color: '#dfe3ea' });
  const WALL_H = 1.0;
  const FENCE_H = 2.7;
  const postSpots: { x: number; z: number }[] = [];
  for (const side of [1, -1] as const) {
    const inner = new THREE.Mesh(ctx.buildWallStrip(track, 0, n, WALL_DIST * side, groundY, groundY + WALL_H, 4), wallMat);
    inner.castShadow = true;
    inner.receiveShadow = true;
    scene.add(inner);
    const outer = new THREE.Mesh(ctx.buildWallStrip(track, 0, n, (WALL_DIST + 0.5) * side, groundY, groundY + WALL_H, 4), wallMat);
    outer.material = wallMat;
    scene.add(outer);
    const top = new THREE.Mesh(ctx.buildRangeStrip(track, 0, n, WALL_DIST * side, (WALL_DIST + 0.5) * side, groundY + WALL_H), wallTopMat);
    scene.add(top);
    const fence = new THREE.Mesh(ctx.buildWallStrip(track, 0, n, (WALL_DIST + 0.25) * side, groundY + WALL_H, groundY + WALL_H + FENCE_H, 1), fenceMat);
    scene.add(fence);
    for (let i = 0; i < n; i += 3) {
      const s = S[i];
      postSpots.push({ x: s.x + s.rx * (WALL_DIST + 0.25) * side, z: s.z + s.rz * (WALL_DIST + 0.25) * side });
    }
  }
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, FENCE_H, 6), new THREE.MeshStandardMaterial({ color: '#8d949e', metalness: 0.6, roughness: 0.4 }), postSpots.length);
  postSpots.forEach((p, i) => {
    m4.compose(tmpPos.set(p.x, groundY + WALL_H + FENCE_H / 2, p.z), quat.identity(), ONE);
    posts.setMatrixAt(i, m4);
  });
  scene.add(posts);
  // top rail of the fence
  const railMat = new THREE.MeshStandardMaterial({ color: '#b9c0c9', metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide });
  for (const side of [1, -1] as const) {
    scene.add(new THREE.Mesh(ctx.buildWallStrip(track, 0, n, (WALL_DIST + 0.25) * side, groundY + WALL_H + FENCE_H - 0.08, groundY + WALL_H + FENCE_H, 1), railMat));
  }

  /* ---------- Sponsor banners on the wall faces (straights) + red/white corner wall paint ---------- */
  const bannerMats = [0, 3, 6, 9].map((o) => {
    const tex = makeSponsorStrip(o, 6);
    tex.anisotropy = aniso;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  });
  const redWhite = stripeTexture('#d7263d', '#f4f4f2', 2);
  redWhite.anisotropy = aniso;
  const cornerMat = new THREE.MeshStandardMaterial({ map: redWhite, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  {
    let i = 0;
    let bi = 0;
    while (i < n) {
      const straight = Math.abs(S[i].curv) < 0.012;
      let j = i;
      while (j < n && Math.abs(S[j].curv) < 0.012 === straight) j++;
      const len = j - i;
      if (len * track.spacing > 10) {
        for (const side of [1, -1] as const) {
          const g = ctx.buildWallStrip(track, i, len, (WALL_DIST - 0.01) * side, groundY + 0.12, groundY + WALL_H - 0.08, straight ? 30 : 1.5);
          const mesh = new THREE.Mesh(g, straight ? bannerMats[bi % bannerMats.length] : cornerMat);
          scene.add(mesh);
        }
        bi++;
      }
      i = j;
    }
  }
  // big venue banners on the fences of the main straight
  const fenceBanner = (text: string, bg: string, fg: string, at: number, side: 1 | -1, lenM: number) => {
    const tex = bannerTexture(text, bg, fg);
    tex.anisotropy = aniso;
    const start = idxAt(at);
    const len = Math.max(2, Math.round(lenM / track.spacing));
    const g = ctx.buildWallStrip(track, start, len, (WALL_DIST + 0.2) * side, groundY + WALL_H + 0.9, groundY + WALL_H + 1.9, lenM);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
    scene.add(m);
  };
  fenceBanner('DRIFT KING  ·  LONG BEACH', '#0f172a', '#ffffff', 8, -1, 26);
  fenceBanner('RC DRIFT RACE', '#d7263d', '#ffffff', 40, -1, 20);
  fenceBanner('STREETS OF LONG BEACH', '#ffffff', '#0f172a', 70, -1, 26);
  fenceBanner('TYPE S  ·  TOYO TIRES', '#1d4ed8', '#ffffff', 20, 1, 22);
  fenceBanner('DRIFT KING', '#0f172a', '#ffd166', 55, 1, 16);

  /* ---------- Tyre stacks on the outside of every corner (in front of the K-rail) ---------- */
  const tireSpots: { x: number; z: number; y: number; color: THREE.Color }[] = [];
  const tireBlack = new THREE.Color('#1c1c1f');
  const tireTops = ['#f5f5f5', '#e63946', '#f5f5f5', '#1d4ed8'].map((c) => new THREE.Color(c));
  zones.forEach((z, zi) => {
    const side = -z.dir;
    for (let k = 0; k < z.len; k += 2) {
      const i = (z.start + k) % n;
      const s = S[i];
      const off = (WALL_DIST - 1.05) * side;
      const levels = circDist(i, z.apex, n) <= 10 ? 3 : 2;
      for (let lvl = 0; lvl < levels; lvl++) {
        tireSpots.push({ x: s.x + s.rx * off, z: s.z + s.rz * off, y: groundY + 0.15 + lvl * 0.3, color: lvl === levels - 1 ? tireTops[(zi + (k >> 1)) % tireTops.length] : tireBlack });
      }
    }
  });
  const tires = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10), new THREE.MeshStandardMaterial({ roughness: 0.95 }), tireSpots.length);
  tireSpots.forEach((t, i) => {
    quat.setFromAxisAngle(UP, rand() * Math.PI);
    m4.compose(tmpPos.set(t.x, t.y, t.z), quat, ONE);
    tires.setMatrixAt(i, m4);
    tires.setColorAt(i, t.color);
  });
  tires.castShadow = true;
  scene.add(tires);

  /* ---------- Grandstands: aluminium bleachers with blue/white striped canopies ---------- */
  const canopy = { a: '#1e63d6', b: '#f7f9fc' };
  const bleacherCols = ['#c9ced6', '#aeb6c2', '#c9ced6', '#1e63d6'];
  /** Stand footprint (local: depth along -x, length along z) sampled every ~3 m must stay outside the walls. */
  const standFits = (atMetres: number, side: 1 | -1, length: number, tiers: number, gap: number) => {
    const s = S[idxAt(atMetres)];
    const depth = tiers * 2.4;
    const off = (WALL_DIST + gap + tiers * 1.2) * side;
    const px = s.x + s.rx * off;
    const pz = s.z + s.rz * off;
    const yawA = s.angle + (side > 0 ? Math.PI : 0);
    const cs = Math.cos(yawA);
    const sn = Math.sin(yawA);
    const nx = Math.max(2, Math.ceil((depth + 4) / 3));
    const nz = Math.max(2, Math.ceil((length + 4) / 3));
    for (let i = 0; i <= nx; i++) {
      const lx = -depth - 1.5 + ((depth + 3.5) * i) / nx;
      for (let j = 0; j <= nz; j++) {
        const lz = -length / 2 - 1.5 + ((length + 3) * j) / nz;
        const wx = px + lx * cs + lz * sn;
        const wz = pz - lx * sn + lz * cs;
        if (track.distanceToTrack(wx, wz) < WALL_DIST + 0.6) return false;
      }
    }
    return true;
  };
  const standSpans: { from: number; to: number }[] = []; // outside-band stretches taken by grandstands
  const placeStand = (atMetres: number, side: 1 | -1, length: number, tiers: number, name: string | undefined, gap = 5.5): THREE.Group | null => {
    // never let a grandstand poke through the walls onto the asphalt: shrink / push back / slide until it fits
    let fit: { at: number; len: number; gap: number } | null = null;
    outer: for (const shift of [0, -12, 12, -24, 24]) {
      for (const [lenF, gapAdd] of [
        [1, 0],
        [1, 6],
        [0.7, 0],
        [0.7, 6],
        [0.5, 0],
        [0.5, 8],
      ]) {
        const len = Math.max(18, length * lenF);
        if (standFits(atMetres + shift, side, len, tiers, gap + gapAdd)) {
          fit = { at: atMetres + shift, len, gap: gap + gapAdd };
          break outer;
        }
      }
    }
    if (!fit) return null;
    atMetres = fit.at;
    length = fit.len;
    gap = fit.gap;
    if (side < 0) standSpans.push({ from: atMetres - length / 2 - 10, to: atMetres + length / 2 + 10 });
    const s = S[idxAt(atMetres)];
    const stand = buildProStand(length, tiers, bleacherCols, rand, { roof: false, canopy, name, bleacher: true });
    const off = (WALL_DIST + gap + tiers * 1.2) * side;
    stand.group.position.set(s.x + s.rx * off, 0, s.z + s.rz * off);
    stand.group.rotation.y = s.angle + (side > 0 ? Math.PI : 0);
    scene.add(stand.group);
    stand.group.updateMatrixWorld(true);
    for (const [lx, ly, lz] of stand.seats) {
      stand.group.localToWorld(tmpV.set(lx, ly, lz));
      crowd.add(tmpV.x, tmpV.y, tmpV.z, { wave: lz + length / 2, jumpChance: 0.3, flagChance: 0.1 });
    }
    return stand.group;
  };
  // main straight (outside = left side → negative offset): the long Shoreline grandstand
  placeStand(50, -1, 88, 8, 'FORMULA  ·  LONG BEACH  ·  DRIFT KING');
  // outside of the Turn 9 sweeper (first zone after the start line): three bleacher blocks following the arc
  const t9 = zones[0];
  const t9mid = ((t9.start + Math.floor(t9.len / 2)) % n) * track.spacing;
  for (const d of [-34, 0, 34]) placeStand(t9mid + d, -t9.dir as 1 | -1, 30, 6, undefined, 4.5);
  // hairpin outside + the remaining corners + the return sweeper
  const hairpin = [...zones].filter((z) => z !== t9).sort((p, q) => Math.abs(S[q.apex].curv) - Math.abs(S[p.apex].curv))[0] ?? t9;
  placeStand(hairpin.apex * track.spacing, -hairpin.dir as 1 | -1, 46, 7, 'TURN 11', 6);
  for (const z of zones) {
    if (z === t9 || z === hairpin) continue;
    placeStand(z.apex * track.spacing, -z.dir as 1 | -1, 34, 6, undefined, 5);
  }
  placeStand(track.length - 60, 1, 40, 6, 'ROCKSTAR ENERGY', 5);

  /* ---------- Standing crowd along every fence (two staggered rows) ---------- */
  for (let i = 0; i < n; i += 2) {
    const s = S[i];
    for (const side of [1, -1] as const) {
      for (let row = 0; row < 2; row++) {
        if (rand() < (row === 0 ? 0.25 : 0.6)) continue;
        const off = (WALL_DIST + 1.3 + row * 1.1 + rand() * 0.4) * side;
        const jitter = (rand() - 0.5) * 1.2;
        crowd.add(s.x + s.rx * off + s.tx * jitter, groundY, s.z + s.rz * off + s.tz * jitter, { jumpChance: 0.22, flagChance: 0.08 });
      }
    }
  }

  /* ---------- Hospitality / paddock tents in the infield + the harbour side ---------- */
  const tentTex = stripeTexture(canopy.a, canopy.b, 16);
  tentTex.anisotropy = aniso;
  const tentMat = new THREE.MeshStandardMaterial({ map: tentTex, roughness: 0.8, side: THREE.DoubleSide });
  const tentRoofGeo = new THREE.ConeGeometry(6.2, 3.4, 4, 1, true);
  tentRoofGeo.rotateY(Math.PI / 4);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.5, metalness: 0.4 });
  const tent = (x: number, z: number, rot = 0) => {
    const g = new THREE.Group();
    g.position.set(x, groundY, z);
    g.rotation.y = rot;
    const roof = new THREE.Mesh(tentRoofGeo, tentMat);
    roof.position.y = 3.2 + 1.7;
    roof.castShadow = true;
    g.add(roof);
    for (const [px, pz] of [
      [-4, -4],
      [4, -4],
      [-4, 4],
      [4, 4],
    ]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), poleMat);
      p.position.set(px, 1.6, pz);
      g.add(p);
    }
    scene.add(g);
  };
  // infield paddock inside the big sweeper: a row of tents with team trucks behind (kept > 25 m from any asphalt)
  const truckMat = new THREE.MeshStandardMaterial({ color: '#f3f4f6', roughness: 0.6 });
  const cabMat = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.5 });
  for (let k = 0; k < 5; k++) {
    const px = 92 + k * 12;
    const pz = -52;
    if (track.distanceToTrack(px, pz) < 25) continue;
    tent(px, pz, 0);
    if (track.distanceToTrack(px, pz + 16) < 25) continue;
    const trailer = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.0, 12), truckMat);
    trailer.position.set(px, groundY + 2.4, pz + 16);
    trailer.castShadow = true;
    scene.add(trailer);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.2, 3), cabMat);
    cab.position.set(px, groundY + 1.9, pz + 23.5);
    scene.add(cab);
  }

  /* ---------- Palm trees ---------- */
  const palm = palmGeometries();
  const palmSpots: { x: number; z: number; h: number }[] = [];
  const addPalmRow = (fromM: number, toM: number, side: 1 | -1, gap: number, dist: number) => {
    for (let mtr = fromM; mtr < toM; mtr += gap) {
      const s = S[idxAt(mtr)];
      const off = (WALL_DIST + dist + rand() * 2) * side;
      palmSpots.push({ x: s.x + s.rx * off, z: s.z + s.rz * off, h: 9 + rand() * 5 });
    }
  };
  // behind the main grandstand (Shoreline Drive palms), the harbour side and the return sweeper
  addPalmRow(-10, 120, -1, 7, 28);
  addPalmRow(track.length * 0.46, track.length * 0.62, 1, 8, 16);
  addPalmRow(track.length * 0.7, track.length * 0.95, -1, 9, 18);
  /* ---------- Street life: boulevard ring, traffic, parked cars, lamps, vendors, pedestrians ---------- */
  const cars = new CarPool();
  const lamps = new LampPool();
  const landmarkClear = (x: number, z: number) => Math.hypot(x - (b.maxX + 60), z - (b.maxZ + 95)) < 40 || Math.hypot(x - (b.maxX + 130), z - (b.maxZ + 60)) < 30 || z > SHORE_Z - 8;
  buildStreetLife(scene, track, {
    rand,
    groundY,
    crowd,
    animated,
    cars,
    lamps,
    occupied: standSpans,
    tent,
    palm: (x, z) => palmSpots.push({ x, z, h: 9 + rand() * 4 }),
    blocked: landmarkClear,
  });

  /* ---------- Waterfront park + event parking behind the main grandstand (north, between boulevard and quay) ---------- */
  {
    const z0 = b.maxZ + 69;
    const z1 = SHORE_Z - 7;
    const x0 = b.minX - 130;
    const x1 = b.maxX + 22;
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: '#7aa962', roughness: 1 }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set((x0 + x1) / 2, groundY + 0.012, (z0 + z1) / 2);
    lawn.receiveShadow = true;
    scene.add(lawn);
    // promenade along the water + two paths down to the boulevard
    const pathMat = new THREE.MeshStandardMaterial({ color: '#d6d2c6', roughness: 1 });
    const prom = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 7), pathMat);
    prom.rotation.x = -Math.PI / 2;
    prom.position.set((x0 + x1) / 2, groundY + 0.018, z1 - 3.5);
    scene.add(prom);
    for (const px of [cx - 40, cx + 90]) {
      const path = new THREE.Mesh(new THREE.PlaneGeometry(5, z1 - z0), pathMat);
      path.rotation.x = -Math.PI / 2;
      path.position.set(px, groundY + 0.018, (z0 + z1) / 2);
      scene.add(path);
    }
    // event parking lot on the west half of the park
    const lotW = 120;
    const lotD = 48;
    const lx = x0 + 90;
    const lz = z0 + 30;
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(lotW, lotD), new THREE.MeshStandardMaterial({ color: '#45484e', roughness: 1 }));
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(lx, groundY + 0.016, lz);
    scene.add(lot);
    for (let row = 0; row < 3; row++) {
      const z = lz - lotD / 2 + 8 + row * 16;
      for (let x = lx - lotW / 2 + 4; x < lx + lotW / 2 - 4; x += 3.1) {
        if (rand() < 0.22) continue;
        cars.add(x, z, (row % 2 ? 0 : Math.PI) + (rand() - 0.5) * 0.05, CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]);
      }
    }
    for (let x = lx - lotW / 2 + 10; x < lx + lotW / 2; x += 28) lamps.add(x, lz + lotD / 2 + 1.5, Math.PI / 2);
    // palms + people strolling on the lawn (never inside the parking lot or the landmarks)
    const inLot = (x: number, z: number) => Math.abs(x - lx) < lotW / 2 + 3 && Math.abs(z - lz) < lotD / 2 + 3;
    for (let k = 0; k < 110; k++) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + 5 + rand() * (z1 - z0 - 12);
      if (landmarkClear(x, z) || inLot(x, z)) continue;
      palmSpots.push({ x, z, h: 8 + rand() * 7 });
    }
    for (let k = 0; k < 90; k++) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + 2 + rand() * (z1 - z0 - 4);
      if (landmarkClear(x, z) || inLot(x, z)) continue;
      crowd.add(x, groundY, z, { jumpChance: 0.02, flagChance: 0.02 });
    }
  }

  // scattered palms around the venue
  for (let k = 0; k < 70; k++) {
    const a = rand() * Math.PI * 2;
    const r = 120 + rand() * 180;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (insideTrackBox(x, z, 24) || z > SHORE_Z - 6) continue;
    palmSpots.push({ x, z, h: 8 + rand() * 7 });
  }
  const trunks = new THREE.InstancedMesh(palm.trunk, new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.95 }), palmSpots.length);
  const crowns = new THREE.InstancedMesh(palm.crown, new THREE.MeshStandardMaterial({ color: '#3f9b4a', roughness: 0.9 }), palmSpots.length);
  palmSpots.forEach((p, i) => {
    const lean = (rand() - 0.5) * 0.12;
    quat.setFromEuler(new THREE.Euler(lean, rand() * Math.PI * 2, lean * 0.6));
    m4.compose(tmpPos.set(p.x, groundY, p.z), quat, tmpScale.set(1, p.h, 1));
    trunks.setMatrixAt(i, m4);
    const sc = 0.85 + rand() * 0.35;
    m4.compose(tmpPos.set(p.x + lean * p.h * 0.5, groundY + p.h - 0.2, p.z), quat.setFromAxisAngle(UP, rand() * Math.PI * 2), tmpScale.set(sc, sc, sc));
    crowns.setMatrixAt(i, m4);
  });
  trunks.castShadow = true;
  crowns.castShadow = true;
  scene.add(trunks, crowns);

  /* ---------- Downtown skyline (south + east/west flanks) ---------- */
  // Real street grid with lots, archetypes, rooftop clutter and per-building tints — see skyline.ts.
  buildSkyline(scene, {
    rand,
    aniso,
    groundY,
    cx,
    cz,
    blocked: (x, z) => insideTrackBox(x, z, 64) || Math.hypot(x - cx, z - cz) > 540 || landmarkClear(x, z),
    core: { x: cx + 20, z: b.minZ - 250 },
    allow: (x, z) => z < b.minZ - 66 || ((x < b.minX - 76 || x > b.maxX + 76) && z < b.maxZ + 10),
    car: (x, z, yaw) => cars.add(x, z, yaw, CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]),
    lamp: (x, z, yaw) => lamps.add(x, z, yaw),
    person: (x, z) => crowd.add(x, groundY, z, { jumpChance: 0.02, flagChance: 0.01 }),
  });
  cars.build(scene, groundY);
  lamps.build(scene, groundY);
  // landmark: the aquarium (blue wave-glass drum + dome) on the waterfront
  {
    const aq = new THREE.Group();
    aq.position.set(b.maxX + 60, groundY, b.maxZ + 95);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(26, 28, 16, 28), new THREE.MeshStandardMaterial({ color: '#4f9fe0', roughness: 0.3, metalness: 0.3 }));
    drum.position.y = 8;
    aq.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#dbeafe', roughness: 0.35, metalness: 0.2 }));
    dome.position.y = 16;
    aq.add(dome);
    const wave = new THREE.Mesh(new THREE.TorusGeometry(27, 1.1, 8, 40), new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 }));
    wave.rotation.x = Math.PI / 2;
    wave.position.y = 11;
    aq.add(wave);
    scene.add(aq);
  }
  // landmark: Ferris wheel on the pier (turns slowly)
  {
    const wheel = new THREE.Group();
    wheel.position.set(b.maxX + 130, groundY + 24, b.maxZ + 60);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(20, 0.5, 8, 48), new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.5, metalness: 0.4 }));
    wheel.add(rim);
    const spokeMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.5, metalness: 0.4 });
    const gondolaCols = ['#e63946', '#ffd166', '#06d6a0', '#1e63d6', '#ff8fab', '#ffffff'];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 40, 6), spokeMat);
      spoke.rotation.z = a;
      wheel.add(spoke);
      const gondola = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 2.2), new THREE.MeshStandardMaterial({ color: gondolaCols[k % gondolaCols.length], roughness: 0.5 }));
      gondola.position.set(Math.cos(a) * 20, Math.sin(a) * 20 - 1.5, 0);
      wheel.add(gondola);
    }
    scene.add(wheel);
    const legMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.6, metalness: 0.4 });
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 30, 8), legMat);
      leg.position.set(wheel.position.x + sx * 9, groundY + 12, wheel.position.z + 1.5);
      leg.rotation.z = sx * 0.3;
      scene.add(leg);
    }
    animated.push((dt) => {
      wheel.rotation.z -= dt * 0.08;
      for (let k = 1; k < wheel.children.length; k += 2) wheel.children[k].rotation.z = -wheel.rotation.z; // gondolas stay upright
    });
  }

  /* ---------- Highway light poles down the main straight + flags on the fence ---------- */
  const lightSpots: { x: number; z: number; angle: number }[] = [];
  for (let mtr = 15; mtr < 125; mtr += 24) {
    const s = S[idxAt(mtr)];
    lightSpots.push({ x: s.x + s.rx * -(WALL_DIST + 4.5), z: s.z + s.rz * -(WALL_DIST + 4.5), angle: s.angle });
  }
  for (let mtr = track.length * 0.5; mtr < track.length * 0.98; mtr += 30) {
    const s = S[idxAt(mtr)];
    lightSpots.push({ x: s.x + s.rx * (WALL_DIST + 4.5), z: s.z + s.rz * (WALL_DIST + 4.5), angle: s.angle + Math.PI });
  }
  const lpMat = new THREE.MeshStandardMaterial({ color: '#9aa3ad', metalness: 0.6, roughness: 0.4 });
  const polesMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.22, 13, 8), lpMat, lightSpots.length);
  const armsMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 4.2), lpMat, lightSpots.length);
  const lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.25, 1.2), new THREE.MeshStandardMaterial({ color: '#f8fafc', emissive: '#fff7d6', emissiveIntensity: 0.5 }), lightSpots.length);
  lightSpots.forEach((l, i) => {
    m4.compose(tmpPos.set(l.x, groundY + 6.5, l.z), quat.identity(), ONE);
    polesMesh.setMatrixAt(i, m4);
    quat.setFromAxisAngle(UP, l.angle + Math.PI / 2);
    const rx = Math.cos(l.angle);
    const rz = -Math.sin(l.angle);
    m4.compose(tmpPos.set(l.x + rx * 2.0, groundY + 12.8, l.z + rz * 2.0), quat, ONE);
    armsMesh.setMatrixAt(i, m4);
    m4.compose(tmpPos.set(l.x + rx * 3.9, groundY + 12.7, l.z + rz * 3.9), quat, ONE);
    lampMesh.setMatrixAt(i, m4);
  });
  polesMesh.castShadow = true;
  scene.add(polesMesh, armsMesh, lampMesh);

  // row of national flags above the main-straight fence
  const flagCols = ['#d7263d', '#ffffff', '#1e63d6', '#ffd166', '#06d6a0', '#ff8fab', '#111827'].map((c) => new THREE.Color(c));
  const flagN = 26;
  const flagPoles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 6), lpMat, flagN);
  const flagCloth = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), flagN);
  const flagBase: { x: number; z: number; angle: number }[] = [];
  for (let k = 0; k < flagN; k++) {
    const s = S[idxAt(4 + k * 4.4)];
    const off = -(WALL_DIST + 0.6);
    flagBase.push({ x: s.x + s.rx * off, z: s.z + s.rz * off, angle: s.angle });
    m4.compose(tmpPos.set(flagBase[k].x, groundY + WALL_H + FENCE_H + 1.6, flagBase[k].z), quat.identity(), ONE);
    flagPoles.setMatrixAt(k, m4);
    flagCloth.setColorAt(k, flagCols[k % flagCols.length]);
  }
  scene.add(flagPoles, flagCloth);
  let flagT = 0;
  animated.push((dt) => {
    flagT += dt;
    for (let k = 0; k < flagN; k++) {
      const f = flagBase[k];
      const flutter = Math.sin(flagT * 3 + k) * 0.25;
      quat.setFromAxisAngle(UP, f.angle + flutter);
      m4.compose(tmpPos.set(f.x + Math.sin(f.angle) * 0.72, groundY + WALL_H + FENCE_H + 2.7, f.z + Math.cos(f.angle) * 0.72), quat, ONE);
      flagCloth.setMatrixAt(k, m4);
    }
    flagCloth.instanceMatrix.needsUpdate = true;
  });

  /* ---------- Marshal posts / photographers' platforms at the apexes ---------- */
  const platMat = new THREE.MeshStandardMaterial({ color: '#4b5563', roughness: 0.8 });
  for (const z of zones) {
    const s = S[(z.apex + 14) % n];
    const side = -z.dir;
    const off = (WALL_DIST + 2.2) * side;
    const plat = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3), platMat);
    plat.position.set(s.x + s.rx * off, groundY + 0.8, s.z + s.rz * off);
    plat.rotation.y = s.angle;
    plat.castShadow = true;
    scene.add(plat);
    for (let k = 0; k < 3; k++) crowd.add(plat.position.x + (k - 1) * 0.9 * s.tx, groundY + 1.6, plat.position.z + (k - 1) * 0.9 * s.tz, { jumpChance: 0, flagChance: 0 });
  }

  /* ---------- "Welcome" arch over the main straight approach (city banner) ---------- */
  {
    const s = S[idxAt(track.length - 40)];
    const g = new THREE.Group();
    g.position.set(s.x, groundY, s.z);
    g.rotation.y = s.angle;
    const span = (WALL_DIST + 1.5) * 2;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 1.6, 0.6), new THREE.MeshStandardMaterial({ map: ctx.makeTextTexture('WELCOME TO THE STREETS OF LONG BEACH', { w: 2048, h: 160, bg: '#0f172a', fg: '#ffffff', size: 96 }), roughness: 0.8 }));
    beam.position.y = 7.4;
    g.add(beam);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.6, 0.5), lpMat);
      leg.position.set((sx * span) / 2, 3.8, 0);
      g.add(leg);
    }
    scene.add(g);
  }
}
