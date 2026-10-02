import { useMemo, useState, type ReactNode } from 'react';
import {
  SEGMENTS,
  TERRAIN_PARAMS as TP,
  ROAD_WIDTH,
  SAMPLE_STEP,
  paceNotes,
  cornerGrade,
  type TrackData,
} from '../track/haruna';

const TABS = ['Spesifikasi', 'DSL Segmen', 'Integrasi', 'Terrain', 'Dressing'] as const;
type Tab = (typeof TABS)[number];

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-black/50 p-4 font-mono text-[11px] leading-relaxed text-emerald-200/90 ring-1 ring-white/10">
      {children}
    </pre>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400 font-mono text-sm font-bold text-black">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="font-semibold text-white">{title}</h4>
        <div className="mt-1 space-y-3 text-sm leading-relaxed text-white/65">{children}</div>
      </div>
    </div>
  );
}

function Card({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{k}</div>
      <div className="font-mono text-sm text-white/85">{v}</div>
    </div>
  );
}

/** Peta centerline dari sample hasil integrasi, diwarnai per jenis segmen. */
function CenterlineMap({ track }: { track: TrackData }) {
  const { paths, marks, start, end } = useMemo(() => {
    const s = track.samples;
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const p of s) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const S = 400,
      pad = 16;
    const sc = Math.min((S - pad * 2) / (maxX - minX), (S - pad * 2) / (maxZ - minZ));
    const ox = pad + (S - pad * 2 - (maxX - minX) * sc) / 2;
    const oz = pad + (S - pad * 2 - (maxZ - minZ) * sc) / 2;
    const P = (i: number) => [ox + (s[i].x - minX) * sc, oz + (s[i].z - minZ) * sc] as const;
    const paths = track.segRange.map(([a, b], si) => {
      const seg = SEGMENTS[si];
      const pts: string[] = [];
      for (let i = a; i <= b; i++) pts.push(P(i).map((v) => v.toFixed(1)).join(','));
      let color = 'rgba(255,255,255,0.55)';
      if (seg.t === 'c') {
        const g = cornerGrade(seg.angle, seg.radius);
        color = g === 'HAIRPIN' ? '#f87171' : Number(g) <= 3 ? '#fbbf24' : '#6ee7b7';
      }
      return { d: pts.join(' '), color, key: si };
    });
    const marks = track.corners
      .filter((c) => c.hairpinNo)
      .map((c) => ({ n: c.hairpinNo!, p: P(c.apex) }));
    return { paths, marks, start: P(0), end: P(s.length - 1) };
  }, [track]);
  return (
    <svg viewBox="0 0 400 400" className="w-full max-w-md rounded-xl bg-black/40 ring-1 ring-white/10">
      {paths.map((p) => (
        <polyline key={p.key} points={p.d} fill="none" stroke={p.color} strokeWidth={2.2} strokeLinecap="round" />
      ))}
      {marks.map((m) => (
        <g key={m.n}>
          <circle cx={m.p[0] + (m.n % 2 ? 9 : -9)} cy={m.p[1]} r={6} fill="#111" stroke="#f87171" />
          <text
            x={m.p[0] + (m.n % 2 ? 9 : -9)}
            y={m.p[1] + 3}
            textAnchor="middle"
            fontSize={8}
            fill="#fff"
            fontFamily="monospace"
          >
            {m.n}
          </text>
        </g>
      ))}
      <circle cx={start[0]} cy={start[1]} r={5} fill="#34d399" />
      <text x={start[0] + 8} y={start[1] + 4} fontSize={10} fill="#34d399">
        START
      </text>
      <circle cx={end[0]} cy={end[1]} r={5} fill="#f87171" />
      <text x={end[0] + 8} y={end[1] + 4} fontSize={10} fill="#f87171">
        FINISH
      </text>
    </svg>
  );
}

