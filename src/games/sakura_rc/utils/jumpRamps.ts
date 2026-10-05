import * as THREE from 'three';
import { BotTrack, curvatureAt, frameAt, TrackPoint } from './botAi';

/* ============================================================
   AIR JUMP RAMPS — gundukan kicker di lurusan sirkuit aula
   - Posisi dipilih otomatis di lurusan terpanjang (jauh dari start & clipping zone)
   - Profil kicker: naik dengan kurva pangkat (ujung bersudut ~14°) lalu turun curam 1.6 m
   - Dipakai oleh fisika (tinggi + kemiringan) DAN mesh visual, jadi selalu sinkron
   ============================================================ */

export interface JumpRamp {
  /** Posisi awal ramp (parameter t lintasan, 0..1) */
  t: number;
  /** Panjang bagian naik (m) */
  length: number;
  /** Tinggi puncak (m) */
  height: number;
  /** Panjang bagian turun di belakang puncak (m) */
  tail: number;
  /** Label kecil untuk HUD/callout */
  label: string;
}

const KICK_EXP = 1.6; // slope ujung = KICK_EXP * height / length

export function rampProfile(r: JumpRamp, s: number): { h: number; slope: number } {
  if (s <= 0 || s >= r.length + r.tail) return { h: 0, slope: 0 };
  if (s <= r.length) {
    const u = s / r.length;
    return {
      h: r.height * Math.pow(u, KICK_EXP),
      slope: (KICK_EXP * r.height / r.length) * Math.pow(u, KICK_EXP - 1),
    };
  }
  const v = (s - r.length) / r.tail; // 0..1 turun
  const h = r.height * (1 - v) * (1 - v); // turun curam lalu melandai
  return { h, slope: (-2 * r.height / r.tail) * (1 - v) };
}

/** Tinggi & kemiringan permukaan ramp pada parameter t (menangani wrap loop tertutup). */
export function rampSurfaceAt(
  ramps: JumpRamp[],
  track: BotTrack,
  t: number
): { h: number; slope: number; ramp: JumpRamp | null } {
  for (const r of ramps) {
    let dT = t - r.t;
    if (track.closed) {
      dT = ((dT % 1) + 1) % 1;
    }
    const s = dT * track.length;
    if (s >= 0 && s < r.length + r.tail) {
      const p = rampProfile(r, s);
      return { h: p.h, slope: p.slope, ramp: r };
    }
  }
  return { h: 0, slope: 0, ramp: null };
}

/**
 * Cari lurusan terpanjang: run berurutan dengan |kelengkungan| kecil.
 * Ramp diletakkan di 45% panjang lurusan (masih ada jarak mendarat sebelum tikungan).
 */
