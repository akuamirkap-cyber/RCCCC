import { useState } from 'react'
import { SEGMENTS, type TrackData } from '../track/haruna'

const TABS = ['Spesifikasi', 'DSL Segmen', 'Integrasi', 'Terrain', 'Dressing'] as const
type Tab = (typeof TABS)[number]

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-black/50 p-4 font-mono text-[11px] leading-relaxed text-emerald-200/90 ring-1 ring-white/10">
      {children}
    </pre>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
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
  )
}

export default function MakingOf({ track, onClose }: { track: TrackData | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('Spesifikasi')

  const hairpins = track ? track.corners.filter((c) => c.radius <= 16).length : 0
  const straights = SEGMENTS.filter((s) => s.t === 's').length

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-[#111a22] ring-1 ring-white/15">
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6 pb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-sand-lite">Making Of</div>
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
                  Trek ini bukan hasil sampling GPS, melainkan <b>rekonstruksi karakter</b>. Yang dipakai sebagai
                  sumber kebenaran adalah besaran-besaran yang bisa diverifikasi tentang turunan Jalan Prefektur
                  Gunma No. 33 (Danau Haruna → kawasan Kuil Haruna):
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    ['Elevasi start', '≈ 1.084 m'],
                    ['Elevasi finish', '≈ 760 m'],
                    ['Total turun', '≈ 320 m'],
                    ['Gradien rata-rata', '≈ −7%'],
                    ['Lebar jalan', '≈ 7,5 m'],
                    ['Ciri utama', '5 hairpin beruntun'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
                      <div className="text-[10px] uppercase tracking-wider text-white/40">{k}</div>
                      <div className="font-mono text-sm text-white/85">{v}</div>
                    </div>
                  ))}
                </div>
                <p>
                  Semua nilai itu jadi <b>batasan (constraint)</b>. Geometri yang dibangun harus jatuh pas di
                  angka-angka tersebut — sehingga panjang, jumlah tikungan, dan rasa turunannya konsisten dengan
                  jalan nyata walaupun koordinat absolutnya tidak ditelusuri satu per satu.
                </p>
              </Step>

              <Step n={2} title="Menerjemahkan jadi pace note">
                <p>
                  Karakter jalan ditulis dulu dalam bahasa reli — arah, “gear rating” 1–6, dan panjang lurusan:
                </p>
                <Code>{`Start Danau Haruna — lurus 190 m
Kiri 4 (r≈42)  →  lurus 120
Hairpin kanan 1 (r≈13, 170°)
Hairpin kiri 2  (r≈13.5, 166°)
Hairpin kanan 3 (r≈12, 172°)
Hairpin kiri 4  (r≈13.5, 160°)
Hairpin kanan 5 (r≈12.5, 175°)
lurus 225 → Kanan 5 / Kiri 4 (flowing)
...
Gutter Hairpin kiri (r≈15) setelah lurusan 265 m
...
Finish — Kuil Haruna`}</Code>
                <p>
                  Rating rendah = radius kecil. Pemetaan yang dipakai: <b>1 ≈ 12–16 m</b>, 2 ≈ 20–28 m, 3 ≈ 30–38 m,
                  4 ≈ 40–50 m, 5 ≈ 55–70 m. Inilah yang kemudian dituang ke kode.
                </p>
              </Step>
            </>
          )}

          {tab === 'DSL Segmen' && (
            <>
              <Step n={3} title="Mini-DSL: jalan = daftar lurus & busur">
                <p>
                  Alih-alih menyimpan ribuan titik, trek disimpan sebagai <b>{SEGMENTS.length} segmen</b> (
                  {straights} lurusan + {SEGMENTS.length - straights} busur). Tiap busur punya sudut, radius, dan
                  gradien sendiri:
                </p>
                <Code>{`type Seg =
  | { t:'s'; len:number; grade?:number; name?:string }
  | { t:'c'; angle:number;   // derajat, + kanan / − kiri
      radius:number;         // meter
      grade?:number;         // 0.09 = turun 9%
      name?:string; note?:string }`}</Code>
                <p>Contoh nyata rangkaian lima hairpin:</p>
                <Code>{`{ t:'c', angle: 170, radius: 13,   grade:.09, name:'Hairpin #1' },
{ t:'s', len: 72, grade:.09 },
{ t:'c', angle:-166, radius: 13.5, grade:.09, name:'Hairpin #2' },
{ t:'s', len: 62, grade:.095 },
{ t:'c', angle: 172, radius: 12,   grade:.10, name:'Hairpin #3' },`}</Code>
                <p>
                  Keuntungannya: seluruh trek bisa di-<i>tuning</i> seperti partitur. Ubah satu radius, dan jalan,
                  guardrail, tebing, hutan, pace note, dan minimap ikut berubah otomatis.
                </p>
              </Step>
            </>
          )}

          {tab === 'Integrasi' && (
            <>
              <Step n={4} title="Integrasi: dari segmen ke centerline 3D">
                <p>
                  DSL “dijalankan” seperti turtle graphics. Sebuah kursor bergerak dengan heading, dan tiap 3 meter
                  disimpan satu sample:
                </p>
                <Code>{`x = 0, z = 0, y = 1084, heading = 0
untuk tiap segmen:
  lurus : ulangi n = len/3 kali
            x += sin(heading)*d ;  z += cos(heading)*d
            y -= grade*d
  busur : arcLen = |angle|·radius ;  dθ = angle/n
            heading += dθ  (tiap langkah)
            x += sin(heading)*d ;  z += cos(heading)*d
            y -= grade*d
  simpan { x, y, z, dist, heading, curvature = ±1/radius }`}</Code>
                <p>
                  Hasilnya <b>{track ? track.samples.length : '≈1500'} sample</b> sepanjang{' '}
                  <b>{track ? (track.length / 1000).toFixed(2) : '…'} km</b>, turun{' '}
                  <b>{track ? (track.startY - track.endY).toFixed(0) : '…'} m</b>, dengan{' '}
                  <b>{track ? track.corners.length : '…'} tikungan</b> ({hairpins} di antaranya hairpin).
                </p>
                <p>
                  <b>curvature</b> yang disimpan dipakai ulang untuk tiga hal: banking aspal ke arah dalam tikungan,
                  pemilihan kamera, dan pembangkitan pace note (jarak ke tikungan berikutnya dihitung dari selisih{' '}
                  <code className="rounded bg-white/10 px-1">dist</code>).
                </p>
              </Step>

              <Step n={5} title="Spatial hash untuk query “di mana jalannya?”">
                <p>
                  Semua sample dimasukkan ke grid 24 m. Dengan itu, pertanyaan “berapa jarak titik (x,z) ke sumbu
                  jalan, dan di sisi mana?” terjawab dalam O(1) — dipakai jutaan kali saat membentuk terrain,
                  menanam pohon, cek off-road, dan tumbukan guardrail.
                </p>
                <Code>{`side = (x − sx)·cos(h) − (z − sz)·sin(h)
// side > 0 → sisi kanan (jurang)   side < 0 → sisi kiri (tebing)`}</Code>
              </Step>
            </>
          )}

          {tab === 'Terrain' && (
            <>
              <Step n={6} title="Gunung dibentuk DARI jalan, bukan sebaliknya">
                <p>
                  Ini kunci supaya jalan tidak pernah “melayang” atau tenggelam. Ketinggian tiap titik dunia
                  diturunkan dari sample jalan terdekat:
                </p>
                <Code>{`n = nearest(x, z)          // jarak d, sisi side, elevasi jalan base
t = max(0, d − 5.5)        // 5.5 m pertama = datar (badan jalan)

side > 0 (jurang) : y = base − min(t^1.18 · 0.62, 130)
side < 0 (tebing) : y = base + min(t^1.10 · 0.78, 170)

y += fbm(x·0.006, z·0.006)·amp + fbm(x·0.03, z·0.03)·amp·0.25`}</Code>
                <p>
                  Eksponen &gt; 1 membuat lereng makin curam menjauhi jalan — persis profil <i>cut-and-fill</i> jalan
                  gunung. fBm (4 oktaf value-noise) menambah kekasaran alami, dengan amplitudo di-<i>fade</i> ke nol
                  di dekat aspal supaya tepi jalan tetap rapi.
                </p>
              </Step>

              <Step n={7} title="Mesh & pewarnaan">
                <p>
                  Grid 7 m dibentangkan di atas bounding box trek + margin 260 m, lalu normal dihitung dan warna
                  vertex ditentukan dari <b>kemiringan</b> dan <b>ketinggian</b>:
                </p>
                <Code>{`alt   = clamp((y − 700) / 420, 0, 1)
warna = lerp(rumput, hutan, alt·1.2)
if (slope > 0.26) warna = lerp(warna, batu, (slope−0.26)·3.2)
material: MeshLambert + flatShading  →  tampilan low-poly art of rally`}</Code>
              </Step>
            </>
          )}

          {tab === 'Dressing' && (
            <>
              <Step n={8} title="Aspal, bahu, dan marka">
                <p>
                  Pita aspal dibuat dengan menggeser tiap sample ±3,9 m tegak lurus heading, lalu di-triangulasi
                  jadi quad-strip. UV sumbu-V mengikuti <code className="rounded bg-white/10 px-1">dist/9</code>,
                  jadi marka putus-putus punya jarak konstan meski radius berubah. Teksturnya digambar runtime di{' '}
                  <code className="rounded bg-white/10 px-1">&lt;canvas&gt;</code>: noise aspal, dua garis tepi
                  putih, marka tengah, dan patch gelap sebagai racing line.
                </p>
              </Step>
              <Step n={9} title="Guardrail, batu, dan 5.000 pohon cedar">
                <p>
                  Semua objek berulang memakai <b>InstancedMesh</b> agar tetap satu draw call. Guardrail ditanam
                  tiap 9 m khusus di sisi jurang (memakai nilai <i>side</i> tadi); batu diserak di sisi tebing;
                  pohon di-<i>reject sample</i>: ditolak bila jarak ke jalan &lt; 10 m atau &gt; 190 m, dan
                  kerapatannya dimodulasi noise agar terbentuk rumpun hutan, bukan sebaran seragam.
                </p>
              </Step>
              <Step n={10} title="Trek yang sama dipakai ulang untuk gameplay">
                <p>
                  Satu struktur data melayani semuanya: <b>fisika</b> (gradien untuk gravitasi, grip on/off-road),{' '}
                  <b>tumbukan</b> (dorong balik saat d &gt; 8,6 m), <b>progress &amp; split</b> (indeks sample
                  monoton), <b>pace note</b>, <b>minimap</b>, dan <b>respawn</b>. Tidak ada geometri yang
                  digambar tangan.
                </p>
              </Step>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
