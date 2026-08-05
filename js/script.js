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
  loadedMonths: new Set()           // "YYYY-MM" bulan yang data Absensi/KegiatanLuar/Apel-nya sudah diambil sesi ini
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

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  applySocialLinks();
  setupTabs();
  setupCalendarNav();
  setupModals();
  setupAdmin();
  setupExportMenu();
  setupRippleEffect();

  // Kalau ada data dari kunjungan sebelumnya tersimpan di perangkat ini,
  // tampilkan dulu itu SEKARANG JUGA (walau mungkin sedikit basi), supaya
  // kalender langsung kelihatan tanpa jeda - baru disegarkan diam-diam.
  const hasCache = loadCachedData();
  renderCalendar();
  if (hasCache) {
    renderSectionSafely("Daftar pegawai (dropdown)", populateEmployeeSelects);
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
    if (json.error) throw new Error(json.error);
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
// TABS
// ============================================================
function setupTabs() {
  document.querySelectorAll(".tab-btn[data-tab]").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".tab-btn[data-tab]").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
      // Pastikan data yang dibutuhkan tab ini sudah tersedia (ambil dari server
      // kalau belum pernah dimuat sesi ini, instan kalau sudah pernah).
      await loadDataForTab(btn.dataset.tab);
    });
  });
}

// ============================================================
// SOCIAL MENU
// ============================================================
// ============================================================
// EFEK RIPPLE / RIAK AIR (muncul di titik manapun yang diklik/disentuh -
// termasuk area kosong sekalipun, bukan cuma tombol). Terdiri dari 1
// kilatan kecil di titik sentuh + beberapa cincin konsentris yang
// menyusul bertahap, melebar pelan lalu memudar - meniru riak air
// sungguhan, bukan cuma 1 lingkaran membesar (yang kelihatan seperti asap).
// Murni CSS animation (elemen dibuang otomatis dari halaman setelah
// animasi selesai), jadi ringan walau diklik berkali-kali cepat.
// ============================================================
function setupRippleEffect() {
  const kurangiAnimasi = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (kurangiAnimasi) return; // hormati pengaturan aksesibilitas pengguna

  document.addEventListener("pointerdown", (e) => {
    // Hanya untuk klik kiri mouse / sentuhan jari, bukan klik kanan dsb.
    if (e.button !== undefined && e.button !== 0) return;
    spawnRippleAt(e.clientX, e.clientY);
  }, { passive: true });
}

function spawnRippleAt(x, y) {
  const buatElemen = (className, delayMs, umurMs) => {
    const el = document.createElement("span");
    el.className = className;
    el.style.left = x + "px";
    el.style.top = y + "px";
    if (delayMs) el.style.animationDelay = delayMs + "ms";
    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
    setTimeout(() => el.remove(), umurMs); // jaring pengaman kalau animationend tidak terpicu
  };

  buatElemen("ripple-flash", 0, 500);
  // 3 cincin menyusul bertahap dengan jeda singkat - persis seperti riak
  // air asli yang menyebar dalam beberapa gelombang, bukan cuma 1 lingkaran.
  // Total durasi keseluruhan dijaga sekitar 1 detik saja supaya cepat hilang.
  const JUMLAH_CINCIN = 3;
  const JEDA_ANTAR_CINCIN = 110; // ms
  for (let i = 0; i < JUMLAH_CINCIN; i++) {
    buatElemen("ripple-ring", i * JEDA_ANTAR_CINCIN, 750 + i * JEDA_ANTAR_CINCIN + 150);
  }
}

function applySocialLinks() {
  document.getElementById("socialWa").href = CONFIG.SOSMED.whatsapp;
  document.getElementById("socialFb").href = CONFIG.SOSMED.facebook;
  document.getElementById("socialIg").href = CONFIG.SOSMED.instagram;
  document.getElementById("socialTiktok").href = CONFIG.SOSMED.tiktok;

  document.getElementById("socialToggleBtn").addEventListener("click", () => {
    const links = document.getElementById("socialLinks");
    const exportMenu = document.querySelector(".export-menu");
    links.classList.toggle("hidden");

    // Kalau menu sosial media sedang terbuka, dorong menu unduh Excel ke atas
    // supaya tidak ketutupan/ketumpuk sama daftar ikon sosial media yang muncul.
    if (!links.classList.contains("hidden")) {
      const pushUp = links.offsetHeight + 10; // 10px = jarak antar menu
      if (exportMenu) exportMenu.style.transform = `translateY(-${pushUp}px)`;
    } else {
      if (exportMenu) exportMenu.style.transform = "";
    }
  });
}

// ============================================================
// CALENDAR
// ============================================================
function setupCalendarNav() {
  document.getElementById("prevMonthBtn").addEventListener("click", async () => {
    state.currentMonth--;
    if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
    await loadDataForTab("kalender");
  });
  document.getElementById("nextMonthBtn").addEventListener("click", async () => {
    state.currentMonth++;
    if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
    await loadDataForTab("kalender");
  });
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

function renderCalendar() {
  const y = state.currentYear, m = state.currentMonth;
  document.getElementById("calendarTitle").textContent = `${BULAN_ID[m]} ${y}`;

  const firstDay = new Date(y, m, 1);
  // convert JS Sunday=0 to Monday-first index (0=Senin..6=Minggu)
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const absenByDate = groupByDate(state.data.absensi, "Tanggal");
  const kegiatanByDate = groupByDate(state.data.kegiatanLuar, "Tanggal");
  const liburSet = getLiburDatesSet();

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-cell empty";
    grid.appendChild(empty);
  }

  const todayKey = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(y, m, d);
    const isLibur = liburSet.has(key);
    const cell = document.createElement("div");
    cell.className = "cal-cell" + (key === todayKey ? " today" : "") + (isLibur ? " libur" : "");
    const absenCount = (absenByDate[key] || []).length;
    const kegiatanCount = (kegiatanByDate[key] || []).length;

    cell.innerHTML = `
      <div class="cal-daynum">${d}${isLibur ? ' <span class="libur-mark">🎌</span>' : ""}</div>
      <div class="cal-badges">
        ${absenCount ? `<span class="cal-badge-count"><i class="dot dot-absen"></i> ${absenCount}</span>` : ""}
        ${kegiatanCount ? `<span class="cal-badge-count"><i class="dot dot-kegiatan"></i> ${kegiatanCount}</span>` : ""}
      </div>`;
    cell.addEventListener("click", () => openDateModal(key));
    grid.appendChild(cell);
  }
}

function getLiburDatesSet() {
  return new Set((state.data.libur || []).map(l => l.Tanggal));
}

