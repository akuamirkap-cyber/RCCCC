import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  CameraMode,
  CarCustomization,
  CircuitDef,
  GameMode,
  LiveTelemetry,
  SessionResult,
  TuningSetup,
} from '../types/rcDrift';
import { rcSound } from '../utils/soundEngine';
import {
  buildAulaHall,
  buildHangingStartBanners,
  buildProceduralHDREnv,
  buildSakuraGardenAuto,
  computeHallFrame,
} from '../utils/aulaHall';
import { DIORAMA_CAR, buildMenuDiorama } from '../utils/menuDiorama';
import {
  buildTrack as buildHarunaTrack,
  projectGlobal as projectHarunaGlobal,
} from '../../haruna_new/game/track';
import { buildWorld as buildHarunaWorld } from '../../haruna_new/game/world';
import { START_ALT as HARUNA_START_ALT } from '../../haruna_new/track/haruna';
import { Sky as HarunaSky } from '../../haruna_new/game/sky';
import { createBMWCarMesh } from '@/utils/bmwCar';
import { ENEMY_BOTS_DATA } from '../data/circuitsAndCars';

interface RCDriftCanvas3DProps {
  circuit: CircuitDef;
  tuning: TuningSetup;
  customization: CarCustomization;
  gameMode: GameMode;
  cameraMode: CameraMode;
  resetTrigger: number;
  isMenu: boolean; // true = phase menu: tampilkan diorama sakura, kamera sinematik
  externalSteer: number; // -1 to 1 from on-screen transmitter wheel
  externalThrottle: boolean;
  externalBrake: boolean;
  externalTurbo: boolean;
  onTelemetryUpdate: (telemetry: LiveTelemetry) => void;
  onSessionFinish: (result: SessionResult) => void;
}

import {
  DEFAULT_SMOKE_CONFIG,
  DEFAULT_SUSPENSION_SETUP,
} from '../data/circuitsAndCars';

interface RCCarRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  bodyShellGroup: THREE.Group;
  bodyPaintMaterials: THREE.MeshStandardMaterial[];
  anodizedMaterials: THREE.MeshStandardMaterial[];
  neonMaterial: THREE.MeshBasicMaterial;
  neonLight: THREE.PointLight;
  flKnuckle: THREE.Group;
  frKnuckle: THREE.Group;
  // spinAxles rotate ONLY around local X axis (100% wobble-free!)
  spinAxles: THREE.Group[];
  // 4-Corner Camber Hubs [FL, FR, RL, RR] for live negative camber & dynamic camber gain
  camberHubs: THREE.Group[];
  // 4-Corner Animated Coilover Spring Stacks [FL, FR, RL, RR]
  coilSprings: THREE.Group[];
  // 4-Corner Lower Suspension A-Arms [FL, FR, RL, RR]
  lowerArms: THREE.Mesh[];
  // IFS Pushrod Rocker Cantilevers [Left, Right] on front bulkhead
  ifsRockers: THREE.Mesh[];
  coolingFan: THREE.Mesh;
  servoHorn: THREE.Mesh;
  turboSparkMesh: THREE.Mesh;
}

interface WheelAnchor {
  pos: THREE.Vector3;     // Live world position of rear wheel axle
  forward: THREE.Vector3; // Live car forward unit vector
  right: THREE.Vector3;   // Live car right unit vector
}

interface RingSmokeSlot {
  active: boolean;
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  baseSize: number;
  peakAlpha: number;
  spin: number;
  colorFrom: THREE.Color;
  colorTo: THREE.Color;
  // Jalur B: Wheel-spin swirl orbit state
  isSwirling: boolean;
  anchor: WheelAnchor | null;
  swirlAngle: number;
  swirlRadius: number;
  omega: number;
  orbitTimeLeft: number;
  isLegacy: boolean;
}

