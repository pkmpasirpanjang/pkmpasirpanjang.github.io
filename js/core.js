// ============================================================
// CORE — state global, konstanta, helper umum, inisialisasi,
// caching data, navigasi tab, menu sosial media, toast
// ============================================================

// ============================================================
// STATE
// ============================================================
const state = {
  data: { pegawai: [], absensi: [], kegiatanLuar: [], libur: [], apel: [] },
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth(), // 0-11
  isAdmin: false,
  selectedDate: null,
  statAbsenExpanded: false,
  statKegiatanExpanded: false,
  statApelExpanded: false,
  lastApelResults: [],
  lastKegiatanResults: [],
  kegiatanSelectedNames: new Set(), // pegawai yang dicentang di form "Tambah Kegiatan Luar"
  apelPagiSelected: new Set(),      // pegawai yang dicentang "tidak ikut apel pagi" di tanggal yg sedang dibuka
  apelSiangSelected: new Set(),     // pegawai yang dicentang "tidak ikut apel siang" di tanggal yg sedang dibuka
  loadedMonths: new Set(),          // "YYYY-MM" bulan yang data Absensi/KegiatanLuar/Apel-nya sudah diambil sesi ini
  tahunBelumAda: null,               // diisi tahun (string) kalau permintaan terakhir gagal karena spreadsheet tahun itu belum dibuat
  tickerItems: [],                   // daftar teks ticker "status kehadiran hari ini" (sudah diacak)
  tickerIndex: 0,                    // index item ticker yang sedang ditampilkan
  activeTab: "kalender"              // tab-panel yang sedang aktif (dipakai nav.js & refreshDataSetelahSimpan)
};

const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

// Palet warna untuk kartu kegiatan luar gedung - dipilih otomatis per nama
// kegiatan (bukan acak setiap render), supaya kegiatan yang sama selalu
// tampil dengan warna yang sama di mana pun ia muncul.
const ACTIVITY_COLORS = ["#48B8A6", "#E8AC3E", "#7FB3E8", "#C98FD1", "#8FD1A8", "#E8946B", "#6FC7D8", "#D68FB0"];
function getActivityColor(namaKegiatan) {
  let hash = 0;
  for (let i = 0; i < namaKegiatan.length; i++) {
    hash = (hash * 31 + namaKegiatan.charCodeAt(i)) >>> 0;
  }
  return ACTIVITY_COLORS[hash % ACTIVITY_COLORS.length];
}