export function findJumpRampSpots(
  track: BotTrack,
  avoidTs: number[],
  maxRamps = 2,
  opts: { minRunM?: number; curvMax?: number; avoidWindowT?: number } = {}
): JumpRamp[] {
  const minRunM = opts.minRunM ?? 30;
  const curvMax = opts.curvMax ?? 0.013;
  const avoidWindowT = opts.avoidWindowT ?? 0.05;
  const stepM = 2;
  const n = Math.floor(track.length / stepM);
  const isStraight = new Array<boolean>(n);
  for (let i = 0; i < n; i++) {
    const t = (i * stepM) / track.length;
    isStraight[i] = Math.abs(curvatureAt(track, t, 4)) < curvMax;
  }
  // Kumpulkan run (dengan wrap untuk loop tertutup)
  const runs: { start: number; len: number }[] = [];
  let i = 0;
  // mulai dari indeks yang bukan lurus supaya run yang melewati t=0 tidak terpotong
  let startIdx = 0;
  while (startIdx < n && isStraight[startIdx]) startIdx++;
  if (startIdx >= n) startIdx = 0;
  let visited = 0;
  i = startIdx;
  while (visited < n) {
    if (isStraight[i]) {
      const s0 = i;
      let len = 0;
      while (visited < n && isStraight[i]) {
        len++;
        visited++;
        i = (i + 1) % n;
      }
      runs.push({ start: s0, len });
    } else {
      visited++;
      i = (i + 1) % n;
    }
  }
  runs.sort((a, b) => b.len - a.len);

  const ramps: JumpRamp[] = [];
  const tooClose = (t: number) => {
    const d = (a: number, b: number) => {
      let x = Math.abs(a - b);
      if (track.closed) x = Math.min(x, 1 - x);
      return x;
    };
    if (avoidTs.some((a) => d(a, t) < avoidWindowT)) return true;
    if (ramps.some((r) => d(r.t, t) < 0.12)) return true;
    return false;
  };
  // Dua pass: pass 1 hindari area start (t≈0, 10% lintasan), pass 2 longgar kalau belum dapat
  for (const startWindow of [0.1, 0.05]) {
    for (const run of runs) {
      if (ramps.length >= maxRamps) break;
      const runM = run.len * stepM;
      if (runM < minRunM) break;
      // Ukuran kicker menyesuaikan panjang lurusan (landasan mendarat harus cukup)
      const length = runM > 90 ? 9 : runM > 46 ? 7.5 : 6;
      const height = runM > 90 ? 1.25 : runM > 46 ? 1.0 : 0.8;
      // Letakkan di 40% run: landasan mendarat masih lurus setelah ramp
      const sStart = (run.start * stepM + runM * 0.4) % track.length;
      const t = sStart / track.length;
      const nearStart = track.closed ? Math.min(t, 1 - t) < startWindow : t < startWindow || t > 0.9;
      if (nearStart || tooClose(t)) continue;
      // Zona mendarat (10–30 m setelah kicker) harus cukup lurus supaya tidak langsung nabrak tembok
      let landingCurv = 0;
      for (let d = 10; d <= 30; d += 4) {
        const tt = (t + d / track.length) % 1;
        landingCurv = Math.max(landingCurv, Math.abs(curvatureAt(track, tt, 4)));
      }
      if (landingCurv > 0.02) continue;
      ramps.push({
        t,
        length,
        height,
        tail: 1.6,
        label: ramps.length === 0 ? 'AIR JUMP A' : 'AIR JUMP B',
      });
    }
    if (ramps.length >= maxRamps) break;
  }
  return ramps;
}

/* ---------- Tekstur permukaan & sisi ramp ---------- */
function makeRampTopTexture(accentHex: string): THREE.CanvasTexture {
  const W = 512;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  // Aspal gelap
  ctx.fillStyle = '#1C212C';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // Strip merah-putih di kedua tepi
  const edge = 44;
  for (let y = 0; y < H; y += 64) {
    const red = (y / 64) % 2 === 0;
    ctx.fillStyle = red ? '#E11D48' : '#F8FAFC';
    ctx.fillRect(0, y, edge, 64);
    ctx.fillRect(W - edge, y, edge, 64);
  }
  // Chevron panah ke arah laju (v naik = ke depan)
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const y = 160 + k * 200;
    ctx.beginPath();
    ctx.moveTo(W * 0.25, y + 70);
    ctx.lineTo(W * 0.5, y);
    ctx.lineTo(W * 0.75, y + 70);
    ctx.stroke();
  }
  // Teks JUMP
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 110px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(W / 2, 980);
  ctx.scale(1, -1);
  ctx.fillText('JUMP', 0, 0);
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeHazardTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#0B0D13';
  for (let i = -S; i < S * 2; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 32, 0);
    ctx.lineTo(i + 32 + S, S);
    ctx.lineTo(i + S, S);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Mesh ramp (permukaan + dinding sisi + muka belakang + pylon LED) mengikuti frame lintasan. */
