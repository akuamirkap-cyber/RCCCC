import type { CarCustomization, TuningSetup } from '../types/rcDrift';
import { DEFAULT_SMOKE_CONFIG, DEFAULT_SUSPENSION_SETUP } from './circuitsAndCars';

/** Authentic 1:10 RWD RC Drift tuning defaults (shared by the game and the DRIFT KING showroom backdrop). */
export const DEFAULT_TUNING: TuningSetup = {
  gyroGain: 82,
  maxSteerAngle: 76,
  escTurboBoost: 78,
  // Haruna/Akina feel controls: Sakura RC Pro remains manual and still needs W.
  accelerationPower: 100,
  driftResponse: 55,
  throttleResponse: 100,
  handlingAssist: 35,
  tireCompound: 'hdpe_ptile',
  // Gas harus selalu diberi lewat W / tombol throttle; tidak auto-maju saat idle.
  autoThrottle: false,
  speedLevel: 'normal',
  cornerSpeedLock: true,
  soundMode: 'rb26_soundbox',
  smokeConfig: DEFAULT_SMOKE_CONFIG,
  suspension: DEFAULT_SUSPENSION_SETUP,
};

/** Default car: Nissan Skyline GT-R (BNR34) in Iconic Bayside Blue (the Ebisu map swaps in the native-paint BMW). */
export const DEFAULT_CUSTOMIZATION: CarCustomization = {
  bodyId: 'r34_skyline',
  bodyShellMode: 'painted',
  bodyColor: '#0E64FF',
  chassisAnodizeColor: '#F59E0B',
  neonColor: '#00F0FF',
  wheelColor: '#F8FAFC',
  underglowMode: 'steady',
  underglowIntensity: 0.8,
};