function pad2(n) { return String(n).padStart(2, "0"); }
function dateKey(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

// Warna persentase: >75% normal, 51-75% kuning (perhatian), <=50% merah (teguran lisan)
function getPctColorClass(pct) {
  if (pct <= 50) return "pct-red";
  if (pct <= 75) return "pct-yellow";
  if (pct < 100) return "pct-green-light";
  return "pct-green-full";
}

// Untuk 100% diberi label bintang supaya jelas beda dari 75-99% (yang sama-sama hijau).
// ambangSedih: di bawah/sama nilai ini muncul emoji 😢 (default 50 untuk Apel,
// Kehadiran pakai 85 - lihat pemanggilannya).
function formatPctLabel(pct, ambangSedih = 50) {
  if (pct >= 100) return "⭐100%";
  if (pct <= ambangSedih) return `😢${pct}%`;
  return `${pct}%`;
}

// Filter pencarian nama untuk daftar statistik (dipakai di 3 panel statistik)
function applyNameSearchFilter(results, searchInputId) {
  const input = document.getElementById(searchInputId);
  const q = input ? input.value.trim().toLowerCase() : "";
  if (!q) return results;
  return results.filter(r => r.nama.toLowerCase().includes(q));
}

// Memasang search box supaya render ulang otomatis saat diketik (sekali pasang saja)
function setupStatSearchInput(searchInputId, renderFn) {
  const input = document.getElementById(searchInputId);
  if (!input || input.dataset.bound) return;
  input.dataset.bound = "1";
  input.addEventListener("input", renderFn);
}


function groupByDate(list, dateField) {
  const out = {};
  list.forEach(item => {
    const key = item[dateField];
    if (!key) return;
    if (!out[key]) out[key] = [];
    out[key].push(item);
  });
  return out;
}

function formatTanggalIndo(tglKey) {
  if (!tglKey) return "-";
  const [y, m, d] = tglKey.split("-").map(Number);
  return `${d} ${BULAN_ID[m - 1]} ${y}`;
}

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  applySocialLinks();
  setupCalendarNav();
  setupModals();
  setupAdmin();
  setupExportMenu();
  setupFloatingMenus();
  startKehadiranTicker();

  // Kalau ada data dari kunjungan sebelumnya tersimpan di perangkat ini,
  // tampilkan dulu itu SEKARANG JUGA (walau mungkin sedikit basi), supaya
  // kalender langsung kelihatan tanpa jeda - baru disegarkan diam-diam.
  const hasCache = loadCachedData();
  renderCalendar();
  if (hasCache) {
    renderSectionSafely("Daftar pegawai (dropdown)", populateEmployeeSelects);
    renderSectionSafely("Ticker kehadiran", rebuildKehadiranTicker);
  }
  // Pilihan bulan di dropdown Statistik cuma daftar 12 bulan terakhir (statis,
  // tidak butuh data) - aman disiapkan dari awal supaya dropdown langsung terisi.
  renderSectionSafely("Pilihan bulan - Kehadiran", populateStatAbsenBulanOptions);
  renderSectionSafely("Pilihan bulan - Apel", populateStatApelBulanOptions);

  // Hanya ambil data BULAN YANG SEDANG DITAMPILKAN di kalender dulu (bukan
  // seluruh riwayat) - supaya buka pertama kali tetap cepat walau data lama
  // sudah menumpuk bertahun-tahun. Statistik & Kegiatan Luar baru diambil
  // saat tab-nya benar-benar dibuka (lihat loadDataForTab).
  // Kalau sebelumnya sudah ada cache yang langsung ditampilkan di atas,
  // penyegaran ini dilakukan diam-diam (tanpa indikator loading yang
  // menutupi) - supaya tidak terasa "loading" padahal isinya sudah tampil.
  await ensureMonthsLoaded([currentMonthKey()], { silent: hasCache });
  renderSectionSafely("Kalender", renderCalendar);
  renderSectionSafely("Daftar pegawai (dropdown)", populateEmployeeSelects);
  renderSectionSafely("Ticker kehadiran", rebuildKehadiranTicker);

  // Data "hari ini" bisa berubah dari perangkat admin LAIN (bukan lewat
  // simpan di perangkat ini) - jadi selain nge-refresh saat kita sendiri
  // simpan, ticker juga disegarkan diam-diam tiap beberapa menit supaya
  // tetap terasa "real-time" tanpa perlu reload halaman manual. Ringan
  // untuk server karena tetap lewat cache 5 menit di Code.gs.
  setInterval(() => {
    ensureMonthsLoaded([currentMonthKey()], { silent: true })
      .then(() => renderSectionSafely("Ticker kehadiran", rebuildKehadiranTicker));
  }, 180000); // 3 menit
});

function currentMonthKey() {
  return monthKeyOf(state.currentYear, state.currentMonth);
}

// ---- Helper rentang/bulan ----
function monthKeyOf(year, month0) { return `${year}-${pad2(month0 + 1)}`; }
function firstDayOfMonthKey(monthKey) { return `${monthKey}-01`; }
function lastDayOfMonthKey(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return `${monthKey}-${pad2(new Date(y, m, 0).getDate())}`;
}
// Daftar semua "YYYY-MM" yang tercakup dalam rentang [dari, sampai] (format yyyy-MM-dd)
function monthKeysInRange(dari, sampai) {
  if (!dari || !sampai) return [];
  const keys = [];
  let [y, m] = dari.split("-").map(Number);
  const [ey, em] = sampai.split("-").map(Number);
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 600) {
    keys.push(`${y}-${pad2(m)}`);
    m++;
    if (m > 12) { m = 1; y++; }
    guard++;
  }
  return keys;
}

