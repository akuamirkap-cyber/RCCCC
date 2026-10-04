import { RCDriftCanvas3D } from './RCDriftCanvas3D';
import { RC_CIRCUITS } from '../data/circuitsAndCars';
import { DEFAULT_CUSTOMIZATION, DEFAULT_TUNING } from '../data/defaults';

const EBISU = RC_CIRCUITS.find((c) => c.id === 'ebisu_drift_circuit') ?? RC_CIRCUITS[0];
const noop = () => {};

/**
 * Backdrop of the DRIFT KING main menu: the Sakura RC game itself on the Ebisu circuit — full venue, the Sakura
 * car parked on the grid, static showroom camera with the same framing as Ebisu Drift's menu (nose to screen-right).
 */
export function SakuraShowroom() {
  return (
    <div className="absolute inset-0" aria-hidden>
      <RCDriftCanvas3D
        circuit={EBISU}
        tuning={DEFAULT_TUNING}
        customization={DEFAULT_CUSTOMIZATION}
        gameMode="race"
        cameraMode="chase_close"
        resetTrigger={0}
        isMenu
        menuShowroom
        externalSteer={0}
        externalThrottle={false}
        externalBrake={false}
        externalTurbo={false}
        onTelemetryUpdate={noop}
        onSessionFinish={noop}
      />
    </div>
  );
}
