import { useState, useEffect } from 'react';
import './bmwModal.css';
import {
  BMWModeKey,
  BMWAdjustment,
  loadBMWAdjustment,
  saveBMWAdjustment,
  DEFAULT_BMW_ADJUSTMENTS,
  BASE_CHASSIS_SCALE,
  subscribeBMWAdjustment,
} from '@/utils/bmwCar';

interface BMWAdjustmentModalProps {
  mode: BMWModeKey;
  isOpen: boolean;
  onClose: () => void;
  onModeChange?: (newMode: BMWModeKey) => void;
}

interface ModeMeta {
  title: string;
  badge: string;
  subtitle: string;
  tag: string;
  themeColor: string;
  borderColor: string;
  activeTabBg: string;
  accentText: string;
  accentBg: string;
}

const MODES: Record<BMWModeKey, ModeMeta> = {
  pro_drift: {
    title: 'PRO DRIFT 3D',
    badge: 'Balatro-Style · best drift.zip',
    subtitle: 'Skala sasis arcade 250 km/j · Body BMW GLB',
    tag: '⚡ Pro Drift',
    themeColor: 'from-amber-400 to-yellow-500',
    borderColor: 'border-yellow-400',
    activeTabBg: 'bg-yellow-400 text-black shadow-lg shadow-yellow-500/25',
    accentText: 'text-yellow-300',
    accentBg: 'bg-yellow-400/10 border-yellow-500/30',
  },
  sakura_rc: {
    title: 'SAKURA RC PRO',
    badge: '1:10 RWD RC · RCDRIFT BEST.zip',
    subtitle: 'Skala karpet Aula Circuit 1:10 RWD · Body BMW GLB Lexan',
    tag: '🌸 Sakura RC',
    themeColor: 'from-pink-400 to-rose-500',
    borderColor: 'border-pink-400',
    activeTabBg: 'bg-pink-400 text-black shadow-lg shadow-pink-500/25',
    accentText: 'text-pink-300',
    accentBg: 'bg-pink-400/10 border-pink-500/30',
  },
  ebisu: {
    title: 'EBISU CIRCUIT',
    badge: 'Ebisu Touge · RCDRIFT BEST2.zip',
    subtitle: 'Skala lintasan pegunungan Touge · Body BMW GLB',
    tag: '🏁 Ebisu',
    themeColor: 'from-orange-400 to-amber-500',
    borderColor: 'border-orange-400',
    activeTabBg: 'bg-orange-400 text-black shadow-lg shadow-orange-500/25',
    accentText: 'text-orange-300',
    accentBg: 'bg-orange-400/10 border-orange-500/30',
  },
};

