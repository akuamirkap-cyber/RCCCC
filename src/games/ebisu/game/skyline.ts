import * as THREE from 'three';

/**
 * Procedural downtown skyline for the Long Beach venue.
 *
 * Instead of a scatter of identical textured boxes, the city is laid out on a rotated street grid; every block is
 * split into lots and each lot gets a building from one of several architectural archetypes (setback tower,
 * podium + tower, glass slab, round tower, hotel slab, punched-window midrise). Facades come from six hand-drawn
 * tile styles with per-building vertex tints, a ground-level darkening gradient, and real rooftop clutter
 * (parapets, mechanical penthouses, AC units, water tanks, antennas, crown fins). Everything is merged into one
 * geometry per facade style, so the whole downtown costs ~9 draw calls.
 */

export interface SkylineOptions {
  rand: () => number;
  aniso: number;
  groundY: number;
  /** Centre of the scene (track centre). */
  cx: number;
  cz: number;
  /** Returns true when a footprint corner is too close to the circuit. */
  blocked: (x: number, z: number) => boolean;
  /** World-space "downtown core" — the tallest towers cluster here. */
  core: { x: number; z: number };
  /** Blocks are only placed where this returns true (keeps the harbour side free). */
  allow: (x: number, z: number) => boolean;
}

/* ------------------------------------------------------------------ */
/*  Facade tiles (one tile = 4 bays × 4 floors)                        */
/* ------------------------------------------------------------------ */

type Tile = { tex: THREE.CanvasTexture; bay: number; floor: number; roughness: number; metalness: number };

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, ctx: c.getContext('2d')! };
}

function finish(c: HTMLCanvasElement, aniso: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** Punched windows in a stone / stucco / brick wall: sills, random blinds, slightly uneven window brightness. */
function punchedTile(rand: () => number, aniso: number, wall: string, glass: string, sill: string, cols: number, rows: number, grout?: string): Tile {
  const { c, ctx } = canvas();
  const S = 256;
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, S, S);
  if (grout) {
    // brick courses
    ctx.strokeStyle = grout;
    ctx.lineWidth = 1;
    for (let y = 0; y < S; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(S, y + 0.5);
      ctx.stroke();
    }
  }
  const cw = S / cols;
  const rh = S / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = i * cw + cw * 0.22;
      const y = j * rh + rh * 0.18;
      const w = cw * 0.56;
      const h = rh * 0.58;
      const v = rand();
      // glass with sky gradient, occasionally curtains / lights
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      if (v < 0.14) {
        g.addColorStop(0, '#f3e9c8');
        g.addColorStop(1, '#d9c89a');
      } else if (v < 0.3) {
        g.addColorStop(0, '#2b3442');
        g.addColorStop(1, '#1b212b');
      } else {
        g.addColorStop(0, '#c9dbea');
        g.addColorStop(0.45, glass);
        g.addColorStop(1, '#1f2b3a');
      }
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      // reveal shadow (top + left) and sill
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y, w, 2);
      ctx.fillRect(x, y, 2, h);
      ctx.fillStyle = sill;
      ctx.fillRect(x - 2, y + h, w + 4, 3);
      // mullion
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x + w / 2 - 1, y, 2, h);
    }
  }
  return { tex: finish(c, aniso), bay: 3.6, floor: 3.4, roughness: 0.85, metalness: 0 };
}

