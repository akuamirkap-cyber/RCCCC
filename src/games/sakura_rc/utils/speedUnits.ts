/** Unit conversions for the driving simulation, whose world velocity is in metres per second. */
export const KMH_PER_MPS = 3.6;
export const RC_SCALE_SPEED_MULTIPLIER = 10;

/** Convert a speed magnitude from m/s to km/h. Reverse motion still displays as positive speed. */
export function speedMpsToKmh(speedMps: number): number {
  return Number.isFinite(speedMps) ? Math.abs(speedMps) * KMH_PER_MPS : 0;
}

/** Full-scale-equivalent speed for a 1:10 RC model. */
export function speedMpsToScaleKmh(speedMps: number): number {
  return speedMpsToKmh(speedMps) * RC_SCALE_SPEED_MULTIPLIER;
}
