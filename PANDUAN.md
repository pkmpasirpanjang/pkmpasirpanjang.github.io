# Panduan Setup Dashboard Absensi & Kegiatan Luar Gedung
UPTD Puskesmas Pasir Panjang — Kota Kupang

Struktur file yang Anda terima:
```
dashboard/
├── index.html
├── css/style.css
├── js/config.js        ← pengaturan (URL API, PIN, dll)
├── js/script.js
├── assets/
│   ├── logo-kota.png
│   ├── logo-puskesmas.png
│   └── bg-vidio.mp4     ← WAJIB Anda tambahkan sendiri, file video belum ada
└── apps-script/Code.gs  ← kode backend Google Apps Script
```

## LANGKAH 1 — Pasang Backend di Google Sheets

1. Buka file Google Sheets "Dasboard_Kalender" yang sudah Anda konversi dari Excel.
2. Pastikan 3 sheet-nya bernama persis: `Pegawai`, `Absensi`, `KegiatanLuar` (sudah sesuai punya Anda).
3. Menu **Extensions → Apps Script**.
4. Hapus semua kode default di editor, lalu **copy-paste seluruh isi file `apps-script/Code.gs`** ke sana.
5. Klik ikon 💾 Save.
6. Klik **Deploy → New deployment**.
   - Klik ikon gear ⚙️ di samping "Select type" → pilih **Web app**.
   - Description: bebas, misal "Dashboard v1"
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Klik **Deploy**. Google akan minta izin akses — klik **Authorize access**, pilih akun Anda, lalu klik **Advanced → Go to (nama project) (unsafe)** kalau muncul peringatan (ini normal karena scriptnya milik Anda sendiri, bukan bahaya).
8. Setelah berhasil, akan muncul **Web app URL** — bentuknya seperti:
   `https://script.google.com/macros/s/XXXXXXXXXXXXXXXXX/exec`
   **Copy URL ini.**

> Setiap kali Anda mengedit `Code.gs` di masa depan, perubahan tidak otomatis aktif — Anda harus **Deploy → Manage deployments → klik ✏️ (edit) → Version: New version → Deploy** lagi.

## LANGKAH 2 — Hubungkan Frontend ke Backend

1. Buka file `js/config.js`.
2. Cari baris:
   ```js
   API_URL: "TEMPEL_URL_WEB_APP_APPS_SCRIPT_DI_SINI",
   ```
3. Ganti dengan URL yang Anda salin di Langkah 1, contoh:
   ```js
   API_URL: "https://script.google.com/macros/s/XXXXXXXXXXXXXXXXX/exec",
   ```
4. Simpan file.

## LANGKAH 3 — Siapkan Video Background

1. Cari video pendek (10–20 detik, format `.mp4`, resolusi 1080p ke bawah supaya ringan).
2. Beri nama file **`bg-vidio.mp4`**.
3. Masukkan ke folder `assets/`.

(Kalau belum ada videonya, dashboard tetap jalan normal — hanya background-nya polos warna hijau tua, tidak error.)

## LANGKAH 4 — Coba di Local (VS Code)

1. Buka folder `dashboard/` di VS Code.
2. Install extension **"Live Server"** kalau belum ada.
3. Klik kanan `index.html` → **Open with Live Server**.
4. Dashboard akan terbuka di browser via `localhost`.

> Catatan: karena `index.html` memuat file lain (`css`, `js`, `assets`) secara relatif, membuka file dengan cara klik-2x langsung dari File Explorer (`file://...`) kadang bermasalah di beberapa browser — pakai Live Server atau server lokal lain supaya aman.

## LANGKAH 5 — PIN Admin

PIN admin saat ini: **`4dministrasi`** (sesuai yang Anda tentukan), tersimpan di `apps-script/Code.gs` baris:
```js
const ADMIN_PIN = '4dministrasi';
```
Untuk ganti PIN: edit baris itu di Apps Script editor, lalu **Deploy ulang** (lihat catatan di Langkah 1).

## Cara Pakai Sehari-hari

- **Semua pegawai**: buka link dashboard, bisa lihat kalender, klik tanggal, lihat statistik — tanpa perlu login apa pun.
- **Anda (admin)**: klik tombol **"🔒 Mode Admin"** di pojok kanan atas nav, masukkan PIN. Setelah aktif, klik tanggal di kalender → akan muncul tombol **"+ Tambah Data Absen"** dan **"+ Tambah Kegiatan Luar"**. Klik salah satu data yang sudah ada untuk mengubah atau menghapusnya.
- Semua perubahan **langsung tersimpan ke Google Sheets** saat klik "Simpan" — tidak perlu proses git/push apa pun.

## Catatan Perhitungan Persentase

- **% Kehadiran**: dihitung dari jumlah hari kerja dalam bulan (Senin–Sabtu, Minggu dianggap libur) dikurangi jumlah hari pegawai tercatat di sheet `Absensi` (Sakit/Izin/Cuti/Alpa). Kalau ada hari libur nasional/cuti bersama di tengah bulan, sistem belum otomatis mengecualikannya — bisa disesuaikan nanti kalau diperlukan.
- **% Kegiatan Luar**: jumlah hari unik pegawai tercatat ikut kegiatan luar gedung dalam periode dibagi total hari kerja pada periode yang dipilih.
- Aturan hari kerja ini bisa diubah di `js/config.js` pada bagian `HARI_KERJA`.

## Setelah Ini Siap di GitHub Pages

1. Buat repository baru di GitHub, upload seluruh isi folder `dashboard/` (bukan foldernya, tapi isinya langsung di root repo, seperti situs Bitcoin Journey Anda).
2. Aktifkan GitHub Pages dari Settings → Pages.
3. Dashboard bisa diakses lewat `https://username.github.io/nama-repo/`.

Data tetap hidup di Google Sheets — GitHub Pages di sini hanya "menampilkan", bukan menyimpan data.
