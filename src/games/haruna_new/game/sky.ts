import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise';

export interface SkyPalette {
  horizon: string; // harus sama dengan warna fog → gunung jauh melebur ke langit
  mid: string;
  zenith: string;
  sun: string;
  glow: number;
  cloud: string;
  cloudE: string;
}

/** Kubah langit gradien (horizon → zenith) + halo matahari + awan low-poly pipih. */
export class Sky {
  dome: THREE.Mesh;
  clouds = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private cloudMat: THREE.MeshLambertMaterial;

  constructor(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        horizon: { value: new THREE.Color('#e4ecea') },
        mid: { value: new THREE.Color('#bcdcec') },
        zenith: { value: new THREE.Color('#79b4df') },
        sunCol: { value: new THREE.Color('#fff4de') },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        glow: { value: 1 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 horizon; uniform vec3 mid; uniform vec3 zenith;
        uniform vec3 sunCol; uniform vec3 sunDir; uniform float glow;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.26, h));
          c = mix(c, zenith, smoothstep(0.14, 0.9, h));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          c += sunCol * (pow(s, 5.0) * 0.16 + pow(s, 48.0) * 0.30) * glow;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 18), this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;

    // ---- awan ----
    this.cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#5d6f80', flatShading: true });
    const rng = mulberry32(77);
    const variants = [1, 2, 3].map((s) => this.cloudGeo(s * 13));
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const rx = (bounds.maxX - bounds.minX) / 2 + 700;
    const rz = (bounds.maxZ - bounds.minZ) / 2 + 700;
    const d = new THREE.Object3D();
    for (const geo of variants) {
      const count = 13;
      const mesh = new THREE.InstancedMesh(geo, this.cloudMat, count);
      for (let i = 0; i < count; i++) {
        d.position.set(cx + (rng() * 2 - 1) * rx, 1380 + rng() * 160, cz + (rng() * 2 - 1) * rz);
        d.rotation.set(0, rng() * Math.PI * 2, 0);
        const s = 1.0 + rng() * 1.1;
        d.scale.set(s, 0.9 + rng() * 0.4, s);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      mesh.frustumCulled = false;
      this.clouds.add(mesh);
    }
  }

  private cloudGeo(seed: number) {
    const r = mulberry32(seed);
    const puffs = 4 + Math.floor(r() * 3);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < puffs; i++) {
      const rad = 24 + r() * 22;
      let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(rad, 1);
      g = g.toNonIndexed();
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      g.scale(1, 0.62, 1);
      // dasar awan rata
      const p = g.attributes.position as THREE.BufferAttribute;
      const floor = -rad * 0.62 * 0.3;
      for (let k = 0; k < p.count; k++) if (p.getY(k) < floor) p.setY(k, floor);
      g.translate((i - puffs / 2) * rad * 0.95 + (r() - 0.5) * 10, (i % 2) * 7 + r() * 4, (r() - 0.5) * 22);
      parts.push(g);
    }
    const g = mergeGeometries(parts)!;
    g.computeVertexNormals();
    return g;
  }

  apply(p: SkyPalette, sunDir: readonly number[]) {
    const u = this.mat.uniforms;
    u.horizon.value.set(p.horizon);
    u.mid.value.set(p.mid);
    u.zenith.value.set(p.zenith);
    u.sunCol.value.set(p.sun);
    u.sunDir.value.set(sunDir[0], sunDir[1], sunDir[2]).normalize();
    u.glow.value = p.glow;
    this.cloudMat.color.set(p.cloud);
    this.cloudMat.emissive.set(p.cloudE);
  }

  follow(pos: THREE.Vector3) {
    this.dome.position.copy(pos);
  }
}
