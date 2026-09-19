// ============================================================
// AKSEN MUSIMAN / PERAYAAN HARI BESAR
// ============================================================
// Urutan array di bawah = urutan PRIORITAS (index lebih kecil menang kalau
// 2 momen kebetulan tumpang tindih di tanggal yang sama).
//
// type "fixed"       -> tanggal tetap tiap tahun (bulan/tanggal dikodekan
//                        langsung), dengan jumlah hari sebelum/sesudah.
// type "fixed_range"  -> rentang tanggal tetap langsung (HUT RI).
// type "moveable"     -> tanggalnya beda tiap tahun, DIAMBIL OTOMATIS dari
//                        data hari libur nasional yang sudah ada di
//                        state.data.libur (cari kata kunci di kolom
//                        Keterangan) - TIDAK di-hardcode per tahun.
// deriveFrom + offsetHari -> khusus Paskah: Minggu Paskah selalu 2 hari
//                        setelah Jumat Agung, jadi dihitung dari situ
//                        (Paskah sendiri kadang tidak ada sebagai entri
//                        libur nasional terpisah).
const MOMEN_LIST = [
  { id: "tahunbaru", label: "Tahun Baru Masehi", icon: "🎆", warna: "#E8AC3E", warna2: "#D9D9D9", type: "fixed", bulan: 1, tanggal: 1, sebelum: 0, sesudah: 4, ucapan: "Happy New Year! 🎆" },
  { id: "idulfitri", label: "Idul Fitri", icon: "🌙", warna: "#2FBF9F", warna2: "#1F8F76", type: "moveable", keyword: "idul fitri", sebelum: 3, sesudah: 7, ucapan: "Selamat Hari Raya Idul Fitri, Mohon Maaf Lahir dan Batin!" },
  { id: "iduladha", label: "Idul Adha", icon: "🐐", warna: "#1F8F5C", warna2: "#0F5C38", type: "moveable", keyword: "idul adha", sebelum: 2, sesudah: 1, ucapan: "Selamat Hari Raya Idul Adha!" },
  { id: "natal", label: "Natal", icon: "🎄", warna: "#E4626F", warna2: "#48B8A6", type: "fixed", bulan: 12, tanggal: 25, sebelum: 3, sesudah: 3, ucapan: "Selamat Hari Natal!" },
  { id: "jumatagung", label: "Jumat Agung", icon: "✝️", warna: "#5B2A86", warna2: "#5B2A86", type: "moveable", keyword: "wafat isa almasih", sebelum: 0, sesudah: 0, ucapan: "Selamat Memperingati Jumat Agung" },
  { id: "paskah", label: "Paskah", icon: "🐣", warna: "#FFF3B0", warna2: "#C7E9C0", type: "moveable", deriveFrom: "wafat isa almasih", offsetHari: 2, sebelum: 0, sesudah: 1, ucapan: "Selamat Hari Paskah!" },
  { id: "kenaikanisa", label: "Kenaikan Isa Almasih", icon: "✝️", warna: "#FFFFFF", warna2: "#AEDFF7", type: "moveable", keyword: "kenaikan isa almasih", sebelum: 0, sesudah: 0, ucapan: "Selamat Hari Kenaikan Isa Almasih!" },
  { id: "imlek", label: "Tahun Baru Imlek", icon: "🧧", warna: "#E4626F", warna2: "#E8AC3E", type: "moveable", keyword: "tahun baru imlek", sebelum: 3, sesudah: 3, ucapan: "Selamat Tahun Baru Imlek!" },
  { id: "nyepi", label: "Hari Raya Nyepi", icon: "🌝", warna: "#F5F0E6", warna2: "#E8E0CC", type: "moveable", keyword: "nyepi", sebelum: 3, sesudah: 3, ucapan: "Selamat Hari Raya Nyepi!" },
  { id: "waisak", label: "Hari Raya Waisak", icon: "🙏", warna: "#F2E07A", warna2: "#F2E07A", type: "moveable", keyword: "waisak", sebelum: 3, sesudah: 3, ucapan: "Selamat Hari Raya Waisak!" },
  { id: "hutri", label: "HUT Kemerdekaan RI", icon: "🇮🇩", warna: "#E4626F", warna2: "#FFFFFF", type: "fixed_range", bulan: 8, tanggalMulai: 10, tanggalAkhir: 22, hariHBulan: 8, hariHTanggal: 17, ucapan: "Selamat Hari Kemerdekaan RI ke-{X}!" },
  { id: "sumpahpemuda", label: "Hari Sumpah Pemuda", icon: "🎗️", warna: "#EFA8AE", warna2: "#EFA8AE", type: "fixed", bulan: 10, tanggal: 28, sebelum: 0, sesudah: 0, ucapan: "Selamat Hari Sumpah Pemuda!" },
  { id: "kesaktianpancasila", label: "Hari Kesaktian Pancasila", icon: "🦅", warna: "#E4626F", warna2: "#FFFFFF", type: "fixed", bulan: 10, tanggal: 1, sebelum: 0, sesudah: 0, ucapan: "Selamat Hari Kesaktian Pancasila!" },
  { id: "kartini", label: "Hari Kartini", icon: "👩🏽", warna: "#F2A6C0", warna2: "#F2A6C0", type: "fixed", bulan: 4, tanggal: 21, sebelum: 0, sesudah: 0, ucapan: "Selamat Hari Kartini!" },
  { id: "hariibu", label: "Hari Ibu", icon: "💐", warna: "#F7C6D9", warna2: "#F7C6D9", type: "fixed", bulan: 12, tanggal: 22, sebelum: 0, sesudah: 0, ucapan: "Selamat Hari Ibu!" },
  { id: "kesehatannasional", label: "Hari Kesehatan Nasional", icon: "🩺", warna: "#48B8A6", warna2: "#48B8A6", type: "fixed", bulan: 11, tanggal: 12, sebelum: 0, sesudah: 0, ucapan: "Selamat Hari Kesehatan Nasional!" },
  { id: "perawatnasional", label: "Hari Perawat Nasional", icon: "👩‍⚕️", warna: "#FFFFFF", warna2: "#48B8A6", type: "fixed", bulan: 3, tanggal: 17, sebelum: 0, sesudah: 0, ucapan: "Selamat Hari Perawat Nasional!" },
  { id: "bidannasional", label: "Hari Bidan Nasional", icon: "🤱", warna: "#F5B8CE", warna2: "#F5B8CE", type: "fixed", bulan: 6, tanggal: 24, sebelum: 0, sesudah: 0, ucapan: "Selamat Hari Bidan Nasional!" },
  { id: "dokternasional", label: "Hari Dokter Nasional", icon: "🩺", warna: "#4FC3E8", warna2: "#4FC3E8", type: "fixed", bulan: 10, tanggal: 24, sebelum: 0, sesudah: 0, ucapan: "Selamat Hari Dokter Nasional!" }
];

