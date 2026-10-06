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

interface BMWPaintAtlasAnalysis {
  width: number;
  height: number;
  sourcePixels: Uint8ClampedArray;
  /** 0 = keep original, 1 = blue paint, 2 = white paint, 3 = protected glass/lamp. */
  classes: Uint8Array;
  metalnessMap: THREE.Texture;
}

interface BMWSelectivePaintMaps {
  colorMap: THREE.Texture;
  metalnessMap: THREE.Texture;
}

const bmwPaintAtlasCache = new WeakMap<THREE.Texture, BMWPaintAtlasAnalysis>();

// UV landmarks for the current 1024² BMW atlas. These keep the windshield, side glass,
// and complete tail-lamp housing (including reflections/lens highlights) out of the paint mask.
// Update these with bmw_texture.jpg if the source atlas is replaced.
const BMW_PROTECTED_ATLAS_POLYGONS: readonly (readonly (readonly [number, number])[])[] = [
  [
    [213, 181], [222, 169], [245, 163], [273, 168], [296, 184], [309, 204],
    [307, 226], [294, 245], [271, 257], [245, 256], [225, 244], [214, 223],
  ],
  [
    [513, 181], [522, 168], [545, 161], [573, 165], [596, 181], [609, 201],
    [608, 224], [596, 243], [574, 256], [549, 255], [528, 242], [516, 222],
  ],
  [
    [226, 359], [242, 348], [273, 344], [458, 346], [486, 356], [498, 375],
    [497, 409], [481, 427], [253, 431], [231, 418], [224, 397],
  ],
  // Rear lamp island: leave both its red lens and pale reverse-light section untouched.
  [
    [645, 382], [657, 374], [678, 379], [696, 394], [704, 417],
    [699, 441], [684, 458], [662, 453], [648, 435], [641, 411],
  ],
];

// The atlas repeats wheel/rim islands. Leave their factory silver/black details intact.
const BMW_RIM_ATLAS_ELLIPSES: readonly (readonly [number, number, number, number])[] = [
  [60, 170, 44, 44], [165, 170, 44, 44], [322, 147, 44, 44],
  [661, 151, 44, 44], [868, 151, 44, 44], [865, 459, 44, 44],
  [865, 638, 44, 44], [866, 959, 44, 44],
];

function pointInPolygon(x: number, y: number, polygon: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function markAtlasPolygon(mask: Uint8Array, width: number, height: number, polygon: readonly (readonly [number, number])[]) {
  const sx = width / 1024;
  const sy = height / 1024;
  const scaled = polygon.map(([x, y]) => [x * sx, y * sy] as const);
  const minX = Math.max(0, Math.floor(Math.min(...scaled.map(([x]) => x))));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(...scaled.map(([x]) => x))));
  const minY = Math.max(0, Math.floor(Math.min(...scaled.map(([, y]) => y))));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...scaled.map(([, y]) => y))));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, scaled)) mask[y * width + x] = 1;
    }
  }
}

function makeBMWCanvasTexture(source: THREE.Texture, canvas: HTMLCanvasElement, colorSpace: string): THREE.Texture {
  // Texture.clone() shares its Source with the original GLB map, so use a fresh CanvasTexture
  // and copy sampling/UV settings to avoid replacing the native atlas for the player car.
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = source.name;
  texture.mapping = source.mapping;
  texture.channel = source.channel;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.magFilter = source.magFilter;
  texture.minFilter = source.minFilter;
  texture.anisotropy = source.anisotropy;
  texture.format = source.format;
  texture.internalFormat = source.internalFormat;
  texture.type = source.type;
  texture.normalized = source.normalized;
  texture.offset.copy(source.offset);
  texture.repeat.copy(source.repeat);
  texture.center.copy(source.center);
  texture.rotation = source.rotation;
  texture.matrixAutoUpdate = source.matrixAutoUpdate;
  texture.matrix.copy(source.matrix);
  texture.generateMipmaps = source.generateMipmaps;
  texture.premultiplyAlpha = source.premultiplyAlpha;
  texture.flipY = source.flipY;
  texture.unpackAlignment = source.unpackAlignment;
  texture.colorSpace = colorSpace;
  texture.userData = { ...source.userData };
  texture.needsUpdate = true;
  return texture;
}

