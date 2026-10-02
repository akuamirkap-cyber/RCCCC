// =============================================================
//  DRIFT ENGINE — racikan pro-drifter untuk touge (Haruna/Akina)
//  + SAKURA RC DRIFT PRO (1:10 RWD — Yokomo YD-2 / MST RMX)
// =============================================================

export type DriftModeId = 'normal' | 'sedang' | 'pas' | 'best' | 'sakura'

export interface DriftTune {
  id: DriftModeId
  level: number
  name: string
  tag: string
  tagline: string
  desc: string
  tip: string
  color: string
  maxSpeed: number
  accel: number
  steerBase: number
  steerHB: number
  steerResponse: number
  authority: number
  highCut: number
  grip: number
  gripOff: number
  throttleCut: number
  hbGrip: number
  oversteer: number
  hbOversteer: number
  slideLoss: number
  hbSlideLoss: number
  throttleYaw: number
  counterAssist: number
  maxSlip: number
  hold: number
  isRC?: boolean
}

// ---------- Senyawa ban RC (Tire Compounds) ----------
export type TireId = 'hdpe' | 'poly' | 'soft'
export interface TireCompound {
  id: TireId
  name: string
  short: string
  desc: string
  gripMul: number // pengali grip lateral
  slideMul: number // pengali kemudahan slide
  color: string
}
export const TIRES: Record<TireId, TireCompound> = {
  hdpe: {
    id: 'hdpe',
    name: 'HDPE / P-Tile',
    short: 'HDPE',
    desc: 'Standar karpet · licin, slide panjang & stabil. Pilihan aman touge.',
    gripMul: 1.0,
    slideMul: 1.0,
    color: '#9aa4b2',
  },
  poly: {
    id: 'poly',
    name: 'Polycarbonate',
    short: 'POLY',
    desc: 'Sangat licin · angle gila, tapi butuh gyro tinggi biar ketangkep.',
    gripMul: 0.78,
    slideMul: 1.35,
    color: '#7cc7e8',
  },
  soft: {
    id: 'soft',
    name: 'Soft Rubber',
    short: 'SOFT',
    desc: 'Lengket · grip besar, drift pendek & cepat. Buat yang suka grip-run.',
    gripMul: 1.32,
    slideMul: 0.7,
    color: '#e8a34c',
  },
}
export const TIRE_ORDER: TireId[] = ['hdpe', 'poly', 'soft']

// ---------- Setup Pit Bench RC ----------
export interface RcSetup {
  gyroGain: number // 0-100 %
  maxSteerDeg: number // 55-80 ° high-angle knuckles
  tire: TireId
  escTurbo: number // 0-100 % turbo boost ESC
  casterDeg: number // 4-12 °
  camberDeg: number // 0..-8 ° (negatif)
  damperCst: number // 300-800 cSt
  springRate: number // 1-10 (lunak-keras)
}
export const DEFAULT_RC_SETUP: RcSetup = {
  gyroGain: 68,
  maxSteerDeg: 76,
  tire: 'hdpe',
  escTurbo: 60,
  casterDeg: 8,
  camberDeg: -4,
  damperCst: 500,
  springRate: 5,
}
export const RC_PRESETS: { name: string; desc: string; setup: RcSetup }[] = [
  {
    name: 'Street',
    desc: 'Jinak · gyro 55, HDPE, turbo 35',
    setup: { gyroGain: 55, maxSteerDeg: 68, tire: 'hdpe', escTurbo: 35, casterDeg: 7, camberDeg: -3, damperCst: 450, springRate: 4 },
  },
  {
    name: 'Touge',
    desc: 'Seimbang · gyro 68, HDPE, turbo 60',
    setup: { ...DEFAULT_RC_SETUP },
  },
  {
    name: 'Comp',
    desc: 'Liar · gyro 82, POLY, turbo 90',
    setup: { gyroGain: 82, maxSteerDeg: 80, tire: 'poly', escTurbo: 90, casterDeg: 10, camberDeg: -6, damperCst: 650, springRate: 7 },
  },
]

export function loadRcSetup(): RcSetup {
  try {
    const raw = localStorage.getItem('sakura_rc_setup')
    if (!raw) return { ...DEFAULT_RC_SETUP }
    const p = JSON.parse(raw)
    return {
      gyroGain: clampNum(p.gyroGain, 0, 100, DEFAULT_RC_SETUP.gyroGain),
      maxSteerDeg: clampNum(p.maxSteerDeg, 55, 80, DEFAULT_RC_SETUP.maxSteerDeg),
      tire: p.tire === 'poly' || p.tire === 'soft' || p.tire === 'hdpe' ? p.tire : 'hdpe',
      escTurbo: clampNum(p.escTurbo, 0, 100, DEFAULT_RC_SETUP.escTurbo),
      casterDeg: clampNum(p.casterDeg, 4, 12, DEFAULT_RC_SETUP.casterDeg),
      camberDeg: clampNum(p.camberDeg, -8, 0, DEFAULT_RC_SETUP.camberDeg),
      damperCst: clampNum(p.damperCst, 300, 800, DEFAULT_RC_SETUP.damperCst),
      springRate: clampNum(p.springRate, 1, 10, DEFAULT_RC_SETUP.springRate),
    }
  } catch {
    return { ...DEFAULT_RC_SETUP }
  }
}
function clampNum(v: unknown, lo: number, hi: number, fb: number) {
  const n = typeof v === 'number' ? v : fb
  return Math.min(hi, Math.max(lo, n))
}

