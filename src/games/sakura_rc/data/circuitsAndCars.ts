import { Track as EbisuTrack, TRACK_WIDTH as EBISU_TRACK_WIDTH } from '../../ebisu/game/track';
import {
  CircuitDef,
  ClippingZoneDef,
  RCBodyId,
  SmokeConfig,
  SmokePresetId,
  SuspensionKitId,
  SuspensionSetup,
  TuningSetup,
} from '../types/rcDrift';

export const DEFAULT_SUSPENSION_SETUP: SuspensionSetup = {
  kitId: 'axon_revoshock',
  shockOilCst: 250,
  rearProSquat: 78,
  frontCamberDeg: -8.0,
  rearCamberDeg: -3.0,
  rideHeightMm: 5.5,
  rollSensitivity: 1.25,
};

export interface ProSuspensionKitSpec {
  id: SuspensionKitId;
  name: string;
  brandBadge: string;
  description: string;
  setup: SuspensionSetup;
}

export const PRO_SUSPENSION_KITS: ProSuspensionKitSpec[] = [
  {
    id: 'axon_revoshock',
    name: 'AXON REVOSHOCK II // YOKOMO BIG BORE SLF',
    brandBadge: 'KASHIMA COAT • #250 CST • TI-NITRIDE SHAFT',
    description:
      'World Championship D1-10 standard damper. Silky Kashima-coated cylinder with balanced front rotation and progressive rear side-bite.',
    setup: {
      kitId: 'axon_revoshock',
      shockOilCst: 250,
      rearProSquat: 78,
      frontCamberDeg: -8.0,
      rearCamberDeg: -3.0,
      rideHeightMm: 5.5,
      rollSensitivity: 1.25,
    },
  },
  {
    id: 'overdose_hg_ifs',
    name: 'OVERDOSE HG SPEC-3 // IFS PUSHROD ROCKER',
    brandBadge: 'INBOARD CANTILEVER PUSHROD • #350 CST',
    description:
      'Iconic Overdose GALM horizontal pushrod rocker-arm front suspension. Ultra-crisp front turn-in response with zero shock-tower air drag.',
    setup: {
      kitId: 'overdose_hg_ifs',
      shockOilCst: 350,
      rearProSquat: 70,
      frontCamberDeg: -9.5,
      rearCamberDeg: -2.5,
      rideHeightMm: 5.0,
      rollSensitivity: 1.1,
    },
  },
  {
    id: 'reved_rtune',
    name: 'RÊVE D R-TUNE PROGRESSIVE // PRO-SQUAT HRS',
    brandBadge: 'R-TUNE progressive SPRING • 92% REAR SQUAT',
    description:
      'Soft initial stroke compresses the rear suspension deep under throttle (Active Rear Squat) to launch out of hairpins & catch Tsuiso lead cars!',
    setup: {
      kitId: 'reved_rtune',
      shockOilCst: 200,
      rearProSquat: 92,
      frontCamberDeg: -7.5,
      rearCamberDeg: -3.5,
      rideHeightMm: 5.8,
      rollSensitivity: 1.45,
    },
  },
  {
    id: 'shibata_weight_shift',
    name: 'SHIBATA GRK // WEIGHT-SHIFT ROLL MOD',
    brandBadge: 'TWIN-SPRING HELPER • #150 CST • REAL-GRADE ROLL',
    description:
      'High-Roll-Center "Weight Shift" setup! Dramatic scale JDM body roll in corners, deep nose dive on braking & heavy rear squat on turbo boost.',
    setup: {
      kitId: 'shibata_weight_shift',
      shockOilCst: 150,
      rearProSquat: 96,
      frontCamberDeg: -6.5,
      rearCamberDeg: -4.0,
      rideHeightMm: 6.5,
      rollSensitivity: 1.85,
    },
  },
];

export const DEFAULT_SMOKE_CONFIG: SmokeConfig = {
  mode: 'new_pipeline',
  triggerEngine: 'slip',
  preset: 'normal',
  amount: 1.0,
  puffSize: 1.0,
  lifetime: 1.0,
  opacity: 0.9,
  rubberTint: 0.2,
  wheelSpinSwirl: true,
};

export const SMOKE_PRESETS: Record<
  Exclude<SmokePresetId, 'custom'>,
  { label: string; badge: string; config: Omit<SmokeConfig, 'mode' | 'triggerEngine'> }