/** Penampang melintang cut-and-fill (sisi tebing kiri, jurang kanan). */
function CrossSection() {
  const W = 420,
    H = 170,
    half = ROAD_WIDTH / 2;
  const range = 80;
  const X = (lat: number) => W / 2 + (lat / range) * (W / 2 - 10);
  const Y = (h: number) => 70 - h * 0.75;
  const pts: string[] = [];
  for (let lat = -range; lat <= range; lat += 1) {
    const d = Math.abs(lat);
    const t = Math.max(0, d - (half + TP.flatExtra));
    const off =
      lat < 0 ? Math.min(Math.pow(t, TP.cliffExp) * TP.cliffK, TP.cliffMax) : -Math.min(Math.pow(t, TP.dropExp) * TP.dropK, TP.dropMax);
    pts.push(`${X(lat).toFixed(1)},${Y(off).toFixed(1)}`);
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-black/40 ring-1 ring-white/10">
      <polygon points={`${X(-range)},${H} ${pts.join(' ')} ${X(range)},${H}`} fill="rgba(110,138,60,0.35)" />
      <polyline points={pts.join(' ')} fill="none" stroke="#a3e635" strokeWidth={1.8} />
      <rect x={X(-half)} y={Y(0) - 2} width={X(half) - X(-half)} height={4} fill="#e5e7eb" />
      <line x1={W / 2} y1={10} x2={W / 2} y2={H - 5} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
      <text x={12} y={16} fontSize={10} fill="#fbbf24">
        ← sisi tebing (cut) · t^{TP.cliffExp}·{TP.cliffK}
      </text>
      <text x={W - 12} y={H - 10} fontSize={10} fill="#60a5fa" textAnchor="end">
        sisi jurang (fill) · −t^{TP.dropExp}·{TP.dropK} →
      </text>
      <text x={W / 2} y={Y(0) - 8} fontSize={9} fill="#fff" textAnchor="middle">
        aspal {ROAD_WIDTH} m
      </text>
      <text x={12} y={H - 10} fontSize={9} fill="rgba(255,255,255,0.4)">
        ±{range} m dari sumbu jalan
      </text>
    </svg>
  );
}

function fmtSeg(s: (typeof SEGMENTS)[number]) {
  const g = s.grade !== undefined ? `, grade:${s.grade}` : '';
  const nm = s.name ? `, name:'${s.name}'` : '';
  return s.t === 's'
    ? `{ t:'s', len:${s.len}${g}${nm} },`
    : `{ t:'c', angle:${s.angle}, radius:${s.radius}${g}${nm} },`;
}

