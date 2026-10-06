import assert from 'node:assert/strict';
import { speedMpsToKmh, speedMpsToScaleKmh } from '../src/games/sakura_rc/utils/speedUnits.ts';

assert.equal(speedMpsToKmh(1), 3.6);
assert.equal(speedMpsToKmh(10), 36);
assert.equal(speedMpsToKmh(35), 126);
assert.equal(speedMpsToKmh(-10), 36, 'reverse speed should display as a positive magnitude');
assert.equal(speedMpsToKmh(Number.NaN), 0, 'non-finite speed should not leak into the HUD');
assert.equal(speedMpsToScaleKmh(10), 360, '1:10 equivalent is ten times actual km/h');

console.log('Speed unit tests passed: m/s → actual km/h and 1:10 scale km/h.');
