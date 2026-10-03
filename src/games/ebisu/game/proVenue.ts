import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ============================================================
   PRO VENUE — grandstands, start/finish gantry, forest
   ============================================================ */

const FONT = '"Barlow Condensed", "Arial Narrow", Impact, Arial, sans-serif';
const UP = new THREE.Vector3(0, 1, 0);

const steelMat = new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.5, metalness: 0.5 });
const whiteSteelMat = new THREE.MeshStandardMaterial({ color: '#e8ecf2', roughness: 0.45, metalness: 0.4 });
const concreteMat = new THREE.MeshStandardMaterial({ color: '#9aa0a8', roughness: 0.95 });
const darkConcreteMat = new THREE.MeshStandardMaterial({ color: '#6b7079', roughness: 0.95 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: '#8fc7ff', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.42, envMapIntensity: 1.2 });

/* ------------------------------------------------------------------ */
/*  Canvas helpers                                                     */
/* ------------------------------------------------------------------ */

function textTexture(text: string, o: { w?: number; h?: number; bg?: string; fg?: string; size?: number; checker?: boolean; transparent?: boolean; stripe?: string }): THREE.CanvasTexture {
  const w = o.w ?? 1024;
  const h = o.h ?? 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  if (!o.transparent) {
    ctx.fillStyle = o.bg ?? '#15181f';
    ctx.fillRect(0, 0, w, h);
  }
  if (o.stripe) {
    ctx.fillStyle = o.stripe;
    ctx.fillRect(0, 0, w, h * 0.09);
    ctx.fillRect(0, h * 0.91, w, h * 0.09);
  }
  if (o.checker) {
    const sq = h / 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#111318' : '#f4f4f4';
        ctx.fillRect(i * sq, j * sq, sq, sq);
        ctx.fillRect(w - (i + 1) * sq, j * sq, sq, sq);
      }
    }
  }
  const size = o.size ?? Math.round(h * 0.62);
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.strokeText(text, w / 2, h / 2 + size * 0.05);
  ctx.fillStyle = o.fg ?? '#ffffff';
  ctx.fillText(text, w / 2, h / 2 + size * 0.05);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Long sponsor banner strip with alternating logos (text blocks). */