function getLiburRecord(key) {
  return (state.data.libur || []).find(l => l.Tanggal === key);
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

// ============================================================
// DATE DETAIL MODAL
// ============================================================
function openDateModal(key) {
  state.selectedDate = key;
  const [y, m, d] = key.split("-").map(Number);
  document.getElementById("modalDateTitle").textContent = `${d} ${BULAN_ID[m - 1]} ${y}`;

  const liburRecord = getLiburRecord(key);
  const liburBar = document.getElementById("liburBar");
  const liburLabel = document.getElementById("liburLabel");
  const markBtn = document.getElementById("markLiburBtn");
  const unmarkBtn = document.getElementById("unmarkLiburBtn");

  if (liburRecord) {
    liburBar.classList.remove("hidden");
    liburLabel.textContent = liburRecord.Keterangan ? `Hari Libur — ${liburRecord.Keterangan}` : "Hari Libur";
    markBtn.classList.add("hidden");
    unmarkBtn.classList.remove("hidden");
    unmarkBtn.onclick = () => sendAction("deleteLibur", { _row: liburRecord._row });
  } else {
    liburBar.classList.add("hidden");
    markBtn.classList.remove("hidden");
    unmarkBtn.classList.add("hidden");
    markBtn.onclick = () => {
      const keterangan = prompt("Nama hari libur (opsional, boleh dikosongkan):", "");
      if (keterangan === null) return; // batal
      sendAction("addLibur", { Tanggal: key, Keterangan: keterangan });
    };
  }
  document.querySelector(".libur-actions").classList.toggle("hidden", !state.isAdmin);

  const absenList = state.data.absensi
    .filter(a => a.Tanggal === key)
    .sort((a, b) => {
      const idxA = CONFIG.STATUS_LIST.findIndex(s => s.value === a.Status);
      const idxB = CONFIG.STATUS_LIST.findIndex(s => s.value === b.Status);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
  const kegiatanList = state.data.kegiatanLuar.filter(k => k.Tanggal === key);

  const absenEl = document.getElementById("modalAbsenList");
  absenEl.innerHTML = absenList.length ? "" : `<p class="empty-note">Semua pegawai hadir hari ini.</p>`;
  absenList.forEach(a => {
    const statusInfo = CONFIG.STATUS_LIST.find(s => s.value === a.Status) || { color: "#999" };
    const el = document.createElement("div");
    el.className = "modal-item" + (state.isAdmin ? " editable" : "");
    el.innerHTML = `<span class="status-chip" style="background:${statusInfo.color}">${a.Status}</span>
      <span class="item-title">${a.Nama}</span>
      ${a.Keterangan ? `<div class="item-sub">${a.Keterangan}</div>` : ""}`;
    if (state.isAdmin) el.addEventListener("click", () => openAbsenForm(a));
    absenEl.appendChild(el);
  });

  const kegEl = document.getElementById("modalKegiatanList");
  kegEl.innerHTML = kegiatanList.length ? "" : `<p class="empty-note">Tidak ada kegiatan luar gedung.</p>`;

  // Kelompokkan baris-baris dengan No ST + Nama Kegiatan + Lokasi yang sama
  // jadi satu kartu, supaya kegiatan yang diikuti banyak orang tidak berulang kartunya.
  const groups = {};
  kegiatanList.forEach(k => {
    const groupKey = `${k.NoST || ""}|${k.NamaKegiatan || ""}|${k.Lokasi || ""}`;
    if (!groups[groupKey]) groups[groupKey] = { info: k, items: [] };
    groups[groupKey].items.push(k);
  });

  Object.values(groups).forEach(group => {
    const k = group.info;
    const el = document.createElement("div");
    const warna = getActivityColor(k.NamaKegiatan || "");
    el.className = "modal-item kegiatan-card";
    el.style.borderLeftColor = warna;
    const chipsHtml = group.items.map(item => `
      <span class="person-chip${state.isAdmin ? " editable" : ""}" data-row="${item._row}">${item.Nama}</span>
    `).join("");
    el.innerHTML = `
      <div class="item-title" style="color:${warna}">${k.NamaKegiatan || "(Tanpa nama kegiatan)"}</div>
      <div class="item-sub">📍 ${k.Lokasi}${k.NoST ? `<span class="st-tag">No.ST: ${k.NoST}</span>` : ""}</div>
      <div class="person-chip-row">${chipsHtml}</div>
    `;
    if (state.isAdmin) {
      el.querySelectorAll(".person-chip").forEach(chip => {
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          const row = Number(chip.dataset.row);
          const item = group.items.find(it => it._row === row);
          openKegiatanForm(item);
        });
      });
    }
    kegEl.appendChild(el);
  });

  document.getElementById("addAbsenBtn").classList.toggle("hidden", !state.isAdmin);
  document.getElementById("addKegiatanBtn").classList.toggle("hidden", !state.isAdmin);

  try {
    document.getElementById("apelAdminSection").classList.toggle("hidden", !state.isAdmin);
    if (state.isAdmin) {
      state.apelPagiSelected = new Set(
        state.data.apel.filter(a => a.Tanggal === key && a.Sesi === "Pagi").map(a => a.Nama)
      );
      state.apelSiangSelected = new Set(
        state.data.apel.filter(a => a.Tanggal === key && a.Sesi === "Siang").map(a => a.Nama)
      );
      document.getElementById("apelPagiSearch").value = "";
      document.getElementById("apelSiangSearch").value = "";
      const namesForApel = state.data.pegawai.map(p => p.Nama).sort();
      renderChecklistGeneric("apelPagiChecklist", namesForApel, "", state.apelPagiSelected);
      renderChecklistGeneric("apelSiangChecklist", namesForApel, "", state.apelSiangSelected);
    }
  } catch (err) {
    console.error("Gagal menyiapkan bagian Apel di pop-up tanggal:", err);
  }

  showModal("dateModal");
}

async function submitApel() {
  await sendAction("syncApelHari", {
    Tanggal: state.selectedDate,
    PagiList: Array.from(state.apelPagiSelected),
    SiangList: Array.from(state.apelSiangSelected)
  });
}

// ============================================================
// MODAL HELPERS
// ============================================================
function setupModals() {
  document.getElementById("closeModalBtn").addEventListener("click", () => hideModal("dateModal"));
  document.querySelectorAll(".js-close-form").forEach(btn => {
    btn.addEventListener("click", () => hideModal(btn.closest(".modal-overlay").id));
  });
  document.querySelectorAll(".modal-overlay").forEach(ov => {
    ov.addEventListener("click", (e) => { if (e.target === ov) hideModal(ov.id); });
  });

  document.getElementById("addAbsenBtn").addEventListener("click", () => openAbsenForm(null));
  document.getElementById("addKegiatanBtn").addEventListener("click", () => openKegiatanForm(null));

  populateEmployeeSelects();
  populateStatusSelect();
  populateKegiatanSelect();

  document.getElementById("formAbsen").addEventListener("submit", submitAbsen);
  document.getElementById("formKegiatan").addEventListener("submit", submitKegiatan);
  document.getElementById("deleteAbsenBtn").addEventListener("click", deleteAbsen);
  document.getElementById("deleteKegiatanBtn").addEventListener("click", deleteKegiatan);

  document.getElementById("kegiatanNamaSelect").addEventListener("change", (e) => {
    const manual = document.getElementById("kegiatanNamaManual");
    if (e.target.value === "__LAINNYA__") { manual.classList.remove("hidden"); manual.required = true; }
    else { manual.classList.add("hidden"); manual.required = false; }
  });

  setupApelChecklistSearch("apelPagiSearch", "apelPagiChecklist", () => state.apelPagiSelected);
  setupApelChecklistSearch("apelSiangSearch", "apelSiangChecklist", () => state.apelSiangSelected);
  document.getElementById("simpanApelBtn").addEventListener("click", submitApel);
}

function showModal(id) { document.getElementById(id).classList.remove("hidden"); }
function hideModal(id) { document.getElementById(id).classList.add("hidden"); }

// Menampilkan emoji besar sekilas (2 detik) di atas pop-up detail statistik,
// sebagai reaksi otomatis: 😢 untuk persentase ≤50%, 👏 untuk 100% penuh.
let reactionTimer;
function triggerStatReaction(emoji) {
  const overlay = document.getElementById("statReactionOverlay");
  if (!overlay) return;
  const emojiEl = document.getElementById("statReactionEmoji");
  emojiEl.textContent = emoji;
  overlay.classList.remove("hidden", "show");
  void overlay.offsetWidth; // paksa reflow supaya animasi bisa mengulang kalau diklik berturut-turut
  overlay.classList.add("show");
  clearTimeout(reactionTimer);
  reactionTimer = setTimeout(() => {
    overlay.classList.add("hidden");
    overlay.classList.remove("show");
  }, 2000);
}

function populateEmployeeSelects() {
  const names = state.data.pegawai.map(p => p.Nama).sort();
  const optionsHtml = names.map(n => `<option value="${n}"></option>`).join("");

  document.getElementById("absenNamaOptions").innerHTML = optionsHtml;
  document.getElementById("rangeNamaOptions").innerHTML = optionsHtml;

  const kegiatanSel = document.getElementById("kegiatanNama");
  kegiatanSel.innerHTML = `<option value="">-- Pilih Pegawai --</option>` +
    names.map(n => `<option value="${n}">${n}</option>`).join("");

  renderKegiatanChecklist(names, "");
  const searchInput = document.getElementById("kegiatanNamaSearch");
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "1";
    // Sengaja ambil ulang daftar nama TERBARU dari state setiap kali diketik
    // (bukan pakai variabel "names" di atas), supaya tidak "macet" ke daftar
    // kosong kalau listener ini sempat terpasang sebelum data pegawai termuat.
    searchInput.addEventListener("input", () => {
      const liveNames = state.data.pegawai.map(p => p.Nama).sort();
      renderKegiatanChecklist(liveNames, searchInput.value.trim().toLowerCase());
    });
  }
}

function renderKegiatanChecklist(names, filterText) {
  const box = document.getElementById("kegiatanNamaCheckboxList");
  if (!box) return;
  const filtered = filterText ? names.filter(n => n.toLowerCase().includes(filterText)) : names;

  if (filtered.length === 0) {
    box.innerHTML = `<div class="checkbox-row no-match">Nama tidak ditemukan.</div>`;
    return;
  }

  box.innerHTML = filtered.map(n => `
    <label class="checkbox-row">
      <input type="checkbox" value="${n}" ${state.kegiatanSelectedNames.has(n) ? "checked" : ""}>
      <span>${n}</span>
    </label>
  `).join("");

  box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) state.kegiatanSelectedNames.add(cb.value);
      else state.kegiatanSelectedNames.delete(cb.value);
      updateKegiatanNamaCount();
    });
  });
  updateKegiatanNamaCount();
}

