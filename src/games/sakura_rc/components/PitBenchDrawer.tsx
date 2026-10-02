import React, { useEffect, useState } from 'react';
import {
  X,
  Sliders,
  Cpu,
  Palette,
  Check,
  Gauge,
  Wrench,
  Eye,
  Sparkles,
  Volume2,
  CloudFog,
} from 'lucide-react';
import {
  BodyShellMode,
  CarCustomization,
  SmokeConfig,
  SmokeMode,
  SmokePresetId,
  SmokeTriggerEngine,
  SoundMode,
  SuspensionSetup,
  TireCompound,
  TuningSetup,
} from '../types/rcDrift';
import {
  DEFAULT_SMOKE_CONFIG,
  DEFAULT_SUSPENSION_SETUP,
  HARUNA_DRIVING_PRESETS,
  PRO_SUSPENSION_KITS,
  RC_BODIES,
  SMOKE_PRESETS,
  TUNING_PRESETS,
} from '../data/circuitsAndCars';
import { rcSound } from '../utils/soundEngine';

interface PitBenchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tuning: TuningSetup;
  onChangeTuning: (newTuning: TuningSetup) => void;
  customization: CarCustomization;
  onChangeCustomization: (newCustom: CarCustomization) => void;
  /** Haruna-only driving controls stay out of the normal Aula setup sheet. */
  isHarunaMap?: boolean;
  initialTab?: 'suspension' | 'smoke' | 'chassis' | 'tuning';
}

const PAINT_SWATCHES = [
  { name: 'Skyline Bayside Blue', hex: '#0E64FF' },
  { name: 'Millennium Jade GT-R', hex: '#7C8D7E' },
  { name: 'Midnight Purple III', hex: '#5B21B6' },
  { name: 'R32 Gunmetal Grey', hex: '#475569' },
  { name: 'Nismo Pearl White', hex: '#F8FAFC' },
  { name: 'D1 Magenta', hex: '#FF2A85' },
  { name: 'Volt Lime', hex: '#CCFF00' },
];

const ANODIZE_SWATCHES = [
  { name: 'Factory Cyan', hex: '#00F0FF' },
  { name: 'Top-Line Gold / Bronze TE37', hex: '#F59E0B' },
  { name: 'Overdose Purple', hex: '#A855F7' },
  { name: 'Yokomo Red', hex: '#EF4444' },
  { name: 'Titanium Silver', hex: '#E2E8F0' },
];

const NEON_SWATCHES = [
  { name: 'Cyan', hex: '#00F0FF' },
  { name: 'Magenta', hex: '#FF2A85' },
  { name: 'Volt Lime', hex: '#CCFF00' },
  { name: 'Amber Gold', hex: '#F59E0B' },
];