function sponsorStrip(names: string[], colors: string[]): THREE.CanvasTexture {
  const w = 2048;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const cell = w / names.length;
  names.forEach((nm, i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(i * cell, 0, cell, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(h * 0.55)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nm, i * cell + cell / 2, h / 2 + 4);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/* ------------------------------------------------------------------ */
/*  Grandstand                                                         */
/* ------------------------------------------------------------------ */

export interface StandOptions {
  roof: boolean;
  vip?: boolean; // glass hospitality boxes under the roof
  name?: string; // text on the roof fascia
  floodlights?: boolean;
}

/**
 * Pro tiered grandstand. Local frame: the track is toward +x, tiers climb toward -x, length runs along z.
 * Returns the group and seat positions (local space) for the crowd system.
 */
export function buildProStand(length: number, tiers: number, colors: string[], rand: () => number, o: StandOptions) {
  const group = new THREE.Group();
  const seats: [number, number, number][] = [];
  const STEP_D = 2.4;
  const STEP_H = 1.2;
  const depth = tiers * STEP_D;

  // plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(depth + 1.6, 0.5, length + 1.6), darkConcreteMat);
  plinth.position.set(-depth / 2 + 0.6, 0.25, 0);
  plinth.receiveShadow = true;
  group.add(plinth);

  // concrete steps
  for (let k = 0; k < tiers; k++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(STEP_D, STEP_H, length), concreteMat);
    step.position.set(-k * STEP_D, 0.5 + STEP_H / 2 + k * STEP_H, 0);
    step.castShadow = true;
    step.receiveShadow = true;
    group.add(step);
  }

  // seats: small coloured shells in blocks, aisles every ~10 m
  const seatGeo = new THREE.BoxGeometry(0.46, 0.42, 0.48);
  const seatBackGeo = new THREE.BoxGeometry(0.1, 0.5, 0.46);
  const perRow = Math.floor((length - 1.2) / 0.55);
  const total = perRow * tiers;
  const seatMesh = new THREE.InstancedMesh(seatGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), total);
  const backMesh = new THREE.InstancedMesh(seatBackGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), total);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const palette = colors.map((c) => new THREE.Color(c));
  const aisleEvery = Math.max(8, Math.round(length / 3));
  let si = 0;
  for (let k = 0; k < tiers; k++) {
    const y = 0.5 + STEP_H * (k + 1);
    const x = -k * STEP_D - 0.55;
    for (let j = 0; j < perRow; j++) {
      const z = -length / 2 + 0.9 + j * 0.55;
      const isAisle = Math.abs(((z + length / 2) % aisleEvery) - aisleEvery / 2) < 0.45;
      if (isAisle) continue;
      const block = Math.floor((j + k * 3) / 9) % palette.length;
      col.copy(palette[block]);
      m4.makeTranslation(x, y + 0.21, z);
      seatMesh.setMatrixAt(si, m4);
      seatMesh.setColorAt(si, col);
      m4.makeTranslation(x - 0.2, y + 0.5, z);
      backMesh.setMatrixAt(si, m4);
      backMesh.setColorAt(si, col);
      si++;
      if (rand() < 0.82) seats.push([x + 0.8, y, z]);
    }
  }
  seatMesh.count = backMesh.count = si;
  seatMesh.castShadow = true;
  group.add(seatMesh, backMesh);

  // side walls (stepped), front rail, back wall
  for (const zs of [-1, 1]) {
    for (let k = 0; k < tiers; k++) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(STEP_D, STEP_H + 1.0, 0.35), darkConcreteMat);
      wall.position.set(-k * STEP_D, 0.5 + (STEP_H + 1.0) / 2 + k * STEP_H, zs * (length / 2 + 0.17));
      wall.castShadow = true;
      group.add(wall);
    }
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, length), whiteSteelMat);
  rail.position.set(STEP_D / 2 - 0.03, 0.5 + STEP_H + 0.5, 0);
  group.add(rail);
  const railBanner = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.8, length - 1),
    new THREE.MeshStandardMaterial({ map: sponsorStrip(['EBISU', 'DRIFT KING', 'TOYO TIRES', 'HKS', 'GReddy', 'WORK'], ['#ff5a1f', '#111318', '#1d4ed8', '#c8102e', '#111318', '#0f766e']), roughness: 0.8 }),
  );
  railBanner.position.set(STEP_D / 2 + 0.03, 0.5 + STEP_H + 0.5, 0);
  group.add(railBanner);
  const backH = tiers * STEP_H + 0.5 + (o.vip ? 3.0 : 1.2);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, backH, length + 0.4), new THREE.MeshStandardMaterial({ color: '#3a4250', roughness: 0.8 }));
  back.position.set(-depth + 0.95, backH / 2, 0);
  back.castShadow = true;
  group.add(back);

  // VIP hospitality boxes behind the top tier
  if (o.vip) {
    const vy = 0.5 + tiers * STEP_H;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, length), darkConcreteMat);
    floor.position.set(-depth + 0.4, vy + 0.15, 0);
    group.add(floor);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, length - 1.0), glassMat);
    glass.position.set(-depth + 2.0, vy + 0.3 + 1.15, 0);
    group.add(glass);
    for (let z = -length / 2 + 0.5; z <= length / 2; z += 4) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.3, 0.16), whiteSteelMat);
      mullion.position.set(-depth + 2.0, vy + 0.3 + 1.15, z);
      group.add(mullion);
    }
    const lid = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, length + 0.4), whiteSteelMat);
    lid.position.set(-depth + 0.5, vy + 2.75, 0);
    group.add(lid);
  }

  // cantilever roof with truss + rear columns
  if (o.roof) {
    const roofH = backH + 1.6;
    const roofDepth = depth + 4.5;
    const roof = new THREE.Group();
    roof.position.set(-depth / 2 + 1.4, roofH, 0);
    roof.rotation.z = -0.09; // front edge higher
    const slab = new THREE.Mesh(new THREE.BoxGeometry(roofDepth, 0.22, length + 2.4), new THREE.MeshStandardMaterial({ color: '#eef1f5', roughness: 0.55, metalness: 0.2 }));
    slab.castShadow = true;
    roof.add(slab);
    // truss ribs under the slab
    for (let z = -length / 2 - 0.6; z <= length / 2 + 0.6; z += 4.2) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(roofDepth - 0.6, 0.7, 0.12), whiteSteelMat);
      rib.position.set(0, -0.46, z);
      roof.add(rib);
      for (let x = -roofDepth / 2 + 1.5; x < roofDepth / 2 - 1; x += 2.2) {
        const diag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), whiteSteelMat);
        diag.position.set(x, -0.46, z);
        diag.rotation.z = 0.8;
        roof.add(diag);
      }
    }
    for (const x of [-roofDepth / 2 + 0.3, roofDepth / 2 - 0.3]) {
      const chord = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, length + 2.4), whiteSteelMat);
      chord.position.set(x, -0.46, 0);
      roof.add(chord);
    }
    // fascia with the venue name
    if (o.name) {
      const fascia = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 1.3, length + 2.0),
        new THREE.MeshStandardMaterial({ map: textTexture(o.name, { w: 2048, h: 160, bg: '#ff5a1f', fg: '#ffffff', size: 110, checker: true }), roughness: 0.8 }),
      );
      fascia.position.set(roofDepth / 2 - 0.07, -1.2, 0); // front edge, faces the track (+x)
      roof.add(fascia);
    }
    group.add(roof);
    // rear columns + raking struts
    for (let z = -length / 2 + 1.2; z <= length / 2 - 1.0; z += 7.5) {
      const colH = roofH - 0.6;
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, colH, 10), steelMat);
      column.position.set(-depth + 1.0, colH / 2, z);
      column.castShadow = true;
      group.add(column);
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6.5, 8), steelMat);
      strut.position.set(-depth + 1.0 + 2.6, roofH - 2.4, z);
      strut.rotation.z = -0.95;
      group.add(strut);
    }
    // floodlight masts on the roof
    if (o.floodlights) {
      for (const z of [-length / 2 + 3, length / 2 - 3]) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5.5, 8), steelMat);
        mast.position.set(-depth / 2 + 0.6, roofH + 2.6, z);
        group.add(mast);
        const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.3), new THREE.MeshStandardMaterial({ color: '#dfe6ee', emissive: '#fff4d6', emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.5 }));
        head.position.set(-depth / 2 + 1.2, roofH + 5.3, z);
        head.rotation.z = -0.5;
        group.add(head);
      }
    }
  }

  // side stair towers
  for (const zs of [-1, 1]) {
    const stair = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.4, 0.5 + tiers * STEP_H, 1.4), concreteMat);
    stair.position.set(-depth / 2 + 0.6, (0.5 + tiers * STEP_H) / 2, zs * (length / 2 + 1.1));
    stair.castShadow = true;
    group.add(stair);
  }
  return { group, seats };
}

