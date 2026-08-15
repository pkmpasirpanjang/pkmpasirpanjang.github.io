// ============================================================
// FORMS & ADMIN — modal umum, form Absen/Kegiatan/Rentang Tanggal,
// kirim perubahan ke Apps Script (sendAction), mode admin
// ============================================================

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

    // Sheet Absensi & KegiatanLuar di server otomatis diurutkan ulang
    // berdasarkan tanggal setiap kali ada data baru disimpan (supaya
    // pembacaan data tetap cepat walau data terus menumpuk bertahun-tahun -
    // lihat sortSheetByDate() di Code.gs). Akibatnya nomor baris (_row) bisa
    // berpindah - bukan cuma untuk data yang baru diubah, tapi berpotensi
    // baris LAIN juga ikut bergeser posisi. Karena itu, di sini kita AMBIL
    // ULANG data segar dari server (bukan tempel manual ke data lama),
    // supaya _row yang dipakai untuk edit/hapus berikutnya selalu akurat.
    await refreshDataSetelahSimpan();
    showToast("Data berhasil disimpan.");
  } catch (err) {
    showToast("Gagal menyimpan: " + err.message, true);
  } finally {
    sedangMenyimpan = false;
    setSimpanButtonsDisabled(false);
  }
}

// Memuat ulang data bulan yang sedang relevan (bulan kalender yang sedang
// dilihat, ditambah bulan tab statistik yang sedang aktif kalau beda) dari
// server, lalu render ulang semua bagian yang mungkin terpengaruh. Dipanggil
// setiap kali selesai simpan - lebih aman daripada menempel manual ke data
// lama karena nomor baris bisa berpindah akibat pengurutan otomatis di server.
async function refreshDataSetelahSimpan() {
  state.loadedMonths.clear();
  const activeTab = document.querySelector(".tab-btn[data-tab].active")?.dataset.tab || "kalender";
  await ensureMonthsLoaded([currentMonthKey()]);
  if (activeTab !== "kalender") await loadDataForTab(activeTab);

  renderSectionSafely("Kalender", renderCalendar);
  if (state.selectedDate) renderSectionSafely("Detail tanggal", () => openDateModal(state.selectedDate));
  renderSectionSafely("Statistik Kehadiran", renderStatAbsen);
  renderSectionSafely("Statistik Apel", renderStatApel);
  renderSectionSafely("Statistik Kegiatan Luar", renderStatKegiatan);
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