> = {
  subtle: {
    label: 'Subtle 🌬️',
    badge: 'Light Indoor P-Tile Mist',
    config: {
      preset: 'subtle',
      amount: 0.5,
      puffSize: 0.75,
      lifetime: 0.75,
      opacity: 0.5,
      rubberTint: 0.05,
      wheelSpinSwirl: false,
    },
  },
  normal: {
    label: 'Normal 💨',
    badge: 'Balanced 2-Channel + Swirl',
    config: {
      preset: 'normal',
      amount: 1.0,
      puffSize: 1.0,
      lifetime: 1.0,
      opacity: 0.9,
      rubberTint: 0.2,
      wheelSpinSwirl: true,
    },
  },
  heavy: {
    label: 'Heavy 🌫️',
    badge: 'D1GP Pro Qualifying Cloud',
    config: {
      preset: 'heavy',
      amount: 1.45,
      puffSize: 1.25,
      lifetime: 1.25,
      opacity: 1.0,
      rubberTint: 0.35,
      wheelSpinSwirl: true,
    },
  },
  burnout: {
    label: 'Burnout 🔥',
    badge: '2x Rate • 1.5x Size • Burnt Rubber Tint',
    config: {
      preset: 'burnout',
      amount: 2.0,
      puffSize: 1.5,
      lifetime: 1.35,
      opacity: 1.15,
      rubberTint: 0.85,
      wheelSpinSwirl: true,
    },
  },
};

/**
 * EBISU DRIFT layout for Sakura RC — built from the exact same spline the Ebisu game drives on
 * (same control points, same Catmull-Rom tension, same 14 m width), densely sampled so the arena's
 * smoothing pass cannot alter the shape. Drift zones are the Ebisu zones mapped to clipping points.
 */
function buildEbisuCircuit(): CircuitDef {
  const track = new EbisuTrack();
  const dense = track.curve.getSpacedPoints(160).slice(0, 160);
  // clipping points = the 6 sharpest corners of the layout (local curvature peaks, well separated)
  const s = track.samples;
  const n = track.count;
  const peaks: { i: number; c: number }[] = [];
  for (let i = 0; i < n; i++) {
    const c = Math.abs(s[i].curv);
    if (c < 0.02) continue;
    let isPeak = true;
    for (let k = -20; k <= 20 && isPeak; k++) if (Math.abs(s[(i + k + n) % n].curv) > c) isPeak = false;
    if (isPeak) peaks.push({ i, c });
  }
  peaks.sort((x, y) => y.c - x.c);
  const chosen: { i: number; c: number }[] = [];
  for (const pk of peaks) {
    if (chosen.length >= 6) break;
    if (chosen.every((o) => Math.min((pk.i - o.i + n) % n, (o.i - pk.i + n) % n) > 45)) chosen.push(pk);
  }
  chosen.sort((x, y) => x.i - y.i);
  const types: ClippingZoneDef['type'][] = ['outer_zone', 'inner_clip', 'wall_kiss', 'inner_clip', 'outer_zone', 'wall_kiss'];
  return {
    id: 'ebisu_drift_circuit',
    name: 'EBISU DRIFT // PRO CIRCUIT (100% LAYOUT)',
    jpName: 'エビスサーキット ドリフトコース (ドリフトキング レイアウト)',
    subtitle: 'Start straight -> T1 sweeper -> tight hairpin -> esses -> back hairpin -> final banked sweeper — identical to Ebisu Drift',
    surfaceName: 'Ebisu uniform grey asphalt, 14 m wide',
    hallTheme: 'epoxy_hall',
    trackWidth: EBISU_TRACK_WIDTH,
    floorColor: '#3B4048',
    gridColor: '#4A5059',
    accentColor: '#FFB703',
    controlPoints: dense.map((p) => [Number(p.x.toFixed(2)), Number(p.z.toFixed(2))] as [number, number]),
    clippingZones: chosen.map((pk, i) => {
      const left = s[pk.i].curv > 0; // left-hand corner → outer edge is the right side (+1)
      const type = types[i % types.length];
      const inner = type === 'inner_clip';
      return {
        id: `eb${i + 1}`,
        label: `${left ? 'LEFT' : 'RIGHT'} ${pk.c > 0.06 ? 'HAIRPIN' : 'SWEEPER'} #${i + 1}`,
        type,
        t: pk.i / n,
        offset: (left ? 1 : -1) * (inner ? -0.6 : 0.7),
        radius: 5.0,
        minAngle: inner ? 24 : 30,
        basePoints: inner ? 500 : pk.c > 0.06 ? 900 : 700,
      };
    }),
    targetScoreQualifying: 11500,
  };
}