// Versi generik dari checklist di atas - dipakai untuk Apel Pagi & Apel Siang
// (dua kotak centang terpisah, masing-masing punya Set() pilihan sendiri).
function renderChecklistGeneric(containerId, names, filterText, selectedSet) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const filtered = filterText ? names.filter(n => n.toLowerCase().includes(filterText)) : names;

  if (filtered.length === 0) {
    box.innerHTML = `<div class="checkbox-row no-match">Nama tidak ditemukan.</div>`;
    return;
  }

  box.innerHTML = filtered.map(n => `
    <label class="checkbox-row">
      <input type="checkbox" value="${n}" ${selectedSet.has(n) ? "checked" : ""}>
      <span>${n}</span>
    </label>
  `).join("");

  box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedSet.add(cb.value);
      else selectedSet.delete(cb.value);
    });
  });
}

function setupApelChecklistSearch(searchId, containerId, getSelectedSet) {
  const input = document.getElementById(searchId);
  if (!input || input.dataset.bound) return;
  input.dataset.bound = "1";
  input.addEventListener("input", () => {
    const liveNames = state.data.pegawai.map(p => p.Nama).sort();
    renderChecklistGeneric(containerId, liveNames, input.value.trim().toLowerCase(), getSelectedSet());
  });
}

function getSelectedKegiatanNames() {
  return state.kegiatanSelectedNames;
}

function updateKegiatanNamaCount() {
  const countEl = document.getElementById("kegiatanNamaCount");
  if (!countEl) return;
  countEl.textContent = `${state.kegiatanSelectedNames.size} pegawai dipilih`;
}

function populateStatusSelect() {
  const sel = document.getElementById("absenStatus");
  sel.innerHTML = CONFIG.STATUS_LIST.map(s => `<option value="${s.value}">${s.value}</option>`).join("");

  const rangeSel = document.getElementById("rangeStatus");
  rangeSel.innerHTML = CONFIG.STATUS_LIST.map(s => `<option value="${s.value}">${s.value}</option>`).join("");
}

function populateKegiatanSelect() {
  const sel = document.getElementById("kegiatanNamaSelect");
  sel.innerHTML = CONFIG.KEGIATAN_RUTIN.map(k => `<option value="${k}">${k}</option>`).join("")
    + `<option value="__LAINNYA__">+ Kegiatan Lain...</option>`;
}

// wait for data before populating selects with real names
function refreshFormOptionsAfterDataLoad() { populateEmployeeSelects(); }

// ============================================================
// FORM: ABSEN
// ============================================================
function openAbsenForm(existing) {
  document.getElementById("absenRow").value = existing ? existing._row : "";
  document.getElementById("absenNama").value = existing ? existing.Nama : "";
  document.getElementById("absenStatus").value = existing ? existing.Status : CONFIG.STATUS_LIST[0].value;
  document.getElementById("absenKeterangan").value = existing ? (existing.Keterangan || "") : "";
  document.getElementById("deleteAbsenBtn").classList.toggle("hidden", !existing);
  showModal("formAbsenModal");
}

async function submitAbsen(e) {
  e.preventDefault();
  const namaInput = document.getElementById("absenNama").value.trim();
  if (!state.data.pegawai.some(p => p.Nama === namaInput)) {
    showToast("Nama pegawai tidak ditemukan di daftar - pilih dari saran yang muncul saat mengetik.", true);
    return;
  }
  const row = document.getElementById("absenRow").value;
  const payload = {
    Tanggal: state.selectedDate,
    Nama: namaInput,
    Status: document.getElementById("absenStatus").value,
    Keterangan: document.getElementById("absenKeterangan").value
  };
  if (row) payload._row = Number(row);
  await sendAction(row ? "updateAbsensi" : "addAbsensi", payload);
  hideModal("formAbsenModal");
}

async function deleteAbsen() {
  const row = document.getElementById("absenRow").value;
  if (!row) return;
  if (!confirm("Hapus data absen ini?")) return;
  await sendAction("deleteAbsensi", { _row: Number(row) });
  hideModal("formAbsenModal");
}

// ============================================================
// FORM: KEGIATAN
// ============================================================
function openKegiatanForm(existing) {
  document.getElementById("kegiatanRow").value = existing ? existing._row : "";
  document.getElementById("kegiatanNoST").value = existing ? (existing.NoST || "") : "";
  document.getElementById("kegiatanLokasi").value = existing ? existing.Lokasi : "";

  const select = document.getElementById("kegiatanNamaSelect");
  const manual = document.getElementById("kegiatanNamaManual");
  if (existing && !CONFIG.KEGIATAN_RUTIN.includes(existing.NamaKegiatan)) {
    select.value = "__LAINNYA__";
    manual.classList.remove("hidden");
    manual.value = existing.NamaKegiatan;
  } else {
    select.value = existing ? existing.NamaKegiatan : CONFIG.KEGIATAN_RUTIN[0];
    manual.classList.add("hidden");
    manual.value = "";
  }

  const singleWrap = document.getElementById("kegiatanNamaSingleWrap");
  const multiWrap = document.getElementById("kegiatanNamaMultiWrap");

  if (existing) {
    // MODE EDIT: satu pegawai, tampilkan dropdown tunggal
    singleWrap.classList.remove("hidden");
    multiWrap.classList.add("hidden");
    document.getElementById("kegiatanNama").value = existing.Nama;
  } else {
    // MODE TAMBAH: checklist multi-pilih, kosongkan semua centang
    singleWrap.classList.add("hidden");
    multiWrap.classList.remove("hidden");
    state.kegiatanSelectedNames = new Set();
    const names = state.data.pegawai.map(p => p.Nama).sort();
    document.getElementById("kegiatanNamaSearch").value = "";
    renderKegiatanChecklist(names, "");
    updateKegiatanNamaCount();
  }

  document.getElementById("deleteKegiatanBtn").classList.toggle("hidden", !existing);
  showModal("formKegiatanModal");
}

async function submitKegiatan(e) {
  e.preventDefault();
  const row = document.getElementById("kegiatanRow").value;
  const select = document.getElementById("kegiatanNamaSelect");
  const namaKegiatan = select.value === "__LAINNYA__"
    ? document.getElementById("kegiatanNamaManual").value
    : select.value;

  const basePayload = {
    NoST: document.getElementById("kegiatanNoST").value,
    Tanggal: state.selectedDate,
    NamaKegiatan: namaKegiatan,
    Lokasi: document.getElementById("kegiatanLokasi").value
  };

  if (row) {
    // EDIT: 1 orang
    await sendAction("updateKegiatan", {
      ...basePayload,
      Nama: document.getElementById("kegiatanNama").value,
      _row: Number(row)
    });
  } else {
    // TAMBAH: bisa banyak orang sekaligus
    const namaList = Array.from(getSelectedKegiatanNames());
    if (namaList.length === 0) {
      showToast("Pilih minimal 1 pegawai.", true);
      return;
    }
    await sendAction("addKegiatanMulti", { ...basePayload, NamaList: namaList });
  }
  hideModal("formKegiatanModal");
}

async function deleteKegiatan() {
  const row = document.getElementById("kegiatanRow").value;
  if (!row) return;
  if (!confirm("Hapus data kegiatan ini?")) return;
  await sendAction("deleteKegiatan", { _row: Number(row) });
  hideModal("formKegiatanModal");
}

// ============================================================
// SEND ACTION TO APPS SCRIPT (POST)
// ============================================================
let sedangMenyimpan = false;

async function sendAction(action, data) {
  if (sedangMenyimpan) {
    showToast("Masih memproses permintaan sebelumnya, mohon tunggu sebentar...", true);
    return;
  }
  const pin = sessionStorage.getItem("adminPin");
  if (!pin) { showToast("Sesi admin berakhir, silakan masuk ulang.", true); return; }

  sedangMenyimpan = true;
  setSimpanButtonsDisabled(true);
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, pin, data })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Gagal menyimpan.");
    applyLocalPatch(action, data, json.result);
    renderSectionSafely("Kalender", renderCalendar);
    if (state.selectedDate) renderSectionSafely("Detail tanggal", () => openDateModal(state.selectedDate));
    renderSectionSafely("Statistik Kehadiran", renderStatAbsen);
    renderSectionSafely("Statistik Apel", renderStatApel);
    renderSectionSafely("Statistik Kegiatan Luar", renderStatKegiatan);
    showToast("Data berhasil disimpan.");
  } catch (err) {
    showToast("Gagal menyimpan: " + err.message, true);
  } finally {
    sedangMenyimpan = false;
    setSimpanButtonsDisabled(false);
  }
}

