import { useEffect } from 'react'
import { Scene } from './game/Scene'
import { UI } from './game/UI'
import { bindKeyboard } from './game/input'

export default function App() {
  useEffect(() => {
    bindKeyboard()
  }, [])
  return (
    <div className="fixed inset-0 overflow-hidden bg-sky-300">
      <Scene />
      <UI />
    </div>
  )
}
