import { useState } from 'react';
import { DRIFT_PROMPTS, downloadFile, copyToClipboard, type DriftPromptData } from '../data/driftPrompts';

interface PromptDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPromptId?: string;
}

export function PromptDownloadModal({ isOpen, onClose, initialPromptId }: PromptDownloadModalProps) {
  const [selectedId, setSelectedId] = useState<string>(initialPromptId || DRIFT_PROMPTS[0].id);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentPrompt = DRIFT_PROMPTS.find((p) => p.id === selectedId) || DRIFT_PROMPTS[0];

  const handleCopy = async () => {
    const ok = await copyToClipboard(currentPrompt.markdownContent);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadSingle = (prompt: DriftPromptData) => {
    downloadFile(prompt.filename, prompt.markdownContent);
  };

  const handleDownloadAllBundle = () => {
    const bundleContent = `# BUNDLE KOLEKSI SYSTEM PROMPT RC & TOUGE DRIFT (${DRIFT_PROMPTS.length} MODE)
Generated: ${new Date().toLocaleDateString('id-ID')}
Koleksi lengkap spesifikasi arsitektur fisika drift & touge rally untuk seluruh mode game.

================================================================================
${DRIFT_PROMPTS.map((p, i) => `\n\n### [MODE ${i + 1}] ${p.title} (${p.sourceZip})\n\n${p.markdownContent}\n\n================================================================================`).join('')}
`;
    downloadFile('BUNDLE-SEMUA-PROMPT-RC-DRIFT.md', bundleContent);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-neutral-900 border border-neutral-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/80">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📥</span>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
                <span>DOWNLOAD PROMPT SISTEM DRIFT</span>
              </h2>
              <p className="text-xs text-neutral-400">
                Dokumentasi arsitektur &amp; prompt teknis lengkap untuk tiap mode game
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center font-bold text-sm transition cursor-pointer"
            title="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/40 p-2 gap-2 overflow-x-auto scrollbar-none">
          {DRIFT_PROMPTS.map((p) => {
            const active = p.id === selectedId;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedId(p.id);
                  setCopied(false);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-yellow-400 text-neutral-950 shadow-md'
                    : 'bg-neutral-800/70 text-neutral-300 hover:bg-neutral-800 hover:text-white'
                }`}
              >
                <span>{p.id === 'pro_drift' ? '✨' : p.id === 'ebisu' ? '🏔️' : '🌸'}</span>
                <span>{p.title}</span>
              </button>
            );
          })}
        </div>

        {/* Subheader Info & Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-neutral-900 border-b border-neutral-800 text-xs">
          <div className="flex items-center gap-2 text-neutral-300">
            <span className="font-semibold text-yellow-300">File Sumber:</span>
            <span className="px-2 py-0.5 rounded bg-neutral-800 font-mono text-[11px] text-neutral-300 border border-neutral-700">
              {currentPrompt.sourceZip}
            </span>
            <span className="hidden sm:inline text-neutral-500">•</span>
            <span className="hidden sm:inline text-neutral-400 font-mono">{currentPrompt.filename}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white font-semibold flex items-center gap-1.5 transition cursor-pointer border border-neutral-700"
            >
              <span>{copied ? '✅' : '📋'}</span>
              <span>{copied ? 'Tersalin ke Clipboard!' : 'Copy Prompt'}</span>
            </button>

            <button
              onClick={() => handleDownloadSingle(currentPrompt)}
              className="px-3.5 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-bold flex items-center gap-1.5 transition shadow cursor-pointer"
            >
              <span>📥</span>
              <span>Download .md</span>
            </button>
          </div>
        </div>

        {/* Prompt Content Preview (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-neutral-950/60 font-mono text-xs sm:text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed select-text border-inner">
          {currentPrompt.markdownContent}
        </div>

        {/* Footer with Master Bundle Download */}
        <div className="px-6 py-3.5 border-t border-neutral-800 bg-neutral-950/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-neutral-400 flex items-center gap-1.5">
            <span>💡</span>
            <span>Prompt ini bisa langsung kamu tempelkan ke AI atau editor kode untuk mereplikasi fisika drift tersebut.</span>
          </div>

          <button
            onClick={handleDownloadAllBundle}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 font-black flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
          >
            <span>📦</span>
            <span>Download Semua Prompt (3 Mode Sekaligus)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