// Menonaktifkan sementara semua tombol "Simpan" selagi ada proses berjalan,
// supaya tidak bisa diklik dua kali (penyebab paling sering data gagal
// tersimpan - dua permintaan simpan yang bertabrakan).
function setSimpanButtonsDisabled(disabled) {
  document.querySelectorAll('.btn-primary[type="submit"], #simpanApelBtn').forEach(btn => {
    if (disabled) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = "Menyimpan...";
    } else if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
    }
    btn.disabled = disabled;
  });
}

// Menerapkan hasil simpan langsung ke data yang sudah ada di memori (state.data),
// supaya tampilan langsung ter-update tanpa perlu minta ulang SEMUA data ke server
// (itu yang bikin proses simpan terasa lambat sebelumnya).
function applyLocalPatch(action, sentData, result) {
  switch (action) {
    case "addAbsensi":
      state.data.absensi.push(result);
      break;
    case "updateAbsensi": {
      const idx = state.data.absensi.findIndex(a => a._row === result._row);
      if (idx !== -1) state.data.absensi[idx] = result; else state.data.absensi.push(result);
      break;
    }
    case "deleteAbsensi":
      state.data.absensi = state.data.absensi.filter(a => a._row !== sentData._row);
      break;
    case "addAbsensiRange":
      state.data.absensi.push(...result);
      break;
    case "addKegiatanMulti":
      state.data.kegiatanLuar.push(...result);
      break;
    case "updateKegiatan": {
      const idx = state.data.kegiatanLuar.findIndex(k => k._row === result._row);
      if (idx !== -1) state.data.kegiatanLuar[idx] = result; else state.data.kegiatanLuar.push(result);
      break;
    }
    case "deleteKegiatan":
      state.data.kegiatanLuar = state.data.kegiatanLuar.filter(k => k._row !== sentData._row);
      break;
    case "addLibur":
      state.data.libur.push(result);
      break;
    case "deleteLibur":
      state.data.libur = state.data.libur.filter(l => l._row !== sentData._row);
      break;
    case "syncApelHari":
      state.data.apel = result; // backend kembalikan seluruh data Apel terbaru
      break;
  }
}

// ============================================================
// ADMIN MODE
// ============================================================
function setupAdmin() {
  const savedPin = sessionStorage.getItem("adminPin");
  if (savedPin) activateAdmin();

  document.getElementById("adminToggleBtn").addEventListener("click", () => {
    if (state.isAdmin) {
      sessionStorage.removeItem("adminPin");
      state.isAdmin = false;
      document.getElementById("adminToggleBtn").textContent = "🔒 Mode Admin";
      document.getElementById("adminToggleBtn").classList.remove("admin-active");
      document.getElementById("rangeAbsenBtn").classList.add("hidden");
      document.getElementById("exportChoices").classList.add("hidden");
      showToast("Keluar dari mode admin.");
    } else {
      showModal("pinModal");
    }
  });

  document.getElementById("formPin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = document.getElementById("pinInput").value;
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "checkPin", pin })
    });
    const json = await res.json();
    if (json.success) {
      sessionStorage.setItem("adminPin", pin);
      activateAdmin();
      hideModal("pinModal");
      document.getElementById("pinError").classList.add("hidden");
      document.getElementById("pinInput").value = "";
    } else {
      document.getElementById("pinError").classList.remove("hidden");
    }
  });

  setupRangeAbsenForm();
}

function activateAdmin() {
  state.isAdmin = true;
  document.getElementById("adminToggleBtn").textContent = "🔓 Admin Aktif";
  document.getElementById("adminToggleBtn").classList.add("admin-active");
  document.getElementById("rangeAbsenBtn").classList.remove("hidden");
}

function setupRangeAbsenForm() {
  document.getElementById("rangeAbsenBtn").addEventListener("click", () => {
    document.getElementById("formAbsenRange").reset();
    document.getElementById("rangeSummary").textContent = "";
    showModal("formAbsenRangeModal");
  });

  const updateSummary = () => {
    const mulai = document.getElementById("rangeMulai").value;
    const selesai = document.getElementById("rangeSelesai").value;
    const summaryEl = document.getElementById("rangeSummary");
    if (!mulai || !selesai) { summaryEl.textContent = ""; return; }
    if (selesai < mulai) { summaryEl.textContent = "Tanggal selesai tidak boleh sebelum tanggal mulai."; return; }
    const jumlahHari = Math.round((new Date(selesai) - new Date(mulai)) / 86400000) + 1;
    summaryEl.textContent = `Akan tercatat untuk ${jumlahHari} hari (${mulai} s.d. ${selesai}).`;
  };
  document.getElementById("rangeMulai").addEventListener("change", updateSummary);
  document.getElementById("rangeSelesai").addEventListener("change", updateSummary);

  document.getElementById("formAbsenRange").addEventListener("submit", async (e) => {
    e.preventDefault();
    const namaInput = document.getElementById("rangeNama").value.trim();
    if (!state.data.pegawai.some(p => p.Nama === namaInput)) {
      showToast("Nama pegawai tidak ditemukan di daftar - pilih dari saran yang muncul saat mengetik.", true);
      return;
    }
    const mulai = document.getElementById("rangeMulai").value;
    const selesai = document.getElementById("rangeSelesai").value;
    if (selesai < mulai) {
      showToast("Tanggal selesai tidak boleh sebelum tanggal mulai.", true);
      return;
    }
    await sendAction("addAbsensiRange", {
      Nama: namaInput,
      Status: document.getElementById("rangeStatus").value,
      Keterangan: document.getElementById("rangeKeterangan").value,
      TanggalMulai: mulai,
      TanggalSelesai: selesai
    });
    hideModal("formAbsenRangeModal");
  });
}

// ============================================================
// STATISTIK KEHADIRAN
// ============================================================
function populateStatAbsenBulanOptions() {
  const sel = document.getElementById("statAbsenBulan");
  const prevValue = sel.value;
  sel.innerHTML = "";
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const label = `${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
    sel.innerHTML += `<option value="${value}">${label}</option>`;
  }
  if (prevValue) sel.value = prevValue; // pertahankan bulan yang sedang dipilih user (kalau ada)

  if (!sel.dataset.bound) {
    sel.dataset.bound = "1";
    sel.addEventListener("change", () => loadDataForTab("statAbsen"));
    document.getElementById("toggleStatAbsenBtn").addEventListener("click", () => {
      state.statAbsenExpanded = !state.statAbsenExpanded;
      renderStatAbsen();
    });
    setupStatSearchInput("statAbsenSearch", renderStatAbsen);
  }
}

function countWorkingDaysInMonth(year, month, upToDay) {
  const lastDay = upToDay || new Date(year, month + 1, 0).getDate();
  const liburSet = getLiburDatesSet();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(year, month, d).getDay();
    const key = dateKey(year, month, d);
    if (CONFIG.HARI_KERJA.includes(dow) && !liburSet.has(key)) count++;
  }
  return count;
}

function renderStatAbsen() {
  const [y, m] = document.getElementById("statAbsenBulan").value.split("-").map(Number);
  const year = y, month = m - 1;

  const now = new Date();
  const isBulanBerjalan = (year === now.getFullYear() && month === now.getMonth());
  const jumlahHariBulan = new Date(year, month + 1, 0).getDate();
  const periodeMulai = `${year}-${pad2(month + 1)}-01`;
  // Untuk bulan yang sedang berjalan, hitung hari kerja hanya sampai HARI INI —
  // supaya hari-hari yang belum terjadi tidak dianggap "tidak hadir".
  const periodeSelesai = isBulanBerjalan
    ? `${year}-${pad2(month + 1)}-${pad2(now.getDate())}`
    : `${year}-${pad2(month + 1)}-${pad2(jumlahHariBulan)}`;

  const prefix = `${year}-${pad2(month + 1)}`;
  const liburSet = getLiburDatesSet();

  const results = state.data.pegawai.map(p => {
    // Pegawai rotasi/sementara: kalau belum mulai kerja atau sudah selesai
    // sebelum bulan ini, kecualikan total dari daftar (bukan dianggap 100%).
    const rentang = hitungRentangAktifPegawai(p, periodeMulai, periodeSelesai);
    if (!rentang) return null;

    const workingDays = countWorkingDaysInRange(rentang.mulai, rentang.selesai);
    const tidakHadir = state.data.absensi.filter(a =>
      a.Nama === p.Nama && a.Tanggal && a.Tanggal.startsWith(prefix) &&
      a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai && !liburSet.has(a.Tanggal)
    ).length;
    const hadir = Math.max(workingDays - tidakHadir, 0);
    const pct = workingDays > 0 ? Math.round((hadir / workingDays) * 100) : 0;
    return { nama: p.Nama, pct };
  }).filter(Boolean).sort((a, b) => a.pct - b.pct);

  renderStatList("statAbsenList", results, state.statAbsenExpanded, "absen");
  document.getElementById("toggleStatAbsenBtn").textContent =
    state.statAbsenExpanded ? "Tampilkan Lebih Sedikit" : "Lihat Semua Pegawai";
}

// ============================================================
// STATISTIK APEL (Pagi & Siang terpisah)
// ============================================================
function populateStatApelBulanOptions() {
  const sel = document.getElementById("statApelBulan");
  const prevValue = sel.value;
  sel.innerHTML = "";
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const label = `${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
    sel.innerHTML += `<option value="${value}">${label}</option>`;
  }
  if (prevValue) sel.value = prevValue;

  if (!sel.dataset.bound) {
    sel.dataset.bound = "1";
    sel.addEventListener("change", () => loadDataForTab("statApel"));
    document.getElementById("toggleStatApelBtn").addEventListener("click", () => {
      state.statApelExpanded = !state.statApelExpanded;
      renderStatApel();
    });
    setupStatSearchInput("statApelSearch", renderStatApel);
  }
}

