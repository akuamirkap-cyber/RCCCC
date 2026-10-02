import React, { useState } from 'react';
import { X, Copy, Check, BookOpen, FileText, ClipboardList } from 'lucide-react';
import { DESIGN_DOC_SECTIONS, FULL_DESIGN_DOC_TEXT } from '../data/designDocs';

interface DesignDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext !== false) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy method
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const DesignDocsModal: React.FC<DesignDocsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<string>(DESIGN_DOC_SECTIONS[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const active =
    DESIGN_DOC_SECTIONS.find((s) => s.id === activeTab) ?? DESIGN_DOC_SECTIONS[0];

  const handleCopySection = async () => {
    const text = `${active.title}\n${active.subtitle}\n\n${active.body}`;
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedId(active.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    }
  };

  const handleCopyAll = async () => {
    const ok = await copyTextToClipboard(FULL_DESIGN_DOC_TEXT);
    if (ok) {
      setCopiedId('__all__');
      window.setTimeout(() => setCopiedId(null), 1800);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden border border-white/15 bg-[#14101F] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-white/10 bg-[#1B1430]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F9A8D4] to-[#7C3AED] flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-display font-extrabold text-white text-sm sm:text-base tracking-widest">
                DOKUMEN DESAIN MAP &amp; MENU
              </div>
              <div className="text-[10px] sm:text-[11px] font-mono-tabular text-pink-200/60">
                Bisa di-copy — pilih tab lalu tekan tombol COPY
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
            aria-label="Tutup dokumentasi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 px-3 sm:px-4 pt-3">
          {DESIGN_DOC_SECTIONS.map((s) => {
            const activeTabOn = s.id === active.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveTab(s.id)}
                className={`flex-1 px-2 py-2 rounded-xl text-[11px] sm:text-xs font-display font-bold tracking-wider uppercase transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTabOn
                    ? 'bg-[#F9A8D4] text-[#1B1430] shadow-[0_0_15px_rgba(249,168,212,0.4)]'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden xs:inline sm:inline">{s.tabLabel}</span>
                <span className="sm:hidden">{s.tabLabel.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Body — teks bisa di-block/select manual */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4">
          <div className="text-[10px] font-mono-tabular text-pink-200/60 mb-1 select-text">
            {active.subtitle}
          </div>
          <h2 className="font-display font-extrabold text-white text-base sm:text-lg tracking-wider select-text">
            {active.title}
          </h2>
          <pre className="mt-3 whitespace-pre-wrap break-words font-mono-tabular text-[11px] sm:text-xs leading-relaxed text-slate-200 bg-black/40 border border-white/10 rounded-xl p-3 sm:p-4 select-text">
            {active.body}
          </pre>
          <p className="mt-2 text-[10px] font-mono-tabular text-slate-400 select-text">
            Tips: teks di atas bisa di-block pakai mouse lalu Ctrl+C — atau pakai tombol COPY di bawah.
          </p>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row gap-2 px-4 sm:px-5 py-3 border-t border-white/10 bg-[#1B1430]">
          <button
            onClick={handleCopySection}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#F9A8D4] to-[#F472B6] text-[#1B1430] font-display font-extrabold text-xs sm:text-sm tracking-widest uppercase flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] transition cursor-pointer"
          >
            {copiedId === active.id ? (
              <>
                <Check className="w-4 h-4" />
                <span>TERCOPY!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>COPY BAGIAN INI</span>
              </>
            )}
          </button>
          <button
            onClick={handleCopyAll}
            className="flex-1 py-2.5 rounded-xl bg-white/8 border border-white/20 text-white font-display font-bold text-xs sm:text-sm tracking-widest uppercase flex items-center justify-center gap-2 hover:bg-white/15 transition cursor-pointer"
          >
            {copiedId === '__all__' ? (
              <>
                <Check className="w-4 h-4 text-[#CCFF00]" />
                <span>SEMUA TERCOPY!</span>
              </>
            ) : (
              <>
                <ClipboardList className="w-4 h-4 text-[#F9A8D4]" />
                <span>COPY SEMUA</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
