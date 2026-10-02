import { clipPoints, outerZones, driftSectors, stands, trees, samples, SAMPLES } from '../src/game/track.ts'
let len=0; for(let i=0;i<SAMPLES;i++){const a=samples[i],b=samples[(i+1)%SAMPLES];len+=Math.hypot(a.x-b.x,a.z-b.z)}
console.log('len',len.toFixed(0),'clips',clipPoints.map(c=>c.idx),'outer',outerZones.map(o=>o.idx),'sectors',driftSectors.map(s=>[s.from,s.to]),'stands',stands.length,'trees',trees.length)