/** Glass curtain wall: vertical mullions, dark spandrel band per floor, bluish sky reflection. */
function curtainTile(rand: () => number, aniso: number, glassTop: string, glassBot: string, spandrel: string, mullion: string): Tile {
  const { c, ctx } = canvas();
  const S = 256;
  const rows = 4;
  const cols = 8;
  const rh = S / rows;
  for (let j = 0; j < rows; j++) {
    const y = j * rh;
    const g = ctx.createLinearGradient(0, y, 0, y + rh);
    g.addColorStop(0, glassTop);
    g.addColorStop(0.7, glassBot);
    g.addColorStop(1, glassTop);
    ctx.fillStyle = g;
    ctx.fillRect(0, y, S, rh);
    // spandrel
    ctx.fillStyle = spandrel;
    ctx.fillRect(0, y + rh * 0.72, S, rh * 0.26);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, y + rh * 0.72, S, 2);
    // random interior lights / blinds
    for (let i = 0; i < cols; i++) {
      if (rand() < 0.22) {
        ctx.fillStyle = rand() < 0.5 ? 'rgba(255,240,200,0.28)' : 'rgba(10,14,22,0.35)';
        ctx.fillRect((i * S) / cols + 2, y + 2, S / cols - 4, rh * 0.68);
      }
    }
  }
  ctx.fillStyle = mullion;
  for (let i = 0; i <= cols; i++) ctx.fillRect((i * S) / cols - 1, 0, 2, S);
  return { tex: finish(c, aniso), bay: 1.5, floor: 3.6, roughness: 0.3, metalness: 0.45 };
}

/** Hotel / apartment slab: white floor slabs, balcony railings, recessed dark glass. */
function balconyTile(rand: () => number, aniso: number, slab: string, back: string, rail: string): Tile {
  const { c, ctx } = canvas();
  const S = 256;
  const rows = 4;
  const cols = 4;
  const rh = S / rows;
  const cw = S / cols;
  for (let j = 0; j < rows; j++) {
    const y = j * rh;
    // recessed glass + wall behind the balcony
    ctx.fillStyle = back;
    ctx.fillRect(0, y, S, rh);
    for (let i = 0; i < cols; i++) {
      const x = i * cw;
      const lit = rand() < 0.2;
      const g = ctx.createLinearGradient(0, y, 0, y + rh);
      g.addColorStop(0, lit ? '#ffe6b3' : '#9fb6c9');
      g.addColorStop(1, lit ? '#d9b77a' : '#2a3645');
      ctx.fillStyle = g;
      ctx.fillRect(x + cw * 0.12, y + rh * 0.08, cw * 0.76, rh * 0.62);
      ctx.fillStyle = slab;
      ctx.fillRect(x + cw * 0.88, y, cw * 0.12, rh); // party wall between balconies
      // railing (glass)
      ctx.fillStyle = 'rgba(190,220,240,0.55)';
      ctx.fillRect(x + cw * 0.05, y + rh * 0.42, cw * 0.83, rh * 0.3);
      ctx.fillStyle = rail;
      ctx.fillRect(x + cw * 0.05, y + rh * 0.42, cw * 0.83, 2);
    }
    // floor slab
    ctx.fillStyle = slab;
    ctx.fillRect(0, y + rh * 0.72, S, rh * 0.28);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, y + rh * 0.72, S, 3);
  }
  return { tex: finish(c, aniso), bay: 4.2, floor: 3.2, roughness: 0.75, metalness: 0 };
}

/** Ribbon windows: continuous horizontal glass strips between light aluminium bands. */
function ribbonTile(rand: () => number, aniso: number, band: string, glass: string): Tile {
  const { c, ctx } = canvas();
  const S = 256;
  const rows = 4;
  const rh = S / rows;
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, S, S);
  for (let j = 0; j < rows; j++) {
    const y = j * rh + rh * 0.22;
    const h = rh * 0.5;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#d8e6f2');
    g.addColorStop(0.5, glass);
    g.addColorStop(1, '#1c2733');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, S, h);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, y, S, 2);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect((i * S) / 12, y, 1.5, h);
      if (rand() < 0.15) {
        ctx.fillStyle = 'rgba(10,14,22,0.4)';
        ctx.fillRect((i * S) / 12 + 2, y + 2, S / 12 - 4, h - 4);
      }
    }
  }
  return { tex: finish(c, aniso), bay: 2.4, floor: 3.4, roughness: 0.6, metalness: 0.15 };
}

