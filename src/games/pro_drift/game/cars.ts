export type CarId = 'gtr' | 'yaris'

export interface CarSpec {
  id: CarId
  name: string
  short: string
  tagline: string
  colors: { name: string; hex: string }[]
  // posisi roda (x, z) & radius
  wheelX: number
  wheelFrontZ: number
  wheelRearZ: number
  wheelRadius: number
  // faktor visual wheel spin
  spinScale: number
}

export const CARS: Record<CarId, CarSpec> = {
  gtr: {
    id: 'gtr',
    name: 'BMW M3 Drift Coupe (GLB)',
    short: 'BMW M3',
    tagline: 'Body GLB BMW M3 · Drift Spec',
    colors: [
      { name: 'Alpine White', hex: '#f8fafc' },
      { name: 'Estoril Blue', hex: '#1d5fd1' },
      { name: 'Isle of Man Green', hex: '#2f6e4f' },
      { name: 'Sao Paulo Yellow', hex: '#f5c518' },
      { name: 'Toronto Red', hex: '#d3232a' },
      { name: 'Black Sapphire', hex: '#17171c' },
    ],
    wheelX: 0.58,
    wheelFrontZ: -0.8,
    wheelRearZ: 0.8,
    wheelRadius: 0.31,
    spinScale: 1,
  },
  yaris: {
    id: 'yaris',
    name: 'BMW M3 Competition (GLB)',
    short: 'BMW M3 Comp',
    tagline: 'Body GLB BMW M3 · Pro Tuned',
    colors: [
      { name: 'Estoril Blue', hex: '#1d5fd1' },
      { name: 'Alpine White', hex: '#f8fafc' },
      { name: 'Toronto Red', hex: '#c8102e' },
      { name: 'Black Sapphire', hex: '#141416' },
      { name: 'Sao Paulo Yellow', hex: '#f5c518' },
      { name: 'Isle of Man Green', hex: '#2f6e4f' },
    ],
    wheelX: 0.56,
    wheelFrontZ: -0.66,
    wheelRearZ: 0.7,
    wheelRadius: 0.3,
    spinScale: 1.05,
  },
}

export const CAR_LIST: CarSpec[] = [CARS.gtr, CARS.yaris]
