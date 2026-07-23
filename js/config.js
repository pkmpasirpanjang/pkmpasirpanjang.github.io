// ============================================================
// KONFIGURASI DASHBOARD
// ============================================================
// PENTING: setelah Anda deploy Apps Script (lihat apps-script/Code.gs),
// tempel URL Web App hasil deploy ke sini.
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycby5TZYFYLar7KXBwmYFs2TLykEfhzsV27x1RtOtkWylx6iTogscwfBezXzcf2YRR00/exec",

  NAMA_INSTANSI_BARIS1: "Dinas Kesehatan Kota Kupang",
  NAMA_INSTANSI_BARIS2: "UPTD Puskesmas Pasir Panjang Kota Kupang",

  // Hari kerja dipakai untuk hitung % kehadiran & % kegiatan luar.
  // 0=Minggu, 1=Senin, 2=Selasa, 3=Rabu, 4=Kamis, 5=Jumat, 6=Sabtu
  HARI_KERJA: [1, 2, 3, 4, 5, 6], // Senin-Sabtu, Minggu libur

  STATUS_LIST: [
    { value: "Sakit", color: "#F2B84B" },
    { value: "Izin", color: "#5B9BD5" },
    { value: "Cuti", color: "#B98FD1" },
    { value: "Alpa/Tanpa Keterangan", color: "#E4626F" }
  ],

  KEGIATAN_RUTIN: [
    "Pelayanan Imunisasi Rutin",
    "Pelayanan di Posyandu ILP",
    "Skrining Faktor Risiko PTM",
    "Skrining Lansia"
  ],

  SOSMED: {
    whatsapp: "https://wa.me/6282213350807",
    facebook: "https://www.facebook.com/puskesmas.pasirpanjang.9",
    instagram: "https://www.instagram.com/puskesmaspasirpanjang_kupang",
    tiktok: "https://www.tiktok.com/@puskpasirpanjang_kupang"
  }
};
