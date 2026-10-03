import { useState, useEffect } from 'react';
import HarunaNewApp from './games/haruna_new/App';
import HarunaOldApp from './games/haruna_old/App';
import ProDriftApp from './games/pro_drift/ProDriftApp';
import EbisuApp from './games/ebisu/EbisuApp';
import SakuraDriftApp from './games/sakura_rc/App';
import { PromptDownloadModal } from './components/PromptDownloadModal';
import { DRIFT_PROMPTS, downloadFile } from './data/driftPrompts';
import { BMWAdjustmentModal } from './components/BMWAdjustmentModal';
import {
  type BMWModeKey,
  type BMWAdjustment,
  loadBMWAdjustment,
  subscribeBMWAdjustment,
} from './utils/bmwCar';

type GameSelection = 'menu' | 'haruna_new' | 'haruna_old' | 'pro_drift' | 'ebisu' | 'sakura';

export default function App() {
  const [selectedGame, setSelectedGame] = useState<GameSelection>('menu');
  const [showPhysicsGuide, setShowPhysicsGuide] = useState(false);
  const [showOtherGames, setShowOtherGames] = useState(true);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [modalPromptId, setModalPromptId] = useState<string>('haruna_new');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // BMW GLB Adjustment Modal state across the 3 modes
  const [bmwModalMode, setBmwModalMode] = useState<BMWModeKey | null>(null);
  const [bmwAdjs, setBmwAdjs] = useState<Record<BMWModeKey, BMWAdjustment>>(() => ({
    pro_drift: loadBMWAdjustment('pro_drift'),
    sakura_rc: loadBMWAdjustment('sakura_rc'),
    ebisu: loadBMWAdjustment('ebisu'),
  }));

  useEffect(() => {
    const u1 = subscribeBMWAdjustment('pro_drift', (adj) =>
      setBmwAdjs((prev) => ({ ...prev, pro_drift: adj }))
    );
    const u2 = subscribeBMWAdjustment('sakura_rc', (adj) =>
      setBmwAdjs((prev) => ({ ...prev, sakura_rc: adj }))
    );
    const u3 = subscribeBMWAdjustment('ebisu', (adj) =>
      setBmwAdjs((prev) => ({ ...prev, ebisu: adj }))
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleDownloadPrompt = (promptId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const prompt = DRIFT_PROMPTS.find((p) => p.id === promptId);
    if (prompt) {
      downloadFile(prompt.filename, prompt.markdownContent);
      showToast(`Mengunduh ${prompt.filename}...`);
    }
  };

  const handleOpenPromptModal = (promptId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setModalPromptId(promptId);
    setIsPromptModalOpen(true);
  };

  // Render game yang dipilih
  if (selectedGame === 'haruna_new') {
    return <HarunaNewApp onSwitchGame={() => setSelectedGame('menu')} />;
  }

  if (selectedGame === 'haruna_old') {
    return <HarunaOldApp onSwitchGame={() => setSelectedGame('menu')} />;
  }

  if (selectedGame === 'pro_drift') {
    return <ProDriftApp onSwitchGame={() => setSelectedGame('menu')} />;
  }

  if (selectedGame === 'ebisu') {
    return <EbisuApp onSwitchGame={() => setSelectedGame('menu')} />;
  }

  if (selectedGame === 'sakura') {
    return <SakuraDriftApp onSwitchGame={() => setSelectedGame('menu')} />;
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-gradient-to-br from-slate-950 via-neutral-900 to-black text-white font-sans selection:bg-amber-400 selection:text-black">
      {/* Background visual accents */}
      <div className="absolute inset-0 pointer-events-none opacity-25 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-amber-500/25 blur-3xl" />
        <div className="absolute top-1/2 -right-40 w-96 h-96 rounded-full bg-orange-600/25 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[120] px-4 py-2.5 rounded-2xl bg-neutral-900 border border-amber-400/60 text-amber-300 text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <span>📥</span>
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 sm:py-12 flex flex-col min-h-screen justify-between">
        {/* Header */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold uppercase tracking-wider text-amber-300">
            <span>🏁</span>
            <span>Touge Rally &amp; RC Drift Arcade Collection</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight drop-shadow-md">
            PILIH GAME: FILE LAMA ATAU FILE BARU
          </h1>
          <p className="text-sm sm:text-base text-neutral-300 max-w-2xl mx-auto leading-relaxed">
            Mainkan update terbaru <strong className="text-amber-300">File Baru (b.zip)</strong> dengan audio sintetis 4A-GE &amp; guardrails 3D, atau <strong className="text-sky-300">File Lama (a.zip)</strong> dengan minimap &amp; 5 mode drift.
          </p>

          {/* Quick Action Button: Download Prompts */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                setModalPromptId('haruna_new');
                setIsPromptModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-neutral-800/90 hover:bg-neutral-800 border border-amber-500/50 hover:border-amber-400 text-amber-300 text-xs font-bold transition shadow-lg flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <span>📥</span>
              <span>DOWNLOAD PROMPT SISTEM DRIFT ({DRIFT_PROMPTS.length} MODE LENGKAP)</span>
            </button>
          </div>
        </header>

        {/* HERO CARDS: FILE BARU (b.zip) vs FILE LAMA (a.zip) */}
        <div className="my-8 space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span>Pilihan Utama (a.zip &amp; b.zip)</span>
            </div>
            <span className="text-[11px] text-neutral-500 font-mono">Bisa beralih kapan saja lewat tombol menu</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CARD 1: FILE BARU (b.zip) */}
            <div className="group relative rounded-3xl bg-gradient-to-b from-neutral-900/95 to-neutral-950/95 border-2 border-amber-500/70 hover:border-amber-400 transition-all duration-300 p-6 sm:p-7 flex flex-col justify-between shadow-2xl hover:shadow-amber-500/20 hover:-translate-y-1">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-400 to-orange-500 text-neutral-950 rounded-full shadow-md">
                    ✨ FILE BARU (b.zip)
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-neutral-800 text-amber-300 border border-neutral-700">
                    b.zip · Update Baru
                  </span>
                </div>

                <div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white group-hover:text-amber-300 transition-colors">
                    HARUNA 榛名山 (Mt. Akina)
                  </h2>
                  <p className="text-xs sm:text-sm font-semibold text-amber-400 mt-1 uppercase tracking-wide">
                    Toyota AE86 "Panda" · Gunma Route 33 Downhill 3D
                  </p>
                </div>

                <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                  Update termutakhir touge downhill Gunung Haruna (Akina). Menggunakan <strong className="text-white">Toyota Sprinter Trueno AE86</strong> dengan audio mesin sintetis 4A-GE, guardrails 3D, selokan gutter drift, lima hairpin beruntun (五連続ヘアピン), dan 4 pilihan waktu.
                </p>

                <div className="space-y-2 pt-1">
                  <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Fitur Update Baru:</div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] font-medium">
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-amber-300 flex items-center gap-1.5">
                      <span>🔊</span>
                      <span>Audio Sintetis 4A-GE</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 flex items-center gap-1.5">
                      <span>🛡️</span>
                      <span>3D Guardrails &amp; Gutter</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 flex items-center gap-1.5">
                      <span>⚡</span>
                      <span>5 Hairpin Beruntun</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 flex items-center gap-1.5">
                      <span>🌤️</span>
                      <span>4 Suasana Waktu (Malam/Senja)</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 flex items-center gap-1.5">
                      <span>🧭</span>
                      <span>Pacenotes Co-Driver</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 flex items-center gap-1.5">
                      <span>🎥</span>
                      <span>3 Mode Kamera (Rally/Chase/Top)</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-6 border-t border-neutral-800 space-y-3">
                {/* Prompt actions */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={(e) => handleDownloadPrompt('haruna_new', e)}
                    className="py-2 px-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-bold border border-amber-500/30 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Unduh file prompt teknis b.zip"
                  >
                    <span>📥</span>
                    <span>Unduh Prompt</span>
                  </button>
                  <button
                    onClick={(e) => handleOpenPromptModal('haruna_new', e)}
                    className="py-2 px-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-medium border border-neutral-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Lihat isi prompt dan salin"
                  >
                    <span>👁️</span>
                    <span>Lihat / Copy</span>
                  </button>
                </div>

                {/* Main Play Button */}
                <button
                  onClick={() => setSelectedGame('haruna_new')}
                  className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 text-neutral-950 font-black text-sm uppercase tracking-wider shadow-lg hover:shadow-amber-400/25 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="text-base">🚀</span>
                  <span>MAIN FILE BARU (b.zip)</span>
                </button>
              </div>
            </div>

            {/* CARD 2: FILE LAMA (a.zip) */}
            <div className="group relative rounded-3xl bg-gradient-to-b from-neutral-900/95 to-neutral-950/95 border-2 border-sky-500/70 hover:border-sky-400 transition-all duration-300 p-6 sm:p-7 flex flex-col justify-between shadow-2xl hover:shadow-sky-500/20 hover:-translate-y-1">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 text-xs font-black uppercase tracking-wider bg-gradient-to-r from-sky-400 to-blue-500 text-neutral-950 rounded-full shadow-md">
                    📦 FILE LAMA (a.zip)
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-neutral-800 text-sky-300 border border-neutral-700">
                    a.zip · Versi Asli
                  </span>
                </div>

                <div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white group-hover:text-sky-300 transition-colors">
                    MT. HARUNA DOWNHILL (CLASSIC)
                  </h2>
                  <p className="text-xs sm:text-sm font-semibold text-sky-400 mt-1 uppercase tracking-wide">
                    Classic 3D Touge Stage · Minimap Radar &amp; 5 Drift Engines
                  </p>
                </div>

                <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                  Versi klasik original stage turunan Mt. Haruna dengan <strong className="text-white">Minimap radar</strong> di pojok layar, modal peta trek lengkap (Route Map), saklar <strong className="text-white">5 Drift Engine instan</strong> (PAS, GYRO, COUNTER, ARCADE, PRO), dan meja mekanik Pit Bench.
                </p>

                <div className="space-y-2 pt-1">
                  <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Fitur File Lama:</div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] font-medium">
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-sky-300 flex items-center gap-1.5">
                      <span>🗺️</span>
                      <span>Radar Minimap Real-Time</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 flex items-center gap-1.5">
                      <span>🔄</span>
                      <span>5 Mode Drift Switcher (1-5/V)</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 flex items-center gap-1.5">
                      <span>🛠️</span>
                      <span>Pit Bench Setup Mekanik (P)</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 flex items-center gap-1.5">
                      <span>⏱️</span>
                      <span>Split Timing S1 &amp; S2</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 flex items-center gap-1.5">
                      <span>⛰️</span>
                      <span>Gradien &amp; Elevasi Meter</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 flex items-center gap-1.5">
                      <span>🔊</span>
                      <span>RC Sound Toggle (M)</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-6 border-t border-neutral-800 space-y-3">
                {/* Prompt actions */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={(e) => handleDownloadPrompt('haruna_old', e)}
                    className="py-2 px-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sky-300 font-bold border border-sky-500/30 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Unduh file prompt teknis a.zip"
                  >
                    <span>📥</span>
                    <span>Unduh Prompt</span>
                  </button>
                  <button
                    onClick={(e) => handleOpenPromptModal('haruna_old', e)}
                    className="py-2 px-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-medium border border-neutral-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Lihat isi prompt dan salin"
                  >
                    <span>👁️</span>
                    <span>Lihat / Copy</span>
                  </button>
                </div>

                {/* Main Play Button */}
                <button
                  onClick={() => setSelectedGame('haruna_old')}
                  className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-500 hover:from-sky-300 hover:to-blue-400 text-neutral-950 font-black text-sm uppercase tracking-wider shadow-lg hover:shadow-sky-400/25 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="text-base">🏁</span>
                  <span>MAIN FILE LAMA (a.zip)</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION: KOLEKSI GAME DRIFT LAINNYA */}
        <div className="my-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-2 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏎️</span>
              <h3 className="text-base font-bold text-neutral-200 uppercase tracking-wider">
                Koleksi Game RC Drift Lainnya
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBmwModalMode('pro_drift')}
                className="px-3 py-1 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-amber-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                title="Buka panel adjustment dimensi dan letak ketinggian BMW GLB"
              >
                <span>📐</span>
                <span>Adjust Body BMW (3 Mode)</span>
              </button>
              <button
                onClick={() => setShowOtherGames(!showOtherGames)}
                className="text-xs text-neutral-400 hover:text-amber-300 flex items-center gap-1 font-bold cursor-pointer transition px-2 py-1 rounded-lg bg-neutral-800/60"
              >
                <span>{showOtherGames ? 'Sembunyikan' : 'Tampilkan'}</span>
                <span>{showOtherGames ? '▲' : '▼'}</span>
              </button>
            </div>
          </div>

          {showOtherGames && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-in fade-in duration-200">
              {/* CARD 3: PRO DRIFT 3D (best drift.zip) */}
              <div className="rounded-2xl bg-neutral-900/80 border border-neutral-800 hover:border-yellow-500/50 p-5 flex flex-col justify-between transition-all">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-yellow-400 text-black px-2 py-0.5 rounded-full">
                      Balatro-Style
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400">best drift.zip</span>
                  </div>
                  <h4 className="text-lg font-black text-white">PRO DRIFT 3D</h4>
                  <p className="text-xs text-neutral-300">
                    Chips × Multiplier, Tandem AI Drift (×1.6), Big Angle (&gt;48°), kecepatan hingga 250 km/j, GTR &amp; Yaris.
                  </p>

                  {/* Live Dimensions of BMW for Mode 1 */}
                  <div className="flex flex-wrap items-center gap-1 py-1.5 px-2.5 rounded-xl bg-yellow-400/10 border border-yellow-500/25 text-[10px] font-mono text-yellow-300">
                    <span className="font-bold">📐 BMW:</span>
                    <span>P: {bmwAdjs.pro_drift.length.toFixed(2)}m</span>
                    <span>• L: {bmwAdjs.pro_drift.width.toFixed(2)}m</span>
                    <span>• T: {bmwAdjs.pro_drift.height.toFixed(2)}m</span>
                    <span>• Y: {bmwAdjs.pro_drift.offsetY >= 0 ? `+${bmwAdjs.pro_drift.offsetY.toFixed(2)}` : bmwAdjs.pro_drift.offsetY.toFixed(2)}m</span>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-neutral-800/80 space-y-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setBmwModalMode('pro_drift');
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-yellow-400/15 hover:bg-yellow-400/25 border border-yellow-400/50 text-yellow-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
                    title="Atur panjang, lebar, tinggi dan letak ketinggian BMW GLB"
                  >
                    <span>📐</span>
                    <span>ADJUST BODY BMW (P × L × T &amp; Y)</span>
                  </button>

                  <div className="flex gap-2 text-[11px]">
                    <button
                      onClick={(e) => handleDownloadPrompt('pro_drift', e)}
                      className="flex-1 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-yellow-300 font-bold border border-neutral-700"
                    >
                      📥 Prompt
                    </button>
                    <button
                      onClick={(e) => handleOpenPromptModal('pro_drift', e)}
                      className="py-1.5 px-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700"
                    >
                      👁️
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedGame('pro_drift')}
                    className="w-full py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-black text-xs uppercase tracking-wider transition cursor-pointer"
                  >
                    Main Pro Drift
                  </button>
                </div>
              </div>

              {/* CARD 4: SAKURA RC PRO (RCDRIFT BEST.zip) */}
              <div className="rounded-2xl bg-neutral-900/80 border border-neutral-800 hover:border-pink-500/50 p-5 flex flex-col justify-between transition-all">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-pink-400 text-black px-2 py-0.5 rounded-full">
                      1:10 RWD RC
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400">RCDRIFT BEST.zip</span>
                  </div>
                  <h4 className="text-lg font-black text-white">SAKURA RC PRO (BALAPAN 5 BOT)</h4>
                  <p className="text-xs text-neutral-300">
                    Balapan drift 6 mobil dengan 5 bot musuh (Kenji S15, Takashi FD, Ryosuke Supra, Takumi AE86, Nakazato R32), radar minimap, live standings leaderboard, &amp; RB26 soundbox.
                  </p>

                  {/* Live Dimensions of BMW for Mode 2 */}
                  <div className="flex flex-wrap items-center gap-1 py-1.5 px-2.5 rounded-xl bg-pink-400/10 border border-pink-500/25 text-[10px] font-mono text-pink-300">
                    <span className="font-bold">📐 BMW:</span>
                    <span>P: {bmwAdjs.sakura_rc.length.toFixed(2)}m</span>
                    <span>• L: {bmwAdjs.sakura_rc.width.toFixed(2)}m</span>
                    <span>• T: {bmwAdjs.sakura_rc.height.toFixed(2)}m</span>
                    <span>• Y: {bmwAdjs.sakura_rc.offsetY >= 0 ? `+${bmwAdjs.sakura_rc.offsetY.toFixed(2)}` : bmwAdjs.sakura_rc.offsetY.toFixed(2)}m</span>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-neutral-800/80 space-y-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setBmwModalMode('sakura_rc');
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-pink-400/15 hover:bg-pink-400/25 border border-pink-400/50 text-pink-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
                    title="Atur panjang, lebar, tinggi dan letak ketinggian BMW GLB"
                  >
                    <span>📐</span>
                    <span>ADJUST BODY BMW (P × L × T &amp; Y)</span>
                  </button>

                  <div className="flex gap-2 text-[11px]">
                    <button
                      onClick={(e) => handleDownloadPrompt('sakura_rc', e)}
                      className="flex-1 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-pink-300 font-bold border border-neutral-700"
                    >
                      📥 Prompt
                    </button>
                    <button
                      onClick={(e) => handleOpenPromptModal('sakura_rc', e)}
                      className="py-1.5 px-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700"
                    >
                      👁️
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedGame('sakura')}
                    className="w-full py-2.5 rounded-xl bg-pink-400 hover:bg-pink-300 text-neutral-950 font-black text-xs uppercase tracking-wider transition cursor-pointer"
                  >
                    Main Sakura RC
                  </button>
                </div>
              </div>

              {/* CARD 5: EBISU CIRCUIT (RCDRIFT BEST2.zip) */}
              <div className="rounded-2xl bg-neutral-900/80 border border-neutral-800 hover:border-orange-500/50 p-5 flex flex-col justify-between transition-all">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-orange-400 text-black px-2 py-0.5 rounded-full">
                      Ebisu Touge
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400">RCDRIFT BEST2.zip</span>
                  </div>
                  <h4 className="text-lg font-black text-white">EBISU CIRCUIT</h4>
                  <p className="text-xs text-neutral-300">
                    Sirkuit pegunungan Ebisu Touge dengan Triple Drift Engine (Slip, Classic &amp; Sakura RC Gyro), 4 kamera...
                  </p>

                  {/* Live Dimensions of BMW for Mode 3 */}
                  <div className="flex flex-wrap items-center gap-1 py-1.5 px-2.5 rounded-xl bg-orange-400/10 border border-orange-500/25 text-[10px] font-mono text-orange-300">
                    <span className="font-bold">📐 BMW:</span>
                    <span>P: {bmwAdjs.ebisu.length.toFixed(2)}m</span>
                    <span>• L: {bmwAdjs.ebisu.width.toFixed(2)}m</span>
                    <span>• T: {bmwAdjs.ebisu.height.toFixed(2)}m</span>
                    <span>• Y: {bmwAdjs.ebisu.offsetY >= 0 ? `+${bmwAdjs.ebisu.offsetY.toFixed(2)}` : bmwAdjs.ebisu.offsetY.toFixed(2)}m</span>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-neutral-800/80 space-y-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setBmwModalMode('ebisu');
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-orange-400/15 hover:bg-orange-400/25 border border-orange-400/50 text-orange-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
                    title="Atur panjang, lebar, tinggi dan letak ketinggian BMW GLB"
                  >
                    <span>📐</span>
                    <span>ADJUST BODY BMW (P × L × T &amp; Y)</span>
                  </button>

                  <div className="flex gap-2 text-[11px]">
                    <button
                      onClick={(e) => handleDownloadPrompt('ebisu', e)}
                      className="flex-1 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-orange-300 font-bold border border-neutral-700"
                    >
                      📥 Prompt
                    </button>
                    <button
                      onClick={(e) => handleOpenPromptModal('ebisu', e)}
                      className="py-1.5 px-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700"
                    >
                      👁️
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedGame('ebisu')}
                    className="w-full py-2.5 rounded-xl bg-orange-400 hover:bg-orange-300 text-neutral-950 font-black text-xs uppercase tracking-wider transition cursor-pointer"
                  >
                    Main Ebisu Circuit
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer info & Physics explanation toggle */}
        <footer className="pt-4 border-t border-neutral-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Semua game aktif &amp; bisa dimainkan (Tekan tombol kembali di dalam game kapan saja)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setModalPromptId('haruna_new');
                setIsPromptModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-semibold transition-colors flex items-center gap-1.5 cursor-pointer border border-neutral-700"
            >
              <span>📥</span>
              <span>Download Prompt</span>
            </button>

            <button
              onClick={() => setShowPhysicsGuide(!showPhysicsGuide)}
              className="px-3.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold transition-colors flex items-center gap-1.5 cursor-pointer border border-neutral-700"
            >
              <span>💡</span>
              <span>{showPhysicsGuide ? 'Tutup Ringkasan' : 'Ringkasan Fisika'}</span>
            </button>
          </div>
        </footer>

        {/* Physics Guide Modal / Section */}
        {showPhysicsGuide && (
          <div className="mt-6 p-6 rounded-3xl bg-neutral-900 border border-neutral-800 shadow-2xl text-left space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base sm:text-lg font-black text-amber-300 flex items-center gap-2">
                <span>🧠</span>
                <span>Ringkasan Fisika Drift &amp; Touge: a.zip, b.zip &amp; Koleksi RC</span>
              </h3>
              <button
                onClick={() => setShowPhysicsGuide(false)}
                className="text-neutral-400 hover:text-white px-2 py-1 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-neutral-300 leading-relaxed">
              <p>
                <strong className="text-white">1. File Baru (b.zip) - Mt. Akina Downhill:</strong> Menggabungkan fisika balap touge berkecepatan tinggi dengan simulasi suara mesin Web Audio sintetis (Twin-Cam 4A-GE tanpa audio eksternal), selokan beton (gutter) 3D untuk drift run khas Initial D, dan pacenotes dinamis co-driver.
              </p>
              <p>
                <strong className="text-white">2. File Lama (a.zip) - Mt. Haruna Classic:</strong> Berfokus pada kemudahan navigasi stage touge menggunakan radar Minimap interaktif serta saklar 5 mode drift engine (PAS, GYRO, COUNTER, ARCADE, PRO) dengan setup suspensi di Pit Bench.
              </p>
              <p>
                <strong className="text-white">3. Koleksi Lainnya:</strong>
                <br />• <code className="text-yellow-400 font-mono">best drift.zip (Pro Drift 3D)</code>: Balatro-Style Chips × Mult, Tandem AI, Big Angle (&gt;48°), 250 km/j.
                <br />• <code className="text-pink-400 font-mono">RCDRIFT BEST.zip (Sakura RC Pro)</code>: 1:10 RWD RC Drift Circuit Aula Hall, Gyro Assist, Skyline R34 BNR34, Pit Bench Setup.
                <br />• <code className="text-orange-400 font-mono">RCDRIFT BEST2.zip (Ebisu Circuit)</code>: Sirkuit pegunungan Ebisu Touge, Classic &amp; Slip Dual Engine, Mode Balapan Laps &amp; Rivals.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Full Prompt View & Download Modal */}
      <PromptDownloadModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        initialPromptId={modalPromptId}
      />

      {/* BMW GLB Dimensions & Ride Height Adjustment Modal (3 Modes) */}
      {bmwModalMode && (
        <BMWAdjustmentModal
          mode={bmwModalMode}
          isOpen={true}
          onClose={() => setBmwModalMode(null)}
          onModeChange={(m) => setBmwModalMode(m)}
        />
      )}
    </div>
  );
}
