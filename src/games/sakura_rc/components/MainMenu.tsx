import React, { useEffect, useState } from 'react';
import { Play, Wrench, Camera, Trophy, Flag } from 'lucide-react';
import {
  CarCustomization,
  CircuitDef,
  GameMode,
  TuningSetup,
} from '../types/rcDrift';
import { PRO_SUSPENSION_KITS, SMOKE_PRESETS } from '../data/circuitsAndCars';

interface MainMenuProps {
  circuits: CircuitDef[];
  circuit: CircuitDef;
  onSelectCircuit: (c: CircuitDef) => void;
  gameMode: GameMode;
  onSelectGameMode: (m: GameMode) => void;
  customization: CarCustomization;
  onSelectBody: (bodyId: CarCustomization['bodyId'], color: string) => void;
  tuning: TuningSetup;
  onChangeTuning: (t: TuningSetup) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  rcCredits: number;
  onStart: () => void;
  onOpenSetup: () => void;
  onOpenCameraFx: () => void;
  onOpenBMWAdjust?: () => void;
}

const BODY_SWATCHES = [
  { name: 'Bayside Blue', hex: '#0E64FF' },
  { name: 'Millennium Jade', hex: '#7C8D7E' },
  { name: 'Midnight Purple', hex: '#5B21B6' },
  { name: 'Gunmetal Grey', hex: '#475569' },
  { name: 'Pearl White', hex: '#F8FAFC' },
  { name: 'D1 Magenta', hex: '#FF2A85' },
  { name: 'Volt Lime', hex: '#CCFF00' },
];