export function BMWAdjustmentModal({ mode: initialMode, isOpen, onClose, onModeChange }: BMWAdjustmentModalProps) {
  const [activeMode, setActiveMode] = useState<BMWModeKey>(initialMode);
  const [adj, setAdj] = useState<BMWAdjustment>(() => loadBMWAdjustment(initialMode));

  useEffect(() => {
    setActiveMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setAdj(loadBMWAdjustment(activeMode));
    const unsub = subscribeBMWAdjustment(activeMode, (newAdj) => {
      setAdj(newAdj);
    });
    return unsub;
  }, [activeMode]);

  if (!isOpen) return null;

  const currentMeta = MODES[activeMode];
  const targetAdj = DEFAULT_BMW_ADJUSTMENTS[activeMode];
  const baseScale = BASE_CHASSIS_SCALE[activeMode];

  const updateField = (field: keyof BMWAdjustment, value: number) => {
    const rounded = Number(Math.max(-1, Math.min(10, value)).toFixed(2));
    const updated = { ...adj, [field]: rounded };
    setAdj(updated);
    saveBMWAdjustment(activeMode, updated);
  };

  const handleModeSwitch = (newMode: BMWModeKey) => {
    setActiveMode(newMode);
    onModeChange?.(newMode);
  };

  const resetToDefault = () => {
    const def = { ...targetAdj };
    setAdj(def);
    saveBMWAdjustment(activeMode, def);
  };

  // Preset adjustments
  const applyPreset = (type: 'slammed' | 'lifted' | 'wide' | 'compact') => {
    let next = { ...adj };
    if (type === 'slammed') {
      next.offsetY = Number((targetAdj.offsetY - 0.08).toFixed(2));
    } else if (type === 'lifted') {
      next.offsetY = Number((targetAdj.offsetY + 0.12).toFixed(2));
    } else if (type === 'wide') {
      next.width = Number((targetAdj.width * 1.15).toFixed(2));
    } else if (type === 'compact') {
      next.length = Number((targetAdj.length * 0.88).toFixed(2));
      next.height = Number((targetAdj.height * 0.92).toFixed(2));
    }
    setAdj(next);
    saveBMWAdjustment(activeMode, next);
  };

  // Slider limits based on base chassis scale to match user screenshots perfectly
  const lengthMin = Number((baseScale.length * 0.5).toFixed(2));
  const lengthMax = Number((baseScale.length * 1.8).toFixed(2));
  const widthMin = Number((baseScale.width * 0.5).toFixed(2));
  const widthMax = Number((baseScale.width * 1.8).toFixed(2));
  const heightMin = Number((baseScale.height * 0.4).toFixed(2));
  const heightMax = Number((baseScale.height * 2.0).toFixed(2));
  const offsetMin = Number((baseScale.offsetY - 0.35).toFixed(2));
  const offsetMax = Number((baseScale.offsetY + 0.55).toFixed(2));

  return (
    <div
      className="bmw-modal fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bmw-modal__card w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl bg-neutral-900 border-2 border-neutral-700/80 shadow-2xl text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Title & Mode Tabs */}
        <div className="bmw-modal__head p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950/70 space-y-3 shrink-0">
          <div className="bmw-flag" aria-hidden />
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">📐</span>
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                  ADJUST BODY BMW GLB
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                  Live 3D Sync
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Atur <strong className="text-white">Panjang</strong>, <strong className="text-white">Lebar</strong>, <strong className="text-white">Tinggi</strong>, dan <strong className="text-white">Letak Ketinggian (Offset Y)</strong> body mobil BMW GLB.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition cursor-pointer text-sm font-bold shrink-0 ml-2"
              title="Tutup"
            >
              ✕
            </button>
          </div>

          {/* 3 MODE TABS */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-neutral-900 border border-neutral-800">
            {(['pro_drift', 'sakura_rc', 'ebisu'] as BMWModeKey[]).map((key) => {
              const m = MODES[key];
              const isActive = activeMode === key;
              return (
                <button
                  key={key}
                  onClick={() => handleModeSwitch(key)}
                  className={`py-2 px-2 rounded-xl text-xs font-black transition cursor-pointer flex flex-col items-center justify-center ${
                    isActive
                      ? m.activeTabBg
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
                  }`}
                >
                  <span className="truncate w-full text-center">{m.title}</span>
                  <span className="text-[9px] font-normal opacity-80 truncate">{m.tag}</span>
                </button>
              );
            })}
          </div>

          {/* Active Mode Info Bar */}
          <div className={`px-3 py-1.5 rounded-xl border flex items-center justify-between text-xs ${currentMeta.accentBg}`}>
            <span className="font-semibold text-neutral-300 truncate">
              {currentMeta.subtitle}
            </span>
            <span className={`text-[10px] font-mono font-bold uppercase shrink-0 ${currentMeta.accentText}`}>
              {currentMeta.badge}
            </span>
          </div>
        </div>

        {/* Scrollable Sliders & Controls */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          {/* 1. PANJANG (LENGTH) */}
          <div className="p-3.5 rounded-2xl bg-neutral-950/70 border border-neutral-800/90 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-black text-sm">📏</span>
                <div>
                  <div className="text-xs font-black uppercase text-neutral-200">
                    1. Panjang Body (Length / Sumbu Z)
                  </div>
                  <div className="text-[10px] text-neutral-400">Panjang bodi mobil dari bumper depan ke belakang</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => updateField('length', adj.length - 0.05)}
                  className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-sm cursor-pointer transition active:scale-95"
                >
                  −
                </button>
                <span key={adj.length} className="bmw-val font-mono text-xs font-bold text-amber-300 bg-amber-400/10 px-2 py-1 rounded-lg border border-amber-500/25 min-w-[70px] text-center">
                  {adj.length.toFixed(2)} m
                </span>
                <button
                  onClick={() => updateField('length', adj.length + 0.05)}
                  className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-sm cursor-pointer transition active:scale-95"
                >
                  +
                </button>
              </div>
            </div>
            <input
              type="range"
              min={lengthMin}
              max={lengthMax}
              step={0.01}
              value={adj.length}
              onChange={(e) => updateField('length', parseFloat(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer h-2 bg-neutral-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
              <span>{lengthMin.toFixed(2)} m (Pendek)</span>
              <span className="text-amber-400/80">Default: {baseScale.length.toFixed(2)} m</span>
              <span>{lengthMax.toFixed(2)} m (Panjang)</span>
            </div>
          </div>

          {/* 2. LEBAR (WIDTH) */}
          <div className="p-3.5 rounded-2xl bg-neutral-950/70 border border-neutral-800/90 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 font-black text-sm">↔️</span>
                <div>
                  <div className="text-xs font-black uppercase text-neutral-200">
                    2. Lebar Body (Width / Sumbu X)
                  </div>
                  <div className="text-[10px] text-neutral-400">Lebar bodi mobil dari fender kiri ke kanan</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => updateField('width', adj.width - 0.05)}
                  className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-sm cursor-pointer transition active:scale-95"
                >
                  −
                </button>
                <span key={adj.width} className="bmw-val font-mono text-xs font-bold text-cyan-300 bg-cyan-400/10 px-2 py-1 rounded-lg border border-cyan-500/25 min-w-[70px] text-center">
                  {adj.width.toFixed(2)} m
                </span>
                <button
                  onClick={() => updateField('width', adj.width + 0.05)}
                  className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-sm cursor-pointer transition active:scale-95"
                >
                  +
                </button>
              </div>
            </div>
            <input
              type="range"
              min={widthMin}
              max={widthMax}
              step={0.01}
              value={adj.width}
              onChange={(e) => updateField('width', parseFloat(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer h-2 bg-neutral-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
              <span>{widthMin.toFixed(2)} m (Sempit)</span>
              <span className="text-cyan-400/80">Default: {baseScale.width.toFixed(2)} m</span>
              <span>{widthMax.toFixed(2)} m (Lebar / Widebody)</span>
            </div>
          </div>

          {/* 3. TINGGI (HEIGHT) */}
          <div className="p-3.5 rounded-2xl bg-neutral-950/70 border border-neutral-800/90 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-black text-sm">↕️</span>
                <div>
                  <div className="text-xs font-black uppercase text-neutral-200">
                    3. Tinggi Body (Height / Sumbu Y)
                  </div>
                  <div className="text-[10px] text-neutral-400">Ketebalan / tinggi atap body BMW</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => updateField('height', adj.height - 0.03)}
                  className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-sm cursor-pointer transition active:scale-95"
                >
                  −
                </button>
                <span key={adj.height} className="bmw-val font-mono text-xs font-bold text-emerald-300 bg-emerald-400/10 px-2 py-1 rounded-lg border border-emerald-500/25 min-w-[70px] text-center">
                  {adj.height.toFixed(2)} m
                </span>
                <button
                  onClick={() => updateField('height', adj.height + 0.03)}
                  className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-sm cursor-pointer transition active:scale-95"
                >
                  +
                </button>
              </div>
            </div>
            <input
              type="range"
              min={heightMin}
              max={heightMax}
              step={0.01}
              value={adj.height}
              onChange={(e) => updateField('height', parseFloat(e.target.value))}
              className="w-full accent-emerald-400 cursor-pointer h-2 bg-neutral-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
              <span>{heightMin.toFixed(2)} m (Pipih / Aerodinamis)</span>
              <span className="text-emerald-400/80">Default: {baseScale.height.toFixed(2)} m</span>
              <span>{heightMax.toFixed(2)} m (Tinggi / Boxy)</span>
            </div>
          </div>

          {/* 4. LETAK KETINGGIAN (GROUND / RIDE HEIGHT OFFSET Y) */}
          <div className="p-3.5 rounded-2xl bg-neutral-950/70 border border-neutral-800/90 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-purple-400 font-black text-sm">🏎️</span>
                <div>
                  <div className="text-xs font-black uppercase text-neutral-200">
                    4. Letak Ketinggian (Ground / Ride Height Offset Y)
                  </div>
                  <div className="text-[10px] text-neutral-400">Jarak bodi dari aspal tanah / ceper vs tinggi</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => updateField('offsetY', adj.offsetY - 0.02)}
                  className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-sm cursor-pointer transition active:scale-95"
                >
                  −
                </button>
                <span key={adj.offsetY} className="bmw-val font-mono text-xs font-bold text-purple-300 bg-purple-400/10 px-2 py-1 rounded-lg border border-purple-500/25 min-w-[70px] text-center">
                  {adj.offsetY >= 0 ? `+${adj.offsetY.toFixed(2)}` : adj.offsetY.toFixed(2)} m
                </span>
                <button
                  onClick={() => updateField('offsetY', adj.offsetY + 0.02)}
                  className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-sm cursor-pointer transition active:scale-95"
                >
                  +
                </button>
              </div>
            </div>
            <input
              type="range"
              min={offsetMin}
              max={offsetMax}
              step={0.01}
              value={adj.offsetY}
              onChange={(e) => updateField('offsetY', parseFloat(e.target.value))}
              className="w-full accent-purple-400 cursor-pointer h-2 bg-neutral-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
              <span>{offsetMin.toFixed(2)} m (Sangat Ceper / Slammed)</span>
              <span className="text-purple-400/80">Default: {baseScale.offsetY.toFixed(2)} m</span>
              <span>{offsetMax.toFixed(2)} m (Tinggi / Ground Clear)</span>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="pt-1">
            <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">
              Preset Cepat {currentMeta.title}:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
              <button
                onClick={() => applyPreset('slammed')}
                className="py-1.5 px-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-purple-300 border border-purple-500/30 transition text-center cursor-pointer font-semibold"
              >
                🏁 Ceper (Slammed)
              </button>
              <button
                onClick={() => applyPreset('wide')}
                className="py-1.5 px-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-cyan-300 border border-cyan-500/30 transition text-center cursor-pointer font-semibold"
              >
                🏎️ Widebody (+15%)
              </button>
              <button
                onClick={() => applyPreset('compact')}
                className="py-1.5 px-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-amber-300 border border-amber-500/30 transition text-center cursor-pointer font-semibold"
              >
                ⚡ Compact Agil
              </button>
              <button
                onClick={() => applyPreset('lifted')}
                className="py-1.5 px-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-emerald-300 border border-emerald-500/30 transition text-center cursor-pointer font-semibold"
              >
                ⬆️ Tinggi (+0.12m)
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between shrink-0">
          <button
            onClick={resetToDefault}
            className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-neutral-700"
          >
            <span>🔄</span>
            <span>Reset {currentMeta.title}</span>
          </button>

          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 text-neutral-950 text-xs font-black uppercase tracking-wider transition shadow-lg cursor-pointer active:scale-95"
          >
            Simpan &amp; Tutup ✓
          </button>
        </div>
      </div>
    </div>
  );
}