export const RC_CIRCUITS: CircuitDef[] = [
  buildEbisuCircuit(),
  {
    id: 'shibuya_ptile',
    name: 'TOKYO GRAND AULA // D1GP TSUKUBA TECHNICAL PRO',
    jpName: '東京体育館 RCドリフト特設ホール (テクニカル D1GP)',
    subtitle: 'Main Straight Furidashi -> Turn 1 High Bank -> Manji S-Chicane -> Infield Hairpin -> North Carousel -> Meihan Wall Kiss',
    surfaceName: 'Polished Aula Parquet + Pro P-Tile Mat',
    hallTheme: 'parquet_aula',
    trackWidth: 10.6,
    floorColor: '#2A1F18',
    gridColor: '#3E2E23',
    accentColor: '#00F0FF',
    // 33 precision technical waypoints: high-speed run-up, deep Turn 1 bank sweeper,
    // quick switchback Manji, slow infield hairpin, north carousel, S-chicanes, and wall-ride finish!
    controlPoints: [
      // 1. MAIN RUN-UP STRAIGHT (Start / Finish)
      [-32, -42],
      [-8, -43],
      [16, -43],
      [38, -41],

      // 2. TURN 1 INITIATION & HIGH-SPEED BANK (OZ-1 Sweeper)
      [58, -35],
      [72, -22],
      [76, -4],
      [70, 14],

      // 3. MANJI S-CHICANE (Switchback flick)
      [56, 26],
      [38, 22],
      [24, 10],

      // 4. INFIELD HAIRPIN #1 (CP-1 Deep Apex)
      [10, -2],
      [-6, -10],
      [-20, -6],
      [-24, 8],

      // 5. INFIELD EXIT & DOGLEG
      [-16, 22],
      [-2, 32],
      [14, 40],
      [28, 44],

      // 6. NORTH CAROUSEL (OZ-2 Wall Sweeper)
      [44, 46],
      [56, 52],
      [58, 60],
      [48, 66],
      [32, 66],
      [14, 64],
      [-4, 58],

      // 7. TECHNICAL MANJI S-CURVES (CP-2 & CP-3)
      [-20, 48],
      [-34, 36],
      [-44, 22],

      // 8. FINAL HAIRPIN & MEIHAN WALL RIDE (OZ-3 & CP-4)
      [-52, 6],
      [-58, -10],
      [-54, -26],
      [-44, -38],
    ],
    clippingZones: [
      {
        id: 'cz1',
        label: 'OZ-1 TURN 1 BANK SWEEPER',
        type: 'outer_zone',
        t: 0.22,
        offset: 0.70,
        radius: 5.0,
        minAngle: 28,
        basePoints: 600,
      },
      {
        id: 'cz2',
        label: 'CP-1 RAPID SWITCHBACK APEX',
        type: 'inner_clip',
        t: 0.35,
        offset: -0.62,
        radius: 4.6,
        minAngle: 28,
        basePoints: 550,
      },
      {
        id: 'cz3',
        label: 'CP-2 INFIELD HAIRPIN APEX',
        type: 'inner_clip',
        t: 0.46,
        offset: -0.65,
        radius: 4.8,
        minAngle: 32,
        basePoints: 700,
      },
      {
        id: 'cz4',
        label: 'OZ-2 NORTH OMEGA CAROUSEL',
        type: 'outer_zone',
        t: 0.65,
        offset: 0.72,
        radius: 5.2,
        minAngle: 30,
        basePoints: 650,
      },
      {
        id: 'cz5',
        label: 'CP-3 S-CHICANE FLICK',
        type: 'inner_clip',
        t: 0.84,
        offset: -0.60,
        radius: 4.6,
        minAngle: 26,
        basePoints: 500,
      },
      {
        id: 'cz6',
        label: 'OZ-3 MEIHAN WALL KISS',
        type: 'wall_kiss',
        t: 0.93,
        offset: 0.74,
        radius: 5.2,
        minAngle: 34,
        basePoints: 800,
      },
    ],
    targetScoreQualifying: 12000,
  },
  {
    id: 'yokohama_concrete',
    name: 'YOKOHAMA EXPO HALL // ODAIBA HIGH-SPEED',
    jpName: '横浜パシフィコ RCエキスポホール',
    subtitle: 'Full-Throttle RB26 Turbo Entry -> 180° Wall Ride -> Flowing S-Bend',
    surfaceName: 'High-Gloss Exhibition Hall Epoxy',
    hallTheme: 'epoxy_hall',
    trackWidth: 10.6,
    floorColor: '#1E2634',
    gridColor: '#2E3B4E',
    accentColor: '#FF2A85',
    controlPoints: [
      [-20, -35],
      [2, -36],
      [24, -35],
      [42, -27],
      [51, -11],
      [49, 9],
      [38, 25],
      [21, 31],
      [4, 24],
      [-12, 24],
      [-28, 31],
      [-43, 24],
      [-51, 8],
      [-50, -10],
      [-42, -25],
      [-32, -32],
    ],
    clippingZones: [
      {
        id: 'yk1',
        label: 'OZ-1 TURBO ENTRY',
        type: 'outer_zone',
        t: 0.22,
        offset: 0.68,
        radius: 5.0,
        minAngle: 28,
        basePoints: 550,
      },
      {
        id: 'yk2',
        label: 'OZ-2 WALL RIDE',
        type: 'wall_kiss',
        t: 0.38,
        offset: 0.72,
        radius: 5.0,
        minAngle: 34,
        basePoints: 750,
      },
      {
        id: 'yk3',
        label: 'CP-3 SWITCHBACK',
        type: 'inner_clip',
        t: 0.56,
        offset: -0.62,
        radius: 4.5,
        minAngle: 28,
        basePoints: 500,
      },
      {
        id: 'yk4',
        label: 'OZ-4 EXIT BANK',
        type: 'outer_zone',
        t: 0.76,
        offset: 0.68,
        radius: 4.8,
        minAngle: 28,
        basePoints: 550,
      },
    ],
    targetScoreQualifying: 10500,
  },
  {
    id: 'hakone_tabletop',
    name: 'AKIHABARA PRO HALL // MEIHAN TECHNICAL PRO',
    jpName: '秋葉原 インドアRCドリフトドーム (名阪Cコース・テクニカル)',
    subtitle: 'Meihan C-Course Wall Ride Initiation -> Flick Chicane -> Tight Pocket -> North Carousel -> Manji Finish',
    surfaceName: 'Polished Marble-Tile Hall & P-Tile',
    hallTheme: 'carpet_convention',
    trackWidth: 10.6,
    floorColor: '#1A202C',
    gridColor: '#2D3748',
    accentColor: '#CCFF00',
    controlPoints: [
      [-35, -38],
      [-10, -39],
      [15, -39],
      [35, -37],
      [54, -32],
      [66, -20],
      [68, -4],
      [58, 12],
      [40, 16],
      [24, 8],
      [8, -2],
      [-8, -6],
      [-18, 4],
      [-14, 18],
      [-2, 28],
      [14, 34],
      [32, 38],
      [48, 42],
      [56, 52],
      [46, 60],
      [28, 62],
      [8, 58],
      [-12, 50],
      [-28, 40],
      [-42, 28],
      [-52, 14],
      [-56, -4],
      [-50, -22],
      [-40, -34],
    ],
    clippingZones: [
      {
        id: 'hk1',
        label: 'OZ-1 MEIHAN WALL RIDE',
        type: 'wall_kiss',
        t: 0.22,
        offset: 0.74,
        radius: 5.0,
        minAngle: 30,
        basePoints: 750,
      },
      {
        id: 'hk2',
        label: 'CP-2 TIGHT POCKET APEX',
        type: 'inner_clip',
        t: 0.40,
        offset: -0.65,
        radius: 4.6,
        minAngle: 32,
        basePoints: 600,
      },
      {
        id: 'hk3',
        label: 'OZ-3 NORTH CAROUSEL',
        type: 'outer_zone',
        t: 0.65,
        offset: 0.72,
        radius: 5.2,
        minAngle: 30,
        basePoints: 700,
      },
      {
        id: 'hk4',
        label: 'CP-4 MANJI S-CHICANE',
        type: 'inner_clip',
        t: 0.82,
        offset: -0.62,
        radius: 4.8,
        minAngle: 28,
        basePoints: 550,
      },
      {
        id: 'hk5',
        label: 'OZ-5 MEIHAN EXIT WALL',
        type: 'wall_kiss',
        t: 0.92,
        offset: 0.75,
        radius: 5.0,
        minAngle: 32,
        basePoints: 750,
      },
    ],
    targetScoreQualifying: 11500,
  },
  {
    id: 'haruna_akina_downhill',
    name: 'HARUNA 榛名山 // MT. AKINA DOWNHILL 3D',
    jpName: '群馬県道33号 榛名山・秋名山ダウンヒル',
    subtitle: 'Real touge road • 5 consecutive hairpins • cinematic mountain light',
    surfaceName: 'Haruna asphalt, concrete gutter & guardrail',
    hallTheme: 'carpet_convention',
    mapStyle: 'haruna',
    // Same 10.4 m RC Pro road envelope as Tokyo Grand Aula; Haruna terrain and
    // centerline remain authentic, but the car does not feel squeezed by a narrow road.
    trackWidth: 10.4,
    floorColor: '#AEADA6',
    gridColor: '#CAC6B8',
    accentColor: '#E5C06A',
    // Visual fallback for the HUD; the 3D scene uses the authentic Haruna track runtime.
    controlPoints: [
      [0, 0],
      [280, 18],
      [440, -150],
      [260, -340],
      [-30, -420],
      [-280, -300],
      [-420, -70],
      [-360, 190],
      [-120, 350],
      [180, 430],
      [470, 320],
      [650, 80],
      [520, -170],
      [260, -250],
      [-40, -150],
      [-250, 40],
    ],
    clippingZones: [
      {
        id: 'haruna-hp1',
        label: 'HAIRPIN #1 // AKINA ENTRY',
        type: 'outer_zone',
        t: 0.42,
        offset: 0.78,
        radius: 4.6,
        minAngle: 24,
        basePoints: 700,
      },
      {
        id: 'haruna-hp3',
        label: 'HAIRPIN #3 // GUTTER CLIP',
        type: 'inner_clip',
        t: 0.47,
        offset: -0.78,
        radius: 4.4,
        minAngle: 28,
        basePoints: 850,
      },
      {
        id: 'haruna-hp5',
        label: 'HAIRPIN #5 // DEEP APEX',
        type: 'wall_kiss',
        t: 0.52,
        offset: 0.8,
        radius: 4.5,
        minAngle: 30,
        basePoints: 950,
      },
      {
        id: 'haruna-ikaho',
        label: 'IKAHO EXIT // OUTER RAIL',
        type: 'outer_zone',
        t: 0.78,
        offset: 0.72,
        radius: 4.8,
        minAngle: 26,
        basePoints: 650,
      },
    ],
    targetScoreQualifying: 12000,
  },
];