function renderStatApel() {
  const sel = document.getElementById("statApelBulan");
  if (!sel.value) return; // belum sempat terisi (jalur cache super awal)
  const [y, m] = sel.value.split("-").map(Number);
  const year = y, month = m - 1;

  const now = new Date();
  const isBulanBerjalan = (year === now.getFullYear() && month === now.getMonth());
  const jumlahHariBulan = new Date(year, month + 1, 0).getDate();
  const periodeMulai = `${year}-${pad2(month + 1)}-01`;
  const periodeSelesai = isBulanBerjalan
    ? `${year}-${pad2(month + 1)}-${pad2(now.getDate())}`
    : `${year}-${pad2(month + 1)}-${pad2(jumlahHariBulan)}`;

  const prefix = `${year}-${pad2(month + 1)}`;

  const results = state.data.pegawai
    .filter(pegawaiWajibApel) // 9 pegawai "WajibApel: Tidak" dikecualikan total dari sini
    .map(p => {
      // Pegawai rotasi/sementara: kecualikan total kalau belum/tidak lagi aktif bulan ini
      const rentang = hitungRentangAktifPegawai(p, periodeMulai, periodeSelesai);
      if (!rentang) return null;
      const workingDaysTotal = countWorkingDaysInRange(rentang.mulai, rentang.selesai);

      // Tanggal Sakit/Izin/Cuti/Alpa OTOMATIS terhitung sebagai "tidak ikut apel"
      // (baik Pagi maupun Siang) - jadi tidak perlu dicentang manual satu-satu,
      // dan ikut menurunkan persentase (bukan dikecualikan).
      const absenDates = new Set(
        state.data.absensi
          .filter(a => a.Nama === p.Nama && a.Tanggal && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai)
          .map(a => a.Tanggal)
      );

      const missedPagiDates = new Set(absenDates);
      state.data.apel
        .filter(a => a.Nama === p.Nama && a.Sesi === "Pagi" && a.Tanggal && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai)
        .forEach(a => missedPagiDates.add(a.Tanggal));

      const missedSiangDates = new Set(absenDates);
      state.data.apel
        .filter(a => a.Nama === p.Nama && a.Sesi === "Siang" && a.Tanggal && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai)
        .forEach(a => missedSiangDates.add(a.Tanggal));

      const pctPagi = workingDaysTotal > 0 ? Math.round(((workingDaysTotal - missedPagiDates.size) / workingDaysTotal) * 100) : 0;
      const pctSiang = workingDaysTotal > 0 ? Math.round(((workingDaysTotal - missedSiangDates.size) / workingDaysTotal) * 100) : 0;
      return { nama: p.Nama, pctPagi: Math.max(pctPagi, 0), pctSiang: Math.max(pctSiang, 0) };
    }).filter(Boolean).sort((a, b) => (a.pctPagi + a.pctSiang) - (b.pctPagi + b.pctSiang));

  const el = document.getElementById("statApelList");
  const filtered = applyNameSearchFilter(results, "statApelSearch");
  const shown = state.statApelExpanded ? filtered : filtered.slice(0, 10);
  el.innerHTML = shown.map(r => `
    <div class="stat-row apel-row clickable" data-nama="${r.nama}" data-pct-pagi="${r.pctPagi}" data-pct-siang="${r.pctSiang}">
      <div class="stat-name">${r.nama}</div>
      <div class="apel-badges">
        <span class="apel-badge">Pagi <b class="${getPctColorClass(r.pctPagi)}">${formatPctLabel(r.pctPagi)}</b></span>
        <span class="apel-badge">Siang <b class="${getPctColorClass(r.pctSiang)}">${formatPctLabel(r.pctSiang)}</b></span>
      </div>
    </div>
  `).join("");
  el.querySelectorAll(".stat-row").forEach(row => {
    row.addEventListener("click", () => openStatDetail(row.dataset.nama, "apel", {
      pctPagi: Number(row.dataset.pctPagi),
      pctSiang: Number(row.dataset.pctSiang)
    }));
  });

  document.getElementById("toggleStatApelBtn").textContent =
    state.statApelExpanded ? "Tampilkan Lebih Sedikit" : "Lihat Semua Pegawai";
}

// ============================================================
// STATISTIK KEGIATAN LUAR
// ============================================================
function setupStatKegiatanEvents() {
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  document.getElementById("statKegiatanDari").value = firstOfMonth;
  document.getElementById("statKegiatanSampai").value = todayStr;

  document.getElementById("statKegiatanDari").addEventListener("change", () => loadDataForTab("statKegiatan"));
  document.getElementById("statKegiatanSampai").addEventListener("change", () => loadDataForTab("statKegiatan"));
  document.getElementById("toggleStatKegiatanBtn").addEventListener("click", () => {
    state.statKegiatanExpanded = !state.statKegiatanExpanded;
    renderStatKegiatan();
  });
  setupStatSearchInput("statKegiatanSearch", renderStatKegiatan);
}

function countWorkingDaysInRange(dariKey, sampaiKey) {
  const liburSet = getLiburDatesSet();
  const [y1, m1, d1] = dariKey.split("-").map(Number);
  const [y2, m2, d2] = sampaiKey.split("-").map(Number);
  const start = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    if (CONFIG.HARI_KERJA.includes(d.getDay()) && !liburSet.has(key)) count++;
  }
  return count;
}

// Sama seperti countWorkingDaysInRange, tapi mengembalikan daftar tanggalnya (bukan cuma jumlahnya).
// Dipakai untuk menyusun kolom "Tanggal Ikut Apel" di rekap Excel.
function getWorkingDaysListInRange(dariKey, sampaiKey) {
  const liburSet = getLiburDatesSet();
  const [y1, m1, d1] = dariKey.split("-").map(Number);
  const [y2, m2, d2] = sampaiKey.split("-").map(Number);
  const start = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);
  const list = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    if (CONFIG.HARI_KERJA.includes(d.getDay()) && !liburSet.has(key)) list.push(key);
  }
  return list;
}

// ============================================================
// MASA AKTIF PEGAWAI (mendukung pegawai rotasi/sementara)
// Kolom TanggalMulai/TanggalSelesai di sheet Pegawai bersifat OPSIONAL -
// kalau kosong, dianggap sudah aktif sejak dulu / masih aktif terus
// (perilaku lama, tidak berubah untuk pegawai tetap).
// ============================================================
function hitungRentangAktifPegawai(pegawai, periodeMulai, periodeSelesai) {
  const mulai = pegawai.TanggalMulai && String(pegawai.TanggalMulai).trim()
    ? String(pegawai.TanggalMulai).trim() : periodeMulai;
  const selesai = pegawai.TanggalSelesai && String(pegawai.TanggalSelesai).trim()
    ? String(pegawai.TanggalSelesai).trim() : periodeSelesai;

  const efektifMulai = mulai > periodeMulai ? mulai : periodeMulai;
  const efektifSelesai = selesai < periodeSelesai ? selesai : periodeSelesai;

  if (efektifMulai > efektifSelesai) return null; // tidak aktif sama sekali di periode ini
  return { mulai: efektifMulai, selesai: efektifSelesai };
}

