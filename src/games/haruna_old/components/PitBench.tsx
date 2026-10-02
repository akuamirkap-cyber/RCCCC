import { RC_PRESETS, TIRES, TIRE_ORDER, type RcSetup, type TireId } from '../game/drift'

function Slider({
  label, value, min, max, step, unit, desc, onChange, accent,
}: {
  label: string; value: number; min: number; max: number; step: number
  unit: string; desc: string; onChange: (v: number) => void; accent: string
}) {
  return (
    <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-white/85">{label}</span>
        <span className="font-mono text-sm font-bold" style={{ color: accent }}>
          {value}{unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-pink-400"
      />
      <div className="mt-1 text-[11px] leading-snug text-white/45">{desc}</div>
    </div>
  )
}

export default function PitBench({
  open, setup, soundOn, onChange, onToggleSound, onClose,
}: {
  open: boolean
  setup: RcSetup
  soundOn: boolean
  onChange: (patch: Partial<RcSetup>) => void
  onToggleSound: () => void
  onClose: () => void
}) {
  if (!open) return null
  const accent = '#ff7ad9'
  return (
    <div className="absolute inset-y-0 right-0 z-40 flex w-full max-w-md flex-col bg-[#14101a]/97 shadow-2xl ring-1 ring-white/15 backdrop-blur-md">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5 pb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: accent }}>Pit Bench · Sakura RC</div>
          <h2 className="text-xl font-black">Mekanik 1:10 RWD</h2>
          <p className="mt-1 text-[11px] text-white/50">
            Setting ala YD-2 / RMX: gyro, knuckle, ban, ESC &amp; suspensi. Tersimpan otomatis.
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/15 hover:bg-white/20">
          Tutup ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {/* preset */}
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-white/45">Preset cepat</div>
          <div className="grid grid-cols-3 gap-2">
            {RC_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => onChange({ ...p.setup })}
                className="rounded-xl bg-white/5 px-2 py-2 text-left ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <div className="text-xs font-bold" style={{ color: accent }}>{p.name}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-white/50">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* gyro & steering */}
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-white/45">Gyro &amp; Steering</div>
          <div className="space-y-2">
            <Slider label="Gyro Gain" value={setup.gyroGain} min={0} max={100} step={1} unit="%"
              desc="0 = manual murni (liar). 60–75 = touge ideal. 85+ = anteng tapi angle dikoreksi terus."
              onChange={(v) => onChange({ gyroGain: v })} accent={accent} />
            <Slider label="Max Steering (knuckle)" value={setup.maxSteerDeg} min={55} max={80} step={1} unit="°"
              desc="Sudut belok roda depan. 76–80° = high-angle khas RC drift, nahan slide besar."
              onChange={(v) => onChange({ maxSteerDeg: v })} accent={accent} />
            <div className="rounded-xl bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-pink-200/80 ring-1 ring-white/10">
              {'gyroCounter = -yawRate × (gain/100) × 0.45'}<br />
              {'steer = clamp(user + gyro, ±lock)'}
            </div>
          </div>
        </div>

        {/* ban */}
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-white/45">Senyawa Ban</div>
          <div className="grid grid-cols-3 gap-2">
            {TIRE_ORDER.map((id: TireId) => {
              const t = TIRES[id]
              const active = setup.tire === id
              return (
                <button
                  key={id}
                  onClick={() => onChange({ tire: id })}
                  className="rounded-xl px-2 py-2 text-left ring-1 transition"
                  style={active ? { background: `${t.color}22`, borderColor: t.color, borderWidth: 1 } : { background: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'transparent' }}
                >
                  <div className="text-xs font-bold" style={{ color: t.color }}>{t.short}</div>
                  <div className="text-[10px] text-white/60">{t.name}</div>
                </button>
              )
            })}
          </div>
          <div className="mt-2 text-[11px] text-white/50">{TIRES[setup.tire].desc}</div>
        </div>

        {/* ESC */}
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-white/45">ESC Turbo Boost</div>
          <Slider label="Turbo / Timing" value={setup.escTurbo} min={0} max={100} step={1} unit="%"
            desc="Semburan tenaga di RPM tinggi ala timing brushless. Tinggi = top-speed galak + spool nyaring."
            onChange={(v) => onChange({ escTurbo: v })} accent={accent} />
        </div>

        {/* suspensi */}
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-white/45">Suspensi</div>
          <div className="space-y-2">
            <Slider label="Caster (depan)" value={setup.casterDeg} min={4} max={12} step={0.5} unit="°"
              desc="Miring shock depan. Tinggi = stabil saat counter & self-steer kuat."
              onChange={(v) => onChange({ casterDeg: v })} accent={accent} />
            <Slider label="Camber (depan)" value={setup.camberDeg} min={-8} max={0} step={0.5} unit="°"
              desc="Miring ban negatif. Makin negatif = grip depan nambah saat belok."
              onChange={(v) => onChange({ camberDeg: v })} accent={accent} />
            <Slider label="Damper Oil" value={setup.damperCst} min={300} max={800} step={10} unit=" cSt"
              desc="Kental oli 300 encer (lincah) – 800 kental (kalem & stabil)."
              onChange={(v) => onChange({ damperCst: v })} accent={accent} />
            <Slider label="Spring Rate" value={setup.springRate} min={1} max={10} step={0.5} unit=""
              desc="1 lunak (grip, limbung) – 10 keras (responsif, licin)."
              onChange={(v) => onChange({ springRate: v })} accent={accent} />
          </div>
        </div>

        {/* soundbox */}
        <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white/85">RB26 Soundbox {soundOn ? 'ON' : 'OFF'}</div>
              <div className="mt-0.5 text-[11px] text-white/45">Idle + turbo spool + stututu BOV + backfire. Tombol M.</div>
            </div>
            <button
              onClick={onToggleSound}
              className="rounded-lg px-4 py-2 text-sm font-bold text-black transition"
              style={{ background: soundOn ? accent : 'rgba(255,255,255,0.2)' }}
            >
              {soundOn ? '🔊' : '🔇'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
