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
    name: 'Nissan Skyline GT-R R34',
    short: 'GT-R R34',
    tagline: 'Legenda JDM · Sedan coupe 4WD',
    colors: [
      { name: 'Bayside Blue', hex: '#1d5fd1' },
      { name: 'Millennium Jade', hex: '#7f9c8f' },
      { name: 'Midnight Purple', hex: '#3b1f66' },
      { name: 'Active Red', hex: '#d3232a' },
      { name: 'Black Pearl', hex: '#17171c' },
      { name: 'White Pearl', hex: '#f1f1ee' },
    ],
    wheelX: 0.58,
    wheelFrontZ: -0.8,
    wheelRearZ: 0.8,
    wheelRadius: 0.31,
    spinScale: 1,
  },
  yaris: {
    id: 'yaris',
    name: 'Toyota GR Yaris',
    short: 'GR Yaris',
    tagline: 'Hot hatch rally · Kompak & lincah',
    colors: [
      { name: 'Platinum White', hex: '#f3f3f0' },
      { name: 'Emotional Red', hex: '#c8102e' },
      { name: 'Precious Black', hex: '#141416' },
      { name: 'Ice Grey', hex: '#b6babf' },
      { name: 'Rally Yellow', hex: '#f5c518' },
      { name: 'Gazoo Green', hex: '#2f6e4f' },
    ],
    wheelX: 0.56,
    wheelFrontZ: -0.66,
    wheelRearZ: 0.7,
    wheelRadius: 0.3,
    spinScale: 1.05,
  },
}

export const CAR_LIST: CarSpec[] = [CARS.gtr, CARS.yaris]
