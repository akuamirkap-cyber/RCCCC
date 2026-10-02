import { useEffect, useState } from 'react';
import type { Game } from '../game/Game';
import { RC_PRESETS, RC_SLIDERS, RC_TIRES, rcTune, type RcSetup, type RcTire } from '../game/drift';

const GROUPS: { id: 'elektronik' | 'kemudi' | 'suspensi'; title: string; icon: string }[] = [
  { id: 'elektronik', title: 'Elektronik · Gyro & ESC', icon: '⚡' },
  { id: 'kemudi', title: 'Kemudi · High-angle knuckle', icon: '🎯' },
  { id: 'suspensi', title: 'Suspensi', icon: '🔧' },
];

/** Pit Bench mekanik: drawer penyetelan sasis RC drift. */
export default function PitBench({ game, open, onClose }: { game: Game | null; open: boolean; onClose: () => void }) {
  const [rc, setRc] = useState<RcSetup | null>(null);

  useEffect(() => {
    if (open && game) setRc({ ...game.rc });
  }, [open, game]);

  if (!rc) return null;
  const tune = rcTune(rc);

  const change = (patch: Partial<RcSetup>) => {
    game?.setRc(patch);
    setRc((p) => (p ? { ...p, ...patch } : p));
  };

  const stats: [string, string][] = [
    ['Grip depan', tune.frontGrip.toFixed(2)],
    ['Grip belakang', tune.rearGrip.toFixed(2)],
    ['Transfer beban', `${Math.round(tune.wtGain * 100)}%`],
    ['Laju transfer', tune.wtRate.toFixed(1)],
    ['Self-centering', `${Math.round(tune.counterSteer * 100)}%`],
    ['Tenaga puncak', `+${Math.round(tune.turbo * 70)}%`],
  ];

  return (
    <>
      <div
        onClick={onClose}
        className={`absolute inset-0 z-[35] bg-black/45 transition-opacity duration-300 ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        className={`pointer-events-auto absolute right-0 top-0 z-[36] flex h-full w-full max-w-[380px] flex-col bg-[#15120f]/95 shadow-2xl ring-1 ring-white/10 backdrop-blur-md transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between border-b border-white/10 p-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#f0b98a]">Sakura RC Drift Pro</div>
            <h2 className="text-xl font-black">🛠 Pit Bench</h2>
            <p className="text-[11px] text-white/50">Penyetelan sasis 1:10 RWD — perubahan langsung memengaruhi fisika.</p>
          </div>
          <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {/* preset */}
          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/50">Preset setelan</div>
            <div className="grid grid-cols-3 gap-1.5">
              {RC_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => change({ ...p.setup })}
                  className="rounded-xl bg-white/8 px-2 py-2 text-center ring-1 ring-white/10 hover:bg-white/15"
                >
                  <div className="text-xs font-black">{p.label}</div>
                  <div className="text-[9px] leading-tight text-white/50">{p.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* compound ban */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-black">
              <span>🛞</span> Senyawa ban (belakang)
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(RC_TIRES) as RcTire[]).map((k) => {
                const t = RC_TIRES[k];
                const on = rc.tire === k;
                return (
                  <button
                    key={k}
                    onClick={() => change({ tire: k })}
                    className={`rounded-xl px-2 py-2 text-left transition ${
                      on ? 'bg-[#f0b98a] text-[#1d1814]' : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    <div className="text-[11px] font-black leading-tight">{t.label}</div>
                    <div className="text-[9px] leading-tight opacity-70">{t.sub}</div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/20">
                      <div className="h-full rounded-full bg-current" style={{ width: `${Math.round((t.mu / 1.2) * 100)}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-white/55">{RC_TIRES[rc.tire].note}</p>
          </div>

          {GROUPS.map((g) => (
            <div key={g.id}>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-black">
                <span>{g.icon}</span> {g.title}
              </div>
              <div className="space-y-3">
                {RC_SLIDERS.filter((s) => s.group === g.id).map((s) => (
                  <div key={s.key}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-bold text-white/90">{s.label}</span>
                      <span className="font-mono text-[#f0b98a]">{s.fmt(rc[s.key])}</span>
                    </div>
                    <input
                      type="range"
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      value={rc[s.key]}
                      onChange={(e) => change({ [s.key]: parseFloat(e.target.value) } as Partial<RcSetup>)}
                      className="mt-1 w-full accent-[#f0b98a]"
                    />
                    <div className="text-[10px] leading-snug text-white/40">{s.hint}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* ringkasan efek */}
          <div className="rounded-xl bg-black/30 p-3">
            <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/50">Efek setelan saat ini</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              {stats.map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-white/55">{k}</span>
                  <span className="font-mono text-white/90">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              game?.resetRc();
              if (game) setRc({ ...game.rc });
            }}
            className="w-full rounded-lg bg-white/10 py-2 text-xs font-bold hover:bg-white/20"
          >
            ↺ Kembalikan ke setelan bawaan
          </button>
        </div>
      </aside>
    </>
  );
}