function loadCachedData() {
  try {
    const cached = localStorage.getItem("dashboardDataCache");
    if (!cached) return false;
    state.data = JSON.parse(cached);
    return true;
  } catch (err) {
    return false;
  }
}

function saveCachedData() {
  try {
    localStorage.setItem("dashboardDataCache", JSON.stringify(state.data));
  } catch (err) {
    // Kalau gagal simpan (misal penyimpanan penuh), tidak masalah - abaikan saja.
  }
}

// Memastikan data bulan-bulan tertentu sudah ada di state.data. Bulan yang
// SUDAH pernah diambil sesi ini (ada di state.loadedMonths) TIDAK diambil ulang -
// jadi berpindah-pindah bulan/tab yang sama berkali-kali tetap instan.
// opts.silent = true -> tidak menampilkan indikator loading (dipakai untuk
// penyegaran diam-diam di belakang layar).
async function ensureMonthsLoaded(monthKeys, opts) {
  opts = opts || {};
  const missing = [...new Set(monthKeys.filter(Boolean))].filter(mk => !state.loadedMonths.has(mk));
  if (missing.length === 0) return true;

  missing.sort();
  const dari = firstDayOfMonthKey(missing[0]);
  const sampai = lastDayOfMonthKey(missing[missing.length - 1]);

  if (!opts.silent) showLoadingIndicator();
  try {
    const res = await fetch(`${CONFIG.API_URL}?action=data&dari=${dari}&sampai=${sampai}&_ts=${Date.now()}`, { cache: "no-store" });
    const json = await res.json();
    if (json.error === "TAHUN_BELUM_ADA") {
      // Bukan error biasa - spreadsheet untuk tahun itu memang belum dibuat.
      // Simpan info ini supaya kalender/pop up tanggal bisa menampilkan
      // tombol "Buat Spreadsheet Tahun Ini" alih-alih pesan error generik.
      state.tahunBelumAda = json.tahun;
      updateTahunBanner();
      return false;
    }
    if (json.error) throw new Error(json.error);
    state.tahunBelumAda = null;
    updateTahunBanner();
    mergeFetchedData(json, dari, sampai);
    // Tandai SEMUA bulan dalam rentang fetch ini sebagai sudah dimuat (bukan cuma
    // yang diminta), supaya bulan lain di rentang yang sama tidak ditarik ulang.
    monthKeysInRange(dari, sampai).forEach(mk => state.loadedMonths.add(mk));
    saveCachedData();
    return true;
  } catch (err) {
    if (!opts.silent) showToast("Gagal memuat data. Periksa koneksi atau URL API. (" + err.message + ")", true);
    return false;
  } finally {
    if (!opts.silent) hideLoadingIndicator();
  }
}

// Menggabungkan data yang baru diambil ke state.data yang sudah ada di memori.
// Pegawai & Libur selalu dikirim penuh oleh server (tabelnya kecil) - langsung
// ditimpa. Absensi/KegiatanLuar/Apel hanya berisi data DALAM rentang [dari,
// sampai] yang baru diambil - data lama di rentang itu dibuang dulu (supaya
// perubahan/hapus dari admin lain ikut ter-refresh, bukan menumpuk duplikat),
// baru digabungkan dengan yang baru. Data di luar rentang ini (bulan lain yang
// sudah dimuat sebelumnya) tidak disentuh sama sekali.
function mergeFetchedData(fresh, dari, sampai) {
  state.data.pegawai = fresh.pegawai || [];
  state.data.libur = fresh.libur || [];
  state.data.absensi = state.data.absensi.filter(a => a.Tanggal < dari || a.Tanggal > sampai).concat(fresh.absensi || []);
  state.data.kegiatanLuar = state.data.kegiatanLuar.filter(k => k.Tanggal < dari || k.Tanggal > sampai).concat(fresh.kegiatanLuar || []);
  state.data.apel = state.data.apel.filter(a => a.Tanggal < dari || a.Tanggal > sampai).concat(fresh.apel || []);
}

