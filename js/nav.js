// ============================================================
// NAVIGASI UTAMA — Beranda / Cari / Statistik / Admin
// ============================================================
// Menggantikan baris tombol lama (Kalender-Statistik Kehadiran-Apel-
// Kegiatan Luar sejajar + tombol Mode Admin) dengan 4 tab. Di HP jadi
// bottom navigation bar tetap; di laptop jadi baris terpisah di bawah
// kop (lihat CSS untuk switch responsifnya - markup-nya sama, cuma
// CSS media query yang beda).
const STAT_TAB_ORDER = ["statAbsen", "statApel", "statKegiatan"];
const DESKTOP_NAV_BREAKPOINT = 768;

// Menampilkan satu tab-panel, menyembunyikan lainnya, dan menyorot tombol
// nav utama kelompok yang sesuai (Beranda/Cari/Statistik). Admin tidak
// punya tab-panel sendiri (cuma aksi lewat submenu), jadi tidak disorot
// dari sini.
function showTabPanel(tabName) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  const panel = document.getElementById("tab-" + tabName);
  if (panel) panel.classList.add("active");
  state.activeTab = tabName;

  const kelompok = tabName === "kalender" ? "beranda"
    : tabName === "cari" ? "cari"
    : STAT_TAB_ORDER.includes(tabName) ? "statistik"
    : null;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  if (kelompok) {
    const btn = document.querySelector(`.nav-btn[data-nav="${kelompok}"]`);
    if (btn) btn.classList.add("active");
  }
}

// Pindah tab SEKALIGUS memastikan data yang dibutuhkan tab itu sudah ada
// (pakai loadDataForTab yang sudah ada di core.js - tidak diubah).
async function goToTab(tabName) {
  showTabPanel(tabName);
  await loadDataForTab(tabName);
}

// ============================================================
// SUBMENU MENGAMBANG (Statistik & Admin)
// ============================================================
// Di HP posisinya tetap (CSS: nempel di atas bottom nav bar, lebar penuh).
// Di laptop posisinya dihitung JS supaya nempel persis di bawah tombol
// pemicunya (Statistik atau Admin), bukan di tengah/lebar penuh.
function positionSubmenuUnderButton(submenuEl, btnEl) {
  if (window.innerWidth <= DESKTOP_NAV_BREAKPOINT) {
    submenuEl.style.top = "";
    submenuEl.style.left = "";
    return; // mobile pakai posisi tetap dari CSS
  }
  const rect = btnEl.getBoundingClientRect();
  submenuEl.style.top = `${rect.bottom + 8}px`;
  submenuEl.style.left = `${rect.left}px`;
}

function isNavSubmenuOpen(el) { return el.classList.contains("open"); }

function openNavSubmenu(el, btnEl) {
  document.querySelectorAll(".nav-submenu.open").forEach(s => { if (s !== el) closeNavSubmenu(s); });
  positionSubmenuUnderButton(el, btnEl);
  el.classList.add("open");
  btnEl.classList.add("submenu-open");
}
function closeNavSubmenu(el) {
  el.classList.remove("open");
  document.querySelectorAll(".nav-btn.submenu-open").forEach(b => b.classList.remove("submenu-open"));
}
function closeAllNavSubmenus() {
  document.querySelectorAll(".nav-submenu.open").forEach(closeNavSubmenu);
}

function setupMainNav() {
  const berandaBtn = document.getElementById("navBerandaBtn");
  const cariBtn = document.getElementById("navCariBtn");
  const statistikBtn = document.getElementById("navStatistikBtn");
  const adminBtn = document.getElementById("navAdminBtn");
  const statistikSubmenu = document.getElementById("statistikSubmenu");
  const adminSubmenu = document.getElementById("adminSubmenu");

  berandaBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    closeAllNavSubmenus();
    await goToTab("kalender");
  });
  cariBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    closeAllNavSubmenus();
    await goToTab("cari");
    document.getElementById("cariInput").focus();
  });
  statistikBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isNavSubmenuOpen(statistikSubmenu)) closeNavSubmenu(statistikSubmenu);
    else openNavSubmenu(statistikSubmenu, statistikBtn);
  });
  adminBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Belum login -> perilaku SAMA seperti sebelumnya: langsung munculkan
    // prompt PIN, submenu Admin tidak pernah dibuka untuk pengunjung biasa.
    if (!state.isAdmin) {
      closeAllNavSubmenus();
      showModal("pinModal");
      return;
    }
    if (isNavSubmenuOpen(adminSubmenu)) closeNavSubmenu(adminSubmenu);
    else openNavSubmenu(adminSubmenu, adminBtn);
  });

  document.querySelectorAll("#statistikSubmenu .submenu-item").forEach(btn => {
    btn.addEventListener("click", async () => {
      closeNavSubmenu(statistikSubmenu);
      await goToTab(btn.dataset.statTarget);
    });
  });

  // rangeAbsenBtn: listener utamanya (buka form) sudah dipasang di
  // setupRangeAbsenForm() (forms.js, tidak berubah) - di sini cuma
  // tambahan supaya submenu Admin ikut tertutup setelah diklik.
  document.getElementById("rangeAbsenBtn").addEventListener("click", () => {
    closeNavSubmenu(adminSubmenu);
  });
  document.getElementById("adminLogoutBtn").addEventListener("click", () => {
    closeNavSubmenu(adminSubmenu);
    logoutAdmin(); // didefinisikan di forms.js
  });

  // Klik di luar submenu (dan bukan tombol pemicunya sendiri) -> tutup.
  document.addEventListener("click", (e) => {
    if (isNavSubmenuOpen(statistikSubmenu) && !statistikSubmenu.contains(e.target) && !statistikBtn.contains(e.target)) {
      closeNavSubmenu(statistikSubmenu);
    }
    if (isNavSubmenuOpen(adminSubmenu) && !adminSubmenu.contains(e.target) && !adminBtn.contains(e.target)) {
      closeNavSubmenu(adminSubmenu);
    }
  });

  // Kalau layar di-resize (mis. putar HP, atau geser jendela browser laptop)
  // selagi submenu terbuka, hitung ulang posisinya supaya tetap nempel benar.
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (isNavSubmenuOpen(statistikSubmenu)) positionSubmenuUnderButton(statistikSubmenu, statistikBtn);
      if (isNavSubmenuOpen(adminSubmenu)) positionSubmenuUnderButton(adminSubmenu, adminBtn);
    }, 150);
  });

  setupStatSwipeGesture();
}