export const DRIFT_TUNES: Record<DriftModeId, DriftTune> = {
  normal: {
    id: 'normal', level: 0, name: 'NORMAL', tag: 'NORMAL',
    tagline: 'Engine lama · grip',
    desc: 'Engine bawaan lama: grip tinggi, susah ngesot. Buat time-attack bersih.',
    tip: 'Rem + belok, gas pol keluar tikungan. Handbrake hampir tidak kepakai.',
    color: '#9aa4b2',
    maxSpeed: 61, accel: 15.5,
    steerBase: 1.75, steerHB: 2.35, steerResponse: 9, authority: 12, highCut: 0.55,
    grip: 6.2, gripOff: 3.6, throttleCut: 0.62, hbGrip: 1.0,
    oversteer: 1.0, hbOversteer: 1.35, slideLoss: 0.16, hbSlideLoss: 2.2,
    throttleYaw: 0.0, counterAssist: 0, maxSlip: 22, hold: 0,
  },
  sedang: {
    id: 'sedang', level: 1, name: 'SEDANG', tag: 'SEDANG',
    tagline: 'Street drift · jinak',
    desc: 'Mulai bisa buang pantat: setir lebih peka, gas ikut bantu muter. Enak buat belajar linking hairpin.',
    tip: 'Masuk kencang → jentik handbrake → counter + tahan gas setengah.',
    color: '#7cc24f',
    maxSpeed: 62, accel: 16.5,
    steerBase: 2.05, steerHB: 2.7, steerResponse: 10.5, authority: 11, highCut: 0.52,
    grip: 5.0, gripOff: 3.4, throttleCut: 0.55, hbGrip: 0.95,
    oversteer: 1.18, hbOversteer: 1.5, slideLoss: 0.13, hbSlideLoss: 1.9,
    throttleYaw: 0.35, counterAssist: 0.35, maxSlip: 17, hold: 0.35,
  },
  pas: {
    id: 'pas', level: 2, name: 'PAS', tag: 'PAS',
    tagline: 'Touge pro · seimbang',
    desc: 'Racikan pro paling seimbang: angle-kit, locked-diff feel, gas = pengatur sudut. Buat gutter-run & 5 hairpin.',
    tip: 'Late-brake → flick → gas tahan. Sudut diatur gas, garis diatur counter.',
    color: '#f0b429',
    maxSpeed: 64, accel: 17.5,
    steerBase: 2.45, steerHB: 3.0, steerResponse: 12, authority: 10, highCut: 0.5,
    grip: 4.3, gripOff: 3.2, throttleCut: 0.5, hbGrip: 0.85,
    oversteer: 1.35, hbOversteer: 1.65, slideLoss: 0.1, hbSlideLoss: 1.6,
    throttleYaw: 0.6, counterAssist: 0.65, maxSlip: 15.5, hold: 0.6,
  },
  best: {
    id: 'best', level: 3, name: 'BEST', tag: 'BEST',
    tagline: 'Pro spec · angle 60°',
    desc: 'Spec pro drifter terbaik: lock 60°, throttle-steer penuh, speed-loss minimal. Ngesot panjang, tetap ketangkep.',
    tip: 'Percaya gas: bejek untuk nambah angle, counter untuk meluruskan. Jangan angkat gas tiba-tiba.',
    color: '#ff5a3c',
    maxSpeed: 66, accel: 18.5,
    steerBase: 2.85, steerHB: 3.3, steerResponse: 13.5, authority: 9, highCut: 0.48,
    grip: 3.9, gripOff: 3.0, throttleCut: 0.48, hbGrip: 0.8,
    oversteer: 1.5, hbOversteer: 1.8, slideLoss: 0.075, hbSlideLoss: 1.4,
    throttleYaw: 0.85, counterAssist: 0.85, maxSlip: 14.5, hold: 0.8,
  },
  sakura: {
    id: 'sakura', level: 4, name: 'SAKURA RC', tag: 'SAKURA RC',
    tagline: '1:10 RWD · gyro + turbo',
    desc: 'Replika sasis YD-2/RMX: gyro elektronik, knuckle 76°, ban HDPE, ESC turbo. Rasa RC 1:10 di badan touge.',
    tip: 'Setir tipis-tipis, biar gyro yang ngecounter. Gas = turbo spool, lepas gas = stututu BOV.',
    color: '#ff7ad9',
    isRC: true,
    maxSpeed: 58, accel: 16.0,
    steerBase: 3.1, steerHB: 3.5, steerResponse: 14, authority: 8.5, highCut: 0.45,
    grip: 4.0, gripOff: 3.0, throttleCut: 0.5, hbGrip: 0.8,
    oversteer: 1.45, hbOversteer: 1.75, slideLoss: 0.085, hbSlideLoss: 1.5,
    throttleYaw: 1.0, counterAssist: 0, maxSlip: 16, hold: 0.85,
  },
}

export const DRIFT_ORDER: DriftModeId[] = ['normal', 'sedang', 'pas', 'best', 'sakura']
