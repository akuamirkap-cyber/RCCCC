import { useEffect } from 'react'
import { Scene } from './game/Scene'
import { UI } from './game/UI'
import { bindKeyboard } from './game/input'

export default function ProDriftApp({ onSwitchGame }: { onSwitchGame?: () => void }) {
  useEffect(() => {
    bindKeyboard()
  }, [])
  return (
    <div className="fixed inset-0 overflow-hidden bg-sky-300">
      <Scene />
      <UI />

      {onSwitchGame && (
        <button
          onClick={onSwitchGame}
          className="fixed top-3 left-3 z-50 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-neutral-900/85 hover:bg-neutral-900 text-white text-xs font-bold shadow-lg border border-white/20 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
          title="Kembali ke menu pemilihan game"
        >
          <span>🎮</span>
          <span>PILIH GAME</span>
        </button>
      )}
    </div>
  )
}