export function buildJumpRampGroup(
  ramp: JumpRamp,
  track: BotTrack,
  halfWidth: number,
  yBase: number,
  accentHex: string
): { group: THREE.Group; pylonMats: THREE.MeshStandardMaterial[] } {
  const group = new THREE.Group();
  const total = ramp.length + ramp.tail;
  const step = 0.3;
  const count = Math.ceil(total / step) + 1;
  const scratch: TrackPoint = { x: 0, z: 0, nx: 0, nz: 0, heading: 0 };

  const top: number[] = [];
  const topUv: number[] = [];
  const topIdx: number[] = [];
  const side: number[] = [];
  const sideUv: number[] = [];
  const sideIdx: number[] = [];
  const w = halfWidth - 0.15;

  let prevL: THREE.Vector3 | null = null;
  let prevR: THREE.Vector3 | null = null;
  let prevH = 0;
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const s = Math.min(total, i * step);
    const t = track.closed ? (ramp.t + s / track.length) % 1 : Math.min(1, ramp.t + s / track.length);
    const fr = frameAt(track, t, scratch);
    const { h } = rampProfile(ramp, s);
    const y = yBase + h + 0.02;
    const L = new THREE.Vector3(fr.x + fr.nx * w, y, fr.z + fr.nz * w);
    const R = new THREE.Vector3(fr.x - fr.nx * w, y, fr.z - fr.nz * w);
    top.push(L.x, L.y, L.z, R.x, R.y, R.z);
    const v = s / total;
    topUv.push(0, v, 1, v);
    if (i > 0) {
      const b = (i - 1) * 2;
      topIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    // dinding sisi (kiri & kanan) dari permukaan turun ke yBase
    if (prevL && prevR) {
      const segLen = L.distanceTo(prevL);
      const pushQuad = (a: THREE.Vector3, b: THREE.Vector3, ha: number, hb: number, flip: boolean) => {
        const base = side.length / 3;
        side.push(a.x, yBase, a.z, b.x, yBase, b.z, b.x, yBase + hb + 0.02, b.z, a.x, yBase + ha + 0.02, a.z);
        sideUv.push(acc, 0, acc + segLen, 0, acc + segLen, hb, acc, ha);
        if (flip) sideIdx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        else sideIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      };
      pushQuad(prevL, L, prevH, h, false);
      pushQuad(prevR, R, prevH, h, true);
      acc += segLen;
    }
    prevL = L;
    prevR = R;
    prevH = h;
  }

  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  topGeo.setAttribute('uv', new THREE.Float32BufferAttribute(topUv, 2));
  topGeo.setIndex(topIdx);
  topGeo.computeVertexNormals();
  const topMesh = new THREE.Mesh(
    topGeo,
    new THREE.MeshStandardMaterial({
      map: makeRampTopTexture(accentHex),
      roughness: 0.55,
      metalness: 0.08,
      side: THREE.DoubleSide,
    })
  );
  topMesh.receiveShadow = true;
  topMesh.castShadow = true;
  group.add(topMesh);

  const sideGeo = new THREE.BufferGeometry();
  sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
  sideGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sideUv, 2));
  sideGeo.setIndex(sideIdx);
  sideGeo.computeVertexNormals();
  const hazard = makeHazardTexture();
  hazard.repeat.set(0.5, 1);
  const sideMesh = new THREE.Mesh(
    sideGeo,
    new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide })
  );
  sideMesh.castShadow = true;
  group.add(sideMesh);

  // Pylon LED oranye di kedua sisi awal ramp + lampu di puncak
  const pylonMats: THREE.MeshStandardMaterial[] = [];
  const mkPylon = (fr: TrackPoint, sideSign: number, hBase: number) => {
    const px = fr.x + fr.nx * (halfWidth + 0.35) * sideSign;
    const pz = fr.z + fr.nz * (halfWidth + 0.35) * sideSign;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: '#CBD5E1', roughness: 0.4, metalness: 0.7 })
    );
    pole.position.set(px, yBase + hBase + 1.1, pz);
    const mat = new THREE.MeshStandardMaterial({
      color: '#FFEDD5',
      emissive: '#FB923C',
      emissiveIntensity: 3,
      roughness: 0.3,
    });
    pylonMats.push(mat);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat);
    lamp.position.set(px, yBase + hBase + 2.3, pz);
    group.add(pole, lamp);
  };
  const f0 = frameAt(track, ramp.t, { x: 0, z: 0, nx: 0, nz: 0, heading: 0 });
  mkPylon(f0, 1, 0);
  mkPylon(f0, -1, 0);
  const tCrest = track.closed ? (ramp.t + ramp.length / track.length) % 1 : ramp.t + ramp.length / track.length;
  const fc = frameAt(track, tCrest, { x: 0, z: 0, nx: 0, nz: 0, heading: 0 });
  mkPylon(fc, 1, ramp.height);
  mkPylon(fc, -1, ramp.height);

  return { group, pylonMats };
}