export type BotDrivingStyle =
  | 'aggressive_dive'
  | 'smooth_momentum'
  | 'tactical_cutter'
  | 'apex_gutter'
  | 'heavy_power';

export interface EnemyBotSpec {
  id: string;
  name: string;
  shortName: string;
  pilotName: string;
  bodyId: RCBodyId;
  bodyColor: string;
  anodizeColor: string;
  neonColor: string;
  wheelColor: string;
  baseSpeed: number;
  lateralPreference: number;
  startGridT: number;
  startGridOffset: number;
  avatarColor: string;
  // Distinct personality & driving styles:
  style: BotDrivingStyle;
  styleLabel: string;
  aggression: number; // 0.0 - 1.0 (dive-bomb, pass frequency, door rubbing)
  driftAngleFactor: number; // 0.85 - 1.35 (shallow slide vs deep angle)
  counterSteerRate: number; // snappiness of counter-steer transitions
  brakingBias: 'late' | 'balanced' | 'early_apex' | 'trail';
  overtakeTendency: number; // probability to break formation and overtake
  feintDriftChance: number; // Scandinavian flick pre-turn entry
  lineWanderRate: number; // procedural human line variation
}

export const ENEMY_BOTS_DATA: EnemyBotSpec[] = [
  {
    id: 'bot_kenji',
    name: 'KENJI // S15 SILVIA SPEC-R',
    shortName: 'KENJI (S15)',
    pilotName: 'Kenji S.',
    bodyId: 's15_silvia',
    bodyColor: '#FF2A85',
    anodizeColor: '#A855F7',
    neonColor: '#CCFF00',
    wheelColor: '#F8FAFC',
    baseSpeed: 25.0,
    lateralPreference: 0.35,
    startGridT: 0.008,
    startGridOffset: 2.2, // Row 1 Left
    avatarColor: '#FF2A85',
    style: 'aggressive_dive',
    styleLabel: 'LATE-BRAKER DIVE-BOMB',
    aggression: 0.88,
    driftAngleFactor: 1.25,
    counterSteerRate: 18.0,
    brakingBias: 'late',
    overtakeTendency: 0.86,
    feintDriftChance: 0.65,
    lineWanderRate: 0.42,
  },
  {
    id: 'bot_takashi',
    name: 'TAKASHI // RX-7 FD3S TWIN-TURBO',
    shortName: 'TAKASHI (FD3S)',
    pilotName: 'Takashi M.',
    bodyId: 'rx7_fd3s',
    bodyColor: '#FF6B00',
    anodizeColor: '#F59E0B',
    neonColor: '#00F0FF',
    wheelColor: '#1E293B',
    baseSpeed: 25.5,
    lateralPreference: -0.35,
    startGridT: -0.006,
    startGridOffset: -2.2, // Row 2 Right
    avatarColor: '#FF6B00',
    style: 'smooth_momentum',
    styleLabel: 'HIGH-MOMENTUM SWEEPER',
    aggression: 0.62,
    driftAngleFactor: 1.05,
    counterSteerRate: 14.0,
    brakingBias: 'trail',
    overtakeTendency: 0.72,
    feintDriftChance: 0.35,
    lineWanderRate: 0.28,
  },
  {
    id: 'bot_ryosuke',
    name: 'RYOSUKE // SUPRA 2JZ PRO DRIFT',
    shortName: 'RYOSUKE (SUPRA)',
    pilotName: 'Ryosuke T.',
    bodyId: 'gr_supra',
    bodyColor: '#DC2626',
    anodizeColor: '#FBBF24',
    neonColor: '#F59E0B',
    wheelColor: '#FFFFFF',
    baseSpeed: 25.2,
    lateralPreference: 0.25,
    startGridT: -0.012,
    startGridOffset: 2.2, // Row 2 Left
    avatarColor: '#DC2626',
    style: 'tactical_cutter',
    styleLabel: 'ANALYTICAL APEX CUTTER',
    aggression: 0.76,
    driftAngleFactor: 1.12,
    counterSteerRate: 16.0,
    brakingBias: 'balanced',
    overtakeTendency: 0.92,
    feintDriftChance: 0.48,
    lineWanderRate: 0.22,
  },
  {
    id: 'bot_takumi',
    name: 'TAKUMI // AE86 TRUENO 4A-GE',
    shortName: 'TAKUMI (AE86)',
    pilotName: 'Takumi F.',
    bodyId: 'ae86_trueno',
    bodyColor: '#F8FAFC',
    anodizeColor: '#38BDF8',
    neonColor: '#38BDF8',
    wheelColor: '#0F172A',
    baseSpeed: 25.3,
    lateralPreference: -0.42,
    startGridT: -0.024,
    startGridOffset: -2.2, // Row 3 Right
    avatarColor: '#38BDF8',
    style: 'apex_gutter',
    styleLabel: 'TIGHT GUTTER RUNNER',
    aggression: 0.84,
    driftAngleFactor: 1.20,
    counterSteerRate: 20.0,
    brakingBias: 'early_apex',
    overtakeTendency: 0.88,
    feintDriftChance: 0.82,
    lineWanderRate: 0.35,
  },
  {
    id: 'bot_nakazato',
    name: 'NAKAZATO // SKYLINE R32 GT-R',
    shortName: 'NAKAZATO (R32)',
    pilotName: 'Takeshi N.',
    bodyId: 'r32_skyline',
    bodyColor: '#7C3AED',
    anodizeColor: '#EC4899',
    neonColor: '#A855F7',
    wheelColor: '#CBD5E1',
    baseSpeed: 24.8,
    lateralPreference: 0.20,
    startGridT: -0.030,
    startGridOffset: 2.2, // Row 3 Left
    avatarColor: '#7C3AED',
    style: 'heavy_power',
    styleLabel: 'HEAVY POWER SLIDER',
    aggression: 0.94,
    driftAngleFactor: 1.32,
    counterSteerRate: 15.0,
    brakingBias: 'late',
    overtakeTendency: 0.80,
    feintDriftChance: 0.22,
    lineWanderRate: 0.40,
  },
];