export const RCDriftCanvas3D: React.FC<RCDriftCanvas3DProps> = ({
  circuit,
  tuning,
  customization,
  gameMode,
  cameraMode,
  resetTrigger,
  isMenu,
  externalSteer,
  externalThrottle,
  externalBrake,
  externalTurbo,
  onTelemetryUpdate,
  onSessionFinish,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const tuningRef = useRef<TuningSetup>(tuning);
  tuningRef.current = tuning;

  const customRef = useRef<CarCustomization>(customization);
  customRef.current = customization;

  const gameModeRef = useRef<GameMode>(gameMode);
  gameModeRef.current = gameMode;

  const cameraModeRef = useRef<CameraMode>(cameraMode);
  cameraModeRef.current = cameraMode;

  const extInputRef = useRef({
    steer: externalSteer,
    throttle: externalThrottle,
    brake: externalBrake,
    turbo: externalTurbo,
  });
  extInputRef.current = {
    steer: externalSteer,
    throttle: externalThrottle,
    brake: externalBrake,
    turbo: externalTurbo,
  };

  const telemetryCbRef = useRef(onTelemetryUpdate);
  telemetryCbRef.current = onTelemetryUpdate;

  const finishCbRef = useRef(onSessionFinish);
  finishCbRef.current = onSessionFinish;

  const playerRigRef = useRef<RCCarRig | null>(null);
  const dioramaCarRigRef = useRef<RCCarRig | null>(null);

  useEffect(() => {
    if (tuning.soundMode) {
      rcSound.setSoundMode(tuning.soundMode);
    }
  }, [tuning.soundMode]);

  // Dynamically update car paint, anodize, and shell mode without rebuilding scene
  useEffect(() => {
    const rig = playerRigRef.current;
    if (!rig) return;

    const { bodyShellMode, bodyColor, chassisAnodizeColor, neonColor } = customization;

    rig.bodyShellGroup.visible = bodyShellMode !== 'naked_chassis';
    rig.bodyPaintMaterials.forEach((mat) => {
      mat.color.set(bodyColor);
      if (bodyShellMode === 'translucent') {
        mat.transparent = true;
        mat.opacity = 0.36;
        mat.roughness = 0.12;
      } else {
        mat.transparent = false;
        mat.opacity = 1.0;
        mat.roughness = 0.22;
      }
      mat.metalness = 0.35;
      mat.envMapIntensity = 0.85;
      mat.needsUpdate = true;
    });

    rig.anodizedMaterials.forEach((mat) => {
      mat.color.set(chassisAnodizeColor);
    });

    rig.neonMaterial.color.set(neonColor);
    rig.neonLight.color.set(neonColor);

    // Ganti warna di menu langsung terlihat di mobil poster diorama
    const poster = dioramaCarRigRef.current;
    if (poster) {
      poster.bodyPaintMaterials.forEach((mat) => {
        mat.color.set(bodyColor);
      });
      poster.anodizedMaterials.forEach((mat) => {
        mat.color.set(chassisAnodizeColor);
      });
      poster.neonMaterial.color.set(neonColor);
      poster.neonLight.color.set(neonColor);
    }
  }, [customization]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // --- 1. SCENE, CAMERA, RENDERER ---
    const MENU_MODE = isMenu;
    const isHarunaMap = circuit.mapStyle === 'haruna';
    // Jangan bangun terrain besar saat menu; map akan dibangun ulang ketika START ditekan.
    const useHarunaWorld = isHarunaMap && !MENU_MODE;
    const harunaRuntimeTrack = isHarunaMap ? buildHarunaTrack() : null;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(
      MENU_MODE ? '#2a1440' : useHarunaWorld ? '#e6eeeb' : '#141A26'
    );
    // Haruna memakai kabut horizon lembut ala Art of Rally; aula tetap memakai fog volumetrik.
    scene.fog = MENU_MODE
      ? new THREE.FogExp2('#2a1440', 0.00008)
      : useHarunaWorld
      ? new THREE.Fog('#e6eeeb', 115, 760)
      : new THREE.FogExp2('#141A26', 0.0016);

    const camera = new THREE.PerspectiveCamera(
      MENU_MODE ? 48 : 46,
      container.clientWidth / container.clientHeight,
      0.1,
      MENU_MODE ? 1200 : useHarunaWorld ? 1400 : 350
    );
    if (MENU_MODE) {
      // Frame pertama langsung benar: kamera mulai di dekat diorama
      const a0 = 1.0;
      camera.position.set(
        DIORAMA_CAR.x + Math.sin(a0) * 10.8,
        2,
        DIORAMA_CAR.z + Math.cos(a0) * 10.8
      );
      camera.lookAt(DIORAMA_CAR.x, 1.15, DIORAMA_CAR.z);
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 0.95;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // --- 2. HDR PROSEDURAL (equirect float 1024x512) + KEY LIGHT FOLLOW-PLAYER ---
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const hdriRenderTarget = useHarunaWorld ? null : buildProceduralHDREnv(pmremGenerator);
    if (hdriRenderTarget) {
      scene.environment = hdriRenderTarget.texture;
      scene.environmentIntensity = 0.6;
    }

    // Haruna: daylight dingin + matahari rendah hangat, meniru pencahayaan Mt. Akina.
    const ambientLight = new THREE.AmbientLight(
      useHarunaWorld ? '#F1EEE8' : '#E8E2D8',
      useHarunaWorld ? 0.78 : 0.5
    );
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(
      useHarunaWorld ? '#D6E8F5' : '#FFF4E6',
      useHarunaWorld ? '#9C9970' : '#1E293B',
      useHarunaWorld ? 1.05 : 0.4
    );
    scene.add(hemiLight);

    // Key light: frustum ketat + mengikuti mobil pemain (bayangan tajam)
    const mainDirLight = new THREE.DirectionalLight(
      useHarunaWorld ? '#FFF4DE' : '#FFF1DE',
      useHarunaWorld ? 2.25 : 1.6
    );
    mainDirLight.position.set(
      useHarunaWorld ? -92 : 22,
      useHarunaWorld ? 176 : 48,
      useHarunaWorld ? 84 : 28
    );
    mainDirLight.castShadow = true;
    mainDirLight.shadow.mapSize.width = 2048;
    mainDirLight.shadow.mapSize.height = 2048;
    mainDirLight.shadow.camera.near = 5;
    mainDirLight.shadow.camera.far = useHarunaWorld ? 300 : 140;
    const d = 30;
    mainDirLight.shadow.camera.left = -d;
    mainDirLight.shadow.camera.right = d;
    mainDirLight.shadow.camera.top = d;
    mainDirLight.shadow.camera.bottom = -d;
    mainDirLight.shadow.bias = -0.0004;
    scene.add(mainDirLight);
    scene.add(mainDirLight.target);

    const fillDirLight = new THREE.DirectionalLight(
      useHarunaWorld ? '#BDD7F0' : '#D8C8E8',
      useHarunaWorld ? 0.36 : 0.35
    );
    fillDirLight.position.set(-35, 32, -25);
    scene.add(fillDirLight);

    // Sakura-sunset accent hanya untuk arena indoor; Haruna mempertahankan palet daylight.
    const sakuraWash = new THREE.DirectionalLight(
      '#F9A8D4',
      useHarunaWorld ? 0.04 : 0.3
    );
    sakuraWash.position.set(-20, 18, 45);
    scene.add(sakuraWash);

    // --- 3. MAP ENVIRONMENT ---
    const harunaBounds = harunaRuntimeTrack?.bounds;
    const hallFrame = useHarunaWorld && harunaBounds
      ? {
          width: harunaBounds.maxX - harunaBounds.minX,
          depth: harunaBounds.maxZ - harunaBounds.minZ,
          height: 26,
          cx: (harunaBounds.minX + harunaBounds.maxX) / 2,
          cz: (harunaBounds.minZ + harunaBounds.maxZ) / 2,
        }
      : computeHallFrame(circuit.controlPoints);
    const aulaBuilt = useHarunaWorld
      ? {
          aulaGroup: new THREE.Group(),
          rostrumRect: { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
          tribunRect: { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
          pitRect: { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
          judgeTowerPos: new THREE.Vector3(),
        }
      : buildAulaHall(scene, circuit.accentColor, hallFrame);
    const aulaGroup = aulaBuilt.aulaGroup;

    // Haruna road, gutters, guardrails, terrain, lake and trees — world asli tetap dipakai,
    // hanya mobil + fisika Sakura RC Pro yang diganti di atasnya.
    let harunaSky: HarunaSky | null = null;
    if (useHarunaWorld && harunaRuntimeTrack) {
      const harunaWorld = buildHarunaWorld(
        harunaRuntimeTrack,
        undefined,
        circuit.trackWidth * 0.5,
        false
      );
      harunaWorld.group.position.y = -HARUNA_START_ALT;
      scene.add(harunaWorld.group);

      harunaSky = new HarunaSky(harunaWorld.bounds);
      harunaSky.apply(
        {
          horizon: '#E6EEEB',
          mid: '#BDDCEC',
          zenith: '#7DB6DF',
          sun: '#FFF4DE',
          glow: 0.9,
          cloud: '#FFFFFF',
          cloudE: '#6A7D8E',
        },
        [-0.42, 0.8, 0.38]
      );
      scene.add(harunaSky.dome, harunaSky.clouds);
    }

    // --- KODE AULA LAMA DINONAKTIFKAN (diganti builder di atas) ---
    if (false) {
    // --- 3. INDOOR AULA FLOOR & FULL 3D HALL ARCHITECTURE (LAMA) ---
    const createAulaFloorTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d')!;

      if (circuit.hallTheme === 'parquet_aula') {
        ctx.fillStyle = '#7C5333';
        ctx.fillRect(0, 0, 1024, 1024);

        const plankW = 128;
        const plankH = 32;
        const woodTones = ['#8A5D3B', '#784E2F', '#946642', '#6E4629', '#835736'];

        for (let y = 0; y < 1024; y += plankH) {
          const rowOffset = ((y / plankH) % 2) * (plankW / 2);
          for (let x = -plankW; x < 1024; x += plankW) {
            const toneIdx = Math.abs(Math.floor((x * 7 + y * 13) / 32)) % woodTones.length;
            ctx.fillStyle = woodTones[toneIdx];
            ctx.fillRect(x + rowOffset, y, plankW - 2, plankH - 2);

            ctx.fillStyle = 'rgba(255, 235, 205, 0.05)';
            ctx.fillRect(x + rowOffset + 8, y + 6, plankW - 20, 4);
            ctx.strokeStyle = 'rgba(40, 20, 5, 0.28)';
            ctx.strokeRect(x + rowOffset, y, plankW, plankH);
          }
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 6;
        ctx.strokeRect(24, 24, 976, 976);
      } else if (circuit.hallTheme === 'epoxy_hall') {
        ctx.fillStyle = '#253042';
        ctx.fillRect(0, 0, 1024, 1024);

        const tile = 128;
        for (let y = 0; y < 1024; y += tile) {
          for (let x = 0; x < 1024; x += tile) {
            const checker = ((x + y) / tile) % 2 === 0;
            ctx.fillStyle = checker ? '#283447' : '#222C3C';
            ctx.fillRect(x, y, tile - 3, tile - 3);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.fillRect(x + 8, y + 8, tile - 24, 18);
          }
        }
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.16)';
        ctx.lineWidth = 4;
        ctx.strokeRect(8, 8, 1008, 1008);
      } else {
        ctx.fillStyle = '#1E2533';
        ctx.fillRect(0, 0, 1024, 1024);

        const tile = 128;
        for (let y = 0; y < 1024; y += tile) {
          for (let x = 0; x < 1024; x += tile) {
            ctx.fillStyle = ((x + y) / tile) % 2 === 0 ? '#232B3B' : '#1B2230';
            ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
          }
        }
        ctx.strokeStyle = 'rgba(204, 255, 0, 0.15)';
        ctx.lineWidth = 3;
        ctx.strokeRect(4, 4, 1016, 1016);
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(14, 11);
      tex.anisotropy = 8;
      return tex;
    };

    const hallWidth = 148;
    const hallDepth = 114;
    const hallHeight = 24;

    const floorGeo = new THREE.PlaneGeometry(hallWidth, hallDepth);
    const floorMat = new THREE.MeshStandardMaterial({
      map: createAulaFloorTexture(),
      roughness: 0.42,
      metalness: 0.08,
      envMapIntensity: 0.55,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Build Complete 3D Indoor Aula Building
    const aulaGroup = new THREE.Group();
    scene.add(aulaGroup);

    const createWallTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#263144';
      ctx.fillRect(0, 0, 1024, 340);

      ctx.fillStyle = '#4A3525';
      ctx.fillRect(0, 210, 1024, 130);
      ctx.fillStyle = '#694B35';
      for (let x = 0; x < 1024; x += 16) {
        ctx.fillRect(x, 214, 10, 122);
      }

      ctx.fillStyle = '#18202F';
      ctx.fillRect(0, 340, 1024, 172);

      ctx.fillStyle = circuit.accentColor;
      ctx.fillRect(0, 336, 1024, 6);

      for (let x = 40; x < 1024; x += 160) {
        ctx.fillStyle = '#93C5FD';
        ctx.fillRect(x, 36, 110, 115);
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 6;
        ctx.strokeRect(x, 36, 110, 115);
        ctx.fillRect(x + 52, 36, 6, 115);
        ctx.fillRect(x, 90, 110, 6);
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.set(4, 1);
      return tex;
    };

    const wallMat = new THREE.MeshStandardMaterial({
      map: createWallTexture(),
      roughness: 0.5,
      metalness: 0.1,
    });

    const nsWallGeo = new THREE.PlaneGeometry(hallWidth, hallHeight);
    const northWall = new THREE.Mesh(nsWallGeo, wallMat);
    northWall.position.set(0, hallHeight / 2, -hallDepth / 2);
    aulaGroup.add(northWall);

    const southWall = new THREE.Mesh(nsWallGeo, wallMat);
    southWall.position.set(0, hallHeight / 2, hallDepth / 2);
    southWall.rotation.y = Math.PI;
    aulaGroup.add(southWall);

    const ewWallGeo = new THREE.PlaneGeometry(hallDepth, hallHeight);
    const eastWall = new THREE.Mesh(ewWallGeo, wallMat);
    eastWall.position.set(hallWidth / 2, hallHeight / 2, 0);
    eastWall.rotation.y = -Math.PI / 2;
    aulaGroup.add(eastWall);

    const westWall = new THREE.Mesh(ewWallGeo, wallMat);
    westWall.position.set(-hallWidth / 2, hallHeight / 2, 0);
    westWall.rotation.y = Math.PI / 2;
    aulaGroup.add(westWall);

    // Structural Columns & Overhead Steel Roof Trusses
    const colGeo = new THREE.BoxGeometry(1.4, hallHeight, 1.4);
    const colMat = new THREE.MeshStandardMaterial({
      color: '#1E293B',
      roughness: 0.4,
      metalness: 0.6,
    });
    for (let x = -hallWidth / 2 + 12; x <= hallWidth / 2 - 12; x += 24) {
      const colN = new THREE.Mesh(colGeo, colMat);
      colN.position.set(x, hallHeight / 2, -hallDepth / 2 + 0.7);
      const colS = new THREE.Mesh(colGeo, colMat);
      colS.position.set(x, hallHeight / 2, hallDepth / 2 - 0.7);
      aulaGroup.add(colN, colS);
    }

    const trussGeo = new THREE.BoxGeometry(hallWidth, 0.9, 0.9);
    const trussMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      metalness: 0.7,
      roughness: 0.3,
    });
    const lightPanelGeo = new THREE.BoxGeometry(5.5, 0.25, 1.4);
    const lightPanelMat = new THREE.MeshBasicMaterial({ color: '#D8D2C4' });

    for (let z = -40; z <= 40; z += 20) {
      const truss = new THREE.Mesh(trussGeo, trussMat);
      truss.position.set(0, hallHeight - 1.2, z);
      aulaGroup.add(truss);

      for (let x = -45; x <= 45; x += 30) {
        const lamp = new THREE.Mesh(lightPanelGeo, lightPanelMat);
        lamp.position.set(x, hallHeight - 1.6, z);
        aulaGroup.add(lamp);
      }
    }

    const createBannerMesh = (
      title: string,
      subtitle: string,
      bgHex: string,
      accentHex: string,
      w = 24,
      h = 5.2
    ) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = bgHex;
      ctx.fillRect(0, 0, 1024, 256);

      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 12;
      ctx.strokeRect(8, 8, 1008, 240);

      ctx.fillStyle = accentHex;
      ctx.fillRect(24, 24, 18, 208);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'italic 900 68px "Chakra Petch", sans-serif';
      ctx.fillText(title, 68, 118);

      ctx.fillStyle = accentHex;
      ctx.font = '700 36px "JetBrains Mono", monospace';
      ctx.fillText(subtitle, 68, 188);

      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    };

    const bannerNorth1 = createBannerMesh(
      'NISSAN SKYLINE GT-R // BNR34',
      '1:10 RWD RC DRIFT GRAND AULA CHAMPIONSHIP',
      '#0B132B',
      '#00F0FF',
      28,
      5.8
    );
    bannerNorth1.position.set(-22, 10.5, -hallDepth / 2 + 0.2);
    aulaGroup.add(bannerNorth1);

    const bannerNorth2 = createBannerMesh(
      'YOKOMO // RÊVE D // OVERDOSE',
      'TOKYO INDOOR HALL P-TILE & PARQUET ARENA',
      '#1A0B2E',
      '#FF2A85',
      28,
      5.8
    );
    bannerNorth2.position.set(22, 10.5, -hallDepth / 2 + 0.2);
    aulaGroup.add(bannerNorth2);

    // 3D RC Driver Stand Rostrum & Pit Tables
    const rostrumPlatform = new THREE.Mesh(
      new THREE.BoxGeometry(18, 3.6, 4.5),
      new THREE.MeshStandardMaterial({ color: '#1E293B', metalness: 0.5, roughness: 0.4 })
    );
    rostrumPlatform.position.set(0, 1.8, 49);
    const rostrumRail = new THREE.Mesh(
      new THREE.BoxGeometry(18, 1.1, 0.2),
      new THREE.MeshStandardMaterial({
        color: '#00F0FF',
        emissive: '#00F0FF',
        emissiveIntensity: 0.3,
      })
    );
    rostrumRail.position.set(0, 4.1, 46.8);
    aulaGroup.add(rostrumPlatform, rostrumRail);

    // --- 3B. SAKURA GARDEN DIORAMA — Hiasan Pohon Sakura, Pinus, Batu & Rumput ---
    const sakuraSwayGroups: THREE.Group[] = [];
    const trunkMat = new THREE.MeshStandardMaterial({
      color: '#5B3A29',
      roughness: 0.9,
      metalness: 0.0,
    });
    const planterMat = new THREE.MeshStandardMaterial({
      color: '#3A2A1E',
      roughness: 0.8,
      metalness: 0.05,
    });
    const rockMat = new THREE.MeshStandardMaterial({
      color: '#C9D2E0',
      roughness: 0.85,
      metalness: 0.02,
      flatShading: true,
    });
    const grassMat = new THREE.MeshStandardMaterial({
      color: '#3FA34D',
      roughness: 0.9,
      metalness: 0.0,
    });
    const sakuraPalette = ['#F9A8D4', '#F472B6', '#FBCFE8', '#FB7185', '#FDA4AF'];
    const pinePalette = ['#2D6A4F', '#40916C', '#1B4332'];

    const createSakuraTree = (scale: number, seed: number) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26 * scale, 0.44 * scale, 3.4 * scale, 7),
        trunkMat
      );
      trunk.position.y = 1.7 * scale;
      trunk.castShadow = true;
      g.add(trunk);
      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12 * scale, 0.2 * scale, 1.6 * scale, 6),
        trunkMat
      );
      branch.position.set(0.5 * scale, 2.9 * scale, 0.2 * scale);
      branch.rotation.z = -0.6;
      g.add(branch);

      const blobs: [number, number, number, number][] = [
        [0, 4.0, 0, 1.85],
        [1.25, 3.3, 0.4, 1.2],
        [-1.15, 3.4, -0.35, 1.25],
        [0.35, 4.8, -0.55, 1.1],
        [-0.45, 4.7, 0.6, 1.0],
        [0, 3.1, 0.9, 0.85],
      ];
      blobs.forEach(([bx, by, bz, br], bi) => {
        const col =
          sakuraPalette[(seed + bi * 2) % sakuraPalette.length];
        const m = new THREE.Mesh(
          new THREE.IcosahedronGeometry(br * scale, 1),
          new THREE.MeshStandardMaterial({
            color: col,
            roughness: 0.85,
            metalness: 0.0,
            flatShading: true,
          })
        );
        m.position.set(bx * scale, by * scale, bz * scale);
        m.castShadow = true;
        g.add(m);
      });

      const planter = new THREE.Mesh(
        new THREE.BoxGeometry(1.7 * scale, 0.55 * scale, 1.7 * scale),
        planterMat
      );
      planter.position.y = 0.27 * scale;
      planter.castShadow = true;
      planter.receiveShadow = true;
      g.add(planter);
      return g;
    };

    const createPineTree = (scale: number, seed: number) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18 * scale, 0.3 * scale, 1.6 * scale, 7),
        trunkMat
      );
      trunk.position.y = 0.8 * scale;
      trunk.castShadow = true;
      g.add(trunk);
      const layers: [number, number, number][] = [
        [1.5, 1.9, 2.1],
        [1.15, 1.7, 3.1],
        [0.75, 1.5, 4.0],
      ];
      layers.forEach(([r, h, y], li) => {
        const m = new THREE.Mesh(
          new THREE.ConeGeometry(r * scale, h * scale, 8),
          new THREE.MeshStandardMaterial({
            color: pinePalette[(seed + li) % pinePalette.length],
            roughness: 0.9,
            flatShading: true,
          })
        );
        m.position.y = y * scale;
        m.castShadow = true;
        g.add(m);
      });
      return g;
    };

    const createRock = (scale: number) => {
      const m = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.7 * scale, 0),
        rockMat
      );
      m.castShadow = true;
      m.receiveShadow = true;
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      return m;
    };

    const createGrassTuft = (scale: number) => {
      const g = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const blade = new THREE.Mesh(
          new THREE.ConeGeometry(0.09 * scale, (0.7 + Math.random() * 0.7) * scale, 5),
          grassMat
        );
        blade.position.set(
          (Math.random() - 0.5) * 0.9 * scale,
          0.35 * scale,
          (Math.random() - 0.5) * 0.9 * scale
        );
        blade.rotation.z = (Math.random() - 0.5) * 0.35;
        g.add(blade);
      }
      return g;
    };

    // Posisi aman di luar lintasan (track ±51 x, ±36 z) — tidak menutupi racing line
    const sakuraSpots: [number, number, number][] = [
      [-64, -46, 1.5],
      [64, -46, 1.35],
      [-66, -8, 1.1],
      [66, 6, 1.25],
      [-63, 38, 1.2],
      [63, 40, 1.45],
      [-34, -49, 1.0],
      [30, -49, 1.15],
      [-52, 48, 0.95],
      [52, 48, 1.05],
    ];
    sakuraSpots.forEach(([sx, sz, ss], si) => {
      const tree = createSakuraTree(ss, si);
      tree.position.set(sx, 0, sz);
      tree.rotation.y = si * 0.7;
      aulaGroup.add(tree);
      sakuraSwayGroups.push(tree);
    });

    const pineSpots: [number, number, number][] = [
      [-70, 24, 0.9],
      [70, -22, 1.0],
      [-14, -50, 0.8],
      [12, 50, 0.85],
    ];
    pineSpots.forEach(([px, pz, ps], pi) => {
      const pine = createPineTree(ps, pi);
      pine.position.set(px, 0, pz);
      aulaGroup.add(pine);
    });

    const rockSpots: [number, number, number][] = [
      [-58, -40, 1.3],
      [58, -38, 1.0],
      [-60, 30, 1.5],
      [59, 30, 1.2],
      [-40, -46, 0.8],
      [40, -46, 0.9],
      [-20, 47, 0.7],
      [24, 47, 0.8],
    ];
    rockSpots.forEach(([rx, rz, rs]) => {
      const rock = createRock(rs);
      rock.position.set(rx, 0.3 * rs, rz);
      aulaGroup.add(rock);
    });

    // Rumput hias di sekeliling luar track
    for (let i = 0; i < 46; i++) {
      const ang = (i / 46) * Math.PI * 2;
      const gx = Math.cos(ang) * (58 + Math.random() * 8);
      const gz = Math.sin(ang) * (43 + Math.random() * 6);
      if (Math.abs(gx) < 55 && Math.abs(gz) < 39) continue;
      if (Math.abs(gx) > 71 || Math.abs(gz) > 53) continue;
      const tuft = createGrassTuft(0.8 + Math.random() * 0.7);
      tuft.position.set(gx, 0, gz);
      aulaGroup.add(tuft);
    }

    // Kelopak sakura beterbangan — 70 sprite ringan
    const petalGeo = new THREE.PlaneGeometry(0.22, 0.14);
    const petalMatA = new THREE.MeshBasicMaterial({
      color: '#FBCFE8',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const petalMatB = new THREE.MeshBasicMaterial({
      color: '#F9A8D4',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    interface Petal { mesh: THREE.Mesh; vy: number; swayPhase: number; swaySpeed: number; rotSpeed: number; }
    const petals: Petal[] = [];
    for (let i = 0; i < 70; i++) {
      const mesh = new THREE.Mesh(petalGeo, i % 2 === 0 ? petalMatA : petalMatB);
      const spot = sakuraSpots[i % sakuraSpots.length];
      mesh.position.set(
        spot[0] + (Math.random() - 0.5) * 10,
        1 + Math.random() * 6,
        spot[1] + (Math.random() - 0.5) * 8
      );
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      scene.add(mesh);
      petals.push({
        mesh,
        vy: 0.5 + Math.random() * 0.7,
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: 0.8 + Math.random() * 1.2,
        rotSpeed: (Math.random() - 0.5) * 4,
      });
    }

    } // tutup if(false) aula lama

    // --- 4. CIRCUIT SPLINE / HARUNA ROAD CENTERLINE ---
    const splinePoints = harunaRuntimeTrack
      ? Array.from({ length: harunaRuntimeTrack.n }, (_, idx) =>
          new THREE.Vector3(
            harunaRuntimeTrack.x[idx],
            harunaRuntimeTrack.y[idx] - HARUNA_START_ALT,
            harunaRuntimeTrack.z[idx]
          )
        )
      : circuit.controlPoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
    // Haruna memakai centerline downhill autentik (open route); arena memakai loop tertutup.
    const routeClosed = !isHarunaMap;
    const rawCurve = new THREE.CatmullRomCurve3(
      splinePoints,
      routeClosed,
      'centripetal',
      isHarunaMap ? 0.2 : 0.5
    );

    // Terapkan smoothing yang sama seperti Tokyo Grand Aula ke centerline Haruna.
    // Batas endpoint dipertahankan supaya downhill tidak membuat sambungan palsu.
    const densePts: THREE.Vector3[] = isHarunaMap
      ? splinePoints.map((point) => point.clone())
      : [];
    const denseCount = isHarunaMap ? densePts.length : 96;
    if (!isHarunaMap) {
      for (let i = 0; i < denseCount; i++) {
        densePts.push(rawCurve.getPointAt(i / denseCount));
      }
    }
    for (let pass = 0; pass < 2; pass++) {
      const nextPts = densePts.map((_, idx) => {
        const prevIdx = isHarunaMap
          ? Math.max(0, idx - 1)
          : (idx - 1 + denseCount) % denseCount;
        const nextIdx = isHarunaMap
          ? Math.min(denseCount - 1, idx + 1)
          : (idx + 1) % denseCount;
        const pPrev = densePts[prevIdx];
        const pCur = densePts[idx];
        const pNext = densePts[nextIdx];
        if (isHarunaMap && (idx === 0 || idx === denseCount - 1)) {
          return pCur.clone();
        }
        return new THREE.Vector3(
          pPrev.x * 0.22 + pCur.x * 0.56 + pNext.x * 0.22,
          pPrev.y * 0.22 + pCur.y * 0.56 + pNext.y * 0.22,
          pPrev.z * 0.22 + pCur.z * 0.56 + pNext.z * 0.22
        );
      });
      for (let i = 0; i < denseCount; i++) densePts[i].copy(nextPts[i]);
    }

    const trackCurve = new THREE.CatmullRomCurve3(
      densePts,
      routeClosed,
      'centripetal',
      isHarunaMap ? 0.2 : 0.5
    );
    // Haruna is several kilometers long; more samples prevent faceted road edges.
    const trackSamples = isHarunaMap ? 1600 : 640;
    const halfWidth = circuit.trackWidth * 0.5;
    // Lift the Aula overlay above Haruna's original asphalt to prevent z-fighting
    // and make the old surface a true underlay rather than a second drivable layer.
    const trackSurfaceLift = isHarunaMap ? 0.14 : 0;

    // Precompute frames for both closed Aula loops and the open Haruna downhill.
    // Haruna keeps an explicit endpoint so the Aula surface does not connect finish
    // back to start with a phantom strip.
    const smoothTrackFrames: { pt: THREE.Vector3; normal: THREE.Vector3 }[] = [];
    const frameCount = isHarunaMap ? trackSamples + 1 : trackSamples;
    for (let i = 0; i < frameCount; i++) {
      const t = isHarunaMap ? i / trackSamples : i / trackSamples;
      const pt = trackCurve.getPointAt(t);
      // Average tangent across a small window to prevent any normal jitter.
      const edge = isHarunaMap ? 1 / trackSamples : 0.004;
      const tPrev = isHarunaMap
        ? Math.max(0, t - edge)
        : (t - edge + 1) % 1;
      const tNext = isHarunaMap
        ? Math.min(1, t + edge)
        : (t + edge) % 1;
      const tan = trackCurve
        .getPointAt(tNext)
        .sub(trackCurve.getPointAt(tPrev))
        .normalize();
      const normal = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      smoothTrackFrames.push({ pt, normal });
    }

    // High-detail Pro RC P-Tile Track Surface Texture with Chevrons, Racing Shoulders & Rubber Drift Groove
    const createTrackSurfaceTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;

      // Base P-Tile Dark Slate Surface
      ctx.fillStyle = '#111622';
      ctx.fillRect(0, 0, 512, 512);

      // Center darker polished rubber drift groove
      const grad = ctx.createLinearGradient(96, 0, 416, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, 'rgba(4, 6, 12, 0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      // P-Tile Interlocking Tile Grid Seams
      ctx.strokeStyle = '#1E2738';
      ctx.lineWidth = 2.5;
      for (let i = 0; i <= 512; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }

      // Outer Red/White Curb Shoulder Stripes — diredupkan biar tidak silau
      for (let y = 0; y < 512; y += 64) {
        ctx.fillStyle = (y / 64) % 2 === 0 ? '#9F2D3A' : '#B8C2D4';
        ctx.fillRect(0, y, 16, 64);
        ctx.fillRect(496, y, 16, 64);
      }

      // Inner Neon Accent Pin-Stripe
      ctx.fillStyle = circuit.accentColor;
      ctx.fillRect(20, 0, 5, 512);
      ctx.fillRect(487, 0, 5, 512);

      // Subtle Directional Drift Flow Chevron in Center
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.14)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(216, 310);
      ctx.lineTo(256, 250);
      ctx.lineTo(296, 310);
      ctx.stroke();

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 48);
      tex.anisotropy = 8;
      return tex;
    };

    const buildTrackRibbon = (
      width: number,
      yOffset: number,
      color: string,
      roughness = 0.11,
      useMap = false
    ) => {
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      for (let i = 0; i <= trackSamples; i++) {
        const frame = isHarunaMap
          ? smoothTrackFrames[Math.min(i, trackSamples)]
          : smoothTrackFrames[i % trackSamples];
        const t = i / trackSamples;
        const y = frame.pt.y + trackSurfaceLift + yOffset;

        const left = frame.pt.clone().addScaledVector(frame.normal, -width * 0.5);
        const right = frame.pt.clone().addScaledVector(frame.normal, width * 0.5);

        positions.push(left.x, y, left.z);
        positions.push(right.x, y, right.z);

        uvs.push(0, t * 48);
        uvs.push(1, t * 48);

        if (i < trackSamples) {
          const base = i * 2;
          indices.push(base, base + 1, base + 2);
          indices.push(base + 1, base + 3, base + 2);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        color: useMap ? '#D8DCE6' : color,
        map: useMap ? createTrackSurfaceTexture() : null,
        roughness: Math.max(roughness, 0.3),
        metalness: 0.18,
        envMapIntensity: 0.7,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      return mesh;
    };

    // Tokyo Grand Aula RC surface overlay: Haruna keeps its centerline/world,
    // but the drivable asphalt is the same Sakura P-Tile track surface.
    const subMatMesh = buildTrackRibbon(circuit.trackWidth + 2.0, 0.015, '#090C12', 0.45, false);
    scene.add(subMatMesh);

    // Main Pro P-Tile Track Surface (satin, tidak silau)
    const trackMesh = buildTrackRibbon(circuit.trackWidth, 0.028, '#161C28', 0.34, true);
    scene.add(trackMesh);

    // Ideal D1 Drift Line Groove
    const grooveMesh = buildTrackRibbon(0.42, 0.036, circuit.accentColor, 0.16, false);
    (grooveMesh.material as THREE.MeshStandardMaterial).transparent = true;
    (grooveMesh.material as THREE.MeshStandardMaterial).opacity = 0.28;
    scene.add(grooveMesh);

    // Continuous 3D Extruded RC Track Guardrails & Beveled Curbs (Zero jagged blocks or broken seams!)
    const createCurbStripeTexture = () => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 512;
      const ctx = c.getContext('2d')!;
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle =
          i % 4 === 0 ? circuit.accentColor : i % 2 === 0 ? '#EF4444' : '#F8FAFC';
        ctx.fillRect(0, i * 64, 128, 64);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 64);
      tex.anisotropy = 8;
      return tex;
    };

    const curbStripeMat = new THREE.MeshStandardMaterial({
      map: createCurbStripeTexture(),
      roughness: 0.5,
      metalness: 0.15,
      envMapIntensity: 0.6,
    });

    const outerRetainingMat = new THREE.MeshStandardMaterial({
      color: '#232D42',
      roughness: 0.5,
      metalness: 0.3,
      envMapIntensity: 0.6,
    });

    // Extrude a continuous closed 3D Rectangular/Beveled Rail along `smoothTrackFrames`
    const buildContinuousRail = (
      lateralOffset: number,
      railWidth: number,
      railHeight: number,
      mat: THREE.Material
    ) => {
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      const innerOff = lateralOffset - railWidth * 0.5;
      const outerOff = lateralOffset + railWidth * 0.5;

      // 4 vertices per cross-section: 0=innerBottom, 1=innerTop, 2=outerTop, 3=outerBottom
      for (let i = 0; i <= trackSamples; i++) {
        const frame = isHarunaMap
          ? smoothTrackFrames[Math.min(i, trackSamples)]
          : smoothTrackFrames[i % trackSamples];
        const v = (i / trackSamples) * 64;
        const baseY = frame.pt.y + trackSurfaceLift + 0.02;

        const pIn = frame.pt.clone().addScaledVector(frame.normal, innerOff);
        const pOut = frame.pt.clone().addScaledVector(frame.normal, outerOff);

        positions.push(pIn.x, baseY, pIn.z);
        positions.push(pIn.x, baseY + railHeight, pIn.z);
        positions.push(pOut.x, baseY + railHeight, pOut.z);
        positions.push(pOut.x, baseY, pOut.z);

        uvs.push(0, v);
        uvs.push(0.33, v);
        uvs.push(0.66, v);
        uvs.push(1.0, v);

        if (i < trackSamples) {
          const b = i * 4;
          const n = (i + 1) * 4;
          // Inner wall
          indices.push(b + 0, b + 1, n + 0, b + 1, n + 1, n + 0);
          // Top face
          indices.push(b + 1, b + 2, n + 1, b + 2, n + 2, n + 1);
          // Outer wall
          indices.push(b + 2, b + 3, n + 2, b + 3, n + 3, n + 2);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

    // Left & Right Continuous Striped Inner Curbs
    scene.add(buildContinuousRail(-(halfWidth + 0.25), 0.45, 0.30, curbStripeMat));
    scene.add(buildContinuousRail(halfWidth + 0.25, 0.45, 0.30, curbStripeMat));

    // Left & Right Continuous Sleek Dark Outer Cushion Guardrail Walls
    // Haruna already has its native mountain guardrails; Aula keeps the extra RC wall.
    if (!isHarunaMap) {
      scene.add(buildContinuousRail(-(halfWidth + 0.68), 0.32, 0.46, outerRetainingMat));
      scene.add(buildContinuousRail(halfWidth + 0.68, 0.32, 0.46, outerRetainingMat));
    }

    // Start / Finish RC Telemetry Gantry Bridge + Checkerboard Start Grid
    const startPt = trackCurve.getPointAt(0);
    const startTan = trackCurve.getTangentAt(0).normalize();
    const startAngle = Math.atan2(startTan.x, startTan.z);
    const gantryGroup = new THREE.Group();
    gantryGroup.position.set(startPt.x, startPt.y, startPt.z);
    gantryGroup.rotation.y = startAngle;

    const pillarGeo = new THREE.BoxGeometry(0.65, 5.4, 0.65);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: '#1E293B',
      metalness: 0.6,
      roughness: 0.2,
    });
    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-(halfWidth + 0.85), 2.7, 0);
    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(halfWidth + 0.85, 2.7, 0);

    const beamGeo = new THREE.BoxGeometry(circuit.trackWidth + 2.5, 1.05, 0.85);
    const beamMat = new THREE.MeshStandardMaterial({
      color: '#0F172A',
      emissive: circuit.accentColor,
      emissiveIntensity: 0.3,
    });
    const topBeam = new THREE.Mesh(beamGeo, beamMat);
    topBeam.position.set(0, 5.0, 0);

    // Checkerboard Start Line Texture
    const createCheckerTexture = () => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 64;
      const ctx = c.getContext('2d')!;
      for (let y = 0; y < 64; y += 32) {
        for (let x = 0; x < 256; x += 32) {
          ctx.fillStyle = ((x + y) / 32) % 2 === 0 ? '#FFFFFF' : '#0F172A';
          ctx.fillRect(x, y, 32, 32);
        }
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 1);
      return tex;
    };

    const startLineGeo = new THREE.PlaneGeometry(circuit.trackWidth - 0.6, 1.8);
    const startLineMat = new THREE.MeshBasicMaterial({
      map: createCheckerTexture(),
      side: THREE.DoubleSide,
    });
    const startLineMesh = new THREE.Mesh(startLineGeo, startLineMat);
    startLineMesh.rotation.x = -Math.PI / 2;
    startLineMesh.position.y = trackSurfaceLift + 0.046;

    gantryGroup.add(leftPillar, rightPillar, topBeam, startLineMesh);
    scene.add(gantryGroup);

    // --- 5. D1GP CLIPPING ZONES (PAINTED ASPHALT BOXES + HOLOGRAPHIC RINGS + SIGNBOARDS) ---
    interface ClipZone3D {
      id: string;
      label: string;
      worldPos: THREE.Vector3;
      radius: number;
      minAngle: number;
      basePoints: number;
      ringMesh: THREE.Mesh;
      innerDisc: THREE.Mesh;
      pillarMesh: THREE.Mesh;
      hitPulse: number;
    }

    const createClipBoxTexture = (colorHex: string, labelText: string) => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const ctx = c.getContext('2d')!;

      ctx.fillStyle = 'rgba(10, 15, 26, 0.55)';
      ctx.fillRect(0, 0, 512, 256);

      // Diagonal D1GP Clipping Zone Stripes
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, 496, 240);

      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.35;
      for (let x = -256; x < 512; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 256);
        ctx.lineTo(x + 180, 0);
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'italic 900 44px "Chakra Petch", sans-serif';
      ctx.fillText(labelText, 28, 142);

      return new THREE.CanvasTexture(c);
    };

    const clipZones3D: ClipZone3D[] = circuit.clippingZones.map((cz) => {
      const pt = trackCurve.getPointAt(cz.t);
      const tan = trackCurve.getTangentAt(cz.t).normalize();
      const norm = new THREE.Vector3(-tan.z, 0, tan.x);
      const tangentAngle = Math.atan2(tan.x, tan.z);
      const worldPos = pt.clone().addScaledVector(norm, cz.offset * (halfWidth - 1.3));

      const baseColor =
        cz.type === 'wall_kiss' ? '#FF2A85' : cz.type === 'outer_zone' ? '#00F0FF' : '#CCFF00';

      // Painted D1GP Asphalt Clipping Box oriented along the corner tangent
      const boxGeo = new THREE.PlaneGeometry(3.4, cz.radius * 2.1);
      const boxMat = new THREE.MeshBasicMaterial({
        map: createClipBoxTexture(baseColor, cz.label),
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
      });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.rotation.x = -Math.PI / 2;
      boxMesh.rotation.z = -tangentAngle;
      boxMesh.position.set(worldPos.x, worldPos.y + trackSurfaceLift + 0.044, worldPos.z);
      scene.add(boxMesh);

      const ringGeo = new THREE.RingGeometry(cz.radius * 0.78, cz.radius, 36);
      const ringMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.82,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.set(worldPos.x, worldPos.y + trackSurfaceLift + 0.056, worldPos.z);
      scene.add(ringMesh);

      const discGeo = new THREE.CircleGeometry(cz.radius * 0.76, 32);
      const discMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.16,
      });
      const innerDisc = new THREE.Mesh(discGeo, discMat);
      innerDisc.rotation.x = -Math.PI / 2;
      innerDisc.position.set(worldPos.x, worldPos.y + trackSurfaceLift + 0.05, worldPos.z);
      scene.add(innerDisc);

      // Glowing Trackside Clipping Zone Beacon Post
      const beaconGeo = new THREE.CylinderGeometry(0.22, 0.22, 2.5, 16);
      const beaconMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.85,
      });
      const pillarMesh = new THREE.Mesh(beaconGeo, beaconMat);
      const edgeSign = cz.offset >= 0 ? 1 : -1;
      const postPos = pt.clone().addScaledVector(norm, edgeSign * (halfWidth + 1.15));
      pillarMesh.position.set(postPos.x, pt.y + trackSurfaceLift + 1.25, postPos.z);
      scene.add(pillarMesh);

      return {
        id: cz.id,
        label: cz.label,
        worldPos,
        radius: cz.radius,
        minAngle: cz.minAngle,
        basePoints: cz.basePoints,
        ringMesh,
        innerDisc,
        pillarMesh,
        hitPulse: 0,
      };
    });

    // --- 5B. TAMAN SAKURA OTOMATIS (14 pohon, validasi jarak trek) + SPANDUK GANTUNG START ---
    const trackSamplePts: THREE.Vector3[] = [];
    for (let i = 0; i < 240; i++) {
      const t = routeClosed ? i / 240 : i / 239;
      trackSamplePts.push(trackCurve.getPointAt(t));
    }
    const sakuraGarden = isHarunaMap
      ? { swayGroups: [] as THREE.Group[], spots: [] as [number, number, number][], petals: [] as { mesh: THREE.Mesh; vy: number; swayPhase: number; swaySpeed: number; rotSpeed: number }[] }
      : buildSakuraGardenAuto(
          scene,
          aulaGroup,
          hallFrame,
          trackSamplePts,
          halfWidth,
          {
            rostrum: aulaBuilt.rostrumRect,
            tribun: aulaBuilt.tribunRect,
            pit: aulaBuilt.pitRect,
            judge: aulaBuilt.judgeTowerPos,
          }
        );
    const sakuraSwayGroups = sakuraGarden.swayGroups;
    const sakuraSpots = sakuraGarden.spots;
    const petals = sakuraGarden.petals;
    if (!isHarunaMap) buildHangingStartBanners(scene, trackCurve, hallFrame.height);

    // --- 6. BUILD 1:10 RWD RC DRIFT CHASSIS + WOBBLE-FREE WHEELS + SKYLINE GT-R ---
    const createRCCarRig = (
      _bodyId: CarCustomization['bodyId'],
      paintHex: string,
      anodizeHex: string,
      neonHex: string,
      shellMode: CarCustomization['bodyShellMode']
    ): RCCarRig => {
      const root = new THREE.Group();
      const chassisGroup = new THREE.Group();
      const bodyShellGroup = new THREE.Group();
      root.add(chassisGroup);
      root.add(bodyShellGroup);

      const bodyPaintMaterials: THREE.MeshStandardMaterial[] = [];
      const anodizedMaterials: THREE.MeshStandardMaterial[] = [];

      const carbonMat = new THREE.MeshStandardMaterial({
        color: '#181B22',
        roughness: 0.25,
        metalness: 0.5,
      });

      const anodizeMat = new THREE.MeshStandardMaterial({
        color: anodizeHex,
        roughness: 0.3,
        metalness: 0.75,
        envMapIntensity: 0.9,
      });
      anodizedMaterials.push(anodizeMat);

      const darkMetalMat = new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.3,
        metalness: 0.8,
      });

      // A. Detailed 1:10 RWD Lower Carbon Deck & Upper Spine
      const lowerDeck = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 2.95), carbonMat);
      lowerDeck.position.y = 0.22;
      chassisGroup.add(lowerDeck);

      const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 1.9), carbonMat);
      upperDeck.position.set(0, 0.52, -0.05);
      chassisGroup.add(upperDeck);

      const frontBulkhead = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.34, 0.38), anodizeMat);
      frontBulkhead.position.set(0, 0.4, 1.05);
      chassisGroup.add(frontBulkhead);

      const rearBulkhead = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.38, 0.42), anodizeMat);
      rearBulkhead.position.set(0, 0.42, -1.05);
      chassisGroup.add(rearBulkhead);

      const motorCan = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.52, 16),
        anodizeMat
      );
      motorCan.rotation.z = Math.PI / 2;
      motorCan.position.set(0.1, 0.52, -0.78);
      chassisGroup.add(motorCan);

      const coolingFan = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.06, 8),
        new THREE.MeshBasicMaterial({ color: '#00F0FF', wireframe: true })
      );
      coolingFan.position.set(0.1, 0.8, -0.78);
      chassisGroup.add(coolingFan);

      const lipoPack = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.22, 0.55),
        new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.2 })
      );
      lipoPack.position.set(0, 0.36, -0.22);
      chassisGroup.add(lipoPack);

      const gyroBox = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.26), anodizeMat);
      gyroBox.position.set(-0.25, 0.32, 0.35);
      const gyroLed = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshBasicMaterial({ color: '#00F0FF' })
      );
      gyroLed.position.set(-0.25, 0.42, 0.35);
      chassisGroup.add(gyroBox, gyroLed);

      const servoBox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.24), darkMetalMat);
      servoBox.position.set(0.2, 0.38, 0.58);
      const servoHorn = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.08), anodizeMat);
      servoHorn.position.set(0, 0.45, 0.78);
      chassisGroup.add(servoBox, servoHorn);

      const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.45), carbonMat);
      diffuser.position.set(0, 0.2, -1.62);
      chassisGroup.add(diffuser);

      // A2. PRO 1:10 RC DRIFT SUSPENSION HARDWARE (Carbon Shock Towers, Lower A-Arms, Big-Bore Coilovers & IFS Rockers)
      const kashimaMat = new THREE.MeshStandardMaterial({
        color: '#85582A', // Authentic Kashima Coat Bronze Damper Cylinder
        roughness: 0.18,
        metalness: 0.88,
      });
      const tiNitrideGoldMat = new THREE.MeshStandardMaterial({
        color: '#FACC15', // TiN Gold Shock Shaft
        roughness: 0.1,
        metalness: 0.95,
      });
      const springBlackMat = new THREE.MeshStandardMaterial({
        color: '#0F172A',
        roughness: 0.25,
        metalness: 0.7,
      });

      // Front & Rear Carbon Multi-Hole Shock Towers
      const frontShockTower = new THREE.Mesh(
        new THREE.BoxGeometry(1.08, 0.32, 0.06),
        carbonMat
      );
      frontShockTower.position.set(0, 0.58, 1.12);
      const rearShockTower = new THREE.Mesh(
        new THREE.BoxGeometry(1.12, 0.36, 0.06),
        carbonMat
      );
      rearShockTower.position.set(0, 0.60, -1.08);
      chassisGroup.add(frontShockTower, rearShockTower);

      const lowerArms: THREE.Mesh[] = [];
      const coilSprings: THREE.Group[] = [];
      const ifsRockers: THREE.Mesh[] = [];

      // Build 4-Corner Lower Suspension A-Arms & Animated Coilover Shock Units [FL, FR, RL, RR]
      const cornerCoords = [
        { x: 0.62, z: 1.12, isLeft: true },   // FL
        { x: -0.62, z: 1.12, isLeft: false }, // FR
        { x: 0.62, z: -1.08, isLeft: true },  // RL
        { x: -0.62, z: -1.08, isLeft: false },// RR
      ];

      cornerCoords.forEach((c) => {
        // CNC Aluminum / Delrin Lower Suspension A-Arm
        const armMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.52, 0.05, 0.22),
          anodizeMat
        );
        armMesh.position.set(c.x, 0.25, c.z);
        chassisGroup.add(armMesh);
        lowerArms.push(armMesh);

        // Upper Turnbuckle Camber Link
        const upperLink = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.022, 0.44, 8),
          tiNitrideGoldMat
        );
        upperLink.rotation.z = Math.PI / 2;
        upperLink.position.set(c.x * 0.92, 0.46, c.z);
        chassisGroup.add(upperLink);

        // Big-Bore Coilover Damper Assembly (angled inward toward shock tower)
        const damperRoot = new THREE.Group();
        damperRoot.position.set(c.x * 0.88, 0.46, c.z + (c.z > 0 ? -0.06 : 0.06));
        damperRoot.rotation.z = c.isLeft ? 0.26 : -0.26;

        // Upper Anodized Shock Cap & Kashima Cylinder Body
        const shockCap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.065, 0.065, 0.05, 12),
          anodizeMat
        );
        shockCap.position.y = 0.16;

        const kashimaBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.058, 0.058, 0.18, 12),
          kashimaMat
        );
        kashimaBody.position.y = 0.06;

        // Gold Titanium-Nitride Shock Piston Shaft
        const tiShaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.022, 0.22, 10),
          tiNitrideGoldMat
        );
        tiShaft.position.y = -0.06;

        // Animated Progressive Helical Coil Spring Stack (scales along Y during compression!)
        const springStack = new THREE.Group();
        springStack.position.y = -0.02;
        for (let ringIdx = 0; ringIdx < 5; ringIdx++) {
          const coilRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.068, 0.015, 8, 16),
            ringIdx === 2 ? anodizeMat : springBlackMat
          );
          coilRing.rotation.x = Math.PI / 2;
          coilRing.position.y = (ringIdx - 2) * 0.042;
          springStack.add(coilRing);
        }

        damperRoot.add(shockCap, kashimaBody, tiShaft, springStack);
        chassisGroup.add(damperRoot);
        coilSprings.push(springStack);
      });

      // Overdose GALM-Style IFS (Inboard Front Suspension) Pushrod Rocker Arms on Front Bulkhead
      const rockerGeo = new THREE.BoxGeometry(0.24, 0.05, 0.14);
      const ifsL = new THREE.Mesh(rockerGeo, anodizeMat);
      ifsL.position.set(0.24, 0.58, 0.98);
      const ifsR = new THREE.Mesh(rockerGeo, anodizeMat);
      ifsR.position.set(-0.24, 0.58, 0.98);
      chassisGroup.add(ifsL, ifsR);
      ifsRockers.push(ifsL, ifsR);

      // B. 100% WOBBLE-FREE 6-SPOKE TE37 WHEELS + SEPARATE CAMBER HUB & SPIN AXLE
      // Why it never wobbles:
      // 1. `flKnuckle` / `frKnuckle` ONLY rotates around Y (Steering Lock)
      // 2. `camberHub` ONLY tilts around Z (Static Negative Camber + Fixed Brembo Brake Caliper)
      // 3. `spinAxle` is a child of `camberHub` with rotation (0,0,0) and ONLY rotates around X!
      const flKnuckle = new THREE.Group();
      flKnuckle.position.set(0.84, 0.35, 1.12);
      const frKnuckle = new THREE.Group();
      frKnuckle.position.set(-0.84, 0.35, 1.12);
      chassisGroup.add(flKnuckle, frKnuckle);

      const spinAxles: THREE.Group[] = [];
      const camberHubs: THREE.Group[] = [];
      const tireMat = new THREE.MeshStandardMaterial({
        color: '#10131A',
        roughness: 0.14,
        metalness: 0.18,
      });
      const rimLipMat = new THREE.MeshStandardMaterial({
        color: '#DDE3EE',
        roughness: 0.25,
        metalness: 0.85,
        envMapIntensity: 0.9,
      });
      const rotorMat = new THREE.MeshStandardMaterial({
        color: '#94A3B8',
        roughness: 0.3,
        metalness: 0.85,
      });
      const caliperMat = new THREE.MeshStandardMaterial({
        color: '#F59E0B',
        roughness: 0.25,
        metalness: 0.6,
      });

      const createWheelAssembly = (isLeft: boolean, isFront: boolean) => {
        // Stationary Camber Hub (holds negative camber tilt & fixed Brembo caliper)
        const camberHub = new THREE.Group();
        const camberRad = isFront ? 0.14 : 0.052; // ~ -8 deg front, -3 deg rear default
        camberHub.rotation.z = isLeft ? camberRad : -camberRad;
        camberHubs.push(camberHub);

        // Fixed Brembo Gold Brake Caliper (does NOT spin with the wheel!)
        const caliper = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.16, 0.11),
          caliperMat
        );
        caliper.position.set(isLeft ? -0.04 : 0.04, 0.06, -0.14);
        camberHub.add(caliper);

        // Purely Axial Spinning Wheel Group (ONLY rotates around local X axis!)
        const spinAxle = new THREE.Group();

        // 1. HDPE Drift Tire Cylinder (perfectly centered on X axis)
        const tireGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.31, 32);
        tireGeo.rotateZ(Math.PI / 2);
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.castShadow = true;

        // 2. Deep-Dish Chrome Outer Barrel
        const barrelGeo = new THREE.CylinderGeometry(0.275, 0.275, 0.32, 28);
        barrelGeo.rotateZ(Math.PI / 2);
        const barrel = new THREE.Mesh(barrelGeo, rimLipMat);

        // 3. Vented Steel Brake Disc Rotor
        const rotorGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.04, 24);
        rotorGeo.rotateZ(Math.PI / 2);
        const rotor = new THREE.Mesh(rotorGeo, rotorMat);
        rotor.position.x = isLeft ? -0.05 : 0.05;

        // 4. 6-Spoke Volk Racing TE37 Wheel Face (Symmetrically arranged around X axis)
        const faceOffset = isLeft ? 0.08 : -0.08;
        for (let s = 0; s < 3; s++) {
          const spokeGeo = new THREE.BoxGeometry(0.05, 0.47, 0.072);
          const spoke = new THREE.Mesh(spokeGeo, anodizeMat);
          spoke.position.x = faceOffset;
          spoke.rotation.x = (s * Math.PI) / 3;
          spinAxle.add(spoke);
        }

        // 5. Center Locking Wheel Nut
        const hubCapGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.08, 16);
        hubCapGeo.rotateZ(Math.PI / 2);
        const hubCap = new THREE.Mesh(hubCapGeo, rimLipMat);
        hubCap.position.x = isLeft ? 0.1 : -0.1;

        spinAxle.add(tire, barrel, rotor, hubCap);
        camberHub.add(spinAxle);
        spinAxles.push(spinAxle);

        return camberHub;
      };

      const flAssembly = createWheelAssembly(true, true);
      flKnuckle.add(flAssembly);

      const frAssembly = createWheelAssembly(false, true);
      frKnuckle.add(frAssembly);

      const rlAssembly = createWheelAssembly(true, false);
      rlAssembly.position.set(0.84, 0.35, -1.08);
      chassisGroup.add(rlAssembly);

      const rrAssembly = createWheelAssembly(false, false);
      rrAssembly.position.set(-0.84, 0.35, -1.08);
      chassisGroup.add(rrAssembly);

      // C. 1:10 LEXAN BMW M3 BODY SHELL FROM bmw.glb (Tuned: 4.11m x 2.09m x 1.63m, Y: +0.09m)
      const bmwRig = createBMWCarMesh({
        width: 2.09,
        length: 4.11,
        height: 1.63,
        rotY: 0,
        offsetY: 0.09,
        offsetZ: 0.0,
        color: paintHex,
        opacity: shellMode === 'translucent' ? 0.45 : 1.0,
        transparent: shellMode === 'translucent',
        roughness: shellMode === 'translucent' ? 0.12 : 0.25,
        metalness: 0.25,
        mode: 'sakura_rc',
      });
      bodyShellGroup.add(bmwRig.group);
      bodyPaintMaterials.push(bmwRig.material);

      bodyShellGroup.visible = shellMode !== 'naked_chassis';

      const neonMaterial = new THREE.MeshBasicMaterial({
        color: neonHex,
        transparent: true,
        opacity: 0.85,
      });
      const neonPad = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 2.95), neonMaterial);
      neonPad.rotation.x = -Math.PI / 2;
      neonPad.position.y = 0.04;
      root.add(neonPad);

      const neonLight = new THREE.PointLight(neonHex, 1.1, 6.5);
      neonLight.position.set(0, 0.35, 0);
      root.add(neonLight);

      const turboSparkMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.75, 8),
        new THREE.MeshBasicMaterial({ color: '#38BDF8' })
      );
      turboSparkMesh.rotation.x = -Math.PI / 2;
      turboSparkMesh.position.set(0.52, 0.25, -2.18);
      turboSparkMesh.visible = false;
      root.add(turboSparkMesh);

      return {
        root,
        chassisGroup,
        bodyShellGroup,
        bodyPaintMaterials,
        anodizedMaterials,
        neonMaterial,
        neonLight,
        flKnuckle,
        frKnuckle,
        spinAxles,
        camberHubs,
        coilSprings,
        lowerArms,
        ifsRockers,
        coolingFan,
        servoHorn,
        turboSparkMesh,
      };
    };

    const playerRig = createRCCarRig(
      customRef.current.bodyId,
      customRef.current.bodyColor,
      customRef.current.chassisAnodizeColor,
      customRef.current.neonColor,
      customRef.current.bodyShellMode
    );
    scene.add(playerRig.root);
    playerRigRef.current = playerRig;

    // 5 Autonomous Pro RC Drift Opponent Bots (Kenji, Takashi, Ryosuke, Takumi, Nakazato)
    const botRigs = ENEMY_BOTS_DATA.map((bot) => {
      const rig = createRCCarRig(
        bot.bodyId,
        bot.bodyColor,
        bot.anodizeColor,
        bot.neonColor,
        'painted'
      );
      scene.add(rig.root);
      return rig;
    });
    const leadRig = botRigs[0];

    // --- 5C. MENU DIORAMA (mount hanya saat phase menu) + MOBIL POSTER ---
    if (MENU_MODE) {
      buildMenuDiorama(scene);
      // Pakai CarModel yang sama dengan in-game — warna ikut settings.color
      const posterRig = createRCCarRig(
        customRef.current.bodyId,
        customRef.current.bodyColor,
        customRef.current.chassisAnodizeColor,
        customRef.current.neonColor,
        'painted'
      );
      posterRig.root.position.set(DIORAMA_CAR.x, 0, DIORAMA_CAR.z);
      // Pose ala poster: menghadap kamera + roda depan dibelokkan + body roll tipis
      posterRig.root.rotation.y = 0.5;
      posterRig.flKnuckle.rotation.y = 0.38;
      posterRig.frKnuckle.rotation.y = 0.38;
      posterRig.bodyShellGroup.rotation.z = 0.02;
      scene.add(posterRig.root);
      dioramaCarRigRef.current = posterRig;
      // Sembunyikan rig balap saat menu agar tidak membebani render
      playerRig.root.visible = false;
      botRigs.forEach((r) => {
        r.root.visible = false;
      });
    }

    const tetherGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const tetherMat = new THREE.LineBasicMaterial({
      color: '#CCFF00',
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
    });
    const tetherLine = new THREE.Line(tetherGeo, tetherMat);
    scene.add(tetherLine);

    // --- 7. 5-STAGE DRIFT SMOKE PIPELINE (640-SPRITE RING BUFFER + 6-LOBE CANVAS + WHEEL-SPIN SWIRL) ---
    // [STAGE 4: TEKSTUR] — 128x128 Procedural 6-Lobe Radial Puff Canvas drawn once at load
    const createSixLobeSmokeTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 128, 128);

      // 1 large center lobe + 5 surrounding lobes with different alphas for fluffy organic cloud
      const lobes = [
        { x: 64, y: 64, r: 52, a: 0.52 },
        { x: 46, y: 52, r: 36, a: 0.36 },
        { x: 82, y: 54, r: 35, a: 0.34 },
        { x: 50, y: 78, r: 34, a: 0.32 },
        { x: 78, y: 76, r: 35, a: 0.33 },
        { x: 64, y: 42, r: 33, a: 0.30 },
      ];

      lobes.forEach((l) => {
        const g = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, l.r);
        g.addColorStop(0, `rgba(255, 255, 255, ${l.a})`);
        g.addColorStop(0.48, `rgba(245, 247, 250, ${l.a * 0.62})`);
        g.addColorStop(0.82, `rgba(225, 230, 238, ${l.a * 0.22})`);
        g.addColorStop(1, 'rgba(225, 230, 238, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
        ctx.fill();
      });

      return new THREE.CanvasTexture(canvas);
    };

    const sharedSmokeTex = createSixLobeSmokeTexture();

    // Live WheelAnchors for Player Rear Left & Rear Right Wheels (so Jalur B Swirl stays locked to moving wheels!)
    const playerWheelAnchors: [WheelAnchor, WheelAnchor] = [
      {
        pos: new THREE.Vector3(),
        forward: new THREE.Vector3(0, 0, 1),
        right: new THREE.Vector3(1, 0, 0),
      },
      {
        pos: new THREE.Vector3(),
        forward: new THREE.Vector3(0, 0, 1),
        right: new THREE.Vector3(1, 0, 0),
      },
    ];

    // [STAGE 3: POOL] — Pre-allocate 640 THREE.Sprite instances in a Ring Buffer (Zero runtime GC allocation!)
    const SMOKE_POOL_SIZE = 640;
    const smokeRingPool: RingSmokeSlot[] = new Array(SMOKE_POOL_SIZE);
    let smokeRingHead = 0;

    // Color endpoints for Rubber Tint interpolation:
    // Birth (from): #c4c8cf (clean) <-> #8f847e (burnt rubber)
    // Aged  (to):   #f7f8fb (clean) <-> #d9d3ce (burnt rubber)
    const cleanFromColor = new THREE.Color('#c4c8cf');
    const burntFromColor = new THREE.Color('#8f847e');
    const cleanToColor = new THREE.Color('#f7f8fb');
    const burntToColor = new THREE.Color('#d9d3ce');

    for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
      const mat = new THREE.SpriteMaterial({
        map: sharedSmokeTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 5; // Always drawn after asphalt & tire skidmarks
      scene.add(sprite);

      smokeRingPool[i] = {
        active: false,
        sprite,
        mat,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1.4,
        baseSize: 0.5,
        peakAlpha: 0.45,
        spin: 0,
        colorFrom: new THREE.Color('#c4c8cf'),
        colorTo: new THREE.Color('#f7f8fb'),
        isSwirling: false,
        anchor: null,
        swirlAngle: 0,
        swirlRadius: 0.25,
        omega: -10,
        orbitTimeLeft: 0,
        isLegacy: false,
      };
    }

    // Spawn a puff from the 640 Ring Buffer (Jalur A Slide Smoke, Jalur B Wheel-Spin Swirl, or Legacy Mode)
    const spawnRingSmokePuff = (opts: {
      pos: THREE.Vector3;
      vel: THREE.Vector3;
      strength: number;
      isSwirl?: boolean;
      anchor?: WheelAnchor;
      omega?: number;
      isLegacy?: boolean;
    }) => {
      const cfg = tuningRef.current.smokeConfig || DEFAULT_SMOKE_CONFIG;
      const slot = smokeRingPool[smokeRingHead];
      smokeRingHead = (smokeRingHead + 1) % SMOKE_POOL_SIZE;

      slot.active = true;
      slot.life = 0;
      slot.isLegacy = Boolean(opts.isLegacy);

      if (opts.isLegacy) {
        // Legacy Mode Asap Lama parameters
        slot.maxLife = 0.65 + Math.random() * 0.35;
        slot.baseSize = 0.52 + Math.random() * 0.22;
        slot.peakAlpha = Math.min(0.48, 0.2 + opts.strength * 0.22);
        slot.spin = (Math.random() - 0.5) * 2.8;
        slot.colorFrom.set('#F1F5F9');
        slot.colorTo.set('#F1F5F9');
        slot.isSwirling = false;
        slot.anchor = null;
      } else {
        // New 5-Stage Pipeline randomized spawn properties
        const durMult = cfg.lifetime;
        const sizeMult = cfg.puffSize * (opts.isSwirl ? 0.42 : 1.0);
        const opacMult = cfg.opacity;
        const tint = THREE.MathUtils.clamp(cfg.rubberTint, 0, 1);

        slot.maxLife = (1.1 + Math.random() * 0.9) * durMult;
        // Scale factor 0.32 converts formula units to our 1:10 RC track scale so 4x expansion looks authentic
        slot.baseSize =
          (1.1 + opts.strength * 1.1 + Math.random() * 0.5) * sizeMult * 0.32;
        slot.peakAlpha =
          Math.min(0.92, (0.55 + Math.min(1, opts.strength) * 0.35) * opacMult * 0.58);
        slot.spin = (Math.random() * 2 - 1) * 1.2;

        slot.colorFrom.copy(cleanFromColor).lerp(burntFromColor, tint);
        slot.colorTo.copy(cleanToColor).lerp(burntToColor, tint);

        if (opts.isSwirl && opts.anchor) {
          slot.isSwirling = true;
          slot.anchor = opts.anchor;
          // Start at bottom-rear contact patch of the tire
          slot.swirlAngle = -Math.PI * 0.65 + (Math.random() - 0.5) * 0.3;
          slot.swirlRadius = 0.28;
          slot.omega = opts.omega ?? -12;
          slot.orbitTimeLeft = 0.16 + Math.random() * 0.20; // 0.16 - 0.36s orbit
        } else {
          slot.isSwirling = false;
          slot.anchor = null;
        }
      }

      slot.sprite.position.copy(opts.pos);
      slot.vel.copy(opts.vel);
      slot.mat.rotation = Math.random() * Math.PI * 2;
      slot.mat.color.copy(slot.colorFrom);
      slot.mat.opacity = 0.01;
      slot.sprite.scale.setScalar(slot.baseSize * 0.6);
      slot.sprite.visible = true;
    };

    // Frame-rate independent emission accumulators & hysteresis state
    const smokeEmitterState = {
      isDriftingHysteresis: false,
      slideAcc: 0,
      swirlAcc: 0,
      aiSlideAcc: 0,
    };

    const maxSkids = 420;
    const skidGeo = new THREE.PlaneGeometry(0.3, 0.58);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: '#05070B',
      transparent: true,
      opacity: 0.52,
    });
    const skidInstanced = new THREE.InstancedMesh(skidGeo, skidMat, maxSkids);
    skidInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(skidInstanced);
    let skidIndex = 0;
    const dummyMatrix = new THREE.Object3D();

    // --- 7B. 3D COLLISION SPARKS POOL (FOR DOOR-TO-DOOR & BUMPER IMPACTS) ---
    interface SparkParticle {
      mesh: THREE.Mesh;
      vel: THREE.Vector3;
      life: number;
      maxLife: number;
    }
    const sparkPool: SparkParticle[] = [];
    const sparkGeo = new THREE.BoxGeometry(0.08, 0.08, 0.28);
    const sparkMatCyan = new THREE.MeshBasicMaterial({ color: '#00F0FF' });
    const sparkMatAmber = new THREE.MeshBasicMaterial({ color: '#F59E0B' });

    const spawnCollisionSparks = (contactPos: THREE.Vector3, count: number) => {
      for (let i = 0; i < count; i++) {
        if (sparkPool.length > 40) {
          const old = sparkPool.shift()!;
          scene.remove(old.mesh);
        }
        const mesh = new THREE.Mesh(
          sparkGeo,
          i % 2 === 0 ? sparkMatAmber : sparkMatCyan
        );
        mesh.position.copy(contactPos);
        const angle = Math.random() * Math.PI * 2;
        const spd = 4 + Math.random() * 9;
        const vel = new THREE.Vector3(
          Math.cos(angle) * spd,
          2.0 + Math.random() * 4.5,
          Math.sin(angle) * spd
        );
        mesh.rotation.y = angle;
        scene.add(mesh);
        sparkPool.push({
          mesh,
          vel,
          life: 0,
          maxLife: 0.22 + Math.random() * 0.16,
        });
      }
    };

    // --- 8. 6-CAR DRIFT RACE STARTING GRID & PHYSICS STATE ---
    // Staggered 2x3 Formation on the Main Straight:
    // Row 1: Player (Right, Pole) & Bot 1 Kenji (Left)
    // Row 2: Bot 2 Takashi (Right) & Bot 3 Ryosuke (Left)
    // Row 3: Bot 4 Takumi (Right) & Bot 5 Nakazato (Left)
    const playerStartT = 0.012;
    const playerGridOffset = -2.0;
    const harunaRideHeight = isHarunaMap ? trackSurfaceLift + 0.08 : 0;

    const startTangent = trackCurve.getTangentAt(playerStartT).normalize();
    const startNormal = new THREE.Vector3(-startTangent.z, 0, startTangent.x);
    const startPos = trackCurve
      .getPointAt(playerStartT)
      .clone()
      .addScaledVector(startNormal, playerGridOffset);
    const initialHeading = Math.atan2(startTangent.x, startTangent.z);

    const state = {
      pos: new THREE.Vector3(startPos.x, startPos.y + harunaRideHeight, startPos.z),
      vel: new THREE.Vector3(0, 0, 0),
      heading: initialHeading,
      velocityAngle: initialHeading,
      angularVel: 0,
      raceStarted: false,
      frontSteerAngle: 0,
      rpm: 6500,
      turboActive: false,
      throttleOutput: 0,
      lastSplineT: playerStartT,
      lapCount: 1,
      // Haruna adalah satu kali downhill; arena Sakura tetap memakai 3 lap.
      maxLaps: isHarunaMap ? 1 : 3,
      lapStartTime: performance.now(),
      sessionScore: 0,
      comboPoints: 0,
      comboMultiplier: 1.0,
      comboTimer: 0,
      maxComboAchieved: 0,
      maxAngleAchieved: 0,
      totalClipsHit: 0,
      clippedThisLap: new Set<string>(),
      previousDriftSign: 0,
      transitionCooldown: 0,
      tsuisoSamples: [] as number[],
      sessionFinished: false,
      raceRank: 1,
      // 4-Corner Pro RC Suspension Spring-Damper State
      suspPitchDeg: 0,
      suspPitchVel: 0,
      suspRollDeg: 0,
      suspRollVel: 0,
      suspHeave: 0,
      suspHeaveVel: 0,
      damperFL: 50,
      damperFR: 50,
      damperRL: 50,
      damperRR: 50,
      callout: null as LiveTelemetry['judgeCallout'],
    };

    // Autonomous Physics-Driven 1:10 RWD Pro Drift Opponent Bots (5 Bots)
    const botStates = ENEMY_BOTS_DATA.map((bot, index) => {
      const bStartT = (bot.startGridT + 1) % 1;
      const bTan = trackCurve.getTangentAt(bStartT).normalize();
      const bNorm = new THREE.Vector3(-bTan.z, 0, bTan.x);
      const bPos = trackCurve
        .getPointAt(bStartT)
        .clone()
        .addScaledVector(bNorm, bot.startGridOffset);
      const bHeading = Math.atan2(bTan.x, bTan.z);

      return {
        def: bot,
        rig: botRigs[index],
        pos: new THREE.Vector3(bPos.x, bPos.y + harunaRideHeight, bPos.z),
        vel: new THREE.Vector3(0, 0, 0),
        speed: 0,
        heading: bHeading,
        velocityAngle: bHeading,
        angularVel: 0,
        frontSteerAngle: 0,
        lastSplineT: bStartT,
        lapCount: 1,
        lateralOffsetTarget: bot.startGridOffset,
        currentLateralOffset: bot.startGridOffset,
        smoothTargetSlip: 0,
        recoveryFactor: 0,
        collisionCooldown: 0,
        slideAcc: 0,
        rank: index + 2,
        driftDegAbs: 0,
        driftDegSigned: 0,
        totalProgress: (bot.startGridT < 0 ? bot.startGridT : bot.startGridT),
        // Tactical AI & Driving Personality State
        tacticalState: 'racing' as 'racing' | 'overtaking' | 'defending' | 'feint_entry' | 'recovering',
        overtakeOffset: 0,
        overtakeTimer: 0,
        feintTimer: 0,
        feintPhase: 0,
        draftBoost: 1.0,
      };
    });
    const aiState = botStates[0];

    const triggerCallout = (
      text: string,
      subtext: string,
      color: 'cyan' | 'magenta' | 'volt' | 'amber'
    ) => {
      state.callout = {
        text,
        subtext,
        color,
        timestamp: performance.now(),
      };
    };

    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      rcSound.init();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const findClosestSplineT = (pos: THREE.Vector3) => {
      // Haruna punya ribuan meter jalan; gunakan proyeksi segmen aslinya supaya
      // posisi y tetap tepat di atas aspal dan tidak menembus saat hairpin.
      if (isHarunaMap && harunaRuntimeTrack) {
        const projected = projectHarunaGlobal(harunaRuntimeTrack, pos.x, pos.z);
        const segmentLength =
          harunaRuntimeTrack.dist[Math.min(projected.i + 1, harunaRuntimeTrack.n - 1)] -
          harunaRuntimeTrack.dist[projected.i];
        const routeDistance = harunaRuntimeTrack.dist[projected.i] + segmentLength * projected.f;
        const routeT = THREE.MathUtils.clamp(
          routeDistance / harunaRuntimeTrack.length,
          0,
          1
        );
        return {
          t: routeT,
          dist: projected.d,
          // Follow the smoothed Aula overlay height, not the removed Haruna road.
          height: trackCurve.getPointAt(routeT).y,
        };
      }

      let bestT = state.lastSplineT;
      let bestDistSq = Infinity;
      const searchSteps = 240;
      for (let i = 0; i < searchSteps; i++) {
        const t = i / searchSteps;
        const pt = trackCurve.getPointAt(t);
        const dSq = (pt.x - pos.x) ** 2 + (pt.z - pos.z) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestT = t;
        }
      }
      // Sub-millimeter local refinement around closest sample
      const fineStep = 1 / (searchSteps * 10);
      for (let offset = -5; offset <= 5; offset++) {
        const t = (bestT + offset * fineStep + 1) % 1;
        const pt = trackCurve.getPointAt(t);
        const dSq = (pt.x - pos.x) ** 2 + (pt.z - pos.z) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestT = t;
        }
      }
      return { t: bestT, dist: Math.sqrt(bestDistSq), height: 0 };
    };

    // --- 9. MAIN 60FPS SIMULATION & RENDER LOOP ---
    let lastTime = performance.now();
    let animFrameId = 0;
    let frameCounter = 0;
    const _menuTarget = new THREE.Vector3();
    let activeLeadBot = botStates[0];

    const animate = (now: number) => {
      animFrameId = requestAnimationFrame(animate);
      const dt = Math.min(0.04, (now - lastTime) / 1000);
      lastTime = now;
      frameCounter++;

      // --- MENU CINEMATIC CAMERA: orbit pelan ala dolly shot rendah ---
      if (MENU_MODE) {
        const t = now * 0.001;
        const ang = 1.0 + t * 0.1;
        _menuTarget.set(
          DIORAMA_CAR.x + Math.sin(ang) * 10.8,
          2 + Math.sin(t * 0.3) * 0.35,
          DIORAMA_CAR.z + Math.cos(ang) * 10.8
        );
        // Deteksi teleport (>150m): snap langsung, selain itu lerp eksponensial
        if (camera.position.distanceTo(_menuTarget) > 150) {
          camera.position.copy(_menuTarget);
        } else {
          camera.position.lerp(_menuTarget, 1 - Math.exp(-3 * dt));
        }
        camera.lookAt(DIORAMA_CAR.x, 1.15, DIORAMA_CAR.z);
        if (Math.abs(camera.fov - 48) > 0.05) {
          camera.fov += (48 - camera.fov) * (1 - Math.exp(-3 * dt));
          camera.updateProjectionMatrix();
        }
        harunaSky?.follow(camera.position);
        renderer.render(scene, camera);
        return;
      }

      const curTuning = tuningRef.current;
      const curMode = gameModeRef.current;
      const ext = extInputRef.current;
      const speedFactor =
        curTuning.speedLevel === '2x'
          ? 2.0
          : curTuning.speedLevel === 'sedang'
          ? 1.35
          : 1.0;

      // Haruna/Akina adds its own feel layer without replacing Sakura RC Pro physics.
      // Aula keeps the original constants, while the downhill setup can tune each layer.
      const accelerationScale = isHarunaMap
        ? THREE.MathUtils.clamp((curTuning.accelerationPower ?? 100) / 100, 0.65, 1.4)
        : 1.0;
      const driftResponseNorm = isHarunaMap
        ? THREE.MathUtils.clamp((curTuning.driftResponse ?? 55) / 100, 0, 1)
        : 0.55;
      const throttleResponseNorm = isHarunaMap
        ? THREE.MathUtils.clamp((curTuning.throttleResponse ?? 100) / 100, 0.5, 1.5)
        : 1.0;
      const handlingAssistNorm = isHarunaMap
        ? THREE.MathUtils.clamp((curTuning.handlingAssist ?? 35) / 100, 0, 1)
        : 0;

      let steerInput = ext.steer;
      if (keys['KeyA'] || keys['ArrowLeft']) steerInput += 1;
      if (keys['KeyD'] || keys['ArrowRight']) steerInput -= 1;
      steerInput = Math.max(-1, Math.min(1, steerInput));

      const manualThrottle =
        keys['KeyW'] || keys['ArrowUp'] || ext.throttle;
      if (manualThrottle) state.raceStarted = true;

      // Throttle response changes how quickly motor output builds, never whether
      // the car is allowed to move: a W/ArrowUp/button press is still required.
      const throttleTarget = manualThrottle ? 1 : 0;
      if (isHarunaMap) {
        const throttleRampRate = 5.5 + throttleResponseNorm * 7.5;
        state.throttleOutput = THREE.MathUtils.lerp(
          state.throttleOutput,
          throttleTarget,
          1 - Math.exp(-throttleRampRate * dt)
        );
      } else {
        state.throttleOutput = throttleTarget;
      }
      const throttleDrive = manualThrottle ? state.throttleOutput : 0;
      const brakePressed =
        keys['KeyS'] || keys['ArrowDown'] || keys['Space'] || ext.brake;
      const turboPressed =
        keys['ShiftLeft'] || keys['ShiftRight'] || ext.turbo;

      // Keselamatan kontrol: Sakura RC Pro tidak boleh maju sendiri.
      // AUTO-GAS hanya tuning assist, tetapi tetap membutuhkan W/tombol throttle.
      const throttleActive = manualThrottle;

      const closest = findClosestSplineT(state.pos);
      const trackPt = trackCurve.getPointAt(closest.t);
      const trackTan = trackCurve.getTangentAt(closest.t).normalize();
      const trackAngle = Math.atan2(trackTan.x, trackTan.z);

      // Check lap / downhill finish progression.
      const crossedStart = state.lastSplineT > 0.85 && closest.t < 0.15;
      const reachedHarunaFinish = isHarunaMap && closest.t > 0.985;
      if ((crossedStart || reachedHarunaFinish) && !state.sessionFinished) {
        state.clippedThisLap.clear();
        if ((curMode === 'race' || curMode === 'qualifying' || curMode === 'tsuiso') && state.lapCount >= state.maxLaps) {
          state.sessionFinished = true;
          const finalTotal = Math.round(
            state.sessionScore + state.comboPoints * state.comboMultiplier
          );
          const grade =
            finalTotal >= circuit.targetScoreQualifying * 1.25
              ? 'S+'
              : finalTotal >= circuit.targetScoreQualifying
              ? 'S'
              : finalTotal >= circuit.targetScoreQualifying * 0.7
              ? 'A'
              : 'B';
          const isPodium = state.raceRank <= 3;
          triggerCallout(
            state.raceRank === 1 ? '🏆 1ST PLACE - WINNER!' : isPodium ? `🥈 PODIUM FINISH! P${state.raceRank}` : `🏁 FINISHED P${state.raceRank} OF 6`,
            'DRIFT RACE COMPLETED',
            state.raceRank === 1 ? 'volt' : isPodium ? 'cyan' : 'amber'
          );
          finishCbRef.current({
            mode: curMode,
            circuitName: circuit.name,
            totalScore: finalTotal,
            maxCombo: Math.round(state.maxComboAchieved),
            maxAngleDeg: Math.round(state.maxAngleAchieved),
            clipsHitCount: state.totalClipsHit,
            totalClipsPossible: circuit.clippingZones.length * state.maxLaps,
            tsuisoAvgProximityM: 0,
            grade,
            rcCreditsEarned: Math.max(150, Math.round(finalTotal * 0.08) + (state.raceRank === 1 ? 500 : isPodium ? 250 : 100)),
            racePosition: state.raceRank,
            totalRacers: 6,
            podiumFinish: isPodium,
          });
        } else if (!isHarunaMap) {
          state.lapCount++;
          triggerCallout(
            `LAP ${state.lapCount} // GO!`,
            'CLIPPING ZONES RESET',
            'cyan'
          );
        } else {
          // Non-qualifying Haruna runs stop at the bottom instead of wrapping to the lake.
          state.sessionFinished = true;
          triggerCallout('IKAHO FINISH!', 'HARUNA DOWNHILL COMPLETE', 'amber');
        }
      }
      state.lastSplineT = closest.t;

      // 3. 1:10 RWD RC DRIFT GYRO, TIRE & PRO SUSPENSION WEIGHT-TRANSFER PHYSICS
      const susp = curTuning.suspension || DEFAULT_SUSPENSION_SETUP;

      // Tokyo Grand Aula and Haruna share the same RC Pro base handling constants.
      // Haruna's optional feel layer below only adjusts acceleration, slide response,
      // throttle ramp and recovery assist; the Sakura car/physics remain intact.
      const compoundGrip =
        curTuning.tireCompound === 'silver_dot'
          ? 1.16
          : curTuning.tireCompound === 'poly_slick'
          ? 0.92
          : 1.0;

      // Active Rear Squat (`rearProSquat`) & Rear Camber (`rearCamberDeg`) forward bite multiplier:
      // Flatter rear camber (-1° to -3°) + high Pro-Squat plants the rear HDPE tires under throttle!
      const rearCamberBite = 1.0 + (4.0 - Math.abs(susp.rearCamberDeg)) * 0.035;
      const squatBiteBoost =
        throttleActive && state.suspPitchDeg > 0.4
          ? 1.0 + (susp.rearProSquat / 100) * 0.18
          : 1.0;

      const turboFactor = 1 + (curTuning.escTurboBoost / 100) * 0.38;
      const isTurboEngaged =
        throttleActive && (turboPressed || state.vel.length() > 14.5);
      state.turboActive = isTurboEngaged;

      const maxSpeed =
        22.5 * speedFactor * compoundGrip * rearCamberBite * (isTurboEngaged ? 1.18 : 1.0);
      const accelForce =
        26.0 *
        speedFactor *
        compoundGrip *
        rearCamberBite *
        squatBiteBoost *
        accelerationScale *
        (isTurboEngaged ? turboFactor : 1.0);

      let currentSpeed = state.vel.length();

      if (throttleActive) {
        currentSpeed = Math.min(
          maxSpeed,
          currentSpeed + accelForce * throttleDrive * dt
        );
      } else if (brakePressed) {
        currentSpeed = Math.max(0, currentSpeed - 32.0 * dt);
      } else {
        currentSpeed = Math.max(0, currentSpeed - 9.5 * dt);
      }

      const wrapAngle = (a: number) => {
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
      };

      const gyroGainNorm = curTuning.gyroGain / 100;
      const maxSteerRad = THREE.MathUtils.degToRad(curTuning.maxSteerAngle);

      // Front Nose Dive on braking/entry loads front tires for sharper Furidashi turn-in!
      const frontDiveTurnBoost = state.suspPitchDeg < -0.3 ? 1.16 : 1.0;
      // IFS Pushrod Rocker setup gives extra crisp front turn-in response
      const ifsTurnBoost = susp.kitId === 'overdose_hg_ifs' ? 1.10 : 1.0;

      const steerTurnRate =
        steerInput *
        3.5 *
        frontDiveTurnBoost *
        ifsTurnBoost *
        (0.65 + 0.35 * Math.min(1, currentSpeed / 8));
      const clutchKickBoost =
        keys['Space'] && Math.abs(steerInput) > 0.05 ? steerInput * 2.4 : 0;

      const gyroDamping =
        -state.angularVel *
        (4.2 + gyroGainNorm * 4.5 + handlingAssistNorm * 2.6);

      state.angularVel +=
        (steerTurnRate * (9.5 + handlingAssistNorm * 0.9) +
          clutchKickBoost * 8.0 +
          gyroDamping) *
        dt;
      state.heading = wrapAngle(state.heading + state.angularVel * dt);

      // Higher drift response loosens the side bite so the car rotates into
      // Haruna hairpins; handling assist adds stability without auto-throttle.
      const driftGripAdjustment = isHarunaMap
        ? -(driftResponseNorm - 0.55) * 1.3
        : 0;
      const lateralGrip =
        Math.max(
          0.85,
          2.1 +
            (1 - gyroGainNorm) * 0.6 +
            driftGripAdjustment +
            handlingAssistNorm * 0.9
        ) *
        compoundGrip *
        (throttleActive ? 0.82 : 1.35);

      let angleDiff = wrapAngle(state.heading - state.velocityAngle);
      const maxHoldableSlip =
        maxSteerRad *
        (0.88 + gyroGainNorm * 0.14 + (isHarunaMap ? driftResponseNorm * 0.2 : 0));
      if (Math.abs(angleDiff) > maxHoldableSlip) {
        const clampedSign = Math.sign(angleDiff);
        state.heading = wrapAngle(state.velocityAngle + clampedSign * maxHoldableSlip);
        state.angularVel *= 0.5;
        angleDiff = wrapAngle(state.heading - state.velocityAngle);
      }

      state.velocityAngle = wrapAngle(
        state.velocityAngle + angleDiff * lateralGrip * dt
      );

      if (isHarunaMap && handlingAssistNorm > 0 && Math.abs(steerInput) < 0.06) {
        const toTrack = wrapAngle(trackAngle - state.velocityAngle);
        state.velocityAngle = wrapAngle(
          state.velocityAngle + toTrack * handlingAssistNorm * 0.65 * dt
        );
      }
      if (curTuning.autoThrottle && Math.abs(steerInput) < 0.05) {
        const toTrack = wrapAngle(trackAngle - state.velocityAngle);
        state.velocityAngle = wrapAngle(state.velocityAngle + toTrack * 1.8 * dt);
      }

      state.vel.set(
        Math.sin(state.velocityAngle) * currentSpeed,
        0,
        Math.cos(state.velocityAngle) * currentSpeed
      );
      state.pos.addScaledVector(state.vel, dt);

      // 4. Track Boundary Wall-Ride Cushion
      const toCarVec = new THREE.Vector3().subVectors(state.pos, trackPt);
      const trackNormal = new THREE.Vector3(-trackTan.z, 0, trackTan.x);
      const lateralOffset = toCarVec.dot(trackNormal);
      const maxOffset = halfWidth - 0.65;

      if (Math.abs(lateralOffset) > maxOffset) {
        const pushSign = Math.sign(lateralOffset);
        state.pos.addScaledVector(
          trackNormal,
          -(lateralOffset - pushSign * maxOffset)
        );
        state.velocityAngle = wrapAngle(
          state.velocityAngle + wrapAngle(trackAngle - state.velocityAngle) * 0.35
        );
      }

      // 5. High-Angle Ackermann Front Wheel Counter-Steer
      const counterSteerTarget =
        wrapAngle(state.velocityAngle - state.heading) * (0.65 + gyroGainNorm * 0.45) +
        steerInput * 0.38;
      const clampedFrontSteer = Math.max(
        -maxSteerRad,
        Math.min(maxSteerRad, counterSteerTarget)
      );
      state.frontSteerAngle = THREE.MathUtils.lerp(
        state.frontSteerAngle,
        clampedFrontSteer,
        dt * 18
      );

      if (isHarunaMap) {
        // Ikuti elevasi segmen aspal Haruna secara presisi: mobil Sakura tetap menempel
        // pada turunan, bukan melayang atau masuk ke bawah road mesh.
        const roadProjection = findClosestSplineT(state.pos);
        state.pos.y = roadProjection.height + harunaRideHeight;
      }
      playerRig.root.position.copy(state.pos);
      playerRig.root.rotation.y = state.heading;

      const driftDegSigned = THREE.MathUtils.radToDeg(
        wrapAngle(state.heading - state.velocityAngle)
      );
      const driftDegAbs = currentSpeed > 2.5 ? Math.abs(driftDegSigned) : 0;
      if (driftDegAbs > state.maxAngleAchieved) {
        state.maxAngleAchieved = driftDegAbs;
      }

      // --- 5B. 4-CORNER PRO RC SUSPENSION SPRING-DAMPER & WEIGHT TRANSFER DYNAMICS ---
      // Shock Oil CST (#150 soft -> #500 stiff) controls spring-damper damping ratio & rebound speed
      const oilNorm = (susp.shockOilCst - 150) / 350; // 0.0 (150 CST) .. 1.0 (500 CST)
      const springStiffness = 52.0 + oilNorm * 38.0;
      const damperDamping = 6.2 + oilNorm * 7.5;

      // Target Pitch: Positive = Rear Squat under throttle/turbo; Negative = Front Nose Dive under braking
      const squatAmplitude =
        (1.4 + (susp.rearProSquat / 100) * 2.6) *
        susp.rollSensitivity *
        (isTurboEngaged ? 1.32 : 1.0);
      const diveAmplitude = -2.8 * susp.rollSensitivity;

      const targetPitchDeg = throttleActive
        ? squatAmplitude * Math.min(1, currentSpeed / 10 + 0.35)
        : brakePressed
        ? diveAmplitude * Math.min(1, currentSpeed / 8)
        : 0;

      // Target Roll: Centrifugal lateral G-force during drift tilts chassis toward outside of corner
      const targetRollDeg = THREE.MathUtils.clamp(
        driftDegSigned * 0.115 * susp.rollSensitivity * Math.min(1, currentSpeed / 9),
        -8.5,
        8.5
      );

      // Integrate 2nd-order Spring-Damper ODE for Pitch (Squat/Dive) & Roll
      const pitchAccel =
        (targetPitchDeg - state.suspPitchDeg) * springStiffness -
        state.suspPitchVel * damperDamping;
      state.suspPitchVel += pitchAccel * dt;
      state.suspPitchDeg += state.suspPitchVel * dt;

      const rollAccel =
        (targetRollDeg - state.suspRollDeg) * springStiffness -
        state.suspRollVel * damperDamping;
      state.suspRollVel += rollAccel * dt;
      state.suspRollDeg += state.suspRollVel * dt;

      // Calculate individual 4-Corner Damper Compression % (0% = Full Droop, 50% = Static Sag, 100% = Bump Stop)
      const pitchComp = state.suspPitchDeg * 7.5; // +pitch compresses Rear, extends Front
      const rollComp = state.suspRollDeg * 5.2;   // +roll compresses Left or Right outside wheels

      state.damperFL = Math.round(
        THREE.MathUtils.clamp(50 - pitchComp + rollComp, 8, 98)
      );
      state.damperFR = Math.round(
        THREE.MathUtils.clamp(50 - pitchComp - rollComp, 8, 98)
      );
      state.damperRL = Math.round(
        THREE.MathUtils.clamp(50 + pitchComp + rollComp, 8, 98)
      );
      state.damperRR = Math.round(
        THREE.MathUtils.clamp(50 + pitchComp - rollComp, 8, 98)
      );

      // Apply Ride Height (`rideHeightMm`: 4.0mm .. 8.0mm), Pitch Squat & Body Roll to 3D Shell & Chassis
      const rideHeightOffset = (susp.rideHeightMm - 5.5) * 0.025;
      const squatDropY = -Math.abs(state.suspPitchDeg) * 0.008;
      playerRig.bodyShellGroup.position.y = rideHeightOffset + squatDropY;
      playerRig.bodyShellGroup.rotation.z = THREE.MathUtils.degToRad(state.suspRollDeg);
      // Negative X rotation in our car coordinate system (+Z forward) pitches nose UP (Rear Squat!)
      playerRig.bodyShellGroup.rotation.x = THREE.MathUtils.degToRad(-state.suspPitchDeg);

      // Subtle chassis deck pitch & roll so naked/X-ray chassis also squats and rolls realistically!
      playerRig.chassisGroup.rotation.z = THREE.MathUtils.degToRad(state.suspRollDeg * 0.45);
      playerRig.chassisGroup.rotation.x = THREE.MathUtils.degToRad(-state.suspPitchDeg * 0.45);

      // Animate 3D Coilover Springs, Lower Suspension A-Arms & IFS Pushrod Rockers
      const cornerComps = [
        state.damperFL,
        state.damperFR,
        state.damperRL,
        state.damperRR,
      ];
      cornerComps.forEach((compPct, idx) => {
        const normDeflect = (compPct - 50) / 50; // -1 (droop) to +1 (compressed)
        if (playerRig.coilSprings[idx]) {
          // Compress helical coilover spring stack along Y
          playerRig.coilSprings[idx].scale.y = THREE.MathUtils.clamp(
            1.0 - normDeflect * 0.36,
            0.55,
            1.35
          );
        }
        if (playerRig.lowerArms[idx]) {
          const isLeft = idx % 2 === 0;
          playerRig.lowerArms[idx].rotation.z =
            (isLeft ? 1 : -1) * normDeflect * 0.16;
        }
      });

      // Animate Overdose GALM-Style IFS Front Pushrod Rocker Cantilevers
      if (playerRig.ifsRockers.length === 2) {
        playerRig.ifsRockers[0].rotation.z = ((state.damperFL - 50) / 50) * 0.38;
        playerRig.ifsRockers[1].rotation.z = -((state.damperFR - 50) / 50) * 0.38;
      }

      // Apply Live Front & Rear Negative Camber + Dynamic Camber Gain under Compression!
      if (playerRig.camberHubs.length === 4) {
        const fCamberRad = THREE.MathUtils.degToRad(Math.abs(susp.frontCamberDeg));
        const rCamberRad = THREE.MathUtils.degToRad(Math.abs(susp.rearCamberDeg));
        // Extra negative camber gain when outside wheel compresses
        const flGain = Math.max(0, (state.damperFL - 50) * 0.0012);
        const frGain = Math.max(0, (state.damperFR - 50) * 0.0012);
        const rlGain = Math.max(0, (state.damperRL - 50) * 0.0010);
        const rrGain = Math.max(0, (state.damperRR - 50) * 0.0010);

        playerRig.camberHubs[0].rotation.z = fCamberRad + flGain;
        playerRig.camberHubs[1].rotation.z = -(fCamberRad + frGain);
        playerRig.camberHubs[2].rotation.z = rCamberRad + rlGain;
        playerRig.camberHubs[3].rotation.z = -(rCamberRad + rrGain);
      }

      playerRig.flKnuckle.rotation.y = state.frontSteerAngle;
      playerRig.frKnuckle.rotation.y = state.frontSteerAngle;
      playerRig.servoHorn.rotation.y = state.frontSteerAngle * 0.8;
      playerRig.coolingFan.rotation.y += dt * 35;

      const targetRpm = throttleActive
        ? 16000 +
          (currentSpeed / maxSpeed) * 26000 +
          (driftDegAbs / 70) * 9500 +
          (isTurboEngaged ? (curTuning.escTurboBoost / 100) * 14000 : 0)
        : 5500 + (currentSpeed / maxSpeed) * 11000;
      state.rpm = THREE.MathUtils.lerp(state.rpm, targetRpm, dt * 10);

      // 100% Wobble-Free Wheel Rotation around True Local Axle (`spinAxles`)
      // Rear wheels spin faster during high-RPM drift wheelspin!
      const frontSpinRate = currentSpeed * 2.4;
      const rearSpinRate =
        currentSpeed * 2.4 + (driftDegAbs > 14 ? (state.rpm / 60000) * 24 : 0);

      playerRig.spinAxles.forEach((axle, idx) => {
        const rate = idx < 2 ? frontSpinRate : rearSpinRate;
        axle.rotation.x += rate * dt;
      });

      playerRig.turboSparkMesh.visible =
        isTurboEngaged && driftDegAbs > 18 && frameCounter % 3 === 0;

      rcSound.updateTelemetrySound(
        state.rpm,
        driftDegAbs,
        currentSpeed * 1.6,
        isTurboEngaged
      );

      // 6. 5-STAGE DRIFT SMOKE PIPELINE (NEW 640 RING-BUFFER + SWIRL ORBIT vs LEGACY MODE)
      const smokeCfg = curTuning.smokeConfig || DEFAULT_SMOKE_CONFIG;

      // Car basis vectors: forward = (sin(heading), 0, cos(heading)), right = (cos(heading), 0, -sin(heading))
      const carFwdX = Math.sin(state.heading);
      const carFwdZ = Math.cos(state.heading);
      const carRightX = Math.cos(state.heading);
      const carRightZ = -Math.sin(state.heading);

      // Update Live WheelAnchors for Rear Left (lx = +0.84, lz = -1.08) and Rear Right (lx = -0.84, lz = -1.08)
      const rlContactWorld = new THREE.Vector3(
        state.pos.x + carRightX * 0.84 + carFwdX * -1.08,
        state.pos.y + 0.04,
        state.pos.z + carRightZ * 0.84 + carFwdZ * -1.08
      );
      const rrContactWorld = new THREE.Vector3(
        state.pos.x + carRightX * -0.84 + carFwdX * -1.08,
        state.pos.y + 0.04,
        state.pos.z + carRightZ * -0.84 + carFwdZ * -1.08
      );

      playerWheelAnchors[0].pos.set(rlContactWorld.x, state.pos.y + 0.35, rlContactWorld.z);
      playerWheelAnchors[0].forward.set(carFwdX, 0, carFwdZ);
      playerWheelAnchors[0].right.set(carRightX, 0, carRightZ);

      playerWheelAnchors[1].pos.set(rrContactWorld.x, state.pos.y + 0.35, rrContactWorld.z);
      playerWheelAnchors[1].forward.set(carFwdX, 0, carFwdZ);
      playerWheelAnchors[1].right.set(carRightX, 0, carRightZ);

      if (smokeCfg.mode === 'legacy') {
        // --- MODE ASAP LAMA (CLASSIC SIMPLE PUFFS) ---
        if (driftDegAbs > 12 && currentSpeed > 4.2 && smokeCfg.amount > 0) {
          if (frameCounter % 2 === 0) {
            dummyMatrix.position.copy(rlContactWorld);
            dummyMatrix.rotation.y = state.velocityAngle;
            dummyMatrix.updateMatrix();
            skidInstanced.setMatrixAt(skidIndex % maxSkids, dummyMatrix.matrix);
            skidIndex++;

            dummyMatrix.position.copy(rrContactWorld);
            dummyMatrix.rotation.y = state.velocityAngle;
            dummyMatrix.updateMatrix();
            skidInstanced.setMatrixAt(skidIndex % maxSkids, dummyMatrix.matrix);
            skidIndex++;
            skidInstanced.instanceMatrix.needsUpdate = true;
          }

          const legacyStrength = Math.min(
            1.25,
            ((driftDegAbs - 10) / 48) * (isTurboEngaged ? 1.3 : 1.0)
          );
          const spawnVelL = new THREE.Vector3(
            -carFwdX * 2.5 + carRightX * 1.1,
            0.75,
            -carFwdZ * 2.5 + carRightZ * 1.1
          );
          const spawnVelR = new THREE.Vector3(
            -carFwdX * 2.5 - carRightX * 1.1,
            0.75,
            -carFwdZ * 2.5 - carRightZ * 1.1
          );
          spawnRingSmokePuff({
            pos: rlContactWorld.clone().add(new THREE.Vector3(0, 0.14, 0)),
            vel: spawnVelL,
            strength: legacyStrength,
            isLegacy: true,
          });
          spawnRingSmokePuff({
            pos: rrContactWorld.clone().add(new THREE.Vector3(0, 0.14, 0)),
            vel: spawnVelR,
            strength: legacyStrength,
            isLegacy: true,
          });
        }
      } else {
        // --- MODE ASAP BARU: 5-STAGE DRIFT SMOKE PIPELINE ---
        // [STAGE 1: PEMICU (Trigger & Intensity)]
        const slipRad = wrapAngle(state.heading - state.velocityAngle);
        const absSlipRad = Math.abs(slipRad);
        // Lateral velocity |vl| = speed * sin(|slip|)
        const lateralVelAbs = Math.abs(currentSpeed * Math.sin(slipRad));
        const isOffTrack = Math.abs(lateralOffset) > halfWidth - 1.15;
        const isRacing = !state.sessionFinished;

        if (smokeCfg.triggerEngine === 'classic') {
          // Classic engine: enter drift if |vl| > 5 or (handbrake + speed > 6), exit if |vl| < 1.8
          if (lateralVelAbs > 5.0 || (brakePressed && currentSpeed > 6.0)) {
            smokeEmitterState.isDriftingHysteresis = true;
          } else if (lateralVelAbs < 1.8) {
            smokeEmitterState.isDriftingHysteresis = false;
          }
        } else {
          // Slip engine with hysteresis: enter drift if |slip| > 0.20 rad (~11°), exit if < 0.09 rad (~5°)
          if (absSlipRad > 0.20 && currentSpeed > 3.5) {
            smokeEmitterState.isDriftingHysteresis = true;
          } else if (absSlipRad < 0.09 || currentSpeed < 2.0) {
            smokeEmitterState.isDriftingHysteresis = false;
          }
        }

        const marking =
          smokeEmitterState.isDriftingHysteresis && !isOffTrack && isRacing;
        const shouldEmitSmoke =
          (marking || (isOffTrack && currentSpeed > 8.0)) && smokeCfg.amount > 0;

        // Calculate smoke intensity (0..1)
        let smokeIntensity =
          smokeCfg.triggerEngine === 'classic'
            ? Math.min(1, lateralVelAbs / 14.0)
            : Math.min(1, (absSlipRad / 0.7) * Math.min(1, currentSpeed / 12.0));

        if (isOffTrack && currentSpeed > 8.0) {
          smokeIntensity = Math.min(1, smokeIntensity + 0.3);
        }

        // Lay down tire skidmarks when marking on asphalt
        if (marking && frameCounter % 2 === 0) {
          dummyMatrix.position.copy(rlContactWorld);
          dummyMatrix.rotation.y = state.velocityAngle;
          dummyMatrix.updateMatrix();
          skidInstanced.setMatrixAt(skidIndex % maxSkids, dummyMatrix.matrix);
          skidIndex++;

          dummyMatrix.position.copy(rrContactWorld);
          dummyMatrix.rotation.y = state.velocityAngle;
          dummyMatrix.updateMatrix();
          skidInstanced.setMatrixAt(skidIndex % maxSkids, dummyMatrix.matrix);
          skidIndex++;
          skidInstanced.instanceMatrix.needsUpdate = true;
        }

        // [STAGE 2: EMISI — Dua Jalur Asap dengan Akumulator Frame-Rate Independent]
        if (shouldEmitSmoke) {
          // Jalur A — Slide Smoke (Asap Selip Utama): (34 + intensity * 46) * amount puff/detik
          const rateA = (34 + smokeIntensity * 46) * smokeCfg.amount;
          smokeEmitterState.slideAcc += dt * rateA;

          const slideSign = Math.sign(slipRad) || 1;
          // Throw direction: 3 units/s to opposite slide side + 2.5 units/s backward
          const throwSideX = carRightX * slideSign * 3.0;
          const throwSideZ = carRightZ * slideSign * 3.0;
          const throwBackX = -carFwdX * 2.5;
          const throwBackZ = -carFwdZ * 2.5;
          const puffStrength = 0.6 + smokeIntensity * 0.7;

          while (smokeEmitterState.slideAcc >= 1.0) {
            smokeEmitterState.slideAcc -= 1.0;
            // Randomly pick Rear Left or Rear Right tire contact point: posBan = posMobil + right*lx + forward*lz
            const useLeftTire = Math.random() < 0.5;
            const baseContact = useLeftTire ? rlContactWorld : rrContactWorld;
            const jitterX = (Math.random() - 0.5) * 0.22;
            const jitterZ = (Math.random() - 0.5) * 0.22;

            const spawnPos = new THREE.Vector3(
              baseContact.x + jitterX,
              0.12 + Math.random() * 0.08,
              baseContact.z + jitterZ
            );
            const spawnVel = new THREE.Vector3(
              throwSideX + throwBackX + (Math.random() - 0.5) * 1.4,
              0.95 + Math.random() * 0.65,
              throwSideZ + throwBackZ + (Math.random() - 0.5) * 1.4
            );

            spawnRingSmokePuff({
              pos: spawnPos,
              vel: spawnVel,
              strength: puffStrength,
              isSwirl: false,
            });
          }

          // Jalur B — Wheel-Spin Swirl (Asap yang Muter di Roda): (22 + intensity * 26) * amount puff/detik
          if (smokeCfg.wheelSpinSwirl && smokeEmitterState.isDriftingHysteresis) {
            const rateB = (22 + smokeIntensity * 26) * smokeCfg.amount;
            smokeEmitterState.swirlAcc += dt * rateB;
            const omegaVal = -Math.min(18, Math.abs(rearSpinRate) * 0.4);

            while (smokeEmitterState.swirlAcc >= 1.0) {
              smokeEmitterState.swirlAcc -= 1.0;
              const anchorIdx = Math.random() < 0.5 ? 0 : 1;
              const chosenAnchor = playerWheelAnchors[anchorIdx];
              const startContact = anchorIdx === 0 ? rlContactWorld : rrContactWorld;

              spawnRingSmokePuff({
                pos: startContact.clone(),
                vel: new THREE.Vector3(0, 0.8, 0),
                strength: puffStrength,
                isSwirl: true,
                anchor: chosenAnchor,
                omega: omegaVal,
              });
            }
          }
        }
      }

      // [STAGE 5: ANIMASI — Update Hidup Setiap Puff di Pool 640 per Frame]
      const tempSmokeColor = new THREE.Color();
      for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
        const slot = smokeRingPool[i];
        if (!slot.active) continue;

        slot.life += dt;
        if (slot.life >= slot.maxLife) {
          slot.active = false;
          slot.sprite.visible = false;
          slot.mat.opacity = 0;
          continue;
        }

        const t = slot.life / slot.maxLife; // Normalized age 0..1

        if (slot.isLegacy) {
          // Legacy animation curve
          slot.vel.x *= Math.pow(0.25, dt);
          slot.vel.z *= Math.pow(0.25, dt);
          slot.vel.y = THREE.MathUtils.lerp(slot.vel.y, 0.45, dt * 2.5);
          slot.sprite.position.addScaledVector(slot.vel, dt);
          slot.mat.rotation += slot.spin * dt;
          const legScale = THREE.MathUtils.lerp(
            slot.baseSize,
            slot.baseSize * 4.2,
            Math.pow(t, 0.65)
          );
          slot.sprite.scale.setScalar(legScale);
          const fadeIn = Math.min(1, t / 0.15);
          const fadeOut = Math.pow(1 - t, 1.5);
          slot.mat.opacity = slot.peakAlpha * fadeIn * fadeOut;
          continue;
        }

        // 1. Mengembang (Expand): grow = 1 - (1 - t)^2.2, scale = (0.6 + grow * 3.4) * size (~4x expansion!)
        const grow = 1 - Math.pow(1 - t, 2.2);
        const curScale = (0.6 + grow * 3.4) * slot.baseSize;
        slot.sprite.scale.setScalar(curScale);

        // 2. Opacity: fadeIn * (1 - t)^1.3 * alpha, with fadeIn = min(1, t * 8)
        const fadeIn = Math.min(1, t * 8.0);
        slot.mat.opacity = fadeIn * Math.pow(1 - t, 1.3) * slot.peakAlpha;

        // 3. Warna (Color Shift): lerp from colorFrom to colorTo by min(1, t * 1.6)
        const colorT = Math.min(1, t * 1.6);
        tempSmokeColor.copy(slot.colorFrom).lerp(slot.colorTo, colorT);
        slot.mat.color.copy(tempSmokeColor);

        // 4. Berputar (Spin): rotation += spin * dt
        slot.mat.rotation += slot.spin * dt;

        // 5. Gerak (Swirl Orbit Mode vs Free Buoyancy Mode)
        if (slot.isSwirling && slot.anchor) {
          slot.orbitTimeLeft -= dt;
          slot.swirlAngle += slot.omega * dt;
          slot.swirlRadius += 0.9 * dt; // Spiral melebar di sekitar ban

          // Recompute position from live WheelAnchor so orbit never lags behind fast car!
          const cosA = Math.cos(slot.swirlAngle);
          const sinA = Math.sin(slot.swirlAngle);
          const anchor = slot.anchor;

          slot.sprite.position.set(
            anchor.pos.x + anchor.forward.x * (cosA * slot.swirlRadius),
            Math.max(0.08, anchor.pos.y + sinA * slot.swirlRadius),
            anchor.pos.z + anchor.forward.z * (cosA * slot.swirlRadius)
          );

          if (slot.orbitTimeLeft <= 0) {
            // Detach from wheel orbit with tangential throw velocity + upward float
            slot.isSwirling = false;
            const tangSpeed = Math.min(5.5, Math.abs(slot.omega) * slot.swirlRadius * 0.55);
            const tangFwd = -sinA * Math.sign(slot.omega);
            const tangUp = cosA * Math.sign(slot.omega);

            slot.vel.set(
              anchor.forward.x * tangFwd * tangSpeed - anchor.forward.x * 1.8 + (Math.random() - 0.5),
              Math.max(0.65, tangUp * tangSpeed * 0.5 + 0.8),
              anchor.forward.z * tangFwd * tangSpeed - anchor.forward.z * 1.8 + (Math.random() - 0.5)
            );
          }
        } else {
          // Gerak Mode Bebas: horizontal air drag exp(-1.4 * dt), upward buoyancy vy >= 0.5
          const airDrag = Math.exp(-1.4 * dt);
          slot.vel.x *= airDrag;
          slot.vel.z *= airDrag;
          slot.vel.y = Math.max(0.5, slot.vel.y * Math.exp(-0.9 * dt));
          slot.sprite.position.addScaledVector(slot.vel, dt);
        }
      }

      // 7. AUTONOMOUS 5 PRO DRIFT ENEMY BOTS (KENJI, TAKASHI, RYOSUKE, TAKUMI, NAKAZATO) & 6-CAR RACE ENGINE
      // Active in Race, Tsuiso Tandem, and Free Drift so you can always battle, race, or trade paint!
      const showBots = curMode === 'race' || curMode === 'tsuiso' || curMode === 'freedrift';
      botRigs.forEach((rig) => {
        rig.root.visible = showBots;
      });
      tetherLine.visible = false;

      let tsuisoDistanceM = 99;
      let tsuisoSyncActive = false;

      if (showBots) {
        // Multi-sphere bounding volume helper for RC car body collision detection
        const getCarSpheres = (pos: THREE.Vector3, heading: number) => {
          const fwdX = Math.sin(heading);
          const fwdZ = Math.cos(heading);
          return [
            { offset: 1.05, center: new THREE.Vector3(pos.x + fwdX * 1.05, 0, pos.z + fwdZ * 1.05), radius: 0.88 },
            { offset: 0.0, center: new THREE.Vector3(pos.x, 0, pos.z), radius: 0.92 },
            { offset: -1.05, center: new THREE.Vector3(pos.x - fwdX * 1.05, 0, pos.z - fwdZ * 1.05), radius: 0.88 },
          ];
        };
        const playerSpheres = getCarSpheres(state.pos, state.heading);

        // Update each of the 5 autonomous enemy bots
        botStates.forEach((bState, bIdx) => {
          // A. Spline position & lap tracking
          const bClosest = findClosestSplineT(bState.pos);
          const bCrossedStart = bState.lastSplineT > 0.85 && bClosest.t < 0.15;
          if (bCrossedStart) {
            bState.lapCount++;
          }
          bState.lastSplineT = bClosest.t;
          bState.totalProgress = (bState.lapCount - 1) + bClosest.t;

          const bTrackPt = trackCurve.getPointAt(bClosest.t);
          const bTrackTan = trackCurve.getTangentAt(bClosest.t).normalize();
          const bTrackNorm = new THREE.Vector3(-bTrackTan.z, 0, bTrackTan.x);
          const bTrackAngle = Math.atan2(bTrackTan.x, bTrackTan.z);

          // B. Individual Curvature Lookahead (Calculated for THIS bot's position for organic, fluid movement)
          const bTanNear = trackCurve.getTangentAt((bClosest.t + 0.022) % 1).normalize();
          const bTanMid = trackCurve.getTangentAt((bClosest.t + 0.052) % 1).normalize();
          const bTanFar = trackCurve.getTangentAt((bClosest.t + 0.090) % 1).normalize();
          const bCurvNear = wrapAngle(Math.atan2(bTanNear.x, bTanNear.z) - bTrackAngle);
          const bCurvMid = wrapAngle(Math.atan2(bTanMid.x, bTanMid.z) - Math.atan2(bTanNear.x, bTanNear.z));
          const bCurvFar = wrapAngle(Math.atan2(bTanFar.x, bTanFar.z) - Math.atan2(bTanMid.x, bTanMid.z));
          const botCurvature = bCurvNear * 1.5 + bCurvMid * 1.8 + bCurvFar * 1.0;
          const isApproachingCorner = Math.abs(botCurvature) > 0.16;

          // C. Track Boundary & Deviation Detection (Intelligent Recovery System)
          const bToCenter = new THREE.Vector3().subVectors(bState.pos, bTrackPt);
          const bLatOffset = bToCenter.dot(bTrackNorm);
          const bLatDist = Math.abs(bLatOffset);
          const roadCorridorLimit = halfWidth - 0.70;
          const isOffTrack = bLatDist > roadCorridorLimit;
          const headingToTrackDiff = wrapAngle(bState.heading - bTrackAngle);
          const isFacingWrongWay = Math.abs(headingToTrackDiff) > Math.PI * 0.46;

          // Smooth continuous recovery factor (0 = normal race/drift mode, 1 = clean recovery mode)
          const targetRecovery = (isOffTrack || isFacingWrongWay) ? 1.0 : 0.0;
          bState.recoveryFactor = THREE.MathUtils.lerp(
            bState.recoveryFactor,
            targetRecovery,
            dt * (isOffTrack ? 4.8 : 3.2)
          );

          // D. Tactical Traffic Scanner & Situational Awareness (Smart Overtake, Defense & Slipstream)
          let carAhead: { pos: THREE.Vector3; distSpline: number; latOffset: number; isPlayer: boolean } | null = null;
          let carBehind: { distSpline: number; latOffset: number } | null = null;
          let minAheadDist = 0.075;
          let minBehindDist = -0.055;

          // Scan Player
          let pSplineDist = closest.t - bClosest.t;
          if (pSplineDist < -0.5) pSplineDist += 1;
          if (pSplineDist > 0.5) pSplineDist -= 1;
          if (pSplineDist > 0.003 && pSplineDist < minAheadDist) {
            minAheadDist = pSplineDist;
            const pToCenter = new THREE.Vector3().subVectors(state.pos, trackPt);
            carAhead = {
              pos: state.pos,
              distSpline: pSplineDist,
              latOffset: pToCenter.dot(trackNormal),
              isPlayer: true,
            };
          } else if (pSplineDist < -0.003 && pSplineDist > minBehindDist) {
            minBehindDist = pSplineDist;
            const pToCenter = new THREE.Vector3().subVectors(state.pos, trackPt);
            carBehind = {
              distSpline: pSplineDist,
              latOffset: pToCenter.dot(trackNormal),
            };
          }

          // Scan Other Bots
          botStates.forEach((otherB, oIdx) => {
            if (oIdx === bIdx) return;
            let oSplineDist = otherB.lastSplineT - bClosest.t;
            if (oSplineDist < -0.5) oSplineDist += 1;
            if (oSplineDist > 0.5) oSplineDist -= 1;
            if (oSplineDist > 0.003 && oSplineDist < minAheadDist) {
              minAheadDist = oSplineDist;
              const oToCenter = new THREE.Vector3().subVectors(otherB.pos, bTrackPt);
              carAhead = {
                pos: otherB.pos,
                distSpline: oSplineDist,
                latOffset: oToCenter.dot(bTrackNorm),
                isPlayer: false,
              };
            } else if (oSplineDist < -0.003 && oSplineDist > minBehindDist) {
              minBehindDist = oSplineDist;
              const oToCenter = new THREE.Vector3().subVectors(otherB.pos, bTrackPt);
              carBehind = {
                distSpline: oSplineDist,
                latOffset: oToCenter.dot(bTrackNorm),
              };
            }
          });

          // Drafting / Slipstream Pull
          if (carAhead && carAhead.distSpline < 0.040 && Math.abs(carAhead.latOffset - bState.currentLateralOffset) < 1.6) {
            bState.draftBoost = THREE.MathUtils.lerp(bState.draftBoost, 1.08, dt * 3.5);
          } else {
            bState.draftBoost = THREE.MathUtils.lerp(bState.draftBoost, 1.0, dt * 2.0);
          }

          // Tactical Decision-Making & Maneuver Offsets
          if (bState.recoveryFactor > 0.1) {
            bState.tacticalState = 'recovering';
            bState.overtakeTimer = 0;
            bState.overtakeOffset = THREE.MathUtils.lerp(bState.overtakeOffset, 0, dt * 4.0);
          } else if (carAhead && carAhead.distSpline < 0.055) {
            // Trailing closely: attempt intelligent overtake maneuver
            bState.overtakeTimer = Math.max(0, bState.overtakeTimer - dt);
            if (bState.overtakeTimer <= 0) {
              bState.overtakeTimer = 1.6 + Math.random() * 1.4;
              let chosenOvertakeOffset = 0;
              // Pass based on unique driver archetype:
              if (bState.def.style === 'apex_gutter') {
                // Takumi: Hunts the tight inside curb
                const insideDir = -Math.sign(botCurvature || 1);
                chosenOvertakeOffset = insideDir * (halfWidth * 0.48);
              } else if (bState.def.style === 'aggressive_dive') {
                // Kenji: Dives deep inside to trade paint
                chosenOvertakeOffset = -Math.sign(carAhead.latOffset || 1) * (halfWidth * 0.44);
              } else if (bState.def.style === 'smooth_momentum') {
                // Takashi: Sweeps around the outside with rolling momentum
                chosenOvertakeOffset = Math.sign(carAhead.latOffset || -1) * (halfWidth * 0.42);
              } else if (bState.def.style === 'tactical_cutter') {
                // Ryosuke: Analyzes open space, cuts opposite to leader's position
                chosenOvertakeOffset = (carAhead.latOffset > 0 ? -1 : 1) * (halfWidth * 0.40);
              } else {
                // Nakazato: Heavy power slide on dominant lateral line
                chosenOvertakeOffset = Math.sign(bState.def.lateralPreference || 1) * (halfWidth * 0.45);
              }
              bState.overtakeOffset = chosenOvertakeOffset;
            }
            bState.tacticalState = 'overtaking';
          } else if (bState.rank === 1 || (carBehind && carBehind.distSpline > -0.035)) {
            // Defending lead: subtly guard the inside line into upcoming corners
            const insideGuard = -Math.sign(botCurvature || 1) * (halfWidth * 0.26);
            bState.overtakeOffset = THREE.MathUtils.lerp(bState.overtakeOffset, insideGuard, dt * 2.8);
            bState.tacticalState = 'defending';
          } else {
            bState.overtakeOffset = THREE.MathUtils.lerp(bState.overtakeOffset, 0, dt * 2.0);
            bState.tacticalState = 'racing';
          }

          // E. Scandinavian Flick / Feint Drift Initiation (Authentic Pro RC Drifting)
          if (isApproachingCorner && bState.recoveryFactor < 0.1) {
            if (bState.feintTimer <= 0 && Math.random() < bState.def.feintDriftChance * dt * 2.5) {
              bState.feintTimer = 0.28;
              bState.feintPhase = Math.sign(botCurvature || 1); // counter-flick outward!
            }
          }
          let feintOffset = 0;
          if (bState.feintTimer > 0) {
            bState.feintTimer -= dt;
            bState.tacticalState = 'feint_entry';
            feintOffset = bState.feintPhase * (halfWidth * 0.28);
          }

          // F. Human-like Lap Variance & Micro-Steering Jitter
          const lapVariance = Math.sin(bState.lapCount * 4.3 + bIdx * 2.7) * (halfWidth * 0.20) * bState.def.lineWanderRate;
          const humanJitter = Math.sin(now * 0.0075 + bIdx * 11.3) * 0.024 * (1 - bState.recoveryFactor);

          // G. Clipping Zone Hunting & Smart Re-entry Waypoint
          let bFoundZoneOffset: number | null = null;
          for (const cz of circuit.clippingZones) {
            let distAhead = cz.t - bClosest.t;
            if (distAhead < -0.5) distAhead += 1;
            if (distAhead > 0.5) distAhead -= 1;
            if (distAhead >= -0.01 && distAhead <= 0.14) {
              const stagger = bIdx % 2 === 0 ? 0.35 : -0.35;
              bFoundZoneOffset = cz.offset * (halfWidth - 1.25) + stagger;
              break;
            }
          }

          // Smart Re-entry Waypoint: calculates an oblique forward merge target ahead on track (not a sharp 90° turn)
          const rejoinAheadStep = THREE.MathUtils.clamp(0.045 + (bLatDist / halfWidth) * 0.038, 0.042, 0.095);
          const rejoinT = (bClosest.t + rejoinAheadStep) % 1;
          const rejoinCenterPt = trackCurve.getPointAt(rejoinT);
          const rejoinTan = trackCurve.getTangentAt(rejoinT).normalize();
          const rejoinNorm = new THREE.Vector3(-rejoinTan.z, 0, rejoinTan.x);
          const safeRejoinOffset = THREE.MathUtils.clamp(-Math.sign(bLatOffset) * 0.85, -1.4, 1.4);
          const targetRejoinPt = rejoinCenterPt.clone().addScaledVector(rejoinNorm, safeRejoinOffset);

          // Normal racing line lateral offset factoring driving styles, tactical pass, feint flick, and lap variance
          const baseApexSwing = -Math.sign(botCurvature || 1) * (halfWidth * 0.40);
          const stylePreferenceOffset = bState.def.lateralPreference * (halfWidth * 0.32);
          const normalLateralTarget = (bFoundZoneOffset !== null ? bFoundZoneOffset : baseApexSwing)
            + stylePreferenceOffset
            + bState.overtakeOffset
            + feintOffset
            + lapVariance;

          bState.lateralOffsetTarget = THREE.MathUtils.lerp(normalLateralTarget, 0, bState.recoveryFactor);
          bState.currentLateralOffset = THREE.MathUtils.lerp(
            bState.currentLateralOffset,
            bState.lateralOffsetTarget,
            dt * (isOffTrack ? 5.5 : 4.0)
          );

          // Normal adaptive lookahead for on-track flow
          const lookAheadSpan = THREE.MathUtils.clamp(0.028 + (bState.speed / 28) * 0.018, 0.024, 0.048);
          const normalLookT = (bClosest.t + lookAheadSpan) % 1;
          const normalLookPt = trackCurve.getPointAt(normalLookT);
          const normalLookTan = trackCurve.getTangentAt(normalLookT).normalize();
          const normalLookNorm = new THREE.Vector3(-normalLookTan.z, 0, normalLookTan.x);
          const normalTargetPt = normalLookPt.clone().addScaledVector(normalLookNorm, bState.currentLateralOffset);

          // Seamlessly blend normal target point with smart rejoin waypoint based on recoveryFactor
          const targetWorldPt = normalTargetPt.clone().lerp(targetRejoinPt, bState.recoveryFactor);

          // H. Dynamic Adaptive Target Speed, Braking Profiles & Pack Balancing
          // Braking bias profiles:
          let cornerSlowdown = 1.0;
          if (bState.def.brakingBias === 'late') {
            cornerSlowdown = Math.max(0.88, 1.0 - Math.min(0.12, Math.abs(botCurvature) * 0.18));
          } else if (bState.def.brakingBias === 'early_apex') {
            cornerSlowdown = Math.max(0.82, 1.0 - Math.min(0.18, Math.abs(botCurvature) * 0.24));
          } else if (bState.def.brakingBias === 'trail') {
            cornerSlowdown = Math.max(0.86, 1.0 - Math.min(0.14, Math.abs(botCurvature) * 0.20));
          } else {
            cornerSlowdown = Math.max(0.85, 1.0 - Math.min(0.15, Math.abs(botCurvature) * 0.22));
          }

          const bBaseSpeed = curTuning.botPace === 'chill' ? bState.def.baseSpeed * 0.8 : bState.def.baseSpeed;

          // Dynamic competitive pack rubber-banding
          let splineGap = bClosest.t - closest.t;
          if (splineGap < -0.5) splineGap += 1;
          if (splineGap > 0.5) splineGap -= 1;
          const rubberBand = splineGap < -0.06 ? 1.08 : splineGap > 0.12 ? 0.95 : 1.02;

          // When off-track or facing wrong way, moderate pace smoothly to steer and regain grip cleanly
          const recoverySpeedFactor = THREE.MathUtils.lerp(1.0, isFacingWrongWay ? 0.46 : 0.78, bState.recoveryFactor);
          const targetAiSpeed = state.raceStarted
            ? bBaseSpeed * speedFactor * cornerSlowdown * rubberBand * recoverySpeedFactor * bState.draftBoost
            : 0;
          bState.speed = THREE.MathUtils.lerp(bState.speed, targetAiSpeed, dt * 5.0);

          // I. Fluid Proportional Steering & Velocity Direction with Human Micro-Corrections
          const toTargetVec = new THREE.Vector3().subVectors(targetWorldPt, bState.pos);
          const desiredVelAngle = Math.atan2(toTargetVec.x, toTargetVec.z);
          const velAngleError = wrapAngle(desiredVelAngle - bState.velocityAngle);
          const steerTurnRate = THREE.MathUtils.lerp(5.8, 8.5, bState.recoveryFactor);
          bState.velocityAngle = wrapAngle(bState.velocityAngle + (velAngleError + humanJitter) * steerTurnRate * dt);

          bState.vel.set(
            Math.sin(bState.velocityAngle) * bState.speed,
            0,
            Math.cos(bState.velocityAngle) * bState.speed
          );
          bState.pos.addScaledVector(bState.vel, dt);

          // J. Organic Drift Slip Angle & Style-Specific Counter-Steer
          const manjiWave = Math.abs(botCurvature) < 0.08 ? Math.sin((now + bIdx * 900) * 0.0055) * 0.28 : 0;
          // Slip angle scaled by driver's unique archetype driftAngleFactor
          const rawTargetSlip = (1 - bState.recoveryFactor) * THREE.MathUtils.clamp(
            (botCurvature * 2.3 * bState.def.driftAngleFactor) + manjiWave,
            -1.25,
            1.25
          );

          bState.smoothTargetSlip = THREE.MathUtils.lerp(bState.smoothTargetSlip, rawTargetSlip, dt * 5.5);

          let desiredHeading = wrapAngle(bState.velocityAngle + bState.smoothTargetSlip);
          if (isFacingWrongWay) {
            // Smooth rapid re-orientation towards forward track direction
            desiredHeading = bTrackAngle;
          }

          const headingTurnSpeed = isFacingWrongWay ? 10.5 : 7.2;
          const headingErr = wrapAngle(desiredHeading - bState.heading);
          bState.angularVel = THREE.MathUtils.lerp(bState.angularVel, headingErr * headingTurnSpeed, dt * 8.5);
          bState.heading = wrapAngle(bState.heading + bState.angularVel * dt);

          // K. Soft Elastic Boundary Cushion (Prevents Sticking / Teleporting)
          const maxTrackHalfWidth = halfWidth - 0.50;
          if (bLatDist > maxTrackHalfWidth) {
            const excess = bLatDist - maxTrackHalfWidth;
            const sgn = Math.sign(bLatOffset);
            // Progressive elastic cushion inward
            bState.pos.addScaledVector(bTrackNorm, -sgn * Math.min(0.06, excess * 0.25));
            // Dampen only the outward velocity component so the car drives inward freely
            const outwardSpeed = bState.vel.dot(bTrackNorm) * sgn;
            if (outwardSpeed > 0) {
              bState.vel.addScaledVector(bTrackNorm, -sgn * outwardSpeed * 1.35);
              bState.velocityAngle = Math.atan2(bState.vel.x, bState.vel.z);
            }
          }

          // L. Visual Transforms & Style-Specific Counter-Steer on 3D Car Rig
          if (isHarunaMap) bState.pos.y = bClosest.height + harunaRideHeight;
          bState.rig.root.position.copy(bState.pos);
          bState.rig.root.rotation.y = bState.heading;

          const bSlipSignedRad = wrapAngle(bState.heading - bState.velocityAngle);
          bState.driftDegSigned = THREE.MathUtils.radToDeg(bSlipSignedRad);
          bState.driftDegAbs = Math.abs(bState.driftDegSigned);

          const bCounterSteerTarget = THREE.MathUtils.clamp(
            -bSlipSignedRad * 1.05,
            -THREE.MathUtils.degToRad(75),
            THREE.MathUtils.degToRad(75)
          );
          // Counter-steer rate varies by driver archetype (Takumi 20.0 vs Takashi 14.0)
          bState.frontSteerAngle = THREE.MathUtils.lerp(bState.frontSteerAngle, bCounterSteerTarget, dt * bState.def.counterSteerRate);
          bState.rig.flKnuckle.rotation.y = bState.frontSteerAngle;
          bState.rig.frKnuckle.rotation.y = bState.frontSteerAngle;
          bState.rig.servoHorn.rotation.y = bState.frontSteerAngle * 0.8;
          bState.rig.coolingFan.rotation.y += dt * 35;

          // Dynamic Body Roll & Pitch (Scales with driver aggression)
          bState.rig.bodyShellGroup.rotation.z = THREE.MathUtils.lerp(
            bState.rig.bodyShellGroup.rotation.z,
            THREE.MathUtils.degToRad(Math.max(-5.0, Math.min(5.0, bState.driftDegSigned * 0.085 * (0.8 + bState.def.aggression * 0.4)))),
            dt * 9
          );
          bState.rig.bodyShellGroup.rotation.x = -0.02;

          // Turbo exhaust flames on hard drift
          bState.rig.turboSparkMesh.visible = bState.driftDegAbs > 26 && (frameCounter + bIdx) % 4 === 0;

          // Wobble-free wheel spinning
          bState.rig.spinAxles.forEach((axle, idx) => {
            const rate = idx < 2 ? bState.speed * 2.3 : bState.speed * 2.8 + 14;
            axle.rotation.x += rate * dt;
          });

          // J. Bot Tire Smoke & Skidmarks
          if (bState.driftDegAbs > 12 && bState.speed > 5) {
            const bFwdX = Math.sin(bState.heading);
            const bFwdZ = Math.cos(bState.heading);
            const bRightX = Math.cos(bState.heading);
            const bRightZ = -Math.sin(bState.heading);

            const bRL = new THREE.Vector3(
              bState.pos.x + bRightX * 0.84 + bFwdX * -1.08,
              bState.pos.y + 0.03,
              bState.pos.z + bRightZ * 0.84 + bFwdZ * -1.08
            );
            const bRR = new THREE.Vector3(
              bState.pos.x + bRightX * -0.84 + bFwdX * -1.08,
              bState.pos.y + 0.03,
              bState.pos.z + bRightZ * -0.84 + bFwdZ * -1.08
            );

            if ((frameCounter + bIdx) % 4 === 0) {
              dummyMatrix.position.copy(bRL);
              dummyMatrix.rotation.y = bState.velocityAngle;
              dummyMatrix.updateMatrix();
              skidInstanced.setMatrixAt(skidIndex % maxSkids, dummyMatrix.matrix);
              skidIndex++;

              dummyMatrix.position.copy(bRR);
              dummyMatrix.rotation.y = bState.velocityAngle;
              dummyMatrix.updateMatrix();
              skidInstanced.setMatrixAt(skidIndex % maxSkids, dummyMatrix.matrix);
              skidIndex++;
              skidInstanced.instanceMatrix.needsUpdate = true;
            }

            if (smokeCfg.amount > 0) {
              const botSmokeIntensity = Math.min(1, (Math.abs(bSlipSignedRad) / 0.7) * Math.min(1, bState.speed / 12.0));
              const botRate = (10 + botSmokeIntensity * 10) * smokeCfg.amount;
              bState.slideAcc += dt * botRate;

              const bSlideSign = Math.sign(bSlipSignedRad) || 1;
              while (bState.slideAcc >= 1.0) {
                bState.slideAcc -= 1.0;
                const baseTire = Math.random() < 0.5 ? bRL : bRR;
                const bSmokeVel = new THREE.Vector3(
                  bRightX * bSlideSign * 2.2 - bFwdX * 2.0 + (Math.random() - 0.5),
                  0.85 + Math.random() * 0.5,
                  bRightZ * bSlideSign * 2.2 - bFwdZ * 2.0 + (Math.random() - 0.5)
                );
                spawnRingSmokePuff({
                  pos: baseTire.clone().add(new THREE.Vector3(0, 0.12, 0)),
                  vel: bSmokeVel,
                  strength: botSmokeIntensity,
                  isSwirl: false,
                  isLegacy: smokeCfg.mode === 'legacy',
                });
              }
            }
          }

          // K. Silky-Smooth Two-Way Collision Physics (Player <-> Bot)
          bState.collisionCooldown = Math.max(0, bState.collisionCooldown - dt);
          const aiSpheres = getCarSpheres(bState.pos, bState.heading);

          let deepestOverlap = 0;
          let bestNormal = new THREE.Vector3(1, 0, 0);
          let contactPoint = new THREE.Vector3();
          let pHitOffset = 0;
          let aiHitOffset = 0;

          for (const ps of playerSpheres) {
            for (const as of aiSpheres) {
              const dx = ps.center.x - as.center.x;
              const dz = ps.center.z - as.center.z;
              const dist = Math.hypot(dx, dz);
              const minSep = ps.radius + as.radius;
              if (dist < minSep) {
                const overlap = minSep - dist;
                if (overlap > deepestOverlap) {
                  deepestOverlap = overlap;
                  if (dist > 0.0001) {
                    bestNormal.set(dx / dist, 0, dz / dist);
                  } else {
                    bestNormal.set(Math.sin(state.heading), 0, Math.cos(state.heading));
                  }
                  contactPoint.copy(ps.center).add(as.center).multiplyScalar(0.5);
                  contactPoint.y = state.pos.y + 0.42;
                  pHitOffset = ps.offset;
                  aiHitOffset = as.offset;
                }
              }
            }
          }

          if (deepestOverlap > 0) {
            // Smooth progressive positional separation (prevents visual snapping/jitter)
            const pushDist = Math.min(0.09, deepestOverlap * 0.38);
            state.pos.addScaledVector(bestNormal, pushDist * 0.5);
            bState.pos.addScaledVector(bestNormal, -pushDist * 0.5);

            const rvx = state.vel.x - bState.vel.x;
            const rvz = state.vel.z - bState.vel.z;
            const velAlongNormal = rvx * bestNormal.x + rvz * bestNormal.z;

            // Gentle elastic contact impulse with coefficient of restitution ~0.32
            const closingSpeed = -velAlongNormal; // > 0 when closing in
            const bounceImpulse = closingSpeed > 0 ? closingSpeed * 0.52 : 0;
            const contactSpring = Math.min(2.2, deepestOverlap * 3.2);
            const impulseMag = Math.min(6.8, bounceImpulse + contactSpring);

            state.vel.x += bestNormal.x * impulseMag;
            state.vel.z += bestNormal.z * impulseMag;

            bState.vel.x -= bestNormal.x * impulseMag;
            bState.vel.z -= bestNormal.z * impulseMag;

            const newPlayerSpd = state.vel.length();
            if (newPlayerSpd > 0.3) {
              currentSpeed = Math.min(maxSpeed * 1.15, newPlayerSpd);
              state.velocityAngle = Math.atan2(state.vel.x, state.vel.z);
            }

            const newAiSpd = bState.vel.length();
            if (newAiSpd > 0.3) {
              bState.speed = Math.min(26, newAiSpd);
              bState.velocityAngle = Math.atan2(bState.vel.x, bState.vel.z);
            }

            // Damped rotational deflection torque
            const pCross = Math.sin(state.heading) * bestNormal.z - Math.cos(state.heading) * bestNormal.x;
            const aiCross = Math.sin(bState.heading) * bestNormal.z - Math.cos(bState.heading) * bestNormal.x;
            state.angularVel = state.angularVel * 0.94 + pCross * pHitOffset * impulseMag * 0.085;
            bState.angularVel = bState.angularVel * 0.94 - aiCross * aiHitOffset * impulseMag * 0.090;

            // Zero-Lag Visual Sync: Update 3D meshes immediately so collision renders smoothly without 1-frame lag
            playerRig.root.position.copy(state.pos);
            playerRig.root.rotation.y = state.heading;
            bState.rig.root.position.copy(bState.pos);
            bState.rig.root.rotation.y = bState.heading;

            spawnCollisionSparks(contactPoint, impulseMag > 4.5 ? 7 : 4);

            if (bState.collisionCooldown <= 0) {
              bState.collisionCooldown = 0.28;
              rcSound.playCollisionSound(Math.min(1, impulseMag / 8));

              if (impulseMag < 5.0 && driftDegAbs > 12) {
                state.comboPoints += 200;
                triggerCallout(
                  `DOOR RUB! +200 WITH ${bState.def.shortName}`,
                  'AGGRESSIVE BATTLE PAINT TRADE',
                  'volt'
                );
              } else {
                triggerCallout(
                  `CLASH WITH ${bState.def.shortName}!`,
                  'DRIFT BATTLE CONTACT',
                  'amber'
                );
              }
            }
          }

          // L. Realistic Multi-Sphere Bot vs Bot Collision Physics (No Sticking, Elastic Separation)
          for (let j = bIdx + 1; j < botStates.length; j++) {
            const other = botStates[j];
            const otherSpheres = getCarSpheres(other.pos, other.heading);
            let botOverlap = 0;
            let botNormal = new THREE.Vector3(1, 0, 0);
            let botContactPt = new THREE.Vector3();
            let bHitA = 0;
            let bHitB = 0;

            for (const asA of aiSpheres) {
              for (const asB of otherSpheres) {
                const bdx = asA.center.x - asB.center.x;
                const bdz = asA.center.z - asB.center.z;
                const dist = Math.hypot(bdx, bdz);
                const minSep = asA.radius + asB.radius;
                if (dist < minSep) {
                  const ov = minSep - dist;
                  if (ov > botOverlap) {
                    botOverlap = ov;
                    if (dist > 0.0001) {
                      botNormal.set(bdx / dist, 0, bdz / dist);
                    } else {
                      botNormal.set(Math.sin(bState.heading), 0, Math.cos(bState.heading));
                    }
                    botContactPt.copy(asA.center).add(asB.center).multiplyScalar(0.5);
                    botContactPt.y = bState.pos.y + 0.42;
                    bHitA = asA.offset;
                    bHitB = asB.offset;
                  }
                }
              }
            }

            if (botOverlap > 0) {
              // Smooth progressive separation
              const botPush = Math.min(0.08, botOverlap * 0.35);
              bState.pos.addScaledVector(botNormal, botPush * 0.5);
              other.pos.addScaledVector(botNormal, -botPush * 0.5);

              const bRvx = bState.vel.x - other.vel.x;
              const bRvz = bState.vel.z - other.vel.z;
              const bVn = bRvx * botNormal.x + bRvz * botNormal.z;
              const bClosing = -bVn;
              const bBounce = bClosing > 0 ? bClosing * 0.48 : 0;
              const bSpring = Math.min(2.0, botOverlap * 3.0);
              const bImpulse = Math.min(6.2, bBounce + bSpring);

              bState.vel.x += botNormal.x * bImpulse;
              bState.vel.z += botNormal.z * bImpulse;
              other.vel.x -= botNormal.x * bImpulse;
              other.vel.z -= botNormal.z * bImpulse;

              const bSpdA = bState.vel.length();
              if (bSpdA > 0.3) {
                bState.speed = Math.min(26, bSpdA);
                bState.velocityAngle = Math.atan2(bState.vel.x, bState.vel.z);
              }
              const bSpdB = other.vel.length();
              if (bSpdB > 0.3) {
                other.speed = Math.min(26, bSpdB);
                other.velocityAngle = Math.atan2(other.vel.x, other.vel.z);
              }

              // Angular deflection torque
              const aCross = Math.sin(bState.heading) * botNormal.z - Math.cos(bState.heading) * botNormal.x;
              const bCross = Math.sin(other.heading) * botNormal.z - Math.cos(other.heading) * botNormal.x;
              bState.angularVel = bState.angularVel * 0.94 + aCross * bHitA * bImpulse * 0.08;
              other.angularVel = other.angularVel * 0.94 - bCross * bHitB * bImpulse * 0.08;

              if (bImpulse > 3.0 && (frameCounter + bIdx) % 3 === 0) {
                spawnCollisionSparks(botContactPt, 3);
              }

              // Immediately sync both bot rigs to avoid frame stutter
              bState.rig.root.position.copy(bState.pos);
              bState.rig.root.rotation.y = bState.heading;
              other.rig.root.position.copy(other.pos);
              other.rig.root.rotation.y = other.heading;
            }
          }
        });

        // I. Real-Time 6-Car Dynamic Rank Leaderboard Calculation
        const playerTotalProgress = (state.lapCount - 1) + closest.t;
        const allRacers: {
          id: string;
          name: string;
          shortName: string;
          isPlayer: boolean;
          progress: number;
          botRef: (typeof botStates)[0] | null;
        }[] = [
          { id: 'player', name: 'YOU', shortName: 'YOU', isPlayer: true, progress: playerTotalProgress, botRef: null },
          ...botStates.map((b) => ({
            id: b.def.id,
            name: b.def.name,
            shortName: b.def.shortName,
            isPlayer: false,
            progress: b.totalProgress,
            botRef: b,
          })),
        ];
        allRacers.sort((a, b) => b.progress - a.progress);

        const oldRank = state.raceRank;
        allRacers.forEach((r, idx) => {
          const rank = idx + 1;
          if (r.isPlayer) {
            state.raceRank = rank;
          } else if (r.botRef) {
            r.botRef.rank = rank;
          }
        });

        if (state.raceRank < oldRank && state.raceStarted) {
          const passedRacer = allRacers[oldRank - 1];
          triggerCallout(
            `⚡ OVERTAKE! P${state.raceRank} / 6`,
            passedRacer ? `PASSED ${passedRacer.shortName}!` : 'POSITION GAINED!',
            'volt'
          );
          rcSound.playClippingZoneChime(false);
        }

        // J. Tsuiso Laser Tether to Nearest Bot Ahead
        let closestAheadBot = botStates[0];
        let minAheadDist = Infinity;
        botStates.forEach((b) => {
          const dist = state.pos.distanceTo(b.pos);
          let diffT = b.lastSplineT - closest.t;
          if (diffT < -0.5) diffT += 1;
          if (diffT > 0.5) diffT -= 1;
          if (diffT > 0 && dist < minAheadDist) {
            minAheadDist = dist;
            closestAheadBot = b;
          }
        });

        activeLeadBot = closestAheadBot;
        const rawDist = state.pos.distanceTo(activeLeadBot.pos);
        tsuisoDistanceM = Number((rawDist * 0.42).toFixed(1));

        if (rawDist < 14.0 && driftDegAbs > 14) {
          tetherLine.visible = true;
          const pFront = state.pos.clone().add(new THREE.Vector3(0, 0.45, 0));
          const aiRear = activeLeadBot.pos.clone().add(new THREE.Vector3(0, 0.45, 0));
          tetherGeo.setFromPoints([pFront, aiRear]);

          tsuisoSyncActive = tsuisoDistanceM <= 3.5;
          tetherMat.color.set(tsuisoSyncActive ? '#CCFF00' : '#00F0FF');

          if (tsuisoSyncActive) {
            state.comboPoints += 260 * dt;
            state.comboMultiplier = Math.min(10, state.comboMultiplier + 0.38 * dt);
            if (frameCounter % 90 === 0) {
              triggerCallout(
                `TSUISO SYNC! (${tsuisoDistanceM}m)`,
                `MATCHING ${activeLeadBot.def.shortName} DRIFT ANGLE`,
                'volt'
              );
            }
          }
        }
      }

      // Update 3D Collision Sparks
      for (let i = sparkPool.length - 1; i >= 0; i--) {
        const spk = sparkPool[i];
        spk.life += dt;
        if (spk.life >= spk.maxLife) {
          scene.remove(spk.mesh);
          sparkPool.splice(i, 1);
        } else {
          spk.vel.y -= 18 * dt;
          spk.mesh.position.addScaledVector(spk.vel, dt);
        }
      }

      // Sakura life — kelopak beterbangan + dedaunan bergoyang lembut
      const timeSec = now * 0.001;
      for (let i = 0; i < petals.length; i++) {
        const p = petals[i];
        p.mesh.position.y -= p.vy * dt;
        p.mesh.position.x += Math.sin(timeSec * p.swaySpeed + p.swayPhase) * dt * 1.1;
        p.mesh.position.z += Math.cos(timeSec * p.swaySpeed * 0.8 + p.swayPhase) * dt * 0.7;
        p.mesh.rotation.x += p.rotSpeed * dt;
        p.mesh.rotation.y += p.rotSpeed * 0.7 * dt;
        if (p.mesh.position.y < 0.05) {
          const spot = sakuraSpots[(i + frameCounter) % sakuraSpots.length];
          p.mesh.position.set(
            spot[0] + (Math.random() - 0.5) * 10,
            5.5 + Math.random() * 2.5,
            spot[1] + (Math.random() - 0.5) * 8
          );
        }
      }
      for (let si = 0; si < sakuraSwayGroups.length; si++) {
        sakuraSwayGroups[si].rotation.z = Math.sin(timeSec * 0.7 + si * 1.3) * 0.012;
      }

      // 8. CLIPPING ZONE DETECTION & DRIFT SCORING ENGINE
      if (driftDegAbs >= 15 && currentSpeed > 4.5) {
        state.comboTimer = 1.6;
        const angleRate = Math.pow(driftDegAbs / 25, 1.35) * 95;
        const turboBonus = isTurboEngaged ? 1.35 : 1.0;
        state.comboPoints += angleRate * turboBonus * dt;
        state.comboMultiplier = Math.min(
          10.0,
          state.comboMultiplier + 0.14 * dt
        );

        const currentSign = Math.sign(driftDegSigned);
        if (
          state.previousDriftSign !== 0 &&
          currentSign !== 0 &&
          currentSign !== state.previousDriftSign &&
          driftDegAbs > 24 &&
          state.transitionCooldown <= 0
        ) {
          state.comboPoints += 300;
          state.comboMultiplier = Math.min(10.0, state.comboMultiplier + 0.5);
          state.transitionCooldown = 1.4;
          rcSound.playTransitionWhoosh();
          triggerCallout(
            'SKYLINE GYRO SNAP! +300',
            `${Math.round(driftDegAbs)}° RB26 TURBO FLUTTER`,
            'cyan'
          );
        }
        if (driftDegAbs > 22) {
          state.previousDriftSign = currentSign;
        }
      } else {
        state.comboTimer = Math.max(0, state.comboTimer - dt);
        if (state.comboTimer <= 0 && state.comboPoints > 0) {
          const banked = Math.round(state.comboPoints * state.comboMultiplier);
          state.sessionScore += banked;
          if (banked > state.maxComboAchieved) {
            state.maxComboAchieved = banked;
          }
          state.comboPoints = 0;
          state.comboMultiplier = 1.0;
          state.previousDriftSign = 0;
        }
      }
      state.transitionCooldown = Math.max(0, state.transitionCooldown - dt);

      clipZones3D.forEach((cz) => {
        const d = state.pos.distanceTo(cz.worldPos);
        if (
          d <= cz.radius &&
          driftDegAbs >= cz.minAngle &&
          !state.clippedThisLap.has(cz.id)
        ) {
          state.clippedThisLap.add(cz.id);
          state.totalClipsHit++;
          const isPerfect = driftDegAbs >= cz.minAngle + 15;
          const pts = isPerfect ? Math.round(cz.basePoints * 1.5) : cz.basePoints;
          state.comboPoints += pts;
          state.comboMultiplier = Math.min(10.0, state.comboMultiplier + 0.75);
          cz.hitPulse = 1.0;

          rcSound.playClippingZoneChime(isPerfect);
          triggerCallout(
            `${isPerfect ? 'PERFECT ' : ''}${cz.label}! +${pts}`,
            `${Math.round(driftDegAbs)}° LOCK // +0.75x MULTIPLIER`,
            isPerfect ? 'volt' : 'magenta'
          );
        }

        if (cz.hitPulse > 0) {
          cz.hitPulse = Math.max(0, cz.hitPulse - dt * 1.5);
          const s = 1 + (1 - cz.hitPulse) * 0.45;
          cz.ringMesh.scale.set(s, s, 1);
          (cz.ringMesh.material as THREE.MeshBasicMaterial).color.set('#CCFF00');
        } else {
          cz.ringMesh.scale.set(1, 1, 1);
        }
      });

      // 9. CAMERA CONTROLLER
      const camMode = cameraModeRef.current;
      if (camMode === 'isometric_broadcast') {
        const targetCamPos = new THREE.Vector3(
          state.pos.x * 0.68,
          23,
          state.pos.z * 0.68 + 24
        );
        camera.position.lerp(targetCamPos, dt * 5.5);
        const lookAtTarget = state.pos
          .clone()
          .addScaledVector(state.vel, 0.18);
        camera.lookAt(lookAtTarget.x, state.pos.y + 0.8, lookAtTarget.z);
      } else if (camMode === 'driver_stand') {
        const standPos = new THREE.Vector3(
          hallFrame.cx,
          13,
          hallFrame.cz + hallFrame.depth / 2 - 14
        );
        camera.position.lerp(standPos, dt * 4.0);
        camera.lookAt(state.pos.x * 0.88, state.pos.y + 0.6, state.pos.z * 0.88);
      } else {
        const chaseOffset = new THREE.Vector3(
          -Math.sin(state.velocityAngle) * 7.4,
          3.1,
          -Math.cos(state.velocityAngle) * 7.4
        );
        camera.position.lerp(state.pos.clone().add(chaseOffset), dt * 8.5);
        const lookAhead = state.pos
          .clone()
          .add(
            new THREE.Vector3(
              Math.sin(state.velocityAngle) * 4.0,
              0.7,
              Math.cos(state.velocityAngle) * 4.0
            )
          );
        camera.lookAt(lookAhead);
      }

      // Key light mengikuti mobil pemain. Haruna memakai arah matahari rendah barat-daya;
      // aula memakai key-light top-down yang lebih kontras.
      if (useHarunaWorld) {
        mainDirLight.position.set(state.pos.x - 92, 176, state.pos.z + 84);
      } else {
        mainDirLight.position.set(state.pos.x + 18, 42, state.pos.z + 24);
      }
      mainDirLight.target.position.copy(state.pos);
      harunaSky?.follow(camera.position);
      mainDirLight.target.updateMatrixWorld();

      renderer.render(scene, camera);

      if (frameCounter % 3 === 0) {
        const activeCallout =
          state.callout && now - state.callout.timestamp < 1900
            ? state.callout
            : null;

        telemetryCbRef.current({
          speedKmh: Math.round(currentSpeed * 1.65),
          scaleSpeedKmh: Math.round(currentSpeed * 16.5),
          rpm: Math.round(state.rpm),
          turboActive: state.turboActive,
          driftAngleDeg: Math.round(driftDegAbs),
          signedDriftAngle: Math.round(driftDegSigned),
          frontSteerDeg: Math.round(
            THREE.MathUtils.radToDeg(state.frontSteerAngle)
          ),
          gyroActivePct: Math.min(
            100,
            Math.round((Math.abs(state.frontSteerAngle) / maxSteerRad) * 100)
          ),
          sessionScore: Math.round(state.sessionScore),
          currentComboPoints: Math.round(state.comboPoints),
          comboMultiplier: Number(state.comboMultiplier.toFixed(1)),
          currentLap: state.lapCount,
          maxLaps: state.maxLaps,
          lapTimeSec: Number(((now - state.lapStartTime) / 1000).toFixed(1)),
          bestLapScore: Math.round(state.maxComboAchieved),
          clippedZoneIds: Array.from(state.clippedThisLap),
          tsuisoDistanceM,
          tsuisoSyncActive,
          racePosition: state.raceRank,
          totalRacers: 6,
          botRacers: botStates.map((b) => ({
            id: b.def.id,
            name: b.def.name,
            shortName: b.def.shortName,
            bodyId: b.def.bodyId,
            color: b.def.bodyColor,
            lap: b.lapCount,
            progress: b.totalProgress,
            rank: b.rank,
            x: b.pos.x,
            z: b.pos.z,
            headingRad: b.heading,
            speedKmh: Math.round(b.speed * 1.6),
            driftAngleDeg: Math.round(b.driftDegAbs),
            styleLabel: b.def.styleLabel,
            tacticalState: b.tacticalState,
          })),
          carX: state.pos.x,
          carZ: state.pos.z,
          carHeadingRad: state.heading,
          carVelocityRad: state.velocityAngle,
          leadCarX: activeLeadBot ? activeLeadBot.pos.x : leadRig.root.position.x,
          leadCarZ: activeLeadBot ? activeLeadBot.pos.z : leadRig.root.position.z,
          leadCarHeadingRad: activeLeadBot ? activeLeadBot.heading : aiState.heading,
          damperFL: state.damperFL,
          damperFR: state.damperFR,
          damperRL: state.damperRL,
          damperRR: state.damperRR,
          pitchSquatDeg: Number(state.suspPitchDeg.toFixed(1)),
          rollDeg: Number(state.suspRollDeg.toFixed(1)),
          judgeCallout: activeCallout,
        });
      }
    };

    animFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', handleResize);
      hdriRenderTarget?.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
      dioramaCarRigRef.current = null;
    };
  }, [circuit, resetTrigger, customization.bodyId, isMenu]);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full z-0 cursor-grab active:cursor-grabbing"
    />
  );
};