/* ------------------------------------------------------------------ */
/*  Start / finish gantry                                              */
/* ------------------------------------------------------------------ */

/** Builds a lattice truss (square section `w`) of given length along +z, centred at the origin. */
function truss(len: number, w: number, mat: THREE.Material, step = 1.3): THREE.Group {
  const g = new THREE.Group();
  const bar = 0.1;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const chord = new THREE.Mesh(new THREE.BoxGeometry(bar, bar, len), mat);
    chord.position.set((sx * w) / 2, (sy * w) / 2, 0);
    g.add(chord);
  }
  const diagLen = Math.hypot(w, step);
  for (let z = -len / 2 + step / 2, k = 0; z < len / 2; z += step, k++) {
    for (const sx of [-1, 1]) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(bar * 0.8, w, bar * 0.8), mat);
      v.position.set((sx * w) / 2, 0, z - step / 2);
      g.add(v);
      const d = new THREE.Mesh(new THREE.BoxGeometry(bar * 0.7, diagLen, bar * 0.7), mat);
      d.position.set((sx * w) / 2, 0, z);
      d.rotation.x = (k % 2 ? 1 : -1) * Math.atan2(step, w);
      g.add(d);
    }
    for (const sy of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(w, bar * 0.8, bar * 0.8), mat);
      h.position.set(0, (sy * w) / 2, z - step / 2);
      g.add(h);
    }
  }
  return g;
}

/**
 * F1-style start/finish bridge. Local frame: track runs along +z through the origin, x is lateral.
 * `halfSpan` = lateral distance to the tower centres.
 */