export interface RCBodySpec {
  id: RCBodyId;
  name: string;
  chassisCode: string;
  brandTag: string;
  description: string;
  defaultColor: string;
  defaultAnodize: string;
  defaultNeon: string;
  stats: {
    rotationSnap: number;
    rearTraction: number;
    tandemStability: number;
  };
}

export const RC_BODIES: RCBodySpec[] = [
  {
    id: 'r34_skyline',
    name: 'BMW M3 DRIFT COUPE (GLB)',
    chassisCode: 'RDX // YD-2RX BMW SPEC',
    brandTag: 'BMW M3 GLB 1:10 RC BODY',
    description:
      'Authentic BMW M3 3D GLB body shell (lebar 1.88m & panjang 3.74m) dengan tekstur asli, aero splitter, dan handling presisi RWD RC.',
    defaultColor: '#0E64FF',
    defaultAnodize: '#F59E0B',
    defaultNeon: '#00F0FF',
    stats: {
      rotationSnap: 96,
      rearTraction: 97,
      tandemStability: 98,
    },
  },
  {
    id: 'r32_skyline',
    name: 'NISSAN SKYLINE GT-R (BNR32) GODZILLA',
    chassisCode: 'GALM // D1GP TSUISO SPEC',
    brandTag: 'GROUP-A / D1 STREET LEGAL',
    description:
      'Classic R32 Godzilla boxy coupe silhouette with quad round afterburner tail lamps and ultra-snappy mid-corner gyro rotation.',
    defaultColor: '#475569',
    defaultAnodize: '#F59E0B',
    defaultNeon: '#CCFF00',
    stats: {
      rotationSnap: 98,
      rearTraction: 94,
      tandemStability: 95,
    },
  },
  {
    id: 's15_silvia',
    name: 'NISSAN S15 SILVIA SPEC-R',
    chassisCode: 'RDX // YD-2ZS PRO',
    brandTag: 'D1GP COMPETITION LEXAN',
    description:
      'Long wheelbase rear overhang with aggressive GT wing for rock-solid high-angle sweepers.',
    defaultColor: '#FF2A85',
    defaultAnodize: '#A855F7',
    defaultNeon: '#00F0FF',
    stats: {
      rotationSnap: 90,
      rearTraction: 94,
      tandemStability: 96,
    },
  },
  {
    id: 'rx7_fd3s',
    name: 'MAZDA RX-7 FD3S RE-SPEC',
    chassisCode: 'GALM // OVERDOSE',
    brandTag: 'ROTARY WIDEBODY AERO',
    description:
      'Low-slung wide track width with snappy mid-corner rotation and twin-canard front grip.',
    defaultColor: '#CCFF00',
    defaultAnodize: '#EF4444',
    defaultNeon: '#CCFF00',
    stats: {
      rotationSnap: 97,
      rearTraction: 89,
      tandemStability: 92,
    },
  },
  {
    id: 'ae86_trueno',
    name: 'TOYOTA AE86 TRUENO D-SPEC',
    chassisCode: 'RD2.0 // LIGHTWEIGHT',
    brandTag: 'TOUGE FACTORY HATCH',
    description:
      'Ultra-light Lexan shell with instant gyro direction change and classic pop-up LED headlights.',
    defaultColor: '#F8FAFC',
    defaultAnodize: '#F59E0B',
    defaultNeon: '#00F0FF',
    stats: {
      rotationSnap: 99,
      rearTraction: 86,
      tandemStability: 90,
    },
  },
  {
    id: 'gr_supra',
    name: 'GR SUPRA A90 WIDEBODY',
    chassisCode: 'MD2.0 // CARBON WORKS',
    brandTag: 'FORMULA DRIFT PRO',
    description:
      'Maximum rear diffuser downforce for high-RPM ESC Turbo entries and Tsuiso proximity chases.',
    defaultColor: '#00F0FF',
    defaultAnodize: '#00F0FF',
    defaultNeon: '#FF2A85',
    stats: {
      rotationSnap: 92,
      rearTraction: 98,
      tandemStability: 95,
    },
  },
];