function showLoadingIndicator(text) {
  const el = document.getElementById("dataLoadingIndicator");
  if (!el) return;
  el.textContent = text || "⏳ Memuat data...";
  el.classList.remove("hidden");
}
function hideLoadingIndicator() {
  const el = document.getElementById("dataLoadingIndicator");
  if (el) el.classList.add("hidden");
}

// ============================================================
// BANNER "SPREADSHEET TAHUN INI BELUM DIBUAT"
// ============================================================
// Tampil kalau state.tahunBelumAda terisi (lihat ensureMonthsLoaded di atas).
// Teksnya tetap muncul untuk semua orang (supaya staf biasa tahu kenapa
// datanya kosong), tombol "Buat Sekarang" cuma muncul untuk admin.
function updateTahunBanner() {
  const banner = document.getElementById("tahunBanner");
  const text = document.getElementById("tahunBannerText");
  const btn = document.getElementById("tahunBannerBtn");
  if (!banner || !text || !btn) return;

  if (!state.tahunBelumAda) {
    banner.classList.add("hidden");
    return;
  }
  const tahun = state.tahunBelumAda;
  text.textContent = `⚠️ Spreadsheet untuk tahun ${tahun} belum dibuat - data tahun ini belum bisa ditampilkan.`;
  banner.classList.remove("hidden");
  btn.classList.toggle("hidden", !state.isAdmin);
  btn.onclick = () => buatSpreadsheetTahunBaruHandler(tahun);
}

// Dipanggil sekali saat mode admin diaktifkan - cek TAHUN KALENDER SUNGGUHAN
// SEKARANG (bukan tahun yang sedang dibuka di kalender), supaya admin dapat
// peringatan lebih awal walau kebetulan sedang lihat-lihat bulan/tahun lain.
function cekTahunIniUntukBanner() {
  fetch(`${CONFIG.API_URL}?action=cekTahunIni&_ts=${Date.now()}`, { cache: "no-store" })
    .then(res => res.json())
    .then(json => {
      if (json && json.ada === false) {
        state.tahunBelumAda = json.tahun;
        updateTahunBanner();
      }
    })
    .catch(() => {}); // gagal cek diam-diam saja - banner cuma tidak muncul, tidak kritis
}

// Dipanggil setiap kali pindah tab - memastikan data yang dibutuhkan tab itu
// (bulan kalender / bulan statistik / rentang kegiatan luar) sudah tersedia
// sebelum di-render. Kalau sudah pernah dimuat, ini langsung selesai (instan).
async function loadDataForTab(tabName) {
  if (tabName === "kalender") {
    await ensureMonthsLoaded([currentMonthKey()]);
    renderSectionSafely("Kalender", renderCalendar);
  } else if (tabName === "statAbsen") {
    const val = document.getElementById("statAbsenBulan").value;
    if (!val) return;
    await ensureMonthsLoaded([val]);
    renderSectionSafely("Statistik Kehadiran", renderStatAbsen);
  } else if (tabName === "statApel") {
    const val = document.getElementById("statApelBulan").value;
    if (!val) return;
    await ensureMonthsLoaded([val]);
    renderSectionSafely("Statistik Apel", renderStatApel);
  } else if (tabName === "statKegiatan") {
    const dari = document.getElementById("statKegiatanDari").value;
    const sampai = document.getElementById("statKegiatanSampai").value;
    if (!dari || !sampai || dari > sampai) return;
    await ensureMonthsLoaded(monthKeysInRange(dari, sampai));
    renderSectionSafely("Statistik Kegiatan Luar", renderStatKegiatan);
  }
}

function renderSectionSafely(namaBagian, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`Gagal me-render bagian "${namaBagian}":`, err);
  }
}

