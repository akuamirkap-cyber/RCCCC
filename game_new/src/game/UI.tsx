import { useEffect, useState } from 'react'
import { useGame, CARS, CAR_LIST, RACE_LAPS, TIME_LIMIT } from './store'
import { input } from './input'
import { initAudio, setMuted } from './audio'
import { cn } from '../utils/cn'
import { TuningPanel, TuningSummary } from './TuningPanel'
import { ScoreHud } from './ScoreHud'
import { KMH } from './GameLoop'

function fmt(t: number) {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

export function UI() {
  const phase = useGame((s) => s.phase)
  return (
    <div className="absolute inset-0 pointer-events-none select-none font-sans">
      {phase === 'menu' && <Menu />}
      {(phase === 'playing' || phase === 'countdown') && <Hud />}
      {phase === 'countdown' && <Countdown />}
      {(phase === 'playing' || phase === 'countdown') && <TouchControls />}
      {phase === 'finished' && <Results />}
      <Popups />
      <MuteButton />
    </div>
  )
}

function MuteButton() {
  const muted = useGame((s) => s.muted)
  const toggle = useGame((s) => s.toggleMuted)
  useEffect(() => setMuted(muted), [muted])
  return (
    <button
      onClick={toggle}
      className="pointer-events-auto absolute top-3 right-3 z-20 w-10 h-10 rounded-full bg-black/40 backdrop-blur text-white text-lg flex items-center justify-center hover:bg-black/60 transition"
      aria-label="Suara"
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}

function Menu() {
  const { mode, setMode, carColor, setCarColor, carModel, setCarModel, setPhase, best } = useGame()
  const [showTuning, setShowTuning] = useState(false)
  const spec = CARS[carModel]
  const start = () => {
    initAudio()
    setPhase('countdown')
  }
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-between py-8 px-4 bg-gradient-to-b from-black/50 via-transparent to-black/60">
      <div className="text-center mt-4">
        <div className="text-xs md:text-sm tracking-[0.5em] text-yellow-300 font-bold uppercase drop-shadow">Hypercasual</div>
        <h1 className="text-5xl md:text-7xl font-black italic text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.5)] leading-none">
          RC DRIFT
          <span className="block text-yellow-400">CIRCUIT</span>
        </h1>
        <p className="text-white/80 mt-2 text-sm md:text-base">Pilih GT-R R34 atau GR Yaris, ngepot Ngepot pakai Skyline GT-R R34, kejar clipping point.amp; kejar clipping point. Kombo tinggi = skor gila!</p>
      </div>

      <div className="w-full max-w-md bg-black/55 backdrop-blur-md rounded-3xl p-5 text-white shadow-2xl border border-white/10">
        <div className="text-xs uppercase tracking-widest text-white/60 mb-2">Pilih Mobil</div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {CAR_LIST.map((c) => (
            <button
              key={c.id}
              onClick={() => setCarModel(c.id)}
              className={cn(
                'rounded-2xl p-3 text-left border-2 transition relative overflow-hidden',
                carModel === c.id ? 'border-yellow-400 bg-yellow-400/15' : 'border-white/10 bg-white/5 hover:bg-white/10',
              )}
            >
              <CarSilhouette id={c.id} color={carModel === c.id ? carColor : '#9ca3af'} />
              <div className="font-bold text-sm leading-tight mt-1">{c.short}</div>
              <div className="text-[10px] text-white/55 leading-tight">{c.tagline}</div>
              {carModel === c.id && (
                <span className="absolute top-2 right-2 text-[10px] font-black bg-yellow-400 text-black px-1.5 py-0.5 rounded">DIPAKAI</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-widest text-white/60">Warna Cat</div>
          <div className="text-xs font-bold text-yellow-300 italic uppercase">{spec.name}</div>
        </div>
        <div className="flex gap-3 justify-center mb-5">
          {spec.colors.map((c) => (
            <button
              key={c.hex}
              onClick={() => setCarColor(c.hex)}
              title={c.name}
              className={cn(
                'w-10 h-10 rounded-full border-4 transition transform hover:scale-110',
                carColor === c.hex ? 'border-yellow-400 scale-110' : 'border-white/20',
              )}
              style={{ background: c.hex }}
            />
          ))}
        </div>

        <div className="text-xs uppercase tracking-widest text-white/60 mb-2">Mode</div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <button
            onClick={() => setMode('race')}
            className={cn(
              'rounded-2xl p-3 text-left border-2 transition',
              mode === 'race' ? 'border-yellow-400 bg-yellow-400/15' : 'border-white/10 bg-white/5 hover:bg-white/10',
            )}
          >
            <div className="font-bold">🏁 Balapan {RACE_LAPS} Lap</div>
            <div className="text-xs text-white/60">Lawan 3 bot drifter, {RACE_LAPS} lap · bonus posisi</div>
            <div className="text-xs text-yellow-300 mt-1">Terbaik: {best.race.toLocaleString('id-ID')}</div>
          </button>
          <button
            onClick={() => setMode('time')}
            className={cn(
              'rounded-2xl p-3 text-left border-2 transition',
              mode === 'time' ? 'border-yellow-400 bg-yellow-400/15' : 'border-white/10 bg-white/5 hover:bg-white/10',
            )}
          >
            <div className="font-bold">⏱️ Drift {TIME_LIMIT} Detik</div>
            <div className="text-xs text-white/60">Skor drift sebanyak mungkin</div>
            <div className="text-xs text-yellow-300 mt-1">Terbaik: {best.time.toLocaleString('id-ID')}</div>
          </button>
        </div>

        <TuningSummary onOpen={() => setShowTuning(true)} />

        <button
          onClick={start}
          className="w-full py-4 rounded-2xl bg-yellow-400 hover:bg-yellow-300 active:scale-95 transition text-black font-black text-2xl tracking-wide shadow-[0_6px_0_#a16207]"
        >
          GAS! 🏎️
        </button>
      </div>
      {showTuning && <TuningPanel onClose={() => setShowTuning(false)} />}

      <div className="text-white/80 text-xs md:text-sm text-center space-y-1 bg-black/40 rounded-xl px-4 py-2">
        <div>
          <b>⌨️ PC:</b> ← → / A D belok · <b>SPASI</b> rem tangan (kick drift) · <b>↓</b> rem
        </div>
        <div>
          <b>📱 HP:</b> tombol kiri/kanan untuk belok · tombol DRIFT untuk ngepot
        </div>
        <div className="flex flex-wrap justify-center gap-1.5 pt-1">
          <span className="px-2 py-0.5 rounded bg-orange-500 text-white text-[10px] font-black">🔶 INNER CLIP +400</span>
          <span className="px-2 py-0.5 rounded bg-sky-500 text-white text-[10px] font-black">🟦 OUTER ZONE +600</span>
          <span className="px-2 py-0.5 rounded bg-purple-500 text-white text-[10px] font-black">🟪 SEKTOR PERFECT +1500 & +3 MULT</span>
          <span className="px-2 py-0.5 rounded bg-fuchsia-500 text-white text-[10px] font-black">👥 TANDEM ×1.6</span>
          <span className="px-2 py-0.5 rounded bg-red-500 text-white text-[10px] font-black">📐 BIG ANGLE +1 MULT</span>
        </div>
        <div className="text-white/50">Skor = CHIPS × MULT. Gas otomatis. Nabrak / keluar lintasan = kombo hangus. Start dari belakang — salip semuanya!</div>
      </div>
    </div>
  )
}

function CarSilhouette({ id, color }: { id: 'gtr' | 'yaris'; color: string }) {
  // Siluet samping sederhana (menghadap kiri)
  return (
    <svg viewBox="0 0 120 44" className="w-full h-10">
      {id === 'gtr' ? (
        <>
          {/* sedan coupe panjang + sayap */}
          <path
            d="M6 32 L10 24 L28 22 L40 12 L74 11 L90 21 L112 24 L114 32 Z"
            fill={color}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth="1"
          />
          <path d="M42 14 L72 13 L84 21 L36 22 Z" fill="#0f1420" />
          <rect x="96" y="8" width="16" height="2.5" fill={color} />
          <rect x="102" y="10" width="2.5" height="10" fill="#111" />
        </>
      ) : (
        <>
          {/* hatchback pendek tinggi + spoiler atap */}
          <path
            d="M14 32 L18 24 L30 22 L40 9 L74 8 L88 12 L98 24 L110 26 L112 32 Z"
            fill={color}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth="1"
          />
          <path d="M42 11 L72 10 L84 13 L92 22 L36 22 Z" fill="#0f1420" />
          <rect x="34" y="6" width="12" height="2.5" fill="#111" />
        </>
      )}
      <circle cx="30" cy="32" r="7" fill="#111" />
      <circle cx="30" cy="32" r="3.5" fill="#888" />
      <circle cx="92" cy="32" r="7" fill="#111" />
      <circle cx="92" cy="32" r="3.5" fill="#888" />
    </svg>
  )
}

function Countdown() {
  const n = useGame((s) => s.countdown)
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        key={n}
        className="text-[9rem] md:text-[12rem] font-black italic text-yellow-400 drop-shadow-[0_8px_0_rgba(0,0,0,0.6)] animate-[pop_0.9s_ease-out]"
      >
        {n > 0 ? n : 'GO!'}
      </div>
    </div>
  )
}

function Hud() {
  const { speed, lap, time, mode, clipsCollected, position, standings } = useGame()
  const kmh = Math.round(speed * KMH)
  const timeLeft = Math.max(0, TIME_LIMIT - time)
  const total = standings.length || 4
  return (
    <>
      {/* Top-left: lap / time */}
      <div className="absolute top-3 left-3 bg-black/45 backdrop-blur rounded-2xl px-4 py-2 text-white">
        {mode === 'race' ? (
          <>
            <div className="flex items-end gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/60">Posisi</div>
                <div
                  className={cn(
                    'text-3xl font-black italic leading-none',
                    position === 1 ? 'text-yellow-300' : position === 2 ? 'text-slate-200' : position === 3 ? 'text-amber-500' : 'text-white',
                  )}
                >
                  P{position}
                  <span className="text-white/40 text-sm not-italic">/{total}</span>
                </div>
              </div>
              <div className="pb-0.5">
                <div className="text-[10px] uppercase tracking-widest text-white/60">Lap</div>
                <div className="text-xl font-black leading-none">
                  {Math.min(Math.max(lap, 1), RACE_LAPS)}
                  <span className="text-white/50 text-sm">/{RACE_LAPS}</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-white/70 font-mono mt-1">{fmt(time)}</div>
            {/* klasemen mini */}
            <div className="mt-2 space-y-0.5">
              {standings.map((s, i) => (
                <div
                  key={s.name}
                  className={cn('flex items-center gap-1.5 text-[11px] leading-tight', s.me ? 'text-yellow-300 font-black' : 'text-white/75')}
                >
                  <span className="w-3 text-right tabular-nums">{i + 1}</span>
                  <span className="w-2 h-2 rounded-full border border-white/30" style={{ background: s.color }} />
                  <span>{s.name}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-widest text-white/60">Sisa Waktu</div>
            <div className={cn('text-2xl font-black leading-none font-mono', timeLeft < 10 && 'text-red-400 animate-pulse')}>
              {timeLeft.toFixed(1)}
            </div>
          </>
        )}
      </div>

      <ScoreHud />

      {/* Bottom-center: speed & clips */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div
          className={cn('text-white text-4xl md:text-5xl font-black italic tabular-nums transition-colors', kmh > 200 && 'text-orange-300')}
          style={{ textShadow: '0 3px 0 #000, 0 0 12px rgba(0,0,0,0.5)' }}
        >
          {kmh}
          <span className="text-sm not-italic text-white/70 ml-1">km/j</span>
        </div>
        <div className="h-1.5 w-40 rounded-full bg-black/40 overflow-hidden mt-1">
          <div className="h-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500" style={{ width: `${Math.min(100, (kmh / 250) * 100)}%` }} />
        </div>
        <div className="text-xs text-white/80 drop-shadow font-bold mt-0.5">🔶 Clip {clipsCollected}</div>
      </div>
    </>
  )
}

function TouchControls() {
  const [, force] = useState(0)
  const bind = (key: 'touchLeft' | 'touchRight' | 'touchDrift') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      input[key] = true
      force((n) => n + 1)
    },
    onPointerUp: () => {
      input[key] = false
      force((n) => n + 1)
    },
    onPointerCancel: () => {
      input[key] = false
      force((n) => n + 1)
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })
  const base =
    'pointer-events-auto touch-none select-none rounded-3xl backdrop-blur border-2 border-white/20 flex items-center justify-center font-black text-white active:bg-white/40 transition'
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-between items-end p-4 md:p-6">
      <div className="flex gap-3">
        <button className={cn(base, 'w-20 h-20 md:w-24 md:h-24 text-4xl', input.touchLeft ? 'bg-white/40' : 'bg-black/35')} {...bind('touchLeft')}>
          ◀
        </button>
        <button className={cn(base, 'w-20 h-20 md:w-24 md:h-24 text-4xl', input.touchRight ? 'bg-white/40' : 'bg-black/35')} {...bind('touchRight')}>
          ▶
        </button>
      </div>
      <button
        className={cn(
          base,
          'w-24 h-24 md:w-28 md:h-28 text-lg tracking-widest rounded-full',
          input.touchDrift ? 'bg-yellow-400/70 text-black' : 'bg-yellow-400/40',
        )}
        {...bind('touchDrift')}
      >
        DRIFT
      </button>
    </div>
  )
}

function Popups() {
  const popups = useGame((s) => s.popups)
  return (
    <div className="absolute left-1/2 top-[42%] -translate-x-1/2 flex flex-col items-center gap-1">
      {popups.map((p) => (
        <div
          key={p.id}
          className="font-black italic text-2xl md:text-3xl drop-shadow-[0_3px_0_rgba(0,0,0,0.6)] animate-[rise_1.2s_ease-out_forwards] whitespace-nowrap"
          style={{ color: p.color }}
        >
          {p.text}
        </div>
      ))}
    </div>
  )
}

function Results() {
  const { finalScore, finalBestLap, isNewBest, lapTimes, mode, setPhase, best, clipsCollected, finalPosition, finalPosBonus, standings } = useGame()
  const stars = finalScore >= 30000 ? 3 : finalScore >= 15000 ? 2 : finalScore >= 6000 ? 1 : 0
  const isRace = mode === 'race'
  const podium = ['🥇', '🥈', '🥉', '4️⃣'][finalPosition - 1] ?? ''
  const title = isRace
    ? finalPosition === 1
      ? 'JUARA! 🏆'
      : finalPosition === 2
        ? 'Runner-up! 🔥'
        : finalPosition === 3
          ? 'Podium! 👍'
          : 'Kejar Lagi 💪'
    : stars === 3
      ? 'DRIFT KING! 👑'
      : stars === 2
        ? 'Sideways Pro 🔥'
        : stars === 1
          ? 'Lumayan Ngepot 👍'
          : 'Latihan Lagi 💪'
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div className="w-full max-w-md max-h-[94vh] overflow-y-auto bg-gradient-to-b from-zinc-900 to-black rounded-3xl p-6 text-white text-center border border-white/10 shadow-2xl">
        <div className="text-xs uppercase tracking-[0.4em] text-white/50">{isRace ? 'Balapan Selesai' : 'Waktu Habis'}</div>
        {isRace && (
          <div className="text-6xl font-black italic leading-none mt-1">
            {podium} <span className="text-yellow-400">P{finalPosition}</span>
          </div>
        )}
        <div className="text-3xl font-black italic text-yellow-400 mt-1">{title}</div>
        {isRace && finalPosBonus > 0 && (
          <div className="text-sm text-purple-300 font-bold">Bonus posisi +{finalPosBonus.toLocaleString('id-ID')}</div>
        )}
        {isRace && standings.length > 0 && (
          <div className="mt-3 bg-white/5 rounded-2xl p-2 text-left text-sm">
            {standings.map((s, i) => (
              <div key={s.name} className={cn('flex items-center gap-2 px-2 py-0.5 rounded-lg', s.me && 'bg-yellow-400/15 text-yellow-300 font-black')}>
                <span className="w-5 tabular-nums">{i + 1}.</span>
                <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: s.color }} />
                <span className="flex-1">{s.name}</span>
                {i === 0 && <span>🏆</span>}
              </div>
            ))}
          </div>
        )}
        <div className="text-4xl my-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < stars ? 'text-yellow-400' : 'text-white/15'}>
              ★
            </span>
          ))}
        </div>
        <div className="text-[11px] uppercase tracking-widest text-white/50">Skor Drift</div>
        <div className="text-5xl font-black tabular-nums">{finalScore.toLocaleString('id-ID')}</div>
        {isNewBest && <div className="text-green-400 font-bold mt-1 animate-pulse">🎉 REKOR BARU!</div>}
        <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
          <div className="bg-white/5 rounded-xl p-2">
            <div className="text-white/50 text-[10px] uppercase">Lap Terbaik</div>
            <div className="font-bold font-mono">{finalBestLap !== null ? fmt(finalBestLap) : '-'}</div>
          </div>
          <div className="bg-white/5 rounded-xl p-2">
            <div className="text-white/50 text-[10px] uppercase">Clip</div>
            <div className="font-bold">{clipsCollected}</div>
          </div>
          <div className="bg-white/5 rounded-xl p-2">
            <div className="text-white/50 text-[10px] uppercase">Rekor</div>
            <div className="font-bold">{best[mode].toLocaleString('id-ID')}</div>
          </div>
        </div>
        {lapTimes.length > 0 && (
          <div className="mt-3 text-xs text-white/60 font-mono">
            {lapTimes.map((t, i) => (
              <span key={i} className="mx-1">
                L{i + 1} {fmt(t)}
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => setPhase('menu')}
            className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 font-bold transition"
          >
            Menu
          </button>
          <button
            onClick={() => {
              initAudio()
              setPhase('countdown')
            }}
            className="flex-1 py-3 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-black font-black text-lg shadow-[0_4px_0_#a16207] active:translate-y-1 active:shadow-none transition"
          >
            Main Lagi 🔁
          </button>
        </div>
      </div>
    </div>
  )
}