export interface TuningPreset {
  id: string;
  name: string;
  subtitle: string;
  setup: TuningSetup;
}

export const HARUNA_DRIVING_PRESETS: TuningPreset[] = [
  {
    id: 'haruna_beginner_stable',
    name: 'HARUNA BEGINNER // STABLE',
    subtitle: 'Akselerasi lembut, throttle jinak, dan assist tinggi untuk hairpin yang nyaman.',
    setup: {
      gyroGain: 94,
      maxSteerAngle: 68,
      escTurboBoost: 55,
      accelerationPower: 78,
      driftResponse: 28,
      throttleResponse: 70,
      handlingAssist: 88,
      tireCompound: 'silver_dot',
      autoThrottle: false,
      speedLevel: 'normal',
      soundMode: 'rb26_soundbox',
    },
  },
  {
    id: 'haruna_downhill_balanced',
    name: 'HARUNA DOWNHILL // BALANCED',
    subtitle: 'Setup saran: progresif di turunan, tetap bisa drift, dan mudah dikoreksi.',
    setup: {
      gyroGain: 86,
      maxSteerAngle: 74,
      escTurboBoost: 72,
      accelerationPower: 100,
      driftResponse: 55,
      throttleResponse: 100,
      handlingAssist: 58,
      tireCompound: 'hdpe_ptile',
      autoThrottle: false,
      speedLevel: 'normal',
      soundMode: 'rb26_soundbox',
    },
  },
  {
    id: 'haruna_pro_drift',
    name: 'HARUNA PRO // AGGRESSIVE DRIFT',
    subtitle: 'Rotasi dan throttle cepat untuk entry hairpin besar; assist lebih ringan.',
    setup: {
      gyroGain: 72,
      maxSteerAngle: 80,
      escTurboBoost: 92,
      accelerationPower: 125,
      driftResponse: 90,
      throttleResponse: 135,
      handlingAssist: 22,
      tireCompound: 'poly_slick',
      autoThrottle: false,
      speedLevel: 'sedang',
      soundMode: 'rb26_soundbox',
    },
  },
  {
    id: 'haruna_grip_fast',
    name: 'HARUNA GRIP // FAST',
    subtitle: 'Ban lebih menggigit, akselerasi tinggi, dan line recovery untuk pace cepat.',
    setup: {
      gyroGain: 90,
      maxSteerAngle: 70,
      escTurboBoost: 88,
      accelerationPower: 132,
      driftResponse: 15,
      throttleResponse: 142,
      handlingAssist: 72,
      tireCompound: 'silver_dot',
      autoThrottle: false,
      speedLevel: '2x',
      soundMode: 'pro_brushless',
    },
  },
];