/* ------------------------------------------------------------------ */
/*  Geometry builder (quads with position / normal / uv / color)       */
/* ------------------------------------------------------------------ */

class QuadBuffer {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];

  /** Quad from 4 corners (counter-clockwise seen from outside), normal, uv rectangle and per-corner tint. */
  quad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    n: THREE.Vector3,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    cBot: THREE.Color,
    cTop: THREE.Color,
  ) {
    // a = bottom-left, b = bottom-right, c = top-right, d = top-left
    const push = (p: THREE.Vector3, u: number, v: number, col: THREE.Color) => {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(u, v);
      this.col.push(col.r, col.g, col.b);
    };
    push(a, u0, v0, cBot);
    push(b, u1, v0, cBot);
    push(c, u1, v1, cTop);
    push(a, u0, v0, cBot);
    push(c, u1, v1, cTop);
    push(d, u0, v1, cTop);
  }

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, n: THREE.Vector3, col: THREE.Color) {
    for (const p of [a, b, c]) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(p.x / 8, p.z / 8);
      this.col.push(col.r, col.g, col.b);
    }
  }

  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _cb = new THREE.Color();
const _ct = new THREE.Color();

/**
 * Box with 4 textured walls (facade buffer) + a roof quad (roof buffer). Rotated by `yaw` around (x, z).
 * UVs are snapped to whole bays / floors so window columns are never cut in half.
 */
function box(
  fac: QuadBuffer,
  roof: QuadBuffer | null,
  tile: Tile,
  x: number,
  y0: number,
  z: number,
  w: number,
  h: number,
  d: number,
  yaw: number,
  tint: THREE.Color,
  /** vertical darkening: colour multiplier at the bottom of this box */
  darkBot: number,
  darkTop: number,
  roofTint?: THREE.Color,
) {
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const hw = w / 2;
  const hd = d / 2;
  const corner = (lx: number, lz: number, y: number, out: THREE.Vector3) => out.set(x + lx * cs - lz * sn, y, z + lx * sn + lz * cs);
  const walls: [number, number, number, number, number, number, number][] = [
    // lx0, lz0, lx1, lz1, nx, nz, length
    [-hw, hd, hw, hd, 0, 1, w], // +z (front)
    [hw, hd, hw, -hd, 1, 0, d], // +x
    [hw, -hd, -hw, -hd, 0, -1, w], // -z
    [-hw, -hd, -hw, hd, -1, 0, d], // -x
  ];
  const floors = Math.max(1, Math.round(h / tile.floor));
  _cb.copy(tint).multiplyScalar(darkBot);
  _ct.copy(tint).multiplyScalar(darkTop);
  for (const [lx0, lz0, lx1, lz1, nx, nz, len] of walls) {
    const bays = Math.max(1, Math.round(len / tile.bay));
    corner(lx0, lz0, y0, _a);
    corner(lx1, lz1, y0, _b);
    corner(lx1, lz1, y0 + h, _c);
    corner(lx0, lz0, y0 + h, _d);
    _n.set(nx * cs - nz * sn, 0, nx * sn + nz * cs);
    fac.quad(_a, _b, _c, _d, _n, 0, 0, bays / 4, floors / 4, _cb, _ct);
  }
  if (roof) {
    const rc = roofTint ?? _ct;
    corner(-hw, hd, y0 + h, _a);
    corner(hw, hd, y0 + h, _b);
    corner(hw, -hd, y0 + h, _c);
    corner(-hw, -hd, y0 + h, _d);
    _n.set(0, 1, 0);
    roof.quad(_a, _b, _c, _d, _n, 0, 0, w / 8, d / 8, rc, rc);
  }
}