export const PitBenchDrawer: React.FC<PitBenchDrawerProps> = ({
  isOpen,
  onClose,
  tuning,
  onChangeTuning,
  customization,
  onChangeCustomization,
  isHarunaMap = false,
  initialTab = 'suspension',
}) => {
  const [activeTab, setActiveTab] = useState<
    'suspension' | 'smoke' | 'chassis' | 'tuning'
  >(initialTab);

  // Shortcut menu (T/F) bisa meminta tab tertentu saat drawer dibuka
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  if (!isOpen) return null;

  const smokeCfg: SmokeConfig = tuning.smokeConfig || DEFAULT_SMOKE_CONFIG;
  const suspCfg: SuspensionSetup =
    tuning.suspension || DEFAULT_SUSPENSION_SETUP;

  const updateSmokeCfg = (partial: Partial<SmokeConfig>) => {
    onChangeTuning({
      ...tuning,
      smokeConfig: {
        ...smokeCfg,
        ...partial,
      },
    });
  };

  const updateSuspCfg = (partial: Partial<SuspensionSetup>) => {
    onChangeTuning({
      ...tuning,
      suspension: {
        ...suspCfg,
        ...partial,
      },
    });
  };

  const applySmokePreset = (presetKey: Exclude<SmokePresetId, 'custom'>) => {
    const p = SMOKE_PRESETS[presetKey];
    updateSmokeCfg({
      ...p.config,
      mode: 'new_pipeline',
    });
  };

  const harunaTuning = {
    accelerationPower: tuning.accelerationPower ?? 100,
    driftResponse: tuning.driftResponse ?? 55,
    throttleResponse: tuning.throttleResponse ?? 100,
    handlingAssist: tuning.handlingAssist ?? 35,
  };

  const updateHarunaTuning = (
    partial: Partial<typeof harunaTuning>
  ) => {
    onChangeTuning({
      ...tuning,
      ...partial,
    });
  };

  return (
    <div className="fixed inset-0 z-[55] flex justify-end bg-black/55 backdrop-blur-xs">
      <div className="w-full max-w-md h-full bg-carbon border-l border-white/15 flex flex-col shadow-2xl overflow-hidden">
        {/* Drawer Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#00F0FF]/15 border border-[#00F0FF]/40 text-[#00F0FF]">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-extrabold text-lg tracking-wider uppercase text-white">
                RC PIT BENCH // PRO SETUP BOARD
              </h2>
              <p className="text-xs text-slate-400">
                Pro Suspension • 5-Stage Smoke • Skyline Garage • Gyro
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Sub-navigation Tabs */}
        <div className="p-2 bg-slate-950/50 border-b border-white/10 grid grid-cols-4 gap-1">
          <button
            onClick={() => setActiveTab('suspension')}
            className={`py-2 px-1.5 rounded-xl font-display font-bold text-[10px] tracking-wider uppercase flex items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'suspension'
                ? 'bg-[#00F0FF] text-[#0B0D13] shadow-[0_0_15px_rgba(0,240,255,0.4)]'
                : 'bg-slate-900/80 text-slate-300 hover:text-white'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>SUSPENSI</span>
          </button>
          <button
            onClick={() => setActiveTab('smoke')}
            className={`py-2 px-1.5 rounded-xl font-display font-bold text-[10px] tracking-wider uppercase flex items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'smoke'
                ? 'bg-[#CCFF00] text-[#0B0D13] shadow-[0_0_15px_rgba(204,255,0,0.4)]'
                : 'bg-slate-900/80 text-slate-300 hover:text-white'
            }`}
          >
            <CloudFog className="w-3.5 h-3.5" />
            <span>SMOKE FX</span>
          </button>
          <button
            onClick={() => setActiveTab('chassis')}
            className={`py-2 px-1.5 rounded-xl font-display font-bold text-[10px] tracking-wider uppercase flex items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'chassis'
                ? 'bg-amber-400 text-[#0B0D13] shadow-[0_0_15px_rgba(251,191,36,0.4)]'
                : 'bg-slate-900/80 text-slate-300 hover:text-white'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>SKYLINE</span>
          </button>
          <button
            onClick={() => setActiveTab('tuning')}
            className={`py-2 px-1.5 rounded-xl font-display font-bold text-[10px] tracking-wider uppercase flex items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'tuning'
                ? 'bg-[#FF2A85] text-white shadow-[0_0_15px_rgba(255,42,133,0.4)]'
                : 'bg-slate-900/80 text-slate-300 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>GYRO/ESC</span>
          </button>
        </div>

        {/* Drawer Body Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'suspension' ? (
            <>
              {/* 1. Famous Real-World 1:10 RC Drift Pro Suspension Kits */}
              <div>
                <div className="text-xs font-display font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-[#00F0FF]" />
                    <span>PILIH KIT SUSPENSI RC DRIFT PRO</span>
                  </span>
                  <span className="text-[10px] font-mono-tabular px-2 py-0.5 rounded bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/35">
                    4-WHEEL COILOVER
                  </span>
                </div>
                <div className="space-y-2">
                  {PRO_SUSPENSION_KITS.map((kit) => {
                    const isSelected = suspCfg.kitId === kit.id;
                    return (
                      <button
                        key={kit.id}
                        onClick={() => updateSuspCfg({ ...kit.setup })}
                        className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#00F0FF]/15 border-[#00F0FF] shadow-[0_0_16px_rgba(0,240,255,0.22)]'
                            : 'bg-slate-900/75 border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display font-extrabold text-xs sm:text-sm text-white">
                            {kit.name}
                          </span>
                          {isSelected && (
                            <span className="text-[9px] font-mono-tabular px-1.5 py-0.5 rounded bg-[#00F0FF] text-[#0B0D13] font-bold shrink-0">
                              INSTALLED
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono-tabular text-[#CCFF00] mt-0.5">
                          {kit.brandBadge}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {kit.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. 6 Live Pro RC Damper, Pro-Squat & Camber Geometry Sliders */}
              <div className="space-y-4 bg-slate-950/80 p-4 rounded-2xl border border-white/10">
                <div className="text-xs font-display font-bold uppercase tracking-wider text-[#00F0FF] border-b border-white/10 pb-2">
                  FINE-TUNE DAMPER OIL, PRO-SQUAT & CAMBER
                </div>

                {/* 1. Shock Oil Viscosity (CST) */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      1. SILICONE SHOCK OIL VISCOSITY
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-[#00F0FF]">
                      #{suspCfg.shockOilCst} CST
                    </span>
                  </div>
                  <input
                    type="range"
                    min={150}
                    max={500}
                    step={25}
                    value={suspCfg.shockOilCst}
                    onChange={(e) =>
                      updateSuspCfg({ shockOilCst: Number(e.target.value) })
                    }
                    className="w-full rc-slider"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    #150 CST = Empuk & ayunan weight-shift lembut • #500 CST = Keras & transisi cepat.
                  </p>
                </div>

                {/* 2. Active Rear Pro-Squat (%) */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      2. ACTIVE REAR PRO-SQUAT (ON-THROTTLE)
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-[#CCFF00]">
                      {suspCfg.rearProSquat}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    step={2}
                    value={suspCfg.rearProSquat}
                    onChange={(e) =>
                      updateSuspCfg({ rearProSquat: Number(e.target.value) })
                    }
                    className="w-full rc-slider"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Saat gas ditekan, buritan belakang turun (squat) menekan ban belakang untuk traksi maju keluar tikungan!
                  </p>
                </div>

                {/* 3. Front Negative Camber (deg) */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      3. FRONT NEGATIVE CAMBER (UPPER ARM)
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-amber-300">
                      {suspCfg.frontCamberDeg.toFixed(1)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={-3}
                    step={0.5}
                    value={suspCfg.frontCamberDeg}
                    onChange={(e) =>
                      updateSuspCfg({ frontCamberDeg: Number(e.target.value) })
                    }
                    className="w-full rc-slider"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Sudut miring roda depan (-8° s/d -10° standar kompetisi agar kontak ban rata saat full-lock).
                  </p>
                </div>

                {/* 4. Rear Negative Camber (deg) */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      4. REAR NEGATIVE CAMBER (TRACTION VS SLIDE)
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-amber-300">
                      {suspCfg.rearCamberDeg.toFixed(1)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-6}
                    max={-1}
                    step={0.5}
                    value={suspCfg.rearCamberDeg}
                    onChange={(e) =>
                      updateSuspCfg({ rearCamberDeg: Number(e.target.value) })
                    }
                    className="w-full rc-slider"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    -1.5° = Traksi dorong maju kencang (Tsuiso Chase) • -5.0° = Mudah selip menyamping.
                  </p>
                </div>

                {/* 5. Chassis Ride Height (mm) */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      5. PRELOAD COLLAR // RIDE HEIGHT
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-white">
                      {suspCfg.rideHeightMm.toFixed(1)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={4.0}
                    max={8.0}
                    step={0.2}
                    value={suspCfg.rideHeightMm}
                    onChange={(e) =>
                      updateSuspCfg({ rideHeightMm: Number(e.target.value) })
                    }
                    className="w-full rc-slider"
                  />
                </div>

                {/* 6. Weight-Shift Body Roll Sensitivity */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      6. WEIGHT-SHIFT ROLL & DIVE AMPLITUDE
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-[#FF2A85]">
                      {suspCfg.rollSensitivity.toFixed(2)}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={5}
                    value={Math.round(suspCfg.rollSensitivity * 100)}
                    onChange={(e) =>
                      updateSuspCfg({
                        rollSensitivity: Number(e.target.value) / 100,
                      })
                    }
                    className="w-full rc-slider"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Atur ke 1.85× untuk gaya "Weight-Shift / Real-Grade RC" dengan body roll & nose dive ekstrem!
                  </p>
                </div>
              </div>
            </>
          ) : activeTab === 'smoke' ? (
            <>
              {/* 1. Smoke System Mode Switcher (BARU 5-Tahap vs LAMA) */}
              <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-[#CCFF00]/35">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-display font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                    <CloudFog className="w-4 h-4 text-[#CCFF00]" />
                    <span>SISTEM ASAP DRIFT (LAMA VS BARU)</span>
                  </span>
                  <span className="text-[10px] font-mono-tabular px-2 py-0.5 rounded bg-[#CCFF00]/15 text-[#CCFF00] border border-[#CCFF00]/40">
                    640 SPRITE POOL
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: 'new_pipeline',
                        title: 'MODE BARU (5-TAHAP)',
                        sub: '2-Jalur + Swirl Orbit + 6-Lobe',
                      },
                      {
                        id: 'legacy',
                        title: 'MODE LAMA (CLASSIC)',
                        sub: 'Asap Standar Sederhana',
                      },
                    ] as { id: SmokeMode; title: string; sub: string }[]
                  ).map((m) => {
                    const active = smokeCfg.mode === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => updateSmokeCfg({ mode: m.id })}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          active
                            ? 'bg-[#CCFF00]/20 border-[#CCFF00] text-white shadow-[0_0_14px_rgba(204,255,0,0.2)]'
                            : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="font-display font-bold text-xs">{m.title}</div>
                        <div className="text-[10px] opacity-80 mt-0.5">{m.sub}</div>
                      </button>
                    );
                  })}
                </div>

                {/* 5-Stage Pipeline Architecture Diagram Pill */}
                {smokeCfg.mode === 'new_pipeline' && (
                  <div className="mt-3 p-2 rounded-xl bg-slate-900/90 border border-white/10 text-[10px] font-mono-tabular text-slate-300 flex items-center justify-between">
                    <span className="text-[#00F0FF]">1.PEMICU</span>
                    <span>→</span>
                    <span className="text-[#CCFF00]">2.EMISI 2-JALUR</span>
                    <span>→</span>
                    <span className="text-white">3.POOL 640</span>
                    <span>→</span>
                    <span className="text-[#FF2A85]">4.6-LOBE</span>
                    <span>→</span>
                    <span className="text-amber-300">5.ANIM 4×</span>
                  </div>
                )}
              </div>

              {/* 2. Presets: Subtle 🌬️ -> Normal 💨 -> Heavy 🌫️ -> Burnout 🔥 */}
              <div>
                <div className="text-xs font-display font-bold uppercase tracking-wider text-slate-400 mb-2">
                  DRIFT SMOKE PRESETS
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    ['subtle', 'normal', 'heavy', 'burnout'] as Exclude<
                      SmokePresetId,
                      'custom'
                    >[]
                  ).map((key) => {
                    const item = SMOKE_PRESETS[key];
                    const active =
                      smokeCfg.mode === 'new_pipeline' && smokeCfg.preset === key;
                    return (
                      <button
                        key={key}
                        onClick={() => applySmokePreset(key)}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          active
                            ? 'bg-[#00F0FF]/20 border-[#00F0FF] text-white shadow-[0_0_15px_rgba(0,240,255,0.25)]'
                            : 'bg-slate-900/75 border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <div className="font-display font-extrabold text-xs text-white">
                          {item.label}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {item.badge}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Stage 1 Pemicu Engine Selector (Slip Hysteresis vs Classic |vl|) */}
              <div className="bg-slate-950/75 p-3.5 rounded-2xl border border-white/10">
                <div className="text-xs font-display font-bold uppercase tracking-wider text-white mb-2">
                  TAHAP 1: ENGINE PEMICU & RUMUS INTENSITAS
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: 'slip',
                        title: 'SLIP ENGINE (Hysteresis)',
                        desc: 'In >0.20 rad (~11°) • Out <0.09 rad',
                      },
                      {
                        id: 'classic',
                        title: 'CLASSIC ENGINE (|vl|)',
                        desc: 'In |vl| > 5 • min(1, |vl|/14)',
                      },
                    ] as { id: SmokeTriggerEngine; title: string; desc: string }[]
                  ).map((eng) => {
                    const active = smokeCfg.triggerEngine === eng.id;
                    return (
                      <button
                        key={eng.id}
                        onClick={() => updateSmokeCfg({ triggerEngine: eng.id })}
                        className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                          active
                            ? 'bg-[#00F0FF]/15 border-[#00F0FF] text-white'
                            : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="font-display font-bold text-[11px]">
                          {eng.title}
                        </div>
                        <div className="text-[9px] font-mono-tabular opacity-80 mt-0.5">
                          {eng.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. 6 Live Sliders & Wheel-Spin Swirl Toggle */}
              <div className="space-y-4 bg-slate-950/75 p-4 rounded-2xl border border-white/10">
                {/* Amount (0 - 200%) */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      1. AMOUNT (LAJU EMISI 2 JALUR)
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-[#00F0FF]">
                      {Math.round(smokeCfg.amount * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={5}
                    value={Math.round(smokeCfg.amount * 100)}
                    onChange={(e) =>
                      updateSmokeCfg({
                        amount: Number(e.target.value) / 100,
                        preset: 'custom',
                      })
                    }
                    className="w-full rc-slider"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Pengali rate Jalur A (34–114 puff/s) & Jalur B (22–48 puff/s). 0% = mati total.
                  </p>
                </div>

                {/* Puff Size */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      2. PUFF SIZE (UKURAN DASAR)
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-[#CCFF00]">
                      {smokeCfg.puffSize.toFixed(2)}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={200}
                    step={5}
                    value={Math.round(smokeCfg.puffSize * 100)}
                    onChange={(e) =>
                      updateSmokeCfg({
                        puffSize: Number(e.target.value) / 100,
                        preset: 'custom',
                      })
                    }
                    className="w-full rc-slider"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Tiap puff mengembang ±4× lipat dengan kurva 1 − (1−t)^2.2.
                  </p>
                </div>

                {/* Lifetime */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      3. LIFETIME (UMUR HIDUP PUFF)
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-white">
                      {(1.55 * smokeCfg.lifetime).toFixed(1)}s ({smokeCfg.lifetime.toFixed(2)}×)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={200}
                    step={5}
                    value={Math.round(smokeCfg.lifetime * 100)}
                    onChange={(e) =>
                      updateSmokeCfg({
                        lifetime: Number(e.target.value) / 100,
                        preset: 'custom',
                      })
                    }
                    className="w-full rc-slider"
                  />
                </div>

                {/* Opacity */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      4. OPACITY (ALPHA PUNCAK)
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-[#FF2A85]">
                      {Math.round(smokeCfg.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={150}
                    step={5}
                    value={Math.round(smokeCfg.opacity * 100)}
                    onChange={(e) =>
                      updateSmokeCfg({
                        opacity: Number(e.target.value) / 100,
                        preset: 'custom',
                      })
                    }
                    className="w-full rc-slider"
                  />
                </div>

                {/* Rubber Tint (0 = Putih Bersih, 1 = Coklat Ban Gosong) */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      5. RUBBER TINT (WARNA BAN GOSONG)
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-amber-300">
                      {Math.round(smokeCfg.rubberTint * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(smokeCfg.rubberTint * 100)}
                    onChange={(e) =>
                      updateSmokeCfg({
                        rubberTint: Number(e.target.value) / 100,
                        preset: 'custom',
                      })
                    }
                    className="w-full rc-slider"
                  />
                  <div className="mt-1.5 h-2 w-full rounded-full bg-gradient-to-r from-[#f7f8fb] via-[#c4c8cf] to-[#8f847e] border border-white/15" />
                  <p className="text-[10px] text-slate-400 mt-1">
                    0% = Putih bersih (#c4c8cf→#f7f8fb) • 100% = Coklat ban gosong (#8f847e→#d9d3ce).
                  </p>
                </div>

                {/* Jalur B: Wheel-Spin Swirl Toggle */}
                <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                  <div className="pr-2">
                    <div className="font-display font-bold text-xs uppercase text-[#00F0FF]">
                      6. WHEEL-SPIN SWIRL (JALUR B ORBIT RODA)
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Puff kecil (×0.42) mengorbit poros live WheelAnchor 0.16–0.36s lalu lepas tangensial!
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      updateSmokeCfg({
                        wheelSpinSwirl: !smokeCfg.wheelSpinSwirl,
                      })
                    }
                    className={`px-3 py-1.5 rounded-lg font-mono-tabular font-bold text-xs uppercase shrink-0 cursor-pointer ${
                      smokeCfg.wheelSpinSwirl
                        ? 'bg-[#00F0FF] text-[#0B0D13] shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {smokeCfg.wheelSpinSwirl ? 'SWIRL ON' : 'SWIRL OFF'}
                  </button>
                </div>
              </div>
            </>
          ) : activeTab === 'tuning' ? (
            <>
              {isHarunaMap && (
                <div className="space-y-4 bg-gradient-to-br from-[#21121d] via-slate-950/95 to-[#101a28] p-4 rounded-2xl border border-[#FF2A85]/55 shadow-[0_0_24px_rgba(255,42,133,0.12)]">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[#FF2A85]">
                        <Sparkles className="w-4 h-4" />
                        <span className="text-xs font-display font-extrabold uppercase tracking-wider">
                          HARUNA / AKINA DOWNHILL CONTROL
                        </span>
                      </div>
                      <span className="text-[9px] font-mono-tabular px-1.5 py-0.5 rounded bg-[#CCFF00]/15 text-[#CCFF00] border border-[#CCFF00]/30">
                        SAKURA RC PRO
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Preset ini hanya mengubah feel mobil Sakura RC Pro. W / throttle tetap wajib ditekan;
                      mobil tidak akan maju sendiri.
                    </p>
                  </div>

                  <div>
                    <div className="text-[10px] font-display font-bold uppercase tracking-wider text-slate-300 mb-2">
                      PRESET SARAN — PILIH SEKALI, LALU FINE-TUNE
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {HARUNA_DRIVING_PRESETS.map((preset) => {
                        const isSelected =
                          harunaTuning.accelerationPower === preset.setup.accelerationPower &&
                          harunaTuning.driftResponse === preset.setup.driftResponse &&
                          harunaTuning.throttleResponse === preset.setup.throttleResponse &&
                          harunaTuning.handlingAssist === preset.setup.handlingAssist &&
                          (tuning.speedLevel ?? 'normal') === preset.setup.speedLevel;
                        return (
                          <button
                            key={preset.id}
                            onClick={() =>
                              onChangeTuning({
                                ...tuning,
                                ...preset.setup,
                                smokeConfig: tuning.smokeConfig || DEFAULT_SMOKE_CONFIG,
                              })
                            }
                            className={`text-left p-2.5 rounded-xl border transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#FF2A85]/20 border-[#FF2A85] shadow-[0_0_14px_rgba(255,42,133,0.2)]'
                                : 'bg-slate-900/75 border-white/10 hover:border-[#FF2A85]/60'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-display font-bold text-xs text-white tracking-wider">
                                {preset.name}
                              </span>
                              {isSelected && (
                                <span className="text-[9px] font-mono-tabular px-1.5 py-0.5 rounded bg-[#FF2A85] text-white font-bold shrink-0">
                                  AKTIF
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {preset.subtitle}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3 bg-black/20 p-3 rounded-xl border border-white/10">
                    <div className="text-[10px] font-display font-bold uppercase tracking-wider text-[#CCFF00] border-b border-white/10 pb-2">
                      FINE-TUNE HARUNA FEEL
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-display font-bold text-[11px] uppercase tracking-wider text-white">
                          AKSELERASI / MOTOR POWER
                        </span>
                        <span className="font-mono-tabular font-bold text-xs text-[#CCFF00]">
                          {harunaTuning.accelerationPower}%
                        </span>
                      </div>
                      <input
                        aria-label="Haruna acceleration power"
                        type="range"
                        min={65}
                        max={140}
                        value={harunaTuning.accelerationPower}
                        onChange={(e) =>
                          updateHarunaTuning({ accelerationPower: Number(e.target.value) })
                        }
                        className="w-full rc-slider"
                      />
                      <div className="flex justify-between text-[9px] font-mono-tabular text-slate-500">
                        <span>LEMBUT</span><span>RESPONSIF</span><span>KUAT</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-display font-bold text-[11px] uppercase tracking-wider text-white">
                          KARAKTER / RESPONS DRIFT
                        </span>
                        <span className="font-mono-tabular font-bold text-xs text-[#FF2A85]">
                          {harunaTuning.driftResponse}%
                        </span>
                      </div>
                      <input
                        aria-label="Haruna drift response"
                        type="range"
                        min={0}
                        max={100}
                        value={harunaTuning.driftResponse}
                        onChange={(e) =>
                          updateHarunaTuning({ driftResponse: Number(e.target.value) })
                        }
                        className="w-full rc-slider"
                      />
                      <div className="flex justify-between text-[9px] font-mono-tabular text-slate-500">
                        <span>GRIP</span><span>BALANCED</span><span>AGRESIF</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-display font-bold text-[11px] uppercase tracking-wider text-white">
                          KECEPATAN NGEGAS / THROTTLE RESPONSE
                        </span>
                        <span className="font-mono-tabular font-bold text-xs text-[#00F0FF]">
                          {harunaTuning.throttleResponse}%
                        </span>
                      </div>
                      <input
                        aria-label="Haruna throttle response"
                        type="range"
                        min={50}
                        max={150}
                        value={harunaTuning.throttleResponse}
                        onChange={(e) =>
                          updateHarunaTuning({ throttleResponse: Number(e.target.value) })
                        }
                        className="w-full rc-slider"
                      />
                      <div className="flex justify-between text-[9px] font-mono-tabular text-slate-500">
                        <span>HALUS</span><span>PROGRESIF</span><span>CEPAT</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-display font-bold text-[11px] uppercase tracking-wider text-white">
                          KERINGANAN / HANDLING ASSIST
                        </span>
                        <span className="font-mono-tabular font-bold text-xs text-[#00F0FF]">
                          {harunaTuning.handlingAssist}%
                        </span>
                      </div>
                      <input
                        aria-label="Haruna handling assist"
                        type="range"
                        min={0}
                        max={100}
                        value={harunaTuning.handlingAssist}
                        onChange={(e) =>
                          updateHarunaTuning({ handlingAssist: Number(e.target.value) })
                        }
                        className="w-full rc-slider"
                      />
                      <div className="flex justify-between text-[9px] font-mono-tabular text-slate-500">
                        <span>RAW</span><span>NYAMAN</span><span>STABIL</span>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-display font-bold uppercase tracking-wider text-white mb-2">
                        SPEED PROFILE / BATAS KECEPATAN
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['normal', 'sedang', '2x'] as const).map((level) => {
                          const active = (tuning.speedLevel ?? 'normal') === level;
                          return (
                            <button
                              key={level}
                              onClick={() => onChangeTuning({ ...tuning, speedLevel: level })}
                              className={`py-2 rounded-lg border font-mono-tabular text-[10px] font-bold transition cursor-pointer ${
                                active
                                  ? 'bg-[#00F0FF] text-[#0B0D13] border-[#00F0FF]'
                                  : 'bg-slate-900 text-slate-300 border-white/10 hover:border-[#00F0FF]/60'
                              }`}
                            >
                              {level.toUpperCase()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* RC Sound Box Mode Selector */}
              <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-[#00F0FF]/30">
                <div className="text-xs font-display font-bold uppercase tracking-wider text-white mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-[#00F0FF]" />
                    <span>ONBOARD RC SOUND MODULE</span>
                  </span>
                  <button
                    onClick={() => rcSound.playTurboFlutter()}
                    className="text-[10px] font-mono-tabular px-2 py-0.5 rounded bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/40 hover:bg-[#00F0FF]/30 cursor-pointer"
                  >
                    TEST TURBO FLUTTER
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: 'rb26_soundbox',
                        title: 'RB26DETT SOUND BOX',
                        sub: 'Warm Inline-6 + Stu-tu-tu',
                      },
                      {
                        id: 'pro_brushless',
                        title: 'SILKY RC BRUSHLESS',
                        sub: 'Smooth Geared Motor Hum',
                      },
                    ] as { id: SoundMode; title: string; sub: string }[]
                  ).map((sm) => {
                    const active = (tuning.soundMode || 'rb26_soundbox') === sm.id;
                    return (
                      <button
                        key={sm.id}
                        onClick={() => {
                          rcSound.setSoundMode(sm.id);
                          onChangeTuning({ ...tuning, soundMode: sm.id });
                        }}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          active
                            ? 'bg-[#00F0FF]/20 border-[#00F0FF] text-white'
                            : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="font-display font-bold text-xs">{sm.title}</div>
                        <div className="text-[10px] opacity-80">{sm.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Pro Setup Presets */}
              <div>
                <div className="text-xs font-display font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-[#00F0FF]" />
                  <span>FACTORY PRO SETUP PRESETS</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {TUNING_PRESETS.map((preset) => {
                    const isSelected =
                      tuning.gyroGain === preset.setup.gyroGain &&
                      tuning.maxSteerAngle === preset.setup.maxSteerAngle &&
                      tuning.escTurboBoost === preset.setup.escTurboBoost;
                    return (
                      <button
                        key={preset.id}
                        onClick={() =>
                          onChangeTuning({
                            ...tuning,
                            ...preset.setup,
                            smokeConfig: tuning.smokeConfig || DEFAULT_SMOKE_CONFIG,
                          })
                        }
                        className={`text-left p-2.5 rounded-xl border transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#00F0FF]/15 border-[#00F0FF] shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                            : 'bg-slate-900/70 border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display font-bold text-xs text-white tracking-wider">
                            {preset.name}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-[#00F0FF] text-[#0B0D13] font-bold">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {preset.subtitle}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4 Core RC Physics Sliders */}
              <div className="space-y-4 bg-slate-950/70 p-4 rounded-2xl border border-white/10">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      1. RC GYRO GAIN (COUNTER-STEER)
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-[#00F0FF]">
                      {tuning.gyroGain}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={100}
                    value={tuning.gyroGain}
                    onChange={(e) =>
                      onChangeTuning({
                        ...tuning,
                        gyroGain: Number(e.target.value),
                      })
                    }
                    className="w-full rc-slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      2. MAX ACKERMANN STEER LOCK
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-[#CCFF00]">
                      {tuning.maxSteerAngle}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={55}
                    max={82}
                    value={tuning.maxSteerAngle}
                    onChange={(e) =>
                      onChangeTuning({
                        ...tuning,
                        maxSteerAngle: Number(e.target.value),
                      })
                    }
                    className="w-full rc-slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                      3. ESC TURBO TIMING BOOST
                    </span>
                    <span className="font-mono-tabular font-bold text-sm text-[#FF2A85]">
                      {tuning.escTurboBoost}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={100}
                    value={tuning.escTurboBoost}
                    onChange={(e) =>
                      onChangeTuning({
                        ...tuning,
                        escTurboBoost: Number(e.target.value),
                      })
                    }
                    className="w-full rc-slider"
                  />
                </div>

                <div>
                  <div className="font-display font-bold text-xs uppercase tracking-wider text-white mb-2">
                    4. SPEC TIRE COMPOUND
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        {
                          id: 'hdpe_ptile',
                          name: 'HDPE P-TILE',
                          desc: 'Balanced Slide',
                        },
                        {
                          id: 'poly_slick',
                          name: 'POLY SLICK',
                          desc: 'Max Ice Slip',
                        },
                        {
                          id: 'silver_dot',
                          name: 'SILVER DOT',
                          desc: 'Fast Bite',
                        },
                      ] as { id: TireCompound; name: string; desc: string }[]
                    ).map((t) => {
                      const active = tuning.tireCompound === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() =>
                            onChangeTuning({ ...tuning, tireCompound: t.id })
                          }
                          className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                            active
                              ? 'bg-[#00F0FF]/20 border-[#00F0FF] text-white'
                              : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          <div className="font-display font-bold text-[11px]">
                            {t.name}
                          </div>
                          <div className="text-[10px] opacity-75">{t.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                  <div>
                    <div className="font-display font-bold text-xs uppercase text-[#CCFF00] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>HYPERCASUAL 1-HAND AUTO-THROTTLE</span>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      onChangeTuning({
                        ...tuning,
                        autoThrottle: !tuning.autoThrottle,
                      })
                    }
                    className={`px-3 py-1.5 rounded-lg font-mono-tabular font-bold text-xs uppercase cursor-pointer ${
                      tuning.autoThrottle
                        ? 'bg-[#CCFF00] text-[#0B0D13]'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {tuning.autoThrottle ? 'ENABLED' : 'MANUAL'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Body Shell Visibility Mode */}
              <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-white/10">
                <div className="text-xs font-display font-bold uppercase tracking-wider text-white mb-2 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-[#00F0FF]" />
                  <span>LEXAN SHELL DISPLAY MODE</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'painted', label: 'PAINTED LEXAN' },
                      { id: 'translucent', label: 'X-RAY CLEAR' },
                      { id: 'naked_chassis', label: 'NAKED CHASSIS' },
                    ] as { id: BodyShellMode; label: string }[]
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() =>
                        onChangeCustomization({
                          ...customization,
                          bodyShellMode: m.id,
                        })
                      }
                      className={`py-2 px-2 rounded-xl font-display font-bold text-[11px] border transition cursor-pointer ${
                        customization.bodyShellMode === m.id
                          ? 'bg-[#00F0FF] text-[#0B0D13] border-[#00F0FF]'
                          : 'bg-slate-900 text-slate-300 border-white/10 hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 1:10 JDM Lexan Body Selector */}
              <div>
                <div className="text-xs font-display font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-[#00F0FF]" />
                  <span>SELECT 1:10 JDM LEXAN BODY SHELL</span>
                </div>
                <div className="space-y-2">
                  {RC_BODIES.map((body) => {
                    const selected = customization.bodyId === body.id;
                    return (
                      <button
                        key={body.id}
                        onClick={() =>
                          onChangeCustomization({
                            ...customization,
                            bodyId: body.id,
                            bodyColor: body.defaultColor,
                            chassisAnodizeColor: body.defaultAnodize,
                            neonColor: body.defaultNeon,
                          })
                        }
                        className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${
                          selected
                            ? 'bg-[#00F0FF]/15 border-[#00F0FF] shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                            : 'bg-slate-900/75 border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display font-extrabold text-sm text-white">
                            {body.name}
                          </span>
                          <span className="text-[10px] font-mono-tabular px-2 py-0.5 rounded bg-white/10 text-[#00F0FF]">
                            {body.chassisCode}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {body.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color Swatches */}
              <div className="bg-slate-950/70 p-4 rounded-2xl border border-white/10 space-y-4">
                <div>
                  <div className="text-xs font-display font-bold uppercase tracking-wider text-white mb-2">
                    SKYLINE GT-R FACTORY & D1 PAINT
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {PAINT_SWATCHES.map((s) => (
                      <button
                        key={s.hex}
                        onClick={() =>
                          onChangeCustomization({
                            ...customization,
                            bodyColor: s.hex,
                          })
                        }
                        title={s.name}
                        className="w-9 h-9 rounded-xl border-2 flex items-center justify-center transition transform hover:scale-105 cursor-pointer"
                        style={{
                          backgroundColor: s.hex,
                          borderColor:
                            customization.bodyColor === s.hex
                              ? '#FFFFFF'
                              : 'rgba(255,255,255,0.2)',
                        }}
                      >
                        {customization.bodyColor === s.hex && (
                          <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-display font-bold uppercase tracking-wider text-white mb-2">
                    TE37 RIMS & ANODIZED CNC ALUMINUM
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {ANODIZE_SWATCHES.map((s) => (
                      <button
                        key={s.hex}
                        onClick={() =>
                          onChangeCustomization({
                            ...customization,
                            chassisAnodizeColor: s.hex,
                          })
                        }
                        title={s.name}
                        className="w-9 h-9 rounded-xl border-2 flex items-center justify-center transition transform hover:scale-105 cursor-pointer"
                        style={{
                          backgroundColor: s.hex,
                          borderColor:
                            customization.chassisAnodizeColor === s.hex
                              ? '#FFFFFF'
                              : 'rgba(255,255,255,0.2)',
                        }}
                      >
                        {customization.chassisAnodizeColor === s.hex && (
                          <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-display font-bold uppercase tracking-wider text-white mb-2">
                    CHASSIS LED UNDERGLOW
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {NEON_SWATCHES.map((s) => (
                      <button
                        key={s.hex}
                        onClick={() =>
                          onChangeCustomization({
                            ...customization,
                            neonColor: s.hex,
                          })
                        }
                        title={s.name}
                        className="w-9 h-9 rounded-xl border-2 flex items-center justify-center transition transform hover:scale-105 cursor-pointer"
                        style={{
                          backgroundColor: s.hex,
                          borderColor:
                            customization.neonColor === s.hex
                              ? '#FFFFFF'
                              : 'rgba(255,255,255,0.2)',
                        }}
                      >
                        {customization.neonColor === s.hex && (
                          <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Drawer Footer CTA */}
        <div className="p-4 border-t border-white/10 bg-slate-950/90">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#CCFF00] text-[#0B0D13] font-display font-extrabold text-sm tracking-wider uppercase shadow-[0_0_20px_rgba(0,240,255,0.4)] hover:brightness-110 transition cursor-pointer"
          >
            {isHarunaMap
              ? 'RETURN TO HARUNA DOWNHILL // APPLY SETUP'
              : 'RETURN TO AULA TRACK // APPLY SETUP'}
          </button>
        </div>
      </div>
    </div>
  );
};