// ============================================================
// SOCIAL MENU (href saja - buka/tutup ditangani setupFloatingMenus)
// ============================================================
function applySocialLinks() {
  document.getElementById("socialWa").href = CONFIG.SOSMED.whatsapp;
  document.getElementById("socialFb").href = CONFIG.SOSMED.facebook;
  document.getElementById("socialIg").href = CONFIG.SOSMED.instagram;
  document.getElementById("socialTiktok").href = CONFIG.SOSMED.tiktok;
}

// ============================================================
// FLOATING MENUS (Excel & Sosial Media) - expand lurus ke atas
// ============================================================
// Kedua grup tombol melayang (Export Excel & Sosial Media) berbagi
// perilaku yang sama: saat tombol utama diklik, pilihan-pilihannya
// terbuka lurus ke atas (bukan melengkung - sudah dicoba melengkung,
// hasilnya kurang rapi), tombol utamanya sedikit memudar, dan hanya SATU
// grup yang boleh terbuka dalam satu waktu - buka grup lain otomatis
// menutup yang sedang terbuka. Klik di luar area manapun juga menutup.
function isFloatingMenuOpen(menuEl) {
  return menuEl.classList.contains("open");
}
function openFloatingMenu(menuEl) {
  document.querySelectorAll(".social-menu.open, .export-menu.open").forEach(el => {
    if (el !== menuEl) el.classList.remove("open");
  });
  menuEl.classList.add("open");
}
function closeFloatingMenu(menuEl) {
  if (menuEl) menuEl.classList.remove("open");
}

function setupFloatingMenus() {
  const socialMenu = document.querySelector(".social-menu");
  const exportMenu = document.querySelector(".export-menu");
  const socialLinks = document.getElementById("socialLinks");

  // Kalau menu sosial media sedang terbuka, dorong menu unduh Excel ke atas
  // supaya tidak ketutupan/ketumpuk sama daftar ikon sosial media yang
  // terbuka lurus ke atas persis di bawahnya.
  function syncExportPushUp() {
    if (isFloatingMenuOpen(socialMenu)) {
      const pushUp = socialLinks.offsetHeight + 10; // 10px = jarak antar menu
      exportMenu.style.transform = `translateY(-${pushUp}px)`;
    } else {
      exportMenu.style.transform = "";
    }
  }

  document.getElementById("socialToggleBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    if (isFloatingMenuOpen(socialMenu)) closeFloatingMenu(socialMenu);
    else openFloatingMenu(socialMenu);
    syncExportPushUp();
  });
  document.getElementById("exportToggleBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    if (isFloatingMenuOpen(exportMenu)) closeFloatingMenu(exportMenu);
    else openFloatingMenu(exportMenu); // otomatis menutup social (mutual exclusion) via openFloatingMenu
    syncExportPushUp();
  });

  // Klik di luar kedua grup tombol -> tutup grup yang sedang terbuka (kalau ada).
  document.addEventListener("click", (e) => {
    if (isFloatingMenuOpen(socialMenu) && !socialMenu.contains(e.target)) closeFloatingMenu(socialMenu);
    if (isFloatingMenuOpen(exportMenu) && !exportMenu.contains(e.target)) closeFloatingMenu(exportMenu);
    syncExportPushUp();
  });
}

// ============================================================
// TICKER STATUS KEHADIRAN HARI INI
// ============================================================
// Menampilkan satu per satu (berganti tiap ~2 detik) nama pegawai yang
// hari ini sedang tidak hadir (sakit/izin/cuti/tanpa keterangan) atau
// sedang kegiatan luar gedung, urutan dipilih acak. Kalau semua pegawai
// hadir normal (tidak ada satu pun catatan hari ini), tampilkan pesan
// statis.
const TICKER_INTERVAL_MS = 2000;
let tickerRotateTimer = null;

// Emoji & teks per status - sesuaikan di sini kalau mau ganti emoji atau
// menambah status lain (harus sama persis dengan CONFIG.STATUS_LIST di
// config.js supaya konsisten).
const TICKER_STATUS_INFO = {
  "Sakit": { emoji: "🤒", teks: "sakit" },
  "Izin": { emoji: "🙋", teks: "izin" },
  "Cuti": { emoji: "🏖️", teks: "cuti" },
  "Alpa/Tanpa Keterangan": { emoji: "⚠️", teks: "tanpa keterangan" }
};