export function buildStartGantry(halfSpan: number, aniso: number): THREE.Group {
  const g = new THREE.Group();
  const H = 8.6;
  const TW = 1.2; // tower section
  // lattice towers
  for (const sx of [-1, 1]) {
    const tower = truss(H, TW, whiteSteelMat, 1.4);
    tower.rotation.x = Math.PI / 2; // along +y
    tower.position.set(sx * halfSpan, H / 2, 0);
    g.add(tower);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 2.0), darkConcreteMat);
    foot.position.set(sx * halfSpan, 0.25, 0);
    g.add(foot);
    // tower sponsor wrap
    const wrap = new THREE.Mesh(
      new THREE.BoxGeometry(TW + 0.3, 2.4, TW + 0.3),
      new THREE.MeshStandardMaterial({ map: textTexture('EBISU', { w: 256, h: 256, bg: '#111318', fg: '#ff5a1f', size: 96 }), roughness: 0.8 }),
    );
    wrap.position.set(sx * halfSpan, 3.0, 0);
    g.add(wrap);
  }
  // bridge truss
  const span = halfSpan * 2 + TW;
  const bridge = truss(span, 1.3, whiteSteelMat, 1.4);
  bridge.rotation.y = Math.PI / 2; // along x
  bridge.position.set(0, H + 0.65, 0);
  g.add(bridge);
  // walkway deck + handrails for the camera crew
  const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 0.08, 1.3), steelMat);
  deck.position.set(0, H + 1.34, 0);
  g.add(deck);
  for (const sz of [-1, 1]) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(span, 0.05, 0.05), whiteSteelMat);
    hand.position.set(0, H + 2.3, sz * 0.62);
    g.add(hand);
    for (let x = -span / 2 + 0.6; x < span / 2; x += 2.6) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), whiteSteelMat);
      post.position.set(x, H + 1.85, sz * 0.62);
      g.add(post);
    }
  }
  // main sign: START / FINISH panel hanging under the bridge (both faces)
  const signTex = textTexture('START  ·  FINISH', { w: 2048, h: 256, bg: '#111318', fg: '#ffffff', size: 150, checker: true });
  signTex.anisotropy = aniso;
  // LED board look: the texture also drives emission so it reads crisp in any lighting
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.55, roughness: 0.6 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(span - 2.4, 1.9, 0.16), [steelMat, steelMat, steelMat, steelMat, signMat, signMat]);
  sign.position.set(0, H - 1.0, 0);
  sign.castShadow = true;
  g.add(sign);
  // sub banner with sponsors
  const subMat = new THREE.MeshStandardMaterial({ map: sponsorStrip(['TOYO TIRES', 'HKS', 'D1GP', 'GReddy', 'WORK', 'ADVAN'], ['#1d4ed8', '#c8102e', '#111318', '#0f766e', '#111318', '#ff5a1f']), roughness: 0.8 });
  const sub = new THREE.Mesh(new THREE.BoxGeometry(span - 2.4, 0.7, 0.12), [steelMat, steelMat, steelMat, steelMat, subMat, subMat]);
  sub.position.set(0, H - 2.4, 0);
  g.add(sub);
  // start-light cluster: 5 columns x 2 rows, facing the grid (−z = approaching cars)
  const housing = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.5, 0.5), new THREE.MeshStandardMaterial({ color: '#15181f', roughness: 0.5, metalness: 0.3 }));
  housing.position.set(0, H - 3.6, 0);
  g.add(housing);
  const lampGeo = new THREE.SphereGeometry(0.19, 14, 10);
  const redMat = new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff1f1f', emissiveIntensity: 1.4, roughness: 0.3 });
  const offMat = new THREE.MeshStandardMaterial({ color: '#2a2f38', roughness: 0.3, metalness: 0.2 });
  for (let i = -2; i <= 2; i++) {
    for (const row of [0, 1]) {
      for (const face of [-1, 1]) {
        const lamp = new THREE.Mesh(lampGeo, row === 0 ? redMat : offMat);
        lamp.position.set(i * 0.85, H - 3.6 + (row === 0 ? 0.32 : -0.32), face * 0.3);
        g.add(lamp);
      }
    }
  }
  // hanger rods for the sign
  for (const x of [-span / 2 + 2.5, 0, span / 2 - 2.5]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), steelMat);
    rod.position.set(x, H - 0.05 + 0.5 - 0.5, 0);
    g.add(rod);
  }
  // TV camera + speakers on the walkway
  const cam = new THREE.Group();
  cam.position.set(1.6, H + 1.38, 0);
  const tripod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.3, 1.3, 6), steelMat);
  tripod.position.y = 0.65;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.9), new THREE.MeshStandardMaterial({ color: '#1b1e25', roughness: 0.5 }));
  body.position.set(0, 1.45, 0.1);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 10), new THREE.MeshStandardMaterial({ color: '#0a0b0e', roughness: 0.2, metalness: 0.5 }));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 1.45, -0.55);
  cam.add(tripod, body, lens);
  g.add(cam);
  for (const sx of [-1, 1]) {
    const spk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.5), new THREE.MeshStandardMaterial({ color: '#1b1e25', roughness: 0.7 }));
    spk.position.set(sx * (span / 2 - 1.2), H + 1.85, 0);
    g.add(spk);
  }
  // beacon lights + tall chequered flags on the tower tops
  const flagTex = textTexture('', { w: 128, h: 128, checker: true, bg: '#111318' });
  for (const sx of [-1, 1]) {
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: '#ffb703', emissive: '#ffb703', emissiveIntensity: 1.0 }));
    beacon.position.set(sx * halfSpan, H + 1.6, 0);
    g.add(beacon);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 8), whiteSteelMat);
    mast.position.set(sx * (halfSpan + 0.9), H + 2.6, 0);
    g.add(mast);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }));
    flag.position.set(sx * (halfSpan + 0.9) + 0.8, H + 4.2, 0);
    g.add(flag);
  }
  // pit-wall style timing screen under the bridge, driver's left
  const screenTex = textTexture('LAP  1 / 3     P1  YOU', { w: 1024, h: 160, bg: '#0b0d12', fg: '#ffb703', size: 92 });
  const screen = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.9, 0.14), [steelMat, steelMat, steelMat, steelMat, new THREE.MeshStandardMaterial({ map: screenTex, emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 0.7, roughness: 0.5 }), steelMat]);
  screen.position.set(-(halfSpan - 3.4), H - 3.2, 0.5);
  g.add(screen);
  return g;
}