function makeBMWPaintAtlasAnalysis(source: THREE.Texture): BMWPaintAtlasAnalysis | null {
  const cached = bmwPaintAtlasCache.get(source);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;

  const image = source.image as CanvasImageSource & {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  const width = Math.floor(image?.naturalWidth ?? image?.width ?? 0);
  const height = Math.floor(image?.naturalHeight ?? image?.height ?? 0);
  if (!width || !height) return null;

  try {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) return null;
    sourceContext.drawImage(image, 0, 0, width, height);
    const sourceImage = sourceContext.getImageData(0, 0, width, height);
    const classes = new Uint8Array(width * height);
    const protectedFeatureMask = new Uint8Array(width * height);
    const rimMask = new Uint8Array(width * height);

    for (const polygon of BMW_PROTECTED_ATLAS_POLYGONS) markAtlasPolygon(protectedFeatureMask, width, height, polygon);
    const sx = width / 1024;
    const sy = height / 1024;
    for (const [cx0, cy0, rx0, ry0] of BMW_RIM_ATLAS_ELLIPSES) {
      const cx = cx0 * sx;
      const cy = cy0 * sy;
      const rx = rx0 * sx;
      const ry = ry0 * sy;
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(height - 1, Math.ceil(cy + ry)); y++) {
        for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(width - 1, Math.ceil(cx + rx)); x++) {
          if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) rimMask[y * width + x] = 1;
        }
      }
    }

    const pixels = sourceImage.data;
    for (let i = 0, pixel = 0; i < width * height; i++, pixel += 4) {
      if (protectedFeatureMask[i]) {
        classes[i] = 3;
        continue;
      }
      if (rimMask[i] || pixels[pixel + 3] < 16) continue;
      const r = pixels[pixel];
      const g = pixels[pixel + 1];
      const b = pixels[pixel + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max > 0 ? (max - min) / max : 0;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const redLampOrAccent = saturation > 0.27 && r > g * 1.22 && r > b * 1.24 && r > 44;
      if (redLampOrAccent) continue;

      const bluePaint = saturation > 0.18 && b > r * 1.25 && b > g * 1.05 && b > 36 && luminance > 22;
      const whitePaint = saturation < 0.2 && min > 125 && luminance > 175;
      if (bluePaint) classes[i] = 1;
      else if (whitePaint) classes[i] = 2;
    }

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskContext = maskCanvas.getContext('2d');
    if (!maskContext) return null;
    const maskImage = maskContext.createImageData(width, height);
    for (let i = 0, pixel = 0; i < classes.length; i++, pixel += 4) {
      const metalness = classes[i] === 1 || classes[i] === 2 ? 255 : classes[i] === 3 ? 0 : 64;
      maskImage.data[pixel] = metalness;
      maskImage.data[pixel + 1] = metalness;
      maskImage.data[pixel + 2] = metalness;
      maskImage.data[pixel + 3] = 255;
    }
    maskContext.putImageData(maskImage, 0, 0);

    const metalnessMap = makeBMWCanvasTexture(source, maskCanvas, THREE.NoColorSpace);
    metalnessMap.name = 'BMW selective chrome paint metalness mask';

    const analysis = { width, height, sourcePixels: pixels, classes, metalnessMap };
    bmwPaintAtlasCache.set(source, analysis);
    return analysis;
  } catch (error) {
    console.warn('Could not read the BMW texture atlas for selective paint; keeping its original colors.', error);
    return null;
  }
}