function todayDateKey() {
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

// Escape dasar supaya nama/kegiatan/lokasi yang mengandung karakter mirip
// HTML tidak merusak tampilan ticker - perlu karena sekarang ticker dirender
// sebagai innerHTML (untuk bisa menebalkan nama & memiringkan nama kegiatan).
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Kelas ukuran font untuk .id-value (NIP/Pangkat/Jabatan) berdasarkan
// panjang teksnya - dipakai di popup detail statistik & popup profil
// ringkas, supaya nama jabatan yang panjang MENGECIL teksnya alih-alih
// membuat kartu identitas jadi jauh lebih tinggi dan mendorong elemen lain
// di bawahnya turun terlalu jauh.
function idValueSizeClass(text) {
  const len = (text || "").length;
  if (len > 42) return "id-value-sm";
  if (len > 26) return "id-value-md";
  return "";
}

function rebuildKehadiranTicker() {
  const key = todayDateKey();
  const items = [];

  state.data.absensi
    .filter(a => a.Tanggal === key && TICKER_STATUS_INFO[a.Status])
    .forEach(a => {
      const info = TICKER_STATUS_INFO[a.Status];
      items.push(
        `${info.emoji} <span class="ticker-nama">${escapeHtml(a.Nama)}</span> sedang ${info.teks} hari ini`
      );
    });

  state.data.kegiatanLuar
    .filter(k => k.Tanggal === key)
    .forEach(k => {
      items.push(
        `🚗 <span class="ticker-nama">${escapeHtml(k.Nama)}</span> sedang melaksanakan ` +
        `<span class="ticker-kegiatan">${escapeHtml(k.NamaKegiatan || "kegiatan")}</span> di ` +
        `📍 ${escapeHtml(k.Lokasi || "-")}`
      );
    });

  state.tickerItems = items;
  if (state.tickerIndex === undefined || state.tickerIndex >= items.length) {
    state.tickerIndex = 0;
  }
  renderKehadiranTickerText();
}

function renderKehadiranTickerText() {
  const el = document.getElementById("tickerText");
  if (!el) return;
  const items = state.tickerItems || [];
  el.innerHTML = items.length ? items[state.tickerIndex % items.length] : "Semua pegawai hadir hari ini 👍";
}

// Dipilih ACAK PENUH setiap giliran (bukan geser berurutan lewat 1 daftar
// yang sudah diacak sekali) - supaya urutan kategori (tidak hadir vs
// kegiatan luar) tidak pernah terasa "berpola" walau ditonton lama, karena
// daftar yang sama cuma di-rebuild tiap beberapa menit. Sengaja hindari
// mengulang index yang SAMA PERSIS dua kali berturut-turut (supaya tidak
// terasa macet menampilkan nama yang sama), tapi kategori yang sama boleh
// tampil berturut-turut (itu wajar untuk acak sungguhan).
function showNextTickerItem() {
  const el = document.getElementById("tickerText");
  if (!el) return;
  const items = state.tickerItems || [];
  if (items.length <= 1) return;
  let nextIndex = Math.floor(Math.random() * items.length);
  if (nextIndex === state.tickerIndex) nextIndex = (nextIndex + 1) % items.length;
  el.classList.add("fade-out");
  setTimeout(() => {
    state.tickerIndex = nextIndex;
    renderKehadiranTickerText();
    el.classList.remove("fade-out");
  }, 220); // samakan dengan durasi transition .ticker-text di CSS
}

function startKehadiranTicker() {
  if (tickerRotateTimer) clearInterval(tickerRotateTimer);
  tickerRotateTimer = setInterval(showNextTickerItem, TICKER_INTERVAL_MS);
}

// ============================================================
// TOAST
// ============================================================
let toastTimer;
function showToast(msg, isError) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.toggle("error", !!isError);
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}
