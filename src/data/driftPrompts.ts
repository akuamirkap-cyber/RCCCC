export interface DriftPromptData {
  id: string;
  title: string;
  sourceZip: string;
  shortDesc: string;
  filename: string;
  markdownContent: string;
}

export const DRIFT_PROMPTS: DriftPromptData[] = [
  {
    id: 'haruna_new',
    title: 'HARUNA 榛名山 (Mt. Akina Downhill Rally Stage 3D - Update Baru)',
    sourceZip: 'b.zip',
    shortDesc: 'Toyota AE86 Panda Trueno, Web Audio Sintetis 4A-GE, 3D Guardrails, 5 Hairpin Beruntun, Pacenote HUD',
    filename: 'PROMPT-HARUNA-AKINA-NEW-UPDATE.md',
    markdownContent: `# SYSTEM PROMPT: HARUNA 榛名山 — MT. AKINA DOWNHILL RALLY STAGE 3D (UPDATE BARU)
Sumber: b.zip
Platform: TypeScript, Three.js, React 19, Web Audio API, Canvas Confetti

---

## 1. DESKRIPSI & ARSITEKTUR UTAMA
Buatkan game balap touge 3D "Mt. Haruna (Akina) Downhill" legendaris di Prefektur Gunma Route 33. Menggunakan mobil Toyota Sprinter Trueno AE86 "Panda" (藤原とうふ店) dengan fisika drift touge realistis dan performa 60 FPS di WebGL Three.js.

---

## 2. FITUR UPDATE TERBARU (b.zip)
* Web Audio Synthetic Sound Engine (Twin-Cam 4A-GE tanpa MP3 eksternal).
* 3D Guardrails & Concrete Gutter untuk teknik selokan legendaris.
* Dynamic Time of Day (Siang, Pagi, Senja, Malam).
* 3 Mode Kamera (Rally, Chase, Top).
* Rally Co-Driver Pacenotes dengan jarak dinamis & indikator lima hairpin.
`,
  },
  {
    id: 'haruna_old',
    title: 'MT. HARUNA DOWNHILL (Classic 3D Rally Stage)',
    sourceZip: 'a.zip',
    shortDesc: 'Versi Klasik Touge Haruna, Full Track Map & Minimap, 5 Drift Engines (PAS/GYRO/COUNTER/ARCADE/PRO), Pit Setup',
    filename: 'PROMPT-MT-HARUNA-CLASSIC-STAGE.md',
    markdownContent: `# SYSTEM PROMPT: MT. HARUNA DOWNHILL (CLASSIC 3D RALLY STAGE)
Sumber: a.zip
Platform: TypeScript, Three.js, React 19, Tailwind CSS

---

## 1. DESKRIPSI & FITUR (a.zip)
* Minimap kanan atas & Peta Stage Lengkap (Full Track Map).
* 5 Pilihan Drift Engine instan (PAS, GYRO, COUNTER, ARCADE, PRO).
* Pit Bench setup suspensi dan rem tangan.
`,
  },
  {
    id: 'pro_drift',
    title: 'PRO DRIFT 3D (Balatro Chips × Mult)',
    sourceZip: 'best drift.zip',
    shortDesc: 'Fisika Slip 250 km/j, Balatro Chips × Mult, Tandem AI, Big Angle >48°, Clipping Points',
    filename: 'PROMPT-PRO-DRIFT-BALATRO-STYLE.md',
    markdownContent: `# SYSTEM PROMPT: PRO DRIFT 3D ARCADE PHYSICS ENGINE (BALATRO-STYLE CHIPS × MULT)
Sumber: best drift.zip
Platform: TypeScript, React Three Fiber (@react-three/fiber), Three.js, Zustand

---

## 1. DESKRIPSI & ARSITEKTUR UTAMA
Buatkan game balap mobil RC Drift 3D arcade berkecepatan tinggi (hingga 250 km/jam) menggunakan pendekatan "Bicycle-Lite Slip-Angle Physics" murni matematika vektor (tanpa rigid-body physics engine berat seperti Rapier atau Cannon). Game ini memadukan fisika drifting responsif dengan sistem skor eksplosif bergaya Balatro (Chips × Multiplier).

---

## 2. KONVENSI KOORDINAT & SUMBU KENDARAAN
Mobil bergerak di bidang datar (X-Z) dengan rotasi sumbu Y (heading / theta):
\`\`\`typescript
// Vektor lokal mobil
const forward = { x: -Math.sin(heading), z: -Math.cos(heading) };
const right = { x: Math.cos(heading), z: -Math.sin(heading) };

// Dekomposisi kecepatan dunia (vx, vz) ke sumbu mobil
const fwd = vx * forward.x + vz * forward.z; // Kecepatan longitudinal (maju)
const lat = vx * right.x + vz * right.z;     // Kecepatan lateral (geser)
\`\`\`

---

## 3. STATE MACHINE DRIFT DENGAN HISTESIS
Status drift ditentukan oleh sudut selip nyata (slip angle) bukan sekadar menahan tombol belok:
\`\`\`typescript
const slip = Math.atan2(lat, Math.max(Math.abs(fwd), 0.5));
const absSlip = Math.abs(slip);

// Masuk mode drift
if (!v.drifting && (absSlip > 0.2 || (v.handbrake && Math.abs(fwd) > 6))) {
  v.drifting = true;
}

// Keluar mode drift (histeresis ambang batas lebih rendah mencegah getaran)
if (v.drifting && absSlip < 0.09 && !v.handbrake) {
  v.drifting = false;
}
\`\`\`

---

## 4. SISTEM REDUKSI TRAKSI LATERAL (EXPONENTIAL DECAY)
Grip samping tidak menggunakan gaya gesek linier, melainkan peluruhan eksponensial:
\`\`\`typescript
// Nilai grip berdasarkan status
const gripHandbrake = Math.min(tuning.gripDrift, 1.4 / tuning.handbrake);
let grip = v.handbrake ? gripHandbrake : v.drifting ? tuning.gripDrift : tuning.gripNormal;
if (v.onGrass) grip *= 0.6; // Rumput / off-track memotong traksi 40%

// Redam kecepatan geser samping
lat *= Math.exp(-grip * dt);
\`\`\`
* Nilai Default: \`gripNormal = 7.0\`, \`gripDrift = 1.3\`, \`handbrake = 1.7\`.

---

## 5. DINAMIKA LONGITUDINAL & SPEED SCRUBBING
\`\`\`typescript
const MAX_SPEED = tuning.maxSpeed / 8.4; // KMH scale = 8.4
const maxSpd = v.onGrass ? MAX_SPEED * 0.55 : MAX_SPEED;

if (v.throttle > 0) {
  const accel = tuning.accel * 0.72 * Math.max(0, 1 - Math.max(0, fwd) / maxSpd) * (v.handbrake ? 0.4 : 1);
  fwd += accel * v.throttle * dt;
} else if (v.throttle < 0) {
  fwd += v.throttle * 18 * dt; // Rem kaki
}

// Scrubbing kecepatan akibat sudut drift (semakin miring, laju maju berkurang alami)
fwd -= Math.abs(lat) * 0.12 * dt * Math.sign(fwd);
\`\`\`

---

## 6. DINAMIKA YAW, DRIFT BOOST & SELF-ALIGNING TORQUE
\`\`\`typescript
const spdFactor = Math.min(1, Math.abs(fwd) / 9);
const driftBoost = v.drifting ? tuning.driftBoost : 1; // Default boost = 1.8x
const align = -slip * tuning.align * spdFactor; // Gaya stabilisasi alami untuk counter-steering
const angTarget = -v.steer * tuning.turnRate * spdFactor * driftBoost * Math.sign(fwd || 1) + align;
const kick = v.handbrake && Math.abs(fwd) > 6 ? -v.steer * tuning.handbrake : 0;

// Inersia putar bodi
v.angVel += (angTarget + kick - v.angVel) * Math.min(1, dt * 7);
v.heading += v.angVel * dt;
\`\`\`

---

## 7. KUNCI RAHASIA: RECOMPOSITION BASIS LAMA
Kecepatan dunia direkonstruksi menggunakan basis arah sudut LAMA sebelum bodi berotasi:
\`\`\`typescript
v.vx = forward.x * fwd + right.x * lat;
v.vz = forward.z * fwd + right.z * lat;
v.x += v.vx * dt;
v.z += v.vz * dt;
\`\`\`
Efek: Rotasi bodi mobil pada frame berjalan secara alami menghasilkan selisih kecepatan lateral baru di frame berikutnya tanpa lonjakan vektor.

---

## 8. SISTEM SKOR BALATRO-STYLE (CHIPS × MULTIPLIER)
1. **Perhitungan Chips Berjalan:**
   \`rate = (absSlip * 180 / Math.PI) * speed * 0.2\`
   \`sim.pending += rate * dt\`
2. **Multiplier Waktu:** Setiap 1.3 detik durasi drift menambah \`+1 MULT\` (maksimal 20x).
3. **Tandem Drift:** Jika berjarak < 5 unit dari bot AI lawan, chips rate dikalikan \`×1.6\` dan memberi bonus \`+250 Chips\` per 1.5 detik.
4. **Big Angle:** Jika sudut drift > 48°, pemain mendapat \`+1 MULT\` dan boost chips \`+35%\`.
5. **Inner Clipping & Outer Zones:** Melewati titik clip memberikan \`+400 Chips\` dan \`+2 MULT\`.
6. **Grace Period (0.6 detik):** Waktu tenggang saat berganti arah drift (manji drift) agar kombo tidak putus.
7. **Combo Kill:** Tabrakan keras dinding (\`impact > 7\`) atau keluar ke rumput langsung menghanguskan kombo (\`pending = 0, mult = 1\`).
8. **Bank Score:** Saat drift berakhir mulus, total dibukukan: \`Score += Math.round(pending * mult)\`.

---

## 9. PILIHAN DUAL ENGINE GERAKAN: PRO DRIFT VS SAKURA RC PRO
Game Pro Drift 3D mendukung pergantian seketika (*mid-game switch*) antara dua sistem engine gerak:
1. **Engine 1: Pro Drift Slip (Default, 250 km/j)**
   - Menggunakan slip vector arcade cepat dengan basis heading lama.
   - Sangat responsif, snap drift agresif, dan kecepatan puncak liar.
2. **Engine 2: Sakura RC Pro (1:10 RWD Gyro Knuckle Engine)**
   - Diadaptasi langsung dari sasis 1:10 RWD Sakura RC Pro (\`RCDRIFT BEST.zip\`).
   - Dilengkapi **Electronic Gyro Steering Assist (Gain 40–100%)**:
     \`gyroDamping = -v.angVel * (4.2 + (tuning.gyroGain / 100) * 4.5)\`
   - **High-Angle Ackermann Knuckle Lock (55°–82°)**:
     \`maxHoldableSlip = degToRad(tuning.maxSteerAngle) * (0.88 + gyroGainNorm * 0.14)\`
   - Servo roda depan secara visual melakukan *counter-steering* otomatis menghadap arah luncuran (*velocityAngle*), persis seperti mobil RC Drift kompetisi yang dipasangi gyro receiver!
`,
  },
  {
    id: 'ebisu',
    title: 'EBISU MOUNTAIN DRIFT (Slip, Classic & Sakura RC Triple Engine)',
    sourceZip: 'RCDRIFT BEST2.zip',
    shortDesc: 'Sirkuit Ebisu Touge, Triple Engine (Slip, Classic & Sakura RC Gyro), 4 Kamera, Laps & AI',
    filename: 'PROMPT-EBISU-MOUNTAIN-DRIFT.md',
    markdownContent: `# SYSTEM PROMPT: EBISU MOUNTAIN DRIFT (DUAL ENGINE & RACE SIMULATOR)
Sumber: RCDRIFT BEST2.zip
Platform: TypeScript, Three.js, React, Tailwind CSS

---

## 1. DESKRIPSI & ARSITEKTUR
Buatkan game balap arcade RC Drift 3D bertema Sirkuit Pegunungan Ebisu Touge Jepang bergaya Initial D. Fitur unik game ini adalah kemampuan beralih seketika (*mid-race hot swap*) antara **Tiga Physics Engine Gerakan**:
1. **Slip Engine:** Simulasi "Bicycle-lite with explicit slip angle", inersia yaw, dan self-aligning torque realistis.
2. **Sakura RC Pro Engine:** Diadopsi 100% dari simulator 1:10 RWD Sakura RC (Gyro assist, Ackermann knuckle lock 78°, servo counter-steer otomatis).
3. **Classic Arcade Engine:** Kontrol arcade snappy, pemaaf, berbasis lateral velocity friction sederhana.

---

## 2. SPESIFIKASI SLIP ENGINE (BICYCLE-LITE TOUGE)
* **Skala Dunia Nyata:** 1 unit = 1 meter, top speed 180 km/jam (\`KMH = 3.6\`).
* **Vektor Sumbu:**
  \`\`\`typescript
  fx = Math.sin(heading); fz = Math.cos(heading);
  rx = -Math.cos(heading); rz = Math.sin(heading);
  let fwd = vx * fx + vz * fz;
  let lat = vx * rx + vz * rz;
  \`\`\`
* **Slip State Histeresis:** Masuk drift bila \`|slip| > 0.2 rad\` atau handbrake aktif pada \`fwd > 6 m/s\`. Keluar bila \`|slip| < 0.09 rad\`.
* **Grip Lateral 3-Level:**
  - Aspal normal: \`gripNormal = 5.5\`
  - Drift aktif: \`gripDrift = 1.1\`
  - Handbrake kick: \`Math.min(t.gripDrift, 1.4 / t.handbrake)\`
  - Rumput: dipotong 40% (\`grip *= 0.6\`)
* **Counter-Steering Torque:** \`align = -slip * t.align * spdFactor\`. Mobil secara alami membalas lurus sehingga pemain harus melakukan counter-steer manual untuk menjaga ekor mobil tidak melintir (*spin-out*).
* **Speed Floor:** Mesin mempertahankan akselerasi minimum (\`ACCEL_FLOOR = 0.16\`) agar kecepatan puncak 180 km/jam benar-benar tercapai di lintasan lurus.

---

## 3. SPESIFIKASI CLASSIC ARCADE ENGINE
Engine sekunder untuk pemain pemula atau sensasi game arcade 90-an:
* Deteksi drift langsung membaca kecepatan lateral: \`|vl| > 5.0 m/s\`.
* Penambahan laju belok saat drift: \`turnDrift = 1.6 * handling\`.
* Grip lateral langsung meluruh tanpa self-aligning torque yang rumit.

---

## 4. SIRKUIT PEGUNUNGAN & SISTEM BALAPAN
* **Track Generator:** Lintasan sirkuit tertutup menggunakan kurva spline 3D dengan sampling titik tengah, vektor tangen (\`tx, tz\`), vektor normal (\`rx, rz\`), kerb merah-putih, pagar pengaman, dan rumput off-track.
* **Mode Balap:** Pilihan 1–5 Laps, posisi start grid vs 3 AI Rivals pintar dengan kecepatan adaptif (Easy 88%, Normal 100%, Hard 110%).
* **Drift Zones:** Zona tikungan khusus berpenanda warna di sirkuit dengan skor pengali (\`x1.5\`, \`x2.0\`) dan rating bintang 1–3.
* **Manual Nitro Boost:** Berhasil mempertahankan drift mengisi meteran Boost (Nitro). Saat meteran terisi, pemain menekan SHIFT untuk letupan kecepatan \`+40 km/jam\` disertai api knalpot visual.
* **4 Mode Kamera Dinamis:**
  1. \`Rally\` (kamera lembut mengikuti momentum)
  2. \`Chase\` (kamera belakang ketat)
  3. \`Cockpit\` (sudut pandang interior kap mesin / setir)
  4. \`Far\` (kamera jauh bird-eye view)

---

## 5. SPESIFIKASI SAKURA RC PRO ENGINE DI EBISU CIRCUIT
Diadaptasi 100% dari arsitektur mobil RC 1:10 RWD (\`RCDRIFT BEST.zip\`):
* **Electronic Gyro Steering Assist (Gain 40–100%):** Membantu counter-steering otomatis proporsional terhadap laju putar yaw:
  \`gyroDamping = -v.angVel * (4.2 + (tuning.gyroGain / 100) * 4.5)\`
* **Ackermann Knuckle Lock Angle (55°–82°):** Membatasi sudut drift secara fisik seperti suspensi mobil RC asli:
  \`maxHoldableSlip = degToRad(tuning.maxSteerAngle) * (0.88 + gyroGainNorm * 0.14)\`
* **Servo Roda Depan Visual:** Roda depan berputar visual membalas sudut luncuran mobil (\`frontSteerAngle\`), memberikan sensasi menyetir mobil RC drift profesional dengan remote transmitter.
`,
  },
  {
    id: 'sakura_rc',
    title: 'SAKURA RC DRIFT PRO (1:10 RWD Aula Circuit)',
    sourceZip: 'RCDRIFT BEST.zip',
    shortDesc: 'Simulasi 1:10 RWD RC Drift, Skyline R34 BNR34, Aula Circuit, RB26 Soundbox, Pit Bench Drawer',
    filename: 'PROMPT-SAKURA-RC-DRIFT-PRO.md',
    markdownContent: `# SYSTEM PROMPT: SAKURA RC DRIFT PRO (1:10 RWD AULA CIRCUIT & PIT BENCH)
Sumber: RCDRIFT BEST.zip
Platform: TypeScript, Three.js, React 19, Tailwind CSS, Canvas Confetti

---

## 1. DESKRIPSI & ARSITEKTUR
Buatkan simulator mobil Remote Control (RC) Drift 1:10 skala nyata berpenggerak roda belakang (RWD) di dalam gedung olahraga/aula Jepang (Aula Circuit) beralaskan lantai karpet & vinyl P-Tile dengan dekorasi bunga Sakura. Fokus utama adalah meniru secara persis dinamika sasis RC drift asli (Yokomo YD-2 / MST RMX).

---

## 2. FISIKA ELEKTRONIK KHAS RC DRIFT (GYRO & ESC)
Mobil RC Drift RWD 1:10 di dunia nyata tidak bisa dikendalikan tanpa Gyro elektronik. Implementasikan komponen ini:
1. **Gyro Electronic Steering Assist (Gain 0–100%):**
   \`\`\`typescript
   // Gyro membaca yaw rate dan memberikan counter-steering otomatis proporsional
   const gyroCounter = -angularVelocity * (tuning.gyroGain / 100) * 0.45;
   effectiveSteerAngle = clamp(userSteer + gyroCounter, -maxSteerAngle, maxSteerAngle);
   \`\`\`
2. **High Angle Steering Knuckles (Hingga 76°–80°):**
   Mobil RC drift memiliki sudut belok roda depan yang sangat ekstrem untuk menahan sudut drift besar.
3. **Senyawa Ban Spesifik (Tire Compounds):**
   - \`HDPE / P-Tile\` (licin, slide panjang, standar karpet)
   - \`Polycarbonate\` (sangat licin)
   - \`Soft Rubber\` (lengket)
4. **ESC Turbo Boost (Electronic Speed Controller):**
   Simulasi pengaturan timing motor brushless yang menyemburkan tenaga ekstra di RPM tinggi.

---

## 3. AUDIOTEK: RB26DETT SOUNDBOX SIMULATOR
Simulator kotak suara bawaan sasis RC (Sound Box):
* Suara mesin idle, desisan turbo spool saat gas dibuka, blow-off valve (BOV) suara \`stututu\` saat melepas gas, dan backfire letupan knalpot saat deselerasi.

---

## 4. PIT BENCH MEKANIK (DRAWER PENYETELAN)
Drawer interaktif untuk merombak setting mobil RC:
* **Suspensi:** Caster angle (derajat kemiringan shock depan), Camber angle (kemiringan ban negatif untuk traksi saat belok), Damper oil viscosity (300–800 cSt), Spring rate.
* **Kustomisasi Bodi:** Nissan Skyline GT-R BNR34 Bayside Blue, pilihan body painted vs clear polycarbonate shell, warna velg, neon underglow, dan anodized alloy chassis.
* **5-Stage Smoke Effect:** Pengaturan partikel asap ban dari tipis hingga tebal ala kompetisi D1GP.
* **Mode Permainan:** Single Qualifying Run dengan penjurian skor sudut (Angle), kecepatan (Speed), dan garis laju (Line), serta mode Tsuiso (Tandem Battle).
`,
  },
];

/** Helper untuk mendownload string sebagai file teks di browser */
export function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Helper untuk menyalin teks ke clipboard */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }
}