/** n-sided prism (round tower). */
function prism(fac: QuadBuffer, roof: QuadBuffer, tile: Tile, x: number, y0: number, z: number, r: number, h: number, sides: number, tint: THREE.Color, darkBot: number, darkTop: number) {
  const floors = Math.max(1, Math.round(h / tile.floor));
  const seg = (2 * Math.PI * r) / sides;
  const bays = Math.max(1, Math.round(seg / tile.bay));
  _cb.copy(tint).multiplyScalar(darkBot);
  _ct.copy(tint).multiplyScalar(darkTop);
  const centreTop = new THREE.Vector3(x, y0 + h, z);
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    _a.set(x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r);
    _b.set(x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r);
    _c.set(_b.x, y0 + h, _b.z);
    _d.set(_a.x, y0 + h, _a.z);
    const am = (a0 + a1) / 2;
    _n.set(Math.cos(am), 0, Math.sin(am));
    // winding: a0 → a1 goes clockwise seen from above (x→z), flip so the face points outwards
    fac.quad(_b, _a, _d, _c, _n, 0, 0, bays / 4, floors / 4, _cb, _ct);
    roof.tri(_c, _d, centreTop, UP, _ct);
  }
}

/* ------------------------------------------------------------------ */
/*  City                                                               */
/* ------------------------------------------------------------------ */

