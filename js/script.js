// ============================================================
// STATE
// ============================================================
const state = {
  data: { pegawai: [], absensi: [], kegiatanLuar: [], libur: [] },
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth(), // 0-11
  isAdmin: false,
  selectedDate: null,
  statAbsenExpanded: false,
  statKegiatanExpanded: false
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
document.addEventListener("DOMContentLoaded", () => {
  applySocialLinks();
  setupTabs();
  setupCalendarNav();
  setupModals();
  setupAdmin();
  loadData();
});

async function loadData() {
  try {
    const res = await fetch(`${CONFIG.API_URL}?action=data&_ts=${Date.now()}`, { cache: "no-store" });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    state.data = json;
    renderCalendar();
    populateEmployeeSelects();
    populateStatAbsenBulanOptions();
    renderStatAbsen();
    renderStatKegiatan();
  } catch (err) {
    showToast("Gagal memuat data. Periksa koneksi atau URL API. (" + err.message + ")", true);
  }
}

// ============================================================
// TABS
// ============================================================
function setupTabs() {
  document.querySelectorAll(".tab-btn[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn[data-tab]").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });
}

// ============================================================
// SOCIAL MENU
// ============================================================
function applySocialLinks() {
  document.getElementById("socialWa").href = CONFIG.SOSMED.whatsapp;
  document.getElementById("socialFb").href = CONFIG.SOSMED.facebook;
  document.getElementById("socialIg").href = CONFIG.SOSMED.instagram;
  document.getElementById("socialTiktok").href = CONFIG.SOSMED.tiktok;

  document.getElementById("socialToggleBtn").addEventListener("click", () => {
    document.getElementById("socialLinks").classList.toggle("hidden");
  });
}

// ============================================================
// CALENDAR
// ============================================================
function setupCalendarNav() {
  document.getElementById("prevMonthBtn").addEventListener("click", () => {
    state.currentMonth--;
    if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
    renderCalendar();
  });
  document.getElementById("nextMonthBtn").addEventListener("click", () => {
    state.currentMonth++;
    if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
    renderCalendar();
  });
}

function pad2(n) { return String(n).padStart(2, "0"); }
function dateKey(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

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

  showModal("dateModal");
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
}

function showModal(id) { document.getElementById(id).classList.remove("hidden"); }
function hideModal(id) { document.getElementById(id).classList.add("hidden"); }

function populateEmployeeSelects() {
  const names = state.data.pegawai.map(p => p.Nama).sort();

  const absenSel = document.getElementById("absenNama");
  absenSel.innerHTML = `<option value="">-- Pilih Pegawai --</option>` +
    names.map(n => `<option value="${n}">${n}</option>`).join("");

  const kegiatanSel = document.getElementById("kegiatanNama");
  kegiatanSel.innerHTML = `<option value="">-- Pilih Pegawai --</option>` +
    names.map(n => `<option value="${n}">${n}</option>`).join("");

  const rangeSel = document.getElementById("rangeNama");
  rangeSel.innerHTML = `<option value="">-- Pilih Pegawai --</option>` +
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
  const previouslyChecked = getSelectedKegiatanNames();
  const filtered = filterText ? names.filter(n => n.toLowerCase().includes(filterText)) : names;

  if (filtered.length === 0) {
    box.innerHTML = `<div class="checkbox-row no-match">Nama tidak ditemukan.</div>`;
    return;
  }

  box.innerHTML = filtered.map(n => `
    <label class="checkbox-row">
      <input type="checkbox" value="${n}" ${previouslyChecked.has(n) ? "checked" : ""}>
      <span>${n}</span>
    </label>
  `).join("");

  box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("change", updateKegiatanNamaCount);
  });
  updateKegiatanNamaCount();
}

function getSelectedKegiatanNames() {
  const box = document.getElementById("kegiatanNamaCheckboxList");
  if (!box) return new Set();
  return new Set(
    Array.from(box.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value)
  );
}

