import { useEffect, useRef, useState } from 'react'
import { useGame } from './store'
import { cn } from '../utils/cn'

/** Angka yang "menghitung" menuju target dengan pop saat naik (ala Balatro) */
function useCountUp(target: number, speed = 8) {
  const [val, setVal] = useState(target)
  const ref = useRef(target)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const diff = target - ref.current
      if (Math.abs(diff) < 1) {
        ref.current = target
        setVal(target)
        return
      }
      ref.current += diff * Math.min(1, speed / 60)
      setVal(Math.round(ref.current))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, speed])
  return val
}

function useBumpKey(trigger: number) {
  const [k, setK] = useState(0)
  useEffect(() => {
    if (trigger > 0) setK((n) => n + 1)
  }, [trigger])
  return k
}

export function ScoreHud() {
  const { score, pending, mult, drifting, chipBump, multBump, bank, tags, sector, tandem, bigAngle, best, mode } = useGame()
  const shownScore = useCountUp(score, 10)
  const chipKey = useBumpKey(chipBump)
  const multKey = useBumpKey(multBump)
  const scoreKey = useBumpKey(score)
  const active = drifting || pending > 0
  const heat = Math.min(1, mult / 12)

  return (
    <>
      {/* ===== SKOR TOTAL (atas tengah) ===== */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 text-center pointer-events-none">
        <div className="text-[10px] uppercase tracking-[0.35em] text-white/80 drop-shadow font-black">SKOR</div>
        <div
          key={scoreKey}
          className="balatro-num text-4xl md:text-5xl font-black text-white tabular-nums animate-[scorepop_0.35s_ease-out]"
          style={{ textShadow: '0 4px 0 #000, 0 0 18px rgba(255,220,80,0.35)' }}
        >
          {shownScore.toLocaleString('id-ID')}
        </div>
        <div className="text-[11px] text-yellow-300 drop-shadow font-bold">Rekor {best[mode].toLocaleString('id-ID')}</div>
      </div>

      {/* ===== CHIPS × MULT (Balatro style) ===== */}
      <div
        className={cn(
          'absolute top-[88px] md:top-[104px] left-1/2 -translate-x-1/2 flex items-stretch gap-1 transition-all duration-200 pointer-events-none',
          active ? 'opacity-100 scale-100' : 'opacity-0 scale-75 translate-y-2',
        )}
        style={{ filter: active ? `drop-shadow(0 0 ${8 + heat * 20}px rgba(255,${120 - heat * 80},60,${0.4 + heat * 0.5}))` : undefined }}
      >
        {/* CHIPS */}
        <div
          key={`c${chipKey}`}
          className="balatro-card bg-[#1e6fd9] border-[#0b3f8a] animate-[cardbump_0.28s_ease-out]"
        >
          <div className="text-[9px] font-black tracking-widest text-white/80">CHIPS</div>
          <div className="text-3xl md:text-4xl font-black text-white tabular-nums leading-none">{pending.toLocaleString('id-ID')}</div>
        </div>
        {/* × */}
        <div className="flex items-center text-3xl md:text-4xl font-black text-white drop-shadow-[0_3px_0_#000] px-0.5 animate-[wobble_1.2s_ease-in-out_infinite]">
          ×
        </div>
        {/* MULT */}
        <div
          key={`m${multKey}`}
          className={cn(
            'balatro-card border-[#8a0b1e] animate-[cardbump_0.32s_ease-out]',
            mult >= 10 ? 'bg-[#ff2d55] animate-[shake_0.35s_ease-in-out_infinite]' : 'bg-[#e0243c]',
          )}
        >
          <div className="text-[9px] font-black tracking-widest text-white/80">MULT</div>
          <div className="text-3xl md:text-4xl font-black text-white tabular-nums leading-none">{mult}</div>
        </div>
      </div>

      {/* status kecil di bawah kartu */}
      <div
        className={cn(
          'absolute top-[168px] md:top-[192px] left-1/2 -translate-x-1/2 flex gap-2 pointer-events-none transition-opacity',
          active ? 'opacity-100' : 'opacity-0',
        )}
      >
        {drifting && <Pill className="bg-yellow-400 text-black">DRIFT!</Pill>}
        {tandem && <Pill className="bg-fuchsia-500 text-white animate-pulse">TANDEM ×1.6</Pill>}
        {bigAngle && <Pill className="bg-orange-500 text-white">BIG ANGLE</Pill>}
      </div>

      {/* ===== TAGS event (melompat dari kanan kartu) ===== */}
      <div className="absolute top-[150px] md:top-[170px] left-1/2 -translate-x-1/2 w-[320px] md:w-[420px] pointer-events-none">
        <div className="relative h-0">
          {tags.map((t, i) => (
            <div
              key={t.id}
              className={cn(
                'absolute left-1/2 whitespace-nowrap px-3 py-1 rounded-lg font-black text-sm md:text-base border-2 shadow-[0_4px_0_rgba(0,0,0,0.5)] animate-[tagfly_1.4s_cubic-bezier(0.2,0.9,0.3,1)_forwards]',
                t.kind === 'chip' && 'bg-[#1e6fd9] border-[#0b3f8a] text-white',
                t.kind === 'mult' && 'bg-[#e0243c] border-[#8a0b1e] text-white',
                t.kind === 'bad' && 'bg-zinc-900 border-red-500 text-red-300',
                t.kind === 'info' && 'bg-fuchsia-600 border-fuchsia-900 text-white',
              )}
              style={{ top: i * 34, transform: `translateX(-50%) rotate(${((t.id % 5) - 2) * 2}deg)` }}
            >
              {t.text}
            </div>
          ))}
        </div>
      </div>

      {/* ===== BANK animasi: chips × mult = total ===== */}
      {bank && (
        <div key={bank.id} className="absolute inset-x-0 top-[40%] flex justify-center pointer-events-none">
          <div className="animate-[bankin_1.5s_ease-out_forwards] text-center">
            <div className="flex items-center justify-center gap-2 text-2xl md:text-3xl font-black text-white drop-shadow-[0_3px_0_#000]">
              <span className="text-sky-300">{bank.chips.toLocaleString('id-ID')}</span>
              <span>×</span>
              <span className="text-red-400">{bank.mult}</span>
              <span>=</span>
            </div>
            <div
              className="text-5xl md:text-7xl font-black text-yellow-300 tabular-nums animate-[bigpop_0.5s_cubic-bezier(0.2,1.6,0.4,1)]"
              style={{ textShadow: '0 5px 0 #7a4b00, 0 0 30px rgba(255,200,0,0.6)' }}
            >
              +{bank.total.toLocaleString('id-ID')}
            </div>
          </div>
        </div>
      )}

      {/* ===== SEKTOR progress ===== */}
      {sector && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-28 pointer-events-none">
          <div className="bg-black/50 backdrop-blur rounded-2xl p-2 border border-purple-400/40">
            <div className="text-[10px] font-black tracking-widest text-purple-300">{sector.name}</div>
            <div className="text-[9px] text-white/60 mb-1">Drift ≥70% = PERFECT</div>
            <div className="h-3 rounded-full bg-white/10 overflow-hidden relative">
              <div
                className={cn('h-full transition-all', sector.pct >= 0.7 ? 'bg-green-400' : sector.pct >= 0.4 ? 'bg-yellow-400' : 'bg-red-400')}
                style={{ width: `${Math.round(sector.pct * 100)}%` }}
              />
              <div className="absolute top-0 bottom-0 w-0.5 bg-white/70" style={{ left: '70%' }} />
              <div className="absolute top-0 bottom-0 w-0.5 bg-white/40" style={{ left: '40%' }} />
            </div>
            <div className="text-right text-xs font-black text-white mt-0.5">{Math.round(sector.pct * 100)}%</div>
          </div>
        </div>
      )}
    </>
  )
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-widest shadow-[0_3px_0_rgba(0,0,0,0.5)]', className)}>{children}</span>
}
