import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Geometri pohon low-poly ala Art of Rally.
 * - Vertex di-jitter secara deterministik (hash posisi) → siluet organik, tanpa retak.
 * - Gradasi vertikal "di-bake" ke vertex color: bawah lebih gelap & sejuk, puncak lebih terang & hangat.
 *   Warna akhir = vertex color × warna instance (palet per pohon).
 */

const frac = (v: number) => v - Math.floor(v);
const hash3 = (x: number, y: number, z: number, s: number) =>
  frac(Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453);

type Shade = (x: number, y: number, z: number) => [number, number, number];

function jitter(g: THREE.BufferGeometry, ax: number, ay: number, seed: number) {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const kx = Math.round(x * 40);
    const ky = Math.round(y * 40);
    const kz = Math.round(z * 40);
    p.setXYZ(
      i,
      x + (hash3(kx, ky, kz, seed) - 0.5) * 2 * ax,
      y + (hash3(kx, ky, kz, seed + 1) - 0.5) * 2 * ay,
      z + (hash3(kx, ky, kz, seed + 2) - 0.5) * 2 * ax
    );
  }
}

function paint(g: THREE.BufferGeometry, fn: Shade) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = fn(p.getX(i), p.getY(i), p.getZ(i));
    c[i * 3] = r;
    c[i * 3 + 1] = gg;
    c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

function part(src: THREE.BufferGeometry, ax: number, ay: number, seed: number, shade: Shade) {
  const g = src.index ? src.toNonIndexed() : src;
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  jitter(g, ax, ay, seed);
  paint(g, shade);
  return g;
}

function finish(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

const TRUNK: Shade = () => [0.92, 0.8, 0.64];

/** Sugi (cedar Jepang): tinggi, ramping, 7 tingkat — ciri khas hutan gunung Gunma. */
export function makeCedar() {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = part(new THREE.CylinderGeometry(0.17, 0.27, 2.8, 5, 1, true), 0.03, 0.03, 11, TRUNK);
  trunk.translate(0, 1.4, 0);
  parts.push(trunk);
  const TIERS = 7;
  for (let k = 0; k < TIERS; k++) {
    const t = k / (TIERS - 1);
    const rad = 2.1 * (1 - 0.82 * t);
    const h = 3.6 * (1 - 0.4 * t);
    const by = 1.9 + k * 1.42;
    const tier = part(new THREE.ConeGeometry(rad, h, 7, 1, true), rad * 0.09, h * 0.04, 100 + k, (_x, y) => {
      const u = y / h + 0.5; // 0 bawah tingkat → 1 ujung
      const s = (0.72 + 0.26 * t) * (0.8 + 0.26 * u);
      return [s * (1 + 0.035 * u), s, s * (1 - 0.04 * u)];
    });
    tier.rotateY(k * 0.83);
    tier.translate(0, by + h / 2, 0);
    parts.push(tier);
  }
  return finish(parts);
}

/** Cemara lebar (fir/hinoki): 4 tingkat, lebih pendek dan rimbun. */
export function makeFir() {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = part(new THREE.CylinderGeometry(0.2, 0.3, 2.0, 5, 1, true), 0.03, 0.03, 21, TRUNK);
  trunk.translate(0, 1.0, 0);
  parts.push(trunk);
  const TIERS = 4;
  for (let k = 0; k < TIERS; k++) {
    const t = k / (TIERS - 1);
    const rad = 2.6 * (1 - 0.68 * t);
    const h = 3.3 * (1 - 0.25 * t);
    const by = 1.5 + k * 1.55;
    const tier = part(new THREE.ConeGeometry(rad, h, 8, 1, true), rad * 0.1, h * 0.04, 200 + k, (_x, y) => {
      const u = y / h + 0.5;
      const s = (0.74 + 0.22 * t) * (0.78 + 0.28 * u);
      return [s * (1 + 0.04 * u), s, s * (1 - 0.04 * u)];
    });
    tier.rotateY(k * 1.1);
    tier.translate(0, by + h / 2, 0);
    parts.push(tier);
  }
  return finish(parts);
}

function blob(rad: number, squash: number, detail: number, seed: number, lift: number) {
  const base = new THREE.IcosahedronGeometry(rad, detail);
  base.scale(1, squash, 1);
  const ry = rad * squash;
  return part(base, rad * 0.1, rad * 0.07, seed, (_x, y) => {
    const u = y / ry * 0.5 + 0.5; // 0 dasar kanopi → 1 puncak
    const s = 0.68 + 0.36 * u + lift;
    return [s * (1 + 0.045 * u), s, s * (1 - 0.05 * u)];
  });
}

/** Pohon daun lebar (maple/zelkova): kanopi bulat dari beberapa gumpalan. */
export function makeBroadleaf() {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = part(new THREE.CylinderGeometry(0.18, 0.32, 3.4, 5, 1, true), 0.03, 0.03, 31, TRUNK);
  trunk.translate(0, 1.7, 0);
  parts.push(trunk);
  const blobs: [number, number, number, number, number, number][] = [
    // rad, x, y, z, seed, lift
    [2.7, 0, 5.0, 0, 301, 0],
    [1.95, 1.55, 4.4, 0.7, 302, -0.02],
    [1.85, -1.4, 4.6, -0.9, 303, -0.02],
    [1.6, 0.3, 6.4, -0.4, 304, 0.05],
  ];
  for (const [rad, x, y, z, seed, lift] of blobs) {
    const b = blob(rad, 0.8, 1, seed, lift);
    b.translate(x, y, z);
    parts.push(b);
  }
  return finish(parts);
}

/** Semak bulat rendah — pengisi tepi hutan & bahu jalan. */
export function makeBush() {
  const a = blob(1.15, 0.68, 1, 401, 0);
  a.translate(0, 0.55, 0);
  const b = blob(0.8, 0.7, 1, 402, 0.03);
  b.translate(0.85, 0.42, 0.35);
  return finish([a, b]);
}
