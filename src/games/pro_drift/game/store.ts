import { create } from 'zustand'
import { CARS, type CarId } from './cars'

export type Phase = 'menu' | 'countdown' | 'playing' | 'finished'
export type Mode = 'race' | 'time'

export interface Popup {
  id: number
  text: string
  color: string
}

export { CARS, CAR_LIST } from './cars'

function loadCar(): { model: CarId; color: string } {
  try {
    const raw = localStorage.getItem('rc-drift-car')
    if (raw) {
      const p = JSON.parse(raw)
      const model: CarId = p.model in CARS ? p.model : 'gtr'
      const color = CARS[model].colors.some((c) => c.hex === p.color) ? p.color : CARS[model].colors[0].hex
      return { model, color }
    }
  } catch {
    /* ignore */
  }
  return { model: 'gtr', color: CARS.gtr.colors[0].hex }
}

function saveCar(model: CarId, color: string) {
  try {
    localStorage.setItem('rc-drift-car', JSON.stringify({ model, color }))
  } catch {
    /* ignore */
  }
}

const initialCar = loadCar()

export const RACE_LAPS = 3
export const TIME_LIMIT = 60

interface Best {
  race: number
  time: number
  lap: number | null
}

function loadBest(): Best {
  try {
    const raw = localStorage.getItem('rc-drift-best')
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { race: 0, time: 0, lap: null }
}

interface GameState {
  phase: Phase
  mode: Mode
  carModel: CarId
  carColor: string
  countdown: number
  score: number
  pending: number
  mult: number
  drifting: boolean
  speed: number
  lap: number
  time: number
  lapTimes: number[]
  best: Best
  popups: Popup[]
  muted: boolean
  clipsCollected: number
  position: number
  standings: { name: string; me: boolean; color: string }[]
  // Balatro-style scoring juice
  chipBump: number // naik tiap chips bertambah dari event
  multBump: number // naik tiap mult bertambah
  bank: { id: number; chips: number; mult: number; total: number } | null
  sector: { name: string; pct: number } | null
  tandem: boolean
  bigAngle: boolean
  tags: { id: number; text: string; kind: 'chip' | 'mult' | 'bad' | 'info' }[]
  finalScore: number
  finalBestLap: number | null
  finalPosition: number
  finalPosBonus: number
  isNewBest: boolean

  setPhase: (p: Phase) => void
  setMode: (m: Mode) => void
  setCarModel: (m: CarId) => void
  setCarColor: (c: string) => void
  setCountdown: (n: number) => void
  setHud: (h: Partial<Pick<GameState, 'score' | 'pending' | 'mult' | 'drifting' | 'speed' | 'lap' | 'time' | 'lapTimes' | 'clipsCollected' | 'position' | 'standings' | 'sector' | 'tandem' | 'bigAngle'>>) => void
  bump: (kind: 'chip' | 'mult') => void
  setBank: (b: GameState['bank']) => void
  addTag: (text: string, kind?: 'chip' | 'mult' | 'bad' | 'info') => void
  addPopup: (text: string, color?: string) => void
  removePopup: (id: number) => void
  toggleMuted: () => void
  finish: (score: number, bestLap: number | null, position: number, posBonus: number) => void
}

let popupId = 0

export const useGame = create<GameState>((set, get) => ({
  phase: 'menu',
  mode: 'race',
  carModel: initialCar.model,
  carColor: initialCar.color,
  countdown: 3,
  score: 0,
  pending: 0,
  mult: 1,
  drifting: false,
  speed: 0,
  lap: 0,
  time: 0,
  lapTimes: [],
  best: loadBest(),
  popups: [],
  muted: false,
  clipsCollected: 0,
  position: 4,
  standings: [],
  chipBump: 0,
  multBump: 0,
  bank: null,
  sector: null,
  tandem: false,
  bigAngle: false,
  tags: [],
  finalScore: 0,
  finalBestLap: null,
  finalPosition: 4,
  finalPosBonus: 0,
  isNewBest: false,

  setPhase: (phase) => set({ phase }),
  setMode: (mode) => set({ mode }),
  setCarModel: (carModel) => {
    const carColor = CARS[carModel].colors[0].hex
    saveCar(carModel, carColor)
    set({ carModel, carColor })
  },
  setCarColor: (carColor) => {
    saveCar(get().carModel, carColor)
    set({ carColor })
  },
  setCountdown: (countdown) => set({ countdown }),
  setHud: (h) => set(h),
  bump: (kind) => set((s) => (kind === 'chip' ? { chipBump: s.chipBump + 1 } : { multBump: s.multBump + 1 })),
  setBank: (bank) => {
    set({ bank })
    if (bank) setTimeout(() => set((s) => (s.bank?.id === bank.id ? { bank: null } : {})), 1500)
  },
  addTag: (text, kind = 'info') => {
    const id = ++popupId
    set((s) => ({ tags: [...s.tags.slice(-5), { id, text, kind }] }))
    setTimeout(() => set((s) => ({ tags: s.tags.filter((t) => t.id !== id) })), 1400)
  },
  addPopup: (text, color = '#ffffff') => {
    const id = ++popupId
    set((s) => ({ popups: [...s.popups.slice(-4), { id, text, color }] }))
    setTimeout(() => get().removePopup(id), 1200)
  },
  removePopup: (id) => set((s) => ({ popups: s.popups.filter((p) => p.id !== id) })),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  finish: (score, bestLap, position, posBonus) => {
    const { mode, best } = get()
    const prev = best[mode]
    const isNewBest = score > prev
    const nb: Best = { ...best }
    if (isNewBest) nb[mode] = score
    if (bestLap !== null && (nb.lap === null || bestLap < nb.lap)) nb.lap = bestLap
    try {
      localStorage.setItem('rc-drift-best', JSON.stringify(nb))
    } catch {
      /* ignore */
    }
    set({ phase: 'finished', finalScore: score, finalBestLap: bestLap, finalPosition: position, finalPosBonus: posBonus, isNewBest, best: nb })
  },
}))