// ============================================================
// SWIPE GESTURE antar 3 tampilan Statistik
// ============================================================
// Swipe KANAN = maju (kehadiran -> apel -> kegiatan luar -> kehadiran, muter).
// Swipe KIRI = mundur (urutan kebalikannya). Berlaku bergantian di antara
// ketiganya, bukan cuma sepasang.
function setupStatSwipeGesture() {
  let touchStartX = null;
  let touchStartY = null;

  STAT_TAB_ORDER.forEach(tabName => {
    const panel = document.getElementById("tab-" + tabName);
    if (!panel) return;

    panel.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    panel.addEventListener("touchend", async (e) => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      touchStartX = null;
      touchStartY = null;

      // Abaikan kalau gerakannya kependekan atau lebih vertikal daripada
      // horizontal (itu scroll biasa, bukan swipe ganti tampilan).
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;

      const idx = STAT_TAB_ORDER.indexOf(tabName);
      const nextIdx = dx > 0
        ? (idx + 1) % STAT_TAB_ORDER.length
        : (idx - 1 + STAT_TAB_ORDER.length) % STAT_TAB_ORDER.length;
      await goToTab(STAT_TAB_ORDER[nextIdx]);
    }, { passive: true });
  });
}

// ============================================================
// PENCARIAN CEPAT LINTAS DATA (tab "Cari")
// ============================================================
function setupSearch() {
  document.getElementById("cariInput").addEventListener("input", renderCariResults);
}

function renderCariResults() {
  const q = document.getElementById("cariInput").value.trim().toLowerCase();
  const el = document.getElementById("cariResultList");

  if (!q) {
    el.innerHTML = `<p class="empty-note">Ketik nama pegawai untuk mencari.</p>`;
    return;
  }
  const hasil = state.data.pegawai.filter(p => p.Nama && p.Nama.toLowerCase().includes(q));
  if (!hasil.length) {
    el.innerHTML = `<p class="empty-note">Tidak ditemukan pegawai dengan nama itu.</p>`;
    return;
  }
  el.innerHTML = hasil.map(p => `
    <div class="cari-row clickable" data-nama="${escapeHtml(p.Nama)}">
      <div class="stat-name">${escapeHtml(p.Nama)}</div>
      <div class="cari-row-chevron">›</div>
    </div>
  `).join("");
  el.querySelectorAll(".cari-row").forEach(row => {
    row.addEventListener("click", () => openProfilRingkas(row.dataset.nama));
  });
}

// ============================================================
// PROFIL RINGKAS PEGAWAI (kartu riwayat, dibuka dari hasil pencarian)
// ============================================================
const profilState = { nama: null, mode: "bulanan", year: null, month: null };

function openProfilRingkas(nama) {
  const pegawai = state.data.pegawai.find(p => p.Nama === nama);
  profilState.nama = nama;
  profilState.mode = "bulanan";
  const now = new Date();
  profilState.year = now.getFullYear();
  profilState.month = now.getMonth();

  document.getElementById("profilNama").textContent = nama;

  // NIP cuma tampil untuk admin - sama seperti kartu identitas di Statistik.
  const nipRow = state.isAdmin
    ? `<div class="id-row"><span class="id-label">NIP</span><span class="id-value">${escapeHtml((pegawai && pegawai.NIP) || "-")}</span></div>`
    : "";
  document.getElementById("profilIdentity").innerHTML = `
    ${nipRow}
    <div class="id-row"><span class="id-label">Pangkat/Gol</span><span class="id-value">${escapeHtml((pegawai && pegawai.PangkatGolongan) || "-")}</span></div>
    <div class="id-row"><span class="id-label">Jabatan</span><span class="id-value">${escapeHtml((pegawai && pegawai.Jabatan) || "-")}</span></div>
  `;

  document.querySelectorAll(".profil-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === "bulanan"));
  document.getElementById("profilPeriodeBulanan").classList.remove("hidden");
  document.getElementById("profilPeriodeTahunan").classList.add("hidden");

  populateProfilTahunSelect();
  refreshProfilRingkas();
  showModal("profilModal");
}

function populateProfilTahunSelect() {
  const sel = document.getElementById("profilTahunSelect");
  const now = new Date();
  sel.innerHTML = "";
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) {
    sel.innerHTML += `<option value="${y}">${y}</option>`;
  }
  sel.value = profilState.year;
}

