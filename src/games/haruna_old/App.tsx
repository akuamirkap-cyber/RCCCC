import { useEffect, useRef, useState } from 'react'
import { Game, HudState } from './game/Game'
import type { TrackData } from './track/haruna'
import Minimap from './components/Minimap'
import MakingOf from './components/MakingOf'
import TrackMap from './components/TrackMap'
import PitBench from './components/PitBench'
import { DRIFT_TUNES, DRIFT_ORDER, DEFAULT_RC_SETUP } from './game/drift'

const fmt = (t: number) => {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const ms = Math.floor((t % 1) * 1000)
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

const emptyHud: HudState = {
  speed: 0,
  time: 0,
  progress: 0,
  altitude: 1084,
  gradePct: 0,
  note: '',
  noteDist: 0,
  finished: false,
  started: false,
  splits: [],
  best: null,
  drift: 0,
  driftAngle: 0,
  drifting: false,
  driftScore: 0,
  driftMode: 'pas',
  onRoad: true,
  carX: 0,
  carZ: 0,
  gyro: 0,
  turbo: 0,
  rpm: 0,
  rc: { ...DEFAULT_RC_SETUP },
  soundOn: true,
}

export default function App({ onSwitchGame }: { onSwitchGame?: () => void } = {}) {
  const mount = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [hud, setHud] = useState<HudState>(emptyHud)
  const [track, setTrack] = useState<TrackData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showIntro, setShowIntro] = useState(true)
  const [cam, setCam] = useState<'chase' | 'far' | 'hood'>('chase')
  const [docs, setDocs] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [pitOpen, setPitOpen] = useState(false)

  useEffect(() => {
    if (!mount.current) return
    let g: Game | null = null
    const id = setTimeout(() => {
      g = new Game(mount.current!)
      g.onHud = setHud
      gameRef.current = g
      setTrack(g.track)
      setLoading(false)
    }, 60)
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyP') setPitOpen((v) => !v)
    }
    addEventListener('keydown', onKey)
    return () => {
      clearTimeout(id)
      removeEventListener('keydown', onKey)
      g?.dispose()
      gameRef.current = null
    }
  }, [])

  const cycleCam = () => {
    const g = gameRef.current
    if (!g) return
    g.camMode = g.camMode === 'chase' ? 'far' : g.camMode === 'far' ? 'hood' : 'chase'
    setCam(g.camMode)
  }

  const touch = (v: Parameters<Game['setInputFromTouch']>[0]) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      gameRef.current?.setInputFromTouch(v)
    },
    onPointerUp: () => gameRef.current?.setInputFromTouch(Object.fromEntries(Object.keys(v).map((k) => [k, false]))),
    onPointerLeave: () => gameRef.current?.setInputFromTouch(Object.fromEntries(Object.keys(v).map((k) => [k, false]))),
  })

  const lengthKm = track ? track.length / 1000 : 0
  const drop = track ? track.startY - track.endY : 0

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0c1116] font-sans text-white select-none">
      <div ref={mount} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(48,36,24,0.32)_100%)]" />

      {/* Back button */}
      {onSwitchGame && (
        <button
          onClick={onSwitchGame}
          className="absolute top-4 left-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/75 hover:bg-neutral-800 text-yellow-300 border border-yellow-500/50 text-xs font-bold shadow-lg backdrop-blur-md cursor-pointer transition active:scale-95"
        >
          <span>←</span>
          <span>MENU UTAMA</span>
        </button>
      )}

      {/* ============ HUD ============ */}
      {!loading && (
        <>
          {/* Timer & split kiri atas */}
          <div className={`pointer-events-none absolute left-4 ${onSwitchGame ? 'top-14' : 'top-4'} flex flex-col gap-2`}>
            <div className="rounded-xl bg-black/55 px-4 py-2 backdrop-blur-sm ring-1 ring-white/10">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Waktu</div>
              <div className="font-mono text-3xl font-bold tabular-nums leading-tight">{fmt(hud.time)}</div>
              <div className="mt-1 flex gap-3 font-mono text-[11px] text-white/60">
                <span>S1 {hud.splits[0] ? fmt(hud.splits[0]) : '--:--'}</span>
                <span>S2 {hud.splits[1] ? fmt(hud.splits[1]) : '--:--'}</span>
              </div>
              <div className="font-mono text-[11px] text-amber-300/80">
                Best {hud.best ? fmt(hud.best) : '--:--.---'}
              </div>
            </div>
            <div className="rounded-xl bg-black/55 px-4 py-2 text-[11px] backdrop-blur-sm ring-1 ring-white/10">
              <div className="flex justify-between gap-4">
                <span className="text-white/50">Elevasi</span>
                <span className="font-mono">{hud.altitude.toFixed(0)} m</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-white/50">Gradien</span>
                <span className="font-mono">{hud.gradePct >= 0 ? '-' : '+'}{Math.abs(hud.gradePct).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-white/50">Jarak</span>
                <span className="font-mono">
                  {(hud.progress * lengthKm).toFixed(2)} / {lengthKm.toFixed(2)} km
                </span>
              </div>
            </div>
          </div>

          {/* Pacenote tengah atas */}
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 text-center">
            <div className="rounded-xl bg-black/55 px-5 py-2 backdrop-blur-sm ring-1 ring-white/10">
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">Pace Note</div>
              <div className="text-lg font-semibold text-amber-200">{hud.note}</div>
              <div className="font-mono text-xs text-white/55">{Math.max(0, hud.noteDist).toFixed(0)} m</div>
            </div>
            <div className="mx-auto mt-2 h-1.5 w-56 overflow-hidden rounded-full bg-black/50">
              <div className="h-full bg-amber-300" style={{ width: `${hud.progress * 100}%` }} />
            </div>
          </div>

          {/* Speedometer + drift meter + RC telemetri kanan bawah */}
          <div className="pointer-events-none absolute bottom-4 right-4 flex items-end gap-3">
            <div className="rounded-xl bg-black/55 px-3 py-2 text-right backdrop-blur-sm ring-1 ring-white/10">
              <div
                className="font-mono text-xs font-bold tracking-widest"
                style={{ color: hud.drifting ? '#ffd34d' : 'rgba(255,255,255,0.45)' }}
              >
                {hud.drifting ? `DRIFT! ${hud.driftAngle.toFixed(0)}°` : hud.onRoad ? 'ON ROAD' : 'OFF ROAD'}
              </div>
              {hud.drifting && (
                <div className="mx-0 my-1 h-1 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full bg-amber-300 transition-all"
                    style={{ width: `${Math.min(100, (hud.driftAngle / 40) * 100)}%` }}
                  />
                </div>
              )}
              <div className="font-mono text-5xl font-bold tabular-nums leading-none">
                {Math.round(hud.speed)}
                <span className="ml-1 text-base font-normal text-white/50">km/j</span>
              </div>
              <div className="mt-1 flex items-center justify-end gap-2 font-mono text-[11px]">
                <span className="text-white/45">
                  Skor drift <b className="text-amber-200">{Math.round(hud.driftScore).toLocaleString('id-ID')}</b>
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold text-black"
                  style={{ background: DRIFT_TUNES[hud.driftMode].color }}
                >
                  {DRIFT_TUNES[hud.driftMode].tag}
                </span>
              </div>
              {hud.driftMode === 'sakura' && (
                <div className="mt-1.5 space-y-1 border-t border-white/10 pt-1.5 font-mono text-[10px]">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-pink-200/60">GYRO {Math.abs(hud.gyro * 100).toFixed(0)}%</span>
                    <span className="h-1 w-16 overflow-hidden rounded-full bg-white/15">
                      <span className="block h-full bg-pink-400" style={{ width: `${Math.min(100, Math.abs(hud.gyro) * 100)}%` }} />
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-amber-200/70">TURBO {Math.round(hud.turbo * 100)}%</span>
                    <span className="h-1 w-16 overflow-hidden rounded-full bg-white/15">
                      <span className="block h-full bg-amber-300" style={{ width: `${hud.turbo * 100}%` }} />
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2 text-white/40">
                    <span>{hud.rc.tire.toUpperCase()} · {hud.rc.maxSteerDeg}° · {hud.soundOn ? '🔊' : '🔇'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pemilih drift engine — bawah tengah */}
          <div className="absolute bottom-4 left-1/2 w-max max-w-[96vw] -translate-x-1/2">
            <div className="rounded-xl bg-black/55 px-3 py-2 backdrop-blur-sm ring-1 ring-white/10">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/45">
                  Drift engine <span className="text-white/25">(1–5 / V)</span>
                </span>
                <span className="font-mono text-[10px]" style={{ color: DRIFT_TUNES[hud.driftMode].color }}>
                  {DRIFT_TUNES[hud.driftMode].tagline}
                </span>
              </div>
              <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
                {DRIFT_ORDER.map((id, i) => {
                  const t = DRIFT_TUNES[id]
                  const active = hud.driftMode === id
                  return (
                    <button
                      key={id}
                      onClick={() => { gameRef.current?.setDriftMode(id); gameRef.current?.sound.ensure() }}
                      title={`${t.name} — ${t.desc} | Cara: ${t.tip}`}
                      className="min-w-[74px] flex-1 rounded-lg px-2 py-1.5 text-center transition"
                      style={
                        active
                          ? { background: t.color, color: '#111', fontWeight: 800 }
                          : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.65)' }
                      }
                    >
                      <div className="text-[11px] font-bold leading-none">
                        {i + 1}·{t.tag}
                      </div>
                      <div className="mt-0.5 flex justify-center gap-0.5">
                        {DRIFT_ORDER.map((_, d) => (
                          <span
                            key={d}
                            className="h-1 w-2 rounded-full"
                            style={{ background: d <= t.level ? (active ? '#111' : t.color) : 'rgba(255,255,255,0.18)' }}
                          />
                        ))}
                      </div>
                    </button>
                  )
                })}
                <button
                  onClick={() => setPitOpen(true)}
                  title="Buka Pit Bench RC (P)"
                  className="rounded-lg px-3 py-1.5 text-center font-bold transition"
                  style={{ background: 'rgba(255,122,217,0.18)', color: '#ff7ad9', border: '1px solid rgba(255,122,217,0.4)' }}
                >
                  <div className="text-[11px] leading-none">🔧 PIT</div>
                  <div className="mt-0.5 text-[9px] font-normal opacity-70">bench</div>
                </button>
              </div>
            </div>
          </div>

          {/* Minimap kanan atas */}
          <button
            onClick={() => setMapOpen(true)}
            title="Buka peta stage lengkap"
            className="group absolute right-4 top-4 rounded-xl bg-black/55 p-2 text-left backdrop-blur-sm ring-1 ring-white/10 transition hover:ring-amber-300/50"
          >
            <Minimap track={track} carX={hud.carX} carZ={hud.carZ} progress={hud.progress} />
            <div className="mt-1 text-center text-[10px] uppercase tracking-[0.2em] text-white/45 group-hover:text-amber-200">
              榛名山 ダウンヒル · buka peta
            </div>
          </button>

          {/* Kontrol kiri bawah */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-2 text-[11px]">
            <div className="rounded-xl bg-black/55 px-3 py-2 text-white/60 ring-1 ring-white/10">
              <b className="text-white/85">W/A/S/D</b> atau panah · <b className="text-white/85">Space</b> rem tangan ·{' '}
              <b className="text-white/85">R</b> ulangi · <b className="text-white/85">C</b> kamera ·{' '}
              <b className="text-white/85">1–5/V</b> engine · <b className="text-white/85">P</b> pit ·{' '}
              <b className="text-white/85">M</b> suara
            </div>
            <div className="flex gap-2">
              <button
                onClick={cycleCam}
                className="rounded-lg bg-white/10 px-3 py-1.5 ring-1 ring-white/15 transition hover:bg-white/20"
              >
                Kamera: {cam}
              </button>
              <button
                onClick={() => gameRef.current?.restart()}
                className="rounded-lg bg-white/10 px-3 py-1.5 ring-1 ring-white/15 transition hover:bg-white/20"
              >
                Restart (R)
              </button>
              <button
                onClick={() => gameRef.current?.respawn()}
                className="rounded-lg bg-white/10 px-3 py-1.5 ring-1 ring-white/15 transition hover:bg-white/20"
              >
                Respawn
              </button>
              <button
                onClick={() => setMapOpen(true)}
                className="rounded-lg bg-amber-400/20 px-3 py-1.5 text-amber-200 ring-1 ring-amber-300/30 transition hover:bg-amber-400/30"
              >
                Peta Stage
              </button>
              <button
                onClick={() => setDocs(true)}
                className="rounded-lg bg-white/10 px-3 py-1.5 ring-1 ring-white/15 transition hover:bg-white/20"
              >
                Making Of
              </button>
              <button
                onClick={() => setPitOpen(true)}
                className="rounded-lg px-3 py-1.5 font-bold transition"
                style={{ background: 'rgba(255,122,217,0.18)', color: '#ff7ad9', border: '1px solid rgba(255,122,217,0.4)' }}
              >
                🔧 Pit (P)
              </button>
              <button
                onClick={() => gameRef.current?.setSoundEnabled(!hud.soundOn)}
                className="rounded-lg bg-white/10 px-3 py-1.5 ring-1 ring-white/15 transition hover:bg-white/20"
              >
                {hud.soundOn ? '🔊' : '🔇'}
              </button>
            </div>
          </div>

          {/* Kontrol sentuh (mobile) */}
          <div className="absolute bottom-24 left-0 right-0 flex justify-between px-6 md:hidden">
            <div className="flex gap-3">
              <button {...touch({ left: true })} className="h-16 w-16 rounded-full bg-white/15 text-2xl ring-1 ring-white/20">
                ◀
              </button>
              <button {...touch({ right: true })} className="h-16 w-16 rounded-full bg-white/15 text-2xl ring-1 ring-white/20">
                ▶
              </button>
            </div>
            <div className="flex gap-3">
              <button {...touch({ hb: true })} className="h-16 w-16 rounded-full bg-amber-400/25 text-xs ring-1 ring-white/20">
                HB
              </button>
              <button {...touch({ down: true })} className="h-16 w-16 rounded-full bg-white/15 text-xs ring-1 ring-white/20">
                REM
              </button>
              <button {...touch({ up: true })} className="h-16 w-16 rounded-full bg-emerald-400/25 text-xs ring-1 ring-white/20">
                GAS
              </button>
            </div>
          </div>
        </>
      )}

      {/* ============ Layar finish ============ */}
      {hud.finished && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[420px] rounded-2xl bg-[#121820]/95 p-8 text-center ring-1 ring-white/15">
            <div className="text-xs uppercase tracking-[0.3em] text-amber-300">Stage Selesai</div>
            <h2 className="mt-1 text-2xl font-bold">Haruna Downhill</h2>
            <div className="mt-4 font-mono text-5xl font-bold text-amber-200">{fmt(hud.time)}</div>
            <div className="mt-3 flex justify-center gap-4 font-mono text-xs text-white/60">
              <span>S1 {hud.splits[0] ? fmt(hud.splits[0]) : '--'}</span>
              <span>S2 {hud.splits[1] ? fmt(hud.splits[1]) : '--'}</span>
              <span>Best {hud.best ? fmt(hud.best) : '--'}</span>
            </div>
            <div className="mt-2 rounded-xl bg-white/5 px-3 py-2 font-mono text-xs ring-1 ring-white/10">
              <span className="text-white/50">Skor drift </span>
              <b className="text-amber-200">{Math.round(hud.driftScore).toLocaleString('id-ID')}</b>
              <span className="text-white/35"> · {DRIFT_TUNES[hud.driftMode].name}</span>
            </div>
            <button
              onClick={() => gameRef.current?.restart()}
              className="mt-6 w-full rounded-xl bg-amber-400 py-3 font-semibold text-black transition hover:bg-amber-300"
            >
              Jalan Lagi (R)
            </button>
          </div>
        </div>
      )}

      {/* ============ Intro / Loading ============ */}
      {(loading || showIntro) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b1016]/95 p-6">
          <div className="max-w-2xl rounded-2xl bg-[#121a22] p-8 ring-1 ring-white/10">
            {onSwitchGame && (
              <button
                onClick={onSwitchGame}
                className="mb-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-yellow-300 border border-yellow-400/40 text-xs font-bold transition cursor-pointer active:scale-95"
              >
                <span>←</span>
                <span>PILIH GAME LAIN / MENU UTAMA</span>
              </button>
            )}
            <div className="text-xs uppercase tracking-[0.35em] text-amber-300">Rally Stage · Gunma, Japan</div>
            <h1 className="mt-2 text-4xl font-black leading-tight">
              MT. HARUNA DOWNHILL
              <span className="ml-3 text-xl font-light text-white/50">榛名山 / “Akina”</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Rekonstruksi 3D turunan Jalan Prefektur Gunma No. 33 dari Danau Haruna menuju kawasan Kuil Haruna —
              trek touge legendaris dengan <b>lima hairpin beruntun</b>, seksi S cepat di hutan cedar, “gutter
              hairpin”, dan gradien rata-rata −7%. Gaya visual & kamera terinspirasi <i>art of rally</i>.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                ['Panjang', track ? `${lengthKm.toFixed(2)} km` : '…'],
                ['Turun', track ? `${drop.toFixed(0)} m` : '…'],
                ['Tikungan', track ? `${track.corners.length}` : '…'],
                ['Permukaan', 'Aspal'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
                  <div className="text-[10px] uppercase tracking-wider text-white/45">{k}</div>
                  <div className="font-mono text-lg">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">
                Drift engine — racikan pro-drifter (bisa diganti kapan pun: 1–5 / V · P = pit RC)
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {DRIFT_ORDER.map((id, i) => {
                  const t = DRIFT_TUNES[id]
                  const active = hud.driftMode === id
                  return (
                    <button
                      key={id}
                      onClick={() => gameRef.current?.setDriftMode(id)}
                      className="rounded-xl px-3 py-2 text-left ring-1 transition"
                      style={
                        active
                          ? { background: `${t.color}22`, borderColor: t.color, borderWidth: 1 }
                          : { background: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'transparent' }
                      }
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="rounded px-1 font-mono text-[10px] font-bold text-black"
                          style={{ background: t.color }}
                        >
                          {i + 1}
                        </span>
                        <span className="text-xs font-bold">{t.tag}</span>
                      </div>
                      <div className="mt-1 text-[11px] leading-snug text-white/60">{t.tagline}</div>
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 text-[11px] leading-relaxed text-white/55">
                <b style={{ color: DRIFT_TUNES[hud.driftMode].color }}>{DRIFT_TUNES[hud.driftMode].name}</b> —{' '}
                {DRIFT_TUNES[hud.driftMode].desc}{' '}
                <span className="text-white/40">Cara: {DRIFT_TUNES[hud.driftMode].tip}</span>
              </div>
            </div>
            <div className="mt-4 text-xs text-white/50">
              Kontrol: <b className="text-white/80">W/↑</b> gas · <b className="text-white/80">S/↓</b> rem ·{' '}
              <b className="text-white/80">A/D</b> setir · <b className="text-white/80">Space</b> rem tangan (drift) ·{' '}
              <b className="text-white/80">C</b> ganti kamera · <b className="text-white/80">R</b> restart ·{' '}
              <b className="text-white/80">V</b> ganti drift engine
            </div>
            <div className="mt-6 flex gap-3">
              <button
                disabled={loading}
                onClick={() => setShowIntro(false)}
                className="flex-1 rounded-xl bg-amber-400 py-3 text-lg font-bold text-black transition hover:bg-amber-300 disabled:cursor-wait disabled:bg-white/15 disabled:text-white/50"
              >
                {loading ? 'Membangun gunung…' : 'MULAI TURUN'}
              </button>
              <button
                onClick={() => setMapOpen(true)}
                className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white/20"
              >
                🗺 Peta Stage
              </button>
              <button
                onClick={() => setDocs(true)}
                className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white/20"
              >
                Cara dibuat →
              </button>
            </div>
          </div>
        </div>
      )}

      {mapOpen && (
        <TrackMap
          track={track}
          carX={hud.carX}
          carZ={hud.carZ}
          progress={hud.progress}
          onClose={() => setMapOpen(false)}
        />
      )}

      {docs && <MakingOf track={track} onClose={() => setDocs(false)} />}

      <PitBench
        open={pitOpen}
        setup={hud.rc}
        soundOn={hud.soundOn}
        onChange={(patch) => gameRef.current?.setRcSetup(patch)}
        onToggleSound={() => gameRef.current?.setSoundEnabled(!hud.soundOn)}
        onClose={() => setPitOpen(false)}
      />
    </div>
  )
}
