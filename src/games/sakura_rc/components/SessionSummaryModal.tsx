import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, RotateCcw, Sliders, Zap } from 'lucide-react';
import { SessionResult } from '../types/rcDrift';

interface SessionSummaryModalProps {
  result: SessionResult | null;
  onReplay: () => void;
  onOpenPitBench: () => void;
}

export const SessionSummaryModal: React.FC<SessionSummaryModalProps> = ({
  result,
  onReplay,
  onOpenPitBench,
}) => {
  useEffect(() => {
    if (result && (result.grade === 'S+' || result.grade === 'S')) {
      confetti({
        particleCount: 75,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [result]);

  if (!result) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-lg hud-panel-cyan rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00F0FF]/15 border border-[#00F0FF]/40 text-[#00F0FF] text-xs font-mono-tabular uppercase tracking-widest mb-3">
          <Trophy className="w-3.5 h-3.5" />
          <span>OFFICIAL 1:10 RWD QUALIFYING SCORECARD</span>
        </div>

        <h2 className="font-display font-extrabold text-2xl sm:text-3xl uppercase tracking-wider text-white">
          {result.circuitName}
        </h2>

        {/* Giant Grade & Total Score */}
        <div className="my-6 flex items-center justify-center gap-6">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#CCFF00] to-[#00F0FF] text-[#0B0D13] flex flex-col items-center justify-center shadow-[0_0_30px_rgba(204,255,0,0.5)] -skew-x-6">
            <span className="text-[10px] font-mono-tabular font-bold uppercase">
              RANK
            </span>
            <span className="font-display font-extrabold text-5xl leading-none">
              {result.grade}
            </span>
          </div>

          <div className="text-left">
            <div className="text-xs uppercase tracking-widest text-slate-400">
              FINAL JUDGE SCORE
            </div>
            <div className="font-mono-tabular font-extrabold text-4xl sm:text-5xl text-white">
              {result.totalScore.toLocaleString()}
              <span className="text-sm text-[#00F0FF] ml-1.5">PTS</span>
            </div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-mono-tabular text-[#CCFF00]">
              <Zap className="w-3.5 h-3.5" />
              <span>+RC$ {result.rcCreditsEarned.toLocaleString()} PIT REWARD</span>
            </div>
          </div>
        </div>

        {/* Telemetry Breakdown Grid */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-3">
            <div className="text-[10px] text-slate-400 uppercase">BEST COMBO</div>
            <div className="font-mono-tabular font-bold text-lg text-[#FF2A85] mt-0.5">
              {result.maxCombo.toLocaleString()}
            </div>
          </div>

          <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-3">
            <div className="text-[10px] text-slate-400 uppercase">MAX ANGLE</div>
            <div className="font-mono-tabular font-bold text-lg text-[#00F0FF] mt-0.5">
              {result.maxAngleDeg}° LOCK
            </div>
          </div>

          <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-3">
            <div className="text-[10px] text-slate-400 uppercase">CLIPS HIT</div>
            <div className="font-mono-tabular font-bold text-lg text-[#CCFF00] mt-0.5">
              {result.clipsHitCount}/{result.totalClipsPossible}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onReplay}
            className="flex-1 py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#CCFF00] text-[#0B0D13] font-display font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(0,240,255,0.45)] hover:brightness-110 transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 stroke-[2.5]" />
            <span>RUN AGAIN (3 LAPS)</span>
          </button>

          <button
            onClick={onOpenPitBench}
            className="py-3.5 px-5 rounded-xl bg-slate-900 border border-white/20 text-white font-display font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-slate-800 transition cursor-pointer"
          >
            <Sliders className="w-4 h-4 text-[#00F0FF]" />
            <span>TUNE IN PIT BENCH</span>
          </button>
        </div>
      </div>
    </div>
  );
};