function Segment(props: {
  label: string;
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-display font-bold tracking-widest text-slate-300 uppercase shrink-0">
        {props.label}
      </span>
      <div className="flex gap-1 bg-black/50 rounded-lg p-0.5 border border-white/10">
        {props.options.map((o) => {
          const active = props.value === o.v;
          return (
            <button
              key={o.v}
              onClick={() => props.onChange(o.v)}
              className={`px-2 py-1 rounded-md text-[10px] font-mono-tabular font-bold transition cursor-pointer ${
                active
                  ? 'bg-[#FB7185] text-black shadow-[0_0_10px_rgba(251,113,133,0.5)]'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const BODY_LABEL: Record<string, string> = {
  r34_skyline: 'SKYLINE R34 GT-R',
  r32_skyline: 'SKYLINE R32 GT-R',
  s15_silvia: 'SILVIA S15',
  rx7_fd3s: 'RX-7 FD3S',
  ae86_trueno: 'AE86 TRUENO',
  gr_supra: 'GR SUPRA A90',
};

export const MainMenu: React.FC<MainMenuProps> = ({
  circuits,
  circuit,
  onSelectCircuit,
  gameMode,
  onSelectGameMode,
  customization,
  onSelectBody,
  tuning,
  onChangeTuning,
  isMuted,
  onToggleMute,
  rcCredits,
  onStart,
  onOpenSetup,
  onOpenCameraFx,
  onOpenBMWAdjust,
}) => {
  const [best] = useState(() => {
    try {
      return {
        score: Number(localStorage.getItem('rcdrift.bestScore') || 0),
        lap: Number(localStorage.getItem('rcdrift.bestLap') || 0),
      };
    } catch {
      return { score: 0, lap: 0 };
    }
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Enter') onStart();
      else if (e.code === 'KeyT') onOpenSetup();
      else if (e.code === 'KeyF') onOpenCameraFx();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onStart, onOpenSetup, onOpenCameraFx]);

  const suspName =
    PRO_SUSPENSION_KITS.find((k) => k.id === tuning.suspension?.kitId)?.name.split('//')[0].trim() ??
    'STOCK';
  const smokeLabel = (
    tuning.smokeConfig?.preset ?? 'normal'
  ).toUpperCase();
  const smokePresetLabel =
    (SMOKE_PRESETS as Record<string, { label: string }>)[tuning.smokeConfig?.preset ?? 'normal']
      ?.label ?? smokeLabel;

  const soundValue = isMuted ? 'mute' : tuning.soundMode ?? 'rb26_soundbox';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Kelopak sakura CSS — 16 span deterministik */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 16 }).map((_, i) => {
          const left = ((i * 6.7 + 3) % 100).toFixed(2);
          const delay = (-((i * 1.37) % 12)).toFixed(2);
          const dur = (9 + ((i * 2.13) % 7)).toFixed(2);
          const scale = (0.7 + ((i * 0.53) % 0.8)).toFixed(2);
          return (
            <span
              key={i}
              className="menupetal"
              style={
                {
                  left: `${left}%`,
                  animationDelay: `${delay}s`,
                  animationDuration: `${dur}s`,
                  '--pscale': scale,
                } as React.CSSProperties
              }
            />
          );
        })}
      </div>
      <style>{`
        .menupetal{position:absolute;top:-4%;width:14px;height:12px;
          background:linear-gradient(135deg,#fbb6d4,#f472b6);
          border-radius:65% 5% 65% 65%;opacity:0;
          animation-name:petalfall;animation-timing-function:linear;animation-iteration-count:infinite;}
        @keyframes petalfall{
          0%{top:-4%;margin-left:0;transform:rotate(0deg) scale(var(--pscale,1));opacity:0;}
          8%{opacity:.95;}
          100%{top:104%;margin-left:-14vw;transform:rotate(480deg) scale(var(--pscale,1));opacity:.7;}
        }
      `}</style>

      {/* Vignette 2 lapis: teks terbaca, diorama dominan di kanan */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-black/25" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/45 via-black/10 to-transparent" />

      {/* Konten rata kiri */}
      <div className="relative h-full overflow-y-auto">
        <div className="min-h-full max-w-7xl mx-auto px-5 sm:px-10 py-6 flex flex-col justify-center">
          <div className="max-w-md">
            {/* Judul poster */}
            <div className="flex items-center gap-2 text-[#F9A8D4] text-[11px] font-mono-tabular tracking-[0.35em] uppercase">
              <Flag className="w-3.5 h-3.5" />
              <span>SAKURA GP • {BODY_LABEL[customization.bodyId] ?? 'SKYLINE GT-R'}</span>
            </div>
            <h1 className="mt-2 font-display italic font-black uppercase leading-[0.9] text-6xl sm:text-7xl text-transparent bg-clip-text bg-gradient-to-r from-[#FB923C] via-[#FB7185] to-[#F9A8D4] drop-shadow-[3px_3px_0_rgba(0,0,0,0.9)]">
              RC DRIFT
              <br />
              CIRCUIT
            </h1>

            {/* Panel setting kaca gelap */}
            <div className="mt-4 rounded-2xl bg-black/45 backdrop-blur-md ring-1 ring-white/15 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-display font-bold tracking-widest text-white uppercase">
                  STARTING GRID
                </span>
                <span className="text-[11px] font-mono-tabular font-bold text-[#CCFF00]">
                  RC$ {rcCredits.toLocaleString()}
                </span>
              </div>

              {/* Warna body */}
              <div>
                <div className="text-[10px] font-display font-bold tracking-widest text-slate-300 uppercase mb-1.5">
                  WARNA BODY
                </div>
                <div className="flex items-center gap-2">
                  {BODY_SWATCHES.map((s) => {
                    const active =
                      customization.bodyColor.toLowerCase() === s.hex.toLowerCase();
                    return (
                      <button
                        key={s.hex}
                        title={s.name}
                        onClick={() => onSelectBody(customization.bodyId, s.hex)}
                        className={`w-7 h-7 rounded-full border-2 transition cursor-pointer ${
                          active
                            ? 'border-white scale-110 shadow-[0_0_12px_rgba(255,255,255,0.6)]'
                            : 'border-white/25 hover:border-white/70 hover:scale-105'
                        }`}
                        style={{ backgroundColor: s.hex }}
                      />
                    );
                  })}
                  <div className="ml-1 flex gap-1">
                    {(['r34_skyline', 'r32_skyline'] as const).map((bid) => (
                      <button
                        key={bid}
                        onClick={() => onSelectBody(bid, customization.bodyColor)}
                        className={`px-2 py-1 rounded-md text-[10px] font-mono-tabular font-bold transition cursor-pointer ${
                          customization.bodyId === bid
                            ? 'bg-white text-black'
                            : 'bg-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        {bid === 'r34_skyline' ? 'R34' : 'R32'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Segment tuning */}
              <div className="space-y-2 border-t border-white/10 pt-3">
                <Segment
                  label="GYRO"
                  options={[
                    { v: '65', label: '65' },
                    { v: '82', label: '82' },
                    { v: '95', label: '95' },
                  ]}
                  value={String(tuning.gyroGain)}
                  onChange={(v) => onChangeTuning({ ...tuning, gyroGain: Number(v) })}
                />
                <Segment
                  label="MODE"
                  options={[
                    { v: 'tsuiso', label: 'TSUISO' },
                    { v: 'qualifying', label: 'QUALIFY' },
                    { v: 'freedrift', label: 'FREE' },
                  ]}
                  value={gameMode}
                  onChange={(v) => onSelectGameMode(v as GameMode)}
                />
                <Segment
                  label="KECEPATAN"
                  options={[
                    { v: 'normal', label: 'NORMAL' },
                    { v: 'sedang', label: 'SEDANG' },
                    { v: '2x', label: '2X' },
                  ]}
                  value={tuning.speedLevel ?? 'normal'}
                  onChange={(v) =>
                    onChangeTuning({ ...tuning, speedLevel: v as 'normal' | 'sedang' | '2x' })
                  }
                />
                <Segment
                  label="AUTO-GAS"
                  options={[
                    { v: 'on', label: 'ON' },
                    { v: 'off', label: 'OFF' },
                  ]}
                  value={tuning.autoThrottle ? 'on' : 'off'}
                  onChange={(v) => onChangeTuning({ ...tuning, autoThrottle: v === 'on' })}
                />
                <Segment
                  label="BOT AI"
                  options={[
                    { v: 'pro', label: 'PRO' },
                    { v: 'chill', label: 'SANTAI' },
                  ]}
                  value={tuning.botPace ?? 'pro'}
                  onChange={(v) =>
                    onChangeTuning({ ...tuning, botPace: v as 'pro' | 'chill' })
                  }
                />
                <Segment
                  label="SUARA"
                  options={[
                    { v: 'rb26_soundbox', label: 'RB26' },
                    { v: 'pro_brushless', label: 'BRUSH' },
                    { v: 'mute', label: 'MUTE' },
                  ]}
                  value={soundValue}
                  onChange={(v) => {
                    if (v === 'mute') {
                      if (!isMuted) onToggleMute();
                    } else {
                      onChangeTuning({
                        ...tuning,
                        soundMode: v as 'rb26_soundbox' | 'pro_brushless',
                      });
                      if (isMuted) onToggleMute();
                    }
                  }}
                />
              </div>

              {/* Sirkuit */}
              <div className="border-t border-white/10 pt-3">
                <div className="text-[10px] font-display font-bold tracking-widest text-slate-300 uppercase mb-1.5">
                  MAP / SIRKUIT PRO
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {circuits.map((c, idx) => {
                    const active = circuit.id === c.id;
                    const isHaruna = c.mapStyle === 'haruna';
                    return (
                      <button
                        key={c.id}
                        onClick={() => onSelectCircuit(c)}
                        className={`px-2 py-1.5 rounded-lg text-left transition cursor-pointer border ${
                          active
                            ? 'bg-white/15 border-white/70'
                            : 'bg-black/40 border-white/10 hover:border-white/40'
                        }`}
                      >
                        <div className={`text-[8px] font-mono-tabular ${isHaruna ? 'text-[#FDE68A]' : 'text-pink-200/60'}`}>
                          {isHaruna ? 'MAP OUTDOOR' : `TRACK 0${idx + 1}`}
                        </div>
                        <div className="text-[10px] font-display font-bold text-white leading-tight truncate">
                          {isHaruna ? 'HARUNA / AKINA' : c.name.split('//')[0].trim()}
                        </div>
                        {isHaruna && (
                          <div className="mt-0.5 text-[8px] font-mono-tabular text-[#E5C06A] truncate">
                            JALAN TOUGE • 5 HAIRPIN
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 rounded-lg bg-black/35 border border-white/10 px-2.5 py-1.5 text-[9px] font-mono-tabular text-slate-300">
                  MAP AKTIF: <span className="font-bold text-white">{circuit.mapStyle === 'haruna' ? 'HARUNA OUTDOOR / AKINA DOWNHILL' : 'AULA INDOOR / RC DRIFT ARENA'}</span>
                  <span className="block mt-0.5 text-[#F9A8D4]">MOBIL + FISIKA: SAKURA RC PRO TETAP AKTIF</span>
                </div>
              </div>

              {/* Best score & best lap */}
              <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#F59E0B] shrink-0" />
                  <div>
                    <div className="text-[9px] font-mono-tabular text-slate-400 uppercase">
                      Best Score
                    </div>
                    <div className="font-mono-tabular font-bold text-white text-sm leading-none">
                      {best.score > 0 ? best.score.toLocaleString() : '—'}
                    </div>
                  </div>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#00F0FF] shrink-0" />
                  <div>
                    <div className="text-[9px] font-mono-tabular text-slate-400 uppercase">
                      Best Lap
                    </div>
                    <div className="font-mono-tabular font-bold text-white text-sm leading-none">
                      {best.lap > 0 ? best.lap.toLocaleString() : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* START */}
              <button
                onClick={onStart}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#F97316] to-[#E11D48] text-white font-display font-extrabold text-lg tracking-[0.2em] uppercase flex items-center justify-center gap-2 shadow-[0_6px_0_#9F1239,0_12px_30px_rgba(244,63,94,0.45)] hover:brightness-110 active:translate-y-1 active:shadow-[0_2px_0_#9F1239] transition-all cursor-pointer"
              >
                <Play className="w-5 h-5 fill-white" />
                <span>START</span>
              </button>

              {/* Adjust Body BMW Button */}
              {onOpenBMWAdjust && (
                <button
                  type="button"
                  onClick={onOpenBMWAdjust}
                  className="w-full py-2.5 px-3 rounded-xl bg-pink-500/15 hover:bg-pink-500/25 border-2 border-pink-400/60 text-pink-300 font-display font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer active:scale-98 shadow-[0_0_15px_rgba(244,63,94,0.2)]"
                >
                  <span>📐</span>
                  <span>ADJUST BODY BMW GLB (P × L × T &amp; KETINGGIAN)</span>
                </button>
              )}

              {/* Shortcut setup & camera */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onOpenSetup}
                  className="rounded-xl bg-white/5 border border-white/15 px-2.5 py-2 text-left hover:bg-white/10 transition cursor-pointer"
                >
                  <div className="text-[10px] font-display font-bold text-white flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-[#00F0FF]" />
                    <span>🔧 SETUP SHEET</span>
                    <kbd className="ml-auto text-[9px] font-mono-tabular bg-white/10 rounded px-1">
                      T
                    </kbd>
                  </div>
                  <div className="mt-0.5 text-[9px] font-mono-tabular text-slate-300 truncate">
                    {suspName}
                  </div>
                </button>
                <button
                  onClick={onOpenCameraFx}
                  className="rounded-xl bg-white/5 border border-white/15 px-2.5 py-2 text-left hover:bg-white/10 transition cursor-pointer"
                >
                  <div className="text-[10px] font-display font-bold text-white flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-[#CCFF00]" />
                    <span>🎥 CAMERA &amp; FX</span>
                    <kbd className="ml-auto text-[9px] font-mono-tabular bg-white/10 rounded px-1">
                      F
                    </kbd>
                  </div>
                  <div className="mt-0.5 text-[9px] font-mono-tabular text-slate-300 truncate">
                    Smoke: {smokePresetLabel}
                  </div>
                </button>
              </div>
            </div>

            {/* Tips */}
            <div className="mt-3 text-[11px] leading-relaxed text-slate-200/90 bg-black/35 backdrop-blur-sm rounded-xl px-3 py-2 ring-1 ring-white/10">
              <span className="font-bold text-white">A/D</span> setir •{' '}
              <span className="font-bold text-white">W</span> gas •{' '}
              <span className="font-bold text-white">SPACE</span> clutch-kick •{' '}
              <span className="font-bold text-white">SHIFT</span> turbo •{' '}
              <span className="font-bold text-white">ENTER</span> start. Bonus{' '}
              <span className="font-bold text-[#CCFF00]">TANDEM</span>: tempel bumper
              AI &lt;3.5m + drift &gt;14° = +260 pts/detik &amp; multiplier naik!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
