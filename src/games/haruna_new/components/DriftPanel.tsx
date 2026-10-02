import { useEffect, useState } from 'react';
import type { Game } from '../game/Game';
import type { DriftHud } from '../game/Game';
import {
  DRIFT_ORDER,
  DRIFT_LABEL,
  DRIFT_DESC,
  DRIFT_SLIDERS,
  HARUNA_PRESETS,
  HARUNA_SLIDERS,
  RC_TIRES,
  type DriftTune,
} from '../game/drift';

const FLAMES: Record<string, string> = { normal: '—', sedang: '🔥', pas: '🔥🔥', best: '🔥🔥🔥', rc: '🏎 RC' };

/** Pemilih level drift + slider penyesuaian halus. Dipakai di menu. */
export default function DriftPanel({
  game,
  drift,
  onPit,
}: {
  game: Game | null;
  drift: DriftHud | undefined;
  onPit: () => void;
}) {
  const mode = drift?.mode ?? 'normal';
  const [rev, setRev] = useState(0);
  const [vals, setVals] = useState<DriftTune | null>(null);
  const [open, setOpen] = useState(false);
  const [harunaSetupOpen, setHarunaSetupOpen] = useState(true);

  // sinkronkan tampilan angka bila mode diganti / tuning direset
  useEffect(() => {
    if (game) setVals({ ...game.car.tune });
  }, [game, mode, rev]);

  const isNormal = mode === 'normal';
  const isRc = mode === 'rc';
  const rc = drift?.rc;

  return (
    <div className="mt-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-white/50">Mode drift · engine</div>
        <div className="text-[10px] text-white/40">tombol G</div>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {DRIFT_ORDER.map((m) => (
          <button
            key={m}
            onClick={() => game?.setDriftMode(m)}
            className={`rounded-xl px-0.5 py-2 text-center transition ${
              mode === m ? 'bg-[#f0b98a] text-[#1d1814]' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            <div className="text-[12px] font-black leading-tight">{DRIFT_LABEL[m]}</div>
            <div className="text-[9px] leading-tight opacity-80">{FLAMES[m]}</div>
          </button>
        ))}
      </div>

      {/* indikator level */}
      <div className="mt-2 flex gap-1">
        {DRIFT_ORDER.map((m, i) => (
          <div
            key={m}
            className={`h-1 flex-1 rounded-full ${i <= DRIFT_ORDER.indexOf(mode) ? 'bg-[#f0b98a]' : 'bg-white/15'}`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/65">{DRIFT_DESC[mode]}</p>

      {/* ---------- TOYOTA AE86 PANDA / HARUNA SETUP ---------- */}
      {!isRc && (
        <div className="mt-3 rounded-xl bg-[#f0b98a]/10 p-3 ring-1 ring-[#f0b98a]/35">
          <button
            onClick={() => setHarunaSetupOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f0b98a]">
                Toyota AE86 Panda · Haruna Setup
              </div>
              <div className="mt-0.5 text-[10px] text-white/50">
                Akselerasi · drifting · throttle · handling
              </div>
            </div>
            <span className="text-white/60">{harunaSetupOpen ? '▾' : '▸'}</span>
          </button>

          {harunaSetupOpen && (
            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/50">Preset saran</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {HARUNA_PRESETS.map((preset) => {
                    const active =
                      vals?.acceleration === preset.setup.acceleration &&
                      vals?.driftResponse === preset.setup.driftResponse &&
                      vals?.throttleResponse === preset.setup.throttleResponse &&
                      vals?.handlingAssist === preset.setup.handlingAssist;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => {
                          game?.applyHarunaPreset(preset.id);
                          setVals({ ...preset.setup });
                          setRev((r) => r + 1);
                        }}
                        className={`rounded-xl p-2 text-left ring-1 transition ${
                          active
                            ? 'bg-[#f0b98a] text-[#1d1814] ring-[#f0b98a]'
                            : 'bg-black/20 text-white ring-white/10 hover:bg-white/10'
                        }`}
                      >
                        <div className="text-[10px] font-black leading-tight">{preset.label}</div>
                        <div className={`mt-1 text-[9px] leading-snug ${active ? 'text-[#1d1814]/70' : 'text-white/50'}`}>
                          {preset.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {vals && (
                <div className="space-y-2.5 border-t border-white/10 pt-2.5">
                  {HARUNA_SLIDERS.map((s) => (
                    <div key={`${rev}-${s.key}`}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-bold text-white/90">{s.label}</span>
                        <span className="font-mono text-[#f0b98a]">{s.fmt(vals[s.key])}</span>
                      </div>
                      <input
                        type="range"
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        value={vals[s.key]}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          game?.setHarunaParam(s.key, v);
                          setVals((p) => (p ? { ...p, [s.key]: v } : p));
                        }}
                        className="mt-1 w-full accent-[#f0b98a]"
                      />
                      <div className="text-[10px] leading-snug text-white/40">{s.hint}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-lg bg-black/25 p-2 text-[10px] leading-relaxed text-white/55">
                <b className="text-white/80">Manual tetap aman:</b> throttle hanya aktif saat W / ArrowUp ditekan.
                Handling assist membantu koreksi setir, bukan auto-gas.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- RC DRIFT ---------- */}
      {isRc && rc && (
        <>
          <button
            onClick={onPit}
            className="mt-3 w-full rounded-xl bg-[#f0b98a] py-2.5 text-sm font-black uppercase tracking-widest text-[#1d1814] hover:bg-[#ffc89c]"
          >
            🛠 Buka Pit Bench
          </button>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
            {[
              ['Gyro', `${Math.round(rc.gyroGain)}%`],
              ['ESC turbo', `${Math.round(rc.escBoost)}%`],
              ['Knuckle', `${Math.round(rc.knuckle)}°`],
              ['Ban', RC_TIRES[rc.tire].label.split(' ')[0]],
              ['Caster', `${rc.caster.toFixed(1)}°`],
              ['Camber', `${rc.camber.toFixed(1)}°`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-black/25 px-1 py-1.5">
                <div className="uppercase tracking-wider text-white/40">{k}</div>
                <div className="font-mono text-xs font-bold text-white/90">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-black/25 p-2.5 text-[11px] leading-relaxed text-white/60">
            <div className="mb-1 font-bold text-white/80">Sound box RB26DETT</div>
            <div>Idle lope · desis turbo saat gas dibuka · BOV “stu-tu-tu” saat gas dilepas · backfire saat deselerasi RPM tinggi.</div>
            <div className="mt-1 text-white/50">Gyro menahan ekor otomatis; turunkan gyro untuk kontrol manual yang lebih liar.</div>
          </div>
        </>
      )}

      {/* ---------- SEDANG / PAS / BEST ---------- */}
      {!isNormal && !isRc && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-3 flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10"
          >
            <span>🎚 Tuning halus</span>
            <span>{open ? '▾' : '▸'}</span>
          </button>

          {open && vals && (
            <div className="mt-2 space-y-3">
              {DRIFT_SLIDERS.map((s) => (
                <div key={`${mode}-${rev}-${s.key}`}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-bold text-white/90">{s.label}</span>
                    <span className="font-mono text-[#f0b98a]">{s.fmt(vals[s.key])}</span>
                  </div>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    defaultValue={game?.car.tune[s.key] ?? vals[s.key]}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      game?.setDriftParam(s.key, v);
                      setVals((p) => (p ? { ...p, [s.key]: v } : p));
                    }}
                    className="mt-1 w-full accent-[#f0b98a]"
                  />
                  <div className="text-[10px] text-white/40">{s.hint}</div>
                </div>
              ))}
              <button
                onClick={() => {
                  game?.resetDriftTune();
                  setRev((r) => r + 1);
                }}
                className="w-full rounded-lg bg-white/10 py-1.5 text-xs font-bold hover:bg-white/20"
              >
                ↺ Kembalikan ke bawaan “{DRIFT_LABEL[mode]}”
              </button>
            </div>
          )}

          <div className="mt-3 rounded-lg bg-black/25 p-2.5 text-[11px] leading-relaxed text-white/60">
            <div className="mb-1 font-bold text-white/80">Teknik memulai drift</div>
            <div>
              <b className="text-white/90">Power-over</b> — gas dalam di tikungan (tenaga &gt; grip belakang)
            </div>
            <div>
              <b className="text-white/90">Clutch kick</b> — lepas gas sebentar, tekan lagi sambil menyetir (&gt;35 km/h)
            </div>
            <div>
              <b className="text-white/90">Handbrake</b> — <kbd>Spasi</kbd> saat masuk, lepas lalu counter-steer
            </div>
            <div>
              <b className="text-white/90">Rem-drift / feint</b> — rem singkat atau setir berlawanan dulu, lalu banting masuk
            </div>
            <div className="mt-1 text-white/50">Lebih banyak gas = sudut melebar, kurangi gas = ekor kembali.</div>
          </div>
        </>
      )}
    </div>
  );
}
