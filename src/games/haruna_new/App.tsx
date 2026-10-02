import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game as GameT, HudData, TimeOfDay, CamMode, Note } from './game/Game';
import type { TrackData } from './track/haruna';
import MakingOf from './components/MakingOf';
import DriftPanel from './components/DriftPanel';
import PitBench from './components/PitBench';
import DriftHud from './components/DriftHud';
import { DRIFT_LABEL } from './game/drift';

function fmt(t: number | null | undefined) {
  if (t == null || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
function fmtDelta(d: number | null) {
  if (d == null) return '';
  return `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`;
}

const GRADE_ANGLE: Record<string, number> = { HAIRPIN: Math.PI, '1': 2.1, '2': 1.75, '3': 1.4, '4': 1.05, '5': 0.75, '6': 0.45 };

function NoteIcon({ note, size = 64 }: { note: Note; size?: number }) {
  const a = GRADE_ANGLE[note.grade] ?? 1;
  const r = note.grade === 'HAIRPIN' ? 10 : 15;
  const sgn = note.dir === 'RIGHT' ? 1 : -1;
  const cx = 32 + sgn * r;
  const cy = 38;
  const ex = cx + sgn * -r * Math.cos(a);
  const ey = cy - r * Math.sin(a);
  const tx = sgn * Math.sin(a);
  const ty = -Math.cos(a);
  const nx = -ty;
  const ny = tx;
  const large = a > Math.PI ? 1 : 0;
  const sweep = sgn > 0 ? 1 : 0;
  const tip = [ex + tx * 8, ey + ty * 8];
  const b1 = [ex + nx * 6, ey + ny * 6];
  const b2 = [ex - nx * 6, ey - ny * 6];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <path
        d={`M32 60 L32 ${cy} A ${r} ${r} 0 ${large} ${sweep} ${ex} ${ey}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <polygon points={`${tip.join(',')} ${b1.join(',')} ${b2.join(',')}`} fill="currentColor" />
    </svg>
  );
}

function Profile({ data, progress, className = '' }: { data: { d: number; alt: number }[]; progress: number; className?: string }) {
  if (!data.length) return null;
  const maxA = Math.max(...data.map((p) => p.alt));
  const minA = Math.min(...data.map((p) => p.alt));
  const W = 300;
  const Hh = 70;
  const pts = data.map((p, i) => [(i / (data.length - 1)) * W, 6 + (1 - (p.alt - minA) / (maxA - minA)) * (Hh - 12)]);
  const line = pts.map((p) => p.join(',')).join(' ');
  const px = progress * W;
  const k = Math.min(data.length - 1, Math.round(progress * (data.length - 1)));
  const py = pts[k][1];
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className={className} preserveAspectRatio="none">
      <polygon points={`0,${Hh} ${line} ${W},${Hh}`} fill="rgba(255,255,255,0.12)" />
      <polyline points={line} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={1.6} />
      <rect x={0} y={0} width={px} height={Hh} fill="rgba(255,210,63,0.12)" />
      <circle cx={px} cy={py} r={4} fill="#ffd23f" stroke="#111" strokeWidth={1.2} />
    </svg>
  );
}

export default function App({ onSwitchGame }: { onSwitchGame?: () => void } = {}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameT | null>(null);
  const [loading, setLoading] = useState(true);
  const [hud, setHud] = useState<HudData | null>(null);
  const [stats, setStats] = useState<GameT['stats'] | null>(null);
  const [profile, setProfile] = useState<{ d: number; alt: number }[]>([]);
  const [trackData, setTrackData] = useState<TrackData | null>(null);
  const [showMaking, setShowMaking] = useState(false);
  const [showPit, setShowPit] = useState(false);
  const [isTouch] = useState(() => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));

  useEffect(() => {
    let game: GameT | null = null;
    let cancelled = false;
    const id = setTimeout(async () => {
      const { Game } = await import('./game/Game');
      if (cancelled || !mountRef.current) return;
      game = new Game(mountRef.current, mapRef.current, setHud);
      gameRef.current = game;
      setStats(game.stats);
      setProfile(game.profile());
      setTrackData(game.track.data);
      setLoading(false);
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(id);
      game?.dispose();
    };
  }, []);

  const g = gameRef.current;
  const phase = hud?.phase ?? 'menu';
  const start = () => g?.startRace();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && gameRef.current) {
        const p = gameRef.current.phase;
        if (p === 'menu' || p === 'finished') gameRef.current.startRace();
      }
      if (e.key === 'Escape' && gameRef.current) gameRef.current.toMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hairpinNo = useMemo(() => {
    if (!hud?.note?.hairpinNo) return null;
    return hud.note.hairpinNo;
  }, [hud?.note?.hairpinNo]);

  const touchBtn = (k: 'up' | 'down' | 'left' | 'right' | 'hb', label: string, cls = '') => (
    <button
      className={`pointer-events-auto select-none rounded-2xl bg-black/40 text-white/90 backdrop-blur-sm active:bg-white/30 border border-white/20 font-bold ${cls}`}
      onTouchStart={(e) => {
        e.preventDefault();
        g?.setTouch(k, true);
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        g?.setTouch(k, false);
      }}
      onTouchCancel={() => g?.setTouch(k, false)}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1a1612] font-sans text-white select-none">
      <div ref={mountRef} className="absolute inset-0" />

      {/* wash film hangat (sangat tipis) — menyatukan seluruh palet */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,226,184,0.28),rgba(186,205,216,0.16))] mix-blend-soft-light" />
      {/* vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(40,32,24,0.26)_100%)]" />

      {/* minimap (always mounted so the game can draw into it) */}
      <div
        className={`pointer-events-none absolute right-4 top-4 rounded-2xl bg-black/35 p-2 backdrop-blur-sm transition-opacity ${
          loading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <canvas ref={mapRef} className="h-[150px] w-[150px] md:h-[200px] md:w-[200px]" />
        <div className="mt-1 flex justify-between px-1 text-[10px] uppercase tracking-widest text-white/60">
          <span>Danau Haruna</span>
          <span>Ikaho</span>
        </div>
      </div>

      {/* LOADING */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#f2cfa8]">
          <div className="text-6xl font-black tracking-tight text-[#2b1d14]">榛名山</div>
          <div className="mt-2 text-sm font-semibold uppercase tracking-[0.4em] text-[#2b1d14]/80">Mt. Haruna Downhill</div>
          <div className="mt-8 h-1 w-56 overflow-hidden rounded bg-black/15">
            <div className="h-full w-1/3 animate-[load_1.2s_ease-in-out_infinite] bg-[#2b1d14]" />
          </div>
          <div className="mt-3 text-xs text-[#2b1d14]/70">Membentuk terrain, mengaspal Route 33, menanam hutan...</div>
          <style>{`@keyframes load{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
        </div>
      )}

      {/* MENU */}
      {!loading && phase === 'menu' && (
        <div className="absolute inset-0 flex items-stretch">
          <div className="pointer-events-auto m-4 flex w-full max-w-md flex-col overflow-y-auto rounded-3xl bg-[#1d1814]/80 p-6 shadow-2xl backdrop-blur-md md:m-8">
            {onSwitchGame && (
              <button
                onClick={onSwitchGame}
                className="mb-3 self-start inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#f0b98a] border border-[#f0b98a]/40 text-xs font-bold transition cursor-pointer active:scale-95"
              >
                <span>←</span>
                <span>PILIH GAME LAIN / MENU UTAMA</span>
              </button>
            )}
            <div className="text-xs font-bold uppercase tracking-[0.35em] text-[#f0b98a]">Stage · Jepang · Gunma</div>
            <h1 className="mt-2 text-5xl font-black leading-none tracking-tight">
              HARUNA <span className="text-[#f0b98a]">榛名山</span>
            </h1>
            <p className="mt-2 text-sm text-white/70">
              Turunan Mt. Haruna (a.k.a. <i>Akina</i>) — Gunma Prefectural Route 33. Start dari tepi Danau Haruna, lalu
              turun lewat bagian cepat, straight panjang, <b>五連続ヘアピン (5 hairpin berturut-turut)</b>, sampai ke
              Ikaho.
            </p>

            {stats && (
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[
                  ['Panjang', `${(stats.length / 1000).toFixed(2)} km`],
                  ['Turun', `${Math.round(stats.drop)} m`],
                  ['Tikungan', `${stats.corners}`],
                  ['Hairpin', `${stats.hairpins}`],
                  ['Pohon', `${(stats.trees / 1000).toFixed(1)}k`],
                  ['Rekor', fmt(hud?.best)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-white/5 px-2 py-2">
                    <div className="text-[10px] uppercase tracking-widest text-white/50">{k}</div>
                    <div className="text-base font-bold">{v}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-xl bg-white/5 p-3">
              <div className="mb-1 flex justify-between text-[10px] uppercase tracking-widest text-white/50">
                <span>Profil elevasi</span>
                <span>
                  {profile.length ? `${Math.round(profile[0].alt)} m → ${Math.round(profile[profile.length - 1].alt)} m` : ''}
                </span>
              </div>
              <Profile data={profile} progress={0} className="h-16 w-full" />
            </div>

            <div className="mt-4">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-white/50">Waktu</div>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    ['siang', 'Siang'],
                    ['pagi', 'Pagi'],
                    ['sore', 'Senja'],
                    ['malam', 'Malam'],
                  ] as [TimeOfDay, string][]
                ).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => g?.setTimeOfDay(k)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                      hud?.tod === k ? 'bg-[#f0b98a] text-[#1d1814]' : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-white/50">Kamera</div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['rally', 'Rally'],
                    ['chase', 'Chase'],
                    ['top', 'Atas'],
                  ] as [CamMode, string][]
                ).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => g?.setCam(k)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                      hud?.cam === k ? 'bg-[#f0b98a] text-[#1d1814]' : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <DriftPanel game={g} drift={hud?.drift} onPit={() => setShowPit(true)} />

            <button
              onClick={start}
              className="mt-6 rounded-2xl bg-[#f0b98a] py-4 text-xl font-black uppercase tracking-widest text-[#1d1814] shadow-lg transition hover:scale-[1.02] hover:bg-[#ffc89c] active:scale-95"
            >
              Mulai Stage ▸
            </button>
            <button
              onClick={() => setShowMaking(true)}
              className="mt-2 rounded-2xl bg-white/10 py-3 text-sm font-bold uppercase tracking-widest ring-1 ring-white/15 transition hover:bg-white/20"
            >
              📐 Making Of — cara trek dibuat
            </button>

            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/60">
              <span><b className="text-white">W / ↑</b> gas</span>
              <span><b className="text-white">S / ↓</b> rem / mundur</span>
              <span><b className="text-white">A D / ← →</b> setir</span>
              <span><b className="text-white">Spasi</b> rem tangan</span>
              <span><b className="text-white">R</b> reset (+5 dtk)</span>
              <span><b className="text-white">C</b> ganti kamera</span>
              <span><b className="text-white">T</b> ganti waktu</span>
              <span><b className="text-white">G</b> ganti mode drift</span>
              <span><b className="text-white">M</b> mute</span>
            </div>
            <div className="mt-4 text-[10px] leading-relaxed text-white/35">
              Mobil: Toyota Sprinter Trueno AE86 "panda" — 藤原とうふ店. Trek dibangun prosedural dari mini-DSL
              {' '}lurus/busur (rekonstruksi karakter Route 33, bukan trace GPS): tepi danau, keluar kaldera, seksi teknis,
              lurusan panjang, lima hairpin beruntun (lurusan pendek antara #4 dan #5), lalu S-bend ke Ikaho. Gunung
              dibentuk dari jalan (cut-and-fill), gutter beton di sepanjang tepi.
            </div>
          </div>
        </div>
      )}

      {/* RACE HUD */}
      {!loading && hud && phase !== 'menu' && (
        <>
          {/* Back button during race */}
          {onSwitchGame && (
            <button
              onClick={onSwitchGame}
              className="pointer-events-auto absolute top-4 left-4 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/75 hover:bg-[#1d1814] text-[#f0b98a] border border-[#f0b98a]/50 text-xs font-bold shadow-lg backdrop-blur-md cursor-pointer transition active:scale-95"
            >
              <span>←</span>
              <span>MENU UTAMA</span>
            </button>
          )}

          {/* timer + splits */}
          <div className={`pointer-events-none absolute left-4 ${onSwitchGame ? 'top-14' : 'top-4'} min-w-[210px] rounded-2xl bg-black/35 p-3 backdrop-blur-sm`}>
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60">Haruna · Downhill</div>
            <div className="font-mono text-4xl font-black tabular-nums">{fmt(hud.time)}</div>
            {hud.penalty > 0 && <div className="text-xs font-bold text-red-300">+{hud.penalty}s penalti ({hud.resets} reset)</div>}
            <div className="mt-2 space-y-0.5">
              {hud.splits.map((s) => (
                <div key={s.name} className="flex items-center justify-between gap-3 text-xs">
                  <span className={s.time != null ? 'text-white/90' : 'text-white/40'}>{s.name}</span>
                  <span className="font-mono tabular-nums">
                    {s.time != null ? fmt(s.time) : '—'}
                    {s.delta != null && (
                      <span className={`ml-1 ${s.delta < 0 ? 'text-emerald-300' : 'text-red-300'}`}>{fmtDelta(s.delta)}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* pacenote */}
          {hud.note && phase === 'racing' && (
            <div className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#f5efe0]/90 px-4 py-2 text-[#1d1814] shadow-lg">
              <NoteIcon note={hud.note} size={54} />
              <div>
                <div className="text-2xl font-black leading-none">{hud.note.text}</div>
                <div className="text-xs font-bold text-[#1d1814]/60">
                  {hud.note.dist > 5 ? `${Math.round(hud.note.dist / 10) * 10} m` : 'SEKARANG'}
                  {hud.nextNote && <span className="ml-2">→ lalu {hud.nextNote.text}</span>}
                </div>
              </div>
              {hud.nextNote && (
                <div className="opacity-50">
                  <NoteIcon note={hud.nextNote} size={36} />
                </div>
              )}
            </div>
          )}

          {/* hairpin banner */}
          {hud.hairpinZone && phase === 'racing' && (
            <div className="pointer-events-none absolute left-1/2 top-[92px] -translate-x-1/2 rounded-full bg-[#c0392b]/90 px-4 py-1 text-sm font-black tracking-widest shadow">
              五連続ヘアピン {hairpinNo ? `· HAIRPIN ${hairpinNo}/5` : ''}
            </div>
          )}

          {/* drift HUD */}
          {phase === 'racing' && <DriftHud d={hud.drift} />}

          {/* countdown */}
          {phase === 'countdown' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div key={Math.ceil(hud.countdown)} className="text-[140px] font-black text-white drop-shadow-[0_6px_0_rgba(0,0,0,0.35)]">
                {hud.countdown > 0.2 ? Math.ceil(hud.countdown - 0.2) : 'GO!'}
              </div>
            </div>
          )}

          {/* speedo */}
          <div className="pointer-events-none absolute bottom-4 right-4 w-[200px] rounded-2xl bg-black/35 p-3 backdrop-blur-sm">
            <div className="flex items-end justify-between">
              <div>
                <div className="font-mono text-5xl font-black leading-none tabular-nums">{Math.round(hud.speed)}</div>
                <div className="text-[10px] uppercase tracking-widest text-white/60">km/h</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-4xl font-black leading-none text-[#f0b98a]">{hud.gear}</div>
                <div className="text-[10px] uppercase tracking-widest text-white/60">gigi</div>
              </div>
            </div>
            <div className="mt-2 flex h-2 gap-[2px]">
              {Array.from({ length: 16 }).map((_, i) => {
                const on = hud.rpm / 8500 > i / 16;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm ${on ? (i > 12 ? 'bg-red-400' : i > 9 ? 'bg-amber-300' : 'bg-white') : 'bg-white/15'}`}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-white/50">
              <span>{Math.round(hud.rpm)} rpm</span>
              <span>{hud.onRoad ? 'Aspal' : 'Rumput'}</span>
            </div>
          </div>

          {/* elevation / progress */}
          <div className={`pointer-events-none absolute ${isTouch ? 'bottom-40' : 'bottom-4'} left-4 w-[280px] rounded-2xl bg-black/35 p-3 backdrop-blur-sm`}>
            <div className="flex justify-between text-[10px] uppercase tracking-widest text-white/60">
              <span>{Math.round(hud.alt)} m dpl</span>
              <span>sisa {(hud.distLeft / 1000).toFixed(2)} km</span>
            </div>
            <Profile data={profile} progress={hud.progress} className="mt-1 h-12 w-full" />
          </div>

          {/* top-right quick buttons */}
          <div className="pointer-events-auto absolute right-4 top-[200px] flex flex-col gap-2 md:top-[250px]">
            <button onClick={() => g?.cycleCam()} className="rounded-xl bg-black/40 px-3 py-1.5 text-xs font-bold backdrop-blur-sm hover:bg-black/60">
              📷 {hud.cam}
            </button>
            <button onClick={() => g?.cycleDrift()} className="rounded-xl bg-[#f0b98a]/80 px-3 py-1.5 text-xs font-bold text-[#1d1814] backdrop-blur-sm hover:bg-[#f0b98a]">
              🔥 drift: {DRIFT_LABEL[hud.drift.mode]}
            </button>
            <button onClick={() => g?.toggleMute()} className="rounded-xl bg-black/40 px-3 py-1.5 text-xs font-bold backdrop-blur-sm hover:bg-black/60">
              {hud.muted ? '🔇' : '🔊'} suara
            </button>
            <button onClick={() => g?.resetCar()} className="rounded-xl bg-black/40 px-3 py-1.5 text-xs font-bold backdrop-blur-sm hover:bg-black/60">
              ↺ reset
            </button>
            <button onClick={() => g?.toMenu()} className="rounded-xl bg-black/40 px-3 py-1.5 text-xs font-bold backdrop-blur-sm hover:bg-black/60">
              ☰ menu
            </button>
          </div>

          {/* finish */}
          {phase === 'finished' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="pointer-events-auto w-[92%] max-w-sm rounded-3xl bg-[#1d1814]/90 p-6 text-center shadow-2xl backdrop-blur-md">
                <div className="text-xs font-bold uppercase tracking-[0.35em] text-[#f0b98a]">Stage selesai · Ikaho</div>
                <div className="mt-2 font-mono text-5xl font-black tabular-nums">{fmt(hud.finishTime)}</div>
                {hud.best != null && hud.finishTime != null && hud.finishTime <= hud.best + 1e-6 ? (
                  <div className="mt-1 text-sm font-bold text-emerald-300">★ Rekor baru!</div>
                ) : (
                  <div className="mt-1 text-sm text-white/60">Rekor: {fmt(hud.best)}</div>
                )}
                <div className="mt-3 text-xs text-white/60">
                  Reset: {hud.resets} · Penalti: {hud.penalty}s
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button onClick={start} className="rounded-xl bg-[#f0b98a] py-3 font-black text-[#1d1814] hover:bg-[#ffc89c]">
                    Ulangi
                  </button>
                  <button onClick={() => g?.toMenu()} className="rounded-xl bg-white/10 py-3 font-bold hover:bg-white/20">
                    Menu
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* cut warning */}
          {hud.cut && (
            <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded-xl bg-red-600/90 px-5 py-2 text-center font-black shadow-lg">
              POTONG JALUR — progres tidak dihitung
              <div className="text-xs font-bold opacity-80">Kembali ke jalur atau tekan R untuk reset</div>
            </div>
          )}

          {/* impact flash */}
          {hud.impact > 0.3 && <div className="pointer-events-none absolute inset-0 bg-red-500/10" />}

          {/* touch controls */}
          {isTouch && phase !== 'finished' && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
              <div className="flex gap-3">
                {touchBtn('left', '◀', 'h-20 w-20 text-3xl')}
                {touchBtn('right', '▶', 'h-20 w-20 text-3xl')}
              </div>
              <div className="mb-[150px] mr-0 flex flex-col items-end gap-3 md:mb-[140px]">
                {touchBtn('hb', 'HB', 'h-14 w-20 text-sm')}
                <div className="flex gap-3">
                  {touchBtn('down', 'REM', 'h-20 w-20 text-sm')}
                  {touchBtn('up', 'GAS', 'h-20 w-24 text-lg bg-emerald-600/50')}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showMaking && <MakingOf track={trackData} onClose={() => setShowMaking(false)} />}
      <PitBench game={g} open={showPit && phase === 'menu'} onClose={() => setShowPit(false)} />
    </div>
  );
}