// Pegawai yang WajibApel diisi "Tidak" (tanpa memandang huruf besar/kecil)
// dikecualikan total dari Statistik Apel - tetap normal di statistik lain.
function pegawaiWajibApel(pegawai) {
  const nilai = (pegawai.WajibApel || "").toString().trim().toLowerCase();
  return nilai !== "tidak";
}

function renderStatKegiatan() {
  const dari = document.getElementById("statKegiatanDari").value;
  const sampai = document.getElementById("statKegiatanSampai").value;
  if (!dari || !sampai || dari > sampai) {
    document.getElementById("statKegiatanList").innerHTML =
      `<p class="empty-note">Pilih rentang tanggal yang valid (tanggal "Dari" tidak boleh setelah "Sampai").</p>`;
    return;
  }

  const results = state.data.pegawai.map(p => {
    const rentang = hitungRentangAktifPegawai(p, dari, sampai);
    if (!rentang) return null; // tidak aktif sama sekali di periode ini - kecualikan
    const workingDaysPegawai = countWorkingDaysInRange(rentang.mulai, rentang.selesai);

    const dates = new Set(
      state.data.kegiatanLuar
        .filter(k => k.Nama === p.Nama && k.Tanggal >= rentang.mulai && k.Tanggal <= rentang.selesai)
        .map(k => k.Tanggal)
    );
    const pct = workingDaysPegawai > 0 ? Math.round((dates.size / workingDaysPegawai) * 100) : 0;
    return { nama: p.Nama, pct };
  }).filter(Boolean).sort((a, b) => b.pct - a.pct);

  renderStatList("statKegiatanList", results, state.statKegiatanExpanded, "kegiatan");
  document.getElementById("toggleStatKegiatanBtn").textContent =
    state.statKegiatanExpanded ? "Tampilkan Lebih Sedikit" : "Lihat Semua Pegawai";
}

function renderStatList(containerId, results, expanded, type) {
  const el = document.getElementById(containerId);
  const searchInputId = type === "absen" ? "statAbsenSearch" : "statKegiatanSearch";
  const filtered = applyNameSearchFilter(results, searchInputId);
  const shown = expanded ? filtered : filtered.slice(0, 10);
  el.innerHTML = shown.map(r => {
    // Pewarnaan tingkat persentase HANYA untuk Statistik Kehadiran, bukan Kegiatan Luar
    const pctClass = type === "absen" ? getPctColorClass(r.pct) : "";
    const pctLabel = type === "absen" ? formatPctLabel(r.pct, 85) : `${r.pct}%`;
    return `
    <div class="stat-row clickable" data-nama="${r.nama}" data-pct="${r.pct}">
      <div class="stat-name">${r.nama}</div>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${r.pct}%"></div></div>
      <div class="stat-pct ${pctClass}">${pctLabel}</div>
    </div>
  `;
  }).join("");

  el.querySelectorAll(".stat-row").forEach(row => {
    row.addEventListener("click", () => openStatDetail(row.dataset.nama, type, { pct: Number(row.dataset.pct) }));
  });
}

// ============================================================
// DETAIL PER PEGAWAI (saat nama diklik di daftar statistik)
// ============================================================
function openStatDetail(nama, type, pctInfo) {
  document.getElementById("statDetailTitle").textContent = nama;
  const contentEl = document.getElementById("statDetailContent");
  const periodeEl = document.getElementById("statDetailPeriode");

  // Efek transisi beda-beda tergantung asal statistiknya:
  // Kehadiran = slide-up, Apel = flip, Kegiatan Luar = bounce.
  const detailBox = document.querySelector("#statDetailModal .modal-box");
  detailBox.classList.remove("effect-slideup", "effect-flip", "effect-bounce");
  const efekMap = { absen: "effect-slideup", apel: "effect-flip", kegiatan: "effect-bounce" };
  detailBox.classList.add(efekMap[type] || "effect-slideup");

  // Reaksi singkat (menangis kalau ada yang ≤50%, tepuk tangan kalau 100% penuh) -
  // hanya untuk Kehadiran & Apel, bukan Kegiatan Luar.
  if (pctInfo && type === "absen") {
    if (pctInfo.pct <= 85) triggerStatReaction("😢");
    else if (pctInfo.pct >= 100) triggerStatReaction("👏");
  } else if (pctInfo && type === "apel") {
    if (pctInfo.pctPagi <= 50 || pctInfo.pctSiang <= 50) triggerStatReaction("😢");
    else if (pctInfo.pctPagi >= 100 && pctInfo.pctSiang >= 100) triggerStatReaction("👏");
  }

  // Kartu identitas (NIP, Pangkat/Golongan, Jabatan) - khusus Kehadiran & Apel.
  // NIP hanya tampil saat Mode Admin aktif - pegawai lain tidak melihatnya.
  const identityEl = document.getElementById("statDetailIdentity");
  if (type === "absen" || type === "apel") {
    const pegawai = state.data.pegawai.find(p => p.Nama === nama);
    const nipRow = state.isAdmin
      ? `<div class="id-row"><span class="id-label">NIP</span><span class="id-value">${(pegawai && pegawai.NIP) || "-"}</span></div>`
      : "";
    identityEl.innerHTML = `
      <div class="pegawai-id-card">
        ${nipRow}
        <div class="id-row"><span class="id-label">Pangkat/Gol</span><span class="id-value">${(pegawai && pegawai.PangkatGolongan) || "-"}</span></div>
        <div class="id-row"><span class="id-label">Jabatan</span><span class="id-value">${(pegawai && pegawai.Jabatan) || "-"}</span></div>
      </div>
    `;
  } else {
    identityEl.innerHTML = "";
  }

  if (type === "absen") {
    const [y, m] = document.getElementById("statAbsenBulan").value.split("-").map(Number);
    const prefix = `${y}-${pad2(m)}`;
    periodeEl.textContent = `Periode: ${BULAN_ID[m - 1]} ${y}`;

    const catatan = state.data.absensi
      .filter(a => a.Nama === nama && a.Tanggal && a.Tanggal.startsWith(prefix))
      .sort((a, b) => a.Tanggal.localeCompare(b.Tanggal));

    if (catatan.length === 0) {
      contentEl.innerHTML = `<p class="empty-note">Tidak ada catatan tidak hadir pada bulan ini — hadir penuh.</p>`;
    } else {
      // Kelompokkan per status: "Sakit: tanggal 2, 4, 20"
      const byStatus = {};
      catatan.forEach(c => {
        const tgl = Number(c.Tanggal.split("-")[2]);
        if (!byStatus[c.Status]) byStatus[c.Status] = [];
        byStatus[c.Status].push(tgl);
      });
      contentEl.innerHTML = Object.keys(byStatus).map(status => {
        const statusInfo = CONFIG.STATUS_LIST.find(s => s.value === status) || { color: "#999" };
        return `<div class="modal-item">
          <span class="status-chip" style="background:${statusInfo.color}">${status}</span>
          <span class="item-title">Tanggal ${byStatus[status].join(", ")}</span>
        </div>`;
      }).join("");
    }
  } else if (type === "kegiatan") {
    const dari = document.getElementById("statKegiatanDari").value;
    const sampai = document.getElementById("statKegiatanSampai").value;
    periodeEl.textContent = `Periode: ${formatTanggalIndo(dari)} — ${formatTanggalIndo(sampai)}`;

    const catatan = state.data.kegiatanLuar
      .filter(k => k.Nama === nama && k.Tanggal >= dari && k.Tanggal <= sampai)
      .sort((a, b) => a.Tanggal.localeCompare(b.Tanggal));

    if (catatan.length === 0) {
      contentEl.innerHTML = `<p class="empty-note">Tidak ada kegiatan luar gedung tercatat pada periode ini.</p>`;
    } else {
      contentEl.innerHTML = catatan.map(c => {
        const warna = getActivityColor(c.NamaKegiatan || "");
        return `
        <div class="modal-item kegiatan-card" style="border-left-color:${warna}">
          <div class="item-title" style="color:${warna}">${c.NamaKegiatan || "(tanpa nama kegiatan)"}</div>
          <div class="item-sub">${formatTanggalIndo(c.Tanggal)} · 📍 ${c.Lokasi}${c.NoST ? `<span class="st-tag">No.ST: ${c.NoST}</span>` : ""}</div>
        </div>`;
      }).join("");
    }
  } else if (type === "apel") {
    const [y, m] = document.getElementById("statApelBulan").value.split("-").map(Number);
    const prefix = `${y}-${pad2(m)}`;
    periodeEl.textContent = `Periode: ${BULAN_ID[m - 1]} ${y}`;

    // Tanggal Sakit/Izin/Cuti/Alpa otomatis digabung (bukan cuma yang dicentang manual)
    const absenMap = {}; // { "2026-07-01": "Sakit", ... }
    state.data.absensi
      .filter(a => a.Nama === nama && a.Tanggal && a.Tanggal.startsWith(prefix))
      .forEach(a => { absenMap[a.Tanggal] = a.Status; });

    function gabungkanTanggal(sesi) {
      const set = new Set(Object.keys(absenMap));
      state.data.apel
        .filter(a => a.Nama === nama && a.Sesi === sesi && a.Tanggal && a.Tanggal.startsWith(prefix))
        .forEach(a => set.add(a.Tanggal));
      return Array.from(set).sort().map(tgl => {
        const tglNum = Number(tgl.split("-")[2]);
        return absenMap[tgl] ? `${tglNum} (${absenMap[tgl]})` : `${tglNum}`;
      });
    }

    const missedPagi = gabungkanTanggal("Pagi");
    const missedSiang = gabungkanTanggal("Siang");

    contentEl.innerHTML = `
      <div class="modal-item">
        <div class="item-title">🌅 Tidak Ikut Apel Pagi</div>
        <div class="item-sub">${missedPagi.length ? "Tanggal " + missedPagi.join(", ") : "Tidak ada — ikut penuh bulan ini."}</div>
      </div>
      <div class="modal-item">
        <div class="item-title">🌇 Tidak Ikut Apel Siang</div>
        <div class="item-sub">${missedSiang.length ? "Tanggal " + missedSiang.join(", ") : "Tidak ada — ikut penuh bulan ini."}</div>
      </div>
    `;
  }

  showModal("statDetailModal");
}

