import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Native dimensions of the mirrored and centered BMW model from bmw.glb
export const BMW_NATIVE_WIDTH = 0.6331189;
export const BMW_NATIVE_HEIGHT = 0.6239894;
export const BMW_NATIVE_LENGTH = 0.9370293;

export interface BMWGeometryData {
  geometry: THREE.BufferGeometry;
  baseMaterial: THREE.MeshStandardMaterial;
  texture: THREE.Texture | null;
}

let cachedData: BMWGeometryData | null = null;
let loadPromise: Promise<BMWGeometryData> | null = null;

/**
 * Loads bmw.glb, extracts the textured mesh (Mesh 7 / Node 10),
 * mirrors the left half to create a complete symmetrical body,
 * centers it so X=0, Z=0 is center and Y=0 is ground level.
 */
export function getBMWGeometryData(): Promise<BMWGeometryData> {
  if (cachedData) {
    return Promise.resolve(cachedData);
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      '/bmw.glb',
      (gltf) => {
        try {
          // Find the textured mesh (node 10 / tripo_node_...017 or with baseColorTexture)
          let targetMesh: THREE.Mesh | null = null;
          gltf.scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              const m = obj as THREE.Mesh;
              if (m.name.includes('017') || (m.material as THREE.MeshStandardMaterial)?.map) {
                targetMesh = m;
              }
            }
          });

          // Fallback to first mesh if not matched
          if (!targetMesh) {
            gltf.scene.traverse((obj) => {
              if (!targetMesh && (obj as THREE.Mesh).isMesh) {
                targetMesh = obj as THREE.Mesh;
              }
            });
          }

          if (!targetMesh) {
            throw new Error('No mesh found in bmw.glb');
          }

          const meshFound = targetMesh as THREE.Mesh;
          const originalGeo = meshFound.geometry;
          const leftGeo = originalGeo.clone();
          const rightGeo = originalGeo.clone();

          // Mirror right half across X=0 and reverse winding order
          const pos = rightGeo.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            pos.setX(i, -pos.getX(i));
          }
          const norm = rightGeo.attributes.normal;
          if (norm) {
            for (let i = 0; i < norm.count; i++) {
              norm.setX(i, -norm.getX(i));
            }
          }
          const index = rightGeo.index;
          if (index) {
            for (let i = 0; i < index.count; i += 3) {
              const a = index.getX(i + 1);
              const b = index.getX(i + 2);
              index.setX(i + 1, b);
              index.setX(i + 2, a);
            }
          }

          // Merge left and right halves into one complete symmetrical body
          const mergedGeo = BufferGeometryUtils.mergeGeometries([leftGeo, rightGeo], false);
          mergedGeo.computeBoundingBox();

          // Center on X and Z, set bottom Y to 0
          const minBox = mergedGeo.boundingBox!.min;
          const maxBox = mergedGeo.boundingBox!.max;
          const centerZ = (minBox.z + maxBox.z) / 2;
          const minY = minBox.y;
          mergedGeo.translate(0, -minY, -centerZ);
          mergedGeo.computeBoundingBox();
          mergedGeo.computeVertexNormals();

          // Base material from model
          const origMat = targetMesh.material as THREE.MeshStandardMaterial;
          const texture = origMat.map ?? null;
          if (texture) {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
          }

          const baseMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.25,
            metalness: 0.15,
            side: THREE.DoubleSide,
          });

          cachedData = {
            geometry: mergedGeo,
            baseMaterial,
            texture,
          };

          resolve(cachedData);
        } catch (err) {
          console.error('Failed to process bmw.glb:', err);
          reject(err);
        }
      },
      undefined,
      (err) => {
        console.error('Error loading /bmw.glb:', err);
        reject(err);
      }
    );
  });

  return loadPromise;
}

export interface BMWAdjustment {
  width: number;
  length: number;
  height: number;
  offsetY: number;
}

export type BMWModeKey = 'pro_drift' | 'sakura_rc' | 'ebisu';

// Base chassis scales used for reference and slider ranges
export const BASE_CHASSIS_SCALE: Record<BMWModeKey, BMWAdjustment> = {
  pro_drift: {
    width: 1.26,
    length: 2.56,
    height: 0.80,
    offsetY: 0.12,
  },
  sakura_rc: {
    width: 1.88,
    length: 3.74,
    height: 0.88,
    offsetY: 0.22,
  },
  ebisu: {
    width: 1.95,
    length: 4.20,
    height: 1.08,
    offsetY: 0.35,
  },
};

// Target tuned BMW dimensions (from user specifications: Image 1 for sakura_rc, Image 2 for ebisu)
export const DEFAULT_BMW_ADJUSTMENTS: Record<BMWModeKey, BMWAdjustment> = {
  pro_drift: {
    width: 1.26,
    length: 2.56,
    height: 0.80,
    offsetY: 0.12,
  },
  sakura_rc: {
    width: 2.09,
    length: 4.11,
    height: 1.63,
    offsetY: 0.09,
  },
  ebisu: {
    // Ebisu Drift Mode tune (user spec): L 4.24 m / W 2.90 m / H 2.16 m / ride offset +0.22 m
    width: 2.9,
    length: 4.24,
    height: 2.16,
    offsetY: 0.22,
  },
};

const listeners: Record<BMWModeKey, Set<(adj: BMWAdjustment) => void>> = {
  pro_drift: new Set(),
  sakura_rc: new Set(),
  ebisu: new Set(),
};

const SYNC_VERSION_KEY = 'bmw_synced_user_data_v9'; // v9: Ebisu tune 4.24 × 2.90 × 2.16, +0.22