function updateKegiatanNamaCount() {
  const countEl = document.getElementById("kegiatanNamaCount");
  if (!countEl) return;
  const count = getSelectedKegiatanNames().size;
  countEl.textContent = `${count} pegawai dipilih`;
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
  const row = document.getElementById("absenRow").value;
  const payload = {
    Tanggal: state.selectedDate,
    Nama: document.getElementById("absenNama").value,
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
    const names = state.data.pegawai.map(p => p.Nama).sort();
    document.getElementById("kegiatanNamaSearch").value = "";
    renderKegiatanChecklist(names, "");
    document.querySelectorAll("#kegiatanNamaCheckboxList input[type=checkbox]").forEach(cb => cb.checked = false);
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
async function sendAction(action, data) {
  const pin = sessionStorage.getItem("adminPin");
  if (!pin) { showToast("Sesi admin berakhir, silakan masuk ulang.", true); return; }
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, pin, data })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Gagal menyimpan.");
    state.data = json.data;
    renderCalendar();
    if (state.selectedDate) openDateModal(state.selectedDate);
    renderStatAbsen();
    renderStatKegiatan();
    showToast("Data berhasil disimpan.");
  } catch (err) {
    showToast("Gagal menyimpan: " + err.message, true);
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
    const mulai = document.getElementById("rangeMulai").value;
    const selesai = document.getElementById("rangeSelesai").value;
    if (selesai < mulai) {
      showToast("Tanggal selesai tidak boleh sebelum tanggal mulai.", true);
      return;
    }
    await sendAction("addAbsensiRange", {
      Nama: document.getElementById("rangeNama").value,
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
  sel.innerHTML = "";
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const label = `${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
    sel.innerHTML += `<option value="${value}">${label}</option>`;
  }
  sel.addEventListener("change", renderStatAbsen);
  document.getElementById("toggleStatAbsenBtn").addEventListener("click", () => {
    state.statAbsenExpanded = !state.statAbsenExpanded;
    renderStatAbsen();
  });
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
  // Untuk bulan yang sedang berjalan, hitung hari kerja hanya sampai HARI INI —
  // supaya hari-hari yang belum terjadi tidak dianggap "tidak hadir".
  const workingDays = isBulanBerjalan
    ? countWorkingDaysInMonth(year, month, now.getDate())
    : countWorkingDaysInMonth(year, month);

  const prefix = `${year}-${pad2(month + 1)}`;
  const liburSet = getLiburDatesSet();

  const results = state.data.pegawai.map(p => {
    const tidakHadir = state.data.absensi.filter(a =>
      a.Nama === p.Nama && a.Tanggal && a.Tanggal.startsWith(prefix) && !liburSet.has(a.Tanggal)
    ).length;
    const hadir = Math.max(workingDays - tidakHadir, 0);
    const pct = workingDays > 0 ? Math.round((hadir / workingDays) * 100) : 0;
    return { nama: p.Nama, pct };
  }).sort((a, b) => a.pct - b.pct);

  renderStatList("statAbsenList", results, state.statAbsenExpanded, "absen");
  document.getElementById("toggleStatAbsenBtn").textContent =
    state.statAbsenExpanded ? "Tampilkan Lebih Sedikit" : "Lihat Semua Pegawai";
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

  document.getElementById("statKegiatanDari").addEventListener("change", renderStatKegiatan);
  document.getElementById("statKegiatanSampai").addEventListener("change", renderStatKegiatan);
  document.getElementById("toggleStatKegiatanBtn").addEventListener("click", () => {
    state.statKegiatanExpanded = !state.statKegiatanExpanded;
    renderStatKegiatan();
  });
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

function renderStatKegiatan() {
  const dari = document.getElementById("statKegiatanDari").value;
  const sampai = document.getElementById("statKegiatanSampai").value;
  if (!dari || !sampai || dari > sampai) {
    document.getElementById("statKegiatanList").innerHTML =
      `<p class="empty-note">Pilih rentang tanggal yang valid (tanggal "Dari" tidak boleh setelah "Sampai").</p>`;
    return;
  }

  const totalWorkingDays = countWorkingDaysInRange(dari, sampai);

  const results = state.data.pegawai.map(p => {
    const dates = new Set(
      state.data.kegiatanLuar
        .filter(k => k.Nama === p.Nama && k.Tanggal >= dari && k.Tanggal <= sampai)
        .map(k => k.Tanggal)
    );
    const pct = totalWorkingDays > 0 ? Math.round((dates.size / totalWorkingDays) * 100) : 0;
    return { nama: p.Nama, pct };
  }).sort((a, b) => b.pct - a.pct);

  renderStatList("statKegiatanList", results, state.statKegiatanExpanded, "kegiatan");
  document.getElementById("toggleStatKegiatanBtn").textContent =
    state.statKegiatanExpanded ? "Tampilkan Lebih Sedikit" : "Lihat Semua Pegawai";
}

function renderStatList(containerId, results, expanded, type) {
  const el = document.getElementById(containerId);
  const shown = expanded ? results : results.slice(0, 10);
  el.innerHTML = shown.map(r => `
    <div class="stat-row clickable" data-nama="${r.nama}">
      <div class="stat-name">${r.nama}</div>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${r.pct}%"></div></div>
      <div class="stat-pct">${r.pct}%</div>
    </div>
  `).join("");

  el.querySelectorAll(".stat-row").forEach(row => {
    row.addEventListener("click", () => openStatDetail(row.dataset.nama, type));
  });
}

// ============================================================
// DETAIL PER PEGAWAI (saat nama diklik di daftar statistik)
// ============================================================
function openStatDetail(nama, type) {
  document.getElementById("statDetailTitle").textContent = nama;
  const contentEl = document.getElementById("statDetailContent");
  const periodeEl = document.getElementById("statDetailPeriode");

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
  } else {
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