function formatTanggalIndo(tglKey) {
  if (!tglKey) return "-";
  const [y, m, d] = tglKey.split("-").map(Number);
  return `${d} ${BULAN_ID[m - 1]} ${y}`;
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

// hook stat kegiatan events once DOM ready
document.addEventListener("DOMContentLoaded", setupStatKegiatanEvents);

// ============================================================
// EXPORT EXCEL
// ============================================================
let exportJenisTerpilih = null; // "absen" | "apel" | "kegiatan"

function setupExportMenu() {
  document.getElementById("exportToggleBtn").addEventListener("click", () => {
    document.getElementById("exportChoices").classList.toggle("hidden");
  });

  document.querySelectorAll(".export-choice-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      exportJenisTerpilih = btn.dataset.jenis;
      document.getElementById("exportChoices").classList.add("hidden");

      const now = new Date();
      const firstOfMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
      const todayStr = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
      document.getElementById("exportDari").value = firstOfMonth;
      document.getElementById("exportSampai").value = todayStr;

      const judulMap = { absen: "Unduh Rekap Kehadiran", apel: "Unduh Rekap Apel", kegiatan: "Unduh Rekap Kegiatan Luar" };
      document.getElementById("exportModalTitle").textContent = judulMap[exportJenisTerpilih];
      updateExportSummary();
      showModal("exportDateModal");
    });
  });

  document.getElementById("exportDari").addEventListener("change", updateExportSummary);
  document.getElementById("exportSampai").addEventListener("change", updateExportSummary);

  document.getElementById("exportDownloadBtn").addEventListener("click", async () => {
    const dari = document.getElementById("exportDari").value;
    const sampai = document.getElementById("exportSampai").value;
    if (!dari || !sampai || dari > sampai) {
      showToast("Pilih rentang tanggal yang valid dulu.", true);
      return;
    }
    const btn = document.getElementById("exportDownloadBtn");
    const teksAsli = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Menyiapkan data...";
    try {
      // Pastikan semua bulan dalam rentang yang diminta sudah dimuat lengkap -
      // rentang laporan bisa mencakup bulan-bulan yang belum pernah dibuka user
      // di kalender/statistik, jadi datanya belum tentu sudah ada di state.data.
      await ensureMonthsLoaded(monthKeysInRange(dari, sampai));
      btn.textContent = "Membuat file...";
      if (exportJenisTerpilih === "absen") await exportKehadiranExcel(dari, sampai);
      else if (exportJenisTerpilih === "apel") await exportApelExcel(dari, sampai);
      else if (exportJenisTerpilih === "kegiatan") await exportKegiatanExcel(dari, sampai);
      hideModal("exportDateModal");
      showToast("Rekap berhasil diunduh.");
    } catch (err) {
      showToast("Gagal membuat file Excel: " + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = teksAsli;
    }
  });
}

function updateExportSummary() {
  const dari = document.getElementById("exportDari").value;
  const sampai = document.getElementById("exportSampai").value;
  const el = document.getElementById("exportSummary");
  if (!dari || !sampai) { el.textContent = ""; return; }
  if (sampai < dari) { el.textContent = "Tanggal selesai tidak boleh sebelum tanggal mulai."; return; }
  el.textContent = judulPeriode(dari, sampai);
}

// "BULAN: JULI 2026" kalau rentangnya pas 1 bulan penuh, atau "PERIODE: ..." kalau custom
function judulPeriode(dari, sampai) {
  const [y1, m1, d1] = dari.split("-").map(Number);
  const [y2, m2, d2] = sampai.split("-").map(Number);
  const lastDayBulan1 = new Date(y1, m1, 0).getDate();
  const isSatuBulanPenuh = (d1 === 1 && y1 === y2 && m1 === m2 && d2 === lastDayBulan1);
  if (isSatuBulanPenuh) return `BULAN: ${BULAN_ID[m1 - 1].toUpperCase()} ${y1}`;
  if (y1 === y2 && m1 === m2) return `PERIODE: ${d1}-${d2} ${BULAN_ID[m1 - 1].toUpperCase()} ${y1}`;
  return `PERIODE: ${d1} ${BULAN_ID[m1 - 1].toUpperCase()} ${y1} - ${d2} ${BULAN_ID[m2 - 1].toUpperCase()} ${y2}`;
}

async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setupJudulSheet(sheet, judulUtama, kolomTerakhir) {
  sheet.mergeCells(1, 1, 1, kolomTerakhir);
  sheet.getCell(1, 1).value = judulUtama;
  sheet.mergeCells(2, 1, 2, kolomTerakhir);
  sheet.getCell(2, 1).value = CONFIG.NAMA_INSTANSI_BARIS2.toUpperCase();
  sheet.mergeCells(3, 1, 3, kolomTerakhir);
  [1, 2, 3].forEach(r => {
    const cell = sheet.getCell(r, 1);
    cell.font = { bold: true, size: r === 1 ? 14 : 12 };
    cell.alignment = { horizontal: "center" };
  });
}

function styleHeaderRow(row) {
  row.eachCell(cell => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  });
}

function beriGarisTabel(sheet, dariBaris, sampaiBaris, jumlahKolom) {
  for (let r = dariBaris; r <= sampaiBaris; r++) {
    for (let c = 1; c <= jumlahKolom; c++) {
      sheet.getCell(r, c).border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    }
  }
}

