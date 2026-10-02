import type { DriftHud as DriftHudData } from '../game/Game';
import { DRIFT_LABEL } from '../game/drift';

const RANGE = 90; // derajat di tiap sisi pada meter

/** HUD drift saat balapan: meter sudut, skor rantai, combo, dan total. Mode RC menambah boost & gyro. */
export default function DriftHud({ d }: { d: DriftHudData }) {
  const live = d.active || d.chain > 1;
  const a = Math.max(-RANGE, Math.min(RANGE, d.signed));
  const pos = 50 + (a / RANGE) * 50;
  const limit = Math.min(50, ((d.tune.maxAngle * 180) / Math.PI / RANGE) * 50);
  const hue = d.angle < 12 ? '#cfd6c4' : d.angle < 32 ? '#f0d08a' : d.angle < 50 ? '#f0b98a' : '#ec8f7a';
  const isRc = d.mode === 'rc';

  return (
    <div className="pointer-events-none absolute left-1/2 top-[136px] w-[250px] -translate-x-1/2 text-center">
      {/* skor rantai */}
      <div className={`transition-all duration-150 ${live ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
        <div className="flex items-baseline justify-center gap-2">
          <span className="font-mono text-4xl font-black tabular-nums drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]">
            {Math.round(d.chain)}
          </span>
          <span className="rounded-md px-1.5 py-0.5 text-sm font-black text-[#1d1814]" style={{ background: hue }}>
            ×{d.combo}
          </span>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/80 drop-shadow">Drift!</div>
      </div>

      {/* meter sudut */}
      <div className="mt-1 rounded-xl bg-black/35 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/60">
          <span>Drift · {DRIFT_LABEL[d.mode]}</span>
          <span className="font-mono text-xs font-bold" style={{ color: d.active ? hue : undefined }}>
            {Math.round(d.angle)}°
          </span>
        </div>
        <div className="relative mt-1.5 h-2 rounded-full bg-white/15">
          {/* batas sudut anti-spin */}
          {d.mode !== 'normal' && (
            <>
              <div className="absolute top-[-2px] h-3 w-px bg-white/50" style={{ left: `${50 - limit}%` }} />
              <div className="absolute top-[-2px] h-3 w-px bg-white/50" style={{ left: `${50 + limit}%` }} />
            </>
          )}
          <div className="absolute left-1/2 top-[-2px] h-3 w-px bg-white/70" />
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40"
            style={{ left: `${pos}%`, background: hue, transition: 'left 60ms linear' }}
          />
        </div>
        {/* kejenuhan ban belakang */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="w-9 text-left text-[9px] uppercase tracking-widest text-white/45">ban</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.round(d.rear * 100)}%`, background: d.rear > 0.8 ? '#ec8f7a' : d.rear > 0.5 ? '#f0d08a' : '#cfd6c4' }}
            />
          </div>
        </div>
        {/* boost turbo (RC) */}
        {isRc && (
          <div className="mt-1 flex items-center gap-2">
            <span className="w-9 text-left text-[9px] uppercase tracking-widest text-white/45">boost</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round(d.boost * 100)}%`, background: d.boost > 0.85 ? '#ec8f7a' : '#9fd0e8' }}
              />
            </div>
            <span className="w-14 text-right text-[9px] uppercase tracking-wider text-white/45">gyro {Math.round(d.rc.gyroGain)}%</span>
          </div>
        )}
        <div className="mt-1 flex justify-between text-[10px] text-white/55">
          <span>total {Math.round(d.score)}</span>
          <span>terbaik {Math.round(d.best)}</span>
        </div>
      </div>
    </div>
  );
}