/** Painted road text (transparent plane) for the grid area, e.g. "START" / "EBISU". */
export function makeRoadText(text: string, fg = '#f4f4f0'): THREE.Mesh {
  const tex = textTexture(text, { w: 1024, h: 256, fg, size: 200, transparent: true });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

/** Small painted grid number (P1..P8) for the grid boxes. */
export function makeGridNumber(nr: number): THREE.Mesh {
  const tex = textTexture(String(nr), { w: 128, h: 128, fg: '#f4f4f0', size: 96, transparent: true });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

/* ------------------------------------------------------------------ */
/*  Forest                                                             */
/* ------------------------------------------------------------------ */

function tintGeometry(geo: THREE.BufferGeometry, k: number): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = k;
    col[i * 3 + 1] = k;
    col[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Japanese cedar: three stacked, slightly offset cones (lighter toward the top). */
function cedarGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const layers: [number, number, number, number][] = [
    [2.1, 2.8, 0.0, 0.8],
    [1.6, 2.6, 1.6, 0.95],
    [1.1, 2.4, 3.1, 1.1],
    [0.6, 1.8, 4.5, 1.2],
  ];
  for (const [r, h, y, k] of layers) {
    const c = new THREE.ConeGeometry(r, h, 9, 1);
    c.translate(0, y + h / 2, 0);
    parts.push(tintGeometry(c, k));
  }
  return mergeGeometries(parts, false)!;
}

/** Broadleaf canopy: a cluster of smooth blobs. */
function broadleafGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blobs: [number, number, number, number, number][] = [
    [0, 0, 0, 2.2, 1.0],
    [1.3, -0.5, 0.5, 1.5, 0.9],
    [-1.2, -0.4, -0.6, 1.5, 0.88],
    [0.3, 1.2, -0.3, 1.5, 1.12],
    [-0.4, -0.2, 1.3, 1.3, 0.94],
  ];
  for (const [x, y, z, r, k] of blobs) {
    const b = new THREE.IcosahedronGeometry(r, 1);
    b.translate(x, y, z);
    parts.push(tintGeometry(b, k));
  }
  return mergeGeometries(parts, false)!;
}

/** Sakura: wider, flatter cluster of soft blobs. */
function sakuraGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blobs: [number, number, number, number, number][] = [
    [0, 0, 0, 1.9, 1.0],
    [1.6, -0.3, 0.3, 1.4, 1.06],
    [-1.5, -0.2, -0.4, 1.4, 0.95],
    [0.4, 0.9, 1.2, 1.2, 1.1],
    [-0.3, 0.8, -1.3, 1.2, 1.04],
    [0.9, -0.6, -1.2, 1.1, 0.92],
  ];
  for (const [x, y, z, r, k] of blobs) {
    const b = new THREE.IcosahedronGeometry(r, 1);
    b.scale(1, 0.8, 1);
    b.translate(x, y, z);
    parts.push(tintGeometry(b, k));
  }
  return mergeGeometries(parts, false)!;
}