function createBMWSelectivePaintMaps(source: THREE.Texture, color: string | number): BMWSelectivePaintMaps | null {
  const analysis = makeBMWPaintAtlasAnalysis(source);
  if (!analysis || typeof document === 'undefined') return null;
  const { width, height, sourcePixels, classes, metalnessMap } = analysis;
  const colorHex = new THREE.Color(color).getHex();
  const tint = [(colorHex >> 16) & 255, (colorHex >> 8) & 255, colorHex & 255];
  const pixels = new Uint8ClampedArray(sourcePixels);

  for (let i = 0, pixel = 0; i < classes.length; i++, pixel += 4) {
    const paintClass = classes[i];
    if (paintClass !== 1 && paintClass !== 2) continue;
    const sourceLuminance = (0.2126 * pixels[pixel] + 0.7152 * pixels[pixel + 1] + 0.0722 * pixels[pixel + 2]) / 255;
    // Normalize the original blue and white livery separately, keeping its highlights and panel shading.
    const shade = paintClass === 1
      ? THREE.MathUtils.clamp(0.68 + (sourceLuminance / 0.3) * 0.3, 0.58, 1.03)
      : THREE.MathUtils.clamp(0.84 + sourceLuminance * 0.16, 0.86, 1.0);
    pixels[pixel] = tint[0] * shade;
    pixels[pixel + 1] = tint[1] * shade;
    pixels[pixel + 2] = tint[2] * shade;
  }

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const colorContext = colorCanvas.getContext('2d');
  if (!colorContext) return null;
  const colorImage = colorContext.createImageData(width, height);
  colorImage.data.set(pixels);
  colorContext.putImageData(colorImage, 0, 0);

  const colorMap = makeBMWCanvasTexture(source, colorCanvas, source.colorSpace);
  colorMap.name = `BMW selective metallic paint #${colorHex.toString(16).padStart(6, '0')}`;
  // disposeSubtree releases this shared mask at scene teardown; a following race can upload it again.
  metalnessMap.needsUpdate = true;
  return { colorMap, metalnessMap };
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
  envMapIntensity?: number;
  /** Recolor only the BMW atlas's blue/white body panels; preserve glass and lamp pixels. */
  selectivePaint?: boolean;
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
    envMapIntensity = 1.0,
    selectivePaint = false,
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
    envMapIntensity,
    side: THREE.DoubleSide,
    transparent: transparent || opacity < 1.0,
    opacity,
  });

  let currentPaintColor: string | number = color ?? 0xffffff;
  let activePaintMap: THREE.Texture | null = null;
  if (selectivePaint) mat.color.set(0xffffff);
  else if (color !== undefined) mat.color.set(color);

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

  const setSelectivePaint = (sourceTexture: THREE.Texture, paintColor: string | number): boolean => {
    const maps = createBMWSelectivePaintMaps(sourceTexture, paintColor);
    if (!maps) return false;
    if (activePaintMap && activePaintMap !== maps.colorMap) activePaintMap.dispose();
    activePaintMap = maps.colorMap;
    mat.map = maps.colorMap;
    mat.metalnessMap = maps.metalnessMap;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
    return true;
  };

  const applyCached = (data: BMWGeometryData) => {
    mesh.geometry = data.geometry;
    if (!data.texture) return;
    if (selectivePaint) {
      if (!setSelectivePaint(data.texture, currentPaintColor)) {
        if (activePaintMap) activePaintMap.dispose();
        activePaintMap = null;
        mat.map = data.texture;
        mat.metalnessMap = null;
        mat.color.set(0xffffff); // safer native-color fallback; never tint the glass or tail lamps
        mat.needsUpdate = true;
      }
    } else if (!mat.map) {
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
    if (!selectivePaint) {
      mat.color.set(c);
      return;
    }
    currentPaintColor = c;
    if (cachedData?.texture) setSelectivePaint(cachedData.texture, currentPaintColor);
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