// ---------------- REKAP KEHADIRAN ----------------
async function exportKehadiranExcel(dari, sampai) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Rekap Kehadiran");
  const kolom = ["No", "Nama", "NIP", "Hadir", "Persentase Kehadiran", "Sakit", "Ijin", "Cuti", "Tanpa Berita", "Keterangan (Tanggal)"];
  sheet.columns = [6, 30, 20, 8, 12, 8, 8, 8, 12, 40].map(w => ({ width: w }));

  setupJudulSheet(sheet, "REKAPAN DAFTAR HADIR", kolom.length);
  sheet.mergeCells(4, 1, 4, kolom.length);
  sheet.getCell(4, 1).value = judulPeriode(dari, sampai);
  sheet.getCell(4, 1).font = { bold: true };
  sheet.getCell(4, 1).alignment = { horizontal: "center" };

  sheet.getCell(5, 1).value = "JUMLAH HARI KERJA";
  sheet.getCell(5, 1).font = { bold: true };
  sheet.getCell(5, 2).value = countWorkingDaysInRange(dari, sampai);
  sheet.getCell(5, 2).font = { bold: true };

  const headerRowIdx = 7;
  const headerRow = sheet.getRow(headerRowIdx);
  kolom.forEach((k, i) => { headerRow.getCell(i + 1).value = k; });
  styleHeaderRow(headerRow);

  let baris = headerRowIdx + 1;
  let no = 1;
  state.data.pegawai.forEach(p => {
    const rentang = hitungRentangAktifPegawai(p, dari, sampai);
    if (!rentang) return; // pegawai belum/tidak lagi aktif di periode ini - lewati
    const workingDays = countWorkingDaysInRange(rentang.mulai, rentang.selesai);
    const catatan = state.data.absensi.filter(a =>
      a.Nama === p.Nama && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai
    );
    const sakit = catatan.filter(a => a.Status === "Sakit");
    const ijin = catatan.filter(a => a.Status === "Izin");
    const cuti = catatan.filter(a => a.Status === "Cuti");
    const alpa = catatan.filter(a => a.Status === "Alpa/Tanpa Keterangan");
    const hadir = Math.max(workingDays - catatan.length, 0);
    const pct = workingDays > 0 ? Math.round((hadir / workingDays) * 100) : 0;

    const ket = [];
    if (sakit.length) ket.push(`sakit tgl ${sakit.map(a => Number(a.Tanggal.split("-")[2])).join(",")}`);
    if (ijin.length) ket.push(`ijin tgl ${ijin.map(a => Number(a.Tanggal.split("-")[2])).join(",")}`);
    if (cuti.length) ket.push(`cuti tgl ${cuti.map(a => Number(a.Tanggal.split("-")[2])).join(",")}`);
    if (alpa.length) ket.push(`tanpa berita tgl ${alpa.map(a => Number(a.Tanggal.split("-")[2])).join(",")}`);

    const row = sheet.getRow(baris);
    row.getCell(1).value = no++;
    row.getCell(2).value = p.Nama;
    row.getCell(3).value = p.NIP || "-";
    row.getCell(4).value = hadir;
    row.getCell(5).value = `${pct}%`;
    row.getCell(6).value = sakit.length || "";
    row.getCell(7).value = ijin.length || "";
    row.getCell(8).value = cuti.length || "";
    row.getCell(9).value = alpa.length || "";
    row.getCell(10).value = ket.join("\n");
    row.getCell(10).alignment = { wrapText: true, vertical: "top" };
    row.eachCell(c => { c.alignment = c.alignment || { vertical: "middle" }; });
    baris++;
  });

  beriGarisTabel(sheet, headerRowIdx, baris - 1, kolom.length);
  await downloadWorkbook(workbook, `Rekap_Kehadiran_${dari}_sd_${sampai}.xlsx`);
}

// ---------------- REKAP APEL ----------------
async function exportApelExcel(dari, sampai) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Rekap Apel");
  const kolom = [
    "No", "Nama",
    "Ikut Apel Pagi", "% Pagi", "Tanggal Ikut Apel Pagi", "Tanggal Tidak Ikut Apel Pagi",
    "Ikut Apel Siang", "% Siang", "Tanggal Ikut Apel Siang", "Tanggal Tidak Ikut Apel Siang"
  ];
  sheet.columns = [6, 26, 10, 8, 26, 26, 10, 8, 26, 26].map(w => ({ width: w }));

  setupJudulSheet(sheet, "REKAPAN APEL PAGI & SIANG", kolom.length);
  sheet.mergeCells(4, 1, 4, kolom.length);
  sheet.getCell(4, 1).value = judulPeriode(dari, sampai);
  sheet.getCell(4, 1).font = { bold: true };
  sheet.getCell(4, 1).alignment = { horizontal: "center" };

  const headerRowIdx = 6;
  const headerRow = sheet.getRow(headerRowIdx);
  kolom.forEach((k, i) => { headerRow.getCell(i + 1).value = k; });
  styleHeaderRow(headerRow);

  let baris = headerRowIdx + 1;
  let no = 1;
  state.data.pegawai.filter(pegawaiWajibApel).forEach(p => {
    const rentang = hitungRentangAktifPegawai(p, dari, sampai);
    if (!rentang) return;
    const workingDays = countWorkingDaysInRange(rentang.mulai, rentang.selesai);
    const workingDaysList = getWorkingDaysListInRange(rentang.mulai, rentang.selesai);

    const absenDates = new Set(
      state.data.absensi.filter(a => a.Nama === p.Nama && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai).map(a => a.Tanggal)
    );
    const missedPagi = new Set(absenDates);
    state.data.apel.filter(a => a.Nama === p.Nama && a.Sesi === "Pagi" && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai)
      .forEach(a => missedPagi.add(a.Tanggal));
    const missedSiang = new Set(absenDates);
    state.data.apel.filter(a => a.Nama === p.Nama && a.Sesi === "Siang" && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai)
      .forEach(a => missedSiang.add(a.Tanggal));

    const ikutPagiDates = workingDaysList.filter(t => !missedPagi.has(t));
    const ikutSiangDates = workingDaysList.filter(t => !missedSiang.has(t));
    const ikutPagi = ikutPagiDates.length;
    const ikutSiang = ikutSiangDates.length;
    const pctPagi = workingDays > 0 ? Math.round((ikutPagi / workingDays) * 100) : 0;
    const pctSiang = workingDays > 0 ? Math.round((ikutSiang / workingDays) * 100) : 0;

    const fmtTgl = (arr) => arr.length ? arr.map(t => Number(t.split("-")[2])).join(",") : "-";

    const row = sheet.getRow(baris);
    row.getCell(1).value = no++;
    row.getCell(2).value = p.Nama;
    row.getCell(3).value = ikutPagi;
    row.getCell(4).value = `${pctPagi}%`;
    row.getCell(5).value = fmtTgl(ikutPagiDates);
    row.getCell(6).value = fmtTgl(Array.from(missedPagi).sort());
    row.getCell(7).value = ikutSiang;
    row.getCell(8).value = `${pctSiang}%`;
    row.getCell(9).value = fmtTgl(ikutSiangDates);
    row.getCell(10).value = fmtTgl(Array.from(missedSiang).sort());
    [5, 6, 9, 10].forEach(c => { row.getCell(c).alignment = { wrapText: true, vertical: "top" }; });
    baris++;
  });

  beriGarisTabel(sheet, headerRowIdx, baris - 1, kolom.length);
  await downloadWorkbook(workbook, `Rekap_Apel_${dari}_sd_${sampai}.xlsx`);
}

// ---------------- REKAP KEGIATAN LUAR ----------------
async function exportKegiatanExcel(dari, sampai) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Rekap Kegiatan Luar");
  const kolom = ["No Urut", "Nomor Surat", "Tanggal", "Kegiatan", "Lokasi", "Nama Petugas"];
  sheet.columns = [8, 14, 12, 28, 22, 30].map(w => ({ width: w }));

  setupJudulSheet(sheet, "REKAPAN KEGIATAN LUAR GEDUNG", kolom.length);
  sheet.mergeCells(4, 1, 4, kolom.length);
  sheet.getCell(4, 1).value = judulPeriode(dari, sampai);
  sheet.getCell(4, 1).font = { bold: true };
  sheet.getCell(4, 1).alignment = { horizontal: "center" };

  const headerRowIdx = 6;
  const headerRow = sheet.getRow(headerRowIdx);
  kolom.forEach((k, i) => { headerRow.getCell(i + 1).value = k; });
  styleHeaderRow(headerRow);

  // Kelompokkan baris-baris dengan No ST + Nama Kegiatan + Lokasi + Tanggal
  // yang sama jadi 1 baris (sama seperti kartu kegiatan di kalender)
  const groups = {};
  state.data.kegiatanLuar
    .filter(k => k.Tanggal >= dari && k.Tanggal <= sampai)
    .forEach(k => {
      const key = `${k.NoST || ""}|${k.Tanggal}|${k.NamaKegiatan || ""}|${k.Lokasi || ""}`;
      if (!groups[key]) groups[key] = { info: k, nama: [] };
      groups[key].nama.push(k.Nama);
    });

  const daftar = Object.values(groups).sort((a, b) => a.info.Tanggal.localeCompare(b.info.Tanggal));

  let baris = headerRowIdx + 1;
  let no = 1;
  daftar.forEach(g => {
    const row = sheet.getRow(baris);
    row.getCell(1).value = no++;
    row.getCell(2).value = g.info.NoST || "-";
    row.getCell(3).value = formatTanggalIndo(g.info.Tanggal);
    row.getCell(4).value = g.info.NamaKegiatan || "-";
    row.getCell(5).value = g.info.Lokasi || "-";
    row.getCell(6).value = g.nama.join("\n");
    row.getCell(6).alignment = { wrapText: true, vertical: "top" };
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
    baris++;
  });

  beriGarisTabel(sheet, headerRowIdx, baris - 1, kolom.length);
  await downloadWorkbook(workbook, `Rekap_Kegiatan_Luar_${dari}_sd_${sampai}.xlsx`);
}

