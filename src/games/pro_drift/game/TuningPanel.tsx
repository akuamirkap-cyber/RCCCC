import { useState } from 'react'
import {
  tuning,
  TUNING_FIELDS,
  PRESETS,
  DEFAULT_TUNING,
  applyTuning,
  matchPreset,
  tuningStats,
  type Tuning,
  type MovementEngineMode,
} from './tuning'
import { cn } from '../utils/cn'
import { BMWAdjustmentModal } from '@/components/BMWAdjustmentModal'

function StatBar({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-20 text-white/60 uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.round(v * 100)}%` }} />
      </div>
    </div>
  )
}

function Stats({ t }: { t: Tuning }) {
  const s = tuningStats(t)
  return (
    <div className="space-y-1">
      <StatBar label="Speed" v={s.speed} color="bg-red-400" />
      <StatBar label="Akselerasi" v={s.accel} color="bg-orange-400" />
      <StatBar label="Handling" v={s.handling} color="bg-sky-400" />
      <StatBar label="Drift" v={s.drift} color="bg-pink-400" />
      <StatBar label="Stabilitas" v={s.stability} color="bg-green-400" />
    </div>
  )
}

export function TuningSummary({ onOpen }: { onOpen: () => void }) {
  const preset = matchPreset(tuning)
  const s = tuningStats(tuning)
  const isSakura = tuning.engineMode === 'sakura_rc'

  return (
    <button
      onClick={onOpen}
      className={cn(
        'w-full mb-4 rounded-2xl border-2 transition p-3 text-left cursor-pointer',
        isSakura
          ? 'border-pink-500/40 bg-pink-950/20 hover:border-pink-400 hover:bg-pink-950/30'
          : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-yellow-400/60',
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs uppercase tracking-widest text-white/60">Setup Mobil</span>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider',
                isSakura ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40' : 'bg-yellow-400/20 text-yellow-300 border border-yellow-400/40',
              )}
            >
              {isSakura ? '🌸 Engine Sakura RC (Gyro)' : '⚡ Engine Pro Drift (Slip)'}
            </span>
          </div>

          <div className="font-bold text-sm">
            🔧 {preset ? `${PRESETS[preset].icon} ${PRESETS[preset].name}` : '⚙️ Custom Setup'}
            <span className="text-white/50 font-normal text-xs ml-2">
              {tuning.maxSpeed} km/j · {isSakura ? `Gyro ${tuning.gyroGain}%` : `accel ${tuning.accel}`}
            </span>
          </div>
        </div>
        <span className="text-yellow-300 text-sm font-bold">Ubah ›</span>
      </div>

      <div className="grid grid-cols-5 gap-1">
        {(
          [
            ['SPD', s.speed, 'bg-red-400'],
            ['ACC', s.accel, 'bg-orange-400'],
            ['HND', s.handling, 'bg-sky-400'],
            ['DRF', s.drift, 'bg-pink-400'],
            ['STB', s.stability, 'bg-green-400'],
          ] as const
        ).map(([l, v, c]) => (
          <div key={l} className="text-center">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className={cn('h-full', c)} style={{ width: `${Math.round(v * 100)}%` }} />
            </div>
            <div className="text-[9px] text-white/50 mt-0.5">{l}</div>
          </div>
        ))}
      </div>
    </button>
  )
}

export function TuningPanel({ onClose }: { onClose: () => void }) {
  const [t, setT] = useState<Tuning>({ ...tuning })
  const [showBMWModal, setShowBMWModal] = useState(false)
  const preset = matchPreset(t)

  const update = (patch: Partial<Tuning>) => {
    const next = { ...t, ...patch }
    setT(next)
    applyTuning(next)
  }

  const handleSelectEngine = (mode: MovementEngineMode) => {
    if (mode === 'sakura_rc') {
      update({
        engineMode: 'sakura_rc',
        gyroGain: t.gyroGain || 86,
        maxSteerAngle: t.maxSteerAngle || 78,
      })
    } else {
      update({ engineMode: 'pro_drift' })
    }
  }

  const isSakura = t.engineMode === 'sakura_rc'

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-gradient-to-b from-zinc-900 to-black rounded-3xl border border-white/10 shadow-2xl text-white select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-zinc-900/95 backdrop-blur px-5 pt-5 pb-3 border-b border-white/10 flex items-start justify-between z-10">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-yellow-300">Garasi &amp; Penyetelan</div>
            <h2 className="text-2xl font-black italic">🔧 Setup Mesin Gerak</h2>
            <p className="text-xs text-white/50">Pilih Engine Gerakan Mobil &amp; atur karakteristik drift.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-lg leading-none cursor-pointer">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* ============================================================== */}
          {/* ENGINE MOVEMENT MODE SELECTOR */}
          {/* ============================================================== */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-yellow-300">
                PILIH ENGINE GERAKAN MOBIL:
              </span>
              <span className="text-[10px] font-mono text-white/50">Dual Physics Support</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectEngine('pro_drift')}
                className={cn(
                  'p-3 rounded-xl border-2 text-left transition flex flex-col justify-between cursor-pointer',
                  !isSakura
                    ? 'border-yellow-400 bg-yellow-400/15 text-white shadow-md'
                    : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/70',
                )}
              >
                <div className="flex items-center gap-1.5 font-black text-sm">
                  <span>⚡</span>
                  <span>PRO DRIFT</span>
                </div>
                <div className="text-[10px] text-white/60 mt-1 leading-tight">
                  Slip Vector 250 km/j · Recomposition basis lama · Liar &amp; responsif
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectEngine('sakura_rc')}
                className={cn(
                  'p-3 rounded-xl border-2 text-left transition flex flex-col justify-between cursor-pointer',
                  isSakura
                    ? 'border-pink-400 bg-pink-500/20 text-white shadow-md'
                    : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/70',
                )}
              >
                <div className="flex items-center gap-1.5 font-black text-sm text-pink-300">
                  <span>🌸</span>
                  <span>SAKURA RC PRO</span>
                </div>
                <div className="text-[10px] text-white/60 mt-1 leading-tight">
                  1:10 RWD RC Engine · Gyro assist otomatis · Ackermann lock limit
                </div>
              </button>
            </div>

            <div className="text-[11px] p-2 rounded-lg bg-black/40 text-neutral-300 leading-normal">
              {isSakura ? (
                <span>
                  🌸 <strong className="text-pink-300">Engine Sakura RC Pro aktif:</strong> Menghitung fisika mobil RC 1:10 RWD asli dengan sensor <em>Gyro Electronic Assist</em> (bantu balas setir otomatis) dan batas sudut belok <em>Knuckle Lock</em>. Tetap mendapatkan skor kombo Balatro &amp; Tandem!
                </span>
              ) : (
                <span>
                  ⚡ <strong className="text-yellow-300">Engine Pro Drift aktif:</strong> Fisika slip vector arcade 250 km/jam original dari <em>best drift.zip</em>. Perputaran bodi mobil instan dan agresif.
                </span>
              )}
            </div>
          </div>

          {/* Presets */}
          <div>
            <div className="text-xs uppercase tracking-widest text-white/60 mb-2">Preset Cepat</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(PRESETS).map(([k, p]) => (
                <button
                  key={k}
                  onClick={() => update({ ...p.t })}
                  className={cn(
                    'rounded-xl p-2.5 text-left border-2 transition cursor-pointer',
                    preset === k
                      ? p.t.engineMode === 'sakura_rc'
                        ? 'border-pink-400 bg-pink-500/20'
                        : 'border-yellow-400 bg-yellow-400/15'
                      : 'border-white/10 bg-white/5 hover:bg-white/10',
                  )}
                >
                  <div className="font-bold text-sm">
                    {p.icon} {p.name}
                  </div>
                  <div className="text-[10px] text-white/55 leading-tight mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white/5 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-widest text-white/60">Karakter Mobil</div>
              <div className="text-xs font-bold text-yellow-300">{preset ? PRESETS[preset].name : 'Custom'}</div>
            </div>
            <Stats t={t} />
          </div>

          {/* Sliders */}
          <div>
            <div className="text-xs uppercase tracking-widest text-white/60 mb-2">Parameter Detail</div>
            <div className="space-y-3">
              {TUNING_FIELDS.filter((f) => !f.onlyEngine || f.onlyEngine === t.engineMode).map((f) => {
                const v = t[f.key] as number
                const pct = ((v - f.min) / (f.max - f.min)) * 100
                return (
                  <div key={f.key} className="bg-white/5 rounded-xl px-3 py-2">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="font-bold text-sm">{f.label}</span>
                        <span className="text-[11px] text-white/45 ml-2">{f.desc}</span>
                      </div>
                      <div className="font-mono text-yellow-300 text-sm tabular-nums">
                        {f.step >= 1 ? Math.round(v) : v.toFixed(f.step < 0.1 ? 2 : 1)}
                        {f.unit && <span className="text-white/50 text-[10px] ml-1">{f.unit}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 font-bold cursor-pointer"
                        onClick={() => update({ [f.key]: Math.max(f.min, +(v - f.step).toFixed(3)) } as Partial<Tuning>)}
                      >
                        −
                      </button>
                      <input
                        type="range"
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        value={v}
                        onChange={(e) => update({ [f.key]: Number(e.target.value) } as Partial<Tuning>)}
                        className="flex-1 accent-yellow-400 h-2 cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, #facc15 ${pct}%, rgba(255,255,255,0.12) ${pct}%)`,
                          borderRadius: 9999,
                          appearance: 'none',
                          WebkitAppearance: 'none',
                        }}
                      />
                      <button
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 font-bold cursor-pointer"
                        onClick={() => update({ [f.key]: Math.min(f.max, +(v + f.step).toFixed(3)) } as Partial<Tuning>)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* BMW GLB Body Dimension Adjuster */}
          <button
            type="button"
            onClick={() => setShowBMWModal(true)}
            className="w-full py-3 px-4 rounded-2xl bg-cyan-400/15 hover:bg-cyan-400/25 border-2 border-cyan-400/60 text-cyan-300 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer active:scale-98 shadow-md"
          >
            <span>📐</span>
            <span>ADJUST BODY BMW GLB (PANJANG, LEBAR, TINGGI, KETINGGIAN)</span>
          </button>

          <div className="flex gap-3 pb-1">
            <button
              onClick={() => update({ ...DEFAULT_TUNING })}
              className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 font-bold text-sm transition cursor-pointer"
            >
              ↺ Reset Default
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-black font-black shadow-[0_4px_0_#a16207] active:translate-y-1 active:shadow-none transition cursor-pointer"
            >
              Simpan &amp; Tutup ✓
            </button>
          </div>
        </div>
      </div>

      {showBMWModal && (
        <BMWAdjustmentModal
          mode="pro_drift"
          isOpen={showBMWModal}
          onClose={() => setShowBMWModal(false)}
        />
      )}
    </div>
  )
}