async function refreshProfilRingkas() {
  const grid = document.getElementById("profilStatsGrid");
  grid.innerHTML = `<p class="empty-note">Memuat data...</p>`;

  let mulai, selesai;
  if (profilState.mode === "bulanan") {
    mulai = `${profilState.year}-${pad2(profilState.month + 1)}-01`;
    const lastDay = new Date(profilState.year, profilState.month + 1, 0).getDate();
    selesai = `${profilState.year}-${pad2(profilState.month + 1)}-${pad2(lastDay)}`;
    document.getElementById("profilBulanLabel").textContent = `${BULAN_ID[profilState.month]} ${profilState.year}`;
    await ensureMonthsLoaded([`${profilState.year}-${pad2(profilState.month + 1)}`]);
  } else {
    mulai = `${profilState.year}-01-01`;
    selesai = `${profilState.year}-12-31`;
    await ensureMonthsLoaded(monthKeysInRange(mulai, selesai));
  }

  const nama = profilState.nama;
  const pegawai = state.data.pegawai.find(p => p.Nama === nama);
  const rentang = pegawai ? hitungRentangAktifPegawai(pegawai, mulai, selesai) : null;

  if (!rentang) {
    grid.innerHTML = `<p class="empty-note">Pegawai belum/tidak aktif pada periode ini.</p>`;
    return;
  }

  const catatan = state.data.absensi.filter(a => a.Nama === nama && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai);
  const sakit = catatan.filter(a => a.Status === "Sakit").length;
  const izin = catatan.filter(a => a.Status === "Izin").length;
  const cuti = catatan.filter(a => a.Status === "Cuti").length;
  const alpa = catatan.filter(a => a.Status === "Alpa/Tanpa Keterangan").length;

  const workingDays = countWorkingDaysInRange(rentang.mulai, rentang.selesai);
  const hadir = Math.max(workingDays - catatan.length, 0);

  const kegiatanDates = new Set(
    state.data.kegiatanLuar
      .filter(k => k.Nama === nama && k.Tanggal >= rentang.mulai && k.Tanggal <= rentang.selesai)
      .map(k => k.Tanggal)
  );

  grid.innerHTML = `
    <div class="profil-stat-card"><div class="profil-stat-num">${hadir}</div><div class="profil-stat-label">Hari Hadir</div></div>
    <div class="profil-stat-card"><div class="profil-stat-num">${sakit}</div><div class="profil-stat-label">Sakit</div></div>
    <div class="profil-stat-card"><div class="profil-stat-num">${izin}</div><div class="profil-stat-label">Izin</div></div>
    <div class="profil-stat-card"><div class="profil-stat-num">${cuti}</div><div class="profil-stat-label">Cuti</div></div>
    <div class="profil-stat-card"><div class="profil-stat-num">${alpa}</div><div class="profil-stat-label">Tanpa Keterangan</div></div>
    <div class="profil-stat-card"><div class="profil-stat-num">${kegiatanDates.size}</div><div class="profil-stat-label">Kegiatan Luar</div></div>
  `;
}

function setupProfilModal() {
  document.querySelectorAll(".profil-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      profilState.mode = btn.dataset.mode;
      document.querySelectorAll(".profil-mode-btn").forEach(b => b.classList.toggle("active", b === btn));
      document.getElementById("profilPeriodeBulanan").classList.toggle("hidden", profilState.mode !== "bulanan");
      document.getElementById("profilPeriodeTahunan").classList.toggle("hidden", profilState.mode !== "tahunan");
      refreshProfilRingkas();
    });
  });

  document.getElementById("profilPrevBulan").addEventListener("click", () => {
    profilState.month--;
    if (profilState.month < 0) { profilState.month = 11; profilState.year--; }
    refreshProfilRingkas();
  });
  document.getElementById("profilNextBulan").addEventListener("click", () => {
    profilState.month++;
    if (profilState.month > 11) { profilState.month = 0; profilState.year++; }
    refreshProfilRingkas();
  });
  document.getElementById("profilTahunSelect").addEventListener("change", (e) => {
    profilState.year = Number(e.target.value);
    refreshProfilRingkas();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupMainNav();
  setupSearch();
  setupProfilModal();
});
