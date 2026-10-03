export type GameMode = 'race' | 'tsuiso' | 'qualifying' | 'freedrift';

export type SpeedLevel = 'normal' | 'sedang' | '2x';

export type CameraMode = 'isometric_broadcast' | 'driver_stand' | 'chase_close';

/** Visual/road environment used by Sakura RC Pro. */
export type MapStyle = 'aula' | 'haruna';

export type BodyShellMode = 'painted' | 'translucent' | 'naked_chassis';

export type TireCompound = 'hdpe_ptile' | 'poly_slick' | 'silver_dot';

export type SoundMode = 'rb26_soundbox' | 'pro_brushless' | 'real_brushless_hd';

export type SmokeMode = 'new_pipeline' | 'legacy';

export type SmokeTriggerEngine = 'slip' | 'classic';

export type SmokePresetId = 'subtle' | 'normal' | 'heavy' | 'burnout' | 'custom';

export interface SmokeConfig {
  mode: SmokeMode;                  // 'new_pipeline' (5-Stage 640 Ring-Buffer + Swirl) vs 'legacy' (Mode Asap Lama)
  triggerEngine: SmokeTriggerEngine;// 'slip' (Hysteresis 0.20/0.09 rad) vs 'classic' (Lateral |vl| > 5)
  preset: SmokePresetId;
  amount: number;                   // 0.0 to 2.0 (0% - 200%) rate multiplier
  puffSize: number;                 // 0.4 to 2.0 base size multiplier
  lifetime: number;                 // 0.4 to 2.0 maxLife duration multiplier
  opacity: number;                  // 0.2 to 1.5 peak alpha multiplier
  rubberTint: number;               // 0.0 (clean white) to 1.0 (burnt rubber brown)
  wheelSpinSwirl: boolean;          // Jalur B: Wheel-spin swirl orbit around live WheelAnchor
}

export type SuspensionKitId =
  | 'axon_revoshock'
  | 'overdose_hg_ifs'
  | 'reved_rtune'
  | 'shibata_weight_shift';

export interface SuspensionSetup {
  kitId: SuspensionKitId;
  shockOilCst: number;      // 150 to 500 CST (#150 Soft Roll <-> #500 Stiff Competition)
  rearProSquat: number;     // 20 to 100 (%) - Active Rear Squat on throttle for forward traction bite
  frontCamberDeg: number;   // -12 to -3 (deg) - Front negative camber for contact patch at full lock
  rearCamberDeg: number;    // -6 to -1 (deg) - Rear negative camber for side-bite vs forward drive
  rideHeightMm: number;     // 4.0 to 8.0 (mm) - Scale chassis ground clearance
  rollSensitivity: number;  // 0.5 to 2.0 - Weight-shift body roll & dive amplitude
}

export type BotPace = 'pro' | 'chill';

export interface TuningSetup {
  gyroGain: number;         // 40 to 100 (%) - Counter-steer stability assist
  maxSteerAngle: number;    // 55 to 82 (deg) - High-angle Ackermann lock
  escTurboBoost: number;    // 15 to 100 (%) - High-RPM brushless turbo timing boost
  /** Sakura RC Pro Haruna/Akina driving feel controls. */
  accelerationPower?: number; // 65 to 140 (%) - Motor acceleration strength
  driftResponse?: number;     // 0 to 100 (%) - Willingness to rotate/hold angle
  throttleResponse?: number;  // 50 to 150 (%) - How quickly W builds motor output
  handlingAssist?: number;    // 0 to 100 (%) - Extra stability and line recovery
  tireCompound: TireCompound;
  autoThrottle: boolean;    // Assist steering only; throttle still requires W / throttle button
  speedLevel?: SpeedLevel;  // Normal, sedang, atau 2x speed profile
  botPace?: BotPace;        // AI rival pace: 'pro' (24.8) vs 'chill' (19.5)
  soundMode?: SoundMode;    // RB26DETT Scale Sound Module vs Silky Sensored Brushless
  smokeConfig?: SmokeConfig;// 5-Stage Drift Smoke Pipeline configuration
  suspension?: SuspensionSetup; // Pro 1:10 RC Drift Coilover & Geometry Setup
}

export type RCBodyId =
  | 'r34_skyline'
  | 'r32_skyline'
  | 's15_silvia'
  | 'rx7_fd3s'
  | 'ae86_trueno'
  | 'gr_supra';