export const TUNING_PRESETS: TuningPreset[] = [
  {
    id: 'pro_allrounder',
    name: 'RÊVE D RDX // SKYLINE PRO',
    subtitle: 'Balanced 80% Gyro & Smooth P-Tile Slide (Recommended)',
    setup: {
      gyroGain: 80,
      maxSteerAngle: 74,
      escTurboBoost: 70,
      tireCompound: 'hdpe_ptile',
      autoThrottle: false,
      soundMode: 'rb26_soundbox',
    },
  },
  {
    id: 'hypercasual_onehand',
    name: 'GYRO MAX // 1-HAND ARCADE',
    subtitle: 'Auto-Throttle + 92% Gyro Assist for Effortless 1-Thumb Drifting',
    setup: {
      gyroGain: 92,
      maxSteerAngle: 76,
      escTurboBoost: 75,
      tireCompound: 'hdpe_ptile',
      autoThrottle: true,
      soundMode: 'rb26_soundbox',
    },
  },
  {
    id: 'overdose_angle',
    name: 'OVERDOSE GALM // 80° REVERSE ENTRY',
    subtitle: 'Extreme 80° Ackermann Lock + 100% ESC Turbo Boost',
    setup: {
      gyroGain: 68,
      maxSteerAngle: 80,
      escTurboBoost: 95,
      tireCompound: 'poly_slick',
      autoThrottle: false,
      soundMode: 'rb26_soundbox',
    },
  },
  {
    id: 'tsuiso_grip',
    name: 'YOKOMO MD2.0 // TSUISO CHASE',
    subtitle: 'Fast Forward Bite with Silver-Dot Compound to Catch Lead Cars',
    setup: {
      gyroGain: 82,
      maxSteerAngle: 72,
      escTurboBoost: 85,
      tireCompound: 'silver_dot',
      autoThrottle: false,
      soundMode: 'rb26_soundbox',
    },
  },
];