// Tanggal "hari ini" yang dipakai fitur ini - bisa dites lewat URL
// ?testDate=YYYY-MM-DD TANPA menunggu tanggal aslinya tiba. Sengaja
// hanya aktif untuk admin (bukan pengunjung biasa) - jadi tidak perlu
// diingat-ingat untuk dihapus lagi sebelum dipakai publik.
function getTanggalEfektifMomen() {
  const params = new URLSearchParams(location.search);
  const testDate = params.get("testDate");
  if (testDate && /^\d{4}-\d{2}-\d{2}$/.test(testDate) && state.isAdmin) return testDate;
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

function tambahHariMomen(dateKeyStr, n) {
  const [y, m, d] = dateKeyStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function hitungRentangMomen(anchorKey, sebelum, sesudah) {
  return { mulai: tambahHariMomen(anchorKey, -sebelum), akhir: tambahHariMomen(anchorKey, sesudah) };
}

// Cari tanggal hari libur nasional yang keterangannya cocok kata kunci
// (case-insensitive, substring) - ini yang menggantikan hardcode tanggal
// untuk momen yang tanggalnya bergeser tiap tahun.
function cariAnchorLiburMomen(keyword) {
  const match = (state.data.libur || []).find(l =>
    (l.Keterangan || "").toLowerCase().includes(keyword)
  );
  return match ? match.Tanggal : null;
}

function getMomenAktifPadaTanggal(dateKeyStr) {
  const tahun = dateKeyStr.slice(0, 4);
  for (const m of MOMEN_LIST) {
    let rentang = null;

    if (m.type === "fixed_range") {
      rentang = {
        mulai: `${tahun}-${pad2(m.bulan)}-${pad2(m.tanggalMulai)}`,
        akhir: `${tahun}-${pad2(m.bulan)}-${pad2(m.tanggalAkhir)}`
      };
    } else if (m.type === "fixed") {
      const anchor = `${tahun}-${pad2(m.bulan)}-${pad2(m.tanggal)}`;
      rentang = hitungRentangMomen(anchor, m.sebelum, m.sesudah);
    } else if (m.type === "moveable") {
      let anchor;
      if (m.deriveFrom) {
        const anchorLain = cariAnchorLiburMomen(m.deriveFrom);
        anchor = anchorLain ? tambahHariMomen(anchorLain, m.offsetHari || 0) : null;
      } else {
        anchor = cariAnchorLiburMomen(m.keyword);
      }
      if (!anchor) continue; // libur ini belum ada di data tahun ini - lewati
      rentang = hitungRentangMomen(anchor, m.sebelum, m.sesudah);
    }

    if (rentang && dateKeyStr >= rentang.mulai && dateKeyStr <= rentang.akhir) {
      return m;
    }
  }
  return null;
}

// Tanggal hari-H (hari UTAMA-nya persis, bukan seluruh rentang tema) untuk
// 1 momen di tahun tertentu. Beda dari rentang tema - misal HUT RI temanya
// tampil 10-22 Agustus, tapi hari-H sesungguhnya cuma 17 Agustus.
function getMomenHariHTanggal(m, tahun) {
  if (m.type === "fixed") {
    return `${tahun}-${pad2(m.bulan)}-${pad2(m.tanggal)}`;
  }
  if (m.type === "fixed_range") {
    return `${tahun}-${pad2(m.hariHBulan)}-${pad2(m.hariHTanggal)}`;
  }
  if (m.type === "moveable") {
    if (m.deriveFrom) {
      const anchorLain = cariAnchorLiburMomen(m.deriveFrom);
      return anchorLain ? tambahHariMomen(anchorLain, m.offsetHari || 0) : null;
    }
    return cariAnchorLiburMomen(m.keyword);
  }
  return null;
}

// Cek apakah tanggal yang diberikan PERSIS hari-H salah satu momen (bukan
// cuma dalam rentang temanya) - dipakai buat nambah ucapan spesial ke
// rotasi ticker, cuma muncul 1 hari itu saja.
function getMomenHariHAktif(dateKeyStr) {
  const tahun = dateKeyStr.slice(0, 4);
  for (const m of MOMEN_LIST) {
    const hariH = getMomenHariHTanggal(m, tahun);
    if (hariH && hariH === dateKeyStr) {
      let ucapan = m.ucapan || `Selamat Hari ${m.label}!`;
      if (ucapan.indexOf("{X}") !== -1) ucapan = ucapan.replace("{X}", Number(tahun) - 1945);
      return { ...m, ucapanFinal: ucapan };
    }
  }
  return null;
}

function applyMomenAksen() {
  const kopIcon = document.getElementById("momenKopIcon");
  const calendarPanel = document.querySelector(".calendar-panel");
  if (!kopIcon) return;

  const momen = getMomenAktifPadaTanggal(getTanggalEfektifMomen());

  if (momen) {
    kopIcon.textContent = momen.icon;
    kopIcon.title = momen.label;
    kopIcon.classList.remove("hidden");
    if (calendarPanel) {
      calendarPanel.classList.add("momen-aktif");
      calendarPanel.style.borderColor = momen.warna;
      calendarPanel.style.boxShadow = `0 0 0 3px ${momen.warna2}55`;
    }
  } else {
    kopIcon.classList.add("hidden");
    kopIcon.textContent = "";
    kopIcon.title = "";
    if (calendarPanel) {
      calendarPanel.classList.remove("momen-aktif");
      calendarPanel.style.borderColor = "";
      calendarPanel.style.boxShadow = "";
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Data libur nasional (dibutuhkan untuk momen "moveable") baru lengkap
  // setelah data bulan berjalan selesai dimuat - tunggu sebentar supaya
  // tidak mengecek sebelum data siap. Aman dipanggil berkali-kali (murah).
  setTimeout(applyMomenAksen, 800);
});