export default function MakingOf({ track, onClose }: { track: TrackData | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('Spesifikasi');
  const hairpins = track ? track.corners.filter((c) => c.grade === 'HAIRPIN').length : 0;
  const straights = SEGMENTS.filter((s) => s.t === 's').length;
  const notes = useMemo(() => paceNotes(), []);
  const hp1 = SEGMENTS.findIndex((s) => s.name === 'Hairpin #1');
  const hpSnippet = SEGMENTS.slice(hp1, hp1 + 9).map(fmtSeg).join('\n');

  // grade effektif per segmen (grade diwarisi)
  const rows = useMemo(() => {
    let g = 0.02;
    return SEGMENTS.map((s, i) => {
      if (s.grade !== undefined) g = s.grade;
      const len = s.t === 's' ? s.len : (Math.abs(s.angle) * Math.PI * s.radius) / 180;
      return { i, s, g, len };
    });
  }, []);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-[#111a22] ring-1 ring-white/15">
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6 pb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300">Making Of</div>
            <h2 className="text-2xl font-bold">Bagaimana Trek Haruna Dibangun</h2>
            <p className="mt-1 text-xs text-white/50">
              Pipeline prosedural: spesifikasi jalan nyata → DSL segmen → centerline → terrain → dressing
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/15 hover:bg-white/20"
          >
            Tutup ✕
          </button>
        </div>

        {/* tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-4 py-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition ${
                tab === t ? 'bg-amber-400 font-semibold text-black' : 'text-white/60 hover:bg-white/10'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          {tab === 'Spesifikasi' && (
            <>
              <Step n={1} title="Mengumpulkan “brief” dari jalan aslinya">
                <p>
                  Trek ini bukan hasil sampling GPS, melainkan <b>rekonstruksi karakter</b> turunan Jalan Prefektur
                  Gunma No. 33 dari Danau Haruna menuju Ikaho (sisi Shibukawa) — sisi yang memiliki lima hairpin
                  beruntun. Besaran berikut menjadi <b>batasan (constraint)</b>; angka di kartu dihitung langsung dari
                  geometri yang dihasilkan:
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Card k="Muka danau" v="≈ 1.084 m" />
                  <Card k="Elevasi start" v={track ? `${track.startY.toFixed(0)} m` : '…'} />
                  <Card k="Elevasi finish" v={track ? `${track.endY.toFixed(0)} m` : '…'} />
                  <Card k="Total turun" v={track ? `${(track.startY - track.endY).toFixed(0)} m` : '…'} />
                  <Card k="Panjang" v={track ? `${(track.length / 1000).toFixed(2)} km` : '…'} />
                  <Card k="Gradien rata-rata" v={track ? `−${(track.avgGrade * 100).toFixed(1)}%` : '…'} />
                  <Card k="Gradien maks" v={track ? `−${(track.maxGrade * 100).toFixed(0)}%` : '…'} />
                  <Card k="Lebar jalan" v={`${ROAD_WIDTH} m (7,5 + gutter)`} />
                </div>
                <p>
                  Ciri wajib: <b>lurusan panjang</b> sebelum rangkaian hairpin, <b>5 hairpin beruntun</b> dengan lurusan
                  antara #4 dan #5 yang <b>lebih pendek</b>, gutter beton di tepi jalan, dan bagian awal yang landai di
                  tepi danau sebelum keluar kaldera.
                </p>
              </Step>

              <Step n={2} title="Menerjemahkan jadi pace note">
                <p>
                  Karakter jalan ditulis dulu dalam bahasa reli — arah, “gear rating” 1–6, dan panjang lurusan. Daftar
                  di bawah <b>dibangkitkan otomatis dari DSL</b> ({notes.length} baris):
                </p>
                <Code>{notes.join('\n')}</Code>
                <p>
                  Rating rendah = radius kecil. Pemetaan: <b>HAIRPIN</b> = belok ≥150° & r ≤20 m, <b>1</b> ≤18 m,{' '}
                  <b>2</b> ≤29 m, <b>3</b> ≤39 m, <b>4</b> ≤52 m, <b>5</b> ≤75 m, <b>6</b> di atasnya.
                </p>
              </Step>
            </>
          )}

          {tab === 'DSL Segmen' && (
            <>
              <Step n={3} title="Mini-DSL: jalan = daftar lurus & busur">
                <p>
                  Alih-alih menyimpan ribuan titik, trek disimpan sebagai <b>{SEGMENTS.length} segmen</b> ({straights}{' '}
                  lurusan + {SEGMENTS.length - straights} busur) di <code className="rounded bg-white/10 px-1">src/track/haruna.ts</code>.
                  Tiap busur punya sudut, radius, dan gradien:
                </p>
                <Code>{`type Seg =
  | { t:'s'; len:number; grade?:number; name?:string }
  | { t:'c'; angle:number;   // derajat, + kanan / − kiri
      radius:number;         // meter (sumbu jalan)
      grade?:number;         // 0.09 = turun 9% (diwarisi bila kosong)
      name?:string; note?:string }`}</Code>
                <p>Rangkaian lima hairpin, persis seperti di kode:</p>
                <Code>{hpSnippet}</Code>
                <p>
                  Keuntungannya: seluruh trek bisa di-<i>tuning</i> seperti partitur. Ubah satu radius — jalan,
                  guardrail, tebing, hutan, pace note, dan minimap ikut berubah otomatis.
                </p>
              </Step>
              <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left font-mono text-[11px]">
                    <thead className="sticky top-0 bg-[#16222d] text-white/50">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">tipe</th>
                        <th className="px-3 py-2">sudut</th>
                        <th className="px-3 py-2">radius</th>
                        <th className="px-3 py-2">panjang</th>
                        <th className="px-3 py-2">grade</th>
                        <th className="px-3 py-2">nama / note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ i, s, g, len }) => {
                        const hp = s.t === 'c' && cornerGrade(s.angle, s.radius) === 'HAIRPIN';
                        return (
                          <tr key={i} className={`border-t border-white/5 ${hp ? 'bg-red-500/10' : ''}`}>
                            <td className="px-3 py-1 text-white/40">{i}</td>
                            <td className="px-3 py-1">{s.t === 's' ? 'lurus' : 'busur'}</td>
                            <td className="px-3 py-1">{s.t === 'c' ? `${s.angle > 0 ? '+' : ''}${s.angle}°` : ''}</td>
                            <td className="px-3 py-1">{s.t === 'c' ? `${s.radius} m` : ''}</td>
                            <td className="px-3 py-1">{len.toFixed(0)} m</td>
                            <td className="px-3 py-1">{(g * 100).toFixed(1)}%</td>
                            <td className="px-3 py-1 text-white/60">{s.name ?? s.note ?? ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {tab === 'Integrasi' && (
            <>
              <Step n={4} title="Integrasi: dari segmen ke centerline 3D">
                <p>
                  DSL “dijalankan” seperti turtle graphics. Kursor mulai di tepi danau menghadap timur, dan tiap{' '}
                  {SAMPLE_STEP} meter disimpan satu sample:
                </p>
                <Code>{`x = 0, z = 0, y = 1090, heading = 90° (timur)
untuk tiap segmen:
  grade = seg.grade ?? grade            // diwarisi
  lurus : n = round(len/3), d = len/n
          ulangi n: x += sin(h)·d ; z += cos(h)·d ; y −= grade·d
  busur : arc = |angle|·radius ; n = round(arc/3) ; dθ = angle/n
          ulangi n: h −= dθ/2 ; maju d ; h −= dθ/2   // integrasi titik-tengah
                    y −= grade·d
  simpan { x, y, z, dist, heading, curvature = ±1/radius }
profil y dihaluskan 2× (rata-rata ±15 m) agar perubahan gradien tidak patah`}</Code>
                <p>
                  Hasilnya <b>{track ? track.samples.length : '…'} sample</b> sepanjang{' '}
                  <b>{track ? (track.length / 1000).toFixed(2) : '…'} km</b>, turun{' '}
                  <b>{track ? (track.startY - track.endY).toFixed(0) : '…'} m</b>, dengan{' '}
                  <b>{track ? track.corners.length : '…'} tikungan</b> ({hairpins} di antaranya hairpin).
                </p>
                {track && (
                  <div className="flex flex-col items-start gap-3 sm:flex-row">
                    <CenterlineMap track={track} />
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-1 w-6 rounded bg-white/60" /> lurusan
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-1 w-6 rounded bg-emerald-300" /> busur 4–6
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-1 w-6 rounded bg-amber-400" /> busur 1–3
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-1 w-6 rounded bg-red-400" /> hairpin (nomor 1–5 = 五連続ヘアピン)
                      </div>
                      <p className="pt-2 text-white/50">
                        Peta ini digambar langsung dari array sample — sama persis dengan yang dipakai game.
                      </p>
                    </div>
                  </div>
                )}
                <p>
                  <b>curvature</b> dipakai ulang untuk: pace note (grade & arah), guardrail di sisi luar tikungan
                  (r &lt; 95 m), papan chevron, dan penempatan penonton di sisi dalam tikungan.
                </p>
              </Step>
              <Step n={5} title="Spatial hash untuk query “di mana jalannya?”">
                <p>
                  Semua sample dimasukkan ke grid 24 m. Pertanyaan “berapa jarak titik (x,z) ke sumbu jalan, dan di
                  sisi mana?” terjawab dengan memeriksa sel di sekitar saja — dipakai ratusan ribu kali saat membentuk
                  terrain, menanam pohon, cek off-road, dan tumbukan guardrail.
                </p>
                <Code>{`kanan = (−cos h, sin h)                 // tegak lurus heading
side  = (x − sx)·kanan.x + (z − sz)·kanan.z
// side > 0 → sisi kanan jalan, side < 0 → sisi kiri
// sisi mana yang tebing/jurang ditentukan per sample (lihat tab Terrain)`}</Code>
              </Step>
            </>
          )}

          {tab === 'Terrain' && (
            <>
              <Step n={6} title="Gunung dibentuk DARI jalan, bukan sebaliknya">
                <p>
                  Kunci supaya jalan tidak pernah “melayang” atau tenggelam. Pertama, untuk tiap sample ditentukan
                  sisi mana yang <b>menanjak</b>: lereng regional (IDW titik jalan) dibandingkan 100 m ke kiri vs
                  kanan, ditambah bias “makin dekat kaldera makin tinggi”, lalu dihaluskan ±8 sample. Karena itu, di
                  rangkaian hairpin sisi jurang berpindah-pindah dengan benar mengikuti arah kaki jalan.
                </p>
                <Code>{`untuk tiap vertex (x,z):
  kandidat = sample jalan dalam radius ${TP.radius} m (dari spatial hash)
  untuk tiap kandidat k (jarak d, side s):
    t = max(0, d − ${(ROAD_WIDTH / 2 + TP.flatExtra).toFixed(1)})          // badan jalan + bahu = datar
    tebing : usul = y_k + min(t^${TP.cliffExp} · ${TP.cliffK}, ${TP.cliffMax})
    jurang : usul = y_k − min(t^${TP.dropExp} · ${TP.dropK}, ${TP.dropMax})
    w = exp(−(d² − dmin²) / ${TP.sigma}²)      // sample terdekat dominan
  y_near = Σ w·usul / Σ w  + fBm · ${TP.noiseAmp}·fade(dmin)
  y      = lerp(y_near, lereng_regional, smoothstep(${TP.blendFrom}, ${TP.blendTo}, dmin))`}</Code>
                <CrossSection />
                <p>
                  Eksponen &gt; 1 membuat lereng makin curam menjauhi jalan — profil <i>cut-and-fill</i> jalan
                  gunung. Rata-rata berbobot antar-sample membuat tanah di antara dua kaki hairpin (terpisah ≈2×radius ≈
                  26 m, beda tinggi ≈10 m) tersambung mulus, tanpa patahan.
                </p>
              </Step>
              <Step n={7} title="Fitur vulkanik Haruna">
                <p>
                  Setelah itu ditambahkan <b>bibir kaldera</b> (cincin +48 m), <b>Danau Haruna</b> (elips 300×230 m,
                  dasar mangkuk, muka air ≈1.085 m), dan kerucut lava dome <b>Haruna-fuji</b> di selatan danau —
                  semuanya dikalikan <code className="rounded bg-white/10 px-1">smoothstep(H+6, H+45, dmin)</code> agar
                  tidak pernah menyentuh badan jalan.
                </p>
              </Step>
              <Step n={8} title="Mesh & pewarnaan">
                <p>
                  Grid {TP.gridStep} m dibentangkan di atas bounding box trek + margin {TP.margin} m (≈230 ribu vertex),
                  lalu warna vertex ditentukan dari kemiringan, peta kerapatan hutan, dan jarak ke jalan/danau:
                </p>
                <Code>{`warna = lerp(rumput_hijau, rumput_kering, fbm)
if (hutan)        warna = lerp(warna, lantai_hutan, density)
if (slope > 0.5)  warna = lerp(warna, tanah, …)
if (slope > 0.9)  warna = lerp(warna, batu, …)
if (dmin < H+4)   warna = kerikil bahu jalan
if (tepi danau)   warna = pasir
material: MeshLambert + flatShading  →  tampilan low-poly ala Art of Rally`}</Code>
              </Step>
            </>
          )}

          {tab === 'Dressing' && (
            <>
              <Step n={9} title="Aspal, gutter, dan marka">
                <p>
                  Pita aspal dibuat dengan menggeser tiap sample ±{ROAD_WIDTH / 2} m tegak lurus heading, lalu
                  di-triangulasi jadi quad-strip, plus “skirt” miring 1,8 m ke bawah agar tidak ada celah dengan
                  terrain. UV sumbu-V = <code className="rounded bg-white/10 px-1">dist / 9.2</code>, jadi tekstur
                  punya jarak konstan meski radius berubah. Tekstur digambar runtime di{' '}
                  <code className="rounded bg-white/10 px-1">&lt;canvas&gt;</code>: noise aspal, tambalan, <b>gutter beton</b>{' '}
                  (talang yang terkenal di Akina), garis tepi putih, dan garis tengah kuning ganda.
                </p>
              </Step>
              <Step n={10} title="Guardrail, chevron, penonton, dan hutan">
                <p>
                  Guardrail dipasang di sisi luar tikungan r &lt; 95 m <b>atau</b> di sisi yang terrain-nya turun &gt;5 m
                  dalam 28 m (jurang); celah pendek disambung, potongan &lt;18 m dibuang. Papan chevron kuning di
                  hairpin & tikungan 1–2, penonton di sisi dalam tikungan tajam, toko di tepi danau, gerbang START/FINISH.
                </p>
                <p>
                  Semua objek berulang memakai <b>InstancedMesh</b>. Pohon (cemara + pohon musim gugur) ditanam dengan{' '}
                  <i>rejection sampling</i>: ditolak bila terlalu dekat jalan, di danau, terlalu curam, atau di luar peta
                  kerapatan noise — agar terbentuk rumpun hutan, bukan sebaran seragam. Pohon dikelompokkan per chunk
                  300 m agar frustum culling efektif, dan disimpan di hash 8 m untuk tumbukan.
                </p>
              </Step>
              <Step n={11} title="Satu struktur data untuk seluruh gameplay">
                <p>
                  Array sample yang sama melayani <b>fisika</b> (gradien → gravitasi, grip aspal/rumput),{' '}
                  <b>tumbukan</b> (guardrail & pohon), <b>progress & split</b> (indeks sample harus naik bertahap — jalan
                  pintas antar-kaki hairpin tidak dihitung), <b>pace note</b>, <b>minimap</b>, <b>profil elevasi</b>, dan{' '}
                  <b>respawn</b>. Tidak ada geometri yang digambar tangan.
                </p>
              </Step>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