export function loadBMWAdjustment(mode: BMWModeKey): BMWAdjustment {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const isSynced = localStorage.getItem(SYNC_VERSION_KEY);
      if (!isSynced) {
        localStorage.setItem(`bmw_adjust_sakura_rc`, JSON.stringify(DEFAULT_BMW_ADJUSTMENTS.sakura_rc));
        localStorage.setItem(`bmw_adjust_ebisu`, JSON.stringify(DEFAULT_BMW_ADJUSTMENTS.ebisu));
        localStorage.setItem(`bmw_adjust_pro_drift`, JSON.stringify(DEFAULT_BMW_ADJUSTMENTS.pro_drift));
        localStorage.setItem(SYNC_VERSION_KEY, 'true');
        return { ...DEFAULT_BMW_ADJUSTMENTS[mode] };
      }

      const raw = localStorage.getItem(`bmw_adjust_${mode}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          width: typeof parsed.width === 'number' ? parsed.width : DEFAULT_BMW_ADJUSTMENTS[mode].width,
          length: typeof parsed.length === 'number' ? parsed.length : DEFAULT_BMW_ADJUSTMENTS[mode].length,
          height: typeof parsed.height === 'number' ? parsed.height : DEFAULT_BMW_ADJUSTMENTS[mode].height,
          offsetY: typeof parsed.offsetY === 'number' ? parsed.offsetY : DEFAULT_BMW_ADJUSTMENTS[mode].offsetY,
        };
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_BMW_ADJUSTMENTS[mode] };
}

export function saveBMWAdjustment(mode: BMWModeKey, adj: BMWAdjustment): void {
  try {
    localStorage.setItem(`bmw_adjust_${mode}`, JSON.stringify(adj));
  } catch {
    // ignore
  }
  listeners[mode].forEach((cb) => cb(adj));
}

export function subscribeBMWAdjustment(mode: BMWModeKey, cb: (adj: BMWAdjustment) => void): () => void {
  listeners[mode].add(cb);
  return () => {
    listeners[mode].delete(cb);
  };
}

export interface CreateBMWOptions {
  width: number;
  length: number;
  height: number;
  rotY?: number;
  offsetY?: number;
  offsetZ?: number;
  color?: string | number;
  opacity?: number;
  transparent?: boolean;
  roughness?: number;
  metalness?: number;
  mode?: BMWModeKey;
}

export interface BMWCarMeshResult {
  group: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  updateColor: (c: string | number) => void;
  updateDimensions: (adj: BMWAdjustment) => void;
  dispose: () => void;
}

/**
 * Creates a THREE.Group containing the BMW body scaled to the exact requested dimensions.
 * Works synchronously by returning a Group with a placeholder mesh, which is replaced/updated
 * immediately when the GLB finishes loading.
 */
export function createBMWCarMesh(options: CreateBMWOptions): BMWCarMeshResult {
  const modeAdj = options.mode ? loadBMWAdjustment(options.mode) : null;
  const initialWidth = modeAdj ? modeAdj.width : options.width;
  const initialLength = modeAdj ? modeAdj.length : options.length;
  const initialHeight = modeAdj ? modeAdj.height : options.height;
  const initialOffsetY = modeAdj ? modeAdj.offsetY : (options.offsetY ?? 0);

  const {
    rotY = 0,
    offsetZ = 0,
    color,
    opacity = 1.0,
    transparent = false,
    roughness = 0.25,
    metalness = 0.2,
  } = options;

  const group = new THREE.Group();
  group.name = 'BMW_Car_Rig';

  // Compute exact scale factors
  const scaleX = initialWidth / BMW_NATIVE_WIDTH;
  const scaleY = initialHeight / BMW_NATIVE_HEIGHT;
  const scaleZ = initialLength / BMW_NATIVE_LENGTH;

  // Material instance
  const mat = new THREE.MeshStandardMaterial({
    roughness,
    metalness,
    side: THREE.DoubleSide,
    transparent: transparent || opacity < 1.0,
    opacity,
  });

  if (color !== undefined) {
    mat.color = new THREE.Color(color);
  }

  // Temporary placeholder geometry
  const initialGeo = cachedData?.geometry ?? new THREE.BoxGeometry(BMW_NATIVE_WIDTH, BMW_NATIVE_HEIGHT, BMW_NATIVE_LENGTH);
  const mesh = new THREE.Mesh(initialGeo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'BMW_Body_Mesh';

  mesh.scale.set(scaleX, scaleY, scaleZ);
  mesh.rotation.y = rotY;
  mesh.position.set(0, initialOffsetY, offsetZ);

  group.add(mesh);

  const applyCached = (data: BMWGeometryData) => {
    mesh.geometry = data.geometry;
    if (data.texture && !mat.map) {
      mat.map = data.texture;
      mat.needsUpdate = true;
    }
  };

  if (cachedData) {
    applyCached(cachedData);
  } else {
    getBMWGeometryData()
      .then((data) => {
        applyCached(data);
      })
      .catch((err) => {
        console.warn('Fallback: using box geometry for BMW body due to:', err);
      });
  }

  const updateColor = (c: string | number) => {
    mat.color.set(c);
  };

  const updateDimensions = (adj: BMWAdjustment) => {
    mesh.scale.set(
      adj.width / BMW_NATIVE_WIDTH,
      adj.height / BMW_NATIVE_HEIGHT,
      adj.length / BMW_NATIVE_LENGTH
    );
    mesh.position.y = adj.offsetY;
  };

  let unsubscribe: (() => void) | null = null;
  if (options.mode) {
    unsubscribe = subscribeBMWAdjustment(options.mode, (newAdj) => {
      updateDimensions(newAdj);
    });
  }

  const dispose = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  return { group, mesh, material: mat, updateColor, updateDimensions, dispose };
}