export interface ForestOptions {
  cx: number;
  cz: number;
  groundY: number;
  wallDist: number;
  rand: () => number;
  heightAt: (x: number, z: number) => number;
  slopeAt: (x: number, z: number) => number;
  distToTrack: (x: number, z: number) => number;
  blocked: (x: number, z: number) => boolean;
  max?: number;
}

export function buildProForest(scene: THREE.Scene, o: ForestOptions): void {
  const MAX = o.max ?? 1500;
  const rand = o.rand;
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a3e27', roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, vertexColors: true });
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 3.2, 7);
  trunkGeo.translate(0, 1.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, MAX);
  const cedars = new THREE.InstancedMesh(cedarGeometry(), leafMat, MAX);
  const broad = new THREE.InstancedMesh(broadleafGeometry(), leafMat, MAX);
  const sakura = new THREE.InstancedMesh(sakuraGeometry(), leafMat, MAX);
  const cedarCols = ['#1f6b34', '#246e3a', '#1a5c2e', '#2f7a3c', '#1c6230'].map((c) => new THREE.Color(c));
  const broadCols = ['#3f8a3a', '#4f9a40', '#3b8536', '#63a848', '#4e9b4a'].map((c) => new THREE.Color(c));
  const autumnCols = ['#e0a03c', '#d8623a', '#f0b84a', '#c94f2f'].map((c) => new THREE.Color(c));
  const sakuraCols = ['#f6b4c8', '#f9c6d6', '#f29ab7', '#fbd3df'].map((c) => new THREE.Color(c));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let nT = 0;
  let nC = 0;
  let nB = 0;
  let nS = 0;
  let attempts = 0;
  const spread = 420;
  while (nT < MAX && attempts < 26000) {
    attempts++;
    const x = o.cx - spread + rand() * spread * 2;
    const z = o.cz - spread + rand() * spread * 2;
    const d = o.distToTrack(x, z);
    if (d < o.wallDist + 7 || o.blocked(x, z)) continue;
    const h = o.heightAt(x, z);
    if (h - o.groundY > 150 || o.slopeAt(x, z) > 0.7) continue;
    const near = d < 58;
    if (near && rand() > 0.38) continue;
    const s = 0.8 + rand() * 0.7;
    q.setFromAxisAngle(UP, rand() * Math.PI * 2);
    const base = h - 0.5;
    // tree type: sakura / broadleaf line the track, cedars cover the hills
    let type: 'cedar' | 'broad' | 'sakura';
    if (near) type = rand() < 0.55 ? 'sakura' : 'broad';
    else if (d < 110) type = rand() < 0.45 ? 'cedar' : rand() < 0.75 ? 'broad' : 'sakura';
    else type = rand() < 0.78 ? 'cedar' : 'broad';
    const trunkH = type === 'cedar' ? 0.75 : 1.0;
    m4.compose(p.set(x, base, z), q, sc.set(s * 1.1, s * trunkH, s * 1.1));
    trunks.setMatrixAt(nT++, m4);
    if (type === 'cedar') {
      m4.compose(p.set(x, base + 1.4 * s, z), q, sc.set(s, s * (0.95 + rand() * 0.2), s));
      cedars.setMatrixAt(nC, m4);
      cedars.setColorAt(nC, cedarCols[Math.floor(rand() * cedarCols.length)]);
      nC++;
    } else if (type === 'broad') {
      m4.compose(p.set(x, base + 4.0 * s, z), q, sc.set(s, s * (0.85 + rand() * 0.2), s));
      broad.setMatrixAt(nB, m4);
      const autumn = rand() < 0.1;
      broad.setColorAt(nB, autumn ? autumnCols[Math.floor(rand() * autumnCols.length)] : broadCols[Math.floor(rand() * broadCols.length)]);
      nB++;
    } else {
      m4.compose(p.set(x, base + 3.6 * s, z), q, sc.set(s * 1.05, s * 0.9, s * 1.05));
      sakura.setMatrixAt(nS, m4);
      sakura.setColorAt(nS, sakuraCols[Math.floor(rand() * sakuraCols.length)]);
      nS++;
    }
  }
  trunks.count = nT;
  cedars.count = nC;
  broad.count = nB;
  sakura.count = nS;
  trunks.castShadow = cedars.castShadow = broad.castShadow = sakura.castShadow = true;
  cedars.receiveShadow = broad.receiveShadow = sakura.receiveShadow = true;
  scene.add(trunks, cedars, broad, sakura);
}