export interface CarCustomization {
  bodyId: RCBodyId;
  bodyShellMode: BodyShellMode;
  bodyColor: string;
  chassisAnodizeColor: string;
  neonColor: string;
  wheelColor: string;
}

export interface ClippingZoneDef {
  id: string;
  label: string;
  type: 'outer_zone' | 'inner_clip' | 'wall_kiss';
  t: number;        // 0..1 normalized position along track spline
  offset: number;   // -1 (inner left) to +1 (outer right) across track width
  radius: number;   // Radius of zone in meters (1:10 scale arena units)
  minAngle: number; // Minimum drift angle in degrees to score
  basePoints: number;
}

export interface CircuitDef {
  id: string;
  name: string;
  jpName: string;
  subtitle: string;
  surfaceName: string;
  hallTheme: 'parquet_aula' | 'epoxy_hall' | 'carpet_convention';
  /** Haruna switches Sakura RC from the indoor arena to the outdoor touge scene. */
  mapStyle?: MapStyle;
  trackWidth: number;
  floorColor: string;
  gridColor: string;
  accentColor: string;
  controlPoints: [number, number][]; // [x, z] waypoints for closed CatmullRomCurve3
  clippingZones: ClippingZoneDef[];
  targetScoreQualifying: number;
}

export interface BotRacerTelemetry {
  id: string;
  name: string;
  shortName: string;
  bodyId: RCBodyId;
  color: string;
  lap: number;
  progress: number;
  rank: number;
  x: number;
  z: number;
  headingRad: number;
  speedKmh: number;
  driftAngleDeg: number;
  styleLabel?: string;
  tacticalState?: string;
}

export interface LiveTelemetry {
  speedKmh: number;          // Actual RC speed (e.g., 18 - 38 km/h)
  scaleSpeedKmh: number;     // 1:10 Scale speed (e.g., 180 - 380 km/h)
  rpm: number;               // Brushless motor RPM (e.g., 4,000 - 58,000 RPM)
  turboActive: boolean;      // True when ESC Turbo Boost timing engages
  driftAngleDeg: number;     // Slip angle in degrees (0 - 85)
  signedDriftAngle: number;  // Signed slip angle (-85 to +85)
  frontSteerDeg: number;     // Actual front wheel Ackermann angle (-80 to +80)
  gyroActivePct: number;     // How much the RC Gyro is actively counter-steering (0 - 100%)
  sessionScore: number;      // Total banked score
  currentComboPoints: number;// Unbanked active drift combo points
  comboMultiplier: number;   // 1.0x to 10.0x
  currentLap: number;
  maxLaps: number;
  lapTimeSec: number;
  bestLapScore: number;
  clippedZoneIds: string[];  // IDs of clipping zones hit in the current lap
  tsuisoDistanceM: number;   // Distance to Lead AI car in meters (Tsuiso mode)
  tsuisoSyncActive: boolean; // True when in close tandem proximity & matching angle
  racePosition?: number;     // 1 to 6 (Player's current rank in 6-car drift race)
  totalRacers?: number;      // 6
  botRacers?: BotRacerTelemetry[]; // 5 Enemy bot racers live positions & telemetry
  carX?: number;
  carZ?: number;
  carHeadingRad?: number;
  carVelocityRad?: number;
  leadCarX?: number;
  leadCarZ?: number;
  leadCarHeadingRad?: number;
  damperFL?: number;         // 0..100% Front-Left coilover compression stroke
  damperFR?: number;         // 0..100% Front-Right coilover compression stroke
  damperRL?: number;         // 0..100% Rear-Left coilover compression stroke
  damperRR?: number;         // 0..100% Rear-Right coilover compression stroke
  pitchSquatDeg?: number;    // Positive = Rear Squat on throttle, Negative = Front Nose Dive on brake
  rollDeg?: number;          // Dynamic lateral body roll angle in degrees
  judgeCallout: {
    text: string;
    subtext: string;
    color: 'cyan' | 'magenta' | 'volt' | 'amber';
    timestamp: number;
  } | null;
}

export interface SessionResult {
  mode: GameMode;
  circuitName: string;
  totalScore: number;
  maxCombo: number;
  maxAngleDeg: number;
  clipsHitCount: number;
  totalClipsPossible: number;
  tsuisoAvgProximityM: number;
  grade: 'S+' | 'S' | 'A' | 'B' | 'C';
  rcCreditsEarned: number;
  racePosition?: number;
  totalRacers?: number;
  podiumFinish?: boolean;
}