export function buildSkyline(scene: THREE.Scene, o: SkylineOptions): void {
  const { rand, aniso, groundY } = o;

  const tiles: Tile[] = [
    curtainTile(rand, aniso, '#9cc4e4', '#3f6f9f', '#1e2d3d', '#dfe8f0'), // 0 blue glass
    curtainTile(rand, aniso, '#8fb3a9', '#2f5c5a', '#1a2a2a', '#c9d6d2'), // 1 green-teal glass
    punchedTile(rand, aniso, '#d9d2c4', '#4e7398', '#eae4d8', 4, 4), // 2 beige stone
    punchedTile(rand, aniso, '#a65d45', '#4a6f93', '#d7c3b0', 4, 4, 'rgba(0,0,0,0.12)'), // 3 brick
    balconyTile(rand, aniso, '#f1f2f4', '#8a94a0', '#a6adb5'), // 4 hotel balconies
    ribbonTile(rand, aniso, '#e9ebee', '#4f7faa'), // 5 white ribbon office
    punchedTile(rand, aniso, '#b8bcc2', '#3b5f84', '#d8dbe0', 5, 4), // 6 grey precast
  ];
  const facBufs = tiles.map(() => new QuadBuffer());
  const roofBuf = new QuadBuffer();
  const detailBuf = new QuadBuffer(); // mechanical boxes, parapets, tanks (flat grey)
  const crownBuf = new QuadBuffer(); // antennas / fins (dark)

  const tintOf = (base: THREE.Color, jitter: number) => {
    const c = base.clone();
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h + (rand() - 0.5) * jitter * 0.1, THREE.MathUtils.clamp(hsl.s + (rand() - 0.5) * jitter * 0.3, 0, 1), THREE.MathUtils.clamp(hsl.l + (rand() - 0.5) * jitter * 0.25, 0.3, 1));
    return c;
  };
  const whiteish = new THREE.Color('#ffffff');
  const roofGrey = new THREE.Color('#6e7378');
  const roofDark = new THREE.Color('#4a4e55');
  const detailTint = new THREE.Color('#c9cdd2');
  const darkTint = new THREE.Color('#2a2d33');

  // rooftop clutter helpers --------------------------------------------------
  const parapet = (x: number, y: number, z: number, w: number, d: number, yaw: number) => {
    const t = 0.5;
    const hgt = 1.1;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const place = (lx: number, lz: number, bw: number, bd: number) => box(detailBuf, detailBuf, tiles[6], x + lx * cs - lz * sn, y, z + lx * sn + lz * cs, bw, hgt, bd, yaw, detailTint, 1, 1);
    place(0, d / 2 - t / 2, w, t);
    place(0, -d / 2 + t / 2, w, t);
    place(w / 2 - t / 2, 0, t, d - 2 * t);
    place(-w / 2 + t / 2, 0, t, d - 2 * t);
  };
  const acUnits = (x: number, y: number, z: number, w: number, d: number, yaw: number, count: number) => {
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    for (let i = 0; i < count; i++) {
      const lx = (rand() - 0.5) * (w - 6);
      const lz = (rand() - 0.5) * (d - 6);
      const s = 1.6 + rand() * 1.6;
      box(detailBuf, detailBuf, tiles[6], x + lx * cs - lz * sn, y, z + lx * sn + lz * cs, s, 1 + rand() * 0.8, s * (0.7 + rand() * 0.6), yaw + (rand() < 0.5 ? 0 : Math.PI / 2), detailTint, 1, 1);
    }
  };
  const penthouse = (x: number, y: number, z: number, w: number, d: number, yaw: number) => {
    const pw = w * (0.35 + rand() * 0.25);
    const pd = d * (0.35 + rand() * 0.25);
    const ph = 3 + rand() * 3;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const lx = (rand() - 0.5) * (w - pw) * 0.8;
    const lz = (rand() - 0.5) * (d - pd) * 0.8;
    box(detailBuf, detailBuf, tiles[6], x + lx * cs - lz * sn, y, z + lx * sn + lz * cs, pw, ph, pd, yaw, detailTint.clone().multiplyScalar(0.9), 1, 1);
    return ph;
  };
  const antenna = (x: number, y: number, z: number, h: number) => {
    box(crownBuf, crownBuf, tiles[6], x, y, z, 0.5, h, 0.5, 0, darkTint, 1, 1);
    box(crownBuf, crownBuf, tiles[6], x, y + h * 0.55, z, 2.2, 0.3, 2.2, 0, darkTint, 1, 1);
  };
  const waterTank = (x: number, y: number, z: number) => {
    prism(detailBuf, detailBuf, tiles[6], x, y, z, 1.6, 3.2, 8, detailTint.clone().multiplyScalar(0.85), 1, 1);
  };

  // archetypes --------------------------------------------------------------
  const DARK_BOT = 0.62; // street-level darkening (the city reads as "grounded")
  type Lot = { x: number; z: number; w: number; d: number; yaw: number; h: number; dist: number };

  const glassTiles = [0, 1, 5];
  const stoneTiles = [2, 3, 6];

  const setbackTower = (L: Lot) => {
    const ti = glassTiles[Math.floor(rand() * glassTiles.length)];
    const tint = tintOf(whiteish, 0.6);
    let w = L.w;
    let d = L.d;
    let y = groundY;
    const tiers = 2 + Math.floor(rand() * 2);
    let remaining = L.h;
    for (let k = 0; k < tiers; k++) {
      const hk = k === tiers - 1 ? remaining : remaining * (0.35 + rand() * 0.25);
      const bot = k === 0 ? DARK_BOT : 0.9 + k * 0.03;
      box(facBufs[ti], roofBuf, tiles[ti], L.x, y, L.z, w, hk, d, L.yaw, tint, bot, 1, roofDark);
      if (k < tiers - 1) parapet(L.x, y + hk, L.z, w, d, L.yaw);
      y += hk;
      remaining -= hk;
      w *= 0.72 + rand() * 0.12;
      d *= 0.72 + rand() * 0.12;
    }
    parapet(L.x, y, L.z, w, d, L.yaw);
    const ph = penthouse(L.x, y, L.z, w, d, L.yaw);
    if (rand() < 0.7) antenna(L.x + (rand() - 0.5) * w * 0.3, y + ph, L.z + (rand() - 0.5) * d * 0.3, 8 + rand() * 14);
  };

  const podiumTower = (L: Lot) => {
    const pt = stoneTiles[Math.floor(rand() * stoneTiles.length)];
    const tt = glassTiles[Math.floor(rand() * glassTiles.length)];
    const podTint = tintOf(whiteish, 0.5);
    const twTint = tintOf(whiteish, 0.6);
    const ph = 10 + rand() * 10;
    box(facBufs[pt], roofBuf, tiles[pt], L.x, groundY, L.z, L.w, ph, L.d, L.yaw, podTint, DARK_BOT, 1, roofGrey);
    parapet(L.x, groundY + ph, L.z, L.w, L.d, L.yaw);
    acUnits(L.x, groundY + ph, L.z, L.w, L.d, L.yaw, 2 + Math.floor(rand() * 3));
    const tw = Math.max(12, L.w * (0.45 + rand() * 0.2));
    const td = Math.max(12, L.d * (0.45 + rand() * 0.2));
    const cs = Math.cos(L.yaw);
    const sn = Math.sin(L.yaw);
    const lx = (rand() - 0.5) * (L.w - tw - 4);
    const lz = (rand() - 0.5) * (L.d - td - 4);
    const tx = L.x + lx * cs - lz * sn;
    const tz = L.z + lx * sn + lz * cs;
    const th = L.h - ph;
    box(facBufs[tt], roofBuf, tiles[tt], tx, groundY + ph, tz, tw, th, td, L.yaw, twTint, 0.92, 1, roofDark);
    parapet(tx, groundY + ph + th, tz, tw, td, L.yaw);
    const pph = penthouse(tx, groundY + ph + th, tz, tw, td, L.yaw);
    if (rand() < 0.5) antenna(tx, groundY + ph + th + pph, tz, 6 + rand() * 10);
  };

  const glassSlab = (L: Lot) => {
    const ti = glassTiles[Math.floor(rand() * glassTiles.length)];
    const tint = tintOf(whiteish, 0.6);
    // slender slab: thin in one axis
    const thin = rand() < 0.5;
    const w = thin ? L.w * 0.55 : L.w;
    const d = thin ? L.d : L.d * 0.55;
    box(facBufs[ti], roofBuf, tiles[ti], L.x, groundY, L.z, w, L.h, d, L.yaw, tint, DARK_BOT, 1, roofDark);
    // crown: a fin / raised screen along the long edge
    const fin = rand() < 0.6;
    if (fin) {
      const cs = Math.cos(L.yaw);
      const sn = Math.sin(L.yaw);
      const isLong = w >= d;
      const lx = isLong ? 0 : w / 2 - 0.6;
      const lz = isLong ? d / 2 - 0.6 : 0;
      box(crownBuf, crownBuf, tiles[6], L.x + lx * cs - lz * sn, groundY + L.h, L.z + lx * sn + lz * cs, isLong ? w : 1.2, 4 + rand() * 5, isLong ? 1.2 : d, L.yaw, darkTint, 1, 1);
    } else parapet(L.x, groundY + L.h, L.z, w, d, L.yaw);
    acUnits(L.x, groundY + L.h, L.z, w, d, L.yaw, 1 + Math.floor(rand() * 2));
    if (rand() < 0.4) antenna(L.x, groundY + L.h, L.z, 6 + rand() * 8);
  };

  const roundTower = (L: Lot) => {
    const ti = glassTiles[Math.floor(rand() * glassTiles.length)];
    const tint = tintOf(whiteish, 0.6);
    const r = Math.min(L.w, L.d) * 0.48;
    prism(facBufs[ti], roofBuf, tiles[ti], L.x, groundY, L.z, r, L.h, 20, tint, DARK_BOT, 1);
    // crown ring (slightly wider, dark) + core
    prism(crownBuf, crownBuf, tiles[6], L.x, groundY + L.h, L.z, r * 1.04, 1.6, 20, darkTint, 1, 1);
    prism(detailBuf, detailBuf, tiles[6], L.x, groundY + L.h, L.z, r * 0.35, 4 + rand() * 3, 12, detailTint, 1, 1);
    antenna(L.x, groundY + L.h + 5, L.z, 10 + rand() * 10);
  };

  const hotelSlab = (L: Lot) => {
    const tint = tintOf(whiteish, 0.35);
    const isLong = L.w >= L.d;
    const w = isLong ? L.w : L.w * 0.6;
    const d = isLong ? L.d * 0.6 : L.d;
    box(facBufs[4], roofBuf, tiles[4], L.x, groundY, L.z, w, L.h, d, L.yaw, tint, DARK_BOT, 1, roofGrey);
    // lobby / ballroom wing in stone
    const cs = Math.cos(L.yaw);
    const sn = Math.sin(L.yaw);
    const lx = isLong ? 0 : (w / 2 + L.w * 0.18) * (rand() < 0.5 ? 1 : -1);
    const lz = isLong ? (d / 2 + L.d * 0.18) * (rand() < 0.5 ? 1 : -1) : 0;
    box(facBufs[2], roofBuf, tiles[2], L.x + lx * cs - lz * sn, groundY, L.z + lx * sn + lz * cs, isLong ? w * 0.7 : L.w * 0.36, 7 + rand() * 4, isLong ? L.d * 0.36 : d * 0.7, L.yaw, tintOf(whiteish, 0.3), DARK_BOT, 1, roofGrey);
    parapet(L.x, groundY + L.h, L.z, w, d, L.yaw);
    acUnits(L.x, groundY + L.h, L.z, w, d, L.yaw, 2 + Math.floor(rand() * 3));
    if (rand() < 0.5) waterTank(L.x + (rand() - 0.5) * w * 0.4, groundY + L.h, L.z + (rand() - 0.5) * d * 0.4);
  };

  const midrise = (L: Lot) => {
    const ti = stoneTiles[Math.floor(rand() * stoneTiles.length)];
    const tint = tintOf(whiteish, 0.55);
    box(facBufs[ti], roofBuf, tiles[ti], L.x, groundY, L.z, L.w, L.h, L.d, L.yaw, tint, DARK_BOT, 1, roofGrey);
    parapet(L.x, groundY + L.h, L.z, L.w, L.d, L.yaw);
    acUnits(L.x, groundY + L.h, L.z, L.w, L.d, L.yaw, 2 + Math.floor(rand() * 4));
    if (rand() < 0.45) waterTank(L.x + (rand() - 0.5) * L.w * 0.5, groundY + L.h, L.z + (rand() - 0.5) * L.d * 0.5);
    if (rand() < 0.25) {
      // rooftop stair bulkhead
      const cs = Math.cos(L.yaw);
      const sn = Math.sin(L.yaw);
      const lx = (rand() - 0.5) * (L.w - 6);
      const lz = (rand() - 0.5) * (L.d - 6);
      box(detailBuf, detailBuf, tiles[6], L.x + lx * cs - lz * sn, groundY + L.h, L.z + lx * sn + lz * cs, 3.5, 2.8, 4.5, L.yaw, detailTint, 1, 1);
    }
  };

  const place = (L: Lot) => {
    if (L.h > 85) {
      const v = rand();
      if (v < 0.35) setbackTower(L);
      else if (v < 0.6) podiumTower(L);
      else if (v < 0.85) glassSlab(L);
      else roundTower(L);
    } else if (L.h > 40) {
      const v = rand();
      if (v < 0.3) glassSlab(L);
      else if (v < 0.55) podiumTower(L);
      else if (v < 0.75) hotelSlab(L);
      else midrise(L);
    } else {
      const v = rand();
      if (v < 0.3) hotelSlab(L);
      else midrise(L);
    }
  };

  // street grid ------------------------------------------------------------
  const theta = 0.14; // the downtown grid is slightly rotated against the circuit — it never looks "aligned to the game"
  const cs = Math.cos(theta);
  const sn = Math.sin(theta);
  const BLOCK = 54;
  const STREET = 16;
  const PITCH = BLOCK + STREET;
  const toWorld = (gx: number, gz: number) => ({ x: o.cx + gx * cs - gz * sn, z: o.cz + gx * sn + gz * cs });
  const coreDist = (x: number, z: number) => Math.hypot(x - o.core.x, z - o.core.z);

  for (let i = -10; i <= 10; i++) {
    for (let j = -10; j <= 10; j++) {
      const c = toWorld(i * PITCH, j * PITCH);
      if (!o.allow(c.x, c.z)) continue;
      // whole block must be clear of the circuit
      const hb = BLOCK / 2 + 6;
      let clear = true;
      for (const [sx, sz] of [
        [-hb, -hb],
        [hb, -hb],
        [hb, hb],
        [-hb, hb],
        [0, 0],
      ]) {
        const p = toWorld(i * PITCH + sx, j * PITCH + sz);
        if (o.blocked(p.x, p.z)) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      const dist = coreDist(c.x, c.z);
      // height profile: tall core, falling off with distance, with noise and a few outliers
      const f = THREE.MathUtils.clamp(1 - dist / 460, 0, 1);
      const baseH = 12 + f * f * 120 * (0.55 + rand() * 0.7);
      // empty / parking lots keep the city from being a solid wall
      if (rand() < 0.08 && f < 0.6) continue;
      // lots: tall blocks hold one big building, others are split 2–4 ways
      const lots: Lot[] = [];
      const split = baseH > 70 ? (rand() < 0.6 ? 1 : 2) : rand() < 0.3 ? 2 : rand() < 0.7 ? 4 : 1;
      const mk = (gx: number, gz: number, w: number, d: number) => {
        const sx = 2 + rand() * 4;
        const sz = 2 + rand() * 4;
        const p = toWorld(gx, gz);
        const h = Math.max(9, baseH * (0.7 + rand() * 0.6));
        lots.push({ x: p.x, z: p.z, w: Math.max(12, w - sx * 2), d: Math.max(12, d - sz * 2), yaw: theta, h, dist });
      };
      const gx0 = i * PITCH;
      const gz0 = j * PITCH;
      if (split === 1) mk(gx0, gz0, BLOCK, BLOCK);
      else if (split === 2) {
        if (rand() < 0.5) {
          mk(gx0 - BLOCK / 4, gz0, BLOCK / 2, BLOCK);
          mk(gx0 + BLOCK / 4, gz0, BLOCK / 2, BLOCK);
        } else {
          mk(gx0, gz0 - BLOCK / 4, BLOCK, BLOCK / 2);
          mk(gx0, gz0 + BLOCK / 4, BLOCK, BLOCK / 2);
        }
      } else {
        for (const [ox, oz] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          if (rand() < 0.12) continue; // small plaza / car park
          mk(gx0 + (ox * BLOCK) / 4, gz0 + (oz * BLOCK) / 4, BLOCK / 2, BLOCK / 2);
        }
      }
      for (const L of lots) place(L);
    }
  }

  // one landmark: the tallest tower exactly at the core (if the core is free)
  if (!o.blocked(o.core.x, o.core.z) && o.allow(o.core.x, o.core.z)) setbackTower({ x: o.core.x, z: o.core.z, w: 40, d: 40, yaw: theta, h: 150, dist: 0 });

  // meshes -----------------------------------------------------------------
  tiles.forEach((tile, k) => {
    const g = facBufs[k].build();
    if (!g) return;
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tile.tex, vertexColors: true, roughness: tile.roughness, metalness: tile.metalness }));
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = true;
    scene.add(m);
  });
  const roofG = roofBuf.build();
  if (roofG) scene.add(new THREE.Mesh(roofG, new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.95 })));
  const detailG = detailBuf.build();
  if (detailG) scene.add(new THREE.Mesh(detailG, new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.85 })));
  const crownG = crownBuf.build();
  if (crownG) scene.add(new THREE.Mesh(crownG, new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.5, metalness: 0.4 })));
}
